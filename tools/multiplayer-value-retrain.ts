import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { NeuralValueNetwork, type NeuralExample } from '../src/bots/neural/multiplayer/valueNetwork';
import { deriveSeed, seededRandom } from './arena-core';
const previous = 'work/neural-multiplayer-20260912/nightly-v2';
const sourceLeague = 'work/neural-multiplayer-20260912/value-league-v1';
const output = 'work/neural-multiplayer-20260912/value-retrain-v1';
const read = <T = any>(file: string): T => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const save = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value));
interface LeagueGame { players: 3 | 4 | 5; index: number; seed: number; values: NeuralExample[]; record: { status: string } }
async function main(): Promise<void> {
  const sourcePlan = read(join(sourceLeague, 'plan.json'));
  const config = { ...sourcePlan.config, deadline: '2026-09-12T16:20:00Z' };
  const sources: Record<string, string> = { ...sourcePlan.sources };
  for (const [file, expected] of Object.entries(sources)) if (hash(file) !== expected) throw new Error('Frozen source changed: ' + file);
  sources['tools/multiplayer-value-retrain.ts'] = hash('tools/multiplayer-value-retrain.ts');
  const sourceFiles: string[] = sourcePlan.jobs.map((j: {players: number; index: number}) => join(sourceLeague, 'games', j.players + 'p-' + j.index + '.json'));
  for (const n of [3,4,5]) for (let i=0;i<36;i++) sourceFiles.push(join(previous, 'labels', n + 'p-' + i + '.json'));
  const dataHashes = Object.fromEntries(sourceFiles.map(file => [file, hash(file)]));
  const games = sourcePlan.jobs.map((j: {players: number; index: number}) => read<LeagueGame>(join(sourceLeague, 'games', j.players + 'p-' + j.index + '.json'))) as LeagueGame[];
  if (games.length !== 180 || games.some(g => g.record.status !== 'completed')) throw new Error('All 180 league games are required');
  const oldSplit = read<{ trainingGameSeeds: number[]; validationGameSeeds: number[] }>(join(previous, 'models/split.json'));
  mkdirSync(output, {recursive:true});
  const plan = {version:1, config, sources, dataHashes, sourceLeaguePlanHash: hash(join(sourceLeague,'plan.json')),
    purpose:'Training-only continuation on all 180 completed league games; original generation deadline expired before epoch one. No extra games and no arena changes.',
    selection:'Exactly the previously planned residual network, learning rates, validation split and untouched 36-game holdout; no hyperparameter changes.'};
  const planFile = join(output, 'plan.json');
  if (existsSync(planFile)) { if (JSON.stringify(read(planFile)) !== JSON.stringify(plan)) throw new Error('Changed retraining plan'); } else save(planFile,plan);
  const check = () => { for (const [file,expected] of Object.entries(sources)) if(hash(file)!==expected) throw new Error('Source changed during retraining: '+file); };
  const status = (stage: string, extra: Record<string,unknown>={}) => { check(); const value={stage,updatedAt:new Date().toISOString(),deadline:config.deadline,...extra};save(join(output,'status.json'),value);console.log(JSON.stringify(value)); };
  const expired = () => Date.now() >= Date.parse(config.deadline);
  status('training-starting',{generatedGames:games.length,newGames:0});
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
try { await main(); } catch(error) { if(existsSync(output))save(join(output,"failure.json"),{date:new Date().toISOString(),message:error instanceof Error?error.stack:String(error)}); throw error; }
