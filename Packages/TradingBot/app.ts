import { initLogger } from "@shared/Initiatives/Logger.ts";
import logger from "@shared/Initiatives/Logger.ts";
import liveMode from "@tradingBot/Features/Core/Controllers/liveModeController.ts";
import signalMode from "@tradingBot/Features/Core/Controllers/signalModeController.ts";
import backtestMode from "@tradingBot/Features/Core/Controllers/backtestModeController.ts";
import mtBacktestMode from "@tradingBot/Features/Core/Controllers/MtBacktestModeController.js";
import backtestLiveMode from "@tradingBot/Features/Core/Controllers/backtestLiveModeController.ts";
import { ProjectName, SystemMode } from "@shared/Types/Enums.ts";
// import { useGeneralStore } from "@shared/Stores/GeneralStore.ts";
import GeneralStoreClass from "@shared/Stores/GeneralStore.ts";
import http from "http"

// logger.info("This is an info log.");
// logger.warn("This is a warning log.");
// logger.error("This is an error log.");

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
const generalStore = new GeneralStoreClass();

setTimeout(async () => {
    // init flows
    if (!generalStore.state.Setting) return;

    const systemMode = generalStore.state.Setting.getOne("SystemMode")?.settingValueParsed;
    if (!systemMode) {
        logger.error("system mode is invalid: " + systemMode);
        process.exit();
    } else logger.info("system mode is: " + systemMode);

    generalStore.globalStates.systemMode = systemMode;
    await generalStore.state.Database.init(
        ProjectName.BOT,
        systemMode
    );

    generalStore.state.Time.add(
        "application warmup and initialization",
        new Date().getTime() - start
    );
    console.log(systemMode)
    if (systemMode === SystemMode.LIVE) liveMode(generalStore);
    else if (systemMode === SystemMode.SIGNAL)
        signalMode(generalStore);
    else if (systemMode === SystemMode.BACKTEST)
        backtestMode(generalStore);
    else if (systemMode === SystemMode.MTBACKTEST)
        mtBacktestMode(generalStore);
    else if (systemMode === SystemMode.BACKTESTLIVE)
        backtestLiveMode(generalStore);
}, 5000);

// initiating a server only for making the app running endlesly
http.createServer((req, res) => {
    res.end('Hello from Node!');
}).listen(12345, () => ({}));