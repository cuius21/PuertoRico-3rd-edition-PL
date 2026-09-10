export interface Point {
  x: number;
  y: number;
}
export const TILE_W = 72;
export const TILE_H = 36;
export function project(u: number, v: number): Point {
  return { x: ((u - v) * TILE_W) / 2, y: ((u + v) * TILE_H) / 2 };
}
export function unproject(x: number, y: number): Point {
  return { x: x / TILE_W + y / TILE_H, y: y / TILE_H - x / TILE_W };
}
export function parcel(u: number, v: number): Point {
  const p = project(u, v),
    o = project(4.5, 1.8);
  return { x: p.x - o.x, y: p.y - o.y };
}
export function islandCenters(count: number): Point[] {
  const angles =
    count === 3
      ? [180, 300, 60]
      : count === 4
        ? [210, 330, 30, 150]
        : [180, 252, 324, 36, 108];
  return angles.map((a) => ({
    x: Math.cos((a * Math.PI) / 180) * 880,
    y: Math.sin((a * Math.PI) / 180) * 580,
  }));
}
export function urbanLayout(
  buildings: readonly { id: string; size: number }[],
) {
  let used = 0;
  return [...buildings]
    .sort((a, b) => b.size - a.size)
    .map((b) => {
      const p = {
        id: b.id,
        u: 5 + (used % 4),
        v: Math.floor(used / 4),
        size: b.size,
      };
      used += b.size;
      return p;
    });
}
