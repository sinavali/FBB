import { Period } from "@shared/Types/Enums";
import { Currency } from "@shared/Types/Interfaces/general";

export interface DateTime {
  unix: number;
  utc: Date;
}

export interface PairPeriod {
  pair: Currency;
  period: Period;
}
