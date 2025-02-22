// logger.info("This is an info log.");
// logger.warn("This is a warning log.");
// logger.error("This is an error log.");

import { initLogger } from "@shared/Initiatives/Logger.ts";
import logger from "@shared/Initiatives/Logger.ts";
import liveMode from "@tradingBot/Features/Core/Controllers/liveModeController.ts";
import signalMode from "@tradingBot/Features/Core/Controllers/signalModeController.ts";
import backtestMode from "@tradingBot/Features/Core/Controllers/backtestModeController.ts";
import { ProjectName, SystemMode } from "@shared/Types/Enums.ts";
import { useGeneralStore } from "@shared/Stores/GeneralStore.ts";

const start = new Date().getTime();

logger.info("Program has been started");

// wrap console times functions to be able to export the time
const timers: any = {};
console.time = (label: string) => {
  timers[label] = process.hrtime.bigint();
};

console.timeEnd = (label: string) => {
  if (timers[label]) {
    const end = process.hrtime.bigint();
    const duration = (Number(end - timers[label]) / 1e9).toFixed(3);
    console.log(`${label}: ${duration}s`);
    delete timers[label];
    return duration; // Return the duration for further use
  } else {
    console.warn(`Timer "${label}" does not exist.`);
    return null;
  }
};

// initiating connections
initLogger(ProjectName.BOT);
const generalStore = useGeneralStore();
const generalStates = generalStore.state;

if (!generalStates) {
  logger.error("general store is falsy");
  console.log("general store is falsy");
  process.exit();
}

// prisma is newed in general store by default
if (!generalStates.Setting) {
  logger.error("Setting class is not created");
  console.log("Setting class is not created");
  process.exit();
}
const settingInit = generalStates.Setting.fetch();

if (!generalStates.Session) {
  logger.error("Session class is not created");
  console.log("Session class is not created");
  process.exit();
}
const sessionInit = generalStates.Session.fetch();

if (!generalStates.WorkTime) {
  logger.error("WorkTime class is not created");
  console.log("WorkTime class is not created");
  process.exit();
}
const workTimeInit = generalStates.WorkTime.fetch();

Promise.all([settingInit, sessionInit, workTimeInit]).then(async () => {
  // init flows
  if (!generalStates.Setting) return;

  const systemMode = generalStates.Setting.getOne("SystemMode");
  if (!systemMode) {
    logger.error("system mode is invalid: " + systemMode);
    process.exit();
  } else logger.info("system mode is: " + systemMode);

  generalStore.globalStates.systemMode = systemMode.settingValue as SystemMode;
  await generalStates.Database.init(
    ProjectName.BOT,
    systemMode.settingValue as SystemMode
  );

  generalStates.Time.add(
    "application warmup and initialization",
    new Date().getTime() - start
  );

  setTimeout(() => {
    if (systemMode.settingValue === SystemMode.LIVE) liveMode(generalStore);
    else if (systemMode.settingValue === SystemMode.SIGNAL)
      signalMode(generalStore);
    else if (systemMode.settingValue === SystemMode.BACKTEST)
      backtestMode(generalStore);
  }, 2000);
});
