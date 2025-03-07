import logger from "@shared/Initiatives/Logger.ts";
import {GeneralStore} from "@shared/Types/Interfaces/generalStore.ts";
import {modelOne} from "@tradingBot/Features/Core/Controllers/flows.ts";
import {SystemMode} from "@shared/Types/Enums.js";
import {io} from "socket.io-client";
import {IPosition} from "@shared/Types/Interfaces/general.js";

export default async (generalStore: GeneralStore) => {
    try {
        if (generalStore.globalStates.systemMode === SystemMode.LIVE) {
            // const buyOrder: IPosition = {
            //     symbol: "EURUSD",
            //     volume: 0.5,
            //     price: 1.08000,
            //     sl: 1.07700,
            //     tp: 1.08300,
            //     direction: "BUY"
            // };
            // const sellOrder: IPosition = {
            //     symbol: "EURUSD",
            //     volume: 0.5,
            //     price: 1.07500,
            //     sl: 1.07800,
            //     tp: 1.07200,
            //     direction: "SELL"
            // };
            //
            // await generalStore.state.Signal.openPosition(buyOrder);

            await runCandleStreamFlow(generalStore, modelOne);
        }
    } catch (err) {
        console.log(err);
        logger.error(err);
    }
}

async function runCandleStreamFlow(generalStore: GeneralStore, model: Function) {
    const socket = io('http://localhost:5000', {
        transports: ['websocket'],
        reconnection: true
    });

    const currencies = await generalStore.state.Prisma.currency.findMany();
    socket.on('connect', () => {
        console.log('Connected!');
        logger.info(`socket connected: ${currencies.map(c => c.name)} in PERIOD_M1`);

        socket.emit('start_candle_stream', {
            subscriptions: currencies.map(c => ({symbol: c.name, timeframe: "PERIOD_M1"}))
        });
    });

    socket.on('new_candle', async (candle) => {
        logger.info(`new candle from stream: ${JSON.stringify(candle)}`);
        console.log(`${candle["closeTime"]}: New ${candle["period"]} candle for ${candle["name"]}:`);

        await generalStore.state.Candle.processCandles([candle], model);
    });

    socket.on('error', (error) => {
        logger.error(`socket error: ${JSON.stringify(error)}`);
        console.error('Error:', error);
    });
}