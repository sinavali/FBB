import { PrismaClient } from "@prisma/client";
import logger from "@shared/Initiatives/Logger";
import { initMetaTraderSocket } from "@shared/Initiatives/Socket";
import { MetaTraderSocketType } from "@shared/Types/Enums";

export default (prisma: PrismaClient) => {
  try {
    // const appMode = await prisma.setting;
    initMetaTraderSocket(MetaTraderSocketType.CMD);
    initMetaTraderSocket(MetaTraderSocketType.DATA);
  } catch (error) {
    logger.error(error);
    throw error;
  }
};
