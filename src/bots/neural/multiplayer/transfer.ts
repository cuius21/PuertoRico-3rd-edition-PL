import type { NeuralPolicyNetwork as LegacyNetwork } from '../policyNetwork';
import { NEURAL_FEATURE_NAMES as OLD_FEATURES } from '../features';
import { NEURAL_ACTION_VOCABULARY as OLD_ACTIONS } from '../policyFeatures';
import { NeuralPolicyNetwork } from './policyNetwork';
import { NEURAL_FEATURE_NAMES } from './features';
import { NEURAL_ACTION_VOCABULARY } from './policyFeatures';

/** Warm-start by semantic names; new inputs have zero weights and Adam starts fresh. */
export function transferLegacyPolicy(old: LegacyNetwork): NeuralPolicyNetwork {
  const next = new NeuralPolicyNetwork({ hiddenSize: old.hiddenSize, policyMode: old.policyMode });
  const oldData = old.toJSON(), data = next.toJSON();
  data.parameters.fill(0);
  const width = old.hiddenSize, oldInput = OLD_FEATURES.length, input = NEURAL_FEATURE_NAMES.length;
  const names = new Map(NEURAL_FEATURE_NAMES.map((name, i) => [name, i]));
  for (let h = 0; h < width; h++) {
    for (let f = 0; f < oldInput; f++) {
      const index = names.get(OLD_FEATURES[f]!);
      if (index === undefined) throw new Error('Missing transfer feature: ' + OLD_FEATURES[f]);
      data.parameters[h * input + index] = oldData.parameters[h * oldInput + f]!;
    }
    data.parameters[width * input + h] = oldData.parameters[width * oldInput + h]!;
  }
  const oldOutput = width * (oldInput + 1), output = width * (input + 1);
  for (let a = 0; a < OLD_ACTIONS.length; a++) {
    const index = (NEURAL_ACTION_VOCABULARY as readonly string[]).indexOf(OLD_ACTIONS[a]!);
    if (index < 0) throw new Error('Missing transfer action');
    for (let h = 0; h < width; h++) data.parameters[output + index * width + h] = oldData.parameters[oldOutput + a * width + h]!;
    data.parameters[output + NEURAL_ACTION_VOCABULARY.length * width + index] = oldData.parameters[oldOutput + OLD_ACTIONS.length * width + a]!;
  }
  data.metadata = { transfer: 'semantic input/action mapping; new weights zero; fresh Adam',
    sourceMetadata: oldData.metadata, trainedForMultiplayer: false, deployment: 'experimental-only' };
  return NeuralPolicyNetwork.fromJSON(data);
}
