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
symbol_name = 'GBPUSD'  # Replace with the specific name (e.g., 'EURUSD', 'GBPUSD', 'DXY')
batch_size = 10000       # Number of rows to process per batch
index_name = 'idx_name_closeTime'

try:
    # Validate batch size
    if batch_size < 1 or batch_size > 100000:
        raise ValueError("batch_size must be between 1 and 100000")

    # Connect to the database with buffered cursor
    conn = mysql.connector.connect(**db_config, buffered=True)
    cursor = conn.cursor()

    # Check if index exists; create if not
    cursor.execute("""
        SELECT COUNT(*) 
        FROM information_schema.statistics 
        WHERE table_name = 'candles' 
        AND index_name = %s
    """, (index_name,))
    if cursor.fetchone()[0] == 0:
        print(f"Creating index {index_name} for performance...")
        cursor.execute(f"CREATE INDEX {index_name} ON candles (name, closeTime)")
        conn.commit()

    # Get total number of duplicate candles for the specific name
    cursor.execute("""
        SELECT COUNT(*) 
        FROM (
            SELECT id
            FROM candles c1
            WHERE name = %s
            AND EXISTS (
                SELECT 1 
                FROM candles c2 
                WHERE c2.name = c1.name 
                AND c2.closeTime = c1.closeTime 
                AND c2.id < c1.id
            )
        ) AS duplicates
    """, (symbol_name,))
    total_duplicates = cursor.fetchone()[0]

    if total_duplicates == 0:
        print(f"No duplicate candles found for name '{symbol_name}'")
        exit()

    print(f"Found {total_duplicates} duplicate candles for '{symbol_name}' to delete in batches of {batch_size}")

    # Delete duplicates in batches by selecting IDs first
    processed_duplicates = 0
    while True:
        # Step 1: Select IDs of duplicates to delete
        cursor.execute("""
            SELECT c1.id
            FROM candles c1
            WHERE name = %s
            AND EXISTS (
                SELECT 1 
                FROM candles c2 
                WHERE c2.name = c1.name 
                AND c2.closeTime = c1.closeTime 
                AND c2.id < c1.id
            )
            LIMIT %s
        """, (symbol_name, batch_size))

        ids_to_delete = [row[0] for row in cursor.fetchall()]
        if not ids_to_delete:
            break

        # Step 2: Delete the selected IDs
        placeholders = ','.join(['%s'] * len(ids_to_delete))
        cursor.execute(f"""
            DELETE FROM candles
            WHERE id IN ({placeholders})
        """, ids_to_delete)

        affected_rows = cursor.rowcount
        conn.commit()

        processed_duplicates += affected_rows
        percentage = (processed_duplicates / total_duplicates) * 100 if total_duplicates > 0 else 100
        print(f"Progress: Deleted {processed_duplicates}/{total_duplicates} duplicates ({percentage:.2f}% complete)")

except mysql.connector.Error as e:
    print(f"Database error: {e}")
except ValueError as ve:
    print(f"Configuration error: {ve}")
except Exception as e:
    print(f"Unexpected error: {e}")

finally:
    try:
        if 'cursor' in locals() and cursor is not None:
            cursor.close()
        if 'conn' in locals() and conn is not None and conn.is_connected():
            conn.close()
        print("Database connection closed")
    except Exception as e:
        print(f"Error closing connection: {e}")