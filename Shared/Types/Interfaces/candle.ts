import { CandleDirections } from "@shared/Types/Enums";

export interface Candle {
  id: number;
  open: number;
  close: number;
  high: number;
  low: number;
  direction: CandleDirections;
  time: string;
}
