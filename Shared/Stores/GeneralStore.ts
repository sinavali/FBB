import {
    GeneralStoreSetter,
    GeneralStoreState,
    GeneralStore,
    GeneralStoreGlobalState,
} from "@shared/Types/Interfaces/generalStore.ts";
import {MysqlConnector} from "@shared/Initiatives/DB.ts";
import {PrismaClient} from "@prisma/client";
import Setting from "@tradingBot/Features/Features/Setting/Setting.ts";
import MTSocket from "@shared/Initiatives/Socket.ts";
import {MetaTraderSocketType} from "@shared/Types/Enums.ts";
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
export function useGeneralStore(): GeneralStore {
    const globalStates: GeneralStoreGlobalState = {
        systemMode: null,
    };

    const setter: GeneralStoreSetter = {
        setPrisma: (prisma: PrismaClient) => (state.Prisma = prisma),
        setDatabase: (database: MysqlConnector) => (state.Database = database),
        setSetting: (setting: Setting) => (state.Setting = setting),
    };

    const state = {
        Prisma: new PrismaClient(),
        MT: {
            CMD: new MTSocket().initMetaTraderSocket(MetaTraderSocketType.CMD).CMD,
            DATA: new MTSocket().initMetaTraderSocket(MetaTraderSocketType.DATA).DATA,
        },
        Database: new MysqlConnector(),
    } as GeneralStoreState;

    state.Time = new Time();
    state.Setting = new Setting({state, setter, globalStates});
    state.Signal = new Signal({state, setter, globalStates}, 5000);
    state.Candle = new Candle({state, setter, globalStates}, 5000);
    state.Session = new Session({state, setter, globalStates}, 100);
    state.WorkTime = new WorkTime({state, setter, globalStates}, 100);
    state.MicroTime = new MicroTime({state, setter, globalStates}, 300);
    state.Liquidity = new Liquidity({state, setter, globalStates}, 1000);
    state.COB = new CandleOrderBlock({state, setter, globalStates}, 100);
    state.MSS = new MarketShiftStructure({state, setter, globalStates}, 100);

    return {state, setter, globalStates};
}
