import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import { GoodType, RoleType } from '../../core/types';
export declare function goodLabel(good: GoodType): string;
export declare function roleLabel(role: RoleType): string;
export declare function describeAction(action: Action, state: GameState): string;
//# sourceMappingURL=actionLabels.d.ts.map