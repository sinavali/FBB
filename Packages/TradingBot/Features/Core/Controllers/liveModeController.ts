import logger from "@shared/Initiatives/Logger.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import { modelOne } from "@tradingBot/Features/Core/Controllers/flows.ts";
import { Directions, LiquidityMode, Period, SystemMode } from "@shared/Types/Enums.js";
import { io } from "socket.io-client";
import moment from "moment-timezone";
import { ICandle, ILiquidity } from "@shared/Types/Interfaces/general.js";

export default async (generalStore: GeneralStore) => {
    try {
        if (generalStore.globalStates.systemMode !== SystemMode.LIVE) return;
        generalStore.state.Signal.turnOffLoadModeOn();

        const result = await initiateFirstTimeRunScript(generalStore);
        if (!result) throw "error in offload finding liquidities";
        generalStore.state.Signal.turnOffLoadModeOff();

        await runCandleStreamFlow(generalStore, modelOne);
    } catch (err) {
        console.log(err);
        logger.error(err);
    }
}

async function initiateFirstTimeRunScript(generalStore: GeneralStore) {
    try {
        const now = moment.utc();
        const dayOfWeek = now.day(); // 0 (Sunday) to 6 (Saturday)

        // need candles from start of week till now to push to backtest flow to validate liquidities
        const startOfWeek = now.clone().startOf("week");

        // need these to find last week's liquidities
        const startOfLastWeek = startOfWeek.clone().subtract(1, "days").startOf("week");
        const endOfLastWeek = startOfLastWeek.clone().add(1, 'week').startOf('week'); // instead of adding one minute, we get the start of next week that equals to end of last week

        // need these to find yesterday's liquidities
        let startOfLastBussinessDay;

        // Sunday, Saturday, or Monday
        if ([0, 1, 6].includes(dayOfWeek)) startOfLastBussinessDay = now.clone().startOf('day').subtract((dayOfWeek + 2) % 7, 'days').startOf('day');
        else startOfLastBussinessDay = now.clone().subtract(1, 'days').startOf('day');

        let lastWeekCandles: ICandle[] = [];
        let fromLastDayCandles: any[] = [];

        const currencies = await generalStore.state.Prisma.currency.findMany();
        for (const currency of currencies) {
            const lastWeekCandlesReq: any = await fetch("http://127.0.0.1:5000/last_week_candles_1d", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol: currency.name,
                    start: startOfLastWeek,
                    end: endOfLastWeek
                }),
            });
            console.log(currency.name, startOfLastWeek, endOfLastWeek)

            const lastDayCandlesReq: any = await fetch("http://127.0.0.1:5000/candles_from", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: currency.name, start: startOfWeek })
            });

            let temp: any = await lastWeekCandlesReq.json();
            console.log("Start and End of Last Week Candles: ", temp.candles[0], temp.candles[temp.candles.length - 1])
            temp = temp.candles;
            temp.forEach((c: ICandle) => lastWeekCandles.push(c))

            temp = await lastDayCandlesReq.json();
            console.log("Start and End of Last Day Candles: ", temp.candles[0], temp.candles[temp.candles.length - 1])
            temp = temp.candles;
            temp.forEach((c: any) => fromLastDayCandles.push(c))
        }

        lastWeekCandles = lastWeekCandles.map(c => generalStore.state.Candle.processCandle(c, false));
        lastWeekCandles.sort((a, b) => b.time.unix - a.time.unix);
        for (const currency of currencies) findWeeklyLiquiditiesOffLoaded(lastWeekCandles.filter(c => c.pairPeriod.pair === currency.name), currency.name, generalStore, startOfLastWeek, endOfLastWeek);

        fromLastDayCandles.sort((a, b) => a.closeTime - b.closeTime);
        if (!Array.isArray(fromLastDayCandles) || !fromLastDayCandles.length) return false;
        await generalStore.state.Candle.processCandles(fromLastDayCandles, modelOne);

        return true;
    } catch (error) {
        console.log(error)
    }
}

async function runCandleStreamFlow(generalStore: GeneralStore, model: Function) {
    const socket = io('http://127.0.0.1:5000', { transports: ['websocket'], reconnection: true });

    const currencies = await generalStore.state.Prisma.currency.findMany();
    socket.on('connect', () => {
        console.log('Connected!');
        logger.info(`socket connected: ${currencies.map(c => c.name)} in PERIOD_M1`);

        socket.emit('start_candle_stream', {
            subscriptions: currencies.map(c => ({ symbol: c.name, timeframe: "PERIOD_M1" }))
        });
    });

    socket.on('new_candles', async (candles) => {
        console.log(candles.length)
        // console.log(`${candles[0]["closeTime"]}: New ${candles[0]["period"]} candle for ${candles[0]["name"]}:`);


        // fill the lost connection gaps
        const allCandles = generalStore.state.Candle.candles.getAll();
        const set1 = new Set(allCandles.map(item => item.time.unix));
        candles = candles.filter((item: any) => !set1.has(item.closeTime));
        console.log(candles.length)

        await generalStore.state.Candle.processCandles(candles, model);
        console.log(generalStore.state.Candle.candles.getAll()[0])
    });

    socket.on('error', (error) => {
        logger.error(`socket error: ${JSON.stringify(error)}`);
        console.error('Error:', error);
    });
}

function findWeeklyLiquiditiesOffLoaded(candles: ICandle[], currency: string, generalStore: GeneralStore, startOfLastWeek: moment.Moment, endOfLastWeek: moment.Moment) {
    const temp = [...candles];

    temp.sort((a, b) => b.high - a.high);
    const highestHigh = { ...temp[0] };

    temp.sort((a, b) => a.low - b.low);
    const lowestLow = { ...temp[0] };

    const liquidities: ILiquidity[] = [
        {
            id: 0,
            pairPeriod: { pair: currency, period: Period.PERIOD_M1 },
            direction: Directions.UP,
            mode: LiquidityMode.WEEKLY,
            price: highestHigh.high,
            time: { utc: highestHigh.time.utc, unix: highestHigh.time.unix },
            failed: false,
            SMT: [],
            timeRange: {
                start: { utc: startOfLastWeek.clone().utc(), unix: startOfLastWeek.clone().utc().unix() },
                end: { utc: endOfLastWeek.clone().utc(), unix: endOfLastWeek.clone().utc().unix() }
            },
            used: [],
            highTouches: [{ utc: highestHigh.time.utc, unix: highestHigh.time.unix }],
            lowTouches: [{ utc: lowestLow.time.utc, unix: lowestLow.time.unix }],
        },
        {
            id: 1,
            pairPeriod: { pair: currency, period: Period.PERIOD_M1 },
            direction: Directions.DOWN,
            mode: LiquidityMode.WEEKLY,
            price: lowestLow.low,
            time: { utc: lowestLow.time.utc, unix: lowestLow.time.unix },
            failed: false,
            SMT: [],
            timeRange: {
                start: { utc: startOfLastWeek.clone().utc(), unix: startOfLastWeek.clone().utc().unix() },
                end: { utc: endOfLastWeek.clone().utc(), unix: endOfLastWeek.clone().utc().unix() }
            },
            used: [],
            highTouches: [{ utc: highestHigh.time.utc, unix: highestHigh.time.unix }],
            lowTouches: [{ utc: lowestLow.time.utc, unix: lowestLow.time.unix }],
        }
    ]

    liquidities.forEach(l => generalStore.state.Liquidity.addLiquidity({
        direction: l.direction,
        mode: l.mode,
        pairPeriod: l.pairPeriod,
        price: l.price,
        time: l.time,
        touches: l.direction === Directions.DOWN ? l.lowTouches : l.highTouches,
        timeRange: l.timeRange,
    }))
}