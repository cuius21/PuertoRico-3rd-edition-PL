import type { Action } from '../../../actions/Action';
import type { EntityRef } from '../adapter/sceneTypes';
type Shape = {
  type: string;
  playerId?: string;
  buildingId?: string;
  target?: {
    kind: string;
    slotIndex?: number;
    buildingId?: string;
    shipIndex?: number;
  };
  choice?: { kind: string; index?: number };
  good?: string;
};
export function actionKey(action: Action): string {
  return JSON.stringify(action);
}
export function targetsForAction(action: Action): string[] {
  const a = action as unknown as Shape;
  if (a.type === 'BUILD') return ['market', `market:${a.buildingId}`];
  if (a.type === 'TAKE_PLANTATION') return ['plantations'];
  if (a.type === 'PLACE_WORKER')
    return [
      a.target?.kind === 'building'
        ? `${a.playerId}:building:${a.target.buildingId}`
        : `${a.playerId}:plantation:${a.target?.slotIndex}`,
    ];
  if (
    a.type === 'SELL_GOOD' ||
    a.type === 'BUY_PLANTATION_FROM_DECK' ||
    a.type === 'SELL_PLANTATION'
  )
    return ['market'];
  if (a.type === 'LOAD_SHIP')
    return [
      'port',
      a.target?.kind === 'ship'
        ? `ship:${a.target.shipIndex}`
        : `${a.playerId}:building:${a.target?.kind === 'marina' ? 'marina' : 'wharf'}`,
    ];
  if (a.type.startsWith('CORSAIR')) return ['corsair'];
  return [];
}
export function actionsForTarget(
  actions: readonly Action[],
  target: EntityRef,
): Action[] {
  return actions.filter(
    (a) =>
      targetsForAction(a).includes(target.key) ||
      (['market', 'plantations', 'port', 'corsair'].includes(target.key) &&
        targetsForAction(a).includes(target.area)),
  );
}
export function resolveCurrentAction(
  key: string,
  current: readonly Action[],
): Action | undefined {
  return current.find((a) => actionKey(a) === key);
}
