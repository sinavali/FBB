import { CandleDirections } from "./../Enums/candles";

export interface Candle {
  id: number;
  open: number;
  close: number;
  high: number;
  low: number;
  direction: CandleDirections;
  time: string;
}
