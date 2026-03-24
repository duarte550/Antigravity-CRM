import os
import json
from datetime import datetime
from db import get_db_connection

def format_row(row, cursor):
    return {cursor.description[i][0]: value for i, value in enumerate(row)}

def connect_and_migrate():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Add columns to operations
            cursor.execute("DESCRIBE cri_cra_dev.crm.operations")
            cols = [row.col_name for row in cursor.fetchall()]
            
            new_cols = {
                'is_structuring': 'BOOLEAN',
                'pipeline_stage': 'STRING',
                'rate': 'STRING',
                'indexer': 'STRING',
                'volume': 'FLOAT',
                'fund': 'STRING',
                'risk': 'STRING',
                'temperature': 'STRING',
                'liquidation_date': 'TIMESTAMP',
                'is_active': 'BOOLEAN'
            }
            for col, dtype in new_cols.items():
                if col not in cols:
                    print(f"Adding {col} to operations")
                    cursor.execute(f"ALTER TABLE cri_cra_dev.crm.operations ADD COLUMN {col} {dtype}")

            if 'is_structuring' not in cols:
                cursor.execute("UPDATE cri_cra_dev.crm.operations SET is_structuring = FALSE, is_active = TRUE WHERE is_structuring IS NULL")
            
            # 2. Make operations columns nullable
            nullable_cols = ['operation_type', 'maturity_date', 'responsible_analyst', 'review_frequency', 'call_frequency', 'df_frequency', 'rating_operation', 'rating_group', 'watchlist']
            for col in nullable_cols:
                try:
                    cursor.execute(f"ALTER TABLE cri_cra_dev.crm.operations ALTER COLUMN {col} DROP NOT NULL")
                    print(f"Dropped NOT NULL for {col}")
                except Exception as e:
                    pass

            # 3. Migrate data from structuring_operations
            try:
                cursor.execute("SELECT * FROM cri_cra_dev.crm.structuring_operations")
                struct_ops = cursor.fetchall()
                old_to_new_op_id = {}
                for row in struct_ops:
                    op = format_row(row, cursor)
                    
                    cursor.execute("SELECT id FROM cri_cra_dev.crm.operations WHERE name = ? AND master_group_id = ? AND is_structuring = TRUE", (op['name'], op.get('master_group_id')))
                    existing = cursor.fetchone()
                    if existing:
                        old_to_new_op_id[op['id']] = existing.id
                        continue
                    
                    cursor.execute("""
                        INSERT INTO cri_cra_dev.crm.operations (
                            name, area, master_group_id, pipeline_stage, liquidation_date, 
                            rate, indexer, volume, fund, responsible_analyst, 
                            risk, temperature, is_active, is_structuring
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
                    """, (
                        op['name'], 'CRI', op.get('master_group_id'), op.get('stage'), op.get('liquidation_date'),
                        op.get('rate'), op.get('indexer'), op.get('volume'), op.get('fund'), op.get('analyst'),
                        op.get('risk'), op.get('temperature'), op.get('is_active', True)
                    ))
                    
                    cursor.execute("SELECT id FROM cri_cra_dev.crm.operations WHERE name = ? AND is_structuring = TRUE ORDER BY id DESC LIMIT 1", (op['name'],))
                    new_op_id = cursor.fetchone().id
                    old_to_new_op_id[op['id']] = new_op_id
                    
                    # Update series right here using the old ID
                    cursor.execute("UPDATE cri_cra_dev.crm.structuring_operation_series SET structuring_operation_id = ? WHERE structuring_operation_id = ?", (new_op_id, op['id']))
                    # Update stages
                    cursor.execute("UPDATE cri_cra_dev.crm.structuring_operation_stages SET structuring_operation_id = ? WHERE structuring_operation_id = ?", (new_op_id, op['id']))
            except Exception as e:
                print("Skipping structuring_operations migration (may not exist):", e)

            # 4. Rename tables if they haven't been renamed
            try:
                cursor.execute("DESCRIBE cri_cra_dev.crm.structuring_operation_series")
                cursor.execute("ALTER TABLE cri_cra_dev.crm.structuring_operation_series RENAME TO cri_cra_dev.crm.operation_series")
                cursor.execute("ALTER TABLE cri_cra_dev.crm.operation_series RENAME COLUMN structuring_operation_id TO operation_id")
            except Exception: pass
            
            try:
                cursor.execute("DESCRIBE cri_cra_dev.crm.structuring_operation_stages")
                cursor.execute("ALTER TABLE cri_cra_dev.crm.structuring_operation_stages RENAME TO cri_cra_dev.crm.operation_stages")
                cursor.execute("ALTER TABLE cri_cra_dev.crm.operation_stages RENAME COLUMN structuring_operation_id TO operation_id")
                # Also rename structuring_operation_stage_id to operation_stage_id in events and task_rules if they exist
                cursor.execute("ALTER TABLE cri_cra_dev.crm.events RENAME COLUMN structuring_operation_stage_id TO operation_stage_id")
                cursor.execute("ALTER TABLE cri_cra_dev.crm.task_rules RENAME COLUMN structuring_operation_stage_id TO operation_stage_id")
            except Exception: pass

            # 5. Drop structuring_operations
            cursor.execute("DROP TABLE IF EXISTS cri_cra_dev.crm.structuring_operations")
            
            print("Migration successful.")
    except Exception as e:
        print("Migration failed:", e)
    finally:
        conn.close()

if __name__ == '__main__':
    connect_and_migrate()
