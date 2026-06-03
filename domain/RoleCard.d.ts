import { RoleType, type PlayerId } from '../core/types';
export declare class RoleCard {
    readonly type: RoleType;
    doubloonsOnCard: number;
    takenBy: PlayerId | null;
    constructor(type: RoleType);
    isAvailable(): boolean;
    reset(): void;
}
//# sourceMappingURL=RoleCard.d.ts.map