import {ICandle, ICOB, ILiquidity, IPosition, ISignal, LiquidityUsed} from "@shared/Types/Interfaces/general.ts";
import Query from "@shared/Queries.ts";
import {GeneralStore} from "@shared/Types/Interfaces/generalStore.ts";
import logger from "@shared/Initiatives/Logger.ts";
import {
    CandleDeepType,
    CandleDirection, CobState,
    Directions,
    LiquidityUsedStatus, SignalStatus, SystemMode,
    Triggers,
    TriggerStatus,
} from "@shared/Types/Enums.ts";
import {CircularBuffer} from "@tradingBot/Features/Core/CircularBuffer.ts";
import {
    isBodyCandlesValid,
    isConfirmCandleValid,
    isStartCandleValid,
} from "@tradingBot/Features/Features/COB/Validations.ts";
import {useMarketUtils} from "@shared/Utilities/marketUtils.js";
import * as Enums from "@shared/Types/Enums.js";

export default class CandleOrderBlock {
    public orderBlocks: CircularBuffer<ICOB>;
    private readonly generalStore: GeneralStore;
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
        if (!liquidities || !liquidities.length) return;

        liquidities.sort((a, b) => (b.hunted?.unix ?? 0) - (a.hunted?.unix ?? 0));
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

        const newId = ++this.maxId;
        const cob: ICOB = {
            id: newId,
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
                triggerId: newId
            },
        };

        this.orderBlocks.add(cob);
    }

    updateCOB(candle: ICandle) {
        // const triggered = this.orderBlocks
        //     .getAll([["status", TriggerStatus.TRIGGERED]])
        //     .filter(
        //         (cob) =>
        //             cob.pairPeriod.pair === candle.pairPeriod.pair &&
        //             cob.pairPeriod.period === candle.pairPeriod.period
        //     );
        // const found = this.orderBlocks
        //     .getAll([["status", TriggerStatus.FOUND]])
        //     .filter(
        //         (cob) =>
        //             cob.pairPeriod.pair === candle.pairPeriod.pair &&
        //             cob.pairPeriod.period === candle.pairPeriod.period
        //     );
        //
        // for (let i = 0; i < found.length; i++) {
        //     const cob = found[i];
        //
        //     if (cob.direction === Directions.DOWN) {
        //         if (cob.limit >= candle.low)
        //             this.orderBlocks.updateById(
        //                 cob.id,
        //                 "status",
        //                 TriggerStatus.TRIGGERED
        //             );
        //     } else if (cob.direction === Directions.UP) {
        //         if (cob.limit <= candle.high)
        //             this.orderBlocks.updateById(
        //                 cob.id,
        //                 "status",
        //                 TriggerStatus.TRIGGERED
        //             );
        //     }
        // }
        //
        // for (let i = 0; i < triggered.length; i++) {
        //     const cob = triggered[i];
        //
        //     if (cob.direction === Directions.DOWN) {
        //         if (cob.takeprofit >= candle.low) {
        //             this.orderBlocks.updateById(
        //                 cob.id,
        //                 "status",
        //                 TriggerStatus.TAKEPROFIT
        //             );
        //         } else if (cob.stoploss <= candle.high) {
        //             this.orderBlocks.updateById(cob.id, "status", TriggerStatus.STOPLOSS);
        //         }
        //     } else if (cob.direction === Directions.UP) {
        //         if (cob.takeprofit <= candle.high) {
        //             this.orderBlocks.updateById(
        //                 cob.id,
        //                 "status",
        //                 TriggerStatus.TAKEPROFIT
        //             );
        //         } else if (cob.stoploss >= candle.low) {
        //             this.orderBlocks.updateById(cob.id, "status", TriggerStatus.STOPLOSS);
        //         }
        //     }
        // }


        const founds = this.generalStore.state.COB.orderBlocks
            .getAll().filter((e) => e.status === TriggerStatus.FOUND);
        founds.forEach((item) => {
            this.updateCobData(item, candle);
            this.checkCobFailure(item, candle);

            // renew the cob data for the function
            const cob = this.orderBlocks.getById(item.id);
            if (!cob) return;

            if (cob.direction === Directions.DOWN && candle.low <= cob.limit) this.makeCobTriggered(cob, candle);
            if (cob.direction === Directions.UP && candle.high >= cob.limit) this.makeCobTriggered(cob, candle);
        });

        const triggered = this.generalStore.state.COB.orderBlocks
            .getAll().filter((e) => e.status === TriggerStatus.TRIGGERED);
        triggered.forEach((cob) => {
            if (cob.direction === Directions.DOWN) {
                if (candle.high >= cob.stoploss)
                    this.makeCobTriggerStopLoss(cob, candle);
                else if (candle.low <= cob.takeprofit)
                    this.makeCobTriggerTakeProfit(cob, candle);
            } else if (cob.direction === Directions.UP) {
                if (candle.low <= cob.stoploss)
                    this.makeCobTriggerStopLoss(cob, candle);
                else if (candle.high >= cob.takeprofit)
                    this.makeCobTriggerTakeProfit(cob, candle);
            }
        });
    }

    private checkCobFailure(cob: ICOB, candle: ICandle): void {
        // if (this.checkHeightLimitFailure(cob, candle)) return;
        // if (this.checkSecondDeepToCobCandleDiffFailure(cob, candle)) return;
        // if (this.checkCobCandleToTriggerCandleDiffFailure(cob, candle)) return;
    }

    // private checkHeightLimitFailure(cob: ICOB, candle: ICandle): boolean {
    //     const bigHeightLimit = this.generalStore.state.Setting
    //         .getOne("CobBigHeightLimit")?.settingValueParsed as number;
    //     const marketUtils = useMarketUtils();
    //
    //     const heightPip = marketUtils.methods.toPip(cob.height);
    //     if (heightPip >= bigHeightLimit) return this.makeCobFailed(cob, candle);
    //
    //     return false;
    // }

    // private checkSecondDeepToCobCandleDiffFailure(cob: ICOB, candle: ICandle): boolean {
    //     const secondDeepToCobCandleDiff = this.generalStore.state.Setting.getOne(
    //         "MSSSecondDeepToMssCandleDiff"
    //     )?.settingValueParsed as number;
    //
    //     const secondDeepCandle = this.generalStore.state.Candle.getCandle(
    //         mss.secondDeepCandle
    //     );
    //
    //     if (!secondDeepCandle) return this.makeMssFailed(mss, candle);
    //     let candles = this.generalStore.state.Candle.candles.getRangeOfCandles(
    //         candle.pairPeriod,
    //         secondDeepCandle.time.unix,
    //         secondDeepToMssCandleDiff
    //     );
    //
    //     const isExists = candles.find((c) => c.id === mss.mssCandle);
    //     if (!isExists) return this.makeMssFailed(mss, candle);
    //
    //     return false;
    // }
    //
    // private checkCobCandleToTriggerCandleDiffFailure(mss: ICOB, candle: ICandle): boolean {
    //     const mssCandleToTriggerCandleDiff = this.generalStore.state.Setting.getOne(
    //         "MSSMssCandleToTriggerCandleDiff"
    //     )?.settingValueParsed as number;
    //
    //     const mssCandle = this.generalStore.state.Candle.getCandle(mss.mssCandle);
    //     if (!mssCandle) return this.makeMssFailed(mss, candle);
    //
    //     const candles = this.generalStore.state.Candle.candles.getRangeOfCandles(
    //         mss.pairPeriod,
    //         mssCandle.time.unix,
    //         mssCandleToTriggerCandleDiff
    //     );
    //
    //     const isExists = candles.find((c) => c.id === mss.triggerCandle);
    //     if (!isExists) return this.makeMssFailed(mss, candle);
    //
    //     return false;
    // }

    // private makeCobFailed(cob: ICOB, candle: ICandle): boolean {
    //     const index: number = this.orderBlocks
    //         .getAll().findIndex((e) => e.id === cob.id);
    //
    //     if (index >= 0) {
    //         // this.orderBlocks.updateByIndex(index, "state", CobState.UPDATED);
    //         this.orderBlocks.updateByIndex(index, "status", TriggerStatus.FAILED);
    //         const newLiquidityUsed: LiquidityUsed = {
    //             liquidityId: cob.liquidityUsed.liquidityId,
    //             status: LiquidityUsedStatus.FAILED,
    //             time: candle.time,
    //             trigger: cob.liquidityUsed.trigger,
    //             triggerId: cob.id,
    //         };
    //         this.orderBlocks.updateByIndex(index, "liquidityUsed", newLiquidityUsed);
    //
    //         const signal = this.generalStore.state.Signal.signals
    //             .getAll().find((s) => s.triggerId === cob.id);
    //         if (!signal) return true;
    //
    //         const signalIndex = this.generalStore.state.Signal.signals
    //             .getAll().findIndex((s) => s.id === signal.id);
    //
    //         this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "status", SignalStatus.CLOSED);
    //         this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "time", candle.time);
    //         this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "liquidityUsed", newLiquidityUsed);
    //         this.generalStore.state.Liquidity.updateUsed(cob.id, Triggers.COB, newLiquidityUsed.liquidityId, newLiquidityUsed);
    //     }
    //
    //     return true;
    // }

    private async makeCobTriggered(cob: ICOB, candle: ICandle) {
        const index: number = this.orderBlocks.getAll().findIndex((e) => e.id === cob.id);

        if (index >= 0) {
            this.orderBlocks.updateByIndex(index, "status", TriggerStatus.TRIGGERED);
            const newLiquidityUsed: LiquidityUsed = {
                liquidityId: cob.liquidityUsed.liquidityId,
                status: LiquidityUsedStatus.TRIGGERED,
                time: candle.time,
                trigger: cob.liquidityUsed.trigger,
                triggerId: cob.id,
            };
            this.orderBlocks.updateByIndex(index, "liquidityUsed", newLiquidityUsed);

            const signal: ISignal = {
                id: 0, // will be overrided in Signal class
                triggerCandleId: candle.id,
                triggerId: cob.id,
                trigger: Triggers.COB,
                direction: cob.direction,
                limit: cob.limit,
                stoploss: cob.stoploss,
                takeprofit: cob.takeprofit,
                pairPeriod: cob.pairPeriod,
                status: SignalStatus.TRIGGERED,
                time: candle.time,
                liquidityUsed: newLiquidityUsed,
            };
            this.generalStore.state.Signal.add(signal);
            this.generalStore.state.Liquidity.addNewUsed(cob.id, Triggers.COB, newLiquidityUsed.liquidityId, newLiquidityUsed);
            this.generalStore.state.Liquidity.updateUsed(cob.id, Triggers.COB, newLiquidityUsed.liquidityId, newLiquidityUsed);
            logger.info(`new signal: ${JSON.stringify(signal)}`);

            if (this.generalStore.globalStates.systemMode === SystemMode.LIVE) {
                const positionData: IPosition = {
                    symbol: signal.pairPeriod.pair as string,
                    volume: 0.01,
                    price: signal.limit,
                    sl: signal.stoploss as number,
                    tp: signal.takeprofit as number,
                    direction: "BUY"
                }

                if (signal.direction === Enums.Directions.UP) {
                    positionData.direction = "BUY";
                    if ((positionData.price - (positionData.sl as number)) < 0.0003) return;
                } else if (signal.direction === Enums.Directions.DOWN) {
                    positionData.direction = "SELL";
                    if (((positionData.sl as number) - positionData.price) < 0.0003) return;
                }

                await this.generalStore.state.Signal.openPosition(positionData);
            }
        }
    }

    private makeCobTriggerStopLoss(cob: ICOB, candle: ICandle) {
        const index: number = this.orderBlocks
            .getAll().findIndex((e) => e.id === cob.id);

        if (index >= 0) {
            this.orderBlocks.updateByIndex(index, "status", TriggerStatus.STOPLOSS);
            const liquidityUsed: LiquidityUsed = {
                liquidityId: cob.liquidityUsed.liquidityId,
                status: LiquidityUsedStatus.STOPLOSS,
                time: cob.liquidityUsed.time,
                trigger: cob.liquidityUsed.trigger,
                triggerId: cob.id
            };
            this.orderBlocks.updateByIndex(index, "liquidityUsed", liquidityUsed);

            const signal = this.generalStore.state.Signal.signals
                .getAll().find((s) => s.triggerId === cob.id);
            if (!signal) return;

            const signalIndex = this.generalStore.state.Signal.signals
                .getAll().findIndex((s) => s.id === signal.id);

            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "status", SignalStatus.STOPLOSS);
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "time", candle.time);
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "liquidityUsed", liquidityUsed);
            this.generalStore.state.Liquidity.updateUsed(cob.id, Triggers.COB, liquidityUsed.liquidityId, liquidityUsed);
        }
    }

    private makeCobTriggerTakeProfit(cob: ICOB, candle: ICandle) {
        const index: number = this.orderBlocks
            .getAll().findIndex((e) => e.id === cob.id);

        if (index >= 0) {
            this.orderBlocks.updateByIndex(index, "status", TriggerStatus.TAKEPROFIT);
            const liquidityUsed: LiquidityUsed = {
                liquidityId: cob.liquidityUsed.liquidityId,
                status: LiquidityUsedStatus.TAKEPROFIT,
                time: cob.liquidityUsed.time,
                trigger: cob.liquidityUsed.trigger,
                triggerId: cob.id,
            };
            this.orderBlocks.updateByIndex(index, "liquidityUsed", liquidityUsed);

            const signal = this.generalStore.state.Signal.signals
                .getAll().find((s) => s.triggerId === cob.id);
            if (!signal) return;

            const signalIndex = this.generalStore.state.Signal.signals
                .getAll().findIndex((s) => s.id === signal.id);

            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "status", SignalStatus.TAKEPROFIT);
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "time", candle.time);
            this.generalStore.state.Signal.signals.updateByIndex(signalIndex, "liquidityUsed", liquidityUsed);
            this.generalStore.state.Liquidity.updateUsed(cob.id, Triggers.COB, liquidityUsed.liquidityId, liquidityUsed);
        }
    }

    updateCobData(cob: ICOB, candle: ICandle) {
        return; // todo: needs to get done
        // const cobIndex = this.orderBlocks.getAll()
        //     .findIndex((e) => e.id === cob.id);
        // if (!cobIndex) return;

        // const secondDeepCandle = this.generalStore.state.Candle.getCandle(cob.secondDeepCandle);
        // const mainDeepCandle = this.generalStore.state.Candle.getCandle(cob.mainDeepCandle);
        // if (!secondDeepCandle || !mainDeepCandle) return;
        //
        // const candles = this.generalStore.state.Candle?.candles.getAfter(
        //     candle.pairPeriod,
        //     secondDeepCandle.time.unix
        // );
        //
        // const newData = {
        //     limit: mss.limit,
        //     takeprofit: mss.takeprofit,
        //     stoploss: mss.stoploss,
        //     height: mss.height,
        // };
        //
        // const limitCandle = this.findLimit(candles, mss.direction, mainDeepCandle);
        // if (limitCandle) {
        //     const limit = this.limitCandleToNumber(limitCandle, mss);
        //     if (limit) newData.limit = limit;
        // }
        //
        // const stoploss = this.findStopLoss(mainDeepCandle, mss.direction);
        // if (stoploss) newData.stoploss = stoploss;
        //
        // const takeprofit = this.findTakeProfit(newData.limit, newData.stoploss, mss.direction);
        // if (takeprofit) newData.takeprofit = takeprofit;
        //
        // const height = this.calculateHeight(
        //     newData.stoploss,
        //     newData.limit,
        //     mss.direction
        // );
        // if (height) newData.height = height;
        //
        // this.marketShifts.updateByIndex(mssIndex, "limit", newData.limit);
        // this.marketShifts.updateByIndex(mssIndex, "stoploss", newData.stoploss);
        // this.marketShifts.updateByIndex(mssIndex, "takeprofit", newData.takeprofit);
        // this.marketShifts.updateByIndex(mssIndex, "height", newData.height);
    }

    getVariables() {
        const data: any = {
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
