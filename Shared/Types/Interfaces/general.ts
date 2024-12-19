import * as Enums from "@shared/Types/Enums";
import { DateTime, PairPeriod } from "@shared/Types/Interfaces/common";

export interface Setting {
  id: number;
  settingKey: string;
  settingValue: string;
  parseTo: Enums.SettingParsTo;
}

export interface Currency {
  id: number;
  name: string;
  correlationWith: number[];
}

export interface Session {
  id: number;
  title: string;
  start: DateTime;
  end: DateTime;
}

export interface WorkTime {
  id: number;
  title: string;
  start: DateTime;
  end: DateTime;
}

export interface MicroTime {
  id: number;
  type: Enums.MicroTimeType;
  model: number;
  start: DateTime;
  end?: DateTime | null;
}

export interface Liquidity {
  id: number;
  pairPeriod: PairPeriod;
  direction: Enums.Directions;
  mode: Enums.LiquidityMode;
  price: number;
  time: number;
  huntPrice?: number | null;
  hunted?: DateTime | null;
  micro?: number | null; // id of MicroTime
  used: LiquidityUsed[];
}

export interface FVG {
  id: number;
  pairPeriod: PairPeriod;
  prev: number; // id of candle
  this: number; // id of candle
  next: number; // id of candle
  high: number;
  low: number;
  diff: number;
  direction: Enums.Directions;
}

export interface MSS {
  id: number;
  pairPeriod: PairPeriod;
  limit?: number | null;
  stoploss?: number | null;
  takeprofit?: number | null;
  liquidityUsed: LiquidityUsed;
  status: Enums.TriggerStatus;
  direction: Enums.Directions;
  startCandle: number; // id of the candle
  firstDeepCandle: number; // id of the candle
  mainDeepCandle: number; // id of the candle
  secondDeepCandle: number; // id of the candle
  mssCandle: number; // id of the candle
  shiftCandle?: number | null; // id of the candle
  returnCandle?: number | null; // id of the candle
  FVGs: number[]; // id of FVGs
  height: number;
}

export interface COB {
  id: number;
  pairPeriod: PairPeriod;
  limit: number;
  stoploss: number;
  takeprofit: number;
  liquidityUsed: LiquidityUsed;
  status: Enums.TriggerStatus;
  direction: Enums.Directions;
  postStartCandles: number[]; // id of the candles
  startCandle: number; // id of the candle
  bodyCandles: number[]; // id of the candles
  confirmCandle: number; // id of the candle
  pastConfirmCandles: number[]; // id of the candles
  height: number;
}

export interface LiquidityUsed {
  id: number;
  liquidityId: number;
  trigger: {
    id: number;
    name: Enums.Triggers;
  };
  status: Enums.LiquidityUsedStatus;
  time: DateTime;
}

export interface Candle {
  id: number;
  pairPeriod: PairPeriod;
  open: number;
  close: number;
  high: number;
  low: number;
  direction: Enums.CandleDirection;
  time: DateTime;
  isDeep?: Enums.CandleDeepType | null;
  session: number; // id of session
}
