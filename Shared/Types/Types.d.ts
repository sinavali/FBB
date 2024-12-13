import mysql from "mysql2/promise";
import Net from "net";

export type MysqlConnection = null | mysql.Connection;
export type NetSocket = Net.Socket | null;
