import Query from "@shared/Queries.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import { SystemMode } from "@shared/Types/Enums.ts";
import logger from "@shared/Initiatives/Logger.ts";

jest.mock("@shared/Initiatives/Logger.ts");

describe("Query.ts", () => {
  let queryInstance: Query;
  let mockGeneralStore: GeneralStore;
  let mockConnection: any;

  beforeEach(() => {
    // Mock database connection
    mockConnection = {
      execute: jest.fn(),
    };

    // Mock GeneralStore
    mockGeneralStore = {
      state: {
        Database: {
          getConnection: jest.fn((mode: SystemMode) => {
            if (mode === SystemMode.LIVE || mode === SystemMode.BACKTEST) {
              return mockConnection;
            }
            return null;
          }),
        },
      },
    } as unknown as GeneralStore;

    queryInstance = new Query(mockGeneralStore);
  });

  describe("getById", () => {
    it("should return the correct query for a valid ID", () => {
      const result = queryInstance.getById(2);
      expect(result.name).toBe("fetch_all_candles_from_forexcom_table");
    });

    it("should return the fallback query for an invalid ID", () => {
      const result = queryInstance.getById(999); // Non-existent ID
      expect(result.name).toBe("fail_safe_query"); // Default query
    });
  });

  describe("getByName", () => {
    it("should return the correct query for a valid name", () => {
      const result = queryInstance.getByName(
        "fetch_all_candles_from_forexcom_table"
      );
      expect(result.id).toBe(2);
    });

    it("should return the fallback query for an invalid name", () => {
      const result = queryInstance.getByName("non_existent_query");
      expect(result.name).toBe("fail_safe_query"); // Default query
    });
  });

  describe("exec", () => {
    it("should execute the query in LIVE mode without parameters or limit", async () => {
      const query = queryInstance.getById(1);
      await queryInstance.exec(false, query);

      expect(
        mockGeneralStore.state.Database.getConnection
      ).toHaveBeenCalledWith(SystemMode.LIVE);
      expect(mockConnection.execute).toHaveBeenCalledWith(query.query);
    });

    it("should execute the query in BACKTEST mode with parameters", async () => {
      const query = queryInstance.getById(3);
      const params = [1546349700, 1546349900];

      await queryInstance.exec(true, query, params);

      expect(
        mockGeneralStore.state.Database.getConnection
      ).toHaveBeenCalledWith(SystemMode.BACKTEST);
      expect(mockConnection.execute).toHaveBeenCalledWith(query.query, params);
    });

    it("should append LIMIT to the query when specified", async () => {
      const query = queryInstance.getById(2);

      await queryInstance.exec(false, query, undefined, 10);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        `${query.query} LIMIT 10`
      );
    });

    it("should handle errors and log them", async () => {
      const query = queryInstance.getById(1);
      mockConnection.execute.mockRejectedValue(new Error("Database error"));

      const result = await queryInstance.exec(false, query);

      // Use a type guard to narrow the type
      if (result instanceof Error) {
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toContain("Database error");
      } else {
        fail("Expected an Error instance, but got a result tuple");
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("an Error happend when executing this query")
      );
    });
  });
});
