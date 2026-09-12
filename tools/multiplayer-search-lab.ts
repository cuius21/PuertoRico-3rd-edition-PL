import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HardcoreBot } from '../src/bots/HardcoreBot';
import { ChampionBot } from '../src/bots/ChampionBot';
import { NeuralBot } from '../src/bots/NeuralBot';
import { getReleasedNeuralModel } from '../src/bots/neural/releaseModel';
import { supportsNeuralState } from '../src/bots/neural/features';
import { heuristicPolicyProbabilities } from '../src/bots/neural/policyFeatures';
import { withPolicyReadCache } from '../src/bots/neural/policyReadCache';
import { serializeGameState } from '../src/game/GameSerializer';
import { RootRolloutBot } from './experiments/RootRolloutBot';
import { runGame, seededRandom, deriveSeed, summarizeArena, type ArenaOptions, type GameRecord } from './arena-core';
import { pairedComparison } from './neural-lab';
import { runWorkerPool } from './worker-pool';

type Variant = 'control' | 'releasedNeural' | 'calmTree' | 'flat' | 'flatNeural';
interface Job { players: 3 | 4 | 5; index: number; variant: Variant }
interface Config { seed: number; rotations: number; iterations: number; budgetMs: number; workers: number }
interface Row { job: Job; record: GameRecord; stats: { iterations: number; searches: number; neuralCalls: number; terminal: number; maxDepth: number; rootGap: number[] }; snapshots: unknown[] }
const phases = new Set(['roleSelection', 'builder', 'trader', 'settler']);
const variants = (n: number): Variant[] => n === 3 ? ['control', 'releasedNeural', 'calmTree', 'flat', 'flatNeural'] : ['control', 'releasedNeural', 'calmTree', 'flat'];
function options(config: Config, players: 3 | 4 | 5): ArenaOptions {
  return { games: config.rotations * players, players, seed: deriveSeed(config.seed, players),
    budgetMs: config.budgetMs, ...(config.iterations ? { iterations: config.iterations } : {}),
    maxMoves: 5000, candidate: 'hardcore', opponents: 'hardcore', expansions: {festival:false,corsair:false,newBuildings:false,nobleBuildings:false} };
}
export function runMultiplayerWorker(): void {
  const config = workerData as Config;
  const model = getReleasedNeuralModel();
  const originalPredict = model.predict.bind(model);
  let predictions = 0;
  model.predict = input => { predictions++; return originalPredict(input); };
  parentPort!.on('message', (job: Job) => {
    try {
      const opts = options(config, job.players);
      const stats = { iterations: 0, searches: 0, neuralCalls: 0, terminal: 0, maxDepth: 0, rootGap: [] as number[] };
      const snapshots: unknown[] = [];
      const sampleRandom = seededRandom(deriveSeed(opts.seed, 2000000 + job.index));
      let eligible = 0;
      const record = runGame(opts, job.index, (_policy, random, _seat, candidate) => {
        const search = { random, timeBudgetMs: config.iterations ? Infinity : config.budgetMs, maxIterations: config.iterations || 1500 };
        const bot = !candidate || job.variant === 'control' ? new HardcoreBot(search) :
          job.variant === 'releasedNeural' ? new NeuralBot(model, { ...search, cachePolicy: true }) :
          job.variant === 'calmTree' ? new ChampionBot({ ...search, rolloutExploration: 0.08, evaluatorWeight: 0 }) :
          new RootRolloutBot({ ...search, exploration: 0.08, ...(job.variant === 'flatNeural' ? {
            policy: (state, pid, actions) => {
              if (!supportsNeuralState(state)) throw new Error('Unsupported flat neural state');
              return phases.has(state.getCurrentPhase().type)
                ? withPolicyReadCache(state, () => model.policyForLegalActions(state, pid, actions))
                : heuristicPolicyProbabilities(state, pid, actions);
            },
          } : {}) });
        return { name: candidate ? job.variant : 'Hardcore', chooseAction(state, pid) {
          const before = predictions;
          const action = bot.chooseAction(state, pid);
          const s = bot.lastSearchStats;
          if (s.evaluatorErrors) throw new Error('Search evaluator error');
          if (candidate) {
            stats.neuralCalls += predictions - before;
            stats.iterations += s.iterations;
            stats.terminal += s.terminalRollouts;
            stats.maxDepth = Math.max(stats.maxDepth, s.maxTreeDepth);
            if (s.iterations) {
              stats.searches++;
              const values = [...new Map(s.rootActions.map(r => [r.key, r])).values()].sort((a, b) => b.visits - a.visits);
              if (values.length > 1) stats.rootGap.push((values[0]!.visits - values[1]!.visits) / s.iterations);
            }
          }
          return action;
        } };
      }, { onDecision({ state, move, playerIndex }) {
        if (job.variant !== 'control' || !phases.has(state.getCurrentPhase().type)) return;
        const slot = eligible < 12 ? eligible : Math.floor(sampleRandom() * (eligible + 1));
        eligible++;
        if (slot < 12) snapshots[slot] = { move, playerIndex, snapshot: serializeGameState(state) };
      } });
      if (record.status !== 'completed') throw new Error(JSON.stringify(record));
      if (job.players > 3 && stats.neuralCalls !== 0) throw new Error('Unexpected legacy neural inference');
      if (job.players === 3 && ['releasedNeural', 'flatNeural'].includes(job.variant) && !stats.neuralCalls) throw new Error('No neural inference');
      parentPort!.postMessage({ job, result: { job, record, stats, snapshots } satisfies Row });
    } catch (error) { parentPort!.postMessage({ job, error: error instanceof Error ? error.stack : String(error) }); }
  });
  parentPort!.postMessage({ ready: true });
}

async function main() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i]?.replace(/^--/, '');
    const value = process.argv[i + 1];
    if (!key || !['seed', 'rotations', 'iterations', 'budget-ms', 'workers', 'output'].includes(key) || value === undefined || args.has(key)) throw new Error('Invalid arguments');
    args.set(key, value);
  }
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(args.get(key) ?? fallback);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error('Invalid '+key);
    return n;
  };
  const config: Config = { seed: integer('seed', 912202601, 0, 0xffffffff), rotations: integer('rotations', 4, 1, 500),
    iterations: integer('iterations', 24, 0, 20000), budgetMs: integer('budget-ms', 650, 1, 10000), workers: integer('workers', 2, 1, 4) };
  const output = resolve(args.get('output') ?? 'reports/neural-multiplayer-20260912/screening');
  if (existsSync(output+'/plan.json')) throw new Error('Refusing to overwrite an existing experiment');
  mkdirSync(output, { recursive: true });
  const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  const frozen = JSON.parse(readFileSync('work/neural-multiplayer-20260912/frozen-source-hashes.json', 'utf8')) as Record<string, string>;
  for (const [path, expected] of Object.entries(frozen)) if (hash(path) !== expected) throw new Error('Frozen source changed: '+path);
  const sources = { ...frozen, ...Object.fromEntries(['tools/multiplayer-search-lab.ts','tools/experiments/RootRolloutBot.ts','tools/arena-core.ts','tools/neural-lab.ts','tools/worker-pool.ts'].map(p=>[p,hash(p)])) };
  const jobs: Job[] = [];
  for (let index = 0; index < config.rotations * 5; index++) for (const players of [3,4,5] as const) {
    if (index < config.rotations * players) for (const variant of variants(players)) jobs.push({ players, index, variant });
  }
  const modelMetadata = getReleasedNeuralModel().toJSON().metadata;
  const seenTraining = new Set([...(modelMetadata.trainingGameSeeds as number[] ?? []), ...(modelMetadata.validationGameSeeds as number[] ?? [])]);
  const environments: number[] = [];
  for (const n of [3,4,5] as const) for (let i=0;i<config.rotations;i++) {
    const seed = deriveSeed(options(config,n).seed,i);
    if (seenTraining.has(seed) || environments.includes(seed)) throw new Error('Environment seed overlap');
    environments.push(seed);
  }
  const save = (name: string, data: unknown) => writeFileSync(output+'/'+name+'.json',JSON.stringify(data));
  save('plan',{date:new Date().toISOString(),classification:'exploratory screening; no strength promotion',config,sources,environments,jobs,
    selection:'No tuning during this run; root-only search uses the same two-round horizon and unchanged value heuristic.',
    budget:'iterations>0: equal completed-simulation cap, not equal time; root-only counts partial blocks separately',
    expectedLegacyFallback:'4/5-player releasedNeural must match control traces at fixed iterations.'});
  const rows: Row[] = [];
  const started = Date.now();
  await runWorkerPool<Job, Row>(new URL('./multiplayer-search-worker.mjs',import.meta.url),config,jobs,config.workers,(job,row)=>{
    save(job.players+'p-'+job.variant+'-'+job.index,row);
    rows.push({...row,snapshots:[]});
    save('progress',{finished:rows.length,total:jobs.length,wallSeconds:(Date.now()-started)/1000});
    if (rows.length % 8 === 0 || rows.length === jobs.length) console.log(JSON.stringify({finished:rows.length,total:jobs.length,seconds:(Date.now()-started)/1000}));
  });
  const results: unknown[] = [];
  for (const n of [3,4,5] as const) {
    const groups=Object.fromEntries(variants(n).map(v=>[v,rows.filter(r=>r.job.players===n&&r.job.variant===v).sort((a,b)=>a.job.index-b.job.index)]));
    if(config.iterations && n>3 && groups.releasedNeural!.some((r,i)=>r.record.traceHash!==groups.control![i]!.record.traceHash)) throw new Error('Legacy fallback parity failed');
    results.push({players:n,summaries:Object.fromEntries(Object.entries(groups).map(([v,r])=>[v,summarizeArena(options(config,n),r.map(x=>x.record)).overall])),
      comparisons:Object.fromEntries(variants(n).filter(v=>v!=='control').map(v=>[v,pairedComparison(groups[v]!.map(x=>x.record),groups.control!.map(x=>x.record),options(config,n).seed)])),
      stats:Object.fromEntries(Object.entries(groups).map(([v,r])=>[v,{iterations:r.reduce((s,x)=>s+x.stats.iterations,0),searches:r.reduce((s,x)=>s+x.stats.searches,0),neuralCalls:r.reduce((s,x)=>s+x.stats.neuralCalls,0),terminalRollouts:r.reduce((s,x)=>s+x.stats.terminal,0),maxDepth:Math.max(...r.map(x=>x.stats.maxDepth))}]))});
  }
  for(const [path,expected] of Object.entries(sources)) if(hash(path)!==expected) throw new Error('Source changed during study: '+path);
  save('result',{config,results,wallSeconds:(Date.now()-started)/1000,sourcesVerified:true,conclusion:'Screening only. No model has been promoted.'});
  console.log(JSON.stringify({output,wallSeconds:(Date.now()-started)/1000}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main();
