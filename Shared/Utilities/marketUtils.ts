import {
  MarketUtilsStore,
  MarketUtilsStoreState,
  MarketUtilsStoreMethods,
} from "@shared/Types/Interfaces/marketUtilsStore.ts";

export function useMarketUtils(): MarketUtilsStore {
  const state: MarketUtilsStoreState = {};

  const methods: MarketUtilsStoreMethods = {
    getPipDiff(priceA: number, priceB: number): number {
      return (priceA - priceB) * 10000;
    },
    toPip(price: number): number {
      return price / 10000;
    },
  };

  return { state, methods };
}
