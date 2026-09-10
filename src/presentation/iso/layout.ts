import { parcel, type Point } from './projection';

// Coordinates belong to the renderer, never to the engine or a saved game.
export const PLAYER_OUTLINE = [
  [-2.3, -1.3],
  [-0.4, -2.5],
  [9.2, -2.5],
  [10.6, -0.1],
  [10.6, 3.5],
  [9.4, 4.8],
  [-0.4, 4.8],
  [-2.3, 3.4],
].map(([u, v]) => parcel(u!, v!));
export const CENTRAL_OUTLINE: Point[] = [
  [-700, 0],
  [-390, -285],
  [0, -360],
  [400, -275],
  [700, 0],
  [390, 285],
  [0, 360],
  [-400, 275],
].map(([x, y]) => ({ x: x!, y: y! }));
export const CENTRAL_PLACES = {
  market: { x: 220, y: -20, size: 200 },
  magistrate: { x: -225, y: -35, size: 145 },
  plantations: { x: -245, y: 165, size: 120 },
  festival: { x: 65, y: 215, size: 140 },
  supplies: { x: -20, y: -130, size: 125 },
  port: { x: 445, y: 95, size: 115 },
} as const;
export const CENTRAL_PATHS: Point[][] = [
  [
    { x: -290, y: 190 },
    { x: -30, y: 40 },
    { x: 385, y: 245 },
  ],
  [
    { x: -240, y: 0 },
    { x: -30, y: 105 },
    { x: 220, y: -20 },
  ],
  [
    { x: -20, y: -130 },
    { x: -20, y: 40 },
    { x: 385, y: 245 },
  ],
];
export const CENTRAL_WALKS = [
  [
    CENTRAL_PATHS[0]![0]!,
    CENTRAL_PATHS[0]![1]!,
    CENTRAL_PATHS[0]![2]!,
    CENTRAL_PATHS[0]![1]!,
  ],
  [
    CENTRAL_PATHS[1]![0]!,
    CENTRAL_PATHS[1]![1]!,
    CENTRAL_PATHS[1]![2]!,
    CENTRAL_PATHS[1]![1]!,
  ],
  [
    CENTRAL_PATHS[2]![0]!,
    CENTRAL_PATHS[2]![1]!,
    CENTRAL_PATHS[2]![2]!,
    CENTRAL_PATHS[2]![1]!,
  ],
];
export const PLAYER_WALKS = [
  [parcel(-0.2, 3.5), parcel(4.1, 3.5), parcel(9, 3.5), parcel(4.1, 3.5)],
  [parcel(4.1, -0.5), parcel(4.1, 3.5)],
];
