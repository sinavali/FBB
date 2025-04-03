import unittest
import sys
import os
from datetime import datetime, timedelta, timezone  # Changed import
import MetaTrader5 as mt5

# Add root project directory to Python path
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, root_dir)

from app import app  # Import Flask app from root directory

class TestCandleEndpointsRealMT5(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Initialize MT5 connection
        cls.initialized = mt5.initialize(
            path="C:/Program Files/MetaTrader 5/terminal64.exe",
            login=5034048580,
            password="*h3nNrEu",
            server="MetaQuotes-Demo",
            timeout=5000
        )
        if not cls.initialized:
            raise Exception(f"MT5 initialization failed: {mt5.last_error()}")

    @classmethod
    def tearDownClass(cls):
        mt5.shutdown()

    def setUp(self):
        self.client = app.test_client()
        self.symbol = "EURUSD"
        self.timezone_offset = -7200  # UTC+2

    def get_utc_unix(self, dt_str):
        return int(datetime.fromisoformat(dt_str).timestamp())

    def test_get_candles_in_time_conversion(self):
        # Test data (adjust to market hours)
        start_utc = (datetime.now(timezone.utc) - timedelta(hours=24)).replace(second=0, microsecond=0).isoformat()
        end_utc = datetime.fromisoformat(start_utc) + timedelta()

        response = self.client.post('/get_candles_in', json={
            'symbol': self.symbol,
            'start': start_utc,
            'end': end_utc
        })

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        
        if not data['candles']:
            self.skipTest("No candles returned - check market hours")
        
        # Verify timestamps are in UTC
        candle = data['candles'][0]
        print(datetime.fromtimestamp(candle['closeTime']))
        print((datetime.fromisoformat(start_utc) + timedelta(seconds=self.timezone_offset)).isoformat())
        self.assertEqual(
            candle['closeTime'],
            self.get_utc_unix((datetime.fromisoformat(start_utc) + timedelta(seconds=self.timezone_offset)).isoformat()),
            "Candle timestamp earlier than requested start"
        )

    def test_last_week_candles_1d_conversion(self):
        # Use a known date with existing data
        response = self.client.post('/last_week_candles_1d', json={
            'symbol': self.symbol,
            'start': "2024-05-20T00:00:00",
            'end': "2024-05-20T23:59:59"
        })

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        
        if not data['candles']:
            self.skipTest("No daily candles returned")
        
        # Check converted timestamp
        candle_time = datetime.fromtimestamp(data['candles'][0]['closeTime'], tz=timezone.utc)
        self.assertEqual(candle_time.date().isoformat(), "2024-05-20")

    def test_last_day_candles_1m_conversion(self):
        response = self.client.post('/last_day_candles_1m', json={
            'symbol': self.symbol,
            'start': (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        })

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        
        if not data['candles']:
            self.skipTest("No 1-minute candles returned")
        
        # Verify temporal order
        timestamps = [c['closeTime'] for c in data['candles']]
        self.assertEqual(timestamps, sorted(timestamps), "Candles not in chronological order")

if __name__ == '__main__':
    unittest.main()