import Net from "net";
import logger from "@shared/Initiatives/Logger.ts";
import {MetaTraderSocketType} from "@shared/Types/Enums.ts";
import {IMTSocket} from "@shared/Types/Interfaces/general.ts";
import * as console from "node:console";
import {EventEmitter} from 'events';

export default class MTSocket extends EventEmitter {
    public sockets: IMTSocket = {CMD: null, DATA: null};
    private dataBuffers: { [key in 'CMD' | 'DATA']?: Buffer } = {
        CMD: Buffer.alloc(0),
        DATA: Buffer.alloc(0)
    };
    private readonly messageDelimiter = "\n";

    private setupDataHandlers(type: 'CMD' | 'DATA'): void {
        const socket = this.sockets[type];
        if (!socket) return;

        socket.on('data', (data: Buffer) => {
            if (!this.dataBuffers[type]) this.dataBuffers[type] = Buffer.alloc(0);

            this.dataBuffers[type] = Buffer.concat([this.dataBuffers[type]!, data]);

            let delimiterIndex: number;
            while ((delimiterIndex = this.dataBuffers[type]!.indexOf(this.messageDelimiter)) !== -1) {
                const message = this.dataBuffers[type]!.subarray(0, delimiterIndex);
                this.dataBuffers[type] = this.dataBuffers[type]!.subarray(delimiterIndex + 1);

                this.handleMessage(message.toString().trim(), type);
            }
        });
    }

    private handleMessage(rawMessage: string, type: 'CMD' | 'DATA'): void {
        logger.info(`Received ${type} message: ${rawMessage}`);
        this.emit('message', {type, data: rawMessage, timestamp: Date.now()});
    }

    /**
     * Get all settings.
     * @returns Array of all settings.
     */
    getSockets(): IMTSocket {
        return this.sockets;
    }

    initMetaTraderSocket() {
        try {
            this.initiateData();
            this.initiateCmd();
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
            this.sockets.CMD.on("connect", () => logger.info("CMD socket connected"));

            this.setupDataHandlers('DATA');

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
            this.sockets.DATA.on("connect", () => logger.info("CMD socket connected"));

            this.setupDataHandlers('DATA');

            logger.info("sockets initiated");
        } catch (error) {
            this.sockets.DATA = null;
            throw new Error("failed to initiate sockets");
        }
    }

    public sendCommand(message: string, socketType: "CMD" | "DATA" = "CMD"): void {
        try {
            if (socketType === "CMD") {
                if (!this.sockets.CMD || !this.sockets.CMD.writable) throw new Error("Socket not ready for commands");

                this.sockets.CMD.write(message + "\n"); // Add a newline if needed by your protocol
            } else if (socketType === "DATA") {
                if (!this.sockets.DATA || !this.sockets.DATA.writable) throw new Error("Socket not ready for commands");

                this.sockets.DATA.write(message + "\n"); // Add a newline if needed by your protocol
            }
        } catch (error) {
            logger.error("Socket not available or not writable");
            console.log(error);
            throw new Error(error as string);
        }
    }
}
