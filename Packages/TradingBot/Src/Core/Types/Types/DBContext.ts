import winston from "winston";
import mysql from "mysql2/promise";

export type MysqlConnection = null | mysql.Connection;
