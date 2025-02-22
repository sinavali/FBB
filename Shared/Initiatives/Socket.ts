import Net from "net";
import logger from "@shared/Initiatives/Logger.ts";
import { MetaTraderSocketType } from "@shared/Types/Enums.ts";
import { IMTSocket } from "@shared/Types/Interfaces/general.ts";

export default class MTSocket {
  private sockets: IMTSocket = { CMD: null, DATA: null };

  /**
   * Get all settings.
   * @returns Array of all settings.
   */
  getSockets(): IMTSocket {
    return this.sockets;
  }

  initMetaTraderSocket(type: MetaTraderSocketType): IMTSocket {
    try {
      const temp = new Net.Socket();

      if (type === MetaTraderSocketType.CMD) temp.connect(77, "localhost");
      else if (type === MetaTraderSocketType.DATA)
        temp.connect(78, "localhost");

      temp.on("error", (err) => logger.error(`Socket error: ${err}`));
      temp.on("timeout", () => logger.warn(`Socket timeout.`));

      if (type === MetaTraderSocketType.CMD) this.sockets.CMD = temp;
      else if (type === MetaTraderSocketType.DATA) this.sockets.DATA = temp;

      logger.info("sockets initiated");
      return this.getSockets();
    } catch (error) {
      this.sockets.CMD = null;
      this.sockets.DATA = null;
      throw new Error("failed to initiate sockets");
    }
  }
}
