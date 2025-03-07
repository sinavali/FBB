import MetaTrader5 as mt5

def connect():
    if mt5.initialize(
        path="C:/Program Files/MetaTrader 5/terminal64.exe",
        login=5034048580,
        password="*h3nNrEu",
        server="MetaQuotes-Demo"
    ):
        print("Connected! MT5 Version:", mt5.version())
        print("Account Info:", mt5.account_info()._asdict())
        mt5.shutdown()
    else:
        print("Failed:", mt5.last_error())

connect()