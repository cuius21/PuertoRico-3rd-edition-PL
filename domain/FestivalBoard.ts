import { GoodType, PlantationType, type PlayerId } from '../core/types';

export interface FestivalUprawaQuest {
  readonly type: 'uprawa';
  readonly plantationType: PlantationType;
  completedBy: PlayerId | null;
}

export interface FestivalProdukcjaQuest {
  readonly type: 'produkcja';
  // Required production per good type (e.g. {indigo:2, sugar:1})
  readonly requiredGoods: Readonly<Partial<Record<GoodType, number>>>;
  completedBy: PlayerId | null;
}

export interface FestivalBudowaQuest {
  readonly type: 'budowa';
  readonly buildingId: string;
  readonly buildingDisplayName: string;
  completedBy: PlayerId | null;
}

export type FestivalQuest = FestivalUprawaQuest | FestivalProdukcjaQuest | FestivalBudowaQuest;

export class FestivalBoard {
  constructor(
    public uprawa: FestivalUprawaQuest,
    public produkcja: FestivalProdukcjaQuest,
    public budowa: FestivalBudowaQuest,
  ) {}

  get quests(): FestivalQuest[] {
    return [this.uprawa, this.produkcja, this.budowa];
  }

  isFullyCompleted(): boolean {
    return this.quests.every(q => q.completedBy !== null);
  }
}

// Plantation type labels for display
export const PLANTATION_LABELS: Record<PlantationType, string> = {
  [PlantationType.Corn]:    'Kukurydza',
  [PlantationType.Indigo]:  'Indygo',
  [PlantationType.Sugar]:   'Cukier',
  [PlantationType.Tobacco]: 'Tytoń',
  [PlantationType.Coffee]:  'Kawa',
  [PlantationType.Quarry]:  'Kamieniołom',
};

export const GOOD_ICONS: Record<GoodType, string> = {
  [GoodType.Corn]:    '🌽',
  [GoodType.Indigo]:  '🔵',
  [GoodType.Sugar]:   '□',
  [GoodType.Tobacco]: '🍂',
  [GoodType.Coffee]:  '☕',
};
