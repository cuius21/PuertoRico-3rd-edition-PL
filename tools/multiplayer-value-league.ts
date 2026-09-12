import { parentPort, workerData } from 'node:worker_threads';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HardcoreBot } from '../src/bots/HardcoreBot';
import { evaluateHardcoreState } from '../src/bots/hardcoreEvaluation';
import { MultiplayerNeuralBot } from '../src/bots/neural/multiplayer/MultiplayerNeuralBot';
import { NeuralPolicyNetwork } from '../src/bots/neural/multiplayer/policyNetwork';
import { NeuralValueNetwork, type NeuralExample } from '../src/bots/neural/multiplayer/valueNetwork';
import { encodeNeuralState } from '../src/bots/neural/multiplayer/features';
import { getReleasedNeuralModel } from '../src/bots/neural/releaseModel';
import { deriveSeed, runGame, seededRandom, type ArenaOptions, type GameRecord } from './arena-core';
import { runWorkerPool } from './worker-pool';

const previous = 'work/neural-multiplayer-20260912/nightly-v2';
const flat = 'work/neural-multiplayer-20260912/flat-650-v1';
const output = 'work/neural-multiplayer-20260912/value-league-v1';
const config = { seed: 912202627, gamesPerCount: 60, iterations: 64, workers: 2, samplesPerGame: 24,
  epochs: 24, patience: 5, deadline: '2026-09-12T15:40:00Z' };
type Job = { players: 3 | 4 | 5; index: number };
type LeagueGame = Job & { seed: number; league: string; policies: string[]; record: GameRecord; values: NeuralExample[]; policyCalls: number };
const read = <T = any>(file: string): T => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const digest = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const hash = (file: string) => digest(readFileSync(file));
const save = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value));
const gameFile = (job: Job) => join(output, 'games', job.players + 'p-' + job.index + '.json');

export function runValueLeagueWorker(): void {
  const settings = workerData as typeof config;
  const models = Object.fromEntries(['visits', 'q'].map(name => [name,
    NeuralPolicyNetwork.fromJSON(read(join(previous, 'models', name + '.json')))]));
  parentPort!.on('message', (job: Job) => {
    try {
      const mode = job.index % 3;
      const league = ['hardcore', 'mixed', 'neural-self-play'][mode]!;
      const primary = job.players === 3 ? 'q' : 'visits';
      const policies = Array.from({ length: job.players }, (_, seat) => mode === 0 ? 'hardcore' :
        mode === 2 ? primary : ['hardcore', 'q', 'visits'][(seat + job.index) % 3]!);
      const opts: ArenaOptions = { games: settings.gamesPerCount, players: job.players,
        seed: deriveSeed(settings.seed, job.players), budgetMs: 650, iterations: settings.iterations,
        maxMoves: 5000, candidate: 'hardcore', opponents: 'hardcore',
        expansions: { festival: false, corsair: false, newBuildings: false, nobleBuildings: false } };
      const sampleRandom = seededRandom(deriveSeed(opts.seed, 6000000 + job.index));
      const values: NeuralExample[] = [];
      let eligible = 0, policyCalls = 0;
      const record = runGame(opts, job.index * job.players, (_name, random, seat) => {
        const search = { random, timeBudgetMs: Infinity, maxIterations: settings.iterations };
        const bot = policies[seat] === 'hardcore' ? new HardcoreBot(search) : new MultiplayerNeuralBot(models[policies[seat]!]!, search);
        return { name: policies[seat]!, chooseAction(state, pid) {
          const before = bot instanceof MultiplayerNeuralBot ? bot.policyCalls : 0;
          const action = bot.chooseAction(state, pid);
          if (bot.lastSearchStats.evaluatorErrors) throw new Error('League search error');
          if (bot instanceof MultiplayerNeuralBot) policyCalls += bot.policyCalls - before;
          return action;
        } };
      }, { onDecision({ state }) {
        if (state.getCurrentPhase().type !== 'roleSelection') return;
        const slot = eligible < settings.samplesPerGame ? eligible : Math.floor(sampleRandom() * (eligible + 1));
        eligible++;
        if (slot < settings.samplesPerGame) values[slot] = { inputs: encodeNeuralState(state),
          baseline: evaluateHardcoreState(state), target: [] };
      } });
      if (record.status !== 'completed' || values.length === 0 || (mode === 0 ? policyCalls !== 0 : policyCalls === 0)) {
        throw new Error('Invalid league trajectory');
      }
      for (const value of values) value.target = [...record.winCredits];
      const result: LeagueGame = { ...job, seed: record.environmentSeed, league, policies, record, values, policyCalls };
      parentPort!.postMessage({ job, result });
    } catch (error) { parentPort!.postMessage({ job, error: error instanceof Error ? error.stack : String(error) }); }
  });
  parentPort!.postMessage({ ready: true });
}

async function main(): Promise<void> {
  const prepare = process.argv.length === 3 && process.argv[2] === '--prepare';
  if (process.argv.length > 2 && !prepare) throw new Error('Only --prepare is supported');
  const sources = { ...read<{ sources: Record<string, string> }>(join(flat, 'plan.json')).sources };
  for (const [file, expected] of Object.entries(sources)) if (hash(file) !== expected) throw new Error('Frozen source changed: ' + file);
  for (const file of ['tools/multiplayer-value-league.ts', 'tools/multiplayer-value-league-worker.mjs']) sources[file] = hash(file);
  const modelHashes = Object.fromEntries(['visits', 'q'].map(name => [name, hash(join(previous, 'models', name + '.json'))]));
  const oldSplit = read<{ trainingGameSeeds: number[]; validationGameSeeds: number[] }>(join(previous, 'models/split.json'));
  const occupied = new Set<number>([...oldSplit.trainingGameSeeds, ...oldSplit.validationGameSeeds,
    ...read<{ environments: number[] }>(join(flat, 'plan.json')).environments,
    ...read<{ environments: number[] }>('reports/neural-multiplayer-20260912/screening/plan.json').environments]);
  const metadata = getReleasedNeuralModel().toJSON().metadata ?? {};
  for (const key of ['trainingGameSeeds', 'validationGameSeeds']) for (const seed of (metadata[key] as number[] | undefined) ?? []) occupied.add(seed);
  for (const stage of ['pilot', 'confirmation']) {
    const setup = read<{ setup: { seed: number; rotations: number } }>(join(previous, stage, 'plan.json')).setup;
    for (const n of [3, 4, 5]) for (let i = 0; i < setup.rotations; i++) occupied.add(deriveSeed(deriveSeed(setup.seed, n), i));
  }
  const jobs: Job[] = [];
  for (let index = 0; index < config.gamesPerCount; index++) for (const players of [3, 4, 5] as const) jobs.push({ players, index });
  const seedFor = (job: Job) => deriveSeed(deriveSeed(config.seed, job.players), job.index);
  const environments = jobs.map(seedFor);
  if (new Set(environments).size !== jobs.length || environments.some(s => occupied.has(s))) throw new Error('League seed overlap');
  const plan = { version: 1, config, sources, modelHashes, jobs, environments,
    purpose: 'Outcome-value training from a mixed league, after both timed tournaments. No gameplay strength claim from prediction loss.',
    league: 'index modulo 3: frozen Hardcore, mixed Hardcore/Q/visits, frozen Q self-play for 3 or visits self-play for 4/5.',
    split: 'New games with index modulo 5 equal to 4 are a fresh holdout, 12 per player count; the other 144 augment old training games. Original 21 validation games select epoch and learning rate. Fresh holdout is evaluated only after final model selection is written.',
    training: 'Residual 543x32x1, same initialization, two learning rates 0.0001 and 0.0003, L2 0.001, 24 epochs maximum, patience 5; zero-correction epoch 0 is eligible.',
    claim: 'Exploratory training with reused validation; fresh holdout prediction metrics are not a bot arena. No automatic promotion or deployment.' };
  mkdirSync(join(output, 'games'), { recursive: true });
  if (prepare) {
    save(join(output, 'preflight.json'), { date: new Date().toISOString(), plan, started: false });
    console.log(JSON.stringify({ prepared: true, games: jobs.length, trainingGames: 144, holdoutGames: 36, sourceFiles: Object.keys(sources).length }));
    return;
  }
  if (read(join(flat, 'status.json')).stage !== 'completed' || !read(join(flat, 'result.json')).complete) throw new Error('Timed follow-up must finish first');
  const planFile = join(output, 'plan.json');
  if (existsSync(planFile)) {
    if (JSON.stringify(read(planFile)) !== JSON.stringify(plan)) throw new Error('Cannot resume a changed league plan');
  } else save(planFile, plan);
  const check = () => {
    for (const [file, expected] of Object.entries(sources)) if (hash(file) !== expected) throw new Error('Source changed during league: ' + file);
    for (const [name, expected] of Object.entries(modelHashes)) if (hash(join(previous, 'models', name + '.json')) !== expected) throw new Error('Policy changed during league');
  };
  const status = (stage: string, extra: Record<string, unknown> = {}) => {
    check(); const row = { stage, updatedAt: new Date().toISOString(), deadline: config.deadline, ...extra };
    save(join(output, 'status.json'), row); console.log(JSON.stringify(row));
  };
  const expired = () => Date.now() >= Date.parse(config.deadline);
  const pending = jobs.filter(j => !existsSync(gameFile(j)));
  let finished = jobs.length - pending.length;
  status('generating', { finished, total: jobs.length });
  for (let i = 0; i < pending.length; i += config.workers * 2) {
    if (expired()) { status('paused-deadline', { pendingStage: 'generating', finished, total: jobs.length }); return; }
    await runWorkerPool<Job, LeagueGame>(new URL('./multiplayer-value-league-worker.mjs', import.meta.url), config,
      pending.slice(i, i + config.workers * 2), config.workers, (job, result) => {
        if (result.seed !== seedFor(job) || result.players !== job.players || result.index !== job.index || result.record.status !== 'completed') throw new Error('Invalid league result');
        save(gameFile(job), result); finished++; status('generating', { finished, total: jobs.length });
      });
  }
  const games = jobs.map(j => read<LeagueGame>(gameFile(j)));
  for (const game of games) {
    if (game.record.status !== 'completed' || game.seed !== seedFor(game) || game.values.some(v =>
      v.inputs.length !== game.players || JSON.stringify(v.target) !== JSON.stringify(game.record.winCredits))) throw new Error('Corrupt league game');
  }
  const oldGames = [];
  for (const players of [3, 4, 5]) for (let index = 0; index < 36; index++) oldGames.push(read<{ seed: number; values: NeuralExample[] }>(join(previous, 'labels', players + 'p-' + index + '.json')));
  const training = [...oldGames.filter(g => oldSplit.trainingGameSeeds.includes(g.seed)), ...games.filter(g => g.index % 5 !== 4)];
  const validation = oldGames.filter(g => oldSplit.validationGameSeeds.includes(g.seed));
  const holdout = games.filter(g => g.index % 5 === 4);
  const trainValues = training.flatMap(g => g.values), validValues = validation.flatMap(g => g.values);
  save(join(output, 'split.json'), { trainingGameSeeds: training.map(g => g.seed), validationGameSeeds: validation.map(g => g.seed), holdoutGameSeeds: holdout.map(g => g.seed) });
  const trials = [0.0001, 0.0003];
  for (const learningRate of trials) {
    const reportFile = join(output, 'trial-' + learningRate + '.json');
    if (existsSync(reportFile)) continue;
    const model = new NeuralValueNetwork({ hiddenSize: 32, seed: deriveSeed(config.seed, 91), valueMode: 'residual' });
    const random = seededRandom(deriveSeed(config.seed, 92));
    const samples = [...trainValues];
    const initial = model.loss(validValues);
    let best = model.toJSON({}, true), bestLoss = initial, bestEpoch = 0;
    const history: { epoch: number; trainLoss: number; validationLoss: number }[] = [];
    for (let epoch = 1; epoch <= config.epochs; epoch++) {
      if (expired()) { status('paused-deadline', { pendingStage: 'training', learningRate, epoch }); return; }
      for (let i = samples.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [samples[i], samples[j]] = [samples[j]!, samples[i]!]; }
      for (let i = 0; i < samples.length; i += 32) model.trainBatch(samples.slice(i, i + 32), { learningRate, l2: 0.001 });
      const validationLoss = model.loss(validValues), trainLoss = model.loss(trainValues);
      history.push({ epoch, trainLoss, validationLoss });
      if (validationLoss < bestLoss - 0.0001) { bestLoss = validationLoss; bestEpoch = epoch; best = model.toJSON({}, true); }
      status('training', { learningRate, epoch, bestEpoch, trainLoss, validationLoss });
      if (epoch - bestEpoch >= config.patience) break;
    }
    const selected = NeuralValueNetwork.fromJSON(best);
    save(join(output, 'value-' + learningRate + '.json'), selected.toJSON({ scope: 'experimental league outcome value; no arena verification', learningRate, bestEpoch, trainingGames: training.length, validationGames: validation.length }));
    save(reportFile, { learningRate, initial, bestLoss, bestEpoch, history });
  }
  const reports = trials.map(rate => read<{ learningRate: number; bestLoss: number; bestEpoch: number }>(join(output, 'trial-' + rate + '.json')));
  reports.sort((a, b) => a.bestLoss - b.bestLoss || a.learningRate - b.learningRate);
  const selected = reports[0]!;
  const selectedFile = join(output, 'value-' + selected.learningRate + '.json');
  save(join(output, 'selection.json'), { selected, selectedModelHash: hash(selectedFile), decidedAt: new Date().toISOString(), criterion: 'Original validation loss only; fresh holdout not yet scored.' });
  const model = NeuralValueNetwork.fromJSON(read(selectedFile));
  const baseline = new NeuralValueNetwork({ hiddenSize: 32, seed: deriveSeed(config.seed, 91), valueMode: 'residual' });
  const perCount = [3, 4, 5].map(players => {
    const subset = holdout.filter(g => g.players === players), values = subset.flatMap(g => g.values);
    const perGame = subset.map(game => ({ seed: game.seed, baselineLoss: baseline.loss(game.values), learnedLoss: model.loss(game.values) }));
    return { players, games: subset.length, samples: values.length, baselineLoss: baseline.loss(values), learnedLoss: model.loss(values), perGame };
  });
  check();
  save(join(output, 'result.json'), { complete: true, trainingGames: training.length, validationGames: validation.length,
    holdoutGames: holdout.length, generatedGames: games.length, selected, trials: reports,
    selectedModelHash: hash(selectedFile), correctionIsZero: model.toJSON().parameters.slice(-model.hiddenSize).every(x => x === 0),
    perCount, sourcesVerified: true, conclusion: 'Fresh held-out winner-prediction loss only. No strength claim and no model deployment.' });
  status('completed', { generatedGames: games.length, selected });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await main(); } catch (error) {
    if (existsSync(output)) save(join(output, 'failure.json'), { date: new Date().toISOString(), message: error instanceof Error ? error.stack : String(error) });
    throw error;
  }
}
