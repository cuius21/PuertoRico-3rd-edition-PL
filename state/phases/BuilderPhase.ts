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

function nextPhaseAfterRole(state: GameState): GamePhase {
  const takenCount = state.roleCards.filter(c => !c.isAvailable()).length;
  return takenCount >= state.players.length ? new RoundEndPhase() : new RoleSelectionPhase();
}

function calcCost(state: GameState, player: Player, building: Building): number {
  const isSelector = state.getRoleSelector().id === player.id;
  const activeQuarries = player.island.countActiveQuarries();
  const hasSmithy = player.island.getActiveBuildings().some(b => b.id === 'smithy');
  const quarryCap = (building.priceGroup as number) + (hasSmithy ? 1 : 0);
  const quarryDiscount = Math.min(activeQuarries, quarryCap);
  return Math.max(0, building.cost - quarryDiscount - (isSelector ? 1 : 0));
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

    for (const building of state.supply.availableBuildings) {
      if (player.island.hasBuildingOfType(building.id)) continue;
      if (player.island.getFreeUrbanSlotCount() < building.tileSize) continue;
      const cost = calcCost(state, player, building);
      if (player.doubloons >= cost) {
        actions.push(new BuildAction(playerId, building.id));
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
