import { PrismaClient } from "@prisma/client";
import { GeneratStoreState } from "@shared/Types/Interfaces/generalStore";

// Use Candle with internal state management
export function useCandle(prisma: PrismaClient) {
  let state: GeneratStoreState = {
    Settings: [],
    Candles: [],
    Liquidities: [],
    MSS: [],
    COB: [],
  };

  return {
    getState: () => state,
  };
}
