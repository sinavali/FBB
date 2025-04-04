from zoneinfo import ZoneInfo

target_tz_name = "Europe/Athens"
# target_tz_name = "Asia/Nicosia"
target_tz = ZoneInfo(target_tz_name) # +02:00 | +03:00

demo_login = 5034048580
demo_password = "*h3nNrEu"
demo_server = "MetaQuotes-Demo"

fundedNext15kWith5PercentLoss_login = 489449
fundedNext15kWith5PercentLoss_password = "dzsAR42##"
fundedNext15kWith5PercentLoss_server = "FundedNext-Server"

# MT5 initialization function
def initialize_mt5():
    import MetaTrader5 as mt5
    import time
    import logging
    
    for attempt in range(3):
        try:
            if mt5.initialize(
                    path="C:/Program Files/MetaTrader 5/terminal64.exe",
                    login=fundedNext15kWith5PercentLoss_login,
                    password=fundedNext15kWith5PercentLoss_password,
                    server=fundedNext15kWith5PercentLoss_server,
                    timeout=5000
            ):
                return True
            logging.error(f"MT5 init attempt {attempt+1} failed")
            time.sleep(1)
        except Exception as e:
            logging.error(f"Connection error: {str(e)}")
    return False