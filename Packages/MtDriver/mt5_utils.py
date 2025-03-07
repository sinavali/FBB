import MetaTrader5 as mt5
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

TIMEFRAME_MAP = {
    'M1': mt5.TIMEFRAME_M1,
    'M5': mt5.TIMEFRAME_M5,
    'M15': mt5.TIMEFRAME_M15,
    'M30': mt5.TIMEFRAME_M30,
    'H1': mt5.TIMEFRAME_H1,
    'H4': mt5.TIMEFRAME_H4,
    'D1': mt5.TIMEFRAME_D1,
    'W1': mt5.TIMEFRAME_W1,
    'MN1': mt5.TIMEFRAME_MN1,
    'PERIOD_M1': mt5.TIMEFRAME_M1,
}

def initialize_mt5():
    """Initialize MT5 connection with retry logic"""
    try:
        if mt5.initialize(
            path="C:/Program Files/MetaTrader 5/terminal64.exe",
            login=5034048580,
            password="*h3nNrEu",
            server="MetaQuotes-Demo",
            timeout=5000
        ):
            return True
        logger.error(f"MT5 initialization failed: {mt5.last_error()}")
        return False
    except Exception as e:
        logger.error(f"MT5 init error: {str(e)}")
        return False

def get_candles(symbol, timeframe):
    """Retrieve latest candle data"""
    if not initialize_mt5():
        return None

    try:
        # Get current tick to find latest closed candle
        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            logger.error(f"No tick data for {symbol}")
            return None

        # Calculate candle times
        rates = mt5.copy_rates_from(
            symbol,
            timeframe,
            datetime.now() - timedelta(minutes=5),  # Look back 5 minutes
            1
        )

        return {
            'time': int(rates[0][0]),
            'open': float(rates[0][1]),
            'high': float(rates[0][2]),
            'low': float(rates[0][3]),
            'close': float(rates[0][4]),
            'volume': int(rates[0][5]),
            'spread': int(rates[0][7])
        }
    finally:
        mt5.shutdown()