import os
import csv
import re
from datetime import datetime
import mysql.connector

# Function to extract symbol and number from filename
def extract_symbol_and_number(filename):
    parts = filename.split('_')
    if len(parts) == 2:
        symbol_part = parts[1].split(',')[0]
        match = re.search(r'\((\d+)\)\.csv', filename)
        if match:
            number = int(match.group(1))
            return symbol_part, number, filename
    return None

# Database connection parameters (replace with your actual credentials)
db_config = {
    'user': 'root',
    'password': '',
    'host': 'localhost',
    'database': 'trading_view_candles'
}

# Directory containing CSV files
csv_dir = 'trading-view_candles_csv'

# Get and sort the files
files = [f for f in os.listdir(csv_dir) if f.endswith('.csv')]
data = [extract_symbol_and_number(f) for f in files]
data = [d for d in data if d is not None]
data.sort(key=lambda x: (x[0], x[1]))

# Connect to the database
conn = mysql.connector.connect(**db_config)
cursor = conn.cursor()

# SQL insert statement
insert_sql = """
INSERT INTO candles (name, period, open, high, low, close, closeTime, time)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
"""

try:
    for symbol, number, filename in data:
        filepath = os.path.join(csv_dir, filename)
        print(f"Processing file: {filename}")
        with open(filepath, 'r') as f:
            reader = csv.reader(f)
            next(reader)  # Skip header
            chunk = []
            row_count = 0
            for row in reader:
                time_str = row[0]
                open_price = float(row[1])
                high = float(row[2])
                low = float(row[3])
                close = float(row[4])
                dt = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                close_time = int(dt.timestamp())
                period = "PERIOD_M1"
                data_tuple = (symbol, period, open_price, high, low, close, close_time, time_str)
                chunk.append(data_tuple)
                row_count += 1
                if len(chunk) == 10000:
                    cursor.executemany(insert_sql, chunk)
                    print(f"Inserted {len(chunk)} rows from {filename}")
                    chunk = []
            if chunk:
                cursor.executemany(insert_sql, chunk)
                print(f"Inserted {len(chunk)} rows from {filename}")
        conn.commit()
        print(f"Completed processing {filename} with {row_count} rows")
finally:
    cursor.close()
    conn.close()
    print("Database connection closed")