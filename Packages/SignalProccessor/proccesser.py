import json
from datetime import datetime, time
from collections import defaultdict

# Load and filter data
with open('Packages/TradingBot/Reports/signal.json') as f:
    signals = json.load(f)

# Filter signals for status "STOPLOSS" or "TAKEPROFIT" and trigger "MSS"
filtered_signals = [s for s in signals if s['status'] in ('STOPLOSS', 'TAKEPROFIT') and s['trigger'] in ('MSS')]

# Preprocess datetime fields
for signal in filtered_signals:
    signal['entry_time'] = datetime.fromisoformat(signal['entryTime']['utc'].replace('Z', '+00:00'))
    signal['closed_at'] = datetime.fromisoformat(signal['closedAt'].replace('Z', '+00:00'))
    signal['place_order_time'] = datetime.fromisoformat(signal['placeOrderTime'].replace('Z', '+00:00'))

# Define WorkTimes (UTC)
WORK_TIME_RANGES = [
    (time(5, 45), time(8, 0)),
    (time(8, 45), time(9, 30)),
    (time(10, 45), time(13, 0)),
    (time(13, 45), time(14, 30)),
    (time(16, 45), time(18, 0)),
]

def is_in_work_time(dt):
    t = dt.time()
    for start, end in WORK_TIME_RANGES:
        if start <= t < end:
            return True
    return False

# Categorize signals
work_time_signals = [s for s in filtered_signals if is_in_work_time(s['entry_time'])]
non_work_time_signals = [s for s in filtered_signals if not is_in_work_time(s['entry_time'])]
place_order_work_signals = [s for s in filtered_signals if is_in_work_time(s['place_order_time'])]
place_order_non_work_signals = [s for s in filtered_signals if not is_in_work_time(s['place_order_time'])]

# Helper functions
def get_max_consecutive_stoploss(signals):
    max_consec = current = 0
    for s in sorted(signals, key=lambda x: x['closed_at']):
        if s['status'] == 'STOPLOSS':
            current += 1
            max_consec = max(max_consec, current)
        else:
            current = 0
    return max_consec

def calculate_stats(signals):
    if not signals:
        return None
    trade_count = len(signals)
    stoploss = sum(1 for s in signals if s['status'] == 'STOPLOSS')
    takeprofit = trade_count - stoploss
    winrate = takeprofit / trade_count if trade_count else 0
    R = (takeprofit * 3) - stoploss  # 1:3 RiskReward
    return {
        'trade_count': trade_count,
        'stoploss_count': stoploss,
        'takeprofit_count': takeprofit,
        'winrate': winrate,
        'R': R
    }

def process_group(signals):
    stats = calculate_stats(signals)
    if not stats:
        return None
    
    def get_top_consecutive(group_func, top_n):
        groups = defaultdict(list)
        for s in signals:
            key = group_func(s['closed_at'])
            groups[key].append(s)
        results = []
        for key, group_signals in groups.items():
            max_consec = get_max_consecutive_stoploss(group_signals)
            results.append((key, max_consec))
        return sorted(results, key=lambda x: -x[1])[:top_n]
    
    weekly = get_top_consecutive(lambda dt: dt.isocalendar()[:2], 5)
    monthly = get_top_consecutive(lambda dt: (dt.year, dt.month), 5)
    yearly = get_top_consecutive(lambda dt: dt.year, 5)
    
    stats['consecutive_stoploss'] = {
        'weekly_top5': [{'period': f"{k[0]}-W{k[1]:02}", 'value': v} for k, v in weekly],
        'monthly_top5': [{'period': f"{k[0]}-{k[1]:02}", 'value': v} for k, v in monthly],
        'yearly_top5': [{'period': str(k), 'value': v} for k, v in yearly]
    }
    return stats

def generate_report(signals):
    pairs = defaultdict(list)
    for s in signals:
        pairs[s['pairPeriod']['pair']].append(s)
    all_pairs = signals
    report = {'per_pair': {}, 'all_pairs': None}
    for pair, pair_signals in pairs.items():
        report['per_pair'][pair] = process_group(pair_signals)
    report['all_pairs'] = process_group(all_pairs)
    return report

# Task 1: Top 10 consecutive stoploss per day
daily_groups = defaultdict(list)
for s in filtered_signals:
    day = s['closed_at'].date()
    daily_groups[day].append(s)

daily_consecutive = []
for day, signals_in_day in daily_groups.items():
    max_consec = get_max_consecutive_stoploss(signals_in_day)
    daily_consecutive.append({'date': day.isoformat(), 'value': max_consec})
daily_top10 = sorted(daily_consecutive, key=lambda x: -x['value'])[:10]

# Task 5: Concurrency report using entry_time and closed_at
events = []
for s in filtered_signals:
    events.append((s['entry_time'], 'start'))
    events.append((s['closed_at'], 'end'))
events.sort(key=lambda x: (x[0], x[1] != 'start'))  # End events before start at same time

current = 0
timeline = []
prev_time = None
for event_time, event_type in events:
    if prev_time is not None and event_time > prev_time:
        timeline.append((prev_time, event_time, current))
    if event_type == 'end':
        current -= 1
    elif event_type == 'start':
        current += 1
    prev_time = event_time

concurrency_report = []
for s, e, c in timeline:
    duration = (e - s).total_seconds()
    concurrency_report.append({
        'start': s.isoformat(),
        'end': e.isoformat(),
        'count': c,
        'duration_seconds': duration
    })
concurrency_report = sorted(concurrency_report, key=lambda x: (-x['count'], -x['duration_seconds']))[:10]

# Compile final output
processed = {
    'top_consecutive_stoploss_daily': daily_top10,
    'work_time_stats': generate_report(work_time_signals),
    'non_work_time_stats': generate_report(non_work_time_signals),
    'place_order_work_stats': generate_report(place_order_work_signals),
    'place_order_non_work_stats': generate_report(place_order_non_work_signals),
    'concurrency_report': concurrency_report
}

# Write to processedSignals.json
with open('Packages/TradingBot/Reports/processedSignals.json', 'w') as f:
    json.dump(processed, f, indent=2, default=str)