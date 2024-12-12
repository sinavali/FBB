import Net from "net";
import logger from "../../../logger.ts";

export let metaTraderCmd: Net.Socket | null = null;
export let metaTraderData: Net.Socket | null = null;

export function initMetaTraderCmdSocket() {
  if (!metaTraderCmd) {
    try {
      metaTraderCmd = new Net.Socket();
      metaTraderCmd.connect(77, "localhost");

      metaTraderCmd.on("error", (err) => logger.error(`Socket error: ${err}`));
      metaTraderCmd.on("timeout", () => logger.error(`Socket timeout.`));
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
}
export function initMetaTraderDataSocket() {
  if (!metaTraderData) {
    try {
      metaTraderData = new Net.Socket();
      metaTraderData.connect(78, "localhost");

      metaTraderData.on("error", (err) => logger.error(`Socket error: ${err}`));
      metaTraderData.on("timeout", () => logger.error(`Socket timeout.`));
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
}
