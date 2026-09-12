import type { Change, Json } from './types';

function object(value: Json): value is { [key: string]: Json } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function diff(before: Json, after: Json, path: (string | number)[] = []): Change[] {
  if (before === after) return [];
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    return after.flatMap((value, index) => diff(before[index]!, value, [...path, index]));
  }
  if (object(before) && object(after)) {
    const changes: Change[] = [];
    for (const key of Object.keys(before)) if (!(key in after)) changes.push({ path: [...path, key], remove: true });
    for (const key of Object.keys(after)) {
      changes.push(...(key in before ? diff(before[key]!, after[key]!, [...path, key]) : [{ path: [...path, key], value: after[key]! }]));
    }
    return changes;
  }
  return [{ path, value: after }];
}
export function applyChanges(state: Json, changes: Change[]): Json {
  let result = structuredClone(state);
  for (const change of changes) {
    if (change.path.some(key => ['__proto__', 'constructor', 'prototype'].includes(String(key)))) throw new Error('Unsafe path');
    if (change.path.length === 0) { result = structuredClone(change.value ?? null); continue; }
    let parent = result as Record<string | number, Json>;
    for (const key of change.path.slice(0, -1)) {
      if (!Object.hasOwn(parent, key) || !parent[key] || typeof parent[key] !== 'object') throw new Error('Invalid path');
      parent = parent[key] as Record<string | number, Json>;
    }
    const key = change.path.at(-1)!;
    if (change.remove) delete parent[key]; else parent[key] = structuredClone(change.value ?? null);
  }
  return result;
}

