// Najprostszy bot: losuje jedną z legalnych akcji.
// Służy jako baseline oraz do testowania UI bez działającego AI.
export class RandomBot {
    name = 'RandomBot';
    chooseAction(state, playerId) {
        const actions = state.getValidActions(playerId);
        if (actions.length === 0)
            throw new Error(`RandomBot: no valid actions for ${playerId}`);
        const idx = Math.floor(Math.random() * actions.length);
        return actions[idx];
    }
}
//# sourceMappingURL=RandomBot.js.map