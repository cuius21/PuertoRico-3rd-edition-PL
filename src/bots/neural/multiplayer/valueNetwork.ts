// Experimental shared-player value head with variable-size winner softmax.
import type { GameState } from '../../../../state/GameState';
import { PhaseType } from '../../../../core/types';
import { evaluateHardcoreState, terminalUtilities } from '../../hardcoreEvaluation';
import { encodeNeuralState, supportsNeuralState, NEURAL_FEATURE_SCHEMA, NEURAL_FEATURE_NAMES, NEURAL_INPUT_SIZE } from './features';

export interface NeuralExample {
  inputs: number[][];
  target: number[];
  baseline?: number[];
}

export type NeuralValueMode = 'standalone' | 'residual';

export interface NeuralModelJSON {
  format: 'puerto-rico-multiplayer-value';
  version: 1 | 2;
  valueMode?: NeuralValueMode;
  featureSchema: typeof NEURAL_FEATURE_SCHEMA;
  featureNames: string[];
  playerCounts: [3, 4, 5];
  hiddenSize: number;
  parameters: number[];
  metadata: Record<string, unknown>;
  optimizer?: { step: number; firstMoments: number[]; secondMoments: number[] };
}

export interface NeuralNetworkOptions {
  seed?: number;
  hiddenSize?: number;
  valueMode?: NeuralValueMode;
}

export interface NeuralTrainingOptions {
  learningRate?: number;
  l2?: number;
}

export function seededNeuralRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function finiteArray(value: unknown, size: number, name: string): number[] {
  if (!Array.isArray(value) || value.length !== size || !value.every(x => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error('Invalid neural ' + name);
  }
  return value as number[];
}

export class NeuralValueNetwork {
  readonly hiddenSize: number;
  readonly valueMode: NeuralValueMode;
  private readonly parameters: Float64Array;
  private readonly firstMoments: Float64Array;
  private readonly secondMoments: Float64Array;
  private step = 0;
  private metadata: Record<string, unknown> = {};

  constructor(options: NeuralNetworkOptions = {}) {
    this.hiddenSize = options.hiddenSize ?? 32;
    this.valueMode = options.valueMode ?? 'standalone';
    if (!['standalone', 'residual'].includes(this.valueMode)) throw new Error('Invalid neural value mode');
    if (!Number.isInteger(this.hiddenSize) || this.hiddenSize < 1 || this.hiddenSize > 256) {
      throw new Error('Neural hidden size must be an integer between 1 and 256');
    }
    const inputCount = NEURAL_INPUT_SIZE * this.hiddenSize;
    this.parameters = new Float64Array(inputCount + 2 * this.hiddenSize);
    this.firstMoments = new Float64Array(this.parameters.length);
    this.secondMoments = new Float64Array(this.parameters.length);
    const random = seededNeuralRandom(options.seed ?? 1);
    const inputScale = Math.sqrt(6 / (NEURAL_INPUT_SIZE + this.hiddenSize));
    const outputScale = Math.sqrt(6 / (this.hiddenSize + 1));
    for (let i = 0; i < inputCount; i++) this.parameters[i] = (random() * 2 - 1) * inputScale;
    // A residual candidate starts at the existing evaluator, so epoch zero is a meaningful control.
    for (let h = 0; h < this.hiddenSize; h++) this.parameters[inputCount + this.hiddenSize + h] =
      this.valueMode === 'residual' ? 0 : (random() * 2 - 1) * outputScale;
  }

  static fromJSON(value: unknown): NeuralValueNetwork {
    if (typeof value !== 'object' || value === null) throw new Error('Invalid neural model');
    const data = value as NeuralModelJSON;
    if (data.format !== 'puerto-rico-multiplayer-value' || ![1, 2].includes(data.version) || JSON.stringify(data.playerCounts) !== '[3,4,5]' ||
      data.featureSchema !== NEURAL_FEATURE_SCHEMA || JSON.stringify(data.featureNames) !== JSON.stringify(NEURAL_FEATURE_NAMES)) {
      throw new Error('Incompatible neural model format or feature schema');
    }
    if ((data.version === 2 && data.valueMode !== 'residual') ||
      (data.version === 1 && data.valueMode !== undefined && data.valueMode !== 'standalone')) {
      throw new Error('Incompatible neural value mode and model version');
    }
    if (!Number.isInteger(data.hiddenSize) || data.hiddenSize < 1 || data.hiddenSize > 256) throw new Error('Invalid neural hidden size');
    const model = new NeuralValueNetwork({ hiddenSize: data.hiddenSize, valueMode: data.valueMode ?? 'standalone' });
    model.parameters.set(finiteArray(data.parameters, model.parameters.length, 'parameters'));
    if (typeof data.metadata !== 'object' || data.metadata === null || Array.isArray(data.metadata)) {
      throw new Error('Invalid neural metadata');
    }
    model.metadata = { ...data.metadata };
    if (data.optimizer) {
      if (!Number.isSafeInteger(data.optimizer.step) || data.optimizer.step < 0) throw new Error('Invalid neural optimizer step');
      model.step = data.optimizer.step;
      model.firstMoments.set(finiteArray(data.optimizer.firstMoments, model.parameters.length, 'first moments'));
      model.secondMoments.set(finiteArray(data.optimizer.secondMoments, model.parameters.length, 'second moments'));
      if (model.secondMoments.some(value => value < 0)) throw new Error('Invalid neural second moments');
    }
    return model;
  }

  toJSON(metadata: Record<string, unknown> = this.metadata, includeOptimizer = false): NeuralModelJSON {
    const model: NeuralModelJSON = {
      format: 'puerto-rico-multiplayer-value', version: this.valueMode === 'residual' ? 2 : 1,
      ...(this.valueMode === 'residual' ? { valueMode: this.valueMode } : {}), featureSchema: NEURAL_FEATURE_SCHEMA,
      featureNames: [...NEURAL_FEATURE_NAMES], playerCounts: [3, 4, 5], hiddenSize: this.hiddenSize,
      parameters: Array.from(this.parameters), metadata: { ...metadata },
    };
    if (includeOptimizer) model.optimizer = {
      step: this.step, firstMoments: Array.from(this.firstMoments), secondMoments: Array.from(this.secondMoments),
    };
    return model;
  }

  supports(state: GameState): boolean {
    // The pilot dataset contains completed-role boundaries only.
    return supportsNeuralState(state) && state.getCurrentPhase().type === PhaseType.RoleSelection;
  }

  evaluate(state: GameState): number[] {
    if (state.gameOver) return terminalUtilities(state);
    if (!this.supports(state)) return evaluateHardcoreState(state);
    return this.predict(encodeNeuralState(state), this.valueMode === 'residual' ? evaluateHardcoreState(state) : undefined);
  }

  private forward(inputs: number[][], baseline?: number[]): { probabilities: number[]; hidden: Float64Array } {
    if (![3,4,5].includes(inputs.length)) throw new Error('Multiplayer input requires 3-5 candidate rows');
    const hidden = new Float64Array(inputs.length * this.hiddenSize);
    const logits = new Array<number>(inputs.length).fill(0);
    if (this.valueMode === 'residual') {
      if (!baseline) throw new Error('Residual neural value requires baseline probabilities');
      this.validateTarget(baseline, inputs.length);
      for (let player = 0; player < inputs.length; player++) logits[player] = Math.log(Math.max(1e-12, baseline[player]!));
    }
    const biasOffset = NEURAL_INPUT_SIZE * this.hiddenSize;
    const outputOffset = biasOffset + this.hiddenSize;
    for (let player = 0; player < inputs.length; player++) {
      const row = finiteArray(inputs[player], NEURAL_INPUT_SIZE, 'input row');
      for (let h = 0; h < this.hiddenSize; h++) {
        let sum = this.parameters[biasOffset + h]!;
        const offset = h * NEURAL_INPUT_SIZE;
        for (let f = 0; f < NEURAL_INPUT_SIZE; f++) sum += this.parameters[offset + f]! * row[f]!;
        const activation = Math.tanh(sum);
        hidden[player * this.hiddenSize + h] = activation;
        logits[player]! += this.parameters[outputOffset + h]! * activation;
      }
    }
    const maximum = Math.max(...logits);
    const weights = logits.map(value => Math.exp(value - maximum));
    const total = weights.reduce((sum, value) => sum + value, 0);
    return { probabilities: weights.map(value => value / total), hidden };
  }

  predict(inputs: number[][], baseline?: number[]): number[] {
    return this.forward(inputs, baseline).probabilities;
  }

  loss(examples: readonly NeuralExample[]): number {
    if (examples.length === 0) throw new Error('Neural loss needs at least one example');
    let loss = 0;
    for (const example of examples) {
      const probabilities = this.predict(example.inputs, example.baseline);
      this.validateTarget(example.target, example.inputs.length);
      for (let player = 0; player < example.inputs.length; player++) loss -= example.target[player]! * Math.log(Math.max(1e-12, probabilities[player]!));
    }
    return loss / examples.length;
  }

  private validateTarget(target: number[], count: number): void {
    finiteArray(target, count, 'target');
    if (target.some(value => value < 0) || Math.abs(target.reduce((sum, value) => sum + value, 0) - 1) > 1e-6) {
      throw new Error('Neural target must be nonnegative win credit summing to one');
    }
  }

  trainBatch(examples: readonly NeuralExample[], options: NeuralTrainingOptions = {}): number {
    if (examples.length === 0) throw new Error('Neural batch is empty');
    const learningRate = options.learningRate ?? 0.001;
    const l2 = options.l2 ?? 0.00001;
    if (!Number.isFinite(learningRate) || learningRate <= 0 || !Number.isFinite(l2) || l2 < 0) {
      throw new Error('Invalid neural training options');
    }
    const gradients = new Float64Array(this.parameters.length);
    const biasOffset = NEURAL_INPUT_SIZE * this.hiddenSize;
    const outputOffset = biasOffset + this.hiddenSize;
    let loss = 0;
    for (const example of examples) {
      this.validateTarget(example.target, example.inputs.length);
      const { probabilities, hidden } = this.forward(example.inputs, example.baseline);
      for (let player = 0; player < example.inputs.length; player++) {
        const row = example.inputs[player]!;
        const delta = probabilities[player]! - example.target[player]!;
        loss -= example.target[player]! * Math.log(Math.max(1e-12, probabilities[player]!));
        for (let h = 0; h < this.hiddenSize; h++) {
          const activation = hidden[player * this.hiddenSize + h]!;
          gradients[outputOffset + h]! += delta * activation;
          const hiddenDelta = delta * this.parameters[outputOffset + h]! * (1 - activation * activation);
          gradients[biasOffset + h]! += hiddenDelta;
          const offset = h * NEURAL_INPUT_SIZE;
          for (let f = 0; f < NEURAL_INPUT_SIZE; f++) gradients[offset + f]! += hiddenDelta * row[f]!;
        }
      }
    }
    this.step++;
    const firstCorrection = 1 - Math.pow(0.9, this.step);
    const secondCorrection = 1 - Math.pow(0.999, this.step);
    for (let i = 0; i < this.parameters.length; i++) {
      const regularization = i >= biasOffset && i < outputOffset ? 0 : l2 * this.parameters[i]!;
      const gradient = Math.max(-5, Math.min(5, gradients[i]! / examples.length + regularization));
      const first = this.firstMoments[i] = 0.9 * this.firstMoments[i]! + 0.1 * gradient;
      const second = this.secondMoments[i] = 0.999 * this.secondMoments[i]! + 0.001 * gradient * gradient;
      this.parameters[i]! -= learningRate * (first / firstCorrection) / (Math.sqrt(second / secondCorrection) + 1e-8);
    }
    return loss / examples.length;
  }
}
