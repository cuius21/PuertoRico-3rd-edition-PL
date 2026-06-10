import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import { BuildAction } from '../../actions/BuildAction';
import { PassAction } from '../../actions/PassAction';
import { RoleSelectionPhase } from './RoleSelectionPhase';
import { RoundEndPhase } from './RoundEndPhase';
import type { Player } from '../../domain/Player';
import type { Building } from '../../domain/buildings/Building';

function czarnyRynekAvail(player: Player): number {
  let avail = 0;
  for (const cnt of player.storedGoods.values()) avail += cnt;
  avail += player.pendingWorkers;
  avail += player.victoryPointTokens;
  return Math.min(avail, 3);
}

function nextPhaseAfterRole(state: GameState): GamePhase {
  const takenCount = state.roleCards.filter(c => !c.isAvailable()).length;
  return takenCount >= state.players.length ? new RoundEndPhase() : new RoleSelectionPhase();
}

function calcCost(state: GameState, player: Player, building: Building): number {
  const isSelector = state.getRoleSelector().id === player.id;
  const activeBuildings = player.island.getActiveBuildings();
  const activeQuarries = player.island.countActiveQuarries();
  const hasSmithy = activeBuildings.some(b => b.id === 'smithy');
  const quarryCap = (building.priceGroup as number) + (hasSmithy ? 1 : 0);
  const quarryDiscount = Math.min(activeQuarries, quarryCap);
  const hasLibrary = isSelector && activeBuildings.some(b => b.doublesRolePrivilege?.());
  const builderDiscount = isSelector ? (hasLibrary ? 2 : 1) : 0;
  const forestDiscount = Math.floor(player.island.countForests() / 2);

  // Gildia murarska: robotnik → -1 na małe budynki (tileSize=1); szlachcic → -2 na duże (tileSize=2).
  let masonsDiscount = 0;
  for (const b of activeBuildings) {
    if (b.occupiedWorkers > 0 && b.builderWorkerDiscount && building.tileSize === 1) {
      masonsDiscount = Math.max(masonsDiscount, b.builderWorkerDiscount());
    }
    if (b.occupiedNobles > 0 && b.builderNobleDiscount && building.tileSize === 2) {
      masonsDiscount = Math.max(masonsDiscount, b.builderNobleDiscount());
    }
  }

  return Math.max(0, building.cost - quarryDiscount - builderDiscount - forestDiscount - masonsDiscount);
}

// Faza budowniczego: każdy gracz może zbudować jeden budynek (lub spasować).
// Budowniczy (selektor) ma przywilej -1 do kosztu.
export class BuilderPhase implements GamePhase {
  readonly type = PhaseType.Builder;
  private initialLogLength = 0;

  onEnter(state: GameState): void {
    this.initialLogLength = state.actionLog.length;
    state.currentPlayerIndex = state.roleSelectorIndex;
  }

  onExit(_state: GameState): void {}

  getValidActions(state: GameState, playerId: PlayerId): Action[] {
    if (state.getCurrentPlayer().id !== playerId) return [];
    const player = state.getPlayer(playerId)!;
    const actions: Action[] = [];

    const hasBlackMarket = player.island.getActiveBuildings().some(b => b.id === 'blackMarket');
    const blackMarketAvail = hasBlackMarket ? czarnyRynekAvail(player) : 0;

    for (const building of state.supply.availableBuildings) {
      if (player.island.hasBuildingOfType(building.id)) continue;
      if (player.island.getFreeUrbanSlotCount() < building.tileSize) continue;
      const cost = calcCost(state, player, building);
      if (player.doubloons >= cost) {
        actions.push(new BuildAction(playerId, building.id));
      } else if (hasBlackMarket) {
        const shortfall = cost - player.doubloons;
        if (shortfall <= 3 && blackMarketAvail >= shortfall) {
          actions.push(new BuildAction(playerId, building.id));
        }
      }
    }

    actions.push(new PassAction(playerId));
    return actions;
  }

  checkTransition(state: GameState): GamePhase | null {
    const actionsInPhase = state.actionLog.length - this.initialLogLength;
    if (actionsInPhase >= state.players.length) {
      return nextPhaseAfterRole(state);
    }
    return null;
  }
}
