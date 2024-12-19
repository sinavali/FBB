import { Setting, Candle, Liquidity, MSS, COB } from "./general";

export interface GeneratStoreState {
  Settings: Setting[];
  Candles: Candle[];
  Liquidities: Liquidity[];
  MSS: MSS[];
  COB: COB[];
}
