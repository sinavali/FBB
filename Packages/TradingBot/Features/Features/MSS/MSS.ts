import {
  ICandle,
  ILiquidity,
  IMSS,
  ISignal,
  LiquidityUsed,
} from "@shared/Types/Interfaces/general.ts";
import Query from "@shared/Queries.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import logger from "@shared/Initiatives/Logger.ts";
import {
  CandleDeepType,
  Directions,
  LiquidityUsedStatus,
  MssState,
  SignalStatus,
  Triggers,
  TriggerStatus,
} from "@shared/Types/Enums.ts";
import { CircularBuffer } from "@tradingBot/Features/Core/CircularBuffer.ts";
import { useMarketUtils } from "@shared/Utilities/marketUtils.ts";

export default class MarketShiftStructure {
  public marketShifts: CircularBuffer<IMSS>;
  private generalStore: GeneralStore;
  public queryClass: Query;
  private indexMap: Map<number, number> = new Map();
  private maxId: number = 0;
  private minCandleToCheck: number;

  constructor(
    generalStoreInstance: GeneralStore,
    capacity: number = 50,
    minCandlesToCheck: number = 100
  ) {
    this.generalStore = generalStoreInstance;
    this.queryClass = new Query(this.generalStore);
    this.marketShifts = new CircularBuffer<IMSS>(capacity);
    this.minCandleToCheck = minCandlesToCheck;
  }

  initiateMSS(candle: ICandle) {
    const liquidities = this.generalStore.state.Liquidity?.liquidities
      .getAll()
      .filter(
        (l) =>
          l.hunted &&
          !l.failed &&
          l.pairPeriod.pair === candle.pairPeriod.pair &&
          l.pairPeriod.period === candle.pairPeriod.period
      ) as ILiquidity[];

    if (!liquidities?.length) return;

    liquidities.sort((a, b) => (b.hunted?.unix ?? 0) - (a.hunted?.unix ?? 0));
    const liquidity = liquidities[0];

    const candles = this.generalStore.state.Candle?.candles.getAfter(
      candle.pairPeriod,
      candle.time.unix - (this.minCandleToCheck + 2) * 60
    );

    if (!candles.length) return;

    const model: Partial<IMSS> = {};

    const highestHigh = this.findHighestHigh(candles);
    const lowestLow = this.findLowestLow(candles);

    let modelDirection: Directions | undefined =
      this.detectModelDirection(liquidity);
    if (!modelDirection) return;

    let mainDeepCandle: ICandle | undefined = this.detectMainDeep(
      [highestHigh, lowestLow],
      modelDirection
    );
    if (!mainDeepCandle) return;

    model.mainDeepCandle = mainDeepCandle.id;
    model.direction = modelDirection;
    model.pairPeriod = candle.pairPeriod;
    model.status = TriggerStatus.FOUND;

    const secondDeepCandle = this.findLimit(
      candles,
      modelDirection,
      mainDeepCandle
    );
    if (!secondDeepCandle) return;
    model.secondDeepCandle = secondDeepCandle.id;

    if (model.direction === Directions.DOWN)
      model.limit = secondDeepCandle?.low;
    if (model.direction === Directions.UP) model.limit = secondDeepCandle?.high;

    if (!model.limit || !this.validateLimit(model)) return;

    const doesExists = this.generalStore.state.MSS.marketShifts
      .getAll()
      .find(
        (e) =>
          e.liquidityUsed.liquidityId === liquidity.id &&
          e.mainDeepCandle === model.mainDeepCandle
      );
    if (doesExists) return;

    model.stoploss = this.calculateStopLoss(mainDeepCandle, modelDirection);
    if (!model.stoploss) return;

    model.takeprofit = this.calculateTakeProfit(
      model.stoploss,
      model.limit,
      modelDirection
    );

    const stoploss = this.findStopLoss(mainDeepCandle, modelDirection);
    if (!stoploss) return;
    model.stoploss = stoploss;
    if (!this.validateStopLoss(model)) return;

    const takeprofit = this.findTakeProfit(
      model.limit,
      model.stoploss,
      modelDirection
    );
    if (!takeprofit) return;
    model.takeprofit = takeprofit;
    if (!this.validateTakeProfit(model)) return;

    const height = this.calculateHeight(
      model.limit,
      model.stoploss,
      model.direction
    );
    if (!height || !this.validateHeight(height)) return;
    model.height = height;

    model.id = ++this.maxId as number;
    model.dateTime = candle.time.utc.tz("America/New_York");
    model.state = MssState.INITIATED;
    model.liquidityUsed = {
      liquidityId: liquidity.id,
      status: LiquidityUsedStatus.FOUND,
      trigger: Triggers.MSS,
    };

    this.marketShifts.add(model as IMSS);
  }

  updateMSS(candle: ICandle) {
    const founds = this.generalStore.state.MSS.marketShifts
      .getAll()
      .filter((e) => e.status === TriggerStatus.FOUND);
    founds.forEach((item) => {
      this.updateMssData(item, candle);
      this.checkMssFailure(item, candle);

      // renew the mss datafor the function
      const mss = this.marketShifts.getById(item.id);
      if (!mss) return;

      if (mss.direction === Directions.DOWN && candle.low <= mss.limit)
        this.makeMssTriggered(mss, candle);
      if (mss.direction === Directions.UP && candle.high >= mss.limit)
        this.makeMssTriggered(mss, candle);
    });

    const triggered = this.generalStore.state.MSS.marketShifts
      .getAll()
      .filter((e) => e.status === TriggerStatus.TRIGGERED);
    triggered.forEach((mss) => {
      if (mss.direction === Directions.DOWN) {
        if (candle.high >= mss.stoploss)
          this.makeMssTriggerStopLoss(mss, candle);
        else if (candle.low <= mss.takeprofit)
          this.makeMssTriggerTakeProfit(mss, candle);
      } else if (mss.direction === Directions.UP) {
        if (candle.low <= mss.stoploss)
          this.makeMssTriggerStopLoss(mss, candle);
        else if (candle.high >= mss.takeprofit)
          this.makeMssTriggerTakeProfit(mss, candle);
      }
    });
  }

  private checkMssFailure(mss: IMSS, candle: ICandle): void {
    if (this.checkHeightLimitFailure(mss, candle)) return;
    if (this.checkSecondDeepToMssCandleDiffFailure(mss, candle)) return;
    if (this.checkMssCandleToTriggerCandleDiffFailure(mss, candle)) return;
  }

  private checkHeightLimitFailure(mss: IMSS, candle: ICandle): boolean {
    const bigHeightLimit = this.generalStore.state.Setting.getOne(
      "MSSBigHeightLimit"
    )?.settingValueParsed as number;
    const marketUtils = useMarketUtils();

    const heighPip = marketUtils.methods.toPip(mss.height);
    if (heighPip >= bigHeightLimit) return this.makeMssFailed(mss, candle);

    return false;
  }

  private checkSecondDeepToMssCandleDiffFailure(
    mss: IMSS,
    candle: ICandle
  ): boolean {
    const secondDeepToMssCandleDiff = this.generalStore.state.Setting.getOne(
      "MSSSecondDeepToMssCandleDiff"
    )?.settingValueParsed as number;

    const secondDeepCandle = this.generalStore.state.Candle.getCandle(
      mss.secondDeepCandle
    );

    if (!secondDeepCandle) return this.makeMssFailed(mss, candle);
    let candles = this.generalStore.state.Candle.candles.getRangeOfCandles(
      candle.pairPeriod,
      secondDeepCandle.time.unix,
      secondDeepToMssCandleDiff
    );

    const isExists = candles.find((c) => c.id === mss.mssCandle);
    if (!isExists) return this.makeMssFailed(mss, candle);

    return false;
  }

  private checkMssCandleToTriggerCandleDiffFailure(
    mss: IMSS,
    candle: ICandle
  ): boolean {
    const mssCandleToTriggerCandleDiff = this.generalStore.state.Setting.getOne(
      "MSSMssCandleToTriggerCandleDiff"
    )?.settingValueParsed as number;

    const mssCandle = this.generalStore.state.Candle.getCandle(mss.mssCandle);
    if (!mssCandle) return this.makeMssFailed(mss, candle);

    const candles = this.generalStore.state.Candle.candles.getRangeOfCandles(
      mss.pairPeriod,
      mssCandle.time.unix,
      mssCandleToTriggerCandleDiff
    );

    const isExists = candles.find((c) => c.id === mss.triggerCandle);
    if (!isExists) return this.makeMssFailed(mss, candle);

    return false;
  }

  private makeMssFailed(mss: IMSS, candle: ICandle): boolean {
    const index: number = this.marketShifts
      .getAll()
      .findIndex((e) => e.id === mss.id);

    if (index >= 0) {
      this.marketShifts.updateByIndex(index, "state", MssState.UPDATED);
      this.marketShifts.updateByIndex(index, "status", TriggerStatus.FAILED);
      const newLiquidityUsed: LiquidityUsed = {
        liquidityId: mss.liquidityUsed.liquidityId,
        status: LiquidityUsedStatus.FAILED,
        time: candle.time,
        trigger: mss.liquidityUsed.trigger,
      };
      this.marketShifts.updateByIndex(index, "liquidityUsed", newLiquidityUsed);

      const signal = this.generalStore.state.Signal.signals
        .getAll()
        .find((s) => s.triggerId === mss.id);
      if (!signal) return true;

      const signalIndex = this.generalStore.state.Signal.signals
        .getAll()
        .findIndex((s) => s.id === signal.id);

      this.generalStore.state.Signal.signals.updateByIndex(
        signalIndex,
        "status",
        SignalStatus.CLOSED
      );
      this.generalStore.state.Signal.signals.updateByIndex(
        signalIndex,
        "time",
        candle.time
      );
      this.generalStore.state.Signal.signals.updateByIndex(
        signalIndex,
        "liquidityUsed",
        newLiquidityUsed
      );
    }

    return true;
  }

  private makeMssTriggered(mss: IMSS, candle: ICandle) {
    const index: number = this.marketShifts
      .getAll()
      .findIndex((e) => e.id === mss.id);

    if (index >= 0) {
      this.marketShifts.updateByIndex(index, "state", MssState.UPDATED);
      this.marketShifts.updateByIndex(index, "status", TriggerStatus.TRIGGERED);
      const newLiquidityUsed: LiquidityUsed = {
        liquidityId: mss.liquidityUsed.liquidityId,
        status: LiquidityUsedStatus.TRIGGERED,
        time: candle.time,
        trigger: mss.liquidityUsed.trigger,
      };
      this.marketShifts.updateByIndex(index, "liquidityUsed", newLiquidityUsed);

      const signal: ISignal = {
        id: 0, // will be overrided in Signal class
        triggerCandleId: candle.id,
        triggerId: mss.id,
        trigger: Triggers.MSS,
        direction: mss.direction,
        limit: mss.limit,
        stoploss: mss.stoploss,
        takeprofit: mss.takeprofit,
        pairPeriod: mss.pairPeriod,
        status: SignalStatus.TRIGGERED,
        time: candle.time,
        liquidityUsed: newLiquidityUsed,
      };
      this.generalStore.state.Signal.signals.add(signal);
    }
  }

  private makeMssTriggerStopLoss(mss: IMSS, candle: ICandle) {
    const index: number = this.marketShifts
      .getAll()
      .findIndex((e) => e.id === mss.id);

    if (index >= 0) {
      this.marketShifts.updateByIndex(index, "status", TriggerStatus.STOPLOSS);
      const liquidityUsed = {
        liquidityId: mss.liquidityUsed.liquidityId,
        status: TriggerStatus.STOPLOSS,
        time: mss.liquidityUsed.time,
        trigger: mss.liquidityUsed.trigger,
      };
      this.marketShifts.updateByIndex(index, "liquidityUsed", liquidityUsed);

      const signal = this.generalStore.state.Signal.signals
        .getAll()
        .find((s) => s.triggerId === mss.id);
      if (!signal) return;

      const signalIndex = this.generalStore.state.Signal.signals
        .getAll()
        .findIndex((s) => s.id === signal.id);

      this.generalStore.state.Signal.signals.updateByIndex(
        signalIndex,
        "status",
        SignalStatus.STOPLOSS
      );
      this.generalStore.state.Signal.signals.updateByIndex(
        signalIndex,
        "time",
        candle.time
      );
      this.generalStore.state.Signal.signals.updateByIndex(
        signalIndex,
        "liquidityUsed",
        liquidityUsed
      );
    }
  }

  private makeMssTriggerTakeProfit(mss: IMSS, candle: ICandle) {
    const index: number = this.marketShifts
      .getAll()
      .findIndex((e) => e.id === mss.id);

    if (index >= 0) {
      this.marketShifts.updateByIndex(
        index,
        "status",
        TriggerStatus.TAKEPROFIT
      );
      const liquidityUsed = {
        liquidityId: mss.liquidityUsed.liquidityId,
        status: TriggerStatus.TAKEPROFIT,
        time: mss.liquidityUsed.time,
        trigger: mss.liquidityUsed.trigger,
      };
      this.marketShifts.updateByIndex(index, "liquidityUsed", liquidityUsed);

      const signal = this.generalStore.state.Signal.signals
        .getAll()
        .find((s) => s.triggerId === mss.id);
      if (!signal) return;

      const signalIndex = this.generalStore.state.Signal.signals
        .getAll()
        .findIndex((s) => s.id === signal.id);

      this.generalStore.state.Signal.signals.updateByIndex(
        signalIndex,
        "status",
        SignalStatus.TAKEPROFIT
      );
      this.generalStore.state.Signal.signals.updateByIndex(
        signalIndex,
        "time",
        candle.time
      );
      this.generalStore.state.Signal.signals.updateByIndex(
        signalIndex,
        "liquidityUsed",
        liquidityUsed
      );
    }
  }

  updateMssData(mss: IMSS, candle: ICandle) {
    const mssIndex = this.marketShifts
      .getAll()
      .findIndex((e) => e.id === mss.id);
    if (!mssIndex) return;

    const secondDeepCandle = this.generalStore.state.Candle.getCandle(
      mss.secondDeepCandle
    );
    const mainDeepCandle = this.generalStore.state.Candle.getCandle(
      mss.mainDeepCandle
    );
    if (!secondDeepCandle || !mainDeepCandle) return;

    const candles = this.generalStore.state.Candle?.candles.getAfter(
      candle.pairPeriod,
      secondDeepCandle.time.unix
    );

    const newData = {
      limit: mss.limit,
      takeprofit: mss.takeprofit,
      stoploss: mss.stoploss,
      height: mss.height,
    };

    const limitCandle = this.findLimit(candles, mss.direction, mainDeepCandle);
    if (limitCandle) {
      const limit = this.limitCandleToNumber(limitCandle, mss);
      if (limit) newData.limit = limit;
    }

    const stoploss = this.calculateStopLoss(mainDeepCandle, mss.direction);
    if (stoploss) newData.stoploss = stoploss;

    const takeprofit = this.calculateTakeProfit(
      newData.stoploss,
      newData.limit,
      mss.direction
    );
    if (takeprofit) newData.takeprofit = takeprofit;

    const height = this.calculateHeight(
      newData.stoploss,
      newData.limit,
      mss.direction
    );
    if (height) newData.height = height;

    this.marketShifts.updateByIndex(mssIndex, "limit", newData.limit);
    this.marketShifts.updateByIndex(mssIndex, "stoploss", newData.stoploss);
    this.marketShifts.updateByIndex(mssIndex, "takeprofit", newData.takeprofit);
    this.marketShifts.updateByIndex(mssIndex, "height", newData.height);
  }

  private detectModelDirection(liquidity: ILiquidity): Directions | undefined {
    let direction: Directions | undefined = undefined;

    if (liquidity.direction === Directions.UP) direction = Directions.DOWN;
    else if (liquidity.direction === Directions.DOWN) direction = Directions.UP;

    return direction;
  }

  limitCandleToNumber(limitCandle: ICandle, mss: IMSS): number | undefined {
    if (mss.direction === Directions.DOWN) return limitCandle.low;
    else if (mss.direction === Directions.UP) return limitCandle.high;
    else return undefined;
  }

  /**
   *
   * @param data [ICandle, ICandle] as [highestHigh, lowestLow]
   * @returns
   */
  private detectMainDeep(
    data: [ICandle | undefined, ICandle | undefined],
    direction: Directions
  ): ICandle | undefined {
    let result: ICandle | undefined = undefined;

    if (direction === Directions.DOWN && data[0]) result = data[0];
    else if (direction === Directions.UP && data[1]) result = data[1];

    return result;
  }

  private findLowestLow(candles: ICandle[] = []): ICandle | undefined {
    const tempCandles = [...candles];
    tempCandles.sort((a, b) => a.low - b.low);

    return tempCandles.find((c) => c.isDeep === CandleDeepType.LOW);
  }

  findHighestHigh(candles: ICandle[] = []): ICandle | undefined {
    let highestHigh: ICandle | undefined = undefined;
    for (const candle of candles)
      if (
        !highestHigh ||
        (candle.isDeep === CandleDeepType.HIGH &&
          candle.high > highestHigh.high)
      )
        highestHigh = candle;

    return highestHigh;
  }

  findLowBeforeHighestHigh(
    candles: ICandle[] = [],
    highestHigh: ICandle | undefined
  ): ICandle | undefined {
    if (!highestHigh) return undefined;

    const tempCandles = [...candles];
    tempCandles.sort((a, b) => b.time.unix - a.time.unix);

    return tempCandles.find(
      (c) =>
        c.time.unix < highestHigh.time.unix && c.isDeep === CandleDeepType.LOW
    );
  }

  findHighBeforeLowestLow(
    candles: ICandle[] = [],
    lowestLow: ICandle | undefined
  ): ICandle | undefined {
    if (!lowestLow) return undefined;

    const tempCandles = [...candles];
    tempCandles.sort((a, b) => b.time.unix - a.time.unix);

    return tempCandles.find(
      (c) =>
        c.time.unix < lowestLow.time.unix && c.isDeep === CandleDeepType.HIGH
    );
  }

  /**
   *
   * @param candles sort of candles do not matter
   * @param direction
   * @param mainDeep as highestHigh or lowestLow according to direction and logic
   * @returns
   */
  findLimit(
    candles: ICandle[] = [],
    direction: Directions,
    mainDeep: ICandle
  ): ICandle | undefined {
    if (!candles.length) return;

    let limit: ICandle | undefined;

    if (direction === Directions.DOWN)
      limit = this.findLowBeforeHighestHigh(candles, mainDeep) ?? undefined;
    else if (direction === Directions.UP)
      limit = this.findHighBeforeLowestLow(candles, mainDeep) ?? undefined;

    return limit;
  }

  /**
   *
   * @param mainDeep as highestHigh or lowestLow according to direction and logic
   * @param direction
   * @returns
   */
  calculateStopLoss(
    mainDeep: ICandle,
    direction: Directions
  ): number | undefined {
    let stopLoss: number | undefined;
    const stopLossBuff: number = this.generalStore.state.Setting.getOne(
      "SignalStopLossError"
    )?.settingValueParsed as number;

    if (direction === Directions.DOWN) stopLoss = mainDeep.high + stopLossBuff;
    else if (direction === Directions.UP)
      stopLoss = mainDeep.low - stopLossBuff;

    return stopLoss;
  }

  /**
   *
   * @param mainDeep as highestHigh or lowestLow according to direction and logic
   * @param direction
   * @returns
   */
  calculateTakeProfit(
    stoploss: number,
    limit: number,
    direction: Directions
  ): number | undefined {
    let takeProfit: number | undefined;

    const takeProfitBuff: number = this.generalStore.state.Setting.getOne(
      "SignalTakeProfitError"
    )?.settingValueParsed as number;
    const riskMultiplier: number = this.generalStore.state.Setting.getOne(
      "RiskReward"
    )?.settingValueParsed as number;

    if (direction === Directions.DOWN)
      takeProfit = limit - (stoploss - limit) * riskMultiplier - takeProfitBuff;
    else if (direction === Directions.UP)
      takeProfit = limit + (limit - stoploss) * riskMultiplier - takeProfitBuff;

    return takeProfit;
  }

  findStopLoss(mainDeep: ICandle, direction: Directions): number | null {
    let stopLoss: number | null = null;
    const vars = this.getVariables();

    if (direction === Directions.DOWN)
      stopLoss = mainDeep.high + vars.stopLossError;
    else if (direction === Directions.UP)
      stopLoss = mainDeep.low - vars.stopLossError;

    return stopLoss;
  }

  findTakeProfit(
    limit: number,
    stopLoss: number,
    direction: Directions
  ): number | null {
    let takeProfit: number | null = null;
    const vars = this.getVariables();

    if (direction === Directions.DOWN)
      takeProfit =
        limit - (stopLoss - limit) * vars.riskReward - vars.takeProfitError;
    else if (direction === Directions.UP)
      takeProfit =
        limit + (limit - stopLoss) * vars.riskReward + vars.takeProfitError;

    return takeProfit;
  }

  validateLimit(model: Partial<IMSS>): boolean {
    return !!model.limit;
  }

  validateTakeProfit(model: Partial<IMSS>): boolean {
    return !!model.takeprofit;
  }

  validateStopLoss(model: Partial<IMSS>): boolean {
    return !!model.stoploss;
  }

  validateHeight(height: number | null): boolean {
    if (height === null) return false;
    else if (height === 0) return false;
    else if (height < 0) return false;

    return true;
  }

  calculateHeight(
    limit: number,
    stoploss: number,
    direction: Directions
  ): number | null {
    let height: number | null = null;
    if (!limit || !stoploss) return null;

    if (direction === Directions.DOWN) height = stoploss - limit;
    else if (direction === Directions.UP) height = limit - stoploss;

    return height;
  }

  getVariables() {
    const data = {
      heightLimitDivider: this.generalStore.state.Setting?.getOne(
        "MSSHeightLimitDivider"
      )?.settingValueParsed,
      multipleFVGHeightLimitDivider: this.generalStore.state.Setting?.getOne(
        "MSSMultipleFVGHeightLimitDivider"
      )?.settingValueParsed,
      smallHeightLimit: this.generalStore.state.Setting?.getOne(
        "MSSSmallHeightLimit"
      )?.settingValueParsed,
      stopLossError: this.generalStore.state.Setting?.getOne(
        "SignalStopLossError"
      )?.settingValueParsed,
      takeProfitError: this.generalStore.state.Setting?.getOne(
        "SignalTakeProfitError"
      )?.settingValueParsed,
      riskReward:
        this.generalStore.state.Setting?.getOne("RiskReward")
          ?.settingValueParsed,
    };

    return data;
  }

  getMaxId(): number {
    return this.maxId;
  }

  getIndexById(id: number): number | undefined {
    return this.indexMap.get(id);
  }
}
