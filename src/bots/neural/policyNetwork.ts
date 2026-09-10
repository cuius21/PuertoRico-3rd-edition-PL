import type { Action } from '../../../actions/Action';
import type { GameState } from '../../../state/GameState';
import type { PlayerId } from '../../../core/types';
import { evaluateHardcoreState } from '../hardcoreEvaluation';
import { NEURAL_FEATURE_SCHEMA, NEURAL_FEATURE_NAMES, NEURAL_INPUT_SIZE } from './features';
import { encodePolicyInput, heuristicPolicyProbabilities, NEURAL_ACTION_VOCABULARY } from './policyFeatures';
import type { PolicyInput } from './policyFeatures';
import { seededNeuralRandom } from './network';

export type NeuralPolicyMode = 'residual' | 'standalone';
export type PolicyTrainingExample = PolicyInput & { target: number[] };
export interface NeuralPolicyOptions { hiddenSize?: number; policyMode?: NeuralPolicyMode; seed?: number }
export interface PolicyTrainingOptions { learningRate?: number; l2?: number }
export interface NeuralPolicyJSON {
  format: 'puerto-rico-neural-policy';
  version: 1;
  featureSchema: typeof NEURAL_FEATURE_SCHEMA;
  featureNames: string[];
  actionVocabulary: string[];
  hiddenSize: number;
  policyMode: NeuralPolicyMode;
  parameters: number[];
  metadata: Record<string, unknown>;
  optimizer?: { step: number; firstMoments: number[]; secondMoments: number[] };
}
export const NEURAL_POLICY_OUTPUT_SIZE = NEURAL_ACTION_VOCABULARY.length;

function finiteArray(value: unknown, length: number, name: string): number[] {
  if (!Array.isArray(value) || value.length !== length ||
    value.some(entry => typeof entry !== 'number' || !Number.isFinite(entry))) throw new Error('Invalid policy ' + name);
  return value as number[];
}

export function validatePolicyInput(value: PolicyInput): void {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid policy input');
  finiteArray(value.input, NEURAL_INPUT_SIZE, 'features');
  if (!Array.isArray(value.actionIds) || value.actionIds.length === 0 ||
    value.actionIds.some(id => !Number.isInteger(id) || id < 0 || id >= NEURAL_POLICY_OUTPUT_SIZE)) {
    throw new Error('Invalid policy action IDs');
  }
  validatePolicyDistribution(value.baseline, value.actionIds.length, 'baseline');
}

export function validatePolicyDistribution(value: unknown, length: number, name: string): number[] {
  const values = finiteArray(value, length, name);
  if (values.some(entry => entry < 0) || Math.abs(values.reduce((sum, entry) => sum + entry, 0) - 1) > 1e-6) {
    throw new Error('Policy ' + name + ' must be a probability distribution');
  }
  return values;
}

export class NeuralPolicyNetwork {
  readonly hiddenSize: number;
  readonly policyMode: NeuralPolicyMode;
  private readonly parameters: Float64Array;
  private readonly firstMoments: Float64Array;
  private readonly secondMoments: Float64Array;
  private step = 0;
  private metadata: Record<string, unknown> = {};

  constructor(options: NeuralPolicyOptions = {}) {
    this.hiddenSize = options.hiddenSize ?? 64;
    this.policyMode = options.policyMode ?? 'residual';
    if (!Number.isInteger(this.hiddenSize) || this.hiddenSize < 1 || this.hiddenSize > 256) throw new Error('Invalid policy hidden size');
    if (this.policyMode !== 'residual' && this.policyMode !== 'standalone') throw new Error('Invalid policy mode');
    const count = NEURAL_INPUT_SIZE * this.hiddenSize + this.hiddenSize +
      NEURAL_POLICY_OUTPUT_SIZE * this.hiddenSize + NEURAL_POLICY_OUTPUT_SIZE;
    this.parameters = new Float64Array(count);
    this.firstMoments = new Float64Array(count);
    this.secondMoments = new Float64Array(count);
    const random = seededNeuralRandom(options.seed ?? 1);
    const firstScale = Math.sqrt(6 / (NEURAL_INPUT_SIZE + this.hiddenSize));
    for (let i = 0; i < NEURAL_INPUT_SIZE * this.hiddenSize; i++) this.parameters[i] = (random() * 2 - 1) * firstScale;
    if (this.policyMode === 'standalone') {
      const secondScale = Math.sqrt(6 / (this.hiddenSize + NEURAL_POLICY_OUTPUT_SIZE));
      for (let i = this.outputOffset; i < this.outputBiasOffset; i++) this.parameters[i] = (random() * 2 - 1) * secondScale;
    }
  }

  private get hiddenBiasOffset(): number { return NEURAL_INPUT_SIZE * this.hiddenSize; }
  private get outputOffset(): number { return this.hiddenBiasOffset + this.hiddenSize; }
  private get outputBiasOffset(): number { return this.outputOffset + NEURAL_POLICY_OUTPUT_SIZE * this.hiddenSize; }

  static fromJSON(value: unknown): NeuralPolicyNetwork {
    if (typeof value !== 'object' || value === null) throw new Error('Invalid policy model');
    const data = value as NeuralPolicyJSON;
    if (data.format !== 'puerto-rico-neural-policy' || data.version !== 1 || data.featureSchema !== NEURAL_FEATURE_SCHEMA ||
      JSON.stringify(data.featureNames) !== JSON.stringify(NEURAL_FEATURE_NAMES) ||
      JSON.stringify(data.actionVocabulary) !== JSON.stringify(NEURAL_ACTION_VOCABULARY)) {
      throw new Error('Incompatible policy model schema or action vocabulary');
    }
    if (!Number.isInteger(data.hiddenSize) || data.hiddenSize < 1 || data.hiddenSize > 256 ||
      (data.policyMode !== 'residual' && data.policyMode !== 'standalone')) throw new Error('Invalid policy architecture');
    const model = new NeuralPolicyNetwork({ hiddenSize: data.hiddenSize, policyMode: data.policyMode });
    model.parameters.set(finiteArray(data.parameters, model.parameters.length, 'parameters'));
    if (!data.metadata || typeof data.metadata !== 'object' || Array.isArray(data.metadata)) throw new Error('Invalid policy metadata');
    model.metadata = { ...data.metadata };
    if (data.optimizer !== undefined) {
      if (!data.optimizer || typeof data.optimizer !== 'object' ||
        !Number.isSafeInteger(data.optimizer.step) || data.optimizer.step < 0) throw new Error('Invalid policy optimizer step');
      model.firstMoments.set(finiteArray(data.optimizer.firstMoments, model.parameters.length, 'first moments'));
      model.secondMoments.set(finiteArray(data.optimizer.secondMoments, model.parameters.length, 'second moments'));
      if (model.secondMoments.some(entry => entry < 0)) throw new Error('Invalid policy second moments');
      model.step = data.optimizer.step;
    }
    return model;
  }

  toJSON(metadata: Record<string, unknown> = this.metadata, includeOptimizer = false): NeuralPolicyJSON {
    const data: NeuralPolicyJSON = {
      format: 'puerto-rico-neural-policy', version: 1, featureSchema: NEURAL_FEATURE_SCHEMA,
      featureNames: [...NEURAL_FEATURE_NAMES], actionVocabulary: [...NEURAL_ACTION_VOCABULARY],
      hiddenSize: this.hiddenSize, policyMode: this.policyMode, parameters: Array.from(this.parameters), metadata: { ...metadata },
    };
    if (includeOptimizer) data.optimizer = {
      step: this.step, firstMoments: Array.from(this.firstMoments), secondMoments: Array.from(this.secondMoments),
    };
    return data;
  }

  evaluate(state: GameState): number[] { return evaluateHardcoreState(state); }

  policy(state: GameState, playerId: PlayerId, actions: readonly Action[]): number[] {
    if (actions.length === 0) return [];
    const allowed = new Set(state.getValidActions(playerId).map(action => JSON.stringify(action)));
    const indices: number[] = [];
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]!;
      if (allowed.has(JSON.stringify(action)) && action.validate(state).ok) indices.push(i);
    }
    const result = new Array<number>(actions.length).fill(0);
    if (indices.length === 0) return result;
    const legal = indices.map(index => actions[index]!);
    const probabilities = this.policyForLegalActions(state, playerId, legal);
    for (let i = 0; i < indices.length; i++) result[indices[i]!] = probabilities[i]!;
    return result;
  }

  /** Search already obtains these actions from the engine; avoid generating them twice. */
  policyForLegalActions(state: GameState, playerId: PlayerId, actions: readonly Action[]): number[] {
    if (actions.length === 0) return [];
    const encoded = encodePolicyInput(state, playerId, actions);
    return encoded ? this.predict(encoded) : heuristicPolicyProbabilities(state, playerId, actions);
  }

  private forward(input: PolicyInput): { probabilities: number[]; hidden: Float64Array; ids: number[] } {
    validatePolicyInput(input);
    const hidden = new Float64Array(this.hiddenSize);
    for (let h = 0; h < this.hiddenSize; h++) {
      let sum = this.parameters[this.hiddenBiasOffset + h]!;
      const offset = h * NEURAL_INPUT_SIZE;
      for (let f = 0; f < NEURAL_INPUT_SIZE; f++) sum += this.parameters[offset + f]! * input.input[f]!;
      hidden[h] = Math.tanh(sum);
    }
    const ids = [...new Set(input.actionIds)];
    const values = new Float64Array(NEURAL_POLICY_OUTPUT_SIZE);
    for (const id of ids) {
      let sum = this.parameters[this.outputBiasOffset + id]!;
      const offset = this.outputOffset + id * this.hiddenSize;
      for (let h = 0; h < this.hiddenSize; h++) sum += this.parameters[offset + h]! * hidden[h]!;
      values[id] = sum;
    }
    const logits = input.actionIds.map((id, position) => values[id]! +
      (this.policyMode === 'residual' ? Math.log(Math.max(1e-12, input.baseline[position]!)) : 0));
    const maximum = Math.max(...logits);
    const weights = logits.map(logit => Math.exp(logit - maximum));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (!Number.isFinite(total) || total <= 0) throw new Error('Policy parameters produced nonfinite probabilities');
    return { probabilities: weights.map(weight => weight / total), hidden, ids };
  }

  predict(input: PolicyInput): number[] { return this.forward(input).probabilities; }

  loss(examples: readonly PolicyTrainingExample[]): number {
    if (examples.length === 0) throw new Error('Policy loss requires examples');
    let loss = 0;
    for (const example of examples) {
      const probabilities = this.predict(example);
      validatePolicyDistribution(example.target, probabilities.length, 'target');
      for (let i = 0; i < probabilities.length; i++) loss -= example.target[i]! * Math.log(Math.max(1e-12, probabilities[i]!));
    }
    return loss / examples.length;
  }

  lossAndGradients(examples: readonly PolicyTrainingExample[]): { loss: number; gradients: Float64Array } {
    if (examples.length === 0) throw new Error('Policy gradient requires examples');
    const gradients = new Float64Array(this.parameters.length);
    let loss = 0;
    for (const example of examples) {
      const { probabilities, hidden, ids } = this.forward(example);
      validatePolicyDistribution(example.target, probabilities.length, 'target');
      const outputDelta = new Float64Array(NEURAL_POLICY_OUTPUT_SIZE);
      for (let i = 0; i < probabilities.length; i++) {
        loss -= example.target[i]! * Math.log(Math.max(1e-12, probabilities[i]!));
        // Several concrete actions can share one semantic output neuron.
        outputDelta[example.actionIds[i]!]! += probabilities[i]! - example.target[i]!;
      }
      const hiddenDelta = new Float64Array(this.hiddenSize);
      for (const id of ids) {
        const delta = outputDelta[id]!;
        const offset = this.outputOffset + id * this.hiddenSize;
        gradients[this.outputBiasOffset + id]! += delta;
        for (let h = 0; h < this.hiddenSize; h++) {
          gradients[offset + h]! += delta * hidden[h]!;
          hiddenDelta[h]! += delta * this.parameters[offset + h]!;
        }
      }
      for (let h = 0; h < this.hiddenSize; h++) {
        const delta = hiddenDelta[h]! * (1 - hidden[h]! * hidden[h]!);
        gradients[this.hiddenBiasOffset + h]! += delta;
        const offset = h * NEURAL_INPUT_SIZE;
        for (let f = 0; f < NEURAL_INPUT_SIZE; f++) gradients[offset + f]! += delta * example.input[f]!;
      }
    }
    for (let i = 0; i < gradients.length; i++) gradients[i]! /= examples.length;
    return { loss: loss / examples.length, gradients };
  }

  trainBatch(examples: readonly PolicyTrainingExample[], options: PolicyTrainingOptions = {}): number {
    const rate = options.learningRate ?? 0.001;
    const l2 = options.l2 ?? 0.00001;
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(l2) || l2 < 0) throw new Error('Invalid policy training options');
    const { loss, gradients } = this.lossAndGradients(examples);
    this.step++;
    const correction1 = 1 - Math.pow(0.9, this.step), correction2 = 1 - Math.pow(0.999, this.step);
    for (let i = 0; i < gradients.length; i++) {
      const bias = (i >= this.hiddenBiasOffset && i < this.outputOffset) || i >= this.outputBiasOffset;
      const gradient = Math.max(-5, Math.min(5, gradients[i]! + (bias ? 0 : l2 * this.parameters[i]!)));
      const first = this.firstMoments[i] = 0.9 * this.firstMoments[i]! + 0.1 * gradient;
      const second = this.secondMoments[i] = 0.999 * this.secondMoments[i]! + 0.001 * gradient * gradient;
      this.parameters[i]! -= rate * (first / correction1) / (Math.sqrt(second / correction2) + 1e-8);
    }
    return loss;
  }
}
