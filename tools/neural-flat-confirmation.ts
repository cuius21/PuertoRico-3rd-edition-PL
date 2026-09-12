import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { getReleasedNeuralModel } from '../src/bots/neural/releaseModel';
import { deriveSeed, summarizeArena, type ArenaOptions, type GameRecord } from './arena-core';
import { pairedComparison } from './neural-lab';
import { runWorkerPool } from './worker-pool';

type Variant = 'control' | 'flatNeural';
interface Job { players: 3; index: number; variant: Variant }
interface Row {
  job: Job;
  record: GameRecord;
  stats: { iterations: number; searches: number; neuralCalls: number; terminal: number; maxDepth: number; rootGap: number[] };
  snapshots: unknown[];
}
interface Preregistration {
  output: string;
  config: { seed: number; rotations: number; players: 3; variants: Variant[]; gamesPerArm: number;
    totalGames: number; budgetMs: number; maxIterations: number; workers: number; deadline: string };
  sourceHashes: Record<string, string>;
}
const preregistrationFile = 'reports/neural-multiplayer-20260912/flat-followup-plan.json';
const previous = 'work/neural-multiplayer-20260912/nightly-v2';
const read = <T = any>(file: string): T => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const digest = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const hash = (file: string) => digest(readFileSync(file));
const save = (file: string, data: unknown) => writeFileSync(file, JSON.stringify(data));

async function main(): Promise<void> {
  const prepareOnly = process.argv.length === 3 && process.argv[2] === '--prepare';
  if (process.argv.length > 2 && !prepareOnly) throw new Error('Only --prepare is supported; use the preregistered configuration');
  const preregistration = read<Preregistration>(preregistrationFile);
  const c = preregistration.config;
  if (c.players !== 3 || c.rotations !== 10 || c.gamesPerArm !== 30 || c.totalGames !== 60 ||
      c.budgetMs !== 650 || c.maxIterations !== 1500 || c.workers !== 2 ||
      JSON.stringify(c.variants) !== JSON.stringify(['control', 'flatNeural'])) throw new Error('Unexpected preregistered configuration');
  const config = { seed: c.seed, rotations: c.rotations, iterations: 0, budgetMs: c.budgetMs, workers: c.workers };
  const options: ArenaOptions = { games: c.gamesPerArm, players: 3, seed: deriveSeed(c.seed, 3),
    budgetMs: c.budgetMs, maxMoves: 5000, candidate: 'hardcore', opponents: 'hardcore',
    expansions: { festival: false, corsair: false, newBuildings: false, nobleBuildings: false } };
  const priorSources = read<{ sources: Record<string, string> }>(join(previous, 'plan.json')).sources;
  const sources = { ...priorSources, ...preregistration.sourceHashes };
  for (const [file, expected] of Object.entries(priorSources)) {
    if (hash(file) !== expected) throw new Error('Previous study source changed: ' + file);
  }
  for (const [file, expected] of Object.entries(preregistration.sourceHashes)) {
    if (hash(file) !== expected) throw new Error('Preregistered source changed: ' + file);
  }
  for (const file of ['tools/neural-flat-confirmation.ts', 'tools/register-typescript.mjs']) sources[file] = hash(file);
  const model = getReleasedNeuralModel().toJSON();
  const metadata = model.metadata ?? {};
  const split = read<{ trainingGameSeeds: number[]; validationGameSeeds: number[] }>(join(previous, 'models/split.json'));
  const occupied = new Set<number>([
    ...((metadata.trainingGameSeeds as number[] | undefined) ?? []),
    ...((metadata.validationGameSeeds as number[] | undefined) ?? []),
    ...split.trainingGameSeeds, ...split.validationGameSeeds,
    ...read<{ environments: number[] }>('reports/neural-multiplayer-20260912/screening/plan.json').environments,
  ]);
  for (const stage of ['pilot', 'confirmation']) {
    const setup = read<{ setup: { seed: number; rotations: number } }>(join(previous, stage, 'plan.json')).setup;
    for (const n of [3, 4, 5]) for (let rotation = 0; rotation < setup.rotations; rotation++) {
      occupied.add(deriveSeed(deriveSeed(setup.seed, n), rotation));
    }
  }
  const environments = Array.from({ length: c.rotations }, (_, i) => deriveSeed(options.seed, i));
  if (new Set(environments).size !== c.rotations || environments.some(seed => occupied.has(seed))) {
    throw new Error('Environment seed overlap');
  }
  const jobs: Job[] = [];
  for (let index = 0; index < c.gamesPerArm; index++) for (const variant of c.variants) jobs.push({ players: 3, index, variant });
  const plan = { version: 1, preregistrationHash: hash(preregistrationFile), config, deadline: c.deadline,
    sources, modelHash: digest(JSON.stringify(model)), environments, jobs,
    comparison: 'Frozen whole flatNeural configuration versus Hardcore; ten independent groups with complete seat rotations.',
    budget: '650 ms per search decision for all bots; at most 1500 simulations; two workers; no concurrent CPU-heavy experiments.',
    stopping: 'Exactly 60 planned games; deadline only stops dispatch. No extension to chase significance. No automatic deployment.' };
  mkdirSync(preregistration.output, { recursive: true });
  if (prepareOnly) {
    save(join(preregistration.output, 'preflight.json'), { date: new Date().toISOString(), plan,
      sourceChecksPassed: true, seedChecksPassed: true, started: false });
    console.log(JSON.stringify({ prepared: true, games: jobs.length, sources: Object.keys(sources).length, environments }));
    return;
  }
  if (read<{ stage: string }>(join(previous, 'status.json')).stage !== 'completed' ||
      !read<{ complete: boolean }>(join(previous, 'confirmation/result.json')).complete) {
    throw new Error('Previous timed tournament must complete before this study can start');
  }
  const planFile = join(preregistration.output, 'plan.json');
  if (existsSync(planFile)) {
    if (JSON.stringify(read(planFile)) !== JSON.stringify(plan)) throw new Error('Cannot resume with a changed plan or sources');
  } else save(planFile, plan);
  const checkSources = () => {
    for (const [file, expected] of Object.entries(sources)) if (hash(file) !== expected) throw new Error('Source changed during study: ' + file);
  };
  const filename = (job: Job) => join(preregistration.output, job.players + 'p-' + job.variant + '-' + job.index + '.json');
  const validate = (job: Job, row: Row) => {
    const r = row.record;
    if (JSON.stringify(row.job) !== JSON.stringify(job) || r.status !== 'completed' ||
        r.gameIndex !== job.index || r.candidateSeat !== job.index % 3 ||
        r.environmentSeed !== environments[Math.floor(job.index / 3)] || r.scores.length !== 3 ||
        r.candidateWinCredit === null || r.candidateScoreMargin === null ||
        (job.variant === 'flatNeural' ? row.stats.neuralCalls <= 0 : row.stats.neuralCalls !== 0)) {
      throw new Error('Invalid completed game: ' + filename(job));
    }
  };
  const names = new Set(jobs.map(j => j.players + 'p-' + j.variant + '-' + j.index + '.json'));
  for (const file of readdirSync(preregistration.output)) {
    if (/^[345]p-.*\.json$/.test(file) && !names.has(file)) throw new Error('Unexpected game file: ' + file);
  }
  const pending: Job[] = [];
  let finished = 0;
  for (const job of jobs) {
    if (existsSync(filename(job))) { validate(job, read<Row>(filename(job))); finished++; } else pending.push(job);
  }
  const status = (stage: string) => {
    checkSources();
    const value = { stage, updatedAt: new Date().toISOString(), finished, total: jobs.length, deadline: c.deadline };
    save(join(preregistration.output, 'status.json'), value);
    console.log(JSON.stringify(value));
  };
  status('running');
  for (let start = 0; start < pending.length; start += c.workers * 2) {
    if (Date.now() >= Date.parse(c.deadline)) { status('paused-deadline'); return; }
    await runWorkerPool<Job, Row>(new URL('./multiplayer-search-worker.mjs', import.meta.url), config,
      pending.slice(start, start + c.workers * 2), c.workers, (job, row) => {
        validate(job, row); save(filename(job), row); finished++; status('running');
      });
  }
  const groups = Object.fromEntries(c.variants.map(variant => [variant,
    jobs.filter(job => job.variant === variant).map(job => read<Row>(filename(job)))])) as Record<Variant, Row[]>;
  checkSources();
  save(join(preregistration.output, 'result.json'), { complete: true, config, sourcesVerified: true,
    summaries: Object.fromEntries(c.variants.map(v => [v, summarizeArena(options, groups[v].map(r => r.record)).overall])),
    comparison: pairedComparison(groups.flatNeural.map(r => r.record), groups.control.map(r => r.record), options.seed),
    inference: Object.fromEntries(c.variants.map(v => [v, {
      neuralCalls: groups[v].reduce((sum, row) => sum + row.stats.neuralCalls, 0),
      iterations: groups[v].reduce((sum, row) => sum + row.stats.iterations, 0),
      searches: groups[v].reduce((sum, row) => sum + row.stats.searches, 0),
    }])), conclusion: 'Finite independent follow-up. Ten seed groups; assess uncertainty. No model promoted.' });
  status('completed');
}
try { await main(); } catch (error) {
  const registration = read<Preregistration>(preregistrationFile);
  if (existsSync(registration.output)) save(join(registration.output, 'failure.json'), {
    date: new Date().toISOString(), message: error instanceof Error ? error.stack : String(error),
  });
  throw error;
}
