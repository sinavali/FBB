import winston from "winston";
import "winston-daily-rotate-file";
import { ProjectName } from "@shared/Types/Enums.ts";

let logDirectory = "./Logs";
const fullLogDirectory = `${logDirectory}/Full`;
const errorLogDirectory = `${logDirectory}/Errors`;
const warningLogDirectory = `${logDirectory}/Warnings`;
const infoLogDirectory = `${logDirectory}/Info`;

const levelFilter = (level: string) =>
  winston.format((info) => (info.level === level ? info : false))();

export function initLogger(projectName: ProjectName) {
  logDirectory = `./Logs/${projectName}`;
}

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    // Separate transports for each log level
    new winston.transports.DailyRotateFile({
      filename: `${errorLogDirectory}/%DATE%.log`,
      datePattern: "YYYY-MM-DD",
      zippedArchive: false,
      format: winston.format.combine(
        levelFilter("error"),
        winston.format.json()
      ),
      level: "error",
    }),
    new winston.transports.DailyRotateFile({
      filename: `${warningLogDirectory}/%DATE%.log`,
      datePattern: "YYYY-MM-DD",
      zippedArchive: false,
      format: winston.format.combine(
        levelFilter("warn"),
        winston.format.json()
      ),
      level: "warn",
    }),
    new winston.transports.DailyRotateFile({
      filename: `${infoLogDirectory}/%DATE%.log`,
      datePattern: "YYYY-MM-DD",
      zippedArchive: false,
      format: winston.format.combine(
        levelFilter("info"),
        winston.format.json()
      ),
      level: "info",
    }),

    // Full logs (all levels)
    new winston.transports.DailyRotateFile({
      filename: `${fullLogDirectory}/%DATE%.log`,
      datePattern: "YYYY-MM-DD",
      zippedArchive: false,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
  ],
});

export default logger;
