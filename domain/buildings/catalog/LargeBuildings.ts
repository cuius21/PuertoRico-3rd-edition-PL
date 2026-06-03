import { LargeBuilding } from '../LargeBuilding';
import { BuildingCategory } from '../../../core/types';
import type { GameState } from '../../../state/GameState';
import type { Player } from '../../Player';

export class Fortress extends LargeBuilding {
  readonly id = 'fortress';
  readonly displayName = 'Twierdza';
  readonly displayNameEn = 'Fortress';

  calculateEndGameBonus(_state: GameState, player: Player): number {
    return Math.floor(player.island.getTotalEmployedWorkers() / 3);
  }
}

export class GuildHall extends LargeBuilding {
  readonly id = 'guildHall';
  readonly displayName = 'Siedziba Cechu';
  readonly displayNameEn = 'Guild Hall';

  calculateEndGameBonus(_state: GameState, player: Player): number {
    let bonus = 0;
    for (const building of player.island.getBuildings()) {
      if (building.category !== BuildingCategory.Production) continue;
      bonus += building.workerCapacity === 1 ? 1 : 2;
    }
    return bonus;
  }
}

export class CustomsHouse extends LargeBuilding {
  readonly id = 'customsHouse';
  readonly displayName = 'Urząd Celny';
  readonly displayNameEn = 'Customs House';

  calculateEndGameBonus(_state: GameState, player: Player): number {
    return Math.floor(player.victoryPointTokens / 4);
  }
}

export class CityHall extends LargeBuilding {
  readonly id = 'cityHall';
  readonly displayName = 'Ratusz';
  readonly displayNameEn = 'City Hall';

  calculateEndGameBonus(_state: GameState, player: Player): number {
    return player.island
      .getBuildings()
      .filter(b => b.category !== BuildingCategory.Production)
      .length;
  }
}

export class Residence extends LargeBuilding {
  readonly id = 'residence';
  readonly displayName = 'Rezydencja';
  readonly displayNameEn = 'Residence';

  calculateEndGameBonus(_state: GameState, player: Player): number {
    const occupied = player.island.getPlantations().length;
    if (occupied <= 9) return 4;
    if (occupied === 10) return 5;
    if (occupied === 11) return 6;
    return 7;
  }
}
