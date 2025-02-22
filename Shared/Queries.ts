import { IQuery } from "@shared/Types/Interfaces/general.ts";
import { SystemMode } from "@shared/Types/Enums.ts";
import logger from "@shared/Initiatives/Logger.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";

export default class Query {
  private generalStore: GeneralStore;
  public queries: IQuery[] = [
    {
      id: 1,
      name: "fail_safe_query",
      description: "just one candle will be retrived",
      query: "SELECT * FROM forexcom ORDER BY closeTime DESC LIMIT 1",
    },
    {
      id: 2,
      name: "fetch_all_candles_from_forexcom_table",
      description:
        "this query will fetch all the candles in the forexcom table",
      query: "SELECT * FROM forexcom",
    },
    {
      id: 3,
      name: "fetch_some_candles_from_forexcom_table_by_time",
      description:
        "this query will fetch all the candles from forexcom table that are between two times and sorted ASC by closeTime and with a count limit",
      query:
        "SELECT * FROM candles where closeTime BETWEEN ? and ? ORDER BY closeTime ASC",
    },
    {
      id: 4,
      name: "fetch_count_of_candles_between_two_time_in_candles_table",
      description:
        "this query will count the number of candles between two times",
      query:
        "SELECT COUNT(id) AS count FROM candles where closeTime > ? and closeTime < ?",
    },
  ];

  constructor(generalStoreInstance: GeneralStore) {
    this.generalStore = generalStoreInstance;
  }

  getById(id: number): IQuery {
    return this.queries.find((q) => q.id === id) ?? this.queries[0];
  }

  getByName(name: string): IQuery {
    return this.queries.find((q) => q.name === name) ?? this.queries[0];
  }

  async exec(
    backtest: boolean = false,
    query: IQuery,
    params?: Array<number | string>,
    limit: number | boolean = false
  ) {
    try {
      let connection = null;
      if (backtest)
        connection = this.generalStore.state.Database.getConnection(
          SystemMode.BACKTEST
        );
      else
        connection = this.generalStore.state.Database.getConnection(
          SystemMode.LIVE
        );

      if (!connection) throw "no connection found";

      if (limit === false) {
        if (params) return await connection.execute(query.query, params);
        else return await connection.execute(query.query);
      } else {
        if (params)
          return await connection.execute(
            `${query.query} LIMIT ${limit}`,
            params
          );
        else return await connection.execute(`${query.query} LIMIT ${limit}`);
      }
    } catch (error) {
      logger.error(
        `an Error happend when executing this query: ${query.id} - ${query.name}\n${error}`
      );
      return new Error(
        `an Error happend when executing this query: ${query.id} - ${query.name}\n${error}`
      );
    }
  }
}
