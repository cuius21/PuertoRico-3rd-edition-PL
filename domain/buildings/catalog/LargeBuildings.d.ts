import { LargeBuilding } from '../LargeBuilding';
import type { GameState } from '../../../state/GameState';
import type { Player } from '../../Player';
export declare class Fortress extends LargeBuilding {
    readonly id = "fortress";
    readonly displayName = "Twierdza";
    readonly displayNameEn = "Fortress";
    calculateEndGameBonus(_state: GameState, player: Player): number;
}
export declare class GuildHall extends LargeBuilding {
    readonly id = "guildHall";
    readonly displayName = "Siedziba Cechu";
    readonly displayNameEn = "Guild Hall";
    calculateEndGameBonus(_state: GameState, player: Player): number;
}
export declare class CustomsHouse extends LargeBuilding {
    readonly id = "customsHouse";
    readonly displayName = "Urz\u0105d Celny";
    readonly displayNameEn = "Customs House";
    calculateEndGameBonus(_state: GameState, player: Player): number;
}
export declare class CityHall extends LargeBuilding {
    readonly id = "cityHall";
    readonly displayName = "Ratusz";
    readonly displayNameEn = "City Hall";
    calculateEndGameBonus(_state: GameState, player: Player): number;
}
export declare class Residence extends LargeBuilding {
    readonly id = "residence";
    readonly displayName = "Rezydencja";
    readonly displayNameEn = "Residence";
    calculateEndGameBonus(_state: GameState, player: Player): number;
}
//# sourceMappingURL=LargeBuildings.d.ts.map