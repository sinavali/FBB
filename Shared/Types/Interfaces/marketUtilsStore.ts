export interface MarketUtilsStore {
  state: MarketUtilsStoreState;
  methods: MarketUtilsStoreMethods;
}

export interface MarketUtilsStoreState {}

export interface MarketUtilsStoreMethods {
  getPipDiff(priceA: number, priceB: number): number;
  toPip(price: number): number;
}
