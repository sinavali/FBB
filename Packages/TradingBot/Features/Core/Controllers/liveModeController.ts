import logger from "@shared/Initiatives/Logger.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";

export default (generalStore: GeneralStore) => {
  try {
    console.info("live flow started");
  } catch (error) {
    logger.error(error);
    throw error;
  }
};
