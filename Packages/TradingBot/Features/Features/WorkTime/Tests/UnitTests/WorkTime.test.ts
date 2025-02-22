import WorkTime from "@tradingBot/Features/Features/WorkTime/WorkTime.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import { CircularBuffer } from "@tradingBot/Features/Core/CircularBuffer.ts";
import moment from "moment-timezone";

const mockPrisma = {
  workTime: {
    findMany: jest.fn(), // Properly mocked for Jest
  },
} as unknown as {
  workTime: {
    findMany: jest.Mock; // Explicitly type as Jest mock
  };
};

const mockGeneralStore: GeneralStore = {
  state: {
    Prisma: mockPrisma as any,
    MT: null as any,
    Database: null as any,
    Setting: null as any,
    MicroTime: null as any,
    Session: null as any,
    WorkTime: null as any,
    Candle: null as any,
    Liquidity: null as any,
    MSS: null as any,
    COB: null as any,
  },
  globalStates: {
    systemMode: null,
  },
  setter: {
    setPrisma: jest.fn(),
    setDatabase: jest.fn(),
    setSetting: jest.fn(),
  },
};

describe("WorkTime", () => {
  let workTime: WorkTime;

  beforeEach(() => {
    workTime = new WorkTime(mockGeneralStore, 1500);
  });

  describe("constructor", () => {
    it("should initialize correctly", () => {
      expect(workTime.workTimes).toBeInstanceOf(CircularBuffer);
      expect(workTime.workTimes.capacity).toBe(1500);
      expect(workTime.getMaxId()).toBe(0);
      expect(workTime.workTimeRecords).toEqual([]);
    });
  });

  describe("fetch", () => {
    it("should fetch work time records from Prisma", async () => {
      const mockRecords = [
        { id: 1, title: null!, start: "09:00", end: "17:00" },
        { id: 2, title: null!, start: "22:00", end: "06:00" },
      ];

      mockPrisma.workTime.findMany.mockResolvedValue(mockRecords);

      const result = await workTime.fetch();

      expect(result).toEqual(mockRecords);
      expect(workTime.workTimeRecords).toEqual(mockRecords);
    });

    it("should throw an error if Prisma instance is not found", async () => {
      workTime = new WorkTime(
        {
          ...mockGeneralStore,
          state: { ...mockGeneralStore.state, Prisma: null },
        },
        10
      );

      let error = "";
      await workTime.fetch().catch((err) => (error = err));

      // could not work with .reject.toThrown("")
      expect(error).toBe("Prisma instance not found");
    });
  });

  describe("isUnixInWorkTimeRecords", () => {
    it("should return undefined if no matching record is found", () => {
      const start = moment.utc("2033-05-18T00:00:00Z");
      const end = moment.utc("2033-05-18T05:00:00Z");

      const mockRecord = {
        id: 1,
        start: { unix: start.unix(), utc: start },
        end: { unix: end.unix(), utc: end },
        workTimeId: 1,
      };

      workTime.workTimeRecords = [
        { id: 1, title: "", start: "00:00", end: "05:00" },
        { id: 2, title: "", start: "07:00", end: "10:00" },
      ];

      workTime.handleWorkTimeForFlow(mockRecord.end.unix);

      const result = workTime.isExists(
        mockRecord.start.unix + 1,
        mockRecord.end.unix + 1
      );

      expect(result).toBeUndefined();
    });

    it("should return the matching work time record for a valid Unix timestamp", () => {
      const start = moment.utc("2033-05-18T00:00:00Z");
      const end = moment.utc("2033-05-18T05:00:00Z");

      const mockRecord = {
        id: 1,
        start: { unix: start.unix(), utc: null! },
        end: { unix: end.unix(), utc: null! },
        workTimeId: 1,
      };

      workTime.workTimeRecords = [
        { id: 1, title: "", start: "00:00", end: "05:00" },
        { id: 2, title: "", start: "07:00", end: "10:00" },
      ];

      workTime.handleWorkTimeForFlow(mockRecord.end.unix);

      const result = workTime.isExists(
        mockRecord.start.unix,
        mockRecord.end.unix
      );

      expect(result?.id).toBe(mockRecord.id);
    });
  });

  describe("handleWorkTimeForFlow", () => {
    it("should return the newest work time if no matching record exists", () => {
      const start = moment.utc("2033-05-18T00:00:00Z");
      const end = moment.utc("2033-05-18T05:00:00Z");
      const noMatch = moment.utc("2033-05-18T06:00:00Z");

      const mockRecord = {
        id: 1,
        start: { unix: start.unix(), utc: start },
        end: { unix: end.unix(), utc: end },
        workTimeId: 1,
      };

      workTime.workTimeRecords = [
        { id: 1, title: "", start: "00:00", end: "05:00" },
        { id: 2, title: "", start: "07:00", end: "10:00" },
      ];

      workTime.handleWorkTimeForFlow(mockRecord.end.unix);
      const result = workTime.handleWorkTimeForFlow(noMatch.unix());

      expect(result?.id).toBe(workTime.workTimes.getNewest()?.id);
    });

    it("should create a new workTime and return it if a matching workTime does not exists", () => {
      workTime.workTimeRecords = [
        { id: 1, title: null!, start: "09:00", end: "17:00" },
      ];
      jest.spyOn(workTime, "isUnixInWorkTimeRecords");

      const mockIsExists = jest.fn().mockReturnValueOnce(undefined);
      workTime["generalStore"].state.WorkTime = {
        isExists: mockIsExists,
      } as any;

      const theTime = moment.utc().set("hour", 9);
      const result = workTime.handleWorkTimeForFlow(theTime.unix());

      expect(workTime.workTimes.getAll()).toHaveLength(1);
      expect(result).toMatchObject({
        id: 1,
        start: expect.any(Object),
        end: expect.any(Object),
        workTimeId: 1,
      });
    });
  });

  describe("isExists", () => {
    it("should return undefined if no match is found", () => {
      jest.spyOn(workTime.workTimes, "getAll").mockReturnValue([]);
      const result = workTime.isExists(1672502400, 1672588800);
      expect(result).toBeUndefined();
    });

    it("should return the matching work time", () => {
      const mockWorkTime = {
        id: 1,
        start: { unix: 1672502400, utc: moment.utc() },
        end: { unix: 1672588800, utc: moment.utc() },
        workTimeId: 1,
      };
      jest.spyOn(workTime.workTimes, "getAll").mockReturnValue([mockWorkTime]);

      const result = workTime.isExists(1672502400, 1672588800);
      expect(result).toEqual(mockWorkTime);
    });
  });

  describe("getWorkTime", () => {
    it("should return the correct work time for a valid ID", () => {
      const mockWorkTime = {
        id: 1,
        start: { unix: 1672502400, utc: moment.utc() },
        end: { unix: 1672588800, utc: moment.utc() },
        workTimeId: 1,
      };
      workTime.workTimes.add(mockWorkTime);

      jest.spyOn(workTime, "getIndexById").mockReturnValue(0);

      const result = workTime.getWorkTime(1);
      expect(result).toEqual(mockWorkTime);
    });

    it("should return null if the ID does not exist", () => {
      jest.spyOn(workTime, "getIndexById").mockReturnValue(undefined);

      const result = workTime.getWorkTime(99);
      expect(result).toBeNull();
    });
  });

  describe("getMaxId", () => {
    it("should return the current max ID", () => {
      workTime["maxId"] = 42;
      expect(workTime.getMaxId()).toBe(42);
    });
  });

  describe("getIndexById", () => {
    it("should return the correct index for an existing ID", () => {
      workTime["indexMap"].set(1, 0);
      const result = workTime.getIndexById(1);
      expect(result).toBe(0);
    });

    it("should return undefined for a non-existing ID", () => {
      const result = workTime.getIndexById(99);
      expect(result).toBeUndefined();
    });
  });
});
