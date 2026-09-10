import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Action } from '../../../actions/Action';
import { calcBuildCost } from '../../../actions/BuildAction';
import type { GameState } from '../../../state/GameState';
import type { GameEvent, PlayerSetup } from '../../game/GameRunner';
import { describeAction } from '../../game/actionLabels';
import { BUILDING_DESCRIPTIONS } from '../../game/buildingDescriptions';
import { GameValue, ValueText } from './GameValue';
import { AmbientAudio } from './AmbientAudio';
import { RoleDeck, RoleInfo } from './RoleDeck';
import { TradeLegend, ShippingLegend } from './TradeLegend';
import type { RoleType } from '../../../core/types';
import { ROLE_META } from '../../components/RoleCardsBar';
import { WorldDialog } from './WorldDialog';
import { FestivalBoardPanel } from '../../components/FestivalBoardPanel';
import { WorldViewport } from './WorldViewport';
import { buildSceneSnapshot, GOOD_NAMES } from '../adapter/buildSceneSnapshot';
import type { Area, EntityRef } from '../adapter/sceneTypes';
import {
  actionKey,
  actionsForTarget,
  resolveCurrentAction,
} from '../interaction/actionBridge';
import {
  plantationTiles,
  plantationGuide,
} from '../interaction/plantationChoices';
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
  market: 'Budynki',
  trade: 'Targowisko',
  plantations: 'Plantacje',
  port: 'Port San Juan',
  festival: 'Festyn w San Juan',
  magistrate: 'Magistrat',
  corsair: 'Korsarz',
  island: 'Wyspa gracza',
  supplies: 'Wspólne zapasy',
  scenery: 'Życie na wyspach',
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
  const [showActions, setShowActions] = useState(false);
  const [roleInfo, setRoleInfo] = useState<RoleType | null>(null);
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
  const catalogGroups = [...new Set(catalog.map((b) => b.cost))].map(
    (cost) => ({
      cost,
      buildings: catalog.filter((b) => b.cost === cost),
    }),
  );
  const nearby = selected
    ? actionsForTarget(unique, selected).filter(
        (a) => selected.key !== 'market' || a.type !== 'BUILD',
      )
    : [];
  const current = state.getCurrentPlayer();
  const canAct = !waiting && runner.isCurrentPlayerHuman();
  const guidePlantations = plantationGuide(scene.phase, unique, canAct);
  const guideTurn = guidePlantations
    ? 'settler:' + scene.round + ':' + current.id
    : canAct && scene.phase === 'mayor'
      ? 'mayor:' + scene.round + ':' + current.id
      : '';
  useEffect(() => {
    if (guideTurn) {
      setFocus((p) => ({
        id: guideTurn.startsWith('mayor:') ? current.id : 'central',
        sequence: p.sequence + 1,
      }));
      setSelected(null);
    }
  }, [guideTurn]);
  const crops = plantationTiles(state, unique);
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
    setSelected(null);
    setShowActions(false);
    setRoleInfo(null);
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
        disabled={waiting || !runner.isCurrentPlayerHuman()}
        onClick={() => act(actionKey(a))}
      >
        <ValueText text={label(a)} />
        <span aria-hidden="true">›</span>
      </button>
    ));
  }
  const tabs: Area[] = [
    'market',
    'trade',
    'plantations',
    'port',
    'magistrate',
    'supplies',
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
          <AmbientAudio />
          <button
            aria-pressed={motion}
            onClick={() => {
              const next = !motion;
              setMotion(next);
              try {
                localStorage.setItem('puerto-ui-motion', next ? 'on' : 'off');
              } catch {}
            }}
            title="Fale, pogoda, wiatr i ruch mieszkańców"
          >
            {motion ? '≈ Animacje: wł.' : '≈ Animacje: wył.'}
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
              <b>
                <GameValue value={p.coins} />
              </b>
              <small>
                <GameValue value={p.vp} kind="star" />
              </small>
              {p.pending + p.pendingNobles + p.held + p.heldNobles > 0 && (
                <small
                  className="pr-player-workers"
                  title="Pracownicy oczekujący na wyspie"
                >
                  👤 {p.pending + p.pendingNobles + p.held + p.heldNobles}
                  {p.pending + p.pendingNobles > 0
                    ? ' do przydziału'
                    : ' w rezerwie'}
                </small>
              )}
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
                setSelected(null);
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
            guide={guidePlantations && selected?.area !== 'plantations'}
          />
          {guidePlantations && (
            <button
              className="pr-next-step"
              onClick={() => area('plantations')}
            >
              <span aria-hidden="true">➜</span> Kliknij plantacje na wyspie San
              Juan i wybierz surowiec
            </button>
          )}
          <div className="pr-live" aria-live="polite">
            {notice ? (
              <strong>{notice}</strong>
            ) : feed ? (
              <>
                <b>{feed.playerName}</b>
                <span>
                  <ValueText text={feed.actionText} />
                </span>
              </>
            ) : (
              <>
                <b>Witaj na wyspach</b>
                <span>Kliknij obiekt na wyspie, aby otworzyć jego okno.</span>
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
      </div>

      {selected && (
        <WorldDialog
          title={
            building?.displayName ||
            selectedObject?.name ||
            selectedPlayer?.name ||
            AREAS[selected.area]
          }
          onClose={() => setSelected(null)}
          onBack={
            building && !ownedBuilding
              ? () => choose({ key: 'market', area: 'market' })
              : selectedObject && selectedPlayer
                ? () =>
                    choose({
                      key: selectedPlayer.id,
                      area: 'island',
                      playerId: selectedPlayer.id,
                    })
                : undefined
          }
        >
          {stale && (
            <p role="status" className="pr-error">
              {stale}
            </p>
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
                    <GameValue
                      value={ownedBuilding ? building.cost : price(building)}
                    />
                  </strong>
                </span>
                <span>
                  Punkty
                  <strong>
                    <GameValue value={building.victoryPoints} kind="star" />
                  </strong>
                </span>
                <span>
                  Wielkość<strong>{building.tileSize} pola</strong>
                </span>
                <span>
                  Załoga<strong>{building.workerCapacity}</strong>
                </span>
              </div>
              <p className="pr-intro">
                <ValueText text={BUILDING_DESCRIPTIONS[building.id] || ''} />
              </p>
            </>
          )}
          {selectedObject && !building && (
            <div className="pr-feature-art">
              <Art id={selectedObject.sprite} large />
            </div>
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
                  Dublony
                  <strong>
                    <GameValue value={selectedPlayer.coins} />
                  </strong>
                </span>
                <span>
                  Żetony punktów
                  <strong>
                    <GameValue value={selectedPlayer.vp} kind="star" />
                  </strong>
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
          {selected?.area === 'trade' && (
            <div className="pr-trading-house">
              <div className="pr-trade-heading">
                <span className="pr-wood-sign" aria-hidden="true">
                  TARGOWISKO
                </span>
                <p>
                  <strong>
                    {scene.trade.filter(Boolean).length} / {scene.trade.length}
                  </strong>{' '}
                  zajętych miejsc
                </p>
              </div>
              <TradeLegend />
              <div
                className="pr-trade"
                aria-label="Towary na targowisku"
                aria-live="polite"
              >
                {scene.trade.map((good, i) => (
                  <span key={i} className={good ? 'is-occupied' : ''}>
                    <small>Miejsce {i + 1}</small>
                    {good ? (
                      <>
                        <Art id={good} /> <strong>{GOOD_NAMES[good]}</strong>
                      </>
                    ) : (
                      <>
                        <span className="pr-empty-crate" aria-hidden="true">
                          ◇
                        </span>
                        <strong>Wolne</strong>
                      </>
                    )}
                  </span>
                ))}
              </div>
              <p className="pr-muted">
                Pełne targowisko opróżnia się po zakończeniu fazy Kupca.
              </p>
            </div>
          )}
          {selected?.area === 'market' && !building && (
            <>
              <p className="pr-catalog-intro">
                Budynki według ceny bazowej · {catalog.length} rodzajów
                {scene.phase === 'builder' && (
                  <span>
                    Ceny ofert uwzględniają zniżki gracza {current.name}.
                  </span>
                )}
              </p>
              <div className="pr-price-groups">
                {catalogGroups.map(({ cost, buildings }) => (
                  <section
                    className="pr-price-group"
                    key={cost}
                    aria-label={'Cena bazowa w dublonach: ' + cost}
                  >
                    <h3 className="pr-price-heading">
                      <GameValue value={cost} />
                      <small>CENA BAZOWA</small>
                    </h3>
                    <div className="pr-offers">
                      {buildings.map((b) => (
                        <button
                          className="pr-offer"
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
                          <span className="pr-offer-info">
                            <strong>{b.displayName}</strong>
                            <span className="pr-offer-facts">
                              <GameValue value={b.victoryPoints} kind="star" />
                              <small>
                                Dostępne: {buildingCounts.get(b.id)}
                              </small>
                            </span>
                            <span className="pr-offer-price">
                              {price(b) < b.cost && <small>Po zniżce</small>}
                              <GameValue value={price(b)} />
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
          {selected?.area === 'plantations' && (
            <div className="pr-crop-choices" aria-label="Wybór plantacji">
              {crops.map((tile) => (
                <button
                  key={tile.key}
                  disabled={!canAct || !tile.action}
                  className="pr-crop-choice"
                  onClick={() => tile.action && act(actionKey(tile.action))}
                  aria-label={tile.name + ' · ' + tile.detail}
                >
                  <Art id={tile.sprite} large />
                  <strong>{tile.name}</strong>
                  <small>{tile.detail}</small>
                  {!tile.action && (
                    <span className="pr-crop-unavailable">
                      Niedostępne w tej turze
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {selected?.area === 'port' && (
            <>
              <ShippingLegend />
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
            </>
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
          {!!nearby.length && selected.area !== 'plantations' && (
            <div className="pr-nearby">{actionButtons(nearby)}</div>
          )}

          {selected.area === 'supplies' && (
            <div className="pr-supplies">
              {' '}
              <p>
                Bank: <GameValue value={scene.bank} /> · Pula punktów:{' '}
                <GameValue value={scene.vpPool} kind="star" />
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
            </div>
          )}
          {selected.area === 'scenery' && (
            <div className="pr-role-description">
              <Art id="palm" large />
              <div>
                <h3>Wiatr, fale i mieszkańcy</h3>
                <p className="pr-intro">
                  Palmy kołyszą się na wietrze, statki tańczą na falach, a
                  mieszkańcy spacerują drogami pomiędzy zabudowaniami.
                </p>
                <p className="pr-intro">
                  Spacerowicze to ozdoba wyspy. Liczbę przydzielonych robotników
                  pokazują znaczniki przy budynkach i plantacjach. Animacje
                  możesz wyłączyć przyciskiem „Animacje” u góry ekranu.
                </p>
              </div>
            </div>
          )}
          {!nearby.length &&
            selected.area !== 'scenery' &&
            selected.area !== 'plantations' && (
              <p className="pr-muted">
                Dostępne ruchy zależą od aktualnej postaci i gracza, którego
                trwa tura.
              </p>
            )}
        </WorldDialog>
      )}
      <section className="pr-moves pr-commandbar" aria-label="Dostępne ruchy">
        <div>
          <span className="pr-eyebrow">
            {waiting ? 'RUCH PRZECIWNIKA' : 'TWOJA TURA'}
          </span>
          <h2>
            {waiting
              ? current.name + ' myśli…'
              : PHASES[scene.phase] || scene.phase}
          </h2>
        </div>
        <div className="pr-command-content">
          {stale && !selected && <p role="status">{stale}</p>}
          {scene.phase === 'roleSelection' ? (
            <p className="pr-intro">
              Kliknij przycisk „Akcje” w prawym dolnym rogu, aby wybrać postać.
              Pytajnik na karcie pokazuje jej opis i przywilej.
            </p>
          ) : (
            <div className="pr-actions">
              {guidePlantations && (
                <button
                  className="pr-action"
                  onClick={() => area('plantations')}
                >
                  Wybierz plantację w San Juan <span>›</span>
                </button>
              )}
              {scene.phase === 'builder' && (
                <button className="pr-action" onClick={() => area('market')}>
                  Otwórz budynki w San Juan <span>›</span>
                </button>
              )}
              {actionButtons(
                unique.filter(
                  (a) =>
                    a.type !== 'SELECT_ROLE' &&
                    a.type !== 'BUILD' &&
                    a.type !== 'TAKE_PLANTATION',
                ),
              )}
            </div>
          )}
        </div>
      </section>
      <div className="pr-action-launcher">
        <span className="pr-action-context">
          {canAct && scene.phase === 'roleSelection'
            ? 'Wybierz postać'
            : PHASES[scene.phase] || scene.phase}
        </span>
        <button
          className={
            'pr-action-fab' +
            (canAct && scene.phase === 'roleSelection' ? ' needs-choice' : '')
          }
          aria-label="Akcje"
          aria-haspopup="dialog"
          aria-expanded={showActions}
          aria-controls="pr-actions-dialog"
          onClick={() => {
            setSelected(null);
            setRoleInfo(null);
            setShowActions(true);
          }}
        >
          <svg viewBox="0 0 48 36" aria-hidden="true" focusable="false">
            <rect
              x="5"
              y="8"
              width="20"
              height="26"
              rx="4"
              transform="rotate(-18 15 21)"
              fill="#c58d43"
              stroke="#fff0b7"
              strokeWidth="1.5"
            />
            <rect
              x="24"
              y="8"
              width="20"
              height="26"
              rx="4"
              transform="rotate(18 34 21)"
              fill="#d8aa57"
              stroke="#fff0b7"
              strokeWidth="1.5"
            />
            <rect
              x="14"
              y="2"
              width="20"
              height="28"
              rx="4"
              fill="#fff0bd"
              stroke="#9b6d31"
              strokeWidth="1.5"
            />
            <path
              d="m24 8 2 5 5 1-4 3 1 5-4-2-4 2 1-5-4-3 5-1Z"
              fill="#b07b31"
            />
          </svg>
          <strong>Akcje</strong>
          {scene.phase === 'mayor' &&
            current.pendingWorkers + current.pendingNobles > 0 && (
              <span
                className="pr-fab-workers"
                aria-label={
                  'Do przydzielenia: ' +
                  (current.pendingWorkers + current.pendingNobles)
                }
              >
                <span aria-hidden="true">👤</span>
                {current.pendingWorkers + current.pendingNobles}
              </span>
            )}
        </button>
      </div>
      {showActions && (
        <WorldDialog
          id="pr-actions-dialog"
          className="pr-dialog--actions"
          title={roleInfo ? ROLE_META[roleInfo].label : 'Akcje'}
          eyebrow={
            roleInfo
              ? 'KARTA POSTACI'
              : current.name + ' · ' + (PHASES[scene.phase] || scene.phase)
          }
          onClose={() => {
            setShowActions(false);
            setRoleInfo(null);
          }}
          onBack={roleInfo ? () => setRoleInfo(null) : undefined}
        >
          {roleInfo ? (
            <RoleInfo role={roleInfo} />
          ) : (
            <>
              {stale && (
                <p role="status" className="pr-error">
                  {stale}
                </p>
              )}
              <RoleDeck
                state={state}
                actions={unique}
                waiting={!canAct}
                onChoose={act}
                onInfo={setRoleInfo}
              />
              <p className="pr-muted">
                {scene.phase === 'roleSelection' && canAct
                  ? 'Wybierz kartę, aby rozpocząć jej akcję.'
                  : 'Podświetlona karta wskazuje aktualną postać.'}{' '}
                Pytajnik otwiera opis.
              </p>
            </>
          )}
        </WorldDialog>
      )}
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
                  <ValueText text={entry.actionText} />
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
