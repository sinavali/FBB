import { IPosition, ISignal } from "@shared/Types/Interfaces/general.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import { CircularBuffer } from "@tradingBot/Features/Core/CircularBuffer.ts";
import logger from "@shared/Initiatives/Logger.js";

export default class Signal {
    public signals: CircularBuffer<ISignal>;
    private generalStore: GeneralStore;
    private indexMap: Map<number, number> = new Map();
    private maxId: number = 0;
    private offLoadMode: boolean = false;

    // capacity = 22000 means 2 weeks and 4 days of 1-minute candles
    constructor(generalStoreInstance: GeneralStore, capacity: number = 5000) {
        this.generalStore = generalStoreInstance;
        this.signals = new CircularBuffer(capacity);
    }

    turnOffLoadModeOn() {
        this.offLoadMode = true;
        logger.warn("offload mode is ON");
        return this.getOffLoadMode();
    }

    turnOffLoadModeOff() {
        this.offLoadMode = false;
        logger.warn("offload mode is OFF");
        return this.getOffLoadMode();
    }

    getOffLoadMode() {
        return this.offLoadMode;
    }

    add(signal: ISignal) {
        signal.id = ++this.maxId;
        this.signals.add(signal);
    }

    async openPosition(position: IPosition) {
        if (this.getOffLoadMode()) {
            logger.warn("because of offload mode the position is not opened in platform but signal is submitted")
            return;
        }

        const orderType = this.generalStore.state.Setting.getOne("OrderType")?.settingValueParsed;
        const res: any = orderType === "MARKET" ? await this.openMarketOrder(position) : orderType === "LIMIT" ? this.openLimitOrder(position) : undefined;
        if (!res) return;

        const data = await res.json();

        logger.info(`new position limit: ${JSON.stringify(position)}`);
        logger.info(`position request result: ${JSON.stringify(data)}`);

        console.log(data);
    }

    private async openMarketOrder(position: IPosition) {
        return await fetch("http://127.0.0.1:5000/place_order", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(position),
        })
    }

    private async openLimitOrder(position: IPosition) {
        return await fetch("http://127.0.0.1:5000/place_limit_order", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(position),
        })
    }

    getMaxId(): number {
        return this.maxId;
    }

    getIndexById(id: number): number | undefined {
        return this.indexMap.get(id);
    }
}
