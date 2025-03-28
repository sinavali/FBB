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

eventlet.monkey_patch()

app = Flask(__name__)
socketio = SocketIO(app,
                    cors_allowed_origins="*",
                    async_mode='eventlet',
                    logger=True,
                    engineio_logger=True)

# Track active subscriptions
active_subscriptions = {}
timezone_offset = -7200
telegram_bot_token = '6778796222:AAH-UKnDf5y5axNcLjk1LL1prUx2i7R9EL8'
telegram_chat_id = '-1002469452779'

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
            'closeTime': int(rates[0][0]) + timezone_offset,
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
                    candle = get_candle(config['symbol'], config['timeframe'])
                    if candle and (candle['closeTime']) > config['last_candle']:
                        socketio.emit('new_candle', candle, room=sid)
                        config['last_candle'] = candle['closeTime']
                eventlet.sleep(60 - datetime.now(timezone.utc).second)
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

def send_telegram_message(trade_data):
    """Send trade notification to Telegram channel using request data"""

    if not (telegram_bot_token and telegram_chat_id):
        logging.warning("Telegram credentials not configured")
        return False

    try:
        message = (
            "📈 *New Trade Signal*\n"
            f"• Symbol: {trade_data['symbol']}\n"
            f"• Direction: {trade_data['direction']}\n"
            f"• Volume: {trade_data['volume']}\n"
            f"• Entry Price: {trade_data['price']}\n"
            f"• SL: {trade_data['sl']}\n"
            f"• TP: {trade_data['tp']}"
        )

        url = f"https://api.telegram.org/bot{telegram_bot_token}/sendMessage"
        payload = {
            'chat_id': telegram_chat_id,
            'text': message,
            'parse_mode': 'Markdown'
        }
        
        response = requests.post(url, data=payload, timeout=5000)
        response.raise_for_status()
        return True
    except Exception as e:
        logging.error(f"Telegram notification failed: {str(e)}")
        return False

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
        
        send_telegram_message({
            'symbol': symbol,
            'direction': direction,
            'volume': volume,
            'price': entry_price,
            'sl': sl,
            'tp': tp
        })
        
        # Get current market price
        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            return jsonify({"error": "Failed to get market price"}), 400

        # Determine prices based on direction
        if direction == "BUY":
            current_price = tick.ask
            price_comparison = entry_price > current_price
            order_types = (mt5.ORDER_TYPE_BUY_STOP, mt5.ORDER_TYPE_BUY_LIMIT)
        elif direction == "SELL":
            current_price = tick.bid
            price_comparison = entry_price < current_price
            order_types = (mt5.ORDER_TYPE_SELL_STOP, mt5.ORDER_TYPE_SELL_LIMIT)
        else:
            return jsonify({"error": "Invalid direction - use BUY/SELL"}), 400

        # Determine order type
        order_type = order_types[0] if price_comparison else order_types[1]

        # Validate symbol
        if not mt5.symbol_select(symbol, True):
            return jsonify({"error": f"Symbol {symbol} not available"}), 400

        # Get symbol precision
        symbol_info = mt5.symbol_info(symbol)
        digits = symbol_info.digits
        point = symbol_info.point

        # Format prices
        entry_price = round(entry_price, digits)
        sl = round(sl, digits)
        tp = round(tp, digits)

        # Validate stop levels
        min_stop_distance = 10 * point
        if direction == "BUY":
            if sl >= entry_price - min_stop_distance:
                return jsonify({"error": "SL too close to entry price for BUY order"}), 400
            if tp <= entry_price + min_stop_distance:
                return jsonify({"error": "TP too close to entry price for BUY order"}), 400
        else:
            if sl <= entry_price + min_stop_distance:
                return jsonify({"error": "SL too close to entry price for SELL order"}), 400
            if tp >= entry_price - min_stop_distance:
                return jsonify({"error": "TP too close to entry price for SELL order"}), 400

        order_request = {
            "action": mt5.TRADE_ACTION_PENDING,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "price": entry_price,
            "sl": sl,
            "tp": tp,
            "deviation": 30,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_FOK,
            "expiration": int(datetime.now().timestamp() + 604800),  # 7 days
        }

        # Execute order
        result = mt5.order_send(order_request)
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
            "message": "Pending order placed successfully",
            "ticket": result.order,
            "direction": direction,
            "order_type": order_type,
            "entry_price": entry_price,
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
        start_dt = datetime.fromisoformat(start_str)
        end_dt = datetime.fromisoformat(end_str)

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
            'closeTime': int(rate[0]) + timezone_offset,
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


@app.route('/last_day_candles_1m', methods=['POST'])
def last_day_candles_1m():
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

        # Direct conversion without timezone handling
        start_dt = datetime.fromisoformat(start_str)

        # Initialize MT5
        if not initialize_mt5():
            return jsonify({"error": "MT5 connection failed"}), 500

        # Validate symbol
        if not mt5.symbol_select(symbol, True):
            return jsonify({"error": f"Symbol {symbol} not available"}), 400

        # Fetch 1-minute candles
        rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, start_dt, datetime.utcnow())
        if rates is None or len(rates) == 0:
            return jsonify({"candles": []}), 200

        # Return raw data
        candles = [{
            'closeTime': int(rate[0]) + timezone_offset,
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
        start_dt = datetime.fromisoformat(start_str)
        end_dt = datetime.fromisoformat(end_str)

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
            'closeTime': int(rate[0]) + timezone_offset,
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
    socketio.run(app, host='localhost', port=5000, debug=True)
