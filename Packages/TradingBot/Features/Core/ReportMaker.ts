// ReportMaker.ts
import fs from 'fs';
import path from 'path';
import moment, { Moment } from 'moment-timezone';
import { SignalStatus, Triggers, LiquidityUsedStatus } from '@shared/Types/Enums.ts';
import { PairPeriod, DateTime } from '@shared/Types/Interfaces/common.ts';

// Define proper TypeScript interfaces based on your existing types
interface LiquidityUsed {
    liquidityId: number;
    status: LiquidityUsedStatus;
    time: DateTime;
    trigger: Triggers;
    triggerId: number;
}

interface Signal {
    id: number;
    triggerCandleId: number;
    triggerId: number;
    trigger: Triggers;
    direction: 'UP' | 'DOWN';
    limit: number;
    stoploss: number;
    takeprofit: number;
    pairPeriod: PairPeriod;
    status: SignalStatus;
    time: DateTime;
    liquidityUsed: LiquidityUsed;
}

interface TimeframeConfig {
    unit: moment.unitOfTime.DurationConstructor;
    count: number;
    format: string;
}

const TIMEFRAME_CONFIG: Record<string, TimeframeConfig> = {
    daily: { unit: 'day', count: 1, format: 'YYYY-MM-DD' },
    weekly: { unit: 'week', count: 1, format: 'YYYY-MM-DD' },
    twoWeeks: { unit: 'week', count: 2, format: 'YYYY-MM-DD' },
    monthly: { unit: 'month', count: 1, format: 'YYYY-MM' },
    yearly: { unit: 'year', count: 1, format: 'YYYY' },
};

const RISK_REWARD_RATIO = 3;
const MIN_PIP_DIFFERENCE = 3;
const PIP_DIVISOR = 0.0001;

// File system helpers
const readJSONFile = <T>(filePath: string): T => {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error: any) {
        throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
};

const writeJSONFile = (filePath: string, data: unknown) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

// Signal processing functions
const findSignalFiles = (baseDir: string): string[] => {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    return entries.flatMap(entry => {
        const fullPath = path.join(baseDir, entry.name);
        return entry.isDirectory() ? findSignalFiles(fullPath)
            : entry.name === 'signal.json' ? [fullPath] : [];
    });
};

const filterSignalsByPipDifference = (signals: Signal[]): Signal[] => {
    return signals.filter(signal => {
        const priceDifference = signal.direction === 'UP'
            ? signal.limit - signal.stoploss
            : signal.stoploss - signal.limit;
        return (priceDifference / PIP_DIVISOR) >= MIN_PIP_DIFFERENCE;
    });
};

// Date/time helpers
const getValidMoment = (timestamp: number): Moment => {
    const date = moment.unix(timestamp).utc();
    if (!date.isValid()) throw new Error(`Invalid timestamp: ${timestamp}`);
    return date;
};

const filterByTimeRange = (signals: Signal[], start: Moment, end: Moment): Signal[] => {
    return signals.filter(signal => {
        const signalTime = getValidMoment(signal.time.unix);
        return signalTime.isBetween(start, end, undefined, '[)');
    });
};

// Statistical calculations
interface ConsecutiveCounts {
    maxSL: number;
    maxTP: number;
    currentSL: number;
    currentTP: number;
    slDetails: number[];
    tpDetails: number[];
}

const calculateConsecutiveStats = (signals: Signal[]): Omit<ConsecutiveCounts, 'currentSL' | 'currentTP'> => {
    const initial: ConsecutiveCounts = {
        maxSL: 0,
        maxTP: 0,
        currentSL: 0,
        currentTP: 0,
        slDetails: [],
        tpDetails: [],
    };

    return signals.reduce((acc, signal) => {
        if (signal.status === 'STOPLOSS') {
            acc.currentSL++;
            acc.currentTP = 0;
            acc.maxSL = Math.max(acc.maxSL, acc.currentSL);
        } else if (signal.status === 'TAKEPROFIT') {
            acc.currentTP++;
            acc.currentSL = 0;
            acc.maxTP = Math.max(acc.maxTP, acc.currentTP);
        } else {
            acc.currentSL = 0;
            acc.currentTP = 0;
        }

        acc.slDetails.push(acc.currentSL);
        acc.tpDetails.push(acc.currentTP);
        return acc;
    }, initial);
};

const calculateWinRate = (signals: Signal[]): number => {
    const validSignals = signals.filter(s => ['STOPLOSS', 'TAKEPROFIT'].includes(s.status));
    if (validSignals.length === 0) return 0;
    const tpCount = validSignals.filter(s => s.status === 'TAKEPROFIT').length;
    return (tpCount / validSignals.length) * 100;
};

const calculateR = (stopLosses: number, takeProfits: number): number =>
    takeProfits * RISK_REWARD_RATIO - stopLosses;

// Report generation
interface TimeframeReport {
    id: number;
    timeframeLabel: string;
    trades: { time: moment.Moment; status: SignalStatus }[];
    stopLosses: number;
    takeProfits: number;
    tradesCount: number;
    winRate: string;
    rValue: number;
    maxConsecutiveSL: number;
    maxConsecutiveTP: number;
}

const generateTimeframeBreakdown = (
    signals: Signal[],
    timeframe: string,
    start: Moment,
    end: Moment
): TimeframeReport[] => {
    const config = TIMEFRAME_CONFIG[timeframe];
    if (!config) throw new Error(`Invalid timeframe: ${timeframe}`);

    let currentStart = start.clone();
    const breakdown: TimeframeReport[] = [];
    let detailId = 1;

    while (currentStart.isBefore(end)) {
        const currentEnd = currentStart.clone().add(config.count, config.unit);
        const intervalSignals = filterByTimeRange(signals, currentStart, currentEnd);
        const validTrades = intervalSignals.filter(s => ['STOPLOSS', 'TAKEPROFIT'].includes(s.status));

        const consecutiveStats = calculateConsecutiveStats(validTrades);
        const stopLosses = validTrades.filter(s => s.status === 'STOPLOSS').length;
        const takeProfits = validTrades.filter(s => s.status === 'TAKEPROFIT').length;

        breakdown.push({
            id: detailId++,
            timeframeLabel: currentStart.format(config.format),
            trades: validTrades.map(t => ({ time: t.time.utc, status: t.status })),
            stopLosses,
            takeProfits,
            tradesCount: validTrades.length,
            winRate: calculateWinRate(validTrades).toFixed(2),
            rValue: calculateR(stopLosses, takeProfits),
            maxConsecutiveSL: consecutiveStats.maxSL,
            maxConsecutiveTP: consecutiveStats.maxTP,
        });

        currentStart = currentEnd;
    }

    return breakdown;
};

// Main report generation
export const generateSignalReports = () => {
    const signalFiles = findSignalFiles('./Packages/TradingBot');

    signalFiles.forEach(filePath => {
        try {
            const rawSignals: Signal[] = readJSONFile(filePath);
            const filteredSignals = filterSignalsByPipDifference(rawSignals);

            if (filteredSignals.length === 0) {
                console.log(`No valid signals found in ${filePath}`);
                return;
            }

            const timestamps = filteredSignals.map(s => s.time.unix);
            const start = getValidMoment(Math.min(...timestamps));
            const end = getValidMoment(Math.max(...timestamps));
            const outputDir = path.join(path.dirname(filePath), 'timeframeReports');

            Object.keys(TIMEFRAME_CONFIG).forEach(timeframe => {
                const breakdown = generateTimeframeBreakdown(filteredSignals, timeframe, start, end);
                const overallStats = calculateConsecutiveStats(filteredSignals);
                const winRate = calculateWinRate(filteredSignals);
                const stopLosses = filteredSignals.filter(s => s.status === 'STOPLOSS').length;
                const takeProfits = filteredSignals.filter(s => s.status === 'TAKEPROFIT').length;

                const report = {
                    overall: {
                        consecutiveStopLosses: overallStats.maxSL,
                        consecutiveTakeProfits: overallStats.maxTP,
                        winRate: winRate.toFixed(2),
                        stopLosses,
                        takeProfits,
                        trades: stopLosses + takeProfits,
                        rValue: calculateR(stopLosses, takeProfits),
                    },
                    details: breakdown,
                };

                const outputPath = path.join(outputDir, `${timeframe}Report.json`);
                writeJSONFile(outputPath, report);
                console.log(`Generated report: ${outputPath}`);
            });
        } catch (error: any) {
            console.error(`Error processing ${filePath}: ${error.message}`);
        }
    });
};