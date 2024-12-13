import Net from "net";
import logger from "@shared/Initiatives/Logger";
import { NetSocket } from "@shared/Types/Types";
import { MetaTraderSocketType } from "@shared/Types/Enums";

export let metaTraderCmd: NetSocket = null;
export let metaTraderData: NetSocket = null;

export function initMetaTraderSocket(type: MetaTraderSocketType) {
  const temp = new Net.Socket();

  if (type === MetaTraderSocketType.CMD) temp.connect(77, "localhost");
  else if (type === MetaTraderSocketType.DATA) temp.connect(78, "localhost");

  temp.on("error", (err) => logger.error(`Socket error: ${err}`));
  temp.on("timeout", () => logger.error(`Socket timeout.`));

  if (type === MetaTraderSocketType.CMD) metaTraderCmd = temp;
  else if (type === MetaTraderSocketType.DATA) metaTraderData = temp;
}
