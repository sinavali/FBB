import mysql.connector
from mysql.connector import Error

# Database connection parameters (replace with your credentials)
db_config = {
    'user': 'root',
    'password': '',
    'host': 'localhost',
    'database': 'trading_view_candles'
}

# Parameters
symbol_name = 'EURUSD'  # Replace with the specific name (e.g., 'EURUSD', 'GBPUSD', 'DXY')
chunk_size = 1000000      # Number of rows per chunk
min_time_diff = 55      # Minimum allowed time difference in seconds
max_time_diff = 173000   # Maximum allowed time difference in seconds

try:
    # Validate chunk size
    if chunk_size < 1 or chunk_size > 1000000:
        raise ValueError("chunk_size must be between 1 and 100000")

    # Connect to the database with buffered cursor
    conn = mysql.connector.connect(**db_config, buffered=True)
    cursor = conn.cursor()

    # Check if index exists; create if not
    cursor.execute("""
        SELECT COUNT(*) 
        FROM information_schema.statistics 
        WHERE table_name = 'candles' 
        AND index_name = 'idx_name_closeTime'
    """)
    if cursor.fetchone()[0] == 0:
        print("Creating index idx_name_closeTime for performance...")
        cursor.execute("CREATE INDEX idx_name_closeTime ON candles (name, closeTime)")
        conn.commit()

    # Get total number of candles for the specific name
    cursor.execute("SELECT COUNT(*) FROM candles WHERE name = %s ORDER BY closeTime ASC", (symbol_name,))
    total_candles = cursor.fetchone()[0]
    if total_candles == 0:
        print(f"No candles found for name '{symbol_name}'")
        exit()

    print(f"Processing {total_candles} candles for '{symbol_name}' in chunks of {chunk_size}")

    # Fetch candles in chunks, ordered by closeTime
    offset = 0
    processed_candles = 0
    previous_close_time = None

    while offset < total_candles:
        cursor.execute("""
            SELECT id, closeTime
            FROM candles
            WHERE name = %s
            ORDER BY closeTime ASC
            LIMIT %s OFFSET %s
        """, (symbol_name, chunk_size, offset))

        candles = cursor.fetchall()
        if not candles:
            break

        for i, (current_id, current_close_time) in enumerate(candles):
            # Validate closeTime
            if current_close_time is None:
                print(f"Warning: Candle ID {current_id} has NULL closeTime, skipping")
                continue

            if previous_close_time is not None:
                try:
                    time_diff = current_close_time - previous_close_time
                    if time_diff < min_time_diff or time_diff > max_time_diff:
                        print(f"Candle ID {current_id} has invalid time difference: {time_diff} seconds")
                except TypeError:
                    print(f"Error: Candle ID {current_id} has invalid closeTime value: {current_close_time}")
            previous_close_time = current_close_time

        # Update progress
        processed_candles += len(candles)
        percentage = (processed_candles / total_candles) * 100
        print(f"Progress: {processed_candles}/{total_candles} candles ({percentage:.2f}% complete)")

        offset += chunk_size

except mysql.connector.Error as e:
    print(f"Database error: {e}")
except ValueError as ve:
    print(f"Configuration error: {ve}")
except Exception as e:
    print(f"Unexpected error: {e}")

finally:
    # Close cursor and connection safely
    try:
        if 'cursor' in locals() and cursor is not None:
            cursor.close()
        if 'conn' in locals() and conn is not None and conn.is_connected():
            conn.close()
        print("Database connection closed")
    except Exception as e:
        print(f"Error closing connection: {e}")