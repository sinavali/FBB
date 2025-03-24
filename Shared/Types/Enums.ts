export enum ProjectName {
  BOT = "fbb_bot",
  DASHBOARD = "fbb_dashboard",
}

export enum CandleDirection {
  UP = "UP",
  DOWN = "DOWN",
  IDLE = "IDLE",
}

export enum CandleDeepType {
  HIGH = "HIGH",
  LOW = "LOW",
  BOTH = "BOTH",
}

export enum MetaTraderSocketType {
  CMD = "CMD",
  DATA = "DATA",
}

export enum Directions {
  UP = "UP",
  DOWN = "DOWN",
}

export enum MssState {
  INITIATED = "INITIATED",
  UPDATED = "UPDATED",
}

export enum CobState {
  INITIATED = "INITIATED",
  UPDATED = "UPDATED",
}

export enum MicroTimeType {
  SESSION = "SESSION",
  WORKTIME = "WORKTIME",
}
export enum LiquidityMode {
  BYSESSION = "BYSESSION",
  BYWORKTIME = "BYWORKTIME",
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
}

export enum Triggers {
  MSS = "MSS",
  COB = "COB",
  DP = "DP",
}

export enum LiquidityUsedStatus {
  FOUND = "FOUND",
  TRIGGERED = "TRIGGERED",
  CANCELED = "CANCELED",
  FAILED = "FAILED",
  TAKEPROFIT = "TAKEPROFIT",
  STOPLOSS = "STOPLOSS",
}

export enum TriggerStatus {
  FOUND = "FOUND",
  CANCELED = "CANCELED",
  FAILED = "FAILED",
  TRIGGERED = "TRIGGERED",
  STOPLOSS = "STOPLOSS",
  TAKEPROFIT = "TAKEPROFIT",
}

export enum SignalStatus {
  CLOSED = "CLOSED", // closed manualy
  TRIGGERED = "TRIGGERED",
  STOPLOSS = "STOPLOSS",
  TAKEPROFIT = "TAKEPROFIT",
}

export enum Period {
  PERIOD_M1 = "PERIOD_M1",
  PERIOD_M2 = "PERIOD_M2",
  PERIOD_M3 = "PERIOD_M3",
  PERIOD_M4 = "PERIOD_M4",
  PERIOD_M5 = "PERIOD_M5",
  PERIOD_M6 = "PERIOD_M6",
  PERIOD_M10 = "PERIOD_M10",
  PERIOD_M12 = "PERIOD_M12",
  PERIOD_M15 = "PERIOD_M15",
  PERIOD_M20 = "PERIOD_M20",
  PERIOD_M30 = "PERIOD_M30",
  PERIOD_H1 = "PERIOD_H1",
  PERIOD_H2 = "PERIOD_H2",
  PERIOD_H3 = "PERIOD_H3",
  PERIOD_H4 = "PERIOD_H4",
  PERIOD_H6 = "PERIOD_H6",
  PERIOD_H8 = "PERIOD_H8",
  PERIOD_H12 = "PERIOD_H12",
  PERIOD_D1 = "PERIOD_D1",
  PERIOD_W1 = "PERIOD_W1",
  PERIOD_MN1 = "PERIOD_MN1",
}

export enum SettingParsTo {
  INT = "INT",
  FLOAT = "FLOAT",
  STRING = "STRING",
  BOOLEAN = "BOOLEAN",
  BIGINT = "BIGINT",
}

export enum SystemMode {
  LIVE = "LIVE",
  SIGNAL = "SIGNAL",
  BACKTEST = "BACKTEST",
  MTBACKTEST = "MTBACKTEST",
}
