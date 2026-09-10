import { Worker, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { generateTrainingGames, type GenerateOptions, type NeuralDataset } from './train-neural';
import { parseArenaArgs } from './arena-cli';
import { runGame, summarizeArena, seededRandom, deriveSeed, type ArenaOptions, type GameRecord } from './arena-core';
import { HardcoreBot } from '../src/bots/HardcoreBot';
import { NeuralValueNetwork } from '../src/bots/neural/network';
import { NEURAL_FEATURE_SCHEMA, NEURAL_FEATURE_NAMES } from '../src/bots/neural/features';

interface WorkerConfig {
  mode: 'generate' | 'evaluate';
  generation?: GenerateOptions;
  arena?: ArenaOptions;
  modelPath?: string;
  weight?: number;
}
interface Job { index: number; arm?: 'candidate' | 'control' }

function save(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + '.tmp', JSON.stringify(value));
  renameSync(path + '.tmp', path);
}

export function runLabWorker(): void {
  const config = workerData as WorkerConfig;
  const model = config.modelPath ? NeuralValueNetwork.fromJSON(JSON.parse(readFileSync(config.modelPath, 'utf8'))) : undefined;
  parentPort!.on('message', (job: Job) => {
    try {
      if (config.mode === 'generate') {
        const result = generateTrainingGames({ ...config.generation!, games: 1, gameOffset: job.index,
          ...(model ? { model } : {}) });
        if (result.discarded || result.games.length !== 1) throw new Error('Training game failed: ' + job.index);
        parentPort!.postMessage({ job, result: result.games[0] });
      } else {
        const result = runGame(config.arena!, job.index, (_policy, random, _seat, candidate) => new HardcoreBot({
          timeBudgetMs: config.arena!.iterations === undefined ? config.arena!.budgetMs : Infinity,
          maxIterations: config.arena!.iterations ?? 1500, random,
          ...(candidate && job.arm === 'candidate' && model ? { evaluator: model, evaluatorWeight: config.weight! } : {}),
        }));
        parentPort!.postMessage({ job, result });
      }
    } catch (error) {
      parentPort!.postMessage({ job, error: error instanceof Error ? error.stack : String(error) });
    }
  });
  parentPort!.postMessage({ ready: true });
}

async function pool(config: WorkerConfig, jobs: Job[], workers: number, onResult: (job: Job, result: any) => void): Promise<void> {
  const running: Worker[] = [];
  let next = 0;
  let completed = 0;
  try {
    await new Promise<void>((accept, reject) => {
      for (let i = 0; i < Math.min(workers, jobs.length); i++) {
        const worker = new Worker(new URL('./neural-lab-worker.mjs', import.meta.url), { workerData: config });
        running.push(worker);
        worker.on('error', reject);
        worker.on('exit', code => { if (code !== 0 && completed < jobs.length) reject(new Error('Worker exit ' + code)); });
        worker.on('message', message => {
          try {
            if (message.error) throw new Error(message.error);
            if (!message.ready) { onResult(message.job, message.result); completed++; }
            if (completed === jobs.length) accept();
            else if (next < jobs.length) worker.postMessage(jobs[next++]!);
          } catch (error) { reject(error); }
        });
      }
    });
  } finally { await Promise.all(running.map(worker => worker.terminate())); }
}

export function pairedComparison(candidate: GameRecord[], control: GameRecord[], seed: number) {
  const controls = new Map(control.map(record => [record.gameIndex, record]));
  if (controls.size !== control.length || new Set(candidate.map(record => record.gameIndex)).size !== candidate.length ||
    candidate.length !== control.length) throw new Error('Unmatched or duplicate paired games');
  const groups = new Map<number, { wins: number; margins: number; count: number }>();
  for (const record of candidate) {
    const other = controls.get(record.gameIndex);
    if (!other || record.environmentSeed !== other.environmentSeed || record.candidateSeat !== other.candidateSeat) {
      throw new Error('Paired arena seeds or seats do not match');
    }
    if (record.status !== 'completed' || other.status !== 'completed') throw new Error('Paired arena contains unfinished games');
    const group = groups.get(record.environmentSeed) ?? { wins: 0, margins: 0, count: 0 };
    group.wins += record.candidateWinCredit! - other.candidateWinCredit!;
    group.margins += record.candidateScoreMargin! - other.candidateScoreMargin!;
    group.count++;
    groups.set(record.environmentSeed, group);
  }
  if (!groups.size) throw new Error('No paired games');
  const rows = [...groups.values()];
  const count = rows.reduce((sum, row) => sum + row.count, 0);
  const delta = (key: 'wins' | 'margins') => rows.reduce((sum, row) => sum + row[key], 0) / count;
  const random = seededRandom(deriveSeed(seed, 7301));
  const samples: number[] = [];
  for (let draw = 0; draw < 5000; draw++) {
    let wins = 0;
    let total = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[Math.floor(random() * rows.length)]!;
      wins += row.wins;
      total += row.count;
    }
    samples.push(wins / total);
  }
  samples.sort((a, b) => a - b);
  const varied = rows.some(row => row.wins / row.count !== rows[0]!.wins / rows[0]!.count);
  return { pairedGames: count, independentSeeds: rows.length, winRateDifference: delta('wins'),
    meanScoreMarginDifference: delta('margins'),
    winRateDifference95: rows.length > 1 && varied ? [samples[125]!, samples[4874]!] : null,
    uncertaintyMethod: 'paired-bootstrap-of-whole-environment-seed-groups-5000-resamples',
  };
}

export async function neuralLabMain(argv = process.argv.slice(2)): Promise<void> {
  const mode = argv[0];
  if (mode !== 'generate' && mode !== 'evaluate') throw new Error('Use generate or evaluate, followed by --option value pairs');
  const args = new Map<string, string>();
  for (let i = 1; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || args.has(key.slice(2))) throw new Error('Invalid or repeated option ' + key);
    args.set(key.slice(2), value);
  }
  const integer = (key: string, fallback: number, min: number, max = 0xffffffff) => {
    const value = Number(args.get(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid --' + key);
    return value;
  };
  const workers = integer('workers', Math.min(4, availableParallelism()), 1, 16);
  args.delete('workers');
  const started = Date.now();
  if (mode === 'generate') {
    const allowed = ['games', 'seed', 'iterations', 'samples-per-game', 'exploration', 'output', 'model'];
    for (const key of args.keys()) if (!allowed.includes(key)) throw new Error('Unknown --' + key);
    const games = integer('games', 480, 2);
    const seed = integer('seed', 26090901, 0);
    const iterations = integer('iterations', 16, 1);
    const samplesPerGame = integer('samples-per-game', 24, 1, 1000);
    const exploration = Number(args.get('exploration') ?? 0.015);
    if (!Number.isFinite(exploration) || exploration < 0 || exploration > 1) throw new Error('Invalid exploration');
    const output = resolve(args.get('output') ?? 'work/neural-lab/hardcore.dataset.json');
    const dataset: NeuralDataset = { format: 'puerto-rico-self-play', version: 1,
      featureSchema: NEURAL_FEATURE_SCHEMA, featureNames: [...NEURAL_FEATURE_NAMES], games: [] };
    const config: WorkerConfig = { mode, generation: { games: 1, seed, iterations, samplesPerGame,
      maxActions: 5000, exploration, league: 'hardcore' },
      ...(args.has('model') ? { modelPath: resolve(args.get('model')!) } : {}) };
    await pool(config, Array.from({ length: games }, (_, index) => ({ index })), workers, (_job, result) => {
      dataset.games.push(result);
      if (dataset.games.length % 24 === 0 || dataset.games.length === games) {
        save(output, { ...dataset, games: [...dataset.games].sort((a, b) => a.seed - b.seed) });
        console.log(JSON.stringify({ generated: dataset.games.length, total: games, seconds: (Date.now() - started) / 1000 }));
      }
    });
    save(output + '.generation.json', { config, workers, games: dataset.games.length, seconds: (Date.now() - started) / 1000 });
    return;
  }
  const { options, model, modelWeight, output } = parseArenaArgs([...args].flatMap(([key, value]) => ['--' + key, value]));
  if (!model || !output || options.candidate !== 'hardcore' || options.opponents !== 'hardcore' ||
    options.players !== 3 || Object.values(options.expansions).some(Boolean) || options.games % 3 !== 0) {
    throw new Error('Paired evaluation requires --model, --output, --opponents hardcore, base game and complete three-seat rotations');
  }
  const modelText = readFileSync(resolve(model), 'utf8');
  const metadata = NeuralValueNetwork.fromJSON(JSON.parse(modelText)).toJSON().metadata;
  const usedSeeds = new Set([...(metadata.trainingGameSeeds as number[] ?? []), ...(metadata.validationGameSeeds as number[] ?? [])]);
  for (let i = 0; i < options.games / 3; i++) if (usedSeeds.has(deriveSeed(options.seed, i))) throw new Error('Arena seed overlaps training data');
  const config: WorkerConfig = { mode, arena: options, modelPath: resolve(model), weight: modelWeight };
  const records: Record<'candidate' | 'control', GameRecord[]> = { candidate: [], control: [] };
  const jobs = Array.from({ length: options.games }, (_, index) =>
    [{ index, arm: 'candidate' as const }, { index, arm: 'control' as const }]).flat();
  await pool(config, jobs, workers, (job, result) => {
    if (result.status !== 'completed') throw new Error('Arena game failed: ' + JSON.stringify(result));
    records[job.arm!]!.push(result);
    const completed = records.candidate.length + records.control.length;
    if (completed % 12 === 0 || completed === jobs.length) {
      save(resolve(output) + '.progress.json', records);
      console.log(JSON.stringify({ evaluated: completed, total: jobs.length, seconds: (Date.now() - started) / 1000 }));
    }
  });
  for (const arm of ['candidate', 'control'] as const) records[arm].sort((a, b) => a.gameIndex - b.gameIndex);
  const candidate = summarizeArena(options, records.candidate);
  const control = summarizeArena(options, records.control);
  const paired = pairedComparison(records.candidate, records.control, options.seed);
  const report = { model: { path: resolve(model), sha256: createHash('sha256').update(modelText).digest('hex'), weight: modelWeight },
    workers, wallSeconds: (Date.now() - started) / 1000, candidate, control, paired,
    deployment: 'experimental-only-requires-independent-confirmation-and-production-budget-test' };
  save(resolve(output), report);
  console.log(JSON.stringify({ candidate: candidate.overall, control: control.overall, paired, output }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await neuralLabMain();
