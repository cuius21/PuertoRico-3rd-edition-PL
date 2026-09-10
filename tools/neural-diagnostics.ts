import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseNeuralDataset, splitByGameSeed } from './train-neural';
import { NeuralValueNetwork, type NeuralExample } from '../src/bots/neural/network';
import { NEURAL_FEATURE_NAMES } from '../src/bots/neural/features';

export function predictionMetrics(examples: readonly NeuralExample[], predict: (sample: NeuralExample) => number[]) {
  if (!examples.length) return null;
  let loss = 0;
  let brier = 0;
  let accuracy = 0;
  for (const sample of examples) {
    const values = predict(sample);
    const best = Math.max(...values);
    const leaders = values.map((value, i) => value === best ? i : -1).filter(i => i >= 0);
    accuracy += leaders.reduce((sum, i) => sum + sample.target[i]!, 0) / leaders.length;
    for (let i = 0; i < 3; i++) {
      loss -= sample.target[i]! * Math.log(Math.max(1e-12, values[i]!));
      brier += (values[i]! - sample.target[i]!) ** 2;
    }
  }
  return { examples: examples.length, crossEntropy: loss / examples.length, brier: brier / examples.length, accuracy: accuracy / examples.length };
}

async function main() {
  const [input, modelFile, output, splitModelFile] = process.argv.slice(2);
  if (!input || !modelFile || !output) throw new Error('Usage: neural-diagnostics.ts DATASET MODEL OUTPUT');
  const dataset = parseNeuralDataset(JSON.parse(readFileSync(input, 'utf8')));
  const model = NeuralValueNetwork.fromJSON(JSON.parse(readFileSync(modelFile, 'utf8')));
  const metadata = splitModelFile ? NeuralValueNetwork.fromJSON(JSON.parse(readFileSync(splitModelFile, 'utf8'))).toJSON().metadata : model.toJSON().metadata;
  const priorSeeds = new Set([...(metadata.trainingGameSeeds as number[] ?? []), ...(metadata.validationGameSeeds as number[] ?? [])]);
  const isOwnDataset = dataset.games.some(game => priorSeeds.has(game.seed));
  const games = isOwnDataset ? splitByGameSeed(dataset.games, 1, metadata).validation : dataset.games;
  const samples = games.flatMap(game => game.samples);
  const roundIndex = NEURAL_FEATURE_NAMES.indexOf('round/20');
  const groups = {
    all: samples,
    rounds1to5: samples.filter(sample => sample.inputs[0]![roundIndex]! * 20 <= 5),
    rounds6to10: samples.filter(sample => sample.inputs[0]![roundIndex]! * 20 > 5 && sample.inputs[0]![roundIndex]! * 20 <= 10),
    rounds11plus: samples.filter(sample => sample.inputs[0]![roundIndex]! * 20 > 10),
  };
  const comparison = Object.fromEntries(Object.entries(groups).map(([label, examples]) => [label, {
    model: predictionMetrics(examples, sample => model.predict(sample.inputs, sample.baseline)),
    hardcore: examples.every(sample => sample.baseline) ? predictionMetrics(examples, sample => sample.baseline!) : null,
    uniform: predictionMetrics(examples, () => [1 / 3, 1 / 3, 1 / 3]),
  }]));
  const report = { model: resolve(modelFile), dataset: resolve(input), games: games.length,
    splitModel: resolve(splitModelFile ?? modelFile),
    split: isOwnDataset ? 'preserved-game-level-validation' : 'all-unseen-game-seeds', comparison };
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
