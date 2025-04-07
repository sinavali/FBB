import * as Enums from "@shared/Types/Enums.ts";
import {
    Dates,
    DateTime,
    PairPeriod,
} from "@shared/Types/Interfaces/common.ts";
import { Setting, Currency, TimeMicroType } from "@prisma/client";
import Net from "net";

export interface IMTSocket {
    CMD: Net.Socket | null;
    DATA: Net.Socket | null;
}

export interface ISetting extends Setting {
    settingValueParsed: any;
}

export interface IUpdateSetting extends Setting {
}

export interface ICurrency extends Currency {
    correlationWithIds: number[];
}

export interface ISession {
    id: number;
    start: DateTime;
    end: DateTime;
    sessionId: number;
}

export interface IWorkTime {
    id: number;
    start: DateTime;
    end: DateTime;
    workTimeId: number;
}

export interface IMicroTime {
    id: number;
    type: TimeMicroType;
    start: DateTime;
    end: DateTime;
    session: ISession | null;
    workTime: IWorkTime | null;
}

export interface ITime {
    maxTime: number;
    minTime: number;
    name: string;
}

export interface ILiquidity {
    id: number;
    pairPeriod: PairPeriod;
    direction: Enums.Directions;
    mode: Enums.LiquidityMode;
    price: number;
    time: DateTime;
    huntPrice?: number | null;
    hunted?: DateTime | null;
    failed: boolean;
    SMT: PairPeriod[];
    timeRange: Dates;
    used: LiquidityUsed[];
    highTouches: DateTime[];
    lowTouches: DateTime[];
}

export interface IPricePoint {
    high: number;
    low: number;
    time: DateTime;
}

export interface AddNewLiquidityParams {
    direction: Enums.Directions;
    mode: Enums.LiquidityMode;
    pairPeriod: PairPeriod;
    price: number;
    time: DateTime;
    touches: DateTime[];
    timeRange: Dates;
}

export type GenerateLiquiditiesMethodParams =
    | {
        candle: ICandle;
        timezone: string;
        type: "daily" | "weekly";
    }
    | {
        pairPeriod: PairPeriod;
        session: ISession;
        type: "bySession";
    };

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

export interface IMSS {
    id: number;
    pairPeriod: PairPeriod;
    limit: number;
    stoploss: number;
    takeprofit: number;
    liquidityUsed: LiquidityUsed;
    status: Enums.TriggerStatus;
    direction: Enums.Directions;
    startCandle: number; // id of the candle
    mainDeepCandle: number; // id of the candle
    secondDeepCandle: number; // id of the candle
    mssCandle: number; // id of the candle
    triggerCandle: number; // id of the candle
    shiftCandle: number | null; // id of the candle
    returnCandle: number | null; // id of the candle
    state: Enums.MssState;
    FVGs?: number[]; // id of FVGs
    height: number;
    dateTime?: any;
    placeOrderTime?: any;
}

export interface ISignal {
    id: number;
    triggerId: number;
    triggerCandleId: number;
    trigger: Enums.Triggers;
    pairPeriod: PairPeriod;
    liquidityUsed: LiquidityUsed; // we need this only for reports to have data about liquidity of the signal
    direction: Enums.Directions;
    limit: number;
    stoploss: number;
    takeprofit: number;
    status: Enums.SignalStatus;
    time: DateTime;
    placeOrderTime?: DateTime;
    entryTime?: DateTime;
    stopHeight?: number;
    confirmToEntryTime?: number;
    entryToResult?: number;
}

export interface IPosition {
    symbol: string;
    direction: 'BUY' | 'SELL';
    volume: number;
    price: number;
    sl?: number;
    tp?: number;
}

export interface ICOB {
    id: number;
    pairPeriod: PairPeriod;
    limit: number;
    stoploss: number;
    takeprofit: number;
    liquidityUsed: LiquidityUsed;
    status: Enums.TriggerStatus;
    direction: Enums.Directions;
    startCandle: number; // id of the candle
    bodyCandles: number[]; // id of the candles
    confirmCandle: number; // id of the candle
    pastConfirmCandles: number[]; // id of the candles
    height: number;
    dateTime?: any;
}

export interface LiquidityUsed {
    liquidityId: number;
    trigger: Enums.Triggers;
    triggerId: number;
    status: Enums.LiquidityUsedStatus;
    time?: DateTime;
}

export interface ICandle {
    id: number;
    pairPeriod: PairPeriod;
    open: number;
    close: number;
    high: number;
    low: number;
    direction: Enums.CandleDirection;
    time: DateTime;
    isDeep: Enums.CandleDeepType | null;
    isFVG: FVG | null;
}

export interface IQuery {
    id: number;
    name: string;
    description?: string;
    query: string;
}

export interface CandleProcess {
    from: number;
    to: number;
    chunkSize: number;
}

export interface IChunkOptions extends CandleProcess {
    latestTime: number;
    lastTime: number;
    from: number;
    to: number;
    chunkSize: number;
}

export interface ModelOneData {
    candle?: ICandle | null;
    session?: ISession | null;
    workTime?: IWorkTime | null;
    timezone?: string | null;
    isInSession: boolean;
    isInWorkTime: boolean;
    latestSession: ISession | null;
    latestWorkTime: IWorkTime | null;
}
