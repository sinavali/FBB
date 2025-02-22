import {
  validatePullback,
  validateLiquidities,
  validatePassedSessions,
  validatePassedWorkTime,
  validateMaxUsed,
  validateMaxStopLoss,
  validateMaxTakeProfit,
  validateMaxDrivenPatternStopLoss,
  validateMaxDrivenPatternTakeProfit,
  validateMaxMSS,
  validateMaxMSSStopLoss,
  validateMaxMSSTakeProfit,
  validateMaxCOB,
  validateMaxDrivenPattern,
  validateMaxCOBStopLoss,
  validateMaxCOBTakeProfit,
} from "@tradingBot/Features/Features/Liquidity/Validations.ts";
import {
  LiquidityMode,
  LiquidityUsedStatus,
  MicroTimeType,
  Triggers,
} from "@shared/Types/Enums.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import {
  ILiquidity,
  IPricePoint,
  ISetting,
} from "@shared/Types/Interfaces/general.ts";
import { CircularBuffer } from "@tradingBot/Features/Core/CircularBuffer.ts";
import moment from "moment-timezone";

jest.mock("moment-timezone");

describe("Liquidity Validations", () => {
  let generalStore: GeneralStore;

  beforeEach(() => {
    generalStore = {
      state: {
        Setting: {
          getOne: jest.fn(),
        },
        Liquidity: {
          liquidities: new CircularBuffer<ILiquidity>(10),
          makeLiquidityFailed: jest.fn(),
        },
        MicroTime: {
          microTimes: new CircularBuffer<any>(10),
        },
      },
    } as unknown as GeneralStore;

    jest.clearAllMocks();
  });

  describe("validatePullback", () => {
    it("should return false for low and high when highestPoints and lowestPoints are empty", () => {
      const result = validatePullback(generalStore, [], Date.now(), [], []);
      expect(result).toEqual({ low: false, high: false });
    });

    it("should validate pullback based on filtered candles and multiplier", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 50,
      });

      const candles: IPricePoint[] = [
        {
          time: { unix: 1672502400, utc: null! },
          high: 110,
          low: 90,
        },
        {
          time: { unix: 1672502500, utc: null! },
          high: 105,
          low: 95,
        },
      ];

      const highestPoints: IPricePoint[] = [
        {
          time: { unix: 1672502400, utc: null! },
          high: 110,
          low: 90,
        },
      ];
      const lowestPoints: IPricePoint[] = [
        {
          time: { unix: 1672502400, utc: null! },
          high: 110,
          low: 90,
        },
      ];

      const result = validatePullback(
        generalStore,
        candles,
        Date.now(),
        highestPoints,
        lowestPoints
      );
      expect(result).toEqual({ low: true, high: true });
    });
  });

  describe("validateLiquidities", () => {
    it("should not process when there are no liquidities", () => {
      generalStore.state.Liquidity.liquidities.getAll = jest.fn(() => []);
      validateLiquidities(generalStore);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });

    it("should process liquidities and skip failed ones", () => {
      const liquidity = {
        id: 1,
        failed: false,
        used: [],
        mode: LiquidityMode.BYSESSION,
      } as unknown as ILiquidity;
      generalStore.state.Liquidity.liquidities.getAll = jest.fn(() => [
        liquidity,
      ]);

      validateLiquidities(generalStore);

      // Assert that validation methods are triggered for non-failed liquidity
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });

  describe("validatePassedSessions", () => {
    it("should fail liquidity if the session micros exceed the max age", () => {
      generalStore.state.MicroTime.microTimes.getAll = () => [
        {
          id: null!,
          end: null!,
          session: null!,
          workTime: null!,
          start: { unix: 1672502300, utc: null! },
          type: MicroTimeType.SESSION,
        },
        {
          id: null!,
          end: null!,
          session: null!,
          workTime: null!,
          start: { unix: 1672602400, utc: null! },
          type: MicroTimeType.SESSION,
        },
      ];

      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });

      const liquidity: ILiquidity = {
        id: 1,
        mode: LiquidityMode.BYSESSION,
        timeRange: { start: { unix: 1672502500, utc: moment.utc(1672502500) } },
      } as ILiquidity;

      const makeFailedSpy = jest.spyOn(
        generalStore.state.Liquidity,
        "makeLiquidityFailed"
      );

      validatePassedSessions(generalStore, liquidity);

      expect(makeFailedSpy).toHaveBeenCalledWith(1);
    });

    it("should not fail liquidity if session micros are within the max age", () => {
      generalStore.state.MicroTime.microTimes.getAll = () => [
        {
          id: null!,
          end: null!,
          session: null!,
          workTime: null!,
          start: { unix: 1672502300, utc: null! },
          type: MicroTimeType.SESSION,
        },
      ];
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 2,
      });

      const liquidity: ILiquidity = {
        id: 1,
        mode: LiquidityMode.BYSESSION,
        timeRange: { start: { unix: 1672502500 } },
      } as ILiquidity;

      validatePassedSessions(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });

  describe("validatePassedWorkTime", () => {
    it("should fail liquidity if work time micros exceed the max age", () => {
      generalStore.state.MicroTime.microTimes.getAll = () => [
        {
          id: 1,
          end: null!,
          session: null!,
          workTime: null!,
          start: { unix: 1672502300, utc: null! },
          type: MicroTimeType.WORKTIME,
        },
        {
          id: 2,
          end: null!,
          session: null!,
          workTime: null!,
          start: { unix: 1672602400, utc: null! },
          type: MicroTimeType.WORKTIME,
        },
      ];
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });
      const makeFailedSpy = jest.spyOn(
        generalStore.state.Liquidity,
        "makeLiquidityFailed"
      );

      const liquidity: ILiquidity = {
        id: 2,
        mode: LiquidityMode.BYWORKTIME,
        timeRange: { start: { unix: 1672502500 } },
      } as ILiquidity;

      validatePassedWorkTime(generalStore, liquidity);
      expect(makeFailedSpy).toHaveBeenCalledWith(2);
    });

    it("should not fail liquidity if work time micros are within the max age", () => {
      generalStore.state.MicroTime.microTimes.getAll = () => [
        {
          id: null!,
          end: null!,
          session: null!,
          workTime: null!,
          start: { unix: 1672502300, utc: null! },
          type: MicroTimeType.WORKTIME,
        },
      ];

      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 2,
      });

      const liquidity: ILiquidity = {
        id: 2,
        mode: LiquidityMode.BYWORKTIME,
        timeRange: { start: { unix: 1672502500 } },
      } as ILiquidity;

      validatePassedWorkTime(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });

  describe("validateMaxUsed", () => {
    it("should fail liquidity if used count exceeds max allowed", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });

      const liquidity: ILiquidity = {
        id: 3,
        used: [{} as any, {} as any], // Exceeds max allowed
      } as ILiquidity;

      validateMaxUsed(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).toHaveBeenCalledWith(3);
    });

    it("should not fail liquidity if used count is within allowed range", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 3,
      });

      const liquidity: ILiquidity = {
        id: 3,
        used: [{} as any, {} as any], // Within allowed range
      } as ILiquidity;

      validateMaxUsed(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });

  describe("validateMaxStopLoss", () => {
    it("should fail liquidity if stop loss count exceeds max allowed", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });

      const liquidity: ILiquidity = {
        id: 4,
        used: [
          { status: LiquidityUsedStatus.STOPLOSS },
          { status: LiquidityUsedStatus.STOPLOSS },
        ],
      } as ILiquidity;

      validateMaxStopLoss(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).toHaveBeenCalledWith(4);
    });

    it("should not fail liquidity if stop loss count is within allowed range", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 3,
      });

      const liquidity: ILiquidity = {
        id: 4,
        used: [{ status: LiquidityUsedStatus.STOPLOSS }],
      } as ILiquidity;

      validateMaxStopLoss(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });

  describe("validateMaxTakeProfit", () => {
    it("should fail liquidity if take profit count exceeds max allowed", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });

      const liquidity: ILiquidity = {
        id: 5,
        used: [
          { status: LiquidityUsedStatus.TAKEPROFIT },
          { status: LiquidityUsedStatus.TAKEPROFIT },
        ],
      } as ILiquidity;

      validateMaxTakeProfit(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).toHaveBeenCalledWith(5);
    });

    it("should not fail liquidity if take profit count is within allowed range", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 3,
      });

      const liquidity: ILiquidity = {
        id: 5,
        used: [{ status: LiquidityUsedStatus.TAKEPROFIT }],
      } as ILiquidity;

      validateMaxTakeProfit(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });
  describe("validateMaxDrivenPattern", () => {
    it("should fail liquidity if driven pattern count exceeds max allowed", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });

      const liquidity: ILiquidity = {
        id: 6,
        used: [
          { trigger: { name: Triggers.DP } },
          { trigger: { name: Triggers.DP } },
        ],
      } as unknown as ILiquidity;

      validateMaxDrivenPattern(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).toHaveBeenCalledWith(6);
    });

    it("should not fail liquidity if driven pattern count is within allowed range", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 3,
      });

      const liquidity: ILiquidity = {
        id: 6,
        used: [{ trigger: { name: Triggers.DP } }],
      } as unknown as ILiquidity;

      validateMaxDrivenPattern(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });

  describe("validateMaxDrivenPatternStopLoss", () => {
    it("should fail liquidity if driven pattern stop loss count exceeds max allowed", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });

      const liquidity: ILiquidity = {
        id: 7,
        used: [
          {
            trigger: { name: Triggers.DP },
            status: LiquidityUsedStatus.STOPLOSS,
          },
          {
            trigger: { name: Triggers.DP },
            status: LiquidityUsedStatus.STOPLOSS,
          },
        ],
      } as unknown as ILiquidity;

      validateMaxDrivenPatternStopLoss(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).toHaveBeenCalledWith(7);
    });

    it("should not fail liquidity if driven pattern stop loss count is within allowed range", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 3,
      });

      const liquidity: ILiquidity = {
        id: 7,
        used: [
          {
            trigger: { name: Triggers.DP },
            status: LiquidityUsedStatus.STOPLOSS,
          },
        ],
      } as unknown as ILiquidity;

      validateMaxDrivenPatternStopLoss(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });

  describe("validateMaxDrivenPatternTakeProfit", () => {
    it("should fail liquidity if driven pattern take profit count exceeds max allowed", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });

      const liquidity: ILiquidity = {
        id: 8,
        used: [
          {
            trigger: { name: Triggers.DP },
            status: LiquidityUsedStatus.TAKEPROFIT,
          },
          {
            trigger: { name: Triggers.DP },
            status: LiquidityUsedStatus.TAKEPROFIT,
          },
        ],
      } as unknown as ILiquidity;

      validateMaxDrivenPatternTakeProfit(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).toHaveBeenCalledWith(8);
    });

    it("should not fail liquidity if driven pattern take profit count is within allowed range", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 3,
      });

      const liquidity: ILiquidity = {
        id: 8,
        used: [
          {
            trigger: { name: Triggers.DP },
            status: LiquidityUsedStatus.TAKEPROFIT,
          },
        ],
      } as unknown as ILiquidity;

      validateMaxDrivenPatternTakeProfit(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });

  describe("validateMaxMSS", () => {
    it("should fail liquidity if MSS count exceeds max allowed", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });

      const liquidity: ILiquidity = {
        id: 9,
        used: [
          { trigger: { name: Triggers.MSS } },
          { trigger: { name: Triggers.MSS } },
        ],
      } as unknown as ILiquidity;

      validateMaxMSS(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).toHaveBeenCalledWith(9);
    });

    it("should not fail liquidity if MSS count is within allowed range", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 3,
      });

      const liquidity: ILiquidity = {
        id: 9,
        used: [{ trigger: { name: Triggers.MSS } }],
      } as unknown as ILiquidity;

      validateMaxMSS(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });

  describe("validateMaxMSSStopLoss", () => {
    it("should fail liquidity if MSS stop loss count exceeds max allowed", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });

      const liquidity: ILiquidity = {
        id: 10,
        used: [
          {
            trigger: { name: Triggers.MSS },
            status: LiquidityUsedStatus.STOPLOSS,
          },
          {
            trigger: { name: Triggers.MSS },
            status: LiquidityUsedStatus.STOPLOSS,
          },
        ],
      } as unknown as ILiquidity;

      validateMaxMSSStopLoss(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).toHaveBeenCalledWith(10);
    });

    it("should not fail liquidity if MSS stop loss count is within allowed range", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 3,
      });

      const liquidity: ILiquidity = {
        id: 10,
        used: [
          {
            trigger: { name: Triggers.MSS },
            status: LiquidityUsedStatus.STOPLOSS,
          },
        ],
      } as unknown as ILiquidity;

      validateMaxMSSStopLoss(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });
  describe("validateMaxMSSTakeProfit", () => {
    it("should fail liquidity if MSS take profit count exceeds max allowed", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });

      const liquidity: ILiquidity = {
        id: 11,
        used: [
          {
            trigger: { name: Triggers.MSS },
            status: LiquidityUsedStatus.TAKEPROFIT,
          },
          {
            trigger: { name: Triggers.MSS },
            status: LiquidityUsedStatus.TAKEPROFIT,
          },
        ],
      } as unknown as ILiquidity;

      validateMaxMSSTakeProfit(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).toHaveBeenCalledWith(11);
    });

    it("should not fail liquidity if MSS take profit count is within allowed range", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 3,
      });

      const liquidity: ILiquidity = {
        id: 11,
        used: [
          {
            trigger: { name: Triggers.MSS },
            status: LiquidityUsedStatus.TAKEPROFIT,
          },
        ],
      } as unknown as ILiquidity;

      validateMaxMSSTakeProfit(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });

  describe("validateMaxCOB", () => {
    it("should fail liquidity if COB count exceeds max allowed", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });

      const liquidity: ILiquidity = {
        id: 12,
        used: [
          { trigger: { name: Triggers.COB } },
          { trigger: { name: Triggers.COB } },
        ],
      } as unknown as ILiquidity;

      validateMaxCOB(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).toHaveBeenCalledWith(12);
    });

    it("should not fail liquidity if COB count is within allowed range", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 3,
      });

      const liquidity: ILiquidity = {
        id: 12,
        used: [{ trigger: { name: Triggers.COB } }],
      } as unknown as ILiquidity;

      validateMaxCOB(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });

  describe("validateMaxCOBStopLoss", () => {
    it("should fail liquidity if COB stop loss count exceeds max allowed", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });

      const liquidity: ILiquidity = {
        id: 13,
        used: [
          {
            trigger: { name: Triggers.COB },
            status: LiquidityUsedStatus.STOPLOSS,
          },
          {
            trigger: { name: Triggers.COB },
            status: LiquidityUsedStatus.STOPLOSS,
          },
        ],
      } as unknown as ILiquidity;

      validateMaxCOBStopLoss(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).toHaveBeenCalledWith(13);
    });

    it("should not fail liquidity if COB stop loss count is within allowed range", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 3,
      });

      const liquidity: ILiquidity = {
        id: 13,
        used: [
          {
            trigger: { name: Triggers.COB },
            status: LiquidityUsedStatus.STOPLOSS,
          },
        ],
      } as unknown as ILiquidity;

      validateMaxCOBStopLoss(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });

  describe("validateMaxCOBTakeProfit", () => {
    it("should fail liquidity if COB take profit count exceeds max allowed", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 1,
      });

      const liquidity: ILiquidity = {
        id: 14,
        used: [
          {
            trigger: { name: Triggers.COB },
            status: LiquidityUsedStatus.TAKEPROFIT,
          },
          {
            trigger: { name: Triggers.COB },
            status: LiquidityUsedStatus.TAKEPROFIT,
          },
        ],
      } as unknown as ILiquidity;

      validateMaxCOBTakeProfit(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).toHaveBeenCalledWith(14);
    });

    it("should not fail liquidity if COB take profit count is within allowed range", () => {
      jest.spyOn(generalStore.state.Setting, "getOne").mockReturnValue({
        id: null!,
        parseTo: null!,
        settingKey: null!,
        settingValue: null!,
        settingValueParsed: 3,
      });

      const liquidity: ILiquidity = {
        id: 14,
        used: [
          {
            trigger: { name: Triggers.COB },
            status: LiquidityUsedStatus.TAKEPROFIT,
          },
        ],
      } as unknown as ILiquidity;

      validateMaxCOBTakeProfit(generalStore, liquidity);
      expect(
        generalStore.state.Liquidity.makeLiquidityFailed
      ).not.toHaveBeenCalled();
    });
  });
});
