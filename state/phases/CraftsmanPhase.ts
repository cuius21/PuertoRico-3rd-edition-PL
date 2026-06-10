import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { GoodType, PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import { CraftsmanBonusAction } from '../../actions/CraftsmanBonusAction';
import { RoleSelectionPhase } from './RoleSelectionPhase';
import { RoundEndPhase } from './RoundEndPhase';

const GOOD_TYPES = [
  GoodType.Corn, GoodType.Indigo, GoodType.Sugar,
  GoodType.Tobacco, GoodType.Coffee,
] as const;

function nextPhaseAfterRole(state: GameState): GamePhase {
  const takenCount = state.roleCards.filter(c => !c.isAvailable()).length;
  return takenCount >= state.players.length ? new RoundEndPhase() : new RoleSelectionPhase();
}

// Faza zarządcy: wszyscy gracze produkują towary jednocześnie (w onEnter).
// Selektor (zarządca) dostaje przywilej: +1 znacznik dowolnego towaru, który produkuje.
export class CraftsmanPhase implements GamePhase {
  readonly type = PhaseType.Craftsman;
  private initialLogLength = 0;

  onEnter(state: GameState): void {
    this.initialLogLength = state.actionLog.length;
    this.produceForAllPlayers(state);
    state.currentPlayerIndex = state.roleSelectorIndex;
  }

  onExit(_state: GameState): void {}

  getValidActions(state: GameState, playerId: PlayerId): Action[] {
    if (state.getRoleSelector().id !== playerId) return [];
    if (state.getCurrentPlayer().id !== playerId) return [];
    if (state.actionLog.length > this.initialLogLength) return [];

    const player = state.getPlayer(playerId)!;
    return GOOD_TYPES
      .filter(g =>
        player.island.getProductionCapacity(g) > 0 &&
        state.supply.getGoodsAvailable(g) > 0,
      )
      .map(g => new CraftsmanBonusAction(playerId, g));
  }

  checkTransition(state: GameState): GamePhase | null {
    if (state.actionLog.length > this.initialLogLength) {
      return nextPhaseAfterRole(state);
    }
    // Zarządca nie ma co produkować — natychmiastowe przejście
    const selector = state.players[state.roleSelectorIndex]!;
    const canBonus = GOOD_TYPES.some(
      g => selector.island.getProductionCapacity(g) > 0 && state.supply.getGoodsAvailable(g) > 0,
    );
    if (!canBonus) return nextPhaseAfterRole(state);
    return null;
  }

  private produceForAllPlayers(state: GameState): void {
    for (const player of state.players) {
      const produced = new Map<GoodType, number>();

      for (const good of GOOD_TYPES) {
        const capacity = player.island.getProductionCapacity(good);
        if (capacity === 0) continue;
        const actual = state.supply.drawGoods(good, capacity);
        if (actual > 0) {
          produced.set(good, actual);
          player.addStoredGoods(good, actual);
        }
      }

      // Hooki budynków: onProduce (Akwedukt, Manufaktura)
      for (const building of player.island.getActiveBuildings()) {
        if (building.onProduce) {
          building.onProduce(state, player, produced);
        }
      }

      // Przetwórnia: bonus dublonów od liczby różnych towarów
      for (const building of player.island.getActiveBuildings()) {
        if (building.factoryBonusDoubloons) {
          const bonus = building.factoryBonusDoubloons(produced.size);
          if (bonus > 0) player.doubloons += state.supply.drawDoubloons(bonus);
        }
      }

      // Rozszerzenie II: Kaplica i Zakład jubilerski
      for (const building of player.island.getBuildings()) {
        if (building.occupiedWorkers > 0 && building.craftsmanWorkerReward) {
          const r = building.craftsmanWorkerReward();
          if (r.doubloons) player.doubloons += state.supply.drawDoubloons(r.doubloons);
          if (r.vp) player.victoryPointTokens += state.supply.drawVictoryPoints(r.vp);
        }
        if (building.occupiedNobles > 0 && building.craftsmanNobleReward) {
          const r = building.craftsmanNobleReward();
          if (r.doubloons) player.doubloons += state.supply.drawDoubloons(r.doubloons);
          if (r.vp) player.victoryPointTokens += state.supply.drawVictoryPoints(r.vp);
        }
        if (building.isActive() && building.craftsmanNoblesDoublons?.()) {
          const nobleCount = player.island.countNobles();
          if (nobleCount > 0) player.doubloons += state.supply.drawDoubloons(nobleCount);
        }
      }

      // Festival: check produkcja quest — player must produce all required goods this phase
      if (state.festivalBoard) {
        const q = state.festivalBoard.produkcja;
        if (!q.completedBy) {
          const fulfilled = Object.entries(q.requiredGoods).every(
            ([good, needed]) => (produced.get(good as GoodType) ?? 0) >= (needed ?? 0),
          );
          if (fulfilled) {
            q.completedBy = player.id;
            // Reward: 3 doubloons from bank
            player.doubloons += state.supply.drawDoubloons(3);
          }
        }
      }
    }
  }
}
