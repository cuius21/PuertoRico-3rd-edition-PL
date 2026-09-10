import type { Action } from '../../../actions/Action';
import type { GameState } from '../../../state/GameState';
import type { GameEvent } from '../../game/GameRunner';
import { buildSceneSnapshot, GOOD_NAMES } from '../adapter/buildSceneSnapshot';
import type { SceneSnapshot, PlayerScene } from '../adapter/sceneTypes';
import { roleLabel } from '../../game/actionLabels';
import type { RoleType } from '../../../core/types';

export type BeatKind =
  | 'role'
  | 'build'
  | 'plantation'
  | 'worker'
  | 'workers'
  | 'production'
  | 'shipping'
  | 'departure'
  | 'trade'
  | 'storage'
  | 'pass'
  | 'reward'
  | 'corsair';
export interface ResourceChange {
  icon: string;
  amount: number;
}
export interface ActionBeat {
  id: number;
  actorId: string;
  actorName: string;
  color: string;
  role: string;
  kind: BeatKind;
  title: string;
  detail: string;
  sprite: string;
  changes: ResourceChange[];
  highlights: string[];
  focus: string;
  from: string;
  to: string;
  token: string;
  tokens: { sprite: string; count: number }[];
  count: number;
  duration: number;
  scene: SceneSnapshot;
}
interface ActionShape {
  type: string;
  playerId: string;
  role?: string;
  buildingId?: string;
  good?: string;
  asNoble?: boolean;
  shipIndex?: number;
  slotIndex?: number;
  target?: {
    kind: string;
    buildingId?: string;
    slotIndex?: number;
    shipIndex?: number;
  };
}
export interface ActionCapture {
  before: SceneSnapshot;
  shape: ActionShape;
  event: GameEvent;
}
export function captureAction(
  action: Action,
  state: GameState,
  event: GameEvent,
): ActionCapture {
  return {
    before: buildSceneSnapshot(state, []),
    shape: JSON.parse(JSON.stringify(action)) as ActionShape,
    event: { ...event },
  };
}
function workforce(p: PlayerScene, nobles: boolean) {
  return (
    (nobles ? p.pendingNobles + p.heldNobles : p.pending + p.held) +
    p.objects.reduce((n, o) => n + (nobles ? o.nobles : o.workers), 0)
  );
}
function changes(before: PlayerScene, after: PlayerScene): ResourceChange[] {
  return [
    { icon: 'coin', amount: after.coins - before.coins },
    { icon: 'star', amount: after.vp - before.vp },
    ...Object.keys(GOOD_NAMES)
      .filter((g) => g !== 'forest' && g !== 'quarry')
      .map((icon) => ({
        icon,
        amount: (after.goods[icon] ?? 0) - (before.goods[icon] ?? 0),
      })),
    {
      icon: 'worker',
      amount: workforce(after, false) - workforce(before, false),
    },
    { icon: 'noble', amount: workforce(after, true) - workforce(before, true) },
  ].filter((c) => c.amount !== 0);
}
function changedObjects(before: PlayerScene, after: PlayerScene) {
  return after.objects.filter((o) => {
    const old = before.objects.find((p) => p.key === o.key);
    return (
      !old ||
      old.sprite !== o.sprite ||
      old.workers !== o.workers ||
      old.nobles !== o.nobles
    );
  });
}
const roleArt: Record<string, string> = {
  settler: 'corn',
  mayor: 'magistrate',
  builder: 'smithy',
  craftsman: 'coffeeRoaster',
  trader: 'market',
  captain: 'ship',
  prospector: 'quarry',
  corsair: 'corsair',
};
const kinds: Record<string, BeatKind> = {
  BUILD: 'build',
  TAKE_PLANTATION: 'plantation',
  BUY_PLANTATION_FROM_DECK: 'plantation',
  SELL_PLANTATION: 'plantation',
  PLACE_WORKER: 'worker',
  LOAD_SHIP: 'shipping',
  SELL_GOOD: 'trade',
  CRAFTSMAN_BONUS: 'production',
  SELECT_STORAGE: 'storage',
  PASS: 'pass',
  MAYOR_PASS: 'pass',
  TAKE_DOUBLOON: 'reward',
  TREASURY: 'reward',
};
function actionTitle(label: string) {
  return label
    .replace(/^Zbuduj:/, 'Buduje:')
    .replace(/^Weź:/, 'Bierze:')
    .replace(/^Weź kamieniołom/, 'Bierze kamieniołom')
    .replace(/^Postaw robotnik:/, 'Przydział robotnika:')
    .replace(/^Postaw szlachcic:/, 'Przydział szlachcica:')
    .replace(/^Załaduj /, 'Załadunek: ')
    .replace(/^Sprzedaj/, 'Sprzedaje')
    .replace(/^Pasuj$/, 'Pasuje')
    .replace(/^Weź dublon/, 'Bierze dublon');
}
export function buildActionBeats(
  capture: ActionCapture,
  after: SceneSnapshot,
): Omit<ActionBeat, 'id'>[] {
  const { before, shape: a, event } = capture;
  const actor = after.players.find((p) => p.id === a.playerId);
  if (!actor) return [];
  const role = a.type === 'SELECT_ROLE' ? a.role! : before.phase;
  const beats: Omit<ActionBeat, 'id'>[] = [];
  let staged = before;
  const make = (
    player: PlayerScene,
    updatePlayer: boolean,
    data: Partial<Omit<ActionBeat, 'id' | 'scene'>>,
  ) => {
    staged = {
      ...staged,
      phase: role,
      currentId: player.id,
      legalTargets: [],
      ...(updatePlayer
        ? {
            bank: after.bank,
            vpPool: after.vpPool,
            workersPool: after.workersPool,
            magistrate: after.magistrate,
            noblesPool: after.noblesPool,
            magistrateNobles: after.magistrateNobles,
          }
        : {}),
      players: staged.players.map((p) => ({
        ...(updatePlayer && p.id === player.id ? player : p),
        current: p.id === player.id,
      })),
    };
    const result: Omit<ActionBeat, 'id'> = {
      actorId: player.id,
      actorName: player.name,
      color: player.color,
      role,
      kind: 'reward',
      title: 'Zmiana zasobów',
      detail: '',
      sprite: roleArt[role] ?? 'supplies',
      changes: [],
      highlights: [],
      focus: player.id,
      from: 'dock:' + player.id,
      to: 'waiting:' + player.id,
      token: '',
      tokens: [],
      count: 0,
      duration: 3200,
      ...data,
      scene: staged,
    };
    beats.push(result);
    return result;
  };
  if (a.type === 'SELECT_ROLE') {
    make(actor, false, {
      kind: 'role',
      title: 'Wybiera postać: ' + roleLabel(role as RoleType),
      detail: event.actionText.includes('(+')
        ? event.actionText
        : 'Rozpoczyna akcję tej postaci.',
      focus: role === 'mayor' ? 'magistrate' : actor.id,
      to: role === 'mayor' ? 'magistrate' : actor.id,
      highlights: role === 'mayor' ? ['magistrate'] : [],
      duration: 2600,
    });
  }
  const order = [
    ...after.players.slice(after.players.indexOf(actor)),
    ...after.players.slice(0, after.players.indexOf(actor)),
  ];
  for (const p of order) {
    const old = before.players.find((o) => o.id === p.id)!;
    const ledger = changes(old, p),
      objects = changedObjects(old, p);
    const primary = p.id === actor.id && a.type !== 'SELECT_ROLE';
    const distributing = a.type === 'SELECT_ROLE' && role === 'mayor';
    const producing = a.type === 'SELECT_ROLE' && role === 'craftsman';
    if (
      !primary &&
      !distributing &&
      !producing &&
      !ledger.length &&
      !objects.length
    )
      continue;
    const kind: BeatKind = producing
      ? 'production'
      : distributing
        ? 'workers'
        : primary
          ? (kinds[a.type] ??
            (a.type.startsWith('CORSAIR') ? 'corsair' : 'reward'))
          : 'reward';
    const added = objects.filter(
      (o) => !old.objects.some((b) => b.key === o.key),
    );
    const goods = ledger.filter((c) => Object.hasOwn(GOOD_NAMES, c.icon));
    const produced = goods.filter((c) => c.amount > 0);
    const target =
      a.target?.kind === 'building'
        ? p.id + ':building:' + a.target.buildingId
        : a.target?.kind === 'plantation'
          ? p.id + ':plantation:' + a.target.slotIndex
          : undefined;
    const highlights =
      kind === 'worker' && target ? [target] : objects.map((o) => o.key);
    if (kind === 'production') {
      const producedBy: Record<string, string> = {
        smallIndigoPlant: 'indigo',
        largeIndigoPlant: 'indigo',
        smallSugarMill: 'sugar',
        largeSugarMill: 'sugar',
        tobaccoStorage: 'tobacco',
        coffeeRoaster: 'coffee',
      };
      for (const o of p.objects) {
        if (
          o.workers + o.nobles > 0 &&
          (produced.some((g) => g.icon === o.sprite) ||
            produced.some((g) => g.icon === producedBy[o.sprite]))
        )
          highlights.push(o.key);
      }
    }
    const gain = ledger
      .filter((c) => c.icon === 'worker' || c.icon === 'noble')
      .reduce((n, c) => n + Math.max(0, c.amount), 0);
    const title = producing
      ? 'Produkcja towarów'
      : distributing
        ? 'Pracownicy do przydziału'
        : primary
          ? actionTitle(event.actionText)
          : 'Efekt akcji: ' + event.playerName;
    let detail = producing
      ? produced.length
        ? produced.map((c) => GOOD_NAMES[c.icon] + ': +' + c.amount).join(' · ')
        : 'Brak wyprodukowanych towarów.'
      : distributing
        ? 'Nowi pracownicy: ' +
          gain +
          '. Do przydziału — robotnicy: ' +
          p.pending +
          '' +
          (after.nobles ? ', szlachta: ' + p.pendingNobles : '') +
          '.'
        : kind === 'worker'
          ? 'Pracownik zajmuje podświetlone miejsce.'
          : kind === 'pass'
            ? a.type === 'MAYOR_PASS'
              ? 'Kończy przydział. W rezerwie: ' +
                (p.held + p.heldNobles) +
                ' osób.'
              : 'Rezygnuje z ruchu w tej akcji.'
            : added.length > 1
              ? added.map((o) => o.name).join(' · ')
              : '';
    let to = highlights[0] ?? 'waiting:' + p.id;
    let from = kind === 'worker' ? 'waiting:' + p.id : 'dock:' + p.id;
    let token =
      kind === 'worker'
        ? a.asNoble
          ? 'noble0'
          : 'worker0'
        : kind === 'workers'
          ? 'worker0'
          : kind === 'production'
            ? (produced[0]?.icon ?? '')
            : kind === 'trade' || kind === 'shipping'
              ? (a.good ?? '')
              : '';
    let count =
      kind === 'worker'
        ? 1
        : kind === 'workers'
          ? gain
          : kind === 'production'
            ? produced.reduce((n, c) => n + c.amount, 0)
            : kind === 'trade'
              ? 1
              : 0;
    if (kind === 'workers') {
      to = 'waiting:' + p.id;
      highlights.splice(0, highlights.length, to);
    }
    if (kind === 'production') {
      from = highlights[0] ?? 'waiting:' + p.id;
      to = 'dock:' + p.id;
    }
    let loaded = 0;
    if (kind === 'shipping') {
      const stock = old.goods[a.good!] ?? 0;
      const ship =
        a.target?.kind === 'ship' ? before.ships[a.target.shipIndex!] : null;
      loaded = ship ? Math.min(stock, ship.capacity - ship.count) : stock;
      count = loaded;
      from = 'stock:' + p.id;
      to = 'dock:' + p.id;
      detail =
        'Przekazuje ' + loaded + ' × ' + GOOD_NAMES[a.good!] + ' do portu.';
    }
    if (kind === 'trade') {
      from = 'stock:' + p.id;
      to = 'dock:' + p.id;
      detail = 'Wysyła towar na targowisko.';
    }
    if (kind === 'corsair') {
      to =
        a.type === 'CORSAIR_RAID'
          ? 'magistrate'
          : a.type === 'CORSAIR_PLUNDER'
            ? 'trade'
            : a.type === 'CORSAIR_PIRACY'
              ? 'ship:' + a.shipIndex
              : 'corsair';
    }
    const beat = make(p, true, {
      kind,
      title,
      detail,
      sprite:
        added[0]?.sprite ??
        (kind === 'worker'
          ? 'magistrate'
          : (a.good ?? roleArt[role] ?? 'supplies')),
      changes: ledger,
      highlights,
      from,
      to,
      token,
      count,
      tokens:
        kind === 'production'
          ? produced.map((c) => ({ sprite: c.icon, count: c.amount }))
          : kind === 'workers'
            ? ledger
                .filter(
                  (c) =>
                    (c.icon === 'worker' || c.icon === 'noble') && c.amount > 0,
                )
                .map((c) => ({ sprite: c.icon + '0', count: c.amount }))
            : [],
      focus: kind === 'corsair' || kind === 'workers' ? to : p.id,
      duration:
        kind === 'pass'
          ? 1800
          : kind === 'build' || kind === 'production'
            ? 3800
            : 3200,
    });
    if (a.type === 'SELL_PLANTATION' && a.slotIndex !== undefined)
      beat.highlights.push(p.id + ':plantation:' + a.slotIndex);
    if (kind === 'shipping' || kind === 'trade') {
      staged = {
        ...staged,
        ships: after.ships,
        trade: after.trade,
        lastShipLoad: after.lastShipLoad,
      };
      const shipIndex =
        a.target?.kind === 'ship' ? a.target.shipIndex : undefined;
      const loadedShip =
        shipIndex === undefined ? null : before.ships[shipIndex]!;
      if (loadedShip && shipIndex !== undefined) {
        staged = {
          ...staged,
          ships: staged.ships.map((ship, i) =>
            i === shipIndex
              ? {
                  ...loadedShip,
                  good: a.good!,
                  count: loadedShip.count + loaded,
                }
              : ship,
          ),
        };
      }
      const dest =
        kind === 'trade'
          ? 'trade'
          : a.target?.kind === 'ship'
            ? 'ship:' + a.target.shipIndex
            : p.id + ':building:' + a.target?.kind;
      make(p, false, {
        kind,
        title:
          kind === 'trade' ? 'Sprzedaż na targowisku' : 'Załadunek w porcie',
        detail:
          kind === 'trade'
            ? GOOD_NAMES[a.good!] + ' · transakcja zakończona.'
            : loaded +
              ' × ' +
              GOOD_NAMES[a.good!] +
              ' → ' +
              (a.target?.kind === 'ship'
                ? 'Statek ' + (a.target.shipIndex! + 1)
                : a.target?.kind === 'wharf'
                  ? 'Nabrzeże'
                  : 'Przystań'),
        sprite: kind === 'trade' ? 'market' : 'ship',
        focus: dest,
        from:
          kind === 'trade'
            ? 'port'
            : a.target?.kind === 'ship'
              ? 'pier'
              : 'dock:' + p.id,
        to: dest,
        highlights: [dest],
        token: a.good ?? '',
        count: kind === 'trade' ? 1 : loaded,
        changes: [],
        duration: 3600,
      });
      if (
        kind === 'shipping' &&
        loadedShip &&
        loadedShip.count + loaded === loadedShip.capacity
      ) {
        staged = {
          ...staged,
          ships: after.ships,
          lastShipLoad: after.lastShipLoad,
        };
        make(p, false, {
          kind: 'departure',
          title: 'Pełny statek wypływa',
          detail:
            'Ładownia: ' +
            loadedShip.capacity +
            '/' +
            loadedShip.capacity +
            ' · ' +
            GOOD_NAMES[a.good!],
          sprite: 'ship',
          focus: dest,
          from: dest,
          to: dest,
          highlights: [],
          duration: 5000,
        });
      }
    }
  }
  return beats;
}
