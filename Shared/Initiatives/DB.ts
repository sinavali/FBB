import mysql from "mysql2/promise";
import logger from "@shared/Initiatives/Logger";

import { ProjectName } from "@shared/Types/Enums";
import type { MysqlConnection } from "@shared/Types/Types";
import {
  FBB_Bot_DB_USER,
  FBB_Bot_DB_HOST,
  FBB_Bot_DB_NAME,
  FBB_Bot_DB_PASSWORD,
} from "@shared/Constants/DB";

export let connection: MysqlConnection = null;

export async function initMysqlConnector(projectName: ProjectName) {
  try {
    if (!connection) {
      switch (projectName) {
        case ProjectName.FBB_Bot:
          connection = await mysql.createConnection({
            host: FBB_Bot_DB_HOST,
            user: FBB_Bot_DB_USER,
            password: FBB_Bot_DB_PASSWORD,
            database: FBB_Bot_DB_NAME,
          });
          break;

        default:
          break;
      }
    }
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export default initMysqlConnector;
