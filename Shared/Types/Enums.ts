export enum ProjectName {
  BOT = "fbb_bot",
  DASHBOARD = "fbb_dashboard",
}

export enum CandleDirection {
  UP,
  DOWN,
  IDLE,
}

export enum CandleDeepType {
  HIGH,
  LOW,
  BOTH,
}

export enum MetaTraderSocketType {
  CMD,
  DATA,
}

export enum Directions {
  UP,
  DOWN,
}

export enum MicroTimeType {
  SESSION,
  WORKTIME,
}

export enum LiquidityMode {
  BYCANDLE,
  BYSESSION,
  BYTIME,
}

export enum Triggers {
  MSS,
  COB,
  DP,
}

export enum LiquidityUsedStatus {
  CANCELED,
  FAILED,
  TAKEPROFIT,
  STOPLOSS,
}

export enum TriggerStatus {
  CANCELED,
  FAILED,
  TRIGGERED,
  STOPLOSS,
  TAKEPROFIT,
}

export enum Period {
  PERIOD_M1,
  PERIOD_M2,
  PERIOD_M3,
  PERIOD_M4,
  PERIOD_M5,
  PERIOD_M6,
  PERIOD_M10,
  PERIOD_M12,
  PERIOD_M15,
  PERIOD_M20,
  PERIOD_M30,
  PERIOD_H1,
  PERIOD_H2,
  PERIOD_H3,
  PERIOD_H4,
  PERIOD_H6,
  PERIOD_H8,
  PERIOD_H12,
  PERIOD_D1,
  PERIOD_W1,
  PERIOD_MN1,
}

export enum SettingParsTo {
  BOOLEAN = "Boolean",
  STRING = "String",
  INT = "Int",
  FLOAT = "Float",
}
