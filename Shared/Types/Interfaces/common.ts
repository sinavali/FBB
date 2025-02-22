import { Period } from "@shared/Types/Enums.ts";
import { ICurrency } from "@shared/Types/Interfaces/general.ts";
import { Moment } from "moment";

export type DateTime = {
  unix: number;
  utc: Moment;
};

export interface PairPeriod {
  pair: ICurrency | string;
  period: Period;
}

export interface Dates {
  start: DateTime;
  end: DateTime;
}

export interface DatesEndIsNull {
  start: DateTime;
  end: DateTime | null;
}

export type CircularBufferMethodCondition<T> = [keyof T, any, ("===" | "!==")?];
