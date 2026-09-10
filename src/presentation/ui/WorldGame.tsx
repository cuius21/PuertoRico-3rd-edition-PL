import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Action } from '../../../actions/Action';
import { calcBuildCost } from '../../../actions/BuildAction';
import type { GameState } from '../../../state/GameState';
import type { GameEvent, PlayerSetup } from '../../game/GameRunner';
import { describeAction } from '../../game/actionLabels';
import { BUILDING_DESCRIPTIONS } from '../../game/buildingDescriptions';
import { RoleCardsBar } from '../../components/RoleCardsBar';
import { FestivalBoardPanel } from '../../components/FestivalBoardPanel';
import { WorldViewport } from './WorldViewport';
import { buildSceneSnapshot, GOOD_NAMES } from '../adapter/buildSceneSnapshot';
import type { Area, EntityRef } from '../adapter/sceneTypes';
import {
  actionKey,
  actionsForTarget,
  resolveCurrentAction,
} from '../interaction/actionBridge';
import { spriteStyle } from '../assets/registry';
import './world.css';

interface Runner {
  getValidActionsForCurrentPlayer(): Action[];
  isCurrentPlayerHuman(): boolean;
  getSetup(index: number): PlayerSetup;
  log: GameEvent[];
}
interface Props {
  state: GameState;
  runner: Runner;
  onAction: (action: Action) => void;
  waiting: boolean;
  onMenu: () => void;
  onSave?: () => void;
  saveFlash?: boolean;
  notice?: string | null;
  feed?: GameEvent | null;
  error?: ReactNode;
  connection?: string;
}
const PHASES: Record<string, string> = {
  roleSelection: 'Wybór postaci',
  settler: 'Plantator',
  mayor: 'Burmistrz',
  builder: 'Budowniczy',
  craftsman: 'Zarządca',
  trader: 'Kupiec',
  captain: 'Kapitan',
  prospector: 'Poszukiwacz',
  corsair: 'Korsarz',
  roundEnd: 'Koniec rundy',
  gameOver: 'Koniec gry',
};
const AREAS: Record<Area, string> = {
  market: 'Budynki i targ',
  plantations: 'Plantacje',
  port: 'Port San Juan',
  festival: 'Festyn w San Juan',
  magistrate: 'Magistrat',
  corsair: 'Korsarz',
  island: 'Wyspa gracza',
};
const GOODS = ['corn', 'indigo', 'sugar', 'tobacco', 'coffee'];
function Art({ id, large = false }: { id: string; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={'pr-art' + (large ? ' pr-art--large' : '')}
      style={spriteStyle(id)}
    />
  );
}
function readMotion() {
  try {
    const saved = localStorage.getItem('puerto-ui-motion');
    return saved === null
      ? !matchMedia('(prefers-reduced-motion: reduce)').matches
      : saved === 'on';
  } catch {
    return false;
  }
}
export function WorldGame({
  state,
  runner,
  onAction,
  waiting,
  onMenu,
  onSave,
  saveFlash,
  notice,
  feed,
  error,
  connection,
}: Props) {
  const [selected, setSelected] = useState<EntityRef | null>(null),
    [showLog, setShowLog] = useState(false),
    [motion, setMotion] = useState(readMotion);
  const [focus, setFocus] = useState({ id: 'central', sequence: 0 });
  const [stale, setStale] = useState('');
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, []);
  // GameState is mutable: build on every React update, never memoize by object identity.
  const actions = runner.getValidActionsForCurrentPlayer();
  const unique = [...new Map(actions.map((a) => [actionKey(a), a])).values()];
  const scene = buildSceneSnapshot(state, waiting ? [] : unique);
  const selectedPlayer = scene.players.find((p) => p.id === selected?.playerId);
  const selectedObject = selectedPlayer?.objects.find(
    (o) => o.key === selected?.key,
  );
  const ownedBuilding =
    selected?.buildingId && selectedPlayer
      ? state.players
          .find((p) => p.id === selectedPlayer.id)
          ?.island.getBuildings()
          .find((b) => b.id === selected.buildingId)
      : null;
  const marketId = selected?.key.startsWith('market:')
    ? selected.key.slice(7)
    : null;
  const building =
    ownedBuilding ||
    state.supply.availableBuildings.find((b) => b.id === marketId);
  const buildingCounts = new Map<string, number>();
  state.supply.availableBuildings.forEach((b) =>
    buildingCounts.set(b.id, (buildingCounts.get(b.id) || 0) + 1),
  );
  const catalog = [
    ...new Map(state.supply.availableBuildings.map((b) => [b.id, b])).values(),
  ].sort((a, b) => a.cost - b.cost);
  const nearby = selected ? actionsForTarget(unique, selected) : [];
  const current = state.getCurrentPlayer();
  const price = (b: (typeof catalog)[number]) =>
    scene.phase === 'builder' ? calcBuildCost(state, current, b) : b.cost;
  const humanIndex = state.players.findIndex(
    (_, i) => runner.getSetup(i).type === 'human',
  );
  const homeId =
    state.players[humanIndex < 0 ? state.currentPlayerIndex : humanIndex]!.id;
  function go(id: string) {
    setFocus((p) => ({ id, sequence: p.sequence + 1 }));
  }
  function choose(ref: EntityRef) {
    setSelected(ref);
    setStale('');
  }
  function area(area: Area) {
    choose({ key: area, area });
    go('central');
  }
  function act(key: string) {
    if (waiting || !runner.isCurrentPlayerHuman()) return;
    const live = resolveCurrentAction(
      key,
      runner.getValidActionsForCurrentPlayer(),
    );
    if (!live) {
      setStale('Sytuacja się zmieniła. Wybierz aktualny ruch.');
      return;
    }
    setStale('');
    onAction(live);
  }
  function label(action: Action) {
    const a = action as unknown as {
      type: string;
      playerId: string;
      target?: { kind: string; slotIndex?: number };
      choice?: { index?: number };
      slotIndex?: number;
      goods?: string[];
      cardIndex?: number;
    };
    const base = describeAction(action, state);
    if (a.type === 'PLACE_WORKER' && a.target?.kind === 'plantation')
      return base + ' · pole ' + ((a.target.slotIndex ?? 0) + 1);
    if (a.type === 'TAKE_PLANTATION' && a.choice?.index !== undefined)
      return base + ' · nr ' + (a.choice.index + 1);
    if (a.type === 'SELL_PLANTATION' && a.slotIndex !== undefined) {
      const p = state.getPlayer(a.playerId)?.island.getPlantationSlots()[
        a.slotIndex
      ];
      return (
        base +
        ' · ' +
        (p?.isForest ? 'Las' : p ? GOOD_NAMES[p.type] : '') +
        ' · pole ' +
        (a.slotIndex + 1)
      );
    }
    if (a.type === 'TREASURY')
      return (
        base + ' · ' + (a.goods ?? []).map((g) => GOOD_NAMES[g]).join(', ')
      );
    if (
      a.type === 'SELECT_ROLE' &&
      base.includes('Poszukiwacz') &&
      a.cardIndex !== undefined
    )
      return base + ' · karta ' + (a.cardIndex + 1);
    return base;
  }
  function actionButtons(list: Action[]) {
    return list.map((a) => (
      <button
        key={actionKey(a)}
        className={
          'pr-action' + (a.type.includes('PASS') ? ' pr-action--pass' : '')
        }
        disabled={waiting}
        onClick={() => act(actionKey(a))}
      >
        {label(a)}
        <span aria-hidden="true">›</span>
      </button>
    ));
  }
  const tabs: Area[] = [
    'market',
    'plantations',
    'port',
    'magistrate',
    ...(scene.festival ? ['festival' as const] : []),
    ...(scene.corsair ? ['corsair' as const] : []),
  ];
  return (
    <main className="pr-world">
      <header className="pr-header">
        <div className="pr-brand">
          <span className="pr-brand-mark">PR</span>
          <div>
            <h1>Puerto Rico</h1>
            <span>TRZECIA EDYCJA · ARCHIPELAG</span>
          </div>
        </div>
        <div className="pr-turn">
          <span>RUNDA {scene.round}</span>
          <strong>{PHASES[scene.phase] || scene.phase}</strong>
          <small>
            {current.name}
            {waiting ? ' · bot myśli…' : ' · tura'}
            {connection ? ' · ' + connection : ''}
          </small>
        </div>
        <nav className="pr-tools" aria-label="Ustawienia gry">
          <button
            aria-pressed={motion}
            onClick={() => {
              const next = !motion;
              setMotion(next);
              try {
                localStorage.setItem('puerto-ui-motion', next ? 'on' : 'off');
              } catch {}
            }}
            title="Fale, wiatr i ruch mieszkańców"
          >
            {motion ? '≈ Animacje' : '≈ Spokój'}
          </button>
          {onSave && (
            <button onClick={onSave}>
              {saveFlash ? '✓ Zapisano' : 'Zapisz'}
            </button>
          )}
          <button onClick={() => setShowLog(true)}>Historia</button>
          <button onClick={onMenu}>Menu</button>
        </nav>
      </header>
      {error && (
        <div className="pr-error" role="alert">
          {error}
        </div>
      )}
      <div className="pr-role-strip">
        <RoleCardsBar state={state} />
      </div>
      <nav className="pr-players" aria-label="Wyspy graczy">
        {scene.players.map((p, i) => (
          <button
            key={p.id}
            className={p.current ? 'is-current' : ''}
            style={{ '--player-color': p.color } as CSSProperties}
            onClick={() => {
              choose({ key: p.id, area: 'island', playerId: p.id });
              go(p.id);
            }}
          >
            <span className="pr-avatar">{i + 1}</span>
            <span className="pr-player-name">
              <strong>{p.name}</strong>
              <small>
                {p.governor ? 'Gubernator · ' : ''}
                {i === state.roleSelectorIndex &&
                scene.phase !== 'roleSelection'
                  ? 'Przywilej · '
                  : ''}
                {runner.getSetup(i).type === 'human' ? 'Gracz' : 'Bot'}
              </small>
            </span>
            <span className="pr-player-values">
              <b>{p.coins} D</b>
              <small>{p.vp} PZ</small>
            </span>
          </button>
        ))}
      </nav>
      <div className="pr-layout">
        <section className="pr-explore" aria-label="Mapa wysp">
          <div className="pr-map-nav">
            <button
              className={focus.id === 'central' ? 'is-active' : ''}
              onClick={() => {
                go('central');
                setSelected(null);
              }}
            >
              San Juan
            </button>
            <button
              onClick={() => {
                go(homeId);
                choose({ key: homeId, area: 'island', playerId: homeId });
              }}
            >
              Moja wyspa
            </button>
            <button
              className={focus.id === 'all' ? 'is-active' : ''}
              onClick={() => go('all')}
            >
              Cały archipelag
            </button>
          </div>
          <WorldViewport
            scene={scene}
            onPick={choose}
            motion={motion}
            selected={selected?.key ?? null}
            focus={focus}
          />
          <div className="pr-live" aria-live="polite">
            {notice ? (
              <strong>{notice}</strong>
            ) : feed ? (
              <>
                <b>{feed.playerName}</b>
                <span>{feed.actionText}</span>
              </>
            ) : (
              <>
                <b>Witaj na wyspach</b>
                <span>Kliknij miejsce na mapie lub wybierz ruch w panelu.</span>
              </>
            )}
          </div>
          <nav
            className="pr-destinations"
            aria-label="Miejsca na wspólnej wyspie"
          >
            {tabs.map((tab) => (
              <button
                className={selected?.area === tab ? 'is-active' : ''}
                key={tab}
                onClick={() => area(tab)}
              >
                {AREAS[tab]}
              </button>
            ))}
          </nav>
        </section>
        <aside className="pr-sidebar">
          <section className="pr-moves">
            <div className="pr-eyebrow">
              {waiting ? 'RUCH PRZECIWNIKA' : 'DOSTĘPNE RUCHY'}
            </div>
            <h2>
              {waiting
                ? current.name + ' myśli…'
                : PHASES[scene.phase] || scene.phase}
            </h2>
            {stale && <p role="status">{stale}</p>}
            <div className="pr-actions">{actionButtons(unique)}</div>
            {!unique.length && !waiting && (
              <p className="pr-muted">Oczekiwanie na kolejną fazę.</p>
            )}
          </section>
          <section className="pr-inspector">
            <div className="pr-section-title">
              <div>
                <span className="pr-eyebrow">ODKRYWAJ WYSPY</span>
                <h2>
                  {building?.displayName ||
                    selectedObject?.name ||
                    selectedPlayer?.name ||
                    (selected ? AREAS[selected.area] : 'San Juan')}
                </h2>
              </div>
              {selected && (
                <button
                  aria-label="Zamknij szczegóły"
                  onClick={() => setSelected(null)}
                >
                  ×
                </button>
              )}
            </div>
            {!selected && (
              <>
                <p className="pr-intro">
                  Serce archipelagu. Odwiedź targ, rozbuduj miasto i wypraw
                  swoje towary w morze.
                </p>
                <div className="pr-feature-art">
                  <Art id="market" large />
                </div>
                <div className="pr-stat-grid">
                  <span>
                    Bank<strong>{scene.bank} D</strong>
                  </span>
                  <span>
                    Pula punktów<strong>{scene.vpPool} PZ</strong>
                  </span>
                </div>
              </>
            )}
            {building && (
              <>
                <div className="pr-feature-art">
                  <Art id={building.id} large />
                </div>
                <div className="pr-stat-grid">
                  <span>
                    {ownedBuilding || scene.phase !== 'builder'
                      ? 'Koszt bazowy'
                      : 'Cena dla ' + current.name}
                    <strong>
                      {ownedBuilding ? building.cost : price(building)} D
                    </strong>
                  </span>
                  <span>
                    Punkty<strong>{building.victoryPoints} PZ</strong>
                  </span>
                  <span>
                    Wielkość<strong>{building.tileSize} pola</strong>
                  </span>
                  <span>
                    Załoga<strong>{building.workerCapacity}</strong>
                  </span>
                </div>
                <p className="pr-intro">{BUILDING_DESCRIPTIONS[building.id]}</p>
              </>
            )}
            {selectedObject && (
              <p className="pr-intro">
                Obsada: {selectedObject.workers} robotników
                {scene.nobles
                  ? ' + ' + selectedObject.nobles + ' szlachciców'
                  : ''}{' '}
                / {selectedObject.capacity} miejsc.
              </p>
            )}
            {selectedPlayer && !selectedObject && (
              <>
                <div className="pr-stat-grid">
                  <span>
                    Dublony<strong>{selectedPlayer.coins} D</strong>
                  </span>
                  <span>
                    Żetony punktów<strong>{selectedPlayer.vp} PZ</strong>
                  </span>
                  <span>
                    Plantacje<strong>{selectedPlayer.ruralUsed}/12</strong>
                  </span>
                  <span>
                    Miasto<strong>{selectedPlayer.urbanUsed}/12</strong>
                  </span>
                </div>
                <p className="pr-muted">
                  Do rozstawienia: {selectedPlayer.pending} robotników
                  {scene.nobles
                    ? ' i ' + selectedPlayer.pendingNobles + ' szlachciców'
                    : ''}
                  . W rezerwie: {selectedPlayer.held}
                  {scene.nobles
                    ? ' + ' + selectedPlayer.heldNobles + ' szlachciców'
                    : ''}
                  .
                </p>
                <div className="pr-goods">
                  {GOODS.map((g) => (
                    <span key={g} title={GOOD_NAMES[g]}>
                      <Art id={g} />
                      {selectedPlayer.goods[g] || 0}
                    </span>
                  ))}
                </div>
                <div className="pr-catalog">
                  {selectedPlayer.objects.map((o) => (
                    <button key={o.key} onClick={() => choose(o.target)}>
                      <Art id={o.sprite} />
                      <span>
                        {o.name}
                        <small>
                          {o.workers + o.nobles}/{o.capacity} miejsc
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {selected?.area === 'market' && !building && (
              <>
                <h3>Targowisko</h3>
                <div className="pr-trade">
                  {Array.from({ length: 4 }, (_, i) => (
                    <span key={i}>
                      {scene.trade[i] ? (
                        <>
                          <Art id={scene.trade[i]!} />
                          {GOOD_NAMES[scene.trade[i]!]}
                        </>
                      ) : (
                        'Wolne'
                      )}
                    </span>
                  ))}
                </div>
                <h3>
                  Budynki do kupienia <small>{catalog.length} rodzajów</small>
                </h3>
                <div className="pr-catalog">
                  {catalog.map((b) => (
                    <button
                      key={b.id}
                      onClick={() =>
                        choose({
                          key: 'market:' + b.id,
                          area: 'market',
                          buildingId: b.id,
                        })
                      }
                    >
                      <Art id={b.id} />
                      <span>
                        {b.displayName}
                        <small>
                          {b.victoryPoints} PZ · dostępne{' '}
                          {buildingCounts.get(b.id)}
                        </small>
                      </span>
                      <b>{price(b)} D</b>
                    </button>
                  ))}
                </div>
              </>
            )}
            {selected?.area === 'plantations' && (
              <>
                <p className="pr-muted">
                  Odkryte plantacje oraz wspólna pula kamieniołomów.
                </p>
                <div className="pr-catalog">
                  {state.supply.revealedPlantations.map((p, i) => (
                    <div key={i}>
                      <Art id={p.type} />
                      <span>
                        {GOOD_NAMES[p.type]}
                        <small>Plantacja {i + 1}</small>
                      </span>
                    </div>
                  ))}
                  <div>
                    <Art id="quarry" />
                    <span>
                      Kamieniołomy
                      <small>{state.supply.quarryStack.length} w puli</small>
                    </span>
                  </div>
                </div>
              </>
            )}
            {selected?.area === 'port' && (
              <div className="pr-harbour">
                {scene.ships.map((s, i) => (
                  <button
                    className={selected.key === 'ship:' + i ? 'is-active' : ''}
                    key={i}
                    onClick={() =>
                      choose({ key: 'ship:' + i, area: 'port', shipIndex: i })
                    }
                  >
                    <Art id="ship" />
                    <span>
                      <strong>Statek {i + 1}</strong>
                      <small>
                        {s.good ? GOOD_NAMES[s.good] : 'Pusta ładownia'}
                      </small>
                      <progress value={s.count} max={s.capacity} />
                    </span>
                    <b>
                      {s.count}/{s.capacity}
                    </b>
                  </button>
                ))}
              </div>
            )}
            {selected?.area === 'magistrate' && (
              <>
                <div className="pr-feature-art">
                  <Art id="magistrate" large />
                </div>
                <div className="pr-stat-grid">
                  <span>
                    W magistracie<strong>{scene.magistrate}</strong>
                  </span>
                  <span>
                    Robotnicy w puli<strong>{scene.workersPool}</strong>
                  </span>
                  {scene.nobles && (
                    <>
                      <span>
                        Szlachta w magistracie
                        <strong>{scene.magistrateNobles}</strong>
                      </span>
                      <span>
                        Szlachta w puli<strong>{scene.noblesPool}</strong>
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
            {selected?.area === 'festival' && state.festivalBoard && (
              <FestivalBoardPanel
                board={state.festivalBoard}
                players={state.players}
              />
            )}
            {selected?.area === 'corsair' && (
              <>
                <div className="pr-feature-art">
                  <Art id="corsair" large />
                </div>
                <p className="pr-intro">
                  Wybierz postać Korsarza, aby wykonać piractwo, grabież, najazd
                  lub pojmanie. Dostępne akcje pojawią się poniżej.
                </p>
              </>
            )}
            {!!nearby.length && (
              <div className="pr-nearby">
                <h3>Ruchy w tym miejscu</h3>
                {actionButtons(nearby)}
              </div>
            )}
          </section>
          <details className="pr-reserves">
            <summary>Wspólne zapasy</summary>
            <p>
              Bank: {scene.bank} D · Pula punktów: {scene.vpPool} PZ
            </p>
            <p>
              Robotnicy: {scene.workersPool} w puli · {scene.magistrate} w
              magistracie
            </p>
            <div className="pr-goods">
              {[...state.supply.goodsPool].map(([g, n]) => (
                <span key={g} title={GOOD_NAMES[g]}>
                  <Art id={g} />
                  {n}
                </span>
              ))}
            </div>
          </details>
        </aside>
      </div>
      {showLog && (
        <div className="log-modal-overlay" onClick={() => setShowLog(false)}>
          <section
            className="log-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Historia akcji"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowLog(false);
            }}
          >
            <div className="log-modal__header">
              <h2>Historia akcji</h2>
              <button
                autoFocus
                onClick={() => setShowLog(false)}
                aria-label="Zamknij historię"
              >
                ×
              </button>
            </div>
            <div className="log-modal__entries">
              {[...runner.log].reverse().map((entry, i) => (
                <p key={i}>
                  <strong>{entry.playerName}: </strong>
                  {entry.actionText}
                </p>
              ))}
              {!runner.log.length && <p>Brak akcji.</p>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
