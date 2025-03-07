import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';

type Signal = {
    id: number;
    triggerCandleId: number;
    triggerId: number;
    trigger: string;
    direction: string;
    limit: number;
    stoploss: number;
    takeprofit: number;
    pairPeriod: {
        pair: string;
        period: string;
    };
    status: 'FAILED' | 'TRIGGERED' | 'STOPLOSS' | 'TAKEPROFIT';
    time: {
        unix: number;
        utc: string;
    };
    liquidityUsed: {
        liquidityId: number;
        status: string;
        time: {
            unix: number;
            utc: string;
        };
        trigger: string;
        triggerId: number;
    };
};

function findSignalFiles(baseDir: string): string[] {
    const results: string[] = [];
    const items = fs.readdirSync(baseDir, {withFileTypes: true});

    for (const item of items) {
        const fullPath = path.join(baseDir, item.name);
        if (item.isDirectory()) {
            results.push(...findSignalFiles(fullPath));
        } else if (item.name === 'signal.json') {
            results.push(fullPath);
        }
    }
    return results;
}

function filterByTimeRange(data: Signal[], startTime: any, endTime: moment.Moment): Signal[] {
    return data.filter((item) => {
        const itemTime = moment.unix(item.time.unix).utc();
        return itemTime.isBetween(startTime, endTime, null, '[)');
    });
}

function calculateConsecutive(data: Signal[]): {
    maxConsecutiveSL: number;
    maxConsecutiveTP: number;
    consecutiveSLDetails: number[];
    consecutiveTPDetails: number[];
} {
    let maxConsecutiveSL = 0;
    let maxConsecutiveTP = 0;
    let currentConsecutiveSL = 0;
    let currentConsecutiveTP = 0;
    const consecutiveSLDetails: number[] = [];
    const consecutiveTPDetails: number[] = [];

    data.forEach((item) => {
        if (item.status === 'STOPLOSS') {
            currentConsecutiveSL++;
            currentConsecutiveTP = 0;
            consecutiveSLDetails.push(currentConsecutiveSL);
            consecutiveTPDetails.push(0);
            if (currentConsecutiveSL > maxConsecutiveSL) {
                maxConsecutiveSL = currentConsecutiveSL;
            }
        } else if (item.status === 'TAKEPROFIT') {
            currentConsecutiveTP++;
            currentConsecutiveSL = 0;
            consecutiveTPDetails.push(currentConsecutiveTP);
            consecutiveSLDetails.push(0);
            if (currentConsecutiveTP > maxConsecutiveTP) {
                maxConsecutiveTP = currentConsecutiveTP;
            }
        } else {
            consecutiveSLDetails.push(0);
            consecutiveTPDetails.push(0);
            currentConsecutiveSL = 0;
            currentConsecutiveTP = 0;
        }
    });

    return {maxConsecutiveSL, maxConsecutiveTP, consecutiveSLDetails, consecutiveTPDetails};
}

function calculateWinrate(data: Signal[]): number {
    const totalTrades = data.filter((item) => item.status === 'STOPLOSS' || item.status === 'TAKEPROFIT').length;
    const totalTakeProfits = data.filter((item) => item.status === 'TAKEPROFIT').length;
    return totalTrades === 0 ? 0 : (totalTakeProfits / totalTrades) * 100;
}

function countStats(data: Signal[]): { stopLosses: number; takeProfits: number; trades: number } {
    const stopLosses = data.filter((item) => item.status === 'STOPLOSS').length;
    const takeProfits = data.filter((item) => item.status === 'TAKEPROFIT').length;
    const trades = stopLosses + takeProfits;
    return {stopLosses, takeProfits, trades};
}

function calculateR(stopLosses: number, takeProfits: number, riskReward: number): number {
    return takeProfits * riskReward - stopLosses;
}

function generateDetailedBreakdown(data: Signal[], timeframe: string, earliestTimestamp: number, latestTimestamp: number): any[] {
    const breakdown: any[] = [];
    const startTime = moment.unix(earliestTimestamp).utc();
    const endTime = moment.unix(latestTimestamp).utc();

    let currentStart = startTime.clone();
    let detailId = 1;

    while (currentStart.isBefore(endTime)) {
        let currentEnd;
        switch (timeframe) {
            case 'daily':
                currentEnd = currentStart.clone().add(1, 'day');
                break;
            case 'weekly':
                currentEnd = currentStart.clone().add(1, 'week');
                break;
            case 'twoWeeks':
                currentEnd = currentStart.clone().add(2, 'weeks');
                break;
            case 'monthly':
                currentEnd = currentStart.clone().add(1, 'month');
                break;
            case 'yearly':
                currentEnd = currentStart.clone().add(1, 'year');
                break;
            default:
                throw new Error(`Invalid timeframe: ${timeframe}`);
        }

        const filteredData = filterByTimeRange(data, currentStart, currentEnd);
        const stats = countStats(filteredData);
        const winrate = calculateWinrate(filteredData);
        const R = calculateR(stats.stopLosses, stats.takeProfits, 3);
        const consecutive = calculateConsecutive(filteredData);

        breakdown.push({
            id: detailId++,
            [timeframe]: currentStart.format(timeframe === 'monthly' ? 'YYYY-MM' : 'YYYY-MM-DD'),
            trades: filteredData
                .filter((item) => item.status === 'STOPLOSS' || item.status === 'TAKEPROFIT')
                .map((item) => ({time: item.time.utc, status: item.status})),
            ...stats,
            winrate: winrate.toFixed(2),
            R,
            consecutiveStopLossDetails: consecutive.maxConsecutiveSL,
            consecutiveTakeProfitDetails: consecutive.maxConsecutiveTP,
        });

        currentStart = currentEnd;
    }

    return breakdown;
}

function createSorts(details: any[]) {
    return {
        trades: [...details].sort((a, b) => b.trades - a.trades).map(d => d.id),
        stopLoss: [...details].sort((a, b) => b.stopLosses - a.stopLosses).map(d => d.id),
        takeProfit: [...details].sort((a, b) => b.takeProfits - a.takeProfits).map(d => d.id),
        consecutiveStopLossDetails: [...details].sort((a, b) =>
            b.consecutiveStopLossDetails - a.consecutiveStopLossDetails
        ).map(d => d.id),
        consecutiveTakeProfitDetails: [...details].sort((a, b) =>
            b.consecutiveTakeProfitDetails - a.consecutiveTakeProfitDetails
        ).map(d => d.id),
    };
}

export function formatSignals() {
    const reportsDir = './Packages/TradingBot';
    const signalFiles = findSignalFiles(reportsDir);

    for (const filePath of signalFiles) {
        const originalData: Signal[] = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Apply the signal filter
        const data = originalData.filter(signal => {
            const diff = (signal.direction === "UP"
                ? signal.limit - signal.stoploss
                : signal.stoploss - signal.limit) / 0.0001;
            return diff >= 3;
        });

        const outputDir = path.join(path.dirname(filePath), 'timeframeReports');
        const timestamps = data.map((item) => item.time.unix);
        const earliestTimestamp = Math.min(...timestamps);
        const latestTimestamp = Math.max(...timestamps);

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, {recursive: true});
        }

        const timeframes = ['daily', 'weekly', 'twoWeeks', 'monthly', 'yearly'];
        for (const timeframe of timeframes) {
            const filteredData = filterByTimeRange(data, moment.unix(earliestTimestamp).utc(), moment.unix(latestTimestamp).utc());
            const consecutive = calculateConsecutive(filteredData);
            const winrate = calculateWinrate(filteredData);
            const stats = countStats(filteredData);
            const R = calculateR(stats.stopLosses, stats.takeProfits, 3);
            const details = generateDetailedBreakdown(data, timeframe, earliestTimestamp, latestTimestamp);

            const report = {
                overall: {
                    consecutiveStopLosses: consecutive.maxConsecutiveSL,
                    consecutiveTakeProfits: consecutive.maxConsecutiveTP,
                    winrate: winrate.toFixed(2),
                    ...stats,
                    R,
                    sorts: createSorts(details),
                },
                details,
            };

            fs.writeFileSync(
                path.join(outputDir, `${timeframe}Report.json`),
                JSON.stringify(report, null, 2),
                'utf8'
            );
            console.log(`Report generated: ${path.join(outputDir, `${timeframe}Report.json`)}`);
        }
    }
}

// formatSignals();