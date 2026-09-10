import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NeuralPolicyNetwork } from '../src/bots/neural/policyNetwork';
import { parsePolicyDataset } from './train-policy';
import type { PolicyExample } from '../src/bots/neural/policyFeatures';

interface Evaluated { sample: PolicyExample; learned: number[] }
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const entropy = (values: readonly number[]) => -sum(values.map(value => value * Math.log(Math.max(1e-12, value))));
const crossEntropy = (target: readonly number[], prediction: readonly number[]) =>
  -sum(target.map((value, index) => value * Math.log(Math.max(1e-12, prediction[index]!))));
function argmax(values: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i;
  return best;
}
function maximumCount(values: readonly number[]): number {
  const maximum = Math.max(...values);
  return values.filter(value => Math.abs(value - maximum) < 1e-10).length;
}
function gapVisits(sample: PolicyExample): number {
  const sorted = [...sample.target].sort((a, b) => b - a);
  return Math.round((sorted[0]! - (sorted[1] ?? 0)) * sample.teacherIterations);
}
function quantiles(values: readonly number[]): Record<string, number> {
  if (!values.length) return {};
  const ordered = [...values].sort((a, b) => a - b);
  return Object.fromEntries([0, 0.25, 0.5, 0.75, 0.9, 1].map(q => [String(q), ordered[Math.floor(q * (ordered.length - 1))]!]));
}
function sharpen(target: readonly number[], temperature: number): number[] {
  const weights = target.map(value => Math.pow(value, 1 / temperature));
  const total = sum(weights);
  return weights.map(value => value / total);
}
function summarize(rows: readonly Evaluated[]) {
  if (!rows.length) return { samples: 0 };
  let ties = 0, uniform = 0, duplicates = 0, baseCorrect = 0, learnedCorrect = 0;
  let sameAction = 0, sameSemanticAction = 0, improvements = 0, regressions = 0, bothWrong = 0;
  let baselineCE = 0, learnedCE = 0, targetEntropy = 0, baselineEntropy = 0, learnedEntropy = 0;
  let baseShortfall = 0, learnedShortfall = 0, baseTop = 0, learnedTop = 0, teacherTop = 0;
  const counts: Record<string, number> = {}, margins: number[] = [], topVisits: number[] = [];
  for (const { sample, learned } of rows) {
    const target = sample.target, baseline = sample.baseline, base = argmax(baseline), model = argmax(learned);
    const maximum = Math.max(...target);
    const baseHit = target[base]! >= maximum - 1e-10, modelHit = target[model]! >= maximum - 1e-10;
    ties += Number(maximumCount(target) > 1);
    uniform += Number(maximum - Math.min(...target) < 1e-10);
    duplicates += Number(new Set(sample.actionIds).size < sample.actionIds.length);
    baseCorrect += Number(baseHit); learnedCorrect += Number(modelHit);
    sameAction += Number(base === model);
    sameSemanticAction += Number(sample.actionIds[base] === sample.actionIds[model]);
    improvements += Number(!baseHit && modelHit); regressions += Number(baseHit && !modelHit);
    bothWrong += Number(!baseHit && !modelHit);
    baselineCE += crossEntropy(target, baseline); learnedCE += crossEntropy(target, learned);
    targetEntropy += entropy(target); baselineEntropy += entropy(baseline); learnedEntropy += entropy(learned);
    baseShortfall += (maximum - target[base]!) * sample.teacherIterations;
    learnedShortfall += (maximum - target[model]!) * sample.teacherIterations;
    baseTop += Math.max(...baseline); learnedTop += Math.max(...learned); teacherTop += maximum;
    const count = String(sample.actionIds.length);
    counts[count] = (counts[count] ?? 0) + 1;
    margins.push(gapVisits(sample)); topVisits.push(maximum * sample.teacherIterations);
  }
  const n = rows.length;
  return {
    samples: n, meanLegalActions: sum(rows.map(row => row.sample.actionIds.length)) / n, legalActionCountHistogram: counts,
    repeatedSemanticIdRate: duplicates / n, maximumVisitTieRate: ties / n, uniformTargetRate: uniform / n,
    teacherTopProbability: teacherTop / n, teacherTopVisits: quantiles(topVisits), teacherTopMinusNextVisits: quantiles(margins),
    baseline: { crossEntropy: baselineCE / n, entropy: baselineEntropy / n, maxProbability: baseTop / n,
      teacherTop1Accuracy: baseCorrect / n, meanSelectedVisitShortfall: baseShortfall / n },
    learned: { crossEntropy: learnedCE / n, entropy: learnedEntropy / n, maxProbability: learnedTop / n,
      teacherTop1Accuracy: learnedCorrect / n, meanSelectedVisitShortfall: learnedShortfall / n },
    targetEntropy: targetEntropy / n, modelBaselineArgmaxAgreement: sameAction / n,
    modelBaselineSemanticChoiceAgreement: sameSemanticAction / n, teacherTop1Improvements: improvements,
    teacherTop1Regressions: regressions, bothMissTeacherTop1: bothWrong,
  };
}
function collapseSemanticIds(row: Evaluated): Evaluated {
  const ids = [...new Set(row.sample.actionIds)];
  const aggregate = (values: readonly number[]) => ids.map(id =>
    sum(values.filter((_value, position) => row.sample.actionIds[position] === id)));
  return { sample: { ...row.sample, actionIds: ids, target: aggregate(row.sample.target),
    baseline: aggregate(row.sample.baseline), teacherValues: ids.map(() => 0) }, learned: aggregate(row.learned) };
}
export function policyDiagnostics(rows: readonly Evaluated[], strongGapVisits = 8) {
  const groups = {
    tied: rows.filter(row => gapVisits(row.sample) === 0),
    weak: rows.filter(row => gapVisits(row.sample) > 0 && gapVisits(row.sample) < strongGapVisits),
    strong: rows.filter(row => gapVisits(row.sample) >= strongGapVisits),
  };
  const phases = Object.fromEntries([...new Set(rows.map(row => row.sample.phase))].sort().map(phase => {
    const selected = rows.filter(row => row.sample.phase === phase);
    return [phase, { overall: summarize(selected),
      strong: summarize(selected.filter(row => gapVisits(row.sample) >= strongGapVisits)),
      tied: summarize(selected.filter(row => gapVisits(row.sample) === 0)) }];
  }));
  const temperatureComparisons = [1, 0.75, 0.5, 0.25].map(temperature => {
    let baseline = 0, learned = 0, targetEntropy = 0;
    for (const row of rows) {
      const target = sharpen(row.sample.target, temperature);
      baseline += crossEntropy(target, row.sample.baseline);
      learned += crossEntropy(target, row.learned);
      targetEntropy += entropy(target);
    }
    return { temperature, targetEntropy: targetEntropy / rows.length, baselineCrossEntropy: baseline / rows.length,
      learnedCrossEntropy: learned / rows.length };
  });
  const marginBins = [
    ['0', 0, 0], ['1', 1, 1], ['2-3', 2, 3], ['4-7', 4, 7],
    ['8-15', 8, 15], ['16-31', 16, 31], ['32+', 32, Infinity],
  ] as const;
  return {
    strongGapVisits, interpretation: 'Strong is an operational visit-gap threshold, not statistical certainty.',
    overall: summarize(rows), confidence: Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, summarize(value)])),
    visitGapBins: Object.fromEntries(marginBins.map(([name, low, high]) => [name, summarize(rows.filter(row => {
      const gap = gapVisits(row.sample); return gap >= low && gap <= high;
    }))])), phases, temperatureComparisons,
    semanticMassArgmax: {
      interpretation: 'Aggregate visit/probability mass of equal semantic IDs before argmax; distinct from choosing the largest concrete-action probability.',
      overall: summarize(rows.map(collapseSemanticIds)),
    },
  };
}
export async function policyDiagnosticsMain(argv = process.argv.slice(2)): Promise<void> {
  const args = new Map<string, string>();
  const allowed = ['input', 'model', 'output', 'split', 'strong-gap-visits'];
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, ''), value = argv[i + 1];
    if (!key || !allowed.includes(key) || value === undefined || args.has(key)) throw new Error('Invalid argument ' + argv[i]);
    args.set(key, value);
  }
  if (!args.has('input') || !args.has('model')) throw new Error('Pass --input dataset.json --model model.json');
  const split = args.get('split') ?? 'validation', strongGapVisits = Number(args.get('strong-gap-visits') ?? 8);
  if (!['validation', 'training', 'all'].includes(split) || !Number.isSafeInteger(strongGapVisits) || strongGapVisits < 1) throw new Error('Invalid split or strong gap');
  const input = resolve(args.get('input')!), modelPath = resolve(args.get('model')!);
  const dataset = parsePolicyDataset(JSON.parse(readFileSync(input, 'utf8')));
  const model = NeuralPolicyNetwork.fromJSON(JSON.parse(readFileSync(modelPath, 'utf8')));
  const metadata = model.toJSON().metadata;
  const training = metadata['trainingGameSeeds'], validation = metadata['validationGameSeeds'];
  if (!Array.isArray(training) || !Array.isArray(validation) || !training.length || !validation.length ||
    [...training, ...validation].some(seed => !Number.isSafeInteger(seed)) ||
    new Set([...training, ...validation]).size !== training.length + validation.length) throw new Error('Invalid model game split');
  const available = new Set(dataset.games.map(game => game.seed));
  if ([...training, ...validation].some(seed => !available.has(seed))) throw new Error('Model split seeds missing from dataset');
  const selectedSeeds = new Set(split === 'all' ? [...available] : split === 'validation' ? validation : training);
  const games = dataset.games.filter(game => selectedSeeds.has(game.seed));
  const rows = games.flatMap(game => game.samples.map(sample => ({ sample, learned: model.predict(sample) })));
  if (!rows.length) throw new Error('No selected diagnostic examples');
  const report = { dataset: input, model: modelPath, split, games: games.length, gameSeeds: games.map(game => game.seed),
    modelBestEpoch: metadata['bestEpoch'], ...policyDiagnostics(rows, strongGapVisits) };
  if (args.has('output')) {
    const output = resolve(args.get('output')!);
    mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await policyDiagnosticsMain();
