from eventlet import monkey_patch

monkey_patch()

import os
import requests
from flask import Flask, request, jsonify
from flask_socketio import SocketIO
import MetaTrader5 as mt5
import logging
from datetime import datetime, timedelta, timezone
import eventlet
import time  # Added missing import
from zoneinfo import ZoneInfo
from collections import defaultdict

eventlet.monkey_patch()

app = Flask(__name__)
socketio = SocketIO(app,
                    cors_allowed_origins="*",
                    async_mode='eventlet',
                    logger=True,
                    engineio_logger=True)

# Track active subscriptions
active_subscriptions = {}

target_tz_name = "Europe/Athens"
target_tz = ZoneInfo(target_tz_name) # +02:00 | +03:00

def now_in_utc():
    return datetime.now(timezone.utc)

def now_in_target_tz():
    return now_in_utc().astimezone(target_tz)

def to_target_tz(dt: datetime):
    return dt.astimezone(target_tz)

def to_utc(dt: datetime):
    return dt.astimezone(utc_tz)
        

target_tz_offset_seconds = target_tz.utcoffset(now_in_utc()).seconds
utc_tz = ZoneInfo("UTC")

live_start_time_target_tz = now_in_target_tz().replace(tzinfo=None)
live_start_time_utc = now_in_utc().replace(tzinfo=None)

telegram_bot_token = '6778796222:AAH-UKnDf5y5axNcLjk1LL1prUx2i7R9EL8'
telegram_chat_id = '-1002469452779'

# MT5 Constants (verify with your MT5 version)
DEAL_ENTRY_OUT = 1  # Position closing
DEAL_REASON_SL = 3  # Stop Loss triggered
DEAL_REASON_TP = 4  # Take Profit triggered


def print_default_data():
    print("--------------------------------------------------")
    print(f"target_tz_name: {target_tz_name}")
    print(f"target_tz: {target_tz}")
    print(f"target_tz_offset_seconds: {target_tz_offset_seconds}")
    print(f"live_start_time_target_tz: {live_start_time_target_tz}")
    print(f"live_start_time_utc: {live_start_time_utc}")
    print(f"now_in_utc: {now_in_utc()}")
    print(f"now_in_target_tz: {now_in_target_tz()}")
    print("--------------------------------------------------") 



def _send_telegram(text: str) -> bool:
    """Universal Telegram message sender"""
    if not (telegram_bot_token and telegram_chat_id):
        logging.warning("Telegram credentials not configured")
        return False

    try:
        url = f"https://api.telegram.org/bot{telegram_bot_token}/sendMessage"
        payload = {
            'chat_id': telegram_chat_id,
            'text': text,
            'parse_mode': 'Markdown'
        }
        response = requests.post(url, data=payload, timeout=5)
        response.raise_for_status()
        return True
    except Exception as e:
        logging.error(f"Telegram notification failed: {str(e)}")
        return False


def build_signal_message(trade_data: dict) -> str:
    """Construct new trade signal message with statistics"""
    
    return (
        "📈 *New Trade Signal*\n"
        f"• Symbol: {trade_data['symbol']}\n"
        f"• Direction: {trade_data['direction']}\n"
        f"• Volume: {trade_data['volume']}\n"
        f"• Entry Price: {trade_data['price']}\n"
        f"• SL: {trade_data['sl']}\n"
        f"• TP: {trade_data['tp']}"
    )


def build_closed_position_message(deal) -> str:
    """Construct closed position message"""
    stats = get_closed_positions_stats(live_start_time_target_tz)
    stat_message = format_positions_message(stats)
    
    reason = "Manual Close"
    if deal.reason == DEAL_REASON_SL:
        reason = "Stop Loss"
    elif deal.reason == DEAL_REASON_TP:
        reason = "Take Profit"

    deal_time = datetime.fromtimestamp(deal.time, tz=utc_tz).astimezone(target_tz)
    
    return (
        "🔒 *Position Closed*\n"
        f"• Symbol: {deal.symbol}\n"
        f"• Profit: {deal.profit:.2f}\n"
        f"• Volume: {deal.volume}\n"
        f"• Reason: {reason}\n"
        f"• Time: {deal_time.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        f"{stat_message}"
    )


def format_positions_message(stats: dict) -> str:
    """Format position statistics into human-readable message"""
    if stats.get('error'):
        return "Error fetching positions data"

    try:
        # Format date strings
        date_fmt = "%Y-%m-%d %H:%M:%S"
        message_lines = [
            f"From: {live_start_time_target_tz.strftime(date_fmt)} till Now in {target_tz_name} or",
            f"{live_start_time_utc.strftime(date_fmt)} till Now in UTC"
        ]

        # Add statistics
        message_lines.append(
            f"All Positions => Total: {stats['total']['total']} | TP: {stats['total']['takeprofit']} | SL: {stats['total']['stoploss']}"
        )

        # Add symbol statistics
        for symbol, data in stats['symbols'].items():
            message_lines.append(
                f"{symbol} => Total: {data['total']} | TP: {data['takeprofit']} | SL: {data['stoploss']}"
            )

        return "\n".join(message_lines)

    except Exception as e:
        logging.error(f"Formatting error: {str(e)}")
        return "(Error fetching positions data)"
    
    
def get_closed_positions_stats(start_date: datetime) -> dict:
    """Retrieve closed position statistics with proper time conversion"""
    current_year_start = datetime(live_start_time_target_tz.year, 1, 1)
    effective_start = max(start_date, current_year_start)
        
    stats = {
        'start_date': effective_start,
        'total': {'total': 0, 'stoploss': 0, 'takeprofit': 0},
        'symbols': defaultdict(lambda: {'total': 0, 'stoploss': 0, 'takeprofit': 0}),
        'error': False
    }
    
    # Rest of the function remains the same but uses these timestamps
    try:
        if not mt5.initialize():
            logging.error("MT5 initialization failed")
            return {'error': True}

        deals = mt5.history_deals_get(effective_start.timestamp(), now_in_target_tz().timestamp())
        if not deals:
            return stats

        for deal in deals:
            if deal.entry != DEAL_ENTRY_OUT:
                continue

            symbol = deal.symbol
            stats['total']['total'] += 1
            stats['symbols'][symbol]['total'] += 1

            if deal.reason == DEAL_REASON_SL:
                stats['total']['stoploss'] += 1
                stats['symbols'][symbol]['stoploss'] += 1
            elif deal.reason == DEAL_REASON_TP:
                stats['total']['takeprofit'] += 1
                stats['symbols'][symbol]['takeprofit'] += 1

        stats['symbols'] = dict(stats['symbols'])
        return stats

    except Exception as e:
        logging.error(f"Error retrieving closed positions: {str(e)}")
        stats['error'] = True
        return stats
    finally:
        mt5.shutdown()


def check_closed_positions_periodically():
    """Periodic closed position checker with proper time conversion"""
    last_check_time = None
    
    while True:
        current_time = now_in_target_tz()
        if last_check_time is None:
            last_check_time = current_time - timedelta(seconds=20)
        
        try:
            if not mt5.initialize():
                eventlet.sleep(30)
                continue

            deals = mt5.history_deals_get(last_check_time.timestamp(), current_time.timestamp()) or []
            for deal in deals:
                if deal.entry == DEAL_ENTRY_OUT:
                    message = build_closed_position_message(deal)
                    _send_telegram(message)

            last_check_time = current_time
        except Exception as e:
            logging.error(f"Error in closed positions check: {str(e)}")
        finally:
            mt5.shutdown()

        # Wait for 30 seconds before next check
        eventlet.sleep(30)

            
def get_candle(symbol, timeframe):
    """Fetch latest candle data with enhanced error handling"""
    try:
        if not initialize_mt5():
            logging.error("MT5 initialization failed")
            return None

        if not mt5.symbol_select(symbol, True):
            logging.error(f"Symbol {symbol} not found in Market Watch")
            return None

        timeframe_map = {'PERIOD_M1': mt5.TIMEFRAME_M1}
        mt5_timeframe = timeframe_map.get(timeframe.upper())
        if not mt5_timeframe:
            logging.error(f"Invalid timeframe: {timeframe}")
            return None

        rates = mt5.copy_rates_from_pos(symbol, mt5_timeframe, 1, 1)
        if rates is None or len(rates) == 0:
            logging.warning(f"No data returned for {symbol} {timeframe}")
            return None

        return {
            'closeTime': int(rates[0][0]) - target_tz_offset_seconds,
            'open': rates[0][1],
            'high': rates[0][2],
            'low': rates[0][3],
            'close': rates[0][4],
            'name': symbol,
            'period': timeframe.upper()
        }

    except Exception as e:
        logging.error(f"Error fetching candle: {str(e)}")
        return None
    finally:
        try:
            mt5.shutdown()
        except Exception as e:
            logging.error(f"Error shutting down MT5: {str(e)}")


def initialize_mt5():
    """Initialize MT5 with retry logic"""
    max_retries = 3
    for attempt in range(max_retries):
        try:
            if mt5.initialize(
                    path="C:/Program Files/MetaTrader 5/terminal64.exe",
                    login=5034048580,
                    password="*h3nNrEu",
                    server="MetaQuotes-Demo",
                    timeout=5000
            ):
                return True
            logging.error(f"MT5 initialization failed (attempt {attempt + 1}): {mt5.last_error()}")
        except Exception as e:
            logging.error(f"MT5 connection error (attempt {attempt + 1}): {str(e)}")
        time.sleep(1)
    return False


@socketio.on('start_candle_stream')
def handle_candle_stream(data):
    """Handle new candle stream requests"""
    try:
        sid = request.sid
        subscriptions = data.get('subscriptions', [])

        if sid in active_subscriptions:
            active_subscriptions[sid]['active'] = False

        active_subscriptions[sid] = {
            'symbols': {
                f"{sub['symbol']}_{sub['timeframe']}": {
                    'symbol': sub['symbol'],
                    'timeframe': sub['timeframe'],
                    'last_candle': 0
                } for sub in subscriptions
            },
            'active': True
        }

        socketio.start_background_task(candle_polling_worker, sid, socketio)
        socketio.emit('status', {'message': 'Candle streaming started'}, room=sid)

    except Exception as e:
        logging.error(f"Stream setup error: {str(e)}")
        socketio.emit('error', {'message': 'Failed to start stream'}, room=sid)


def candle_polling_worker(sid, socketio):
    """Background task to check for new candles"""
    with app.app_context():
        while active_subscriptions.get(sid, {}).get('active', False):
            try:
                subs = active_subscriptions.get(sid, {}).get('symbols', {})
                for key, config in subs.items():
                    print_default_data()
                    candle = get_candle(config['symbol'], config['timeframe'])
                    if candle and (candle['closeTime']) > config['last_candle']:
                        socketio.emit('new_candle', candle, room=sid)
                        config['last_candle'] = candle['closeTime']
                eventlet.sleep(60 - now_in_utc().second)
            except Exception as e:
                logging.error(f"Polling error: {str(e)}")
                break


@socketio.on('disconnect')
def handle_disconnect():
    """Clean up on client disconnect"""
    sid = request.sid
    if sid in active_subscriptions:
        active_subscriptions[sid]['active'] = False
        del active_subscriptions[sid]
    logging.info(f"Client disconnected: {sid}")


@app.route('/place_order', methods=['POST'])
def place_order():
    """Execute trading orders with real-time price validation"""
    try:
        data = request.json
        required_fields = ['symbol', 'volume', 'direction', 'sl', 'tp', 'price']

        # Validate request
        for field in required_fields:
            if field not in data or data[field] is None:
                return jsonify({"error": f"Missing required field: {field}"}), 400

        if not initialize_mt5():
            return jsonify({"error": "MT5 connection failed"}), 500

        symbol = data['symbol'].upper()
        direction = data['direction'].upper()
        volume = float(data['volume'])
        entry_price = float(data['price'])
        sl = float(data['sl'])
        tp = float(data['tp'])
        deviation = 5
        order_type = mt5.ORDER_TYPE_BUY
        current_price = 0
        
        # Get symbol precision
        symbol_info = mt5.symbol_info(symbol)

        if not symbol_info:
            return jsonify({"error": "No symbol_info data"}), 500
        
        digits = symbol_info.digits
        point = symbol_info.point

        # Format prices
        entry_price = round(entry_price, digits)
        sl = round(sl, digits)
        tp = round(tp, digits)
        
        # Get current market price
        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            return jsonify({"error": "Failed to get market price"}), 400

        # Determine prices based on direction
        if direction == "BUY":
            current_price = tick.ask  # Use ASK price for BUY orders
            
            # SL must be BELOW current_price, TP must be ABOVE current_price
            if sl >= current_price:
                return jsonify({"error": "SL must be below entry price for BUY"}), 400
            if tp <= current_price:
                return jsonify({"error": "TP must be above entry price for BUY"}), 400
            
            order_type = mt5.ORDER_TYPE_BUY
            mt5_request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": symbol,
                "volume": volume,
                "type": order_type,
                "price": current_price,
                "sl": sl,
                "tp": tp,
                "deviation": deviation,
                "type_time": mt5.ORDER_TIME_GTC,
                "magic": 12345,
                "comment": "FBB",
            }
            
            trade_info = {
                'symbol': symbol,
                'direction': direction,
                'volume': volume,
                'price': entry_price,
                'sl': sl,
                'tp': tp,
                'ask': current_price
            }
            message = build_signal_message(trade_info)
            _send_telegram(message)
        elif direction == "SELL":
            current_price = tick.bid  # Use BID price for SELL orders
            
            # SL must be ABOVE current_price, TP must be BELOW current_price
            if sl <= current_price:
                return jsonify({"error": "SL must be above entry price for SELL"}), 400
            if tp >= current_price:
                return jsonify({"error": "TP must be below entry price for SELL"}), 400
            
            order_type = mt5.ORDER_TYPE_SELL
            mt5_request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": symbol,
                "volume": volume,
                "type": order_type,
                "price": current_price,
                "sl": sl,
                "tp": tp,
                "deviation": deviation,
                "type_time": mt5.ORDER_TIME_GTC,
                "magic": 12345,
                "comment": "FBB",
            }
            
            trade_info = {
                'symbol': symbol,
                'direction': direction,
                'volume': volume,
                'price': entry_price,
                'sl': sl,
                'tp': tp,
                'bid': current_price
            }
            message = build_signal_message(trade_info)
            _send_telegram(message)
        else:
            return jsonify({"error": "Invalid direction - use BUY/SELL"}), 400

        # Validate symbol
        if not mt5.symbol_select(symbol, True):
            return jsonify({"error": f"Symbol {symbol} not available"}), 400

        # Execute order
        result = mt5.order_send(mt5_request)
        if not result:
            error = mt5.last_error()
            return jsonify({
                "error": "Order failed - no response from MT5",
                "code": error[0],
                "message": error[1]
            }), 500

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            error = mt5.last_error()
            return jsonify({
                "error": "Order rejected",
                "code": error[0],
                "message": error[1],
                "comment": result.comment
            }), 400

        return jsonify({
            "message": "Market order executed successfully",
            "ticket": result.order,
            "direction": direction,
            "order_type": order_type,
            "entry_price": entry_price,
            "current_price": current_price,
            "sl": sl,
            "tp": tp
        }), 200

    except Exception as e:
        logging.error(f"Order processing error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        try:
            mt5.shutdown()
        except Exception as e:
            logging.error(f"MT5 shutdown error: {str(e)}")


@app.route('/last_week_candles_1d', methods=['POST'])
def last_week_candles_1d():
    """Fetch daily candles between client-provided dates"""
    try:
        data = request.json
        required_fields = ['symbol', 'start', 'end']

        # Validate request
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"Missing required field: {field}"}), 400

        symbol = data['symbol'].upper()
        start_str = data['start']
        end_str = data['end']
        
        # Client handles timezone conversion - we use UTC directly
        start_dt = datetime.fromisoformat(start_str).astimezone(target_tz).replace(tzinfo=None)
        end_dt = datetime.fromisoformat(end_str).astimezone(target_tz).replace(tzinfo=None)
        
        # Initialize MT5
        if not initialize_mt5():
            return jsonify({"error": "MT5 connection failed"}), 500

        # Validate symbol
        if not mt5.symbol_select(symbol, True):
            return jsonify({"error": f"Symbol {symbol} not available"}), 400

        # Fetch daily candles
        rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_D1, start_dt, end_dt)
        if rates is None or len(rates) == 0:
            return jsonify({"candles": []}), 200

        # Return raw candles without processing
        candles = [{
            'closeTime': int(rate[0]) - target_tz_offset_seconds,
            'open': rate[1],
            'high': rate[2],
            'low': rate[3],
            'close': rate[4],
            'period': 'PERIOD_1D',
            'name': symbol
        } for rate in rates]
            
        return jsonify({"candles": candles}), 200

    except ValueError as e:
        logging.error(f"Invalid date format: {str(e)}")
        return jsonify({"error": "Invalid ISO date format"}), 400
    except Exception as e:
        logging.error(f"Daily candles error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/candles_from', methods=['POST'])
def candles_from():
    """Fetch 1-minute candles from client-provided start to now"""
    try:
        data = request.json
        required_fields = ['symbol', 'start']

        # Validate request
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"Missing required field: {field}"}), 400

        symbol = data['symbol'].upper()
        start_str = data['start']

        # should subtract 1 minute to avoid fetching the forming candle
        start_dt = datetime.fromisoformat(start_str).astimezone(target_tz).replace(tzinfo=None)
        end_dt = now_in_target_tz().replace(tzinfo=None) - timedelta(minutes=1)

        # Initialize MT5
        if not initialize_mt5():
            return jsonify({"error": "MT5 connection failed"}), 500

        # Validate symbol
        if not mt5.symbol_select(symbol, True):
            return jsonify({"error": f"Symbol {symbol} not available"}), 400

        # Fetch 1-minute candles
        rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, start_dt, end_dt)
        
        if rates is None or len(rates) == 0:
            return jsonify({"candles": []}), 200
        
        # Return raw data
        candles = [{
            'closeTime': int(rate[0]) - target_tz_offset_seconds,
            'open': rate[1],
            'high': rate[2],
            'low': rate[3],
            'close': rate[4],
            'period': 'PERIOD_M1',
            'name': symbol
        } for rate in rates]

        return jsonify({"candles": candles}), 200

    except ValueError as e:
        logging.error(f"Invalid date format: {str(e)}")
        return jsonify({"error": "Invalid ISO date format"}), 400
    except Exception as e:
        logging.error(f"1m candles error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/get_candles_in', methods=['POST'])
def get_candles_in():
    """Fetch 1-minute candles from client-provided start to now"""
    try:
        data = request.json
        required_fields = ['symbol', 'start', 'end']

        # Validate request
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"Missing required field: {field}"}), 400

        symbol = data['symbol'].upper()
        start_str = data['start']
        end_str = data['end']

        # Direct conversion without timezone handling
        start_dt = datetime.fromisoformat(start_str).astimezone(target_tz).replace(tzinfo=None)
        end_dt = datetime.fromisoformat(end_str).astimezone(target_tz).replace(tzinfo=None)

        # Initialize MT5
        if not initialize_mt5():
            return jsonify({"error": "MT5 connection failed"}), 500

        # Validate symbol
        if not mt5.symbol_select(symbol, True):
            return jsonify({"error": f"Symbol {symbol} not available"}), 400

        # Fetch 1-minute candles
        rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, start_dt, end_dt)
        if rates is None or len(rates) == 0:
            return jsonify({"candles": []}), 200

        # Return raw data
        candles = [{
            'closeTime': int(rate[0]) - target_tz_offset_seconds,
            'open': rate[1],
            'high': rate[2],
            'low': rate[3],
            'close': rate[4],
            'period': 'PERIOD_M1',
            'name': symbol
        } for rate in rates]

        return jsonify({"candles": candles}), 200

    except ValueError as e:
        logging.error(f"Invalid date format: {str(e)}")
        return jsonify({"error": "Invalid ISO date format"}), 400
    except Exception as e:
        logging.error(f"1m candles error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    eventlet.spawn(check_closed_positions_periodically)
    socketio.run(app, host='localhost', port=5000, debug=True)
