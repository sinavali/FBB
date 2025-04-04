import sys
from pathlib import Path
import pytest
from unittest.mock import patch, MagicMock
import MetaTrader5 as mt5
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parent.parent))
from app import app, mt5 as real_mt5

def base_request():
    return {
        "symbol": "EURUSD",
        "volume": 0.1,
        "direction": "BUY",
        "sl": 1.1950,
        "tp": 1.2100,
        "price": 1.2000
    }

def create_mt5_result(retcode, order=None):
    result = MagicMock()
    result.retcode = retcode
    result.order = order or 12345
    result.comment = "Mocked response"
    return result

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

@patch('app.mt5')
@patch('app._send_telegram')
def test_place_limit_order_success(mock_telegram, mock_mt5, client):
    # Configure mocks
    mock_mt5.initialize.return_value = True
    mock_mt5.symbol_info_tick.return_value = MagicMock(ask=1.2000, bid=1.1999)
    
    symbol_info = MagicMock()
    symbol_info.point = 0.0001
    symbol_info.digits = 5
    mock_mt5.symbol_info.return_value = symbol_info
    
    mock_mt5.symbol_select.return_value = True
    mock_mt5.order_send.return_value = create_mt5_result(mt5.TRADE_RETCODE_DONE)

    response = client.post('/place_limit_order', json=base_request())
    assert response.status_code == 200
    assert 'expiration' in response.json

@patch('app.mt5')
@patch('app._send_telegram')
def test_price_validations(mock_telegram, mock_mt5, client):
    mock_mt5.initialize.return_value = True
    mock_mt5.symbol_info_tick.return_value = MagicMock(ask=1.2000, bid=1.1999)
    
    symbol_info = MagicMock()
    symbol_info.point = 0.0001
    symbol_info.digits = 5
    mock_mt5.symbol_info.return_value = symbol_info
    
    mock_mt5.symbol_select.return_value = True

    # Test invalid price
    req = base_request()
    req['price'] = 1.2009  # 9 points away
    response = client.post('/place_limit_order', json=req)
    assert response.status_code == 400

@patch('app.mt5')
@patch('app._send_telegram')
def test_order_rejection(mock_telegram, mock_mt5, client):
    mock_mt5.initialize.return_value = True
    mock_mt5.symbol_info_tick.return_value = MagicMock(ask=1.2000, bid=1.1999)
    
    symbol_info = MagicMock()
    symbol_info.point = 0.0001
    symbol_info.digits = 5
    mock_mt5.symbol_info.return_value = symbol_info
    
    mock_mt5.symbol_select.return_value = True
    mock_mt5.order_send.return_value = create_mt5_result(mt5.TRADE_RETCODE_INVALID_FILL)

    response = client.post('/place_limit_order', json=base_request())
    assert response.status_code == 400

@patch('app.mt5')
@patch('app._send_telegram')
def test_symbol_availability(mock_telegram, mock_mt5, client):
    mock_mt5.initialize.return_value = True
    mock_mt5.symbol_select.return_value = False

    response = client.post('/place_limit_order', json=base_request())
    assert response.status_code == 400