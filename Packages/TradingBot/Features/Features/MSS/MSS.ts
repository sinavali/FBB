import { ICandle, ILiquidity, IMSS, IPosition, ISignal, LiquidityUsed, } from "@shared/Types/Interfaces/general.ts";
import Query from "@shared/Queries.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import {
    CandleDeepType,
    Directions,
    LiquidityUsedStatus,
    MssState,
    SignalStatus,
    SystemMode,
    Triggers,
    TriggerStatus,
} from "@shared/Types/Enums.ts";
import { CircularBuffer } from "@tradingBot/Features/Core/CircularBuffer.ts";
import { useMarketUtils } from "@shared/Utilities/marketUtils.ts";
import * as Enums from "@shared/Types/Enums.js";
import logger from "@shared/Initiatives/Logger.js";
import { Moment } from "moment";
import moment from "moment";

export default class MarketShiftStructure {
    public marketShifts: CircularBuffer<IMSS>;
    private readonly generalStore: GeneralStore;
    public queryClass: Query;
    private indexMap: Map<number, number> = new Map();
    public maxId: number = 0;
    private readonly minCandleToCheck: number;

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

    async initiateMSS(candle: ICandle) {
        const liquidities = this.generalStore.state.Liquidity?.liquidities
            .getAll().filter(
                (l) =>
                    l.hunted &&
                    !l.failed &&
                    l.pairPeriod.pair === candle.pairPeriod.pair &&
                    l.pairPeriod.period === candle.pairPeriod.period
            ) as ILiquidity[];
        if (!liquidities || !liquidities.length) return;

        liquidities.sort((a, b) => (b.hunted?.unix ?? 0) - (a.hunted?.unix ?? 0));
        const liquidity = liquidities[0];
        if (!liquidity.hunted) return;

        const candles = this.generalStore.state.Candle?.candles.getAfter(
            candle.pairPeriod,
            liquidity.hunted.unix
        );
        if (!candles.length) return;

        const model: Partial<IMSS> = {};

        const highestHigh = this.findHighestHigh(candles);
        const lowestLow = this.findLowestLow(candles);

        let modelDirection: Directions | undefined = this.detectModelDirection(liquidity);
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

        const mssCandle = this.findMssCandle(mainDeepCandle, secondDeepCandle, candle, modelDirection);
        if (!mssCandle) return;
        model.mssCandle = mssCandle.id;
        model.formationTime = candle.time.utc;

        const doesExists = this.generalStore.state.MSS.marketShifts
            .getAll().find(mss =>
                mss.liquidityUsed.liquidityId === liquidity.id &&
                mss.mainDeepCandle === model.mainDeepCandle &&
                mss.mssCandle === model.mssCandle
            );
        if (doesExists) return;

        if (model.direction === Directions.DOWN) model.limit = parseFloat(secondDeepCandle?.low.toFixed(5));
        if (model.direction === Directions.UP) model.limit = parseFloat(secondDeepCandle?.high.toFixed(5))

        if (!model.limit || !this.validateLimit(model)) return;

        const stoploss = this.findStopLoss(mainDeepCandle, modelDirection);
        if (!stoploss) return;

        model.stoploss = parseFloat(stoploss.toFixed(5));
        if (!this.validateStopLoss(model)) return;

        const takeprofit = this.findTakeProfit(
            model.limit,
            model.stoploss,
            modelDirection
        );
        if (!takeprofit) return;

        model.takeprofit = parseFloat(takeprofit.toFixed(5));
        if (!this.validateTakeProfit(model)) return;

        const height = this.calculateHeight(
            model.limit,
            model.stoploss,
            model.direction
        );
        if (!height || !this.validateHeight(height)) return;
        model.height = parseFloat(height.toFixed(5));

        model.id = ++this.maxId;
        model.dateTime = candle.time.utc;
        model.state = MssState.INITIATED;
        model.liquidityUsed = {
            liquidityId: liquidity.id,
            status: LiquidityUsedStatus.FOUND,
            trigger: Triggers.MSS,
            triggerId: model.id
        };

        this.marketShifts.add(model as IMSS);
        logger.info(`new MSS initiated: ${JSON.stringify(this.marketShifts.getNewest())}`);
    }

    private makeMssFailed(mss: IMSS, candle: ICandle): boolean {
        const index: number = this.marketShifts
            .getAll()
            .findIndex((e) => e.id === mss.id);

        if (index >= 0) {
            logger.info(`mss updated failed: ${JSON.stringify(mss)}`);
            this.marketShifts.updateByIndex(index, "state", MssState.UPDATED);
            this.marketShifts.updateByIndex(index, "status", TriggerStatus.FAILED);
            const newLiquidityUsed: LiquidityUsed = {
                liquidityId: mss.liquidityUsed.liquidityId,
                status: LiquidityUsedStatus.FAILED,
                time: candle.time,
                trigger: mss.liquidityUsed.trigger,
                triggerId: mss.id,
            };
            this.marketShifts.updateByIndex(index, "liquidityUsed", newLiquidityUsed);

            const signal = this.generalStore.state.Signal.signals.getAll().find((s) => s.triggerId === mss.id);
            if (!signal) return true;

            const signalIndex = this.generalStore.state.Signal.signals.getAll().findIndex((s) => s.id === signal.id);

            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "status", SignalStatus.CLOSED);
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "time", candle.time);
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "liquidityUsed", newLiquidityUsed);
            this.generalStore.state.Liquidity.updateUsed(mss.id, Triggers.MSS, newLiquidityUsed.liquidityId, newLiquidityUsed);
        }

        return true;
    }

    private async makeMssTriggered(mss: IMSS, candle: ICandle) {
        const index: number = this.marketShifts.getAll().findIndex((e) => e.id === mss.id);

        if (index >= 0) {
            logger.info(`mss updated triggered: ${JSON.stringify(mss)}`);
            this.marketShifts.updateByIndex(index, "state", MssState.UPDATED);
            this.marketShifts.updateByIndex(index, "status", TriggerStatus.TRIGGERED);
            const newLiquidityUsed: LiquidityUsed = {
                liquidityId: mss.liquidityUsed.liquidityId,
                status: LiquidityUsedStatus.TRIGGERED,
                time: candle.time,
                trigger: mss.liquidityUsed.trigger,
                triggerId: mss.id,
            };
            this.marketShifts.updateByIndex(index, "liquidityUsed", newLiquidityUsed);
            this.generalStore.state.Liquidity.addNewUsed(mss.id, Triggers.MSS, newLiquidityUsed.liquidityId, newLiquidityUsed);
            this.generalStore.state.Liquidity.updateUsed(mss.id, Triggers.MSS, newLiquidityUsed.liquidityId, newLiquidityUsed);

            const confirmCandle = this.generalStore.state.Candle.getCandle(mss.mssCandle);
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
                liquidityUsed: mss.liquidityUsed,

                placeOrderTime: candle.time.utc,
                entryTime: candle.time.utc,
                stopHeight: (mss.direction === Directions.DOWN ? mss.stoploss - mss.limit : mss.limit - mss.stoploss) * 10000,
            };

            signal.formationToTriggerTime = (mss.formationTime as Moment)?.diff(signal.entryTime) / 1000;

            const positionData: IPosition = {
                symbol: signal.pairPeriod.pair as string,
                volume: 0.01,
                price: signal.limit,
                sl: signal.stoploss,
                tp: signal.takeprofit,
                direction: "BUY"
            }

            if (this.generalStore.globalStates.systemMode === SystemMode.LIVE) {
                if (signal.direction === Enums.Directions.UP) {
                    positionData.direction = "BUY";
                    if (parseFloat((positionData.price - (positionData.sl as number)).toFixed(5)) < 0.0003) return;
                } else if (signal.direction === Enums.Directions.DOWN) {
                    positionData.direction = "SELL";
                    if (parseFloat(((positionData.sl as number) - positionData.price).toFixed(5)) < 0.0003) return;
                }
            }

            this.generalStore.state.Signal.signals.add(signal);
            if (this.generalStore.globalStates.systemMode === SystemMode.LIVE)
                await this.generalStore.state.Signal.openPosition(positionData);
        }
    }

    private makeMssTriggerStopLoss(mss: IMSS, candle: ICandle) {
        const index: number = this.marketShifts.getAll().findIndex((e) => e.id === mss.id);

        if (index >= 0) {
            logger.info(`mss updated stoploss: ${JSON.stringify(mss)}`);

            const signal = this.generalStore.state.Signal.signals.getAll().find((s) => s.triggerId === mss.id);
            if (!signal) return;
            if (signal.status !== SignalStatus.TRIGGERED) return;

            this.marketShifts.updateByIndex(index, "status", TriggerStatus.STOPLOSS);

            const liquidityUsed: LiquidityUsed = {
                liquidityId: mss.liquidityUsed.liquidityId,
                status: LiquidityUsedStatus.STOPLOSS,
                time: mss.liquidityUsed.time,
                trigger: mss.liquidityUsed.trigger,
                triggerId: mss.id
            };
            this.marketShifts.updateByIndex(index, "liquidityUsed", liquidityUsed);

            const signalIndex = this.generalStore.state.Signal.signals.getAll().findIndex((s) => s.id === signal.id);

            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "formationToCloseTime", Math.abs((mss.formationTime as Moment).diff(candle.time.utc) as number));
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "triggerToCloseTime", Math.abs((signal.entryTime as Moment).diff(candle.time.utc) as number));
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "closedTime", candle.time.utc);
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "status", SignalStatus.STOPLOSS);
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "time", candle.time);
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "liquidityUsed", liquidityUsed);
            this.generalStore.state.Liquidity.updateUsed(mss.id, Triggers.MSS, liquidityUsed.liquidityId, liquidityUsed);
        }
    }

    private makeMssTriggerTakeProfit(mss: IMSS, candle: ICandle) {
        const index: number = this.marketShifts.getAll().findIndex((e) => e.id === mss.id);

        if (index >= 0) {
            logger.info(`mss updated takeprofit: ${JSON.stringify(mss)}`);

            const signal = this.generalStore.state.Signal.signals.getAll().find((s) => s.triggerId === mss.id);
            if (!signal) return;
            if (signal.status !== SignalStatus.TRIGGERED) return;

            this.marketShifts.updateByIndex(index, "status", TriggerStatus.TAKEPROFIT);
            
            const liquidityUsed: LiquidityUsed = {
                liquidityId: mss.liquidityUsed.liquidityId,
                status: LiquidityUsedStatus.TAKEPROFIT,
                time: mss.liquidityUsed.time,
                trigger: mss.liquidityUsed.trigger,
                triggerId: mss.id,
            };
            this.marketShifts.updateByIndex(index, "liquidityUsed", liquidityUsed);

            const signalIndex = this.generalStore.state.Signal.signals.getAll().findIndex((s) => s.id === signal.id);

            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "formationToCloseTime", Math.abs((mss.formationTime as Moment).diff(candle.time.utc) as number));
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "triggerToCloseTime", Math.abs((signal.entryTime as Moment).diff(candle.time.utc) as number));
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "closedTime", candle.time.utc);
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "status", SignalStatus.TAKEPROFIT);
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "time", candle.time);
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "liquidityUsed", liquidityUsed);
            this.generalStore.state.Liquidity.updateUsed(mss.id, Triggers.MSS, liquidityUsed.liquidityId, liquidityUsed);
        }
    }

    updateMSS(candle: ICandle) {
        const founds = this.generalStore.state.MSS.marketShifts.getAll().filter((e) => e.status === TriggerStatus.FOUND && e.pairPeriod.pair === candle.pairPeriod.pair);

        founds.forEach((item) => {
            this.updateMssData(item, candle);
            // this.checkMssFailure(item, candle);

            // renew the mss data for the function
            const mss = this.marketShifts.getById(item.id) as IMSS;
            if (mss.status !== TriggerStatus.FOUND) return;

            if (this.generalStore.globalStates.systemMode === SystemMode.LIVE) this.makeMssTriggered(mss, candle)
            else {
                if (mss.direction === Directions.DOWN && candle.low <= mss.limit) this.makeMssTriggered(mss, candle);
                else if (mss.direction === Directions.UP && candle.high >= mss.limit) this.makeMssTriggered(mss, candle);
            }
        });

        const triggered = this.generalStore.state.MSS.marketShifts.getAll().filter((e) => e.status === TriggerStatus.TRIGGERED && e.pairPeriod.pair === candle.pairPeriod.pair);
        triggered.forEach((mss) => {
            const signal = this.generalStore.state.Signal.signals.getAll().find((s) => s.triggerId === mss.id);
            if (!signal || !signal.entryTime) return;

            // Skip candles older than or equal to the entry time
            if (candle.time.utc.isBefore(signal.entryTime)) return;

            const status = this.evaluateSignal(signal, candle);

            if (status === SignalStatus.STOPLOSS) this.makeMssTriggerStopLoss(mss, candle);
            else if (status === SignalStatus.TAKEPROFIT) this.makeMssTriggerTakeProfit(mss, candle);
        });
    }

    private evaluateSignal(signal: ISignal, candle: ICandle): SignalStatus.STOPLOSS | SignalStatus.TAKEPROFIT | undefined {
        // Assuming signal.direction is either 'DOWN' or 'UP'
        if (signal.direction === Directions.DOWN) {
            if (candle.high >= signal.stoploss) return SignalStatus.STOPLOSS
            else if (candle.low <= signal.takeprofit) return SignalStatus.TAKEPROFIT
        } else if (signal.direction === Directions.UP) {
            if (candle.low <= signal.stoploss) return SignalStatus.STOPLOSS
            else if (candle.high >= signal.takeprofit) return SignalStatus.TAKEPROFIT
        }
    }

    private checkMssFailure(mss: IMSS, candle: ICandle): void {
        if (this.checkHeightLimitFailure(mss, candle)) return;
        if (this.checkSecondDeepToMssCandleDiffFailure(mss, candle)) return;
        if (this.checkMssCandleToTriggerCandleDiffFailure(mss, candle)) return;
        // if (this.checkExpirationTimeFailure(mss, candle)) return;
    }

    private checkExpirationTimeFailure(mss: IMSS, candle: ICandle): boolean {
        const signal = this.generalStore.state.Signal.signals.getAll().find(s => s.trigger === Triggers.MSS && s.triggerId === mss.id);
        if (!signal || !signal.formationToTriggerTime) return false;

        const mssTillDownSecond = (mss.dateTime as Moment).diff(candle.time.utc) / 1000;
        if (mssTillDownSecond >= 1800) return this.makeMssFailed(mss, candle);

        return false;
    }

    private checkHeightLimitFailure(mss: IMSS, candle: ICandle): boolean {
        const bigHeightLimit = this.generalStore.state.Setting.getOne("MSSBigHeightLimit")?.settingValueParsed as number;
        const marketUtils = useMarketUtils();

        const heightPip = marketUtils.methods.toPip(mss.height);
        if (heightPip >= bigHeightLimit) return this.makeMssFailed(mss, candle);

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

    updateMssData(mss: IMSS, candle: ICandle) {
        const mssIndex = this.marketShifts.getAll().findIndex((e) => e.id === mss.id);
        if (!mssIndex) return;

        const secondDeepCandle = this.generalStore.state.Candle.getCandle(mss.secondDeepCandle);
        const mainDeepCandle = this.generalStore.state.Candle.getCandle(mss.mainDeepCandle);
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
            if (limit) {
                newData.limit = limit;
                // this.marketShifts.updateByIndex(mssIndex, "limit", newData.limit);
            }
        }

        const stoploss = this.findStopLoss(mainDeepCandle, mss.direction);
        if (stoploss) {
            newData.stoploss = stoploss;
            // this.marketShifts.updateByIndex(mssIndex, "stoploss", newData.stoploss);
        }

        const takeprofit = this.findTakeProfit(newData.limit, newData.stoploss, mss.direction);
        if (takeprofit) {
            newData.takeprofit = takeprofit;
            // this.marketShifts.updateByIndex(mssIndex, "takeprofit", newData.takeprofit);
        }

        const height = this.calculateHeight(
            newData.stoploss,
            newData.limit,
            mss.direction
        );
        if (height) {
            newData.height = height;
            // this.marketShifts.updateByIndex(mssIndex, "height", newData.height);
        }

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
     * @param data = [ICandle, ICandle] as [highestHigh, lowestLow]
     * @param direction as Enums.Directions
     * @returns
     */
    private detectMainDeep(data: [ICandle | undefined, ICandle | undefined], direction: Directions): ICandle | undefined {
        let result: ICandle | undefined = undefined;

        if (direction === Directions.DOWN && data[0]) result = data[0];
        else if (direction === Directions.UP && data[1]) result = data[1];

        return result;
    }

    private findMssCandle(mainDeep: ICandle, limitCandle: ICandle, liveCandle: ICandle, direction: Directions): ICandle | undefined {
        const candles = this.generalStore.state.Candle.candles.getAfter(liveCandle.pairPeriod, mainDeep.time.unix);
        candles.sort((a, b) => a.time.unix - b.time.unix);

        if (direction === Directions.DOWN) return candles.find(c => c.low <= limitCandle.low);
        else if (direction === Directions.UP) return candles.find(c => c.high >= limitCandle.high);

        return undefined;
    }

    private findLowestLow(candles: ICandle[] = []): ICandle | undefined {
        const tempCandles = [...candles.filter(c => c.isDeep === CandleDeepType.LOW)];
        tempCandles.sort((a, b) => a.low - b.low);
        if (!tempCandles.length) return undefined;

        return tempCandles[0];
    }

    private findHighestHigh(candles: ICandle[] = []): ICandle | undefined {
        const tempCandles = [...candles.filter(c => c.isDeep === CandleDeepType.HIGH)];
        tempCandles.sort((a, b) => b.high - a.high);
        if (!tempCandles.length) return undefined;

        return tempCandles[0];
    }

    findLowBeforeHighestHigh(candles: ICandle[] = [], highestHigh: ICandle | undefined): ICandle | undefined {
        if (!highestHigh) return undefined;

        const tempCandles = [...candles];
        tempCandles.sort((a, b) => b.time.unix - a.time.unix);

        return tempCandles.find(c =>
            c.time.unix < highestHigh.time.unix && c.isDeep === CandleDeepType.LOW
        );
    }

    findHighBeforeLowestLow(candles: ICandle[] = [], lowestLow: ICandle | undefined): ICandle | undefined {
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
    findLimit(candles: ICandle[] = [], direction: Directions, mainDeep: ICandle): ICandle | undefined {
        if (!candles.length) return;

        let limit: ICandle | undefined;

        if (direction === Directions.DOWN)
            limit = this.findLowBeforeHighestHigh(candles, mainDeep) ?? undefined;
        else if (direction === Directions.UP)
            limit = this.findHighBeforeLowestLow(candles, mainDeep) ?? undefined;

        return limit;
    }

    findStopLoss(mainDeep: ICandle, direction: Directions): number | null {
        let stopLoss: number | null = null;
        const vars = this.getVariables();

        if (direction === Directions.DOWN)
            // stopLoss = mainDeep.high + vars.stopLossError;
            stopLoss = mainDeep.high;
        else if (direction === Directions.UP)
            // stopLoss = mainDeep.low - vars.stopLossError;
            stopLoss = mainDeep.low;

        return stopLoss;
    }

    findTakeProfit(limit: number, stopLoss: number, direction: Directions): number | null {
        let takeProfit: number | null = null;
        const vars = this.getVariables();

        if (direction === Directions.DOWN)
            takeProfit =
                // limit - (stopLoss - limit) * vars.riskReward - vars.takeProfitError;
                limit - (stopLoss - limit) * vars.riskReward;
        else if (direction === Directions.UP)
            takeProfit =
                // limit + (limit - stopLoss) * vars.riskReward + vars.takeProfitError;
                limit + (limit - stopLoss) * vars.riskReward;

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

    calculateHeight(limit: number, stoploss: number, direction: Directions): number | null {
        let height: number | null = null;
        if (!limit || !stoploss) return null;

        if (direction === Directions.DOWN) height = stoploss - limit;
        else if (direction === Directions.UP) height = limit - stoploss;

        return height;
    }

    getVariables() {
        return {
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
    }

    getMaxId(): number {
        return this.maxId;
    }

    getIndexById(id: number): number | undefined {
        return this.indexMap.get(id);
    }
}
