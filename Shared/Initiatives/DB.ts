import mysql from "mysql2/promise";
import logger from "@shared/Initiatives/Logger.ts";
import { ProjectName, SystemMode } from "@shared/Types/Enums.ts";
import {
  FBB_Bot_DB_USER,
  FBB_Bot_DB_HOST,
  FBB_Bot_DB_NAME,
  FBB_Bot_DB_PASSWORD,
  FBB_Bot_BACKTEST_DB_NAME,
} from "@shared/Constants/DB.ts";

export class MysqlConnector {
  public connection: mysql.Connection | null = null;
  public backtestDatabaseConnection: mysql.Connection | null = null;

  /**
   * Initialize a MySQL connection based on the provided project name.
   * @param projectName - The name of the project for which the database connection is required.
   * @param systemMode - The name of the systemMode as SystemMode.
   * @returns A promise that resolves once the connection is established.
   */
  public init(projectName: ProjectName, systemMode: SystemMode): Promise<void> {
    return new Promise(async (resolve) => {
      if (projectName === ProjectName.BOT) {
        if (
          systemMode === SystemMode.LIVE ||
          systemMode === SystemMode.SIGNAL
        ) {
          this.connection = await mysql.createConnection({
            host: FBB_Bot_DB_HOST,
            user: FBB_Bot_DB_USER,
            password: FBB_Bot_DB_PASSWORD,
            database: FBB_Bot_DB_NAME,
          });
        }
        if (systemMode === SystemMode.BACKTEST) {
          this.backtestDatabaseConnection = await mysql.createConnection({
            host: FBB_Bot_DB_HOST,
            user: FBB_Bot_DB_USER,
            password: FBB_Bot_DB_PASSWORD,
            database: FBB_Bot_BACKTEST_DB_NAME,
          });
        }
      }
      logger.info("mysql connection is complete");
      resolve();
    });
  }

  /**
   * Get the active MySQL connection.
   * @returns The active MySQL connection, or null if no connection exists.
   */
  public getConnection(name = SystemMode.LIVE): mysql.Connection | null {
    if (name === SystemMode.LIVE || name === SystemMode.SIGNAL)
      return this.connection;
    else if (name === SystemMode.BACKTEST)
      return this.backtestDatabaseConnection;
    else {
      logger.error("the provided name is invalid: " + name);
      return null;
    }
  }

  /**
   * Close the current MySQL connection if it exists.
   * @returns A promise that resolves when the connection is closed.
   */
  public async closeConnection(name: SystemMode): Promise<void> {
    if (name === SystemMode.LIVE || name === SystemMode.SIGNAL) {
      if (this.connection) {
        await this.connection.end();
        this.connection = null;
      } else this.connection = null;
    } else if (name === SystemMode.BACKTEST) {
      if (this.backtestDatabaseConnection) {
        await this.backtestDatabaseConnection.end();
        this.backtestDatabaseConnection = null;
      } else this.backtestDatabaseConnection = null;
    }

    logger.info("mysql connection closed");
  }
}
