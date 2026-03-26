import os
import sys

# Append the current directory into sys.path to allow imports like `from db import get_db_connection`
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db import get_db_connection

def migrate():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        print("Backfilling was_structured column for existing structuring operations...")
        cursor.execute("UPDATE cri_cra_dev.crm.operations SET was_structured = TRUE WHERE is_structuring = FALSE AND EXISTS(SELECT 1 FROM cri_cra_dev.crm.operation_stages WHERE operation_id = cri_cra_dev.crm.operations.id)")
        
        # Databricks Python connection standard requires conn.commit() if not autocommit
        try:
            conn.commit()
        except Exception:
            pass
            
        print("Successfully backfilled was_structured.")
    except Exception as e:
        print(f"Failed to backfill was_structured: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    migrate()
