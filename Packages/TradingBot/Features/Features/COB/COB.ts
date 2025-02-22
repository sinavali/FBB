import { ICandle, ICOB, ILiquidity } from "@shared/Types/Interfaces/general.ts";
import Query from "@shared/Queries.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import logger from "@shared/Initiatives/Logger.ts";
import {
  CandleDeepType,
  CandleDirection,
  Directions,
  LiquidityUsedStatus,
  Triggers,
  TriggerStatus,
} from "@shared/Types/Enums.ts";
import { CircularBuffer } from "@tradingBot/Features/Core/CircularBuffer.ts";
import {
  isBodyCandlesValid,
  isConfirmCandleValid,
  isStartCandleValid,
} from "@tradingBot/Features/Features/COB/Validations.ts";

export default class CandleOrderBlock {
  public orderBlocks: CircularBuffer<ICOB>;
  private generalStore: GeneralStore;
  public queryClass: Query;
  private indexMap: Map<number, number> = new Map();
  private maxId: number = 0;

  constructor(generalStoreInstance: GeneralStore, capacity: number = 50) {
    this.generalStore = generalStoreInstance;
    this.queryClass = new Query(this.generalStore);
    this.orderBlocks = new CircularBuffer<ICOB>(capacity);
  }

  getMaxId(): number {
    return this.maxId;
  }

  getIndexById(id: number): number | undefined {
    return this.indexMap.get(id);
  }

  initiateCOB(candle: ICandle) {
    let liquidities = this.generalStore.state.Liquidity?.liquidities
      .getAll()
      .filter(
        (l) =>
          l.hunted &&
          !l.failed &&
          l.pairPeriod.pair === candle.pairPeriod.pair &&
          l.pairPeriod.period === candle.pairPeriod.period
      ) as ILiquidity[];
    liquidities.sort((a, b) => (b.hunted?.unix ?? 0) - (a.hunted?.unix ?? 0));

    if (!liquidities || !liquidities.length) return;
    const liquidity = liquidities[0];

    const variables = this.getVariables();
    const fromIndex = 2 + variables.bodyCount + variables.postStartCount;
    const candles = this.generalStore.state.Candle?.candles.getRangeOfCandles(
      candle.pairPeriod,
      fromIndex
    ) as ICandle[];

    const startCandle = candles[2 + variables.bodyCount];
    const bodyCandles = candles.filter(
      (c, i) => i >= 1 && i <= variables.bodyCount
    );
    const confirmCandle = candles[0];

    if (!isBodyCandlesValid(bodyCandles)) return;
    if (!isConfirmCandleValid(confirmCandle, bodyCandles[0].direction)) return;
    if (!isStartCandleValid(startCandle, confirmCandle)) return;

    let direction;
    if (bodyCandles[0].direction === CandleDirection.DOWN)
      direction = Directions.UP;
    else if (bodyCandles[0].direction === CandleDirection.UP)
      direction = Directions.DOWN;
    else if (bodyCandles[0].direction === CandleDirection.IDLE) return;
    else return;

    let limit = 0;
    let stopLoss = 0;
    let takeProfit = 0;
    let height = 0;

    if (direction === Directions.UP) {
      const tempArray = candles.slice(1);
      limit = tempArray[0].low;
      for (let i = 1; i < tempArray.length; i++)
        if (tempArray[i].low < limit) limit = tempArray[i].low;

      stopLoss = confirmCandle.high;
      height = stopLoss - limit;
      takeProfit = limit - height * variables.riskReward;
    } else if (direction === Directions.DOWN) {
      const tempArray = candles.slice(1);
      limit = tempArray[0].high;
      for (let i = 1; i < tempArray.length; i++)
        if (tempArray[i].high > limit) limit = tempArray[i].high;

      stopLoss = confirmCandle.low;
      height = limit - stopLoss;
      takeProfit = limit + height * variables.riskReward;
    }

    const cob: ICOB = {
      id: ++this.maxId,
      dateTime: confirmCandle.time.utc.tz("America/New_York"),
      bodyCandles: bodyCandles.map((c) => c.id),
      confirmCandle: confirmCandle.id,
      direction,
      height,
      limit,
      stoploss: stopLoss,
      takeprofit: takeProfit,
      pairPeriod: candle.pairPeriod,
      pastConfirmCandles: [],
      startCandle: startCandle.id,
      status: TriggerStatus.FOUND,
      liquidityUsed: {
        liquidityId: liquidity.id,
        status: LiquidityUsedStatus.FOUND,
        time: candle.time,
        trigger: Triggers.COB,
      },
    };

    this.orderBlocks.add(cob);
  }

  updateCOB(candle: ICandle) {
    const triggered = this.orderBlocks
      .getAll([["status", TriggerStatus.TRIGGERED]])
      .filter(
        (cob) =>
          cob.pairPeriod.pair === candle.pairPeriod.pair &&
          cob.pairPeriod.period === candle.pairPeriod.period
      );
    const found = this.orderBlocks
      .getAll([["status", TriggerStatus.FOUND]])
      .filter(
        (cob) =>
          cob.pairPeriod.pair === candle.pairPeriod.pair &&
          cob.pairPeriod.period === candle.pairPeriod.period
      );

    for (let i = 0; i < found.length; i++) {
      const cob = found[i];

      if (cob.direction === Directions.DOWN) {
        if (cob.limit >= candle.low)
          this.orderBlocks.updateById(
            cob.id,
            "status",
            TriggerStatus.TRIGGERED
          );
      } else if (cob.direction === Directions.UP) {
        if (cob.limit <= candle.high)
          this.orderBlocks.updateById(
            cob.id,
            "status",
            TriggerStatus.TRIGGERED
          );
      }
    }

    for (let i = 0; i < triggered.length; i++) {
      const cob = triggered[i];

      if (cob.direction === Directions.DOWN) {
        if (cob.takeprofit >= candle.low) {
          this.orderBlocks.updateById(
            cob.id,
            "status",
            TriggerStatus.TAKEPROFIT
          );
        } else if (cob.stoploss <= candle.high) {
          this.orderBlocks.updateById(cob.id, "status", TriggerStatus.STOPLOSS);
        }
      } else if (cob.direction === Directions.UP) {
        if (cob.takeprofit <= candle.high) {
          this.orderBlocks.updateById(
            cob.id,
            "status",
            TriggerStatus.TAKEPROFIT
          );
        } else if (cob.stoploss >= candle.low) {
          this.orderBlocks.updateById(cob.id, "status", TriggerStatus.STOPLOSS);
        }
      }
    }
  }

  getVariables() {
    const data = {
      postStartCount:
        this.generalStore.state.Setting?.getOne("COBPostStartCount")
          ?.settingValueParsed,
      bodyCount:
        this.generalStore.state.Setting?.getOne("COBBodyCount")
          ?.settingValueParsed,
      pastConfirmCount: this.generalStore.state.Setting?.getOne(
        "COBPastConfirmCount"
      )?.settingValueParsed,
      candlesFromConfirmToDetermineLimitCount:
        this.generalStore.state.Setting?.getOne(
          "COBCandlesFromConfirmToDetermineLimitCount"
        )?.settingValueParsed,
      pastConfirmCandlesCount: this.generalStore.state.Setting?.getOne(
        "pastConfirmCandlesCount"
      )?.settingValueParsed,
      stopHeightLimit:
        this.generalStore.state.Setting?.getOne("COBStopHeightLimit")
          ?.settingValueParsed,
      riskReward:
        this.generalStore.state.Setting?.getOne("RiskReward")
          ?.settingValueParsed,
    };

    return data;
  }
}
