import type { Action } from '../../../actions/Action';
import type { GameState } from '../../../state/GameState';
import type { SelectRoleAction } from '../../../actions/SelectRoleAction';

export function roleChoice(
  state: GameState,
  actions: readonly Action[],
  cardIndex: number,
) {
  const card = state.roleCards[cardIndex];
  if (!card || !card.isAvailable()) return undefined;
  return actions.find((a): a is SelectRoleAction => {
    if (a.type !== 'SELECT_ROLE') return false;
    const role = a as SelectRoleAction;
    return (
      role.role === card.type &&
      (role.cardIndex === cardIndex ||
        (role.cardIndex === null &&
          state.roleCards.findIndex(
            (c) => c.type === role.role && c.isAvailable(),
          ) === cardIndex))
    );
  });
}
