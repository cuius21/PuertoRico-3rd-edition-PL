import type { Point } from '../iso/projection';

// Arc-length motion loops forever, independent of game updates and game RNG.
export function walkAt(route: readonly Point[], seconds: number, speed = 46) {
  const lengths = route.map((a, i) => {
    const b = route[(i + 1) % route.length]!;
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total) return { ...(route[0] ?? { x: 0, y: 0 }), facing: 1 };
  let travel = (((seconds * speed) % total) + total) % total;
  for (let i = 0; i < route.length; i++) {
    const length = lengths[i]!;
    if (length > 0 && travel <= length) {
      const a = route[i]!,
        b = route[(i + 1) % route.length]!;
      return {
        x: a.x + ((b.x - a.x) * travel) / length,
        y: a.y + ((b.y - a.y) * travel) / length,
        facing: b.x < a.x ? -1 : 1,
      };
    }
    travel -= length;
  }
  return { ...route[0]!, facing: 1 };
}
export function swayAt(seconds: number, phase: number) {
  return (
    Math.sin(seconds * 1.3 + phase) * 0.055 + Math.sin(seconds * 0.43) * 0.021
  );
}
export function bobAt(seconds: number, phase: number) {
  return {
    y: Math.sin(seconds * 1.2 + phase) * 6,
    rotation: Math.sin(seconds * 0.95 + phase) * 0.026,
  };
}
