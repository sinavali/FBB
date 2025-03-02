import fs from 'fs';
import moment from 'moment-timezone';

// Define types for the signal data
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

// Helper function to filter data by time range
function filterByTimeRange(data: Signal[], startTime: any, endTime: moment.Moment): Signal[] {
    return data.filter((item) => {
        const itemTime = moment.unix(item.time.unix).utc();
        return itemTime.isBetween(startTime, endTime, null, '[)');
    });
}

// Helper function to calculate consecutive StopLosses and TakeProfits
function calculateConsecutive(data: Signal[]): { maxConsecutiveSL: number; maxConsecutiveTP: number } {
    let maxConsecutiveSL = 0;
    let maxConsecutiveTP = 0;
    let currentConsecutiveSL = 0;
    let currentConsecutiveTP = 0;

    data.forEach((item) => {
        if (item.status === 'STOPLOSS') {
            currentConsecutiveSL++;
            currentConsecutiveTP = 0;
            if (currentConsecutiveSL > maxConsecutiveSL) {
                maxConsecutiveSL = currentConsecutiveSL;
            }
        } else if (item.status === 'TAKEPROFIT') {
            currentConsecutiveTP++;
            currentConsecutiveSL = 0;
            if (currentConsecutiveTP > maxConsecutiveTP) {
                maxConsecutiveTP = currentConsecutiveTP;
            }
        } else {
            currentConsecutiveSL = 0;
            currentConsecutiveTP = 0;
        }
    });

    return {maxConsecutiveSL, maxConsecutiveTP};
}

// Helper function to calculate winrate
function calculateWinrate(data: Signal[]): number {
    const totalTrades = data.filter((item) => item.status === 'STOPLOSS' || item.status === 'TAKEPROFIT').length;
    const totalTakeProfits = data.filter((item) => item.status === 'TAKEPROFIT').length;
    return totalTrades === 0 ? 0 : (totalTakeProfits / totalTrades) * 100;
}

// Helper function to count StopLosses, TakeProfits, and Trades
function countStats(data: Signal[]): { stopLosses: number; takeProfits: number; trades: number } {
    const stopLosses = data.filter((item) => item.status === 'STOPLOSS').length;
    const takeProfits = data.filter((item) => item.status === 'TAKEPROFIT').length;
    const trades = stopLosses + takeProfits;
    return {stopLosses, takeProfits, trades};
}

// Helper function to calculate R
function calculateR(stopLosses: number, takeProfits: number, riskReward: number): number {
    return takeProfits * riskReward - stopLosses;
}

// Helper function to generate detailed breakdown for a timeframe
function generateDetailedBreakdown(data: Signal[], timeframe: string, earliestTimestamp: number, latestTimestamp: number): any[] {
    const breakdown: any[] = [];
    const startTime = moment.unix(earliestTimestamp).utc();
    const endTime = moment.unix(latestTimestamp).utc();

    let currentStart = startTime.clone();
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

        breakdown.push({
            [timeframe]: currentStart.format(timeframe === 'monthly' ? 'YYYY-MM' : 'YYYY-MM-DD'),
            trades: filteredData
                .filter((item) => item.status === 'STOPLOSS' || item.status === 'TAKEPROFIT')
                .map((item) => ({time: item.time.utc, status: item.status})),
            ...stats,
            winrate: winrate.toFixed(2),
            R,
        });

        currentStart = currentEnd;
    }

    return breakdown;
}

// Generate reports
export function formatSignals() {
    // Find the earliest and latest timestamps in the data
    const data: Signal[] = JSON.parse(fs.readFileSync('./Reports/signal.json', 'utf8'));
    const timestamps = data.map((item) => item.time.unix);
    const earliestTimestamp = Math.min(...timestamps);
    const latestTimestamp = Math.max(...timestamps);

    const timeframes = ['daily', 'weekly', 'twoWeeks', 'monthly', 'yearly'];
    for (const timeframe of timeframes) {
        const filteredData = filterByTimeRange(data, moment.unix(earliestTimestamp).utc(), moment.unix(latestTimestamp).utc());
        const consecutive = calculateConsecutive(filteredData);
        const winrate = calculateWinrate(filteredData);
        const stats = countStats(filteredData);
        const R = calculateR(stats.stopLosses, stats.takeProfits, 3);

        const report = {
            overall: {
                consecutiveStopLosses: consecutive.maxConsecutiveSL,
                consecutiveTakeProfits: consecutive.maxConsecutiveTP,
                winrate: winrate.toFixed(2),
                ...stats,
                R,
            },
            details: generateDetailedBreakdown(data, timeframe, earliestTimestamp, latestTimestamp),
        };

        // Save the report to a separate file
        fs.writeFileSync(`./Reports/${timeframe}Report.json`, JSON.stringify(report), "utf8");
        console.log(`Report generated and saved: ${timeframe}Report.json`);
    }
}

formatSignals();