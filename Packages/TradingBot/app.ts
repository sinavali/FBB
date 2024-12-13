// logger.info("This is an info log.");
// logger.warn("This is a warning log.");
// logger.error("This is an error log.");

import initMysql from "@shared/Initiatives/DB.ts";
import { initLogger } from "@shared/Initiatives/Logger";
import { connection } from "@shared/Initiatives/DB.ts";
import liveFlow from "@tradingBot/Features/Core/Controllers/liveModeController";
import signalFlow from "@tradingBot/Features/Core/Controllers/signalModeController";
import backtestFlow from "@tradingBot/Features/Core/Controllers/backtestModeController";
import { ProjectName } from "@shared/Types/Enums.ts";
// initiating connections

initLogger(ProjectName.FBB_Bot);
await initMysql(ProjectName.FBB_Bot);

// init flows
liveFlow();
signalFlow();
backtestFlow();

connection?.destroy();
