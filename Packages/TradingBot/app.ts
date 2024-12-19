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
import { PrismaClient } from "@prisma/client";
// initiating connections

initLogger(ProjectName.BOT);
await initMysql(ProjectName.BOT);
const prisma = new PrismaClient();

// init flows
liveFlow(prisma);
signalFlow();
backtestFlow();

connection?.destroy();
