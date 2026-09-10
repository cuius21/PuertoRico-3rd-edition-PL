import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase, PhaseProgress } from '../GamePhase';
import { BuildAction, calcBuildCost } from '../../actions/BuildAction';
import { PassAction } from '../../actions/PassAction';
import { RoleSelectionPhase } from './RoleSelectionPhase';
import { RoundEndPhase } from './RoundEndPhase';
import type { Player } from '../../domain/Player';

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


// Faza budowniczego: każdy gracz może zbudować jeden budynek (lub spasować).
// Budowniczy (selektor) ma przywilej -1 do kosztu.
export class BuilderPhase implements GamePhase {
  readonly type = PhaseType.Builder;
  private initialLogLength = 0;

  getProgress(state: GameState): PhaseProgress {
    return { actionsTaken: state.actionLog.length - this.initialLogLength };
  }

  restoreProgress(state: GameState, progress: PhaseProgress): void {
    this.initialLogLength = state.actionLog.length - (progress.actionsTaken ?? 0);
  }

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
      const cost = calcBuildCost(state, player, building);
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
