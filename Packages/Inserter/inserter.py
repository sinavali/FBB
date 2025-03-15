import csv
import mysql.connector
import pytz
import os
from datetime import datetime

# Configuration
DB_CONFIG = {
    'host': 'localhost',
    'user': "root",
    'password': "",
    'database': 'fbb_test_candles',
    'raise_on_warnings': True
}

CHUNK_SIZE = 1000
TABLE_NAME = 'candles'
CSV_DIRECTORY = 'Packages/Inserter/csv_files' # Hardcoded directory name

def convert_to_utc_unix(date_str, time_str):
    tehran_tz = pytz.timezone('Asia/Tehran')
    naive_dt = datetime.strptime(f"{date_str} {time_str}", "%Y.%m.%d %H:%M")
    tehran_dt = tehran_tz.localize(naive_dt)
    return int(tehran_dt.astimezone(pytz.utc).timestamp())

def process_file(cnx, cursor, file_path, pair_name):
    data = []
    with open(file_path, 'r') as f:
        reader = csv.reader(f)
        for row in reader:
            try:
                close_time = convert_to_utc_unix(row[0], row[1])
                data.append((
                    pair_name,
                    "PERIOD_M1",
                    float(row[2]),  # open
                    float(row[5]),  # high
                    float(row[4]),  # low
                    float(row[3]),  # close
                    close_time,
                    f"{row[0].replace('.', '-')}T{row[1]}"  # ISO format
                ))
            except (IndexError, ValueError) as e:
                print(f"Skipping invalid row in {pair_name}: {e}")
                continue

    # Sort by closeTime ascending
    data.sort(key=lambda x: x[6])
    
    # Insert in chunks
    total = len(data)
    for i in range(0, total, CHUNK_SIZE):
        chunk = data[i:i+CHUNK_SIZE]
        insert_chunk(cnx, cursor, chunk)
        print(f"{pair_name}: Inserted {min(i+CHUNK_SIZE, total)}/{total}")

def insert_chunk(cnx, cursor, chunk):
    sql = f"""
    INSERT INTO {TABLE_NAME} 
        (name, period, open, high, low, close, closeTime, time)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"""
    
    try:
        cursor.executemany(sql, chunk)
        cnx.commit()
    except mysql.connector.Error as err:
        print(f"Insert error: {err}")
        cnx.rollback()

def main():
    # Validate CSV directory
    if not os.path.exists(CSV_DIRECTORY):
        print(f"Error: Directory '{CSV_DIRECTORY}' not found!")
        exit(1)
    if not os.path.isdir(CSV_DIRECTORY):
        print(f"Error: '{CSV_DIRECTORY}' is not a directory!")
        exit(1)

    # Find all CSV files
    csv_files = []
    for fname in os.listdir(CSV_DIRECTORY):
        if fname.lower().endswith('.csv'):
            pair = os.path.splitext(fname)[0].upper()
            csv_files.append((
                os.path.join(CSV_DIRECTORY, fname),
                pair
            ))

    if not csv_files:
        print(f"No CSV files found in {CSV_DIRECTORY}!")
        exit(1)

    # Process files
    try:
        cnx = mysql.connector.connect(**DB_CONFIG)
        cursor = cnx.cursor()
        
        # Optimize for bulk inserts
        cursor.execute("SET autocommit = 0")
        cursor.execute("SET unique_checks = 0")
        cursor.execute("SET foreign_key_checks = 0")

        for path, pair in csv_files:
            print(f"\nProcessing {pair} ({path})")
            process_file(cnx, cursor, path, pair)

        print("\nAll files processed successfully!")

    except mysql.connector.Error as err:
        print(f"Database error: {err}")
    finally:
        if cnx.is_connected():
            cursor.execute("SET unique_checks = 1")
            cursor.execute("SET foreign_key_checks = 1")
            cursor.close()
            cnx.close()

if __name__ == '__main__':
    main()