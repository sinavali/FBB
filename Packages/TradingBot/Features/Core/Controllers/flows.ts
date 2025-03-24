import {ICandle, ModelOneData} from "@shared/Types/Interfaces/general.ts";
import {GeneralStore} from "@shared/Types/Interfaces/generalStore.ts";
import {checkForHunt} from "@tradingBot/Features/Features/Liquidity/Controllers/HuntController.ts";
import {validateLiquidities} from "@tradingBot/Features/Features/Liquidity/Validations.ts";

export async function modelOne(generalStore: GeneralStore) {
    let start = new Date().getTime();
    const data: ModelOneData = (await initiationPhaseModelOne(generalStore)) as ModelOneData;

    generalStore.state.Time.add("initiationPhaseModelOne", new Date().getTime() - start);

    start = new Date().getTime();
    await updatePhaseModelOne(generalStore, data);

    generalStore.state.Time.add("updatePhaseModelOne", new Date().getTime() - start);
}

// should initiate data here (finding new MSS, COB, Liquidity and ...)
async function initiationPhaseModelOne(generalStore: GeneralStore) {
    const data: ModelOneData = {
        timezone:
        generalStore.state.Setting?.getOne("BotTimezoneOffset")?.settingValueParsed,
        isInSession: false,
        isInWorkTime: false,
        candle: null,
        latestSession: null,
        latestWorkTime: null,
    };

    const candle = generalStore.state.Candle?.candles.getNewest();
    if (!candle) return;
    data.candle = candle;

    let startTime = new Date().getTime();

    // create new session if needed and get the latest session
    const session = generalStore.state.Session?.handleSessionForFlow(data.candle.time.unix);

    generalStore.state.Time.add("handleSessionForFlow", new Date().getTime() - startTime);

    startTime = new Date().getTime();

    if (session) generalStore.state.MicroTime?.newMicroTimeForSession(session);
    data.latestSession = session ?? null;

    generalStore.state.Time.add("newMicroTimeForSession", new Date().getTime() - startTime);

    startTime = new Date().getTime();

    // check if this candle is inside a session
    data.isInSession = !!generalStore.state.Session?.isUnixInSessionRecords(data.candle.time.unix);

    generalStore.state.Time.add("isUnixInSessionRecords", new Date().getTime() - startTime);

    startTime = new Date().getTime();

    // create new workTime if needed and get the latest workTime
    const workTime = generalStore.state.WorkTime?.handleWorkTimeForFlow(data.candle.time.unix);

    generalStore.state.Time.add("handleWorkTimeForFlow", new Date().getTime() - startTime);

    startTime = new Date().getTime();

    if (workTime) generalStore.state.MicroTime?.newMicroTimeForWorkTime(workTime);
    data.latestWorkTime = workTime ?? null;

    generalStore.state.Time.add(
        "newMicroTimeForWorkTime",
        new Date().getTime() - startTime
    );

    startTime = new Date().getTime();

    // check if this candle is inside a workTime
    data.isInWorkTime = !!generalStore.state.WorkTime?.isUnixInWorkTimeRecords(
        data.candle.time.unix
    );

    generalStore.state.Time.add(
        "isUnixInWorkTimeRecords",
        new Date().getTime() - startTime
    );

    startTime = new Date().getTime();

    // generate liquidities if not exists
    startTime = new Date().getTime();

    generalStore.state.Liquidity.generateLiquidities({
        type: "daily",
        candle: data.candle,
        timezone: data.timezone as string,
    });

    generalStore.state.Time.add(
        "generateLiquidities Daily",
        new Date().getTime() - startTime
    );

    startTime = new Date().getTime();

    generalStore.state.Liquidity.generateLiquidities({
        type: "weekly",
        candle: data.candle,
        timezone: data.timezone as string,
    });

    generalStore.state.Time.add(
        "generateLiquidities Weekly",
        new Date().getTime() - startTime
    );

    if (data.latestSession) {
        startTime = new Date().getTime();

        generalStore.state.Liquidity.generateLiquidities({
            type: "bySession",
            pairPeriod: data.candle.pairPeriod,
            session: data.latestSession,
        });

        generalStore.state.Time.add(
            "generateLiquidities BySession",
            new Date().getTime() - startTime
        );
    }

    startTime = new Date().getTime();

    // validate and update all liquidities
    validateLiquidities(generalStore);

    generalStore.state.Time.add(
        "validateLiquidities",
        new Date().getTime() - startTime
    );

    generalStore.state.COB?.initiateCOB(data.candle);
    generalStore.state.COB?.updateCOB(data.candle);

    generalStore.state.MSS?.initiateMSS(data.candle);
    // generalStore.state.MSS?.updateMSS(data.candle);

    return data;
}

// should update liquidities, COBs, MSSs and signals here
async function updatePhaseModelOne(
    generalStore: GeneralStore,
    data: ModelOneData
) {
    if (data.candle) {
        generalStore.state.MSS?.updateMSS(data.candle as ICandle);
    }

    const liquidities = generalStore.state.Liquidity?.liquidities
        .getAll()
        .filter((l) => !l.failed && !l.hunted);

    if (liquidities) {
        for (let i = 0; i < liquidities.length; i++) {
            let startTime = new Date().getTime();

            checkForHunt(generalStore, liquidities[i]);

            generalStore.state.Time.add(
                "validateLiquidities",
                new Date().getTime() - startTime
            );
        }
    }
}
