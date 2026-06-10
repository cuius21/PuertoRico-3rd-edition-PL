import type { Action } from '../actions/Action';
import { SelectRoleAction } from '../actions/SelectRoleAction';
import { PassAction } from '../actions/PassAction';
import { CraftsmanBonusAction } from '../actions/CraftsmanBonusAction';
import { TakePlantationAction } from '../actions/TakePlantationAction';
import type { PlantationChoice } from '../actions/TakePlantationAction';
import { SellGoodAction } from '../actions/SellGoodAction';
import { TakeDoubloonAction } from '../actions/TakeDoubloonAction';
import { BuildAction } from '../actions/BuildAction';
import { PlaceWorkerAction } from '../actions/PlaceWorkerAction';
import type { WorkerTarget } from '../actions/PlaceWorkerAction';
import { MayorPassAction } from '../actions/MayorPassAction';
import { LoadShipAction } from '../actions/LoadShipAction';
import type { ShipTarget } from '../actions/LoadShipAction';
import { CorsairPiracyAction } from '../actions/CorsairPiracyAction';
import { CorsairPlunderAction } from '../actions/CorsairPlunderAction';
import { CorsairRaidAction } from '../actions/CorsairRaidAction';
import { CorsairCaptureAction } from '../actions/CorsairCaptureAction';
import { BuyPlantationFromDeckAction } from '../actions/BuyPlantationFromDeckAction';
import { SellPlantationAction } from '../actions/SellPlantationAction';
import { TreasuryAction } from '../actions/TreasuryAction';
import type { GoodType, RoleType, PlayerId } from '../core/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

export function deserializeAction(raw: Raw): Action | null {
  const type = raw['type'] as string;
  const playerId = raw['playerId'] as PlayerId;

  switch (type) {
    case 'SELECT_ROLE':
      return new SelectRoleAction(playerId, raw['role'] as RoleType);
    case 'PASS':
      return new PassAction(playerId);
    case 'CRAFTSMAN_BONUS':
      return new CraftsmanBonusAction(playerId, raw['good'] as GoodType);
    case 'TAKE_PLANTATION':
      return new TakePlantationAction(playerId, raw['choice'] as PlantationChoice, raw['asForest'] as boolean | undefined);
    case 'SELL_GOOD':
      return new SellGoodAction(playerId, raw['good'] as GoodType);
    case 'TAKE_DOUBLOON':
      return new TakeDoubloonAction(playerId);
    case 'BUILD':
      return new BuildAction(playerId, raw['buildingId'] as string);
    case 'PLACE_WORKER':
      return new PlaceWorkerAction(playerId, raw['target'] as WorkerTarget, raw['asNoble'] as boolean | undefined);
    case 'MAYOR_PASS':
      return new MayorPassAction(playerId);
    case 'LOAD_SHIP':
      return new LoadShipAction(playerId, raw['target'] as ShipTarget, raw['good'] as GoodType);
    case 'CORSAIR_PIRACY':
      return new CorsairPiracyAction(playerId, raw['shipIndex'] as number);
    case 'CORSAIR_PLUNDER':
      return new CorsairPlunderAction(playerId);
    case 'CORSAIR_RAID':
      return new CorsairRaidAction(playerId);
    case 'CORSAIR_CAPTURE':
      return new CorsairCaptureAction(playerId, raw['captureRole'] as RoleType);
    case 'BUY_PLANTATION_FROM_DECK':
      return new BuyPlantationFromDeckAction(playerId, raw['asForest'] as boolean | undefined);
    case 'SELL_PLANTATION':
      return new SellPlantationAction(playerId, raw['slotIndex'] as number, raw['earnsDublon'] as boolean | undefined);
    case 'TREASURY':
      return new TreasuryAction(playerId, raw['goods'] as GoodType[]);
    default:
      return null;
  }
}
