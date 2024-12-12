import logger from "../../../../logger.ts";
import {
  initMetaTraderCmdSocket,
  initMetaTraderDataSocket,
  metaTraderCmd,
  metaTraderData,
} from "../socketConnection.ts";

export default () => {
  try {
    initMetaTraderCmdSocket();
    initMetaTraderDataSocket();
    console.log(1);
  } catch (error) {
    logger.error(error);
    throw error;
  }
};
