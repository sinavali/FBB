import { PrismaClient } from "@prisma/client";
import { MysqlConnector } from "@shared/Initiatives/DB.ts";
import { IMTSocket } from "@shared/Types/Interfaces/general.ts";
import { SystemMode } from "@shared/Types/Enums.ts";
import Time from "@tradingBot/Features/Core/Time.ts";
import Setting from "@tradingBot/Features/Features/Setting/Setting.ts";
import Candle from "@tradingBot/Features/Features/Candle/Candle.ts";
import Session from "@tradingBot/Features/Features/Session/Session.ts";
import WorkTime from "@tradingBot/Features/Features/WorkTime/WorkTime.ts";
import MicroTime from "@tradingBot/Features/Features/MicroTime/MicroTime.ts";
import Liquidity from "@tradingBot/Features/Features/Liquidity/Liquidity.ts";
import CandleOrderBlock from "@tradingBot/Features/Features/COB/COB.ts";
import MarketShiftStructure from "@tradingBot/Features/Features/MSS/MSS.ts";
import Signal from "@tradingBot/Features/Features/Signal/Signal.ts";
import MTSocket from "@shared/Initiatives/Socket.js";

export interface GeneralStore {
  state: GeneralStoreState;
  globalStates: GeneralStoreGlobalState;
  setter: GeneralStoreSetter;
}

export interface GeneralStoreState {
  Time: Time;
  Prisma: PrismaClient;
  Database: MysqlConnector;
  Setting: Setting;
  Socket: MTSocket;
  Signal: Signal;
  Session: Session;
  WorkTime: WorkTime; // todo: should change to their classes
  MicroTime: MicroTime; // todo: should change to their classes
  Candle: Candle;
  Liquidity: Liquidity;
  MSS: MarketShiftStructure;
  COB: CandleOrderBlock;
}

export interface GeneralStoreGlobalState {
  systemMode: SystemMode | null;
}

export interface GeneralStoreSetter {
  setPrisma(prisma: PrismaClient): void;
  setDatabase(database: MysqlConnector | null): void;
  setSetting(setting: Setting): void;
}
