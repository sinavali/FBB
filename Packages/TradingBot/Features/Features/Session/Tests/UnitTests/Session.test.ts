import Session from "@tradingBot/Features/Features/Session/Session.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import { CircularBuffer } from "@tradingBot/Features/Core/CircularBuffer.ts";
import { ISession } from "@shared/Types/Interfaces/general.ts";
import moment from "moment-timezone";
import { PrismaClient } from "@prisma/client";

// Mock dependencies
// jest.mock("@tradingBot/Features/Core/CircularBuffer");

const mockPrisma = {
  session: {
    findMany: jest.fn(), // Properly mocked for Jest
  },
} as unknown as {
  session: {
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

describe("Session Class", () => {
  let session: Session;

  beforeEach(() => {
    jest.clearAllMocks();
    session = new Session(mockGeneralStore, 10); // Circular buffer with a capacity of 10
  });

  describe("constructor", () => {
    it("should initialize with a circular buffer and general store instance", () => {
      expect(session.sessions).toBeInstanceOf(CircularBuffer);
      expect(session.sessions.capacity).toBe(10);
      expect(session["generalStore"]).toStrictEqual(mockGeneralStore);
    });
  });

  describe("fetch", () => {
    it("should fetch session records from the database", async () => {
      // Arrange: Set up mock to resolve with mockSessions
      const mockSessions = [
        { id: 1, start: "09:00", end: "17:00" },
        { id: 2, start: "18:00", end: "22:00" },
      ];
      mockPrisma.session.findMany.mockResolvedValueOnce(mockSessions);

      const session = new Session(mockGeneralStore, 10);

      // Act: Call the fetch method
      const result = await session.fetch();

      // Assert: Ensure proper behavior
      expect(mockPrisma.session.findMany).toHaveBeenCalledTimes(1); // Check findMany was called once
      expect(result).toEqual(mockSessions); // Verify the result matches mock data
    });

    it("should log and rethrow any errors during fetching", async () => {
      mockPrisma.session.findMany.mockRejectedValueOnce(
        new Error("Database error")
      );

      await expect(session.fetch()).rejects.toThrow("Database error");
    });
  });

  describe("isUnixInSessionRecords", () => {
    it("should return the session record if a given Unix timestamp falls within a session", () => {
      session["sessionRecords"] = [
        { id: 1, title: null!, start: "09:00", end: "17:00" },
        { id: 2, title: null!, start: "18:00", end: "22:00" },
      ];

      const unixTimestamp = moment
        .utc()
        .set("hour", 17)
        .set("minute", 0)
        .set("second", 0)
        .unix();
      const result = session.isUnixInSessionRecords(unixTimestamp);

      expect(result).toEqual(session["sessionRecords"][0]);
    });

    it("should return undefined if no session record matches the given Unix timestamp", () => {
      session["sessionRecords"] = [
        { id: 1, title: null!, start: "09:00", end: "17:00" },
        { id: 2, title: null!, start: "18:00", end: "22:00" },
      ];

      const unixTimestamp = moment.utc().set("hour", 23).unix();
      const result = session.isUnixInSessionRecords(unixTimestamp);

      expect(result).toBeUndefined();
    });
  });

  describe("handleSessionForFlow", () => {
    it("should return the newest session if no session record matches the given Unix timestamp", () => {
      jest
        .spyOn(session, "isUnixInSessionRecords")
        .mockReturnValueOnce(undefined);

      const newestSession = {
        id: 3,
        start: { unix: 200, utc: moment() },
        end: { unix: 300, utc: moment() },
        sessionId: 1,
      };
      jest
        .spyOn(session.sessions, "getNewest")
        .mockReturnValueOnce(newestSession);

      const result = session.handleSessionForFlow(500);

      expect(result).toEqual(newestSession);
    });

    it("should create a new session and return it if a matching session does not exists", () => {
      const mockSessionRecord = {
        id: 1,
        title: null!,
        start: "09:00",
        end: "17:00",
      };
      jest
        .spyOn(session, "isUnixInSessionRecords")
        .mockReturnValueOnce(mockSessionRecord);

      const mockIsExists = jest.fn().mockReturnValueOnce(undefined);
      session["generalStore"].state.Session = { isExists: mockIsExists } as any;

      const result = session.handleSessionForFlow(
        moment().set("hour", 10).unix()
      );

      expect(session.sessions.getAll()).toHaveLength(1);
      expect(result).toMatchObject({
        id: 1,
        start: expect.any(Object),
        end: expect.any(Object),
        sessionId: 1,
      });
    });
  });
  describe("isExists", () => {
    it("should return a session if one exists with the specified start and end Unix timestamps", () => {
      const mockSession = {
        id: 1,
        start: { unix: 1000, utc: moment() },
        end: { unix: 2000, utc: moment() },
        sessionId: 1,
      };
      jest.spyOn(session.sessions, "getAll").mockReturnValueOnce([mockSession]);

      const result = session.isExists(1000, 2000);

      expect(result).toEqual(mockSession);
    });

    it("should return undefined if no session exists with the specified timestamps", () => {
      jest.spyOn(session.sessions, "getAll").mockReturnValueOnce([]);

      const result = session.isExists(1000, 2000);

      expect(result).toBeUndefined();
    });
  });

  describe("getSession", () => {
    it("should return the session corresponding to the given ID", () => {
      const mockSession = {
        id: 1,
        start: { unix: 1000, utc: moment() },
        end: { unix: 2000, utc: moment() },
        sessionId: 1,
      };
      jest.spyOn(session, "getIndexById").mockReturnValueOnce(0);
      jest.spyOn(session.sessions, "get").mockReturnValueOnce(mockSession);

      const result = session.getSession(1);

      expect(result).toEqual(mockSession);
    });

    it("should return null if no session exists for the given ID", () => {
      jest.spyOn(session, "getIndexById").mockReturnValueOnce(undefined);

      const result = session.getSession(1);

      expect(result).toBeNull();
    });
  });

  describe("getMaxId", () => {
    it("should return the maximum session ID", () => {
      session["maxId"] = 42;

      const result = session.getMaxId();

      expect(result).toBe(42);
    });
  });

  describe("getIndexById", () => {
    it("should return the index corresponding to the given session ID", () => {
      session["indexMap"].set(1, 0);

      const result = session.getIndexById(1);

      expect(result).toBe(0);
    });

    it("should return undefined if the session ID does not exist in the index map", () => {
      const result = session.getIndexById(1);

      expect(result).toBeUndefined();
    });
  });

  describe("Integration Tests", () => {
    it("should handle a full flow of fetching, creating, and retrieving sessions", async () => {
      const mockSessions = [
        { id: 1, start: "09:00", end: "17:00" },
        { id: 2, start: "18:00", end: "22:00" },
      ];
      mockPrisma.session.findMany.mockResolvedValueOnce(mockSessions);

      await session.fetch();

      expect(session["sessionRecords"]).toEqual(mockSessions);

      const unixTimestamp = moment
        .utc()
        .set("hour", 10)
        .set("minute", 0)
        .set("second", 0)
        .unix();
      const handledSession = session.handleSessionForFlow(unixTimestamp);

      expect(handledSession).toMatchObject({
        id: 1,
        start: expect.any(Object),
        end: expect.any(Object),
        sessionId: 1,
      });

      const retrievedSession = session.getSession(handledSession?.id as number);

      expect(retrievedSession).toEqual(handledSession);
    });
  });
});
