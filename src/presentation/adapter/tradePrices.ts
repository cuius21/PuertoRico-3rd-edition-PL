import { GOOD_PRICES } from '../../../core/constants';
import { GoodType } from '../../../core/types';
import { GOOD_NAMES } from './buildSceneSnapshot';

export const TRADE_PRICES = [
  GoodType.Corn,
  GoodType.Indigo,
  GoodType.Sugar,
  GoodType.Tobacco,
  GoodType.Coffee,
].map((good) => ({ good, name: GOOD_NAMES[good]!, coins: GOOD_PRICES[good] }));
