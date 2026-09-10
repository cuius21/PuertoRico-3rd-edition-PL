import market from '../../assets/isometric/market.png';
import walkers from '../../assets/isometric/walkers.png';
export const MARKET_URL = market;
export const WALKERS_URL = walkers;
import a from '../../assets/isometric/atlas-a.png';
import b from '../../assets/isometric/atlas-b.png';
import c from '../../assets/isometric/atlas-c.png';
import d from '../../assets/isometric/atlas-d.png';
export const ATLAS_URLS = [a, b, c, d];
export const ATLAS_IDS = [
  [
    'smallIndigoPlant',
    'largeIndigoPlant',
    'smallSugarMill',
    'largeSugarMill',
    'tobaccoStorage',
    'coffeeRoaster',
    'smallMarket',
    'smithy',
    'hacienda',
    'hospice',
    'smallWarehouse',
    'office',
    'largeMarket',
    'largeWarehouse',
    'factory',
  ],
  [
    'university',
    'harbour',
    'wharf',
    'fortress',
    'guildHall',
    'customsHouse',
    'cityHall',
    'residence',
    'aqueduct',
    'blackMarket',
    'hut',
    'depot',
    'inn',
    'tradingPost',
    'church',
  ],
  [
    'marina',
    'transferStation',
    'lighthouse',
    'manufactory',
    'library',
    'monastery',
    'statue',
    'chancellery',
    'chapel',
    'huntingLodge',
    'masonsGuild',
    'treasury',
    'villa',
    'jewelersWorkshop',
    'palaceGarden',
  ],
  [
    'corn',
    'indigo',
    'sugar',
    'tobacco',
    'coffee',
    'quarry',
    'forest',
    'palm',
    'ship',
    'corsair',
    'festival',
    'magistrate',
    'market',
    'worker',
    'noble',
  ],
] as const;
export const SPRITES = new Map<string, { atlas: number; cell: number }>();
ATLAS_IDS.forEach((ids, atlas) =>
  ids.forEach((id, cell) => SPRITES.set(id, { atlas, cell })),
);
export function spriteStyle(id: string) {
  if (id === 'market')
    return {
      backgroundImage: 'url(' + market + ')',
      backgroundSize: 'contain',
      backgroundPosition: 'center',
    };
  const f = SPRITES.get(id);
  return f
    ? {
        backgroundImage: `url("${ATLAS_URLS[f.atlas]}")`,
        backgroundSize: '500% 300%',
        backgroundPosition: `${((f.cell % 5) / 4) * 100}% ${(Math.floor(f.cell / 5) / 2) * 100}%`,
      }
    : {};
}
