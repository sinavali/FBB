import mysql from "mysql2/promise";
import Net from "net";

export type MysqlConnection = mysql.Connection | null;
export type NetSocket = Net.Socket | null;
