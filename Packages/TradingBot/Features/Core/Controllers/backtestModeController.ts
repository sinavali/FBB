import logger from "@shared/Initiatives/Logger.ts";
import {LiquidityMode} from "@shared/Types/Enums.ts";
import {GeneralStore} from "@shared/Types/Interfaces/generalStore.ts";
import {modelOne} from "@tradingBot/Features/Core/Controllers/flows.ts";
import fs from "fs";
import moment from "moment";
import { generateSignalReports } from '@tradingBot/Features/Core/ReportMaker.ts';

export default async (generalStore: GeneralStore) => {
    try {
        const startTime = new Date().getTime();

        const start = generalStore.state.Setting.getOne("BackTestStartUTCUnix");
        const end = generalStore.state.Setting.getOne("BackTestEndUTCUnix");

        if (!start || !end) {
            if (!start && !end) {
                logger.error("start and end of test are not specified");
                console.log("start and end of test are not specified");
            } else if (!start) {
                logger.error("start of test is not specified");
                console.log("start of test is not specified");
            } else if (!end) {
                logger.error("end of test is not specified");
                console.log("end of test is not specified");
            }
            return;
        }
        console.log(`from: ${moment.unix(start.settingValueParsed).format("YYYY-MM-DD HH:mm")} to: ${moment.unix(end.settingValueParsed).format("YYYY-MM-DD HH:mm")}`);

        await generalStore.state.Candle?.startCandleProcesses({
            from: start.settingValueParsed,
            to: end.settingValueParsed,
            chunkSize: 10000
        }, modelOne);

        generalStore.state.Time.add("backtest mode time", new Date().getTime() - startTime);

        generateReports(generalStore);
    } catch (error) {
        console.log(error);
        logger.error(error);
    }
};

function generateReports(generalStore: GeneralStore) {
    console.log(generalStore.state.Time.getAll().map(t => ({name: t.name, maxTime: t.maxTime})));

    console.log(`Done All In: ${generalStore.state.Time.get("backtest mode time")?.maxTime}`);
    console.log(`time range from ${moment.utc(1546350000 * 1000)} to ${moment.utc(1547350000 * 1000)}`);

    console.log(
        "candles",
        generalStore.state.Candle.candles.getAll().length,
        generalStore.state.Candle.candles.getNewest()?.id
    );
    console.log(
        "Sessions",
        generalStore.state.Session.sessions.getAll().length,
        generalStore.state.Session.sessions.getNewest()?.id
    );
    console.log(
        "WorkTimes",
        generalStore.state.WorkTime.workTimes.getAll().length,
        generalStore.state.WorkTime.workTimes.getNewest()?.id
    );

    generateMicroTimesReport(generalStore);
    generateLiquiditiesReport(generalStore);
    generateMssReport(generalStore);
    generateCobReport(generalStore);
    generateSignalReport(generalStore);
}

function generateLiquiditiesReport(generalStore: GeneralStore) {
    const liquidities = generalStore.state.Liquidity.liquidities.getAll();
    fs.writeFileSync("./Packages/TradingBot/Reports/liquidity.json", JSON.stringify(liquidities), "utf8");
    const liquiditiesFormatted = liquidities.map((i) => ({
        type: "LIQUIDITY",
        id: i.id,
        pair: i.pairPeriod.pair,
        price: i.price,
        direction: i.direction,
        mode: i.mode,
        createTime: [i.time.unix, i.time.utc],
        SMT: i.SMT,
        failed: i.failed,
        hunted: i.hunted,
        huntPrice: i.huntPrice,
        used: i.used.map(u => ({
            status: u.status,
            trigger: u.trigger,
            time: [u.time?.unix, u.time?.utc]
        })),
    }));
    fs.writeFileSync("./Packages/TradingBot/Reports/liquiditiesFormatted.json", JSON.stringify(liquiditiesFormatted), "utf8");

    console.log(`Liquidity => Have: ${liquidities.length}, LastId: ${liquidities[0]?.id}`);

    const weekly = generalStore.state.Liquidity.liquidities.getAll([["mode", LiquidityMode.WEEKLY]]);
    console.log(`LiquidityWeekly => Have: ${weekly.length}, LastId: ${weekly[0]?.id}`);

    const daily = generalStore.state.Liquidity.liquidities.getAll([["mode", LiquidityMode.DAILY]]);
    console.log(`LiquidityDaily => Have: ${daily.length}, LastId: ${daily[0]?.id}`);

    const bySession = generalStore.state.Liquidity.liquidities.getAll([["mode", LiquidityMode.BYSESSION]]);
    console.log(`LiquidityBySession => Have: ${bySession.length}, LastId: ${bySession[0]?.id}`);

    const hunted = generalStore.state.Liquidity.liquidities.getAll().filter(l => l.hunted);
    console.log(`LiquidityHunted => Have: ${hunted.length}, LastId: ${hunted[0]?.id}`);
}

function generateMicroTimesReport(generalStore: GeneralStore) {
    const microTimes = generalStore.state.MicroTime.microTimes.getAll();
    fs.writeFileSync("./Packages/TradingBot/Reports/microTime.json", JSON.stringify(microTimes), "utf8");
    const microTimesFormatted = microTimes.map((i) => ({
        type: "MICRO_TIME",
        id: i.id,
        microTimeType: i.type,
        start: [i.start.unix, i.start.utc],
        end: [i.end.unix, i.end.utc],
        session: i.session,
        workTime: i.workTime,
    }));
    fs.writeFileSync("./Packages/TradingBot/Reports/microTimeFormatted.json", JSON.stringify(microTimesFormatted), "utf8");

    console.log(`MicroTime => Have: ${microTimes.length}, LastId: ${microTimes[0]?.id}`);
}

function generateMssReport(generalStore: GeneralStore) {
    const candles = generalStore.state.Candle.candles.getAll();
    const mss = generalStore.state.MSS.marketShifts.getAll();
    fs.writeFileSync("./Packages/TradingBot/Reports/mss.json", JSON.stringify(mss), "utf8");

    const mssFormatted = mss.map((mss: any) => ({
        type: "MSS",
        id: mss.id,
        height: mss.height,
        limit: mss.limit,
        tp: mss.takeprofit,
        stop: mss.stoploss,
        direction: mss.direction,
        pair: mss.pairPeriod.pair,
        status: mss.status,
        dateTime: mss.dateTime,
        mainDeepCandleId: mss.mainDeepCandle,
        secondDeepCandleId: mss.secondDeepCandle,
        mssCandleId: mss.mssCandle,
        secondDeepCandle: candles.find(c => c.id === mss.secondDeepCandle),
        mainDeepCandle: candles.find(c => c.id === mss.mainDeepCandle),
        mssCandle: candles.find(c => c.id === mss.mssCandle),
    }));
    // console.log(mssFormatted)
    fs.writeFileSync("./Packages/TradingBot/Reports/mssFormatted.json", JSON.stringify(mssFormatted), "utf8");

    console.log(`MSS => Have: ${mss.length}, LastId: ${mss[0]?.id}`);
}

function generateCobReport(generalStore: GeneralStore) {
    const cobs = generalStore.state.COB.orderBlocks.getAll();
    fs.writeFileSync("./Packages/TradingBot/Reports/cob.json", JSON.stringify(cobs), "utf8");

    const cobFormatted = cobs.map((cob) => ({
        type: "COB",
        id: cob.id,
        height: cob.height,
        limit: cob.limit,
        tp: cob.takeprofit,
        stop: cob.stoploss,
        direction: cob.direction,
        pair: cob.pairPeriod.pair,
        status: cob.status,
        dateTime: cob.dateTime,
    }));
    fs.writeFileSync("./Packages/TradingBot/Reports/cobFormatted.json", JSON.stringify(cobFormatted), "utf8");

    console.log(`COB => Have: ${cobs.length}, LastId: ${cobs[0]?.id}`);
}

function generateSignalReport(generalStore: GeneralStore) {
    const signals = generalStore.state.Signal.signals.getAll();
    fs.writeFileSync("./Packages/TradingBot/Reports/signal.json", JSON.stringify(signals), "utf8");

    const signalsFormatted = signals.map((signal) => ({
        type: "SIGNAL",
        id: signal.id,
        pair: signal.pairPeriod.pair,
        direction: signal.direction,
        status: signal.status,
        trigger: signal.trigger,
        limit: signal.limit,
        tp: signal.takeprofit,
        stop: signal.stoploss,
        time: [signal.time.unix, signal.time.utc],
    }));
    fs.writeFileSync("./Packages/TradingBot/Reports/signalFormatted.json", JSON.stringify(signalsFormatted), "utf8");
    console.log(`Signal => Have: ${signals.length}, LastId: ${signals[0]?.id}`);

    generateSignalReports();
}