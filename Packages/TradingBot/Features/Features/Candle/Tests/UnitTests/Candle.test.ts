import Candle from "@tradingBot/Features/Features/Candle/Candle.ts";
import { ICandle } from "@shared/Types/Interfaces/general.ts";
import { CandleDirection } from "@shared/Types/Enums.ts";
import { modelOne } from "@tradingBot/Features/Core/Controllers/flows.ts";
import GeneralStoreClass from "@shared/Stores/GeneralStore.ts";

jest.mock("@shared/Stores/GeneralStore.ts", () => {
  return {
    useGeneralStore: jest.fn(() => ()),
  };
});

describe("Candle.ts", () => {
  let candleInstance: Candle;
  let generalStoreMock;

  beforeEach(() => {
    generalStoreMock = {
      state: {
        Setting: {
          getOne: jest.fn((key: string) =>
            key === "SystemMode" ? { settingValue: "LIVE" } : null
          ),
        },
        Session: { fetch: jest.fn() },
        Database: { init: jest.fn() },
      },
      setter: {},
      globalStates: {
        systemMode: "LIVE",
      },
    };
    candleInstance = new Candle(generalStoreMock, 5); // Assume a circular buffer size of 5
  });

  describe("processCandles", () => {
    it("should process candles correctly and populate the buffer", async () => {
      const inputCandles = [
        {
          id: 1,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
          closeTime: 1546349700,
          time: "2019-01-01T17:05",
        },
        {
          id: 2,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.2,
          high: 1.25,
          low: 1.1,
          close: 1.2,
          closeTime: 1546349760,
          time: "2019-01-01T17:06",
        },
      ];

      await candleInstance.processCandles(inputCandles, modelOne);

      const allCandles = candleInstance.candles.getAll();
      expect(allCandles.length).toBe(2);
      expect(allCandles[0].id).toBe(2); // Newest candle
      expect(allCandles[1].id).toBe(1); // Oldest candle
    });

    it("should process candles one by one in order", async () => {
      const inputCandles = [
        {
          id: 1,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
          closeTime: 1546349700,
          time: "2019-01-01T17:05",
        },
        {
          id: 2,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.2,
          high: 1.25,
          low: 1.1,
          close: 1.2,
          closeTime: 1546349760,
          time: "2019-01-01T17:06",
        },
      ];

      const processSpy = jest.spyOn(candleInstance as any, "processCandle"); // Assuming `processSingleCandle` is a private method
      await candleInstance.processCandles(inputCandles, modelOne);

      expect(processSpy).toHaveBeenCalledTimes(2);
      expect(processSpy).toHaveBeenNthCalledWith(1, inputCandles[0]);
      expect(processSpy).toHaveBeenNthCalledWith(2, inputCandles[1]);
    });

    it("should maintain buffer size and overwrite oldest candles when full", async () => {
      const inputCandles = [
        {
          id: 1,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
          closeTime: 1546349700,
          time: "2019-01-01T17:05",
        },
        {
          id: 2,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.2,
          high: 1.25,
          low: 1.1,
          close: 1.2,
          closeTime: 1546349760,
          time: "2019-01-01T17:06",
        },
        {
          id: 3,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.25,
          high: 1.3,
          low: 1.2,
          close: 1.27,
          closeTime: 1546349820,
          time: "2019-01-01T17:07",
        },
        {
          id: 4,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.3,
          high: 1.35,
          low: 1.25,
          close: 1.32,
          closeTime: 1546349880,
          time: "2019-01-01T17:08",
        },
        {
          id: 5,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.35,
          high: 1.4,
          low: 1.3,
          close: 1.37,
          closeTime: 1546349940,
          time: "2019-01-01T17:09",
        },
        {
          id: 6,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.4,
          high: 1.45,
          low: 1.35,
          close: 1.42,
          closeTime: 1546350000,
          time: "2019-01-01T17:10",
        },
      ];

      await candleInstance.processCandles(inputCandles, modelOne);

      const allCandles = candleInstance.candles.getAll();
      expect(allCandles.length).toBe(5); // Buffer size is 5
      expect(allCandles[0].id).toBe(6); // Newest candle
      expect(allCandles[4].id).toBe(2); // Oldest remaining candle
    });
  });

  describe("getAll", () => {
    it("should retrieve all candles in the correct order", async () => {
      const inputCandles = [
        {
          id: 1,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
          closeTime: 1546349700,
          time: "2019-01-01T17:05",
        },
        {
          id: 2,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.2,
          high: 1.25,
          low: 1.1,
          close: 1.2,
          closeTime: 1546349760,
          time: "2019-01-01T17:06",
        },
      ];

      await candleInstance.processCandles(inputCandles, modelOne);

      const allCandles = candleInstance.candles.getAll();
      expect(allCandles.length).toBe(2);
      expect(allCandles[0].id).toBe(2); // Newest
      expect(allCandles[1].id).toBe(1); // Oldest
    });
  });

  describe("updateByIndex", () => {
    it("should update a candle by index", async () => {
      const inputCandles = [
        {
          id: 1,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
          closeTime: 1546349700,
          time: "2019-01-01T17:05",
        },
      ];

      await candleInstance.processCandles(inputCandles, modelOne);

      candleInstance.candles.updateByIndex(0, "close", 1.2);
      const updateSuccess = candleInstance.candles.getRange(0, 1);

      expect(updateSuccess[0].close).toBe(1.2);

      const updatedCandle = candleInstance.candles.getAll()[0];
      expect(updatedCandle.close).toBe(1.2);
    });

    it("should fail silently for invalid indices in updateByIndex", () => {
      candleInstance.candles.updateByIndex(999, "close", 1.3);

      const updateSuccess = candleInstance.candles.getRange(999, 1);
      expect(updateSuccess[0]).toBeUndefined();
    });
  });

  describe("updateById", () => {
    it("should update a candle by ID", async () => {
      const inputCandles = [
        {
          id: 1,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
          closeTime: 1546349700,
          time: "2019-01-01T17:05",
        },
        {
          id: 2,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
          closeTime: 1546349700,
          time: "2019-01-01T17:05",
        },
        {
          id: 3,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
          closeTime: 1546349700,
          time: "2019-01-01T17:05",
        },
        {
          id: 4,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
          closeTime: 1546349700,
          time: "2019-01-01T17:05",
        },
        {
          id: 5,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
          closeTime: 1546349700,
          time: "2019-01-01T17:05",
        },
      ];

      await candleInstance.processCandles(inputCandles, modelOne);
      candleInstance.candles.updateById(4, "close", 1.25);

      let updateSuccess = candleInstance.candles
        .getAll()
        .find((c) => c.id === 4);

      updateSuccess = candleInstance.candles.getAll().find((c) => c.id === 4);
      expect(updateSuccess?.close).toBe(1.25);
    });

    it("should fail silently for invalid IDs in updateById", () => {
      const updateSuccess = candleInstance.candles.updateById(
        999,
        "close",
        1.3
      );

      const candle = candleInstance.candles.getAll().find((c) => c.id === 999);
      expect(candle).toBeUndefined(); // Should return false
    });
  });

  describe("Integration", () => {
    it("should allow processing, updating, and retrieving candles", async () => {
      const inputCandles = [
        {
          id: 1,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
          closeTime: 1546349700,
          time: "2019-01-01T17:05",
        },
        {
          id: 2,
          name: "EURUSD",
          period: "PERIOD_M1",
          open: 1.2,
          high: 1.25,
          low: 1.1,
          close: 1.2,
          closeTime: 1546349760,
          time: "2019-01-01T17:06",
        },
      ];

      await candleInstance.processCandles(inputCandles, modelOne);

      const updateSuccess = candleInstance.candles.updateById(2, "close", 1.3);
      const candle = candleInstance.candles.getAll().find((c) => c.id === 2);
      if (candle) {
        expect(candle).toBeDefined();
        expect(candle.close).toBe(1.3); // Updated value
        expect(candleInstance.candles.getNewest()?.id).toBe(2); // Newest
      } else expect(false).toBe(true);
    });
  });
});
