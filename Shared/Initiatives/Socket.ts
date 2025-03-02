import Net from "net";
import logger from "@shared/Initiatives/Logger.ts";
import {MetaTraderSocketType} from "@shared/Types/Enums.ts";
import {IMTSocket} from "@shared/Types/Interfaces/general.ts";

export default class MTSocket {
    private sockets: IMTSocket = {CMD: null, DATA: null};

    /**
     * Get all settings.
     * @returns Array of all settings.
     */
    getSockets(): IMTSocket {
        return this.sockets;
    }

    initMetaTraderSocket(type: MetaTraderSocketType): IMTSocket {
        try {
            this.initiateData();
            this.initiateCmd();

            return this.getSockets();
        } catch (error) {
            this.sockets.CMD = null;
            this.sockets.DATA = null;
            throw new Error("failed to initiate sockets");
        }
    }

    private initiateCmd(): void {
        try {
            this.sockets.CMD = new Net.Socket();

            this.sockets.CMD.connect(77, "localhost");

            this.sockets.CMD.on("error", (err) => logger.error(`Socket error: ${err}`));
            this.sockets.CMD.on("timeout", () => logger.warn(`Socket timeout.`));

            logger.info("sockets initiated");
        } catch (error) {
            this.sockets.CMD = null;
            throw new Error("failed to initiate sockets");
        }
    }

    private initiateData(): void {
        try {
            this.sockets.DATA = new Net.Socket();
            this.sockets.DATA.connect(78, "localhost");

            this.sockets.DATA.on("error", (err) => logger.error(`Socket error: ${err}`));
            this.sockets.DATA.on("timeout", () => logger.warn(`Socket timeout.`));

            logger.info("sockets initiated");
        } catch (error) {
            this.sockets.DATA = null;
            throw new Error("failed to initiate sockets");
        }
    }
}
