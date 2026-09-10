import type { Action } from '../../../actions/Action';
import type { TakePlantationAction } from '../../../actions/TakePlantationAction';
import type { GameState } from '../../../state/GameState';
import { GOOD_NAMES } from '../adapter/buildSceneSnapshot';

export function plantationTiles(state: GameState, actions: readonly Action[]) {
  const choices = actions.filter(
    (a): a is TakePlantationAction => a.type === 'TAKE_PLANTATION',
  );
  const tiles = state.supply.revealedPlantations.flatMap((p, index) => {
    const matches = choices.filter(
      (a) => a.choice.kind === 'revealed' && a.choice.index === index,
    );
    const normal = {
      key: 'crop:' + index,
      sprite: p.type as string,
      name: GOOD_NAMES[p.type]!,
      detail: 'Plantacja ' + (index + 1),
      action: matches.find((a) => !a.asForest),
    };
    const forest = matches.find((a) => a.asForest);
    return forest
      ? [
          normal,
          {
            key: 'forest:' + index,
            sprite: 'forest',
            name: 'Las',
            detail: 'Zamiast: ' + GOOD_NAMES[p.type] + ' · ' + (index + 1),
            action: forest,
          },
        ]
      : [normal];
  });
  tiles.push({
    key: 'quarry',
    sprite: 'quarry',
    name: 'Kamieniołom',
    detail: state.supply.quarryStack.length + ' w puli',
    action: choices.find((a) => a.choice.kind === 'quarry' && !a.asForest),
  });
  return tiles;
}

export function plantationGuide(
  phase: string,
  actions: readonly Action[],
  canAct: boolean,
) {
  return (
    phase === 'settler' &&
    canAct &&
    actions.some((a) => a.type === 'TAKE_PLANTATION')
  );
}
