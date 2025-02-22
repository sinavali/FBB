import { CandleDirection } from "@shared/Types/Enums.ts";
import { ICandle } from "@shared/Types/Interfaces/general.ts";

export function isBodyCandlesValid(candles: ICandle[]): boolean {
  if (!candles || !candles.length) return false;

  const direction = candles[0].direction;

  for (let i = 0; i < candles.length; i++) {
    if (candles[i].direction === CandleDirection.IDLE) return false;
    else if (candles[i].direction !== direction) return false;
  }

  return true;
}

export function isConfirmCandleValid(
  confirmCandle: ICandle,
  bodyDirection: CandleDirection
) {
  if (confirmCandle.direction === bodyDirection) return false;
  return true;
}

export function isStartCandleValid(
  startCandle: ICandle,
  confirmCandle: ICandle
) {
  if (startCandle.direction === CandleDirection.IDLE) return true;
  else if (startCandle.direction !== confirmCandle.direction) return false;
  return true;
}
