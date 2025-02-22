import logger from "@shared/Initiatives/Logger.ts";
import { LiquidityMode, TriggerStatus } from "@shared/Types/Enums.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import { modelOne } from "@tradingBot/Features/Core/Controllers/flows.ts";
import fs from "fs";
import moment from "moment";

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
    console.log(
      `from: ${moment
        .unix(start.settingValueParsed)
        .format("YYYY-MM-DD HH:mm")} to: ${moment
        .unix(end.settingValueParsed)
        .format("YYYY-MM-DD HH:mm")}`
    );

    await generalStore.state.Candle?.startCandleProcesses(
      {
        from: start.settingValueParsed,
        to: end.settingValueParsed,
        chunkSize: 10000,
      },
      modelOne
    );

    generalStore.state.Time.add(
      "backtest mode time",
      new Date().getTime() - startTime
    );
    console.log(generalStore.state.Time.get("backtest mode time"));
    console.log(generalStore.state.Time.getAll());

    console.log(
      `time range from ${moment.utc(1546350000)} to ${moment.utc(1547350000)}`
    );
    console.log(
      "candles",
      generalStore.state.Candle.candles.getAll().length,
      generalStore.state.Candle.candles.getNewest()?.id
    );
    console.log(
      "sessions",
      generalStore.state.Session.sessions.getAll().length,
      generalStore.state.Session.sessions.getNewest()?.id
    );
    console.log(
      "workTimes",
      generalStore.state.WorkTime.workTimes.getAll().length,
      generalStore.state.WorkTime.workTimes.getNewest()?.id
    );
    console.log(
      "microTimes",
      generalStore.state.MicroTime.microTimes.getAll().length,
      generalStore.state.MicroTime.microTimes.getNewest()?.id
    );
    console.log(
      "Liquidities",
      generalStore.state.Liquidity.liquidities.getAll().length,
      generalStore.state.Liquidity.liquidities.getNewest()?.id,
      "weekly:",
      generalStore.state.Liquidity.liquidities.getAll([
        ["mode", LiquidityMode.WEEKLY],
      ]).length,
      "daily:",
      generalStore.state.Liquidity.liquidities.getAll([
        ["mode", LiquidityMode.DAILY],
      ]).length,
      "bySession:",
      generalStore.state.Liquidity.liquidities.getAll([
        ["mode", LiquidityMode.BYSESSION],
      ]).length,
      "failed:",
      generalStore.state.Liquidity.liquidities.getAll([["failed", true]])
        .length,
      "hunted:",
      generalStore.state.Liquidity.liquidities.getAll([
        ["hunted", undefined, "!=="],
      ]).length,
      generalStore.state.Liquidity.liquidities
        .getAll()
        .map((l) => l.id)
        .join(", ")
    );
    console.log(
      "COB",
      generalStore.state.COB.orderBlocks.getAll().length,
      generalStore.state.COB.orderBlocks.getNewest()?.id
      // generalStore.state.COB.orderBlocks.getAll([
      //   ["status", TriggerStatus.STOPLOSS],
      // ]),
      // generalStore.state.COB.orderBlocks.getAll([
      //   ["status", TriggerStatus.TAKEPROFIT],
      // ])
    );
    console.log(
      "MSS",
      generalStore.state.MSS.marketShifts.getAll().length,
      generalStore.state.MSS.marketShifts.getNewest()?.id,
      generalStore.state.MSS.marketShifts
        .getAll()
        .filter((item) => item.status === TriggerStatus.FAILED)
    );
    console.log(
      "Sessions",
      generalStore.state.Session.sessions.getAll().length,
      generalStore.state.Session.sessions.getNewest()?.id
    );

    const cobFormatted = generalStore.state.COB.orderBlocks
      .getAll()
      .map((cob) => ({
        type: "COB",
        id: cob.id,
        height: cob.height,
        limit: cob.limit,
        tp: cob.takeprofit,
        stop: cob.stoploss,
        direction: cob.direction,
        pairPeriod: cob.pairPeriod,
        status: cob.status,
        dateTime: cob.dateTime,
      }));
    fs.writeFileSync(
      "./Packages/TradingBot/Reports/cobFormatted.json",
      JSON.stringify(cobFormatted),
      "utf8"
    );

    const mss = generalStore.state.MSS.marketShifts.getAll();
    fs.writeFileSync(
      "./Packages/TradingBot/Reports/mss.json",
      JSON.stringify(mss),
      "utf8"
    );

    const mssFormatted = mss.map((mss) => ({
      type: "MSS",
      id: mss.id,
      mssCandleId: mss.mssCandle,
      height: mss.height,
      limit: mss.limit,
      tp: mss.takeprofit,
      stop: mss.stoploss,
      direction: mss.direction,
      pairPeriod: mss.pairPeriod,
      status: mss.status,
      dateTime: mss.dateTime,
    }));
    fs.writeFileSync(
      "./Packages/TradingBot/Reports/mssFormatted.json",
      JSON.stringify(mssFormatted),
      "utf8"
    );
  } catch (error) {
    console.log(error);
    logger.error(error);
  }
};
