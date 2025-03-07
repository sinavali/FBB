import {
    LiquidityMode,
    LiquidityUsedStatus,
    MicroTimeType,
    Triggers,
} from "@shared/Types/Enums.ts";
import {ILiquidity, IPricePoint} from "@shared/Types/Interfaces/general.ts";
import {GeneralStore} from "@shared/Types/Interfaces/generalStore.ts";

export function validatePullback(
    generalStore: GeneralStore,
    candles: IPricePoint[],
    time: number,
    highestPoints: IPricePoint[],
    lowestPoints: IPricePoint[]
): { low: boolean; high: boolean } {
    if (!highestPoints.length || !lowestPoints.length)
        return {low: false, high: false};

    const hp = highestPoints[0].high; // considering the first point is intended
    const lp = lowestPoints[0].low; // considering the first point is intended
    const diff = hp - lp;
    const liquidityPullbackMultiplier = (100 /
        generalStore.state.Setting?.getOne("LiquidityPullbackPercent")
            ?.settingValueParsed) as number;

    const filteredCandlesForHighResult = candles.filter(
        (c) => c.time.unix >= highestPoints[0].time.unix
    );
    const highResult = validatePullbackFromHigh(
        filteredCandlesForHighResult,
        diff,
        liquidityPullbackMultiplier,
        hp
    );

    const filteredCandlesForLowResult = candles.filter(
        (c) => c.time.unix >= lowestPoints[0].time.unix
    );
    const lowResult = validatePullbackFromLow(
        filteredCandlesForLowResult,
        diff,
        liquidityPullbackMultiplier,
        lp
    );

    return {low: lowResult, high: highResult};
}

function validatePullbackFromLow(
    candles: IPricePoint[],
    diff: number,
    multiplier: number,
    lp: number
): boolean {
    const pullbackPrice = lp + diff / multiplier;
    return candles.some((c) => c.high >= pullbackPrice);
}

function validatePullbackFromHigh(
    candles: IPricePoint[],
    diff: number,
    multiplier: number,
    hp: number
): boolean {
    const pullbackPrice = hp - diff / multiplier;
    return candles.some((c) => c.low <= pullbackPrice);
}

export function validateLiquidities(generalStore: GeneralStore) {
    const liquidities = generalStore.state.Liquidity?.liquidities.getAll([
        ["failed", false],
    ]);
    if (!liquidities || !liquidities.length) return;

    for (let i = 0; i < liquidities.length; i++) {
        // time stuff
        validatePassedSessions(generalStore, liquidities[i]);
        validatePassedWorkTime(generalStore, liquidities[i]);

        // general
        validateMaxUsed(generalStore, liquidities[i]);
        validateMaxStopLoss(generalStore, liquidities[i]);
        validateMaxTakeProfit(generalStore, liquidities[i]);

        // driven pattern
        validateMaxDrivenPattern(generalStore, liquidities[i]);
        validateMaxDrivenPatternStopLoss(generalStore, liquidities[i]);
        validateMaxDrivenPatternTakeProfit(generalStore, liquidities[i]);

        // MSS
        validateMaxMSS(generalStore, liquidities[i]);
        validateMaxMSSStopLoss(generalStore, liquidities[i]);
        validateMaxMSSTakeProfit(generalStore, liquidities[i]);

        // COB
        validateMaxCOB(generalStore, liquidities[i]);
        validateMaxCOBStopLoss(generalStore, liquidities[i]);
        validateMaxCOBTakeProfit(generalStore, liquidities[i]);
    }
}

export function validatePassedSessions(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    if (
        liquidity.mode !== LiquidityMode.BYSESSION &&
        liquidity.mode !== LiquidityMode.BYWORKTIME
    )
        return;

    const allSessionMicros = generalStore.state.MicroTime?.microTimes
        .getAll()
        .filter((mt) => mt.type === MicroTimeType.SESSION);
    if (!allSessionMicros?.length) return;

    const microTimesBeforeLiquidity = allSessionMicros.filter(
        (mt) => mt.start.unix < liquidity.timeRange.start.unix
    );

    const variable = generalStore.state.Setting?.getOne(
        "LiquidityMaxAgeSessionMicro"
    )?.settingValueParsed;

    if (allSessionMicros.length - microTimesBeforeLiquidity.length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

export function validatePassedWorkTime(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    if (
        liquidity.mode !== LiquidityMode.BYSESSION &&
        liquidity.mode !== LiquidityMode.BYWORKTIME
    )
        return;

    const allWorkTimeMicros = generalStore.state.MicroTime?.microTimes
        .getAll()
        .filter((mt) => mt.type === MicroTimeType.WORKTIME);
    if (!allWorkTimeMicros?.length) return;

    const microTimesBeforeLiquidity = allWorkTimeMicros.filter(
        (mt) => mt.start.unix < (liquidity.timeRange.start.unix as number)
    );

    const variable = generalStore.state.Setting?.getOne(
        "LiquidityMaxAgeWorkTimeMicro"
    )?.settingValueParsed;

    if (allWorkTimeMicros.length - microTimesBeforeLiquidity.length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

// validate generally
export function validateMaxUsed(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    const variable = generalStore.state.Setting?.getOne(
        "LiquidityMaxUsedCount"
    )?.settingValueParsed;

    if (liquidity.used.length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

export function validateMaxStopLoss(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    const variable = generalStore.state.Setting?.getOne(
        "LiquidityMaxStopLossUsedCount"
    )?.settingValueParsed;
    const length = liquidity.used.filter(
        (u) => u.status === LiquidityUsedStatus.STOPLOSS
    ).length;

    if (length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

export function validateMaxTakeProfit(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    const variable = generalStore.state.Setting?.getOne(
        "LiquidityMaxTakeProfitUsedCount"
    )?.settingValueParsed;
    const length = liquidity.used.filter(
        (u) => u.status === LiquidityUsedStatus.TAKEPROFIT
    ).length;

    if (length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

// validate by DrivenPattern
export function validateMaxDrivenPattern(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    const variable = generalStore.state.Setting?.getOne(
        "LiquidityUsedMaxDrivenPattenUsedCount"
    )?.settingValueParsed;
    const length = liquidity.used.filter((u) => u.trigger === Triggers.DP).length;

    if (length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

export function validateMaxDrivenPatternStopLoss(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    const variable = generalStore.state.Setting?.getOne(
        "LiquidityUsedMaxDrivenPattenStopLossUsedCount"
    )?.settingValueParsed;
    const length = liquidity.used.filter(
        (u) =>
            u.trigger === Triggers.DP && u.status === LiquidityUsedStatus.STOPLOSS
    ).length;

    if (length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

export function validateMaxDrivenPatternTakeProfit(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    const variable = generalStore.state.Setting?.getOne(
        "LiquidityUsedMaxDrivenPattenTakeProfitUsedCount"
    )?.settingValueParsed;
    const length = liquidity.used.filter(
        (u) =>
            u.trigger === Triggers.DP && u.status === LiquidityUsedStatus.TAKEPROFIT
    ).length;

    if (length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

// validate by MSS
export function validateMaxMSS(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    const variable = generalStore.state.Setting?.getOne(
        "LiquidityUsedMaxMSSUsedCount"
    )?.settingValueParsed;
    const length = liquidity.used.filter(
        (u) => u.trigger === Triggers.MSS
    ).length;

    if (length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

export function validateMaxMSSStopLoss(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    const variable = generalStore.state.Setting?.getOne(
        "LiquidityUsedMaxMSSStopLossUsedCount"
    )?.settingValueParsed;
    const length = liquidity.used.filter(
        (u) =>
            u.trigger === Triggers.MSS && u.status === LiquidityUsedStatus.STOPLOSS
    ).length;

    if (length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

export function validateMaxMSSTakeProfit(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    const variable = generalStore.state.Setting?.getOne(
        "LiquidityUsedMaxMSSTakeProfitUsedCount"
    )?.settingValueParsed;
    const length = liquidity.used.filter(
        (u) =>
            u.trigger === Triggers.MSS && u.status === LiquidityUsedStatus.TAKEPROFIT
    ).length;

    if (length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

// validate by COB
export function validateMaxCOB(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    const variable = generalStore.state.Setting?.getOne(
        "LiquidityUsedMaxCOBUsedCount"
    )?.settingValueParsed;
    const length = liquidity.used.filter(
        (u) => u.trigger === Triggers.COB
    ).length;

    if (length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

export function validateMaxCOBStopLoss(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    const variable = generalStore.state.Setting?.getOne(
        "LiquidityUsedMaxCOBStopLossUsedCount"
    )?.settingValueParsed;
    const length = liquidity.used.filter(
        (u) =>
            u.trigger === Triggers.COB && u.status === LiquidityUsedStatus.STOPLOSS
    ).length;

    if (length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

export function validateMaxCOBTakeProfit(
    generalStore: GeneralStore,
    liquidity: ILiquidity
) {
    const variable = generalStore.state.Setting?.getOne(
        "LiquidityUsedMaxCOBTakeProfitUsedCount"
    )?.settingValueParsed;
    const length = liquidity.used.filter(
        (u) =>
            u.trigger === Triggers.COB && u.status === LiquidityUsedStatus.TAKEPROFIT
    ).length;

    if (length >= variable)
        generalStore.state.Liquidity?.makeLiquidityFailed(liquidity.id);
}

export function shouldCheckHunt(
    generalStore: GeneralStore,
    liquidity: ILiquidity
): boolean {
    if (liquidity.hunted || liquidity.failed) return false;

    const candle = generalStore.state.Candle?.candles.getNewest();
    if (!candle) return false;

    return candle.time.unix > liquidity.timeRange.end.unix;
}
