# server.py
import asyncio
import websockets
import json
import MetaTrader5 as mt5
from datetime import datetime, timedelta

# Initialize MT5 connection
mt5.initialize()

async def get_candle(symbol, timeframe):
    """Get latest candle for symbol/timeframe"""
    rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, 1)
    if rates is not None and len(rates) > 0:
        return {
            'symbol': symbol,
            'time': int(rates[0][0]),
            'open': rates[0][1],
            'high': rates[0][2],
            'low': rates[0][3],
            'close': rates[0][4],
            'period': timeframe_to_str(timeframe)
        }
    return None

def timeframe_to_str(tf):
    """Convert MT5 timeframe constant to string"""
    return {
        mt5.TIMEFRAME_M1: 'M1',
        mt5.TIMEFRAME_M5: 'M5',
        mt5.TIMEFRAME_H1: 'H1',
        mt5.TIMEFRAME_D1: 'D1'
    }.get(tf, 'UNKNOWN')

async def candle_stream(websocket, path):
    """Handle client connection and stream candles"""
    try:
        params = await websocket.recv()
        config = json.loads(params)

        symbol = config['symbol']
        timeframe = {
            'M1': mt5.TIMEFRAME_M1,
            'M5': mt5.TIMEFRAME_M5,
            'H1': mt5.TIMEFRAME_H1,
            'D1': mt5.TIMEFRAME_D1
        }[config['period']]

        last_candle_time = 0

        while True:
            # Calculate sleep time to next candle close
            now = datetime.utcnow()
            next_close = now + timedelta(minutes=1)
            next_close = next_close.replace(second=0, microsecond=0)
            sleep_time = (next_close - now).total_seconds()

            await asyncio.sleep(sleep_time)

            candle = await get_candle(symbol, timeframe)
            if candle and candle['time'] > last_candle_time:
                await websocket.send(json.dumps(candle))
                last_candle_time = candle['time']

    except Exception as e:
        print(f"Connection error: {e}")

# Start WebSocket server
start_server = websockets.serve(candle_stream, 'localhost', 5000)

asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()