import { GameFactory } from '../../state/GameFactory';
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import { GameState } from '../../state/GameState';
export class GameRunner {
    state;
    playerSetups;
    // Zewnętrzny log zdarzeń (co kto zrobił) widoczny w UI.
    log = [];
    constructor(playerSetups, existingState) {
        if (playerSetups.length < 3 || playerSetups.length > 5) {
            throw new Error('Puerto Rico wymaga 3–5 graczy');
        }
        this.playerSetups = playerSetups;
        if (existingState) {
            this.state = existingState;
        }
        else {
            const names = playerSetups.map(p => p.name);
            this.state = GameFactory.create(playerSetups.length, names, new RoleSelectionPhase());
        }
    }
    // Zwraca setup dla gracza o danym indeksie.
    getSetup(index) {
        return this.playerSetups[index];
    }
    // Setup aktualnego gracza (currentPlayerIndex).
    getCurrentSetup() {
        return this.getSetup(this.state.currentPlayerIndex);
    }
    isCurrentPlayerHuman() {
        return this.getCurrentSetup().type === 'human';
    }
    isGameOver() {
        return this.state.gameOver;
    }
    // Zwraca akcję bota dla aktualnego gracza lub null jeśli to gracz ludzki.
    getBotAction() {
        const setup = this.getCurrentSetup();
        if (setup.type !== 'bot')
            return null;
        const playerId = this.currentPlayerId();
        const actions = this.state.getValidActions(playerId);
        if (actions.length === 0)
            return null;
        return setup.bot.chooseAction(this.state, playerId);
    }
    // Aplikuje akcję (przez ludzki klik lub bota) i dodaje do logu.
    applyAction(action, label) {
        const setup = this.getCurrentSetup();
        const playerName = setup.name;
        const isBot = setup.type === 'bot';
        const result = this.state.apply(action);
        if (!result.ok)
            return false;
        this.log.unshift({ playerName, actionText: label, isBot });
        if (this.log.length > 60)
            this.log.length = 60;
        return true;
    }
    currentPlayerId() {
        return this.state.getCurrentPlayer().id;
    }
    // Zwraca dostępne akcje dla aktualnego gracza.
    getValidActionsForCurrentPlayer() {
        return this.state.getValidActions(this.currentPlayerId());
    }
}
//# sourceMappingURL=GameRunner.js.map