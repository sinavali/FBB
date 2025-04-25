# shared.py
import logging
import os
import time
from logging import Handler, Formatter
from datetime import datetime
from zoneinfo import ZoneInfo
import MetaTrader5 as mt5
import mysql.connector
from mysql.connector import Error

target_tz_name = "Europe/Athens"
# target_tz_name = "Asia/Nicosia"
target_tz = ZoneInfo(target_tz_name) # +02:00 | +03:00


# demo_login = 5034048580
# demo_password = "*h3nNrEu"
# demo_server = "MetaQuotes-Demo"

# fundedNext15kWith5PercentLoss_login = 489449
# fundedNext15kWith5PercentLoss_password = "dzsAR42##"
# fundedNext15kWith5PercentLoss_server = "FundedNext-Server"


def get_setting(key):
    """
    Fetch a record from the 'setting' table where settingKey matches the provided key.
    
    Args:
        key (str): The setting key to search for
    
    Returns:
        tuple: The matching record as a tuple, or None if not found or error occurs
    """
    try:
        # Establish database connection
        connection = mysql.connector.connect(
            host='localhost',
            user='root',
            password='',
            database='fbb_core'
        )
        
        # Create cursor to execute queries
        cursor = connection.cursor()
        
        # SQL query with parameterized input to prevent SQL injection
        query = """SELECT * FROM setting WHERE settingKey = %s"""
        
        # Execute the query with the provided key
        cursor.execute(query, (key,))
        
        # Fetch the single record
        record = cursor.fetchone()
        
        return record
        
    except Error as e:
        print(f"Error fetching data from MySQL: {e}")
        return None
        
    finally:
        # Close database connection in any case
        if 'connection' in locals() and connection.is_connected():
            cursor.close()
            connection.close()
            print("MySQL connection is closed")


mt5_login = get_setting("Mt5Login")
mt5_password = get_setting("Mt5Password")
mt5_server = get_setting("Mt5Server")

mt5_login = 5035461052
mt5_password = "BgM*YbQ3"
mt5_server = "MetaQuotes-Demo"


# Logging configuration
LOG_DIR = "./Logs/mtDriver"
os.makedirs(LOG_DIR, exist_ok=True)


class DailyRotatingFileHandler(Handler):
    def __init__(self):
        super().__init__()
        self.current_date = None
        self.file_handler = None
        self.setFormatter(Formatter(
            '%(asctime)s - %(levelname)s - %(module)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S%z'
        ))

    def get_file_name(self):
        """Get filename based on Europe/Athens date"""
        now = datetime.now(target_tz)
        return os.path.join(LOG_DIR, f"{now.strftime('%Y-%m-%d')}.log")

    def emit(self, record):
        """Handle log emission with timezone-aware rotation"""
        try:
            current_date = datetime.now(target_tz).date()
            
            if current_date != self.current_date:
                self.close_file()
                self.current_date = current_date
                filename = self.get_file_name()
                self.file_handler = open(filename, 'a', encoding='utf-8')
            
            msg = self.format(record)
            if self.file_handler:
                self.file_handler.write(msg + '\n')
                self.file_handler.flush()
                
        except Exception as e:
            print(f"Logging failed: {str(e)}")

    def close_file(self):
        if self.file_handler:
            self.file_handler.close()
            self.file_handler = None

    def close(self):
        self.close_file()
        super().close()


def setup_logging():
    """Configure logging for all modules"""
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Remove existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)

    # Add file handler
    file_handler = DailyRotatingFileHandler()
    file_handler.setLevel(logging.INFO)
    logger.addHandler(file_handler)

    # Add console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(Formatter(
        '%(asctime)s - %(levelname)s - %(module)s - %(message)s'
    ))
    logger.addHandler(console_handler)

    logging.info("Logging system initialized")


def initialize_mt5():
    for attempt in range(3):
        try:
            if mt5.initialize(
                    path="C:/Program Files/MetaTrader 5/terminal64.exe",
                    login=mt5_login,
                    password=mt5_password,
                    server=mt5_server,
                    timeout=5000
            ):
                return True
            logging.error(f"MT5 init attempt {attempt+1} failed")
            time.sleep(1)
        except Exception as e:
            logging.error(f"Connection error: {str(e)}")
    return False
