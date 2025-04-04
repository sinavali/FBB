# MT5 initialization function
def initialize_mt5():
    import MetaTrader5 as mt5
    import time
    import logging
    
    for attempt in range(3):
        try:
            if mt5.initialize(
                    path="C:/Program Files/MetaTrader 5/terminal64.exe",
                    login=5034048580,
                    password="*h3nNrEu",
                    server="MetaQuotes-Demo",
                    timeout=5000
            ):
                return True
            logging.error(f"MT5 init attempt {attempt+1} failed")
            time.sleep(1)
        except Exception as e:
            logging.error(f"Connection error: {str(e)}")
    return False