import { GameFactory } from '../../state/GameFactory';
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import { GameState } from '../../state/GameState';
import type { Action } from '../../actions/Action';
import type { Bot } from '../bots/Bot';
import type { PlayerId } from '../../core/types';

export type PlayerSetup =
  | { type: 'human'; name: string }
  | { type: 'bot'; name: string; bot: Bot };

export interface GameEvent {
  playerName: string;
  actionText: string;
  isBot: boolean;
}

export class GameRunner {
  readonly state: GameState;
  readonly playerSetups: readonly PlayerSetup[];
  // Zewnętrzny log zdarzeń (co kto zrobił) widoczny w UI.
  readonly log: GameEvent[] = [];

  constructor(
    playerSetups: PlayerSetup[],
    existingState?: GameState,
    expansions: { festival: boolean; corsair: boolean; newBuildings: boolean; nobleBuildings: boolean } = { festival: false, corsair: false, newBuildings: false, nobleBuildings: false },
  ) {
    if (playerSetups.length < 3 || playerSetups.length > 5) {
      throw new Error('Puerto Rico wymaga 3–5 graczy');
    }
    this.playerSetups = playerSetups;
    if (existingState) {
      this.state = existingState;
    } else {
      const names = playerSetups.map(p => p.name);
      this.state = GameFactory.create(playerSetups.length as 3 | 4 | 5, names, new RoleSelectionPhase(), expansions);
    }
  }

  // Zwraca setup dla gracza o danym indeksie.
  getSetup(index: number): PlayerSetup {
    return this.playerSetups[index]!;
  }

  // Setup aktualnego gracza (currentPlayerIndex).
  getCurrentSetup(): PlayerSetup {
    return this.getSetup(this.state.currentPlayerIndex);
  }

  isCurrentPlayerHuman(): boolean {
    return this.getCurrentSetup().type === 'human';
  }

  isGameOver(): boolean {
    return this.state.gameOver;
  }

  // Zwraca akcję bota dla aktualnego gracza lub null jeśli to gracz ludzki.
  getBotAction(): Action | null {
    const setup = this.getCurrentSetup();
    if (setup.type !== 'bot') return null;
    const playerId = this.currentPlayerId();
    const actions = this.state.getValidActions(playerId);
    if (actions.length === 0) return null;
    return setup.bot.chooseAction(this.state, playerId);
  }

  // Aplikuje akcję (przez ludzki klik lub bota) i dodaje do logu.
  applyAction(action: Action, label: string): boolean {
    const setup = this.getCurrentSetup();
    const playerName = setup.name;
    const isBot = setup.type === 'bot';
    const result = this.state.apply(action);
    if (!result.ok) return false;
    this.log.unshift({ playerName, actionText: label, isBot });
    return true;
  }

  currentPlayerId(): PlayerId {
    return this.state.getCurrentPlayer().id;
  }

  // Zwraca dostępne akcje dla aktualnego gracza.
  getValidActionsForCurrentPlayer(): Action[] {
    return this.state.getValidActions(this.currentPlayerId());
  }
}
