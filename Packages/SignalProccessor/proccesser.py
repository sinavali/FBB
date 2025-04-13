import json
from datetime import datetime, time, timedelta
from collections import defaultdict
from typing import List, Dict, Any

def main():
    # Load and filter data
    with open('Packages/TradingBot/Reports/signal.json') as f:
        signals = json.load(f)

    filtered_signals = [
        s for s in signals 
        if s['status'] in ('STOPLOSS', 'TAKEPROFIT')
        and s.get('trigger') == 'MSS'
    ]

    # Preprocess datetime fields with error handling
    for signal in filtered_signals:
        try:
            signal['time_utc'] = datetime.fromisoformat(signal['time']['utc'].replace('Z', '+00:00'))
            signal['place_order_time'] = datetime.fromisoformat(signal['placeOrderTime'].replace('Z', '+00:00'))
        except KeyError as e:
            print(f"Missing key in signal data: {e}")
            continue

    # Work time ranges (UTC)
    WORK_TIME_RANGES = [
        (time(5, 45), time(8, 0)),
        (time(8, 45), time(9, 30)),
        (time(10, 45), time(13, 0)),
        (time(13, 45), time(14, 30)),
        (time(16, 45), time(18, 0)),
    ]

    def is_in_work_time(dt: datetime) -> bool:
        t = dt.time()
        return any(start <= t <= end for start, end in WORK_TIME_RANGES)

    # Categorize signals
    def categorize_signals(signals: List[Dict]) -> Dict[str, List]:
        return {
            'work_time': [s for s in signals if is_in_work_time(s['time_utc'])],
            'non_work_time': [s for s in signals if not is_in_work_time(s['time_utc'])],
            'place_order_work': [s for s in signals if is_in_work_time(s['place_order_time'])],
            'place_order_non_work': [s for s in signals if not is_in_work_time(s['place_order_time'])]
        }

    categories = categorize_signals(filtered_signals)

    # Statistics calculation
    def calculate_stats(signals: List[Dict]) -> Dict[str, Any]:
        if not signals:
            return None
        
        stats = {
            'trade_count': len(signals),
            'stoploss_count': sum(1 for s in signals if s['status'] == 'STOPLOSS'),
            'takeprofit_count': sum(1 for s in signals if s['status'] == 'TAKEPROFIT'),
        }
        
        stats['winrate'] = stats['takeprofit_count'] / stats['trade_count'] if stats['trade_count'] else 0
        stats['R'] = (stats['takeprofit_count'] * 3) - stats['stoploss_count']
        
        return stats

    # Consecutive stoploss calculations
    def get_consecutive_stoploss(signals: List[Dict], period: str) -> List[Dict]:
        period_map = {
            'daily': lambda d: d.date(),
            'weekly': lambda d: d.isocalendar()[:2],
            'monthly': lambda d: (d.year, d.month),
            'yearly': lambda d: d.year
        }
        
        periods = defaultdict(list)
        for s in sorted(signals, key=lambda x: x['time_utc']):
            key = period_map[period](s['time_utc'])
            periods[key].append(s)
        
        results = []
        for period_key, period_signals in periods.items():
            max_consec = current = 0
            for s in period_signals:
                current = current + 1 if s['status'] == 'STOPLOSS' else 0
                max_consec = max(max_consec, current)
            results.append((period_key, max_consec))
        
        return sorted(results, key=lambda x: -x[1])[:10]

    # Concurrency tracking
    def calculate_concurrency(signals: List[Dict]) -> List[Dict]:
        events = []
        for s in signals:
            events.append((s['place_order_time'], 'start', s['time_utc']))
            events.append((s['time_utc'], 'end', None))
        
        events.sort(key=lambda x: x[0])
        
        concurrent = []
        active = set()
        current_start = None
        
        for event_time, event_type, end_time in events:
            if event_type == 'start':
                if not active:
                    current_start = event_time
                active.add(end_time)
            else:
                if current_start and event_time > current_start:
                    concurrent.append({
                        'start': current_start,
                        'end': event_time,
                        'count': len(active)
                    })
                if end_time in active:
                    active.remove(end_time)
                if not active:
                    current_start = None
        
        return sorted(
            [{
                'start': c['start'].isoformat(),
                'end': c['end'].isoformat(),
                'count': c['count'],
                'duration': (c['end'] - c['start']).total_seconds()
            } for c in concurrent],
            key=lambda x: (-x['count'], -x['duration'])
        )[:10]

    # Generate final report structure
    def build_report(category_signals: List[Dict]) -> Dict:
        report = {}
        for name, signals in category_signals.items():
            if not signals:
                report[name] = None
                continue
            
            stats = calculate_stats(signals)
            stats['consecutive_stoploss'] = {
                'daily': get_consecutive_stoploss(signals, 'daily'),
                'weekly': get_consecutive_stoploss(signals, 'weekly'),
                'monthly': get_consecutive_stoploss(signals, 'monthly'),
                'yearly': get_consecutive_stoploss(signals, 'yearly')
            }
            report[name] = stats
        
        return report

    # Compile final output
    processed = {
        'work_time_stats': build_report({'main': categories['work_time']})['main'],
        'non_work_time_stats': build_report({'main': categories['non_work_time']})['main'],
        'place_order_work_stats': build_report({'main': categories['place_order_work']})['main'],
        'place_order_non_work_stats': build_report({'main': categories['place_order_non_work']})['main'],
        'concurrency_report': calculate_concurrency(filtered_signals),
        'top_concurrent_items': calculate_concurrency(filtered_signals)[:10]
    }

    with open('Packages/TradingBot/Reports/processedSignals.json', 'w') as f:
        json.dump(processed, f, indent=2, default=str)

if __name__ == "__main__":
    main()