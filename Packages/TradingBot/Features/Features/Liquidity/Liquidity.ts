import {
  IWorkTime,
  ILiquidity,
  GenerateLiquiditiesMethodParams,
  ISession,
  ICandle,
  AddNewLiquidityParams,
} from "@shared/Types/Interfaces/general.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import moment from "moment-timezone";
import { CircularBuffer } from "@tradingBot/Features/Core/CircularBuffer.ts";
import {
  Dates,
  PairPeriod,
  DateTime,
} from "@shared/Types/Interfaces/common.ts";
import { LiquidityMode, Directions } from "@shared/Types/Enums.ts";
import { validatePullback } from "@tradingBot/Features/Features/Liquidity/Validations.ts";

export default class Liquidity {
  public liquidities: CircularBuffer<ILiquidity>;
  private generalStore: GeneralStore;
  private indexMap: Map<number, number> = new Map();
  private maxId: number = 0;

  /**
   * Initializes the Liquidity class with a CircularBuffer of specified capacity.
   * @param generalStoreInstance - Instance of GeneralStore to fetch data.
   * @param capacity - Capacity of the CircularBuffer (default: 1500).
   */
  constructor(generalStoreInstance: GeneralStore, capacity: number = 50) {
    this.generalStore = generalStoreInstance;
    this.liquidities = new CircularBuffer<ILiquidity>(capacity);
  }

  /**
   * Finds the highest points in a list of candles and all touches of the highest price.
   * @param candles - Array of ICandle objects.
   * @returns Object containing the highest point and all touches.
   */
  private findHighestPoints(candles: ICandle[]): {
    highestPoint: number;
    touches: DateTime[];
  } {
    let highestPoint = candles[0].high;
    let touches: DateTime[] = [
      {
        unix: candles[0].time.unix,
        utc: moment.unix(candles[0].time.unix).utc(),
      },
    ];

    for (let i = 1; i < candles.length; i++) {
      if (candles[i].high > highestPoint) {
        highestPoint = candles[i].high;
        touches = [
          {
            unix: candles[i].time.unix,
            utc: moment.unix(candles[i].time.unix).utc(),
          },
        ];
      } else if (candles[i].high === highestPoint) {
        touches.push({
          unix: candles[i].time.unix,
          utc: moment.unix(candles[i].time.unix).utc(),
        });
      }
    }

    return { highestPoint, touches };
  }

  /**
   * Finds the lowest points in a list of candles and all touches of the lowest price.
   * @param candles - Array of ICandle objects.
   * @returns Object containing the lowest point and all touches.
   */
  private findLowestPoints(candles: ICandle[]): {
    lowestPoint: number;
    touches: DateTime[];
  } {
    let lowestPoint = candles[0].low;
    let touches: DateTime[] = [
      {
        unix: candles[0].time.unix,
        utc: moment.unix(candles[0].time.unix).utc(),
      },
    ];

    for (let i = 1; i < candles.length; i++) {
      if (candles[i].low < lowestPoint) {
        lowestPoint = candles[i].low;
        touches = [
          {
            unix: candles[i].time.unix,
            utc: moment.unix(candles[i].time.unix).utc(),
          },
        ];
      } else if (candles[i].low === lowestPoint) {
        touches.push({
          unix: candles[i].time.unix,
          utc: moment.unix(candles[i].time.unix).utc(),
        });
      }
    }

    return { lowestPoint, touches };
  }

  /**
   * Adds a new liquidity point to the CircularBuffer.
   * @param direction - Direction of the liquidity (UP or DOWN).
   * @param mode - Liquidity mode (BYSESSION, BYWORKTIME, BYTIME).
   * @param pairPeriod - Pair period.
   * @param price - Price of the liquidity point.
   * @param time - Time of the liquidity point.
   * @param touches - Array of all touches for the liquidity point.
   * @param timeRange - Optional time range for BYTIME mode.
   * @returns The newly added liquidity point.
   */
  private addLiquidity(params: AddNewLiquidityParams): ILiquidity {
    let newLiquidity: ILiquidity = {
      id: ++this.maxId,
      direction: params.direction,
      mode: params.mode,
      pairPeriod: params.pairPeriod,
      price: params.price,
      time: params.time,
      used: [],
      SMT: [],
      failed: false,
      timeRange: params.timeRange,
      highTouches: params.direction === Directions.UP ? params.touches : [],
      lowTouches: params.direction === Directions.DOWN ? params.touches : [],
    };

    newLiquidity = this.liquidities.add(newLiquidity);
    this.indexMap.set(newLiquidity.id, this.liquidities.getSize() - 1);

    return newLiquidity;
  }

  /**
   * Creates new liquidity points based on the provided parameters.
   * @param candles - Array of ICandle objects.
   * @param pairPeriod - Pair period.
   * @param mode - Liquidity mode (BYSESSION, BYWORKTIME, BYTIME).
   * @param timeRange - Optional time range for BYTIME mode.
   * @param session - Optional session for BYSESSION mode.
   * @param workTime - Optional work time for BYWORKTIME mode.
   * @returns Array of newly added liquidity points.
   */
  private newLiquidity(
    candles: ICandle[],
    pairPeriod: PairPeriod,
    mode: LiquidityMode,
    timeRange: Dates,
    session?: ISession,
    workTime?: IWorkTime
  ): ILiquidity[] {
    const { highestPoint, touches: highTouches } =
      this.findHighestPoints(candles);
    const { lowestPoint, touches: lowTouches } = this.findLowestPoints(candles);
    const newLiquids: (AddNewLiquidityParams | null)[] = [];
    const addLiquiditiesResult: ILiquidity[] = [];
    const firstHighTouchTime = highTouches[0].unix;
    const firstLowTouchTime = lowTouches[0].unix;
    const isFirst = [
      firstLowTouchTime < firstHighTouchTime, // UP
      firstHighTouchTime <= firstLowTouchTime, // DOWN
    ];

    if (isFirst[0]) isFirst[1] = false;
    else isFirst[0] = false;

    if (highTouches.length)
      newLiquids.push({
        direction: Directions.UP,
        mode,
        pairPeriod,
        price: highestPoint,
        time: highTouches[0], // First touch is the primary time
        touches: highTouches,
        timeRange,
      });
    else newLiquids.push(null);

    if (lowTouches.length)
      newLiquids.push({
        direction: Directions.DOWN,
        mode,
        pairPeriod,
        price: lowestPoint,
        time: lowTouches[0], // First touch is the primary time
        touches: lowTouches,
        timeRange,
      });
    else newLiquids.push(null);

    // this section will filter the newLiquids variable for invalid liquidities parameters
    if (mode === LiquidityMode.BYSESSION || mode === LiquidityMode.BYWORKTIME) {
      if (newLiquids.length === 2) {
        if (isFirst[0]) {
          const liquidityExists = this.liquidities
            .getAll()
            .find(
              (l) =>
                l.pairPeriod.pair === pairPeriod.pair &&
                l.pairPeriod.period === pairPeriod.period &&
                l.mode === LiquidityMode.BYSESSION &&
                l.timeRange.start.unix === timeRange?.start.unix &&
                l.timeRange.end.unix === timeRange?.end.unix &&
                l.direction === Directions.UP
            );
          if (liquidityExists) newLiquids.splice(0, 1);

          const pullbackResults = validatePullback(
            this.generalStore,
            candles.map((c) => ({
              high: c.high,
              low: c.low,
              time: c.time,
            })), // Convert ICandle to IPricePoint
            lowTouches[0].unix,
            [{ high: highestPoint, low: lowestPoint, time: highTouches[0] }], // Match IPricePoint
            [{ high: highestPoint, low: lowestPoint, time: lowTouches[0] }] // Match IPricePoint
          );

          if (!pullbackResults.low) newLiquids.splice(1, 1);
        } else if (isFirst[1]) {
          const liquidityExists = this.liquidities
            .getAll()
            .find(
              (l) =>
                l.pairPeriod.pair === pairPeriod.pair &&
                l.pairPeriod.period === pairPeriod.period &&
                l.mode === LiquidityMode.BYSESSION &&
                l.timeRange.start.unix === timeRange?.start.unix &&
                l.timeRange.end.unix === timeRange?.end.unix &&
                l.direction === Directions.UP
            );
          if (liquidityExists) newLiquids.splice(1, 1);

          const pullbackResults = validatePullback(
            this.generalStore,
            candles.map((c) => ({
              high: c.high,
              low: c.low,
              time: c.time,
            })), // Convert ICandle to IPricePoint
            highTouches[0].unix,
            [{ high: highestPoint, low: lowestPoint, time: highTouches[0] }], // Match IPricePoint
            [{ high: highestPoint, low: lowestPoint, time: lowTouches[0] }] // Match IPricePoint
          );

          if (!pullbackResults.high) newLiquids.splice(0, 1);
        }
      }
    }
    newLiquids.forEach((nl) => {
      const exists = this.isExists(
        pairPeriod,
        LiquidityMode.BYSESSION,
        nl?.time.unix as number
      );
      if (nl && !exists) addLiquiditiesResult.push(this.addLiquidity(nl));
    });

    return addLiquiditiesResult;
  }

  /**
   * Generates new liquidity points for a session.
   * @param candles - Array of ICandle objects.
   * @param pairPeriod - Pair period.
   * @param session - Session object.
   * @returns Array of newly added liquidity points.
   */
  private newLiquidityBySession(
    candles: ICandle[],
    pairPeriod: PairPeriod,
    session: ISession
  ): ILiquidity[] {
    return this.newLiquidity(
      candles,
      pairPeriod,
      LiquidityMode.BYSESSION,
      { start: session.start, end: session.end },
      session
    );
  }

  /**
   * Generates liquidity points for the last week.
   * @param candle - Reference candle for timezone calculation.
   * @param timezone - Timezone for calculating the start and end of the week.
   * @returns Array of newly added liquidity points.
   */
  private newLiquidityLastWeek(
    candle: ICandle,
    timezone: string = "America/New_York"
  ): ILiquidity[] {
    const nowInTimezone = moment.unix(candle.time.unix).tz(timezone);

    // check if it is the start of week
    // if this candle does not present the start of week, this function should not get executed
    if (!nowInTimezone.isSame(nowInTimezone.clone().startOf("week"))) return [];

    const startOfLastWeek = nowInTimezone
      .clone()
      .subtract(1, "week")
      .startOf("week")
      .unix();
    const endOfLastWeek = nowInTimezone
      .clone()
      .subtract(1, "week")
      .endOf("week")
      .unix();

    const dateTimes: Dates = {
      start: {
        unix: moment.tz(startOfLastWeek, timezone).utc().unix(),
        utc: moment.tz(startOfLastWeek, timezone).utc(),
      },
      end: {
        unix: moment.tz(endOfLastWeek, timezone).utc().unix(),
        utc: moment.tz(endOfLastWeek, timezone).utc(),
      },
    };

    const candles = this.generalStore.state.Candle?.getCandlesBetween(
      startOfLastWeek,
      endOfLastWeek,
      candle.pairPeriod
    );

    const liquidityExists = this.liquidities
      .getAll()
      .find(
        (l) =>
          l.pairPeriod.pair === candle.pairPeriod.pair &&
          l.pairPeriod.period === candle.pairPeriod.period &&
          l.mode === LiquidityMode.DAILY &&
          l.timeRange.start.unix === dateTimes.start.unix &&
          l.timeRange.end.unix === dateTimes.end.unix
      );
    if (!candles || !candles.length || liquidityExists) return [];

    return this.newLiquidity(
      candles,
      candle.pairPeriod,
      LiquidityMode.WEEKLY,
      dateTimes
    );
  }

  /**
   * Generates liquidity points for the last day.
   * @param candle - Reference candle for timezone calculation.
   * @param timezone - Timezone for calculating the start and end of the day.
   * @returns Array of newly added liquidity points.
   */
  private newLiquidityLastDay(
    candle: ICandle,
    timezone: string = "America/New_York"
  ): ILiquidity[] {
    const nowInTimezone = moment.unix(candle.time.unix).tz(timezone);

    // check if it is the start of day
    // if this candle does not present the start of day, this function should not get executed
    if (!nowInTimezone.isSame(nowInTimezone.clone().startOf("day"))) return [];

    const startOfLastDay = nowInTimezone
      .clone()
      .subtract(1, "day")
      .startOf("day");
    const endOfLastDay = nowInTimezone.clone().subtract(1, "day").endOf("day");

    const dateTimes: Dates = {
      start: {
        unix: 0,
        utc: moment.tz(startOfLastDay, timezone).utc(),
      },
      end: {
        unix: 0,
        utc: moment.tz(endOfLastDay, timezone).utc(),
      },
    };
    dateTimes.start.unix = dateTimes.start.utc.unix();
    dateTimes.end.unix = dateTimes.end.utc.unix();

    // check if this liquidity is already exists
    const liquidityExists = this.liquidities
      .getAll()
      .find(
        (l) =>
          l.mode === LiquidityMode.DAILY &&
          l.pairPeriod.pair === candle.pairPeriod.pair &&
          l.pairPeriod.period === candle.pairPeriod.period &&
          l.timeRange.start.unix === dateTimes.start.unix &&
          l.timeRange.end.unix === dateTimes.end.unix
      );
    if (liquidityExists) return [];

    const candles = this.generalStore.state.Candle?.getCandlesBetween(
      dateTimes.start.unix,
      dateTimes.end.unix,
      candle.pairPeriod
    );

    if (!candles || !candles.length) return [];

    return this.newLiquidity(
      candles,
      candle.pairPeriod,
      LiquidityMode.DAILY,
      dateTimes
    );
  }

  /**
   * Generates liquidity points based on the provided parameters.
   * @param params - Parameters for generating liquidities.
   */
  generateLiquidities(params: GenerateLiquiditiesMethodParams): void {
    if (params.type === "daily")
      this.newLiquidityLastDay(params.candle, params.timezone);
    else if (params.type === "weekly")
      this.newLiquidityLastWeek(params.candle, params.timezone);
    else if (params.type === "bySession") {
      const candles = this.generalStore.state.Candle?.getCandlesBetween(
        params.session.start.unix,
        params.session.end.unix,
        params.pairPeriod
      );

      if (candles && candles.length > 0)
        this.newLiquidityBySession(candles, params.pairPeriod, params.session);
    }
  }

  makeLiquidityFailed(id: number) {
    this.liquidities.updateById(id, "failed", true);
  }

  makeLiquidityHunted(id: number, candle: ICandle) {
    this.liquidities.updateById(id, "hunted", candle.time);
  }

  /**
   * Gets a liquidity point by its ID.
   * @param id - ID of the liquidity point.
   * @returns The liquidity point or null if not found.
   */
  getLiquidity(id: number): ILiquidity | null {
    const index = this.indexMap.get(id);
    return index !== undefined ? this.liquidities.get(index) : null;
  }

  /**
   * Gets the maximum ID of liquidity points.
   * @returns The maximum ID.
   */
  getMaxId(): number {
    return this.maxId;
  }

  /**
   * Gets the index of a liquidity point by its ID.
   * @param id - ID of the liquidity point.
   * @returns The index or undefined if not found.
   */
  getIndexById(id: number): number | undefined {
    return this.indexMap.get(id);
  }

  isExists(
    pairPeriod: PairPeriod,
    mode: LiquidityMode,
    time: number
  ): ILiquidity | undefined {
    return this.liquidities
      .getAll()
      .find(
        (l) =>
          l.pairPeriod.pair === pairPeriod.pair &&
          l.pairPeriod.period === pairPeriod.period &&
          l.mode === mode &&
          l.time.unix === time
      );
  }
}
