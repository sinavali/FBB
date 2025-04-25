import {
    GeneralStoreSetter,
    GeneralStoreState,
    GeneralStore as IGeneralStore,
    GeneralStoreGlobalState,
} from "@shared/Types/Interfaces/generalStore.ts";
import { MysqlConnector } from "@shared/Initiatives/DB.ts";
import { PrismaClient } from "@prisma/client";
import Setting from "@tradingBot/Features/Features/Setting/Setting.ts";
import MTSocket from "@shared/Initiatives/Socket.ts";
import { MetaTraderSocketType } from "@shared/Types/Enums.ts";
import Candle from "@tradingBot/Features/Features/Candle/Candle.ts";
import Session from "@tradingBot/Features/Features/Session/Session.ts";
import WorkTime from "@tradingBot/Features/Features/WorkTime/WorkTime.ts";
import MicroTime from "@tradingBot/Features/Features/MicroTime/MicroTime.ts";
import Liquidity from "@tradingBot/Features/Features/Liquidity/Liquidity.ts";
import CandleOrderBlock from "@tradingBot/Features/Features/COB/COB.ts";
import MarketShiftStructure from "@tradingBot/Features/Features/MSS/MSS.ts";
import Time from "@tradingBot/Features/Core/Time.ts";
import Signal from "@tradingBot/Features/Features/Signal/Signal.ts";

// Use Candle with internal state management
// export function useGeneralStore(): IGeneralStore {
//     const globalStates: GeneralStoreGlobalState = {
//         systemMode: null,
//     };

//     const setter: GeneralStoreSetter = {
//         setPrisma: (prisma: PrismaClient) => (state.Prisma = prisma),
//         setDatabase: (database: MysqlConnector) => (state.Database = database),
//         setSetting: (setting: Setting) => (state.Setting = setting),
//     };

//     const state = {
//         Prisma: new PrismaClient(),
//         Database: new MysqlConnector(),
//     } as GeneralStoreState;

//     state.Time = new Time();
//     state.Setting = new Setting({ state, setter, globalStates });
//     state.Signal = new Signal({ state, setter, globalStates }, 50000);
//     state.Candle = new Candle({ state, setter, globalStates }, 5000);
//     state.Session = new Session({ state, setter, globalStates }, 100);
//     state.WorkTime = new WorkTime({ state, setter, globalStates }, 100);
//     state.MicroTime = new MicroTime({ state, setter, globalStates }, 300);
//     state.Liquidity = new Liquidity({ state, setter, globalStates }, 1000);
//     state.COB = new CandleOrderBlock({ state, setter, globalStates }, 100);
//     state.MSS = new MarketShiftStructure({ state, setter, globalStates }, 100);

//     state.Socket = new MTSocket();
//     state.Socket.initMetaTraderSocket();
//     state.Socket.initMetaTraderSocket();

//     return { state, setter, globalStates };
// }

class GeneralStore {
    public globalStates: GeneralStoreGlobalState = {
        systemMode: null,
    };

    public setter: GeneralStoreSetter = {
        setPrisma: (prisma: PrismaClient) => (this.state.Prisma = prisma),
        setDatabase: (database: MysqlConnector) => (this.state.Database = database),
        setSetting: (setting: Setting) => (this.state.Setting = setting),
    };

    public state = {
        Prisma: new PrismaClient(),
        Database: new MysqlConnector(),
    } as GeneralStoreState;

    constructor() {
        this.state.Time = new Time();

        this.state.Setting = new Setting({ state: this.state, setter: this.setter, globalStates: this.globalStates });
        this.state.Signal = new Signal({ state: this.state, setter: this.setter, globalStates: this.globalStates }, 50000);
        this.state.Candle = new Candle({ state: this.state, setter: this.setter, globalStates: this.globalStates }, 5000);
        this.state.Session = new Session({ state: this.state, setter: this.setter, globalStates: this.globalStates }, 100);
        this.state.WorkTime = new WorkTime({ state: this.state, setter: this.setter, globalStates: this.globalStates }, 100);
        this.state.MicroTime = new MicroTime({ state: this.state, setter: this.setter, globalStates: this.globalStates }, 300);
        this.state.Liquidity = new Liquidity({ state: this.state, setter: this.setter, globalStates: this.globalStates }, 1000);
        this.state.COB = new CandleOrderBlock({ state: this.state, setter: this.setter, globalStates: this.globalStates }, 100);
        this.state.MSS = new MarketShiftStructure({ state: this.state, setter: this.setter, globalStates: this.globalStates }, 100);

        this.state.Socket = new MTSocket();
        this.state.Socket.initMetaTraderSocket();
        this.state.Socket.initMetaTraderSocket();
    }
}

export default GeneralStore;