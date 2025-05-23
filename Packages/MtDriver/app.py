from eventlet import monkey_patch
monkey_patch()

from flask import Flask, request, jsonify
from flask_socketio import SocketIO
import MetaTrader5 as mt5
from datetime import datetime, timedelta, timezone
import eventlet
from zoneinfo import ZoneInfo
from collections import defaultdict
from shared import initialize_mt5, setup_logging, target_tz
from tgChannel import TelegramChannel
from threading import Lock
import logging
import mysql.connector

# Initialize logging first
setup_logging()
logger = logging.getLogger(__name__)

# Initialize Telegram channel
tg_bot = TelegramChannel(
    bot_token='6778796222:AAH-UKnDf5y5axNcLjk1LL1prUx2i7R9EL8',
    chat_id='-1002469452779'
)

eventlet.monkey_patch()

app = Flask(__name__)
socketio = SocketIO(app,
                    cors_allowed_origins="*",
                    async_mode='eventlet',
                    logger=True,
                    engineio_logger=True)

# Track active subscriptions
active_subscriptions = {}
subscription_lock = Lock()

min_distance_point = 2
min_stop_distance_point = 10

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
    logger.debug("--------------------------------------------------")
    logger.debug(f"target_tz_name: {target_tz_name}")
    logger.debug(f"target_tz: {target_tz}")
    logger.debug(f"target_tz_offset_seconds: {target_tz_offset_seconds}")
    logger.debug(f"live_start_time_target_tz: {live_start_time_target_tz}")
    logger.debug(f"live_start_time_utc: {live_start_time_utc}")
    logger.debug(f"now_in_utc: {now_in_utc()}")
    logger.debug(f"now_in_target_tz: {now_in_target_tz()}")
    logger.debug("--------------------------------------------------")
    
    
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


def get_candles(symbol, timeframe, num_candles=360):
    """Fetch the latest num_candles candle data with enhanced error handling"""
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

        rates = mt5.copy_rates_from_pos(symbol, mt5_timeframe, 1, num_candles)
        if rates is None or len(rates) == 0:
            logging.warning(f"No data returned for {symbol} {timeframe}")
            return None

        candles = [
            {
                'closeTime': int(rate[0]) - target_tz_offset_seconds,
                'open': rate[1],
                'high': rate[2],
                'low': rate[3],
                'close': rate[4],
                'name': symbol,
                'period': timeframe.upper()
            }
            for rate in rates
        ]
        return candles

    except Exception as e:
        logging.error(f"Error fetching candles: {str(e)}")
        return None
    finally:
        try:
            mt5.shutdown()
        except Exception as e:
            logging.error(f"Error shutting down MT5: {str(e)}")


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
                    candles = get_candles(config['symbol'], config['timeframe'])
                    if candles:
                        # Emit only new candles
                        socketio.emit('new_candles', candles, room=sid)
                        config['last_candle'] = max(candle['closeTime'] for candle in candles)
                        # for candle in candles:
                            # if candle['closeTime'] > config['last_candle']:
                        # Update last_candle to the latest closeTime
                eventlet.sleep(20 - now_in_utc().second)
            except Exception as e:
                logging.error(f"Polling error: {str(e)}")
                break

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    with subscription_lock:
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
                logger.warning(f"Missing field {field} in order request")
                return jsonify({"error": f"Missing required field: {field}"}), 400

        if not initialize_mt5():
            logger.error("MT5 initialization failed in place_order")
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
            
            if abs(current_price - entry_price) > 0.0002:
                return jsonify({"error": f"for market orders current_price - entry_price is {abs(current_price - entry_price)} wich should be lower than 0.0002"}), 400
            
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
        elif direction == "SELL":
            current_price = tick.bid  # Use BID price for SELL orders
            
            if abs(current_price - entry_price) > 0.0002:
                return jsonify({"error": f"for market orders current_price - entry_price is {abs(current_price - entry_price)} wich should be lower than 0.0002"}), 400
            
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
        else:
            return jsonify({"error": "Invalid direction - use BUY/SELL"}), 400

        # Validate symbol
        if not mt5.symbol_select(symbol, True):
            return jsonify({"error": f"Symbol {symbol} not available"}), 400

        # Execute order
        result = mt5.order_send(mt5_request)
        if not result:
            error = mt5.last_error()
            logger.error(f"Order failed for {symbol}: {error}")
            return jsonify({
                "error": "Order failed - no response from MT5",
                "code": error[0],
                "message": error[1]
            }), 500
        logger.info(f"Order executed successfully: {result.order}")

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            error = mt5.last_error()
            return jsonify({
                "error": "Order rejected",
                "code": error[0],
                "message": error[1],
                "comment": result.comment
            }), 400
            
        tg_bot.on_order_event('placed', {
            'ticket': result.order,
            'symbol': symbol,
            'direction': direction,
            'volume': volume,
            'price': entry_price,
            'sl': sl,
            'tp': tp
        })
        
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
        logger.error(f"Order processing error: {str(e)}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500
    finally:
        try:
            mt5.shutdown()
        except Exception as e:
            logger.error(f"MT5 shutdown error: {str(e)}")


@app.route('/place_limit_order', methods=['POST'])
def place_limit_order():
    """Execute pending (limit/stop) orders with proper validations"""
    try:
        data = request.json
        required_fields = ['symbol', 'volume', 'direction', 'sl', 'tp', 'price']

        # Validate request
        for field in required_fields:
            if field not in data or data[field] is None:
                logger.warning(f"Missing field {field} in order request")
                return jsonify({"error": f"Missing required field: {field}"}), 400

        if not initialize_mt5():
            logger.error("MT5 initialization failed in place_order")
            return jsonify({"error": "MT5 connection failed"}), 500

        symbol = data['symbol'].upper()
        direction = data['direction'].upper()
        volume = float(data['volume'])
        entry_price = float(data['price'])
        sl = float(data['sl'])
        tp = float(data['tp'])

        # Get current market price
        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            return jsonify({"error": "Failed to get market price"}), 400

        # Determine prices and order type
        current_price = tick.ask if direction == "BUY" else tick.bid
        price_diff = entry_price - current_price
        
        if direction == "BUY":
            if entry_price > current_price:
                order_type = mt5.ORDER_TYPE_BUY_STOP
                min_distance = min_distance_point * mt5.symbol_info(symbol).point
                if abs(price_diff) < min_distance:
                    return jsonify({"error": f"Entry price too close to current price (min {min_distance})"}), 400
            else:
                order_type = mt5.ORDER_TYPE_BUY_LIMIT
        elif direction == "SELL":
            if entry_price < current_price:
                order_type = mt5.ORDER_TYPE_SELL_STOP
                min_distance = min_distance_point * mt5.symbol_info(symbol).point
                if abs(price_diff) < min_distance:
                    return jsonify({"error": f"Entry price too close to current price (min {min_distance})"}), 400
            else:
                order_type = mt5.ORDER_TYPE_SELL_LIMIT
        else:
            return jsonify({"error": "Invalid direction - use BUY/SELL"}), 400

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
        min_stop_distance = min_stop_distance_point * point
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

        # Build order request
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
            "type_filling": mt5.ORDER_FILLING_RETURN,  # More suitable for pending orders
        }
        
        # Execute order
        result = mt5.order_send(order_request)
        if not result:
            error = mt5.last_error()
            logger.error(f"Order failed for {symbol}: {error}")
            return jsonify({
                "error": "Order failed - no response from MT5",
                "code": error[0],
                "message": error[1]
            }), 500
        logger.info(f"Order executed successfully: {result.order}")

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            error = mt5.last_error()
            return jsonify({
                "error": "Order rejected",
                "code": error[0],
                "message": error[1],
                "comment": result.comment
            }), 400

        tg_bot.on_order_event('placed', {
            'ticket': result.order,
            'symbol': symbol,
            'direction': f"PENDING {direction}",
            'volume': volume,
            'price': entry_price,
            'sl': sl,
            'tp': tp
        })

        return jsonify({
            "message": "Pending order placed successfully",
            "ticket": result.order,
            "direction": direction,
            "entry_price": entry_price,
            "sl": sl,
            "tp": tp,
        }), 200

    except Exception as e:
        logger.error(f"Order processing error: {str(e)}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500
    finally:
        try:
            mt5.shutdown()
        except Exception as e:
            logger.error(f"MT5 shutdown error: {str(e)}")  

       
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

        if data['fromdb']:
            fromdb = data['fromdb']
        symbol = data['symbol'].upper()
        start_str = data['start']
        end_str = data['end']
        
        print(symbol)

        if fromdb == 1:
            with mysql.connector.connect(
                host="localhost",
                user="root",
                password="",  # Replace with your actual MySQL root password
                database="trading_view_candles"
            ) as mydb:
                with mydb.cursor() as mycursor:
                    mycursor.execute(f"SELECT * FROM candles where name = '{symbol}' and closeTime >= {start_str} and closeTime <= {end_str}")
                    results = mycursor.fetchall()
                    print(f"SELECT * FROM candles where name = '{symbol}' and closeTime >= {start_str} and closeTime <= {end_str}")
                    candlesTemp = [{
                        'closeTime': int(rate[7]),
                        'open': rate[3],
                        'high': rate[4],
                        'low': rate[5],
                        'close': rate[6],
                        'period': rate[2],
                        'name': rate[1]
                    } for rate in results]
                    return jsonify({"candles": candlesTemp}), 200      

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


@app.route('/test_pending_order', methods=['GET'])
def test_pending_order():
    """Test endpoint for generating valid pending orders (EURUSD M1)"""
    try:
        # Initialize MT5 with enhanced logging
        if not initialize_mt5():
            logging.error("MT5 initialization failed in test endpoint")
            return jsonify({"error": "MT5 connection failed"}), 500

        symbol = "EURUSD"
        volume = 0.01
        if not mt5.symbol_select(symbol, True):
            logging.error(f"Failed to select {symbol} in Market Watch")
            return jsonify({"error": "Symbol not available"}), 400

        # Get detailed price information
        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            logging.error("No tick data received")
            return jsonify({"error": "Price check failed"}), 400

        # Calculate prices using precise decimal arithmetic
        point = mt5.symbol_info(symbol).point
        spread = mt5.symbol_info(symbol).spread * point
        current_price = round((tick.ask + tick.bid) / 2, 5)
        
        # Generate valid BUY STOP order parameters
        entry_price = current_price + 20 * point  # 20 pips above current
        sl = entry_price - 20 * point            # 10 pips risk
        tp = entry_price + 60 * point            # 30 pips reward (3:1 ratio)

        # Create test order payload
        test_data = {
            "symbol": symbol,
            "volume": volume,
            "direction": "BUY",
            "sl": round(sl, 5),
            "tp": round(tp, 5),
            "price": round(entry_price, 5)
        }

        # Simulate POST request to place_limit_order
        with app.test_client() as client:
            response = client.post('/place_limit_order', 
                json=test_data,
                headers={'Content-Type': 'application/json'}
            )
            
        return response.json, response.status_code

    except Exception as e:
        logging.error(f"Test order failed: {str(e)}", exc_info=True)
        return jsonify({
            "error": "Test order failed",
            "details": str(e)
        }), 500
    finally:
        # Don't shutdown MT5 here to maintain connection pool
        pass
    

if __name__ == '__main__':
    logger.info("Application starting...")
    tg_bot.start_monitoring()
    socketio.run(app, host='127.0.0.1', port=5000, debug=False)
