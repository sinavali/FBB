import {
    CandleProcess,
    ICandle,
    IChunkOptions,
    IQuery,
} from "@shared/Types/Interfaces/general.ts";
import Query from "@shared/Queries.ts";
import {GeneralStore} from "@shared/Types/Interfaces/generalStore.ts";
import logger from "@shared/Initiatives/Logger.ts";
import {CandleDeepType, CandleDirection} from "@shared/Types/Enums.ts";
import {useMarketUtils} from "@shared/Utilities/marketUtils.ts";
import moment from "moment-timezone";
import {CircularBuffer} from "@tradingBot/Features/Core/CircularBuffer.ts";
import {PairPeriod} from "@shared/Types/Interfaces/common.ts";

export class CandleCircularBuffer extends CircularBuffer<ICandle> {
    getAfter(pairPeriod: PairPeriod, from: number): ICandle[] {
        const temp = this.getAll();
        const res = [];
        for (let i = 0; i < temp.length; i++) {
            const c = temp[i];
            if (
                c.pairPeriod.pair === pairPeriod.pair &&
                c.pairPeriod.period === pairPeriod.period &&
                c.time.unix >= from
            )
                res.push(c);
        }
        return res;
    }

    /**
     * Get items from a starting index, taking a specified number of items.
     * @param pairPeriod - pair and period of typeof PairPeriod
     * @param from - The starting index (distance from the newest item).
     * @param take - The number of items to retrieve. If null or 0, retrieve all items from `from` to the newest item.
     * @returns An array of items in the specified range.
     */
    getRangeOfCandles(pairPeriod: PairPeriod, from: number, take?: number): ICandle[] {
        // Validate `from`
        if (from < 0 || from >= this.size) return []; // `from` is out of bounds

        // Calculate the number of items to take
        const numToTake = !take ? this.size - from : Math.min(take, this.size - from);

        // Extract the range
        const result: ICandle[] = [];

        let i = 0;
        while (result.length <= numToTake) {
            const item = this.buffer[(this.start + from + i) % this.capacity];
            if (item && item.pairPeriod.pair === pairPeriod.pair && item.pairPeriod.period === pairPeriod.period)
                result.push(item);

            i++; // iterate on buffer items
        }

        return result; // in newest-to-oldest order
    }
}

export default class Candle {
    public candles: CandleCircularBuffer;
    private readonly generalStore: GeneralStore;
    public queryClass: Query;
    private indexMap: Map<number, number> = new Map();
    private maxId: number = 0;

    // capacity = 22000 means 2 weeks and 4 days of 1-minute candles
    constructor(generalStoreInstance: GeneralStore, capacity: number = 5000) {
        this.generalStore = generalStoreInstance;
        this.queryClass = new Query(this.generalStore);
        this.candles = new CandleCircularBuffer(capacity);
    }

    async getCount(from: number, to: number): Promise<number> {
        const countOfCandlesQuery: IQuery = this.queryClass.getById(4);
        const [[res]]: any = await this.queryClass.exec(true, countOfCandlesQuery, [
            from,
            to,
        ]);

        if (!res || res instanceof Error)
            throw new Error(
                `Could not get count of candles: queryId=> 4 - queryName=> ${countOfCandlesQuery.name}`
            );

        return res.count;
    }

    async getCandles(
        from: number,
        to: number,
        chunkSize: number
    ): Promise<ICandle[]> {
        const countOfCandlesQuery: IQuery = this.queryClass.getById(3);
        const res: any = await this.queryClass.exec(
            true,
            countOfCandlesQuery,
            [from, to],
            chunkSize
        );

        if (!res || res instanceof Error)
            throw new Error(
                `Could not get candles: queryId=> 3 - queryName=> ${countOfCandlesQuery.name}`
            );

        return res;
    }

    getCandle(id: number): ICandle | null {
        const index = this.getIndexById(id);
        return index !== undefined ? this.candles.get(index) : null;
    }

    async startCandleProcesses(params: CandleProcess, model: Function): Promise<void> {
        try {
            const chunkOptions: IChunkOptions = {
                ...params,
                latestTime: params.from,
                lastTime: params.to,
            };

            const totalCandles = await this.getCount(
                chunkOptions.latestTime,
                chunkOptions.to
            );
            logger.info(`Total candles => ${totalCandles}`);
            console.log(`Total candles => ${totalCandles}`);

            await this.processChunks(chunkOptions, model);
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    async processChunks(chunkOptions: IChunkOptions, model: Function): Promise<void> {
        try {
            console.log(`chunk-size=${chunkOptions.chunkSize}`);
            let i = 1;
            let lastDoneId = this.generalStore.state.Candle?.candles.getNewest()?.id;
            do {
                const newChunkLogText = `--------------new chunk [${i}] [lastest candle id: ${lastDoneId}] ---------------`;
                console.log(newChunkLogText);
                logger.info(newChunkLogText);

                console.time("chunk time");
                const chunkResult = await this.processChunk(chunkOptions, model);
                console.timeEnd("chunk time");

                console.log("\n");

                if (!chunkResult) break;

                console.log(this.generalStore.state.Time.getAll());

                lastDoneId = this.generalStore.state.Candle?.candles.getNewest()?.id;
                i++;
            } while (true);
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    async processChunk(chunkOptions: IChunkOptions, model: Function): Promise<boolean> {
        try {
            const [candles]: any = await this.getCandles(
                chunkOptions.latestTime,
                chunkOptions.lastTime,
                chunkOptions.chunkSize
            );

            if (!Array.isArray(candles) || !candles.length) return false;

            await this.processCandles(candles, model);
            chunkOptions.latestTime = candles[candles.length - 1].closeTime + 1;

            return true;
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    async processCandles(candles: any, model: Function): Promise<void> {
        for (const candle of candles || []) {
            try {
                let startTime = new Date().getTime();
                const processedCandle = this.processCandle(candle);
                this.candles.add(processedCandle);

                // Remove old entries from the indexMap
                if (this.candles.getSize() > this.candles.getCapacity()) {
                    const overwrittenItem = this.candles.getOldest();
                    if (overwrittenItem) this.indexMap.delete(overwrittenItem.id);
                }

                this.indexMap.set(processedCandle.id, this.candles.getSize() - 1);
                this.processDeep(processedCandle.id, processedCandle.pairPeriod);

                await model(this.generalStore);
                console.log(processedCandle)
                
                this.generalStore.state.Time.add("processCandles each candle Loop", new Date().getTime() - startTime);
            } catch (error) {
                console.log(error);
                logger.error(error);
            }
        }
    }

    processCandle(candle: any): ICandle {
        try {
            const id = ++this.maxId;

            return {
                id,
                isFVG: null,
                close: parseFloat(candle.close),
                open: parseFloat(candle.open),
                high: parseFloat(candle.high),
                low: parseFloat(candle.low),
                pairPeriod: {pair: candle.name, period: candle.period},
                direction: this.processCandleDirection(candle),
                isDeep: null,
                time: {
                    unix: candle.closeTime,
                    utc: moment.utc(candle.closeTime * 1000),
                },
            };
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    processDeep(id: number, pairPeriod: PairPeriod): void {
        const candles = this.candles.getRangeOfCandles(pairPeriod, 5, 0);
        if (!candles || !candles.length) return;

        const after = candles[0];
        const middle = candles[1];
        const before = candles[2];

        if (!after) {
            console.error(`Missing candles for deep processing [after]: ${id}`);
            logger.error(`Missing candles for deep processing [after]: ${id}`);
            return;
        } else if (!middle) {
            console.error(`Missing candles for deep processing [middle]: ${id}`);
            logger.error(`Missing candles for deep processing [middle]: ${id}`);
            return;
        } else if (!before) {
            console.error(`Missing candles for deep processing [before]: ${id}`);
            logger.error(`Missing candles for deep processing [before]: ${id}`);
            return;
        }

        // Process "isDeep" property
        if (
            before.low > middle.low &&
            middle.low < after.low &&
            before.high < middle.high &&
            middle.high > after.high
        ) {
            this.generalStore.state.Candle?.candles.updateById(
                middle.id,
                "isDeep",
                CandleDeepType.BOTH
            );
        } else if (before.low > middle.low && middle.low < after.low) {
            this.generalStore.state.Candle?.candles.updateById(
                middle.id,
                "isDeep",
                CandleDeepType.LOW
            );
        } else if (before.high < middle.high && middle.high > after.high) {
            this.generalStore.state.Candle?.candles.updateById(
                middle.id,
                "isDeep",
                CandleDeepType.HIGH
            );
        } else {
            this.generalStore.state.Candle?.candles.updateById(
                middle.id,
                "isDeep",
                null
            );
        }
    }

    getCandlesBetween(start: number, end: number, pairPeriod: PairPeriod) {
        return this.candles
            .getAll()
            .filter(
                (c) =>
                    c.pairPeriod.pair === pairPeriod.pair &&
                    c.pairPeriod.period === pairPeriod.period &&
                    c.time.unix >= start &&
                    c.time.unix <= end
            );
    }

    processCandleDirection(candle: ICandle): CandleDirection {
        try {
            const marketUtils = useMarketUtils();
            const pipDiff = marketUtils.methods.getPipDiff(candle.high, candle.low);

            let candleDirectionBuff = 0.1;
            const candleDirectionBuffVar = this.generalStore.state.Setting.getOne(
                "CandleDirectionBuff"
            );
            if (candleDirectionBuffVar)
                candleDirectionBuff = parseFloat(candleDirectionBuffVar.settingValue);

            return pipDiff > candleDirectionBuff
                ? CandleDirection.UP
                : pipDiff < -candleDirectionBuff
                    ? CandleDirection.DOWN
                    : CandleDirection.IDLE;
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    getMaxId(): number {
        return this.maxId;
    }

    getIndexById(id: number): number | undefined {
        return this.indexMap.get(id);
    }
}
