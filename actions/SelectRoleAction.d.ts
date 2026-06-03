import type { Action } from './Action';
import { type Result } from '../core/Result';
import { type PlayerId, RoleType } from '../core/types';
import type { GameState } from '../state/GameState';
export declare class SelectRoleAction implements Action {
    readonly playerId: PlayerId;
    readonly role: RoleType;
    readonly type = "SELECT_ROLE";
    constructor(playerId: PlayerId, role: RoleType);
    validate(state: GameState): Result<void, string>;
    execute(state: GameState): void;
}
//# sourceMappingURL=SelectRoleAction.d.ts.map