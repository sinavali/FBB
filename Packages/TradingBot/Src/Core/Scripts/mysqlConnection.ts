import mysql from "mysql2/promise";
import logger from "../../../logger.ts";
import type { MysqlConnection } from "../Types/Types/DBContext";

export let connection: MysqlConnection = null;

export async function initMysqlConnector() {
  if (!connection) {
    try {
      connection = await mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "qwerty",
        database: "fbb_core",
      });
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }
}

export default initMysqlConnector;
