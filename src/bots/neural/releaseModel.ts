import { NeuralPolicyNetwork } from './policyNetwork';
import policy from './releasedPolicy';

let model: NeuralPolicyNetwork | null = null;

/** One validated inference model per JavaScript module, including each persistent worker. */
export function getReleasedNeuralModel(): NeuralPolicyNetwork {
  return model ??= NeuralPolicyNetwork.fromJSON(policy);
}
