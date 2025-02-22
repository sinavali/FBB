import { Directions } from "@shared/Types/Enums.ts";
import { ILiquidity } from "@shared/Types/Interfaces/general.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import { shouldCheckHunt } from "@tradingBot/Features/Features/Liquidity/Validations.ts";

export function checkForHunt(
  generalStore: GeneralStore,
  liquidity: ILiquidity
) {
  const checkHunt = shouldCheckHunt(generalStore, liquidity);
  if (!checkHunt) return false;

  const candles = generalStore.state.Candle?.candles.getAfter(
    liquidity.pairPeriod,
    liquidity.timeRange.end.unix
  );
  if (!candles || !candles.length) return;

  let huntCandle = undefined;
  if (liquidity.direction === Directions.DOWN)
    huntCandle = candles.find((c) => c.low < liquidity.price);
  else if (liquidity.direction === Directions.UP)
    huntCandle = candles.find((c) => c.high > liquidity.price);

  if (huntCandle)
    generalStore.state.Liquidity?.makeLiquidityHunted(liquidity.id, huntCandle);
}
