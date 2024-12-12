// logger.info("This is an info log.");
// logger.warn("This is a warning log.");
// logger.error("This is an error log.");

import initMysql from "./Src/Core/Scripts/mysqlConnection.ts";
import { connection } from "./Src/Core/Scripts/mysqlConnection.ts";
import liveFlow from "./Src/Core/Scripts/flows/liveFlow.ts";
import signalFlow from "./Src/Core/Scripts/flows/signalFlow.ts";
import backtestFlow from "./Src/Core/Scripts/flows/backtestFlow.ts";
// initiating connections

await initMysql();

// init flows
liveFlow();
signalFlow();
backtestFlow();

connection?.destroy();
