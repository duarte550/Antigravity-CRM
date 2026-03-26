import os
import sys

# Append the current directory into sys.path to allow imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db import get_db_connection

def drop_column():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        print("Dropping litigation_lawyer_comments from operations...")
        cursor.execute("ALTER TABLE cri_cra_dev.crm.operations DROP COLUMN litigation_lawyer_comments")
        try:
            conn.commit()
        except:
            pass
        print("Column successfully dropped.")
    except Exception as e:
        print(f"Failed to drop column: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    drop_column()
