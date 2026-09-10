import type { GameState } from '../../../state/GameState';
import type { Island } from '../../../domain/Island';
import { PhaseType } from '../../../core/types';

const METHODS = [
  'getBuildings', 'getActiveBuildings', 'getPlantations', 'getTotalEmployedWorkers',
  'countActiveQuarries', 'countActivePlantations', 'getProductionCapacity',
  'getFreeUrbanSlotCount', 'getFreeRuralSlotCount', 'getFreeWorkerSlotsCount',
  'hasFreeRuralSlot', 'hasBuildingOfType', 'countForests',
] as const;
interface Restoration {
  name: typeof METHODS[number];
  descriptor: PropertyDescriptor | undefined;
}
interface Scope {
  depth: number;
  restorations: Restoration[];
}
const scopes = new WeakMap<Island, Scope>();

function copyList(value: unknown): unknown {
  return Array.isArray(value) ? value.slice() : value;
}

function restore(island: Island, scope: Scope): void {
  let failure: unknown;
  for (let i = scope.restorations.length - 1; i >= 0; i--) {
    const { name, descriptor } = scope.restorations[i]!;
    try {
      if (descriptor) Object.defineProperty(island, name, descriptor);
      else if (!Reflect.deleteProperty(island, name)) throw new Error('Cannot restore policy read cache method: ' + name);
    } catch (error) { failure ??= error; }
  }
  scopes.delete(island);
  if (failure !== undefined) throw failure;
}

function enter(island: Island): void {
  const existing = scopes.get(island);
  if (existing) { existing.depth++; return; }
  const scope: Scope = { depth: 1, restorations: [] };
  scopes.set(island, scope);
  try {
    for (const name of METHODS) {
      const descriptor = Object.getOwnPropertyDescriptor(island, name);
      if (!descriptor && !Object.isExtensible(island)) continue;
      if (descriptor && !descriptor.configurable && (!('value' in descriptor) || !descriptor.writable)) continue;
      const original: unknown = Reflect.get(island, name);
      if (typeof original !== 'function') continue;
      const values = new Map<unknown, unknown>();
      const wrapped = function (this: unknown, ...args: unknown[]): unknown {
        // Preserve borrowed-method calls and unusual signatures rather than caching
        // them under the receiver or single-argument keys used by normal engine reads.
        if (this !== island || args.length > 1) return Reflect.apply(original, this, args);
        const key = args[0];
        if (values.has(key)) return copyList(values.get(key));
        const result: unknown = Reflect.apply(original, island, args);
        // Original list getters return fresh arrays. The private snapshot must not
        // share the container returned to callers who may sort, splice or append.
        values.set(key, copyList(result));
        return result;
      };
      const replacement: PropertyDescriptor = descriptor && 'value' in descriptor ?
        { ...descriptor, value: wrapped } :
        { value: wrapped, writable: true, enumerable: descriptor?.enumerable ?? false, configurable: true };
      Object.defineProperty(island, name, replacement);
      scope.restorations.push({ name, descriptor });
    }
  } catch (error) {
    restore(island, scope);
    throw error;
  }
}

function leave(island: Island): void {
  const scope = scopes.get(island);
  if (!scope) return;
  if (--scope.depth === 0) restore(island, scope);
}

function invoke<T>(state: GameState, operation: (state: GameState) => T): T {
  const result = operation(state);
  if (result !== null && (typeof result === 'object' || typeof result === 'function') &&
      typeof (result as { then?: unknown }).then === 'function') {
    throw new TypeError('withPolicyReadCache requires a synchronous operation');
  }
  return result;
}

/**
 * Experimental inference adapter for synchronous, read-only callbacks. No memoized
 * value survives the outermost callback. Returned list containers remain independent;
 * their Building/Plantation objects are the original engine objects and must not be
 * mutated. The callback must not apply game actions, change islands, freeze them or
 * redefine their method descriptors. Do not wrap training or async work in this scope.
 *
 * Cache only the phases with measured benefit. Frozen/non-extensible islands and
 * non-replaceable methods are used unchanged. Nested reads share the current scope.
 */
export function withPolicyReadCache<T>(state: GameState, operation: (state: GameState) => T): T {
  const phase = state.getCurrentPhase().type;
  if (phase !== PhaseType.RoleSelection && phase !== PhaseType.Builder) return invoke(state, operation);
  const entered: Island[] = [];
  try {
    for (const island of new Set(state.players.map(player => player.island))) {
      enter(island);
      entered.push(island);
    }
    return invoke(state, operation);
  } finally {
    // Release every island even if a caller violated the descriptor contract on one.
    let failure: unknown;
    for (let i = entered.length - 1; i >= 0; i--) {
      try { leave(entered[i]!); } catch (error) { failure ??= error; }
    }
    if (failure !== undefined) throw failure;
  }
}