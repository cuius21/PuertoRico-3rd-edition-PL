import type { ArenaOptions, ExpansionOptions, OpponentMode, PolicyName } from './arena-core';

export const ARENA_HELP = [
  'Puerto Rico headless arena',
  '  --games N          Total games; use a multiple of player count (default 30)',
  '  --players 3|4|5    Player count (default 3)',
  '  --seed N           Unsigned 32-bit environment seed (default 20260909)',
  '  --budget-ms N      Per-decision time budget for searching policies (default 25)',
  '  --iterations N     Fixed Hardcore iterations (0 = heuristic); MCTS remains timed',
  '  --candidate hardcore|greedy|mcts (default hardcore; others are calibration)',
  '  --opponents greedy|mcts|hardcore|mixed (default mcts)',
  '                     Mixed cycles greedy, mcts, hardcore in relative seats',
  '  --expansions base|all|festival,corsair,new-buildings,nobles (default base)',
  '  --max-moves N      Stop as incomplete after N actions (default 5000)',
  '  --output PATH      Save full JSON report; print compact summary to stdout',
  '  --model PATH       Optional trained value model for Hardcore candidate only',
  '  --model-weight N   Blend fraction for candidate model, 0..1 (default 0.25)',
  '  --quiet            Suppress per-game progress on stderr',
  '  --help             Show this help',
  'Each environment seed is reused across a complete rotation of candidate seats.',
  'Time-limited search varies with machine load; use fixed iterations without MCTS',
  'for reproducible move traces. Use wall-clock mode for equal stated time budgets.',
].join('\n');

export function parseArenaArgs(args: string[]): { options: ArenaOptions; output?: string; model?: string; modelWeight: number; quiet: boolean; help: boolean } {
  const values = new Map<string, string>();
  const allowed = new Set(['games', 'players', 'seed', 'budget-ms', 'iterations', 'candidate', 'opponents', 'expansions', 'max-moves', 'output', 'model', 'model-weight']);
  let quiet = false;
  let help = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (flag === '--quiet') { quiet = true; continue; }
    if (flag === '--help') { help = true; continue; }
    if (!flag.startsWith('--') || !allowed.has(flag.slice(2))) throw new Error('Unknown flag: ' + flag);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error('Missing value for ' + flag);
    if (values.has(flag.slice(2))) throw new Error('Repeated flag: ' + flag);
    values.set(flag.slice(2), value);
  }
  const integer = (key: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) => {
    const value = Number(values.get(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('--' + key + ' must be an integer between ' + min + ' and ' + max);
    return value;
  };
  const policy = values.get('candidate') ?? 'hardcore';
  const opponents = values.get('opponents') ?? 'mcts';
  if (!['hardcore', 'greedy', 'mcts'].includes(policy)) throw new Error('Invalid --candidate');
  if (!['hardcore', 'greedy', 'mcts', 'mixed'].includes(opponents)) throw new Error('Invalid --opponents');
  const expansions: ExpansionOptions = { festival: false, corsair: false, newBuildings: false, nobleBuildings: false };
  const expansionArg = values.get('expansions') ?? 'base';
  const expansionFlags: Record<string, keyof ExpansionOptions> = { festival: 'festival', corsair: 'corsair', 'new-buildings': 'newBuildings', nobles: 'nobleBuildings' };
  if (expansionArg === 'all') {
    for (const key of Object.values(expansionFlags)) expansions[key] = true;
  } else if (expansionArg !== 'base') {
    for (const value of expansionArg.split(',')) {
      const key = expansionFlags[value];
      if (!key) throw new Error('Unknown expansion: ' + value);
      expansions[key] = true;
    }
  }
  const budgetMs = Number(values.get('budget-ms') ?? 25);
  const modelWeight = Number(values.get('model-weight') ?? 0.25);
  if (!Number.isFinite(modelWeight) || modelWeight < 0 || modelWeight > 1) throw new Error('--model-weight must be between 0 and 1');
  if (values.has('model') && policy !== 'hardcore') throw new Error('--model requires --candidate hardcore');
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new Error('--budget-ms must be a positive finite number');
  const options: ArenaOptions = {
    games: integer('games', 30, 1),
    players: integer('players', 3, 3, 5) as 3 | 4 | 5,
    seed: integer('seed', 20260909, 0, 0xffffffff),
    budgetMs,
    ...(values.has('iterations') ? { iterations: integer('iterations', 0, 0) } : {}),
    maxMoves: integer('max-moves', 5000, 1),
    candidate: policy as PolicyName,
    opponents: opponents as OpponentMode,
    expansions,
  };
  return { options, quiet, help, modelWeight,
    ...(values.has('model') ? { model: values.get('model')! } : {}),
    ...(values.has('output') ? { output: values.get('output')! } : {}) };
}
