
from datetime import datetime, date

def safe_isoformat(val):
    """
    Safely converts a value to ISO format string.
    If it's already a string, returns it.
    If it has an isoformat method (datetime/date), calls it.
    Otherwise returns None or string representation.
    """
    if val is None:
        return None
    if hasattr(val, 'isoformat'):
        return val.isoformat()
    return str(val)

def parse_iso_date(val):
    """
    Safely parses an ISO date string into a datetime object.
    If it's already a datetime/date object, returns it.
    """
    if not val:
        return None
    if isinstance(val, (datetime, date)):
        return val
    try:
        # Handle both "YYYY-MM-DD" and "YYYY-MM-DDTHH:MM:SS"
        if 'T' in val:
            return datetime.fromisoformat(val.replace('Z', ''))
        else:
            return datetime.strptime(val, '%Y-%m-%d')
    except Exception:
        return val # Fallback to string if parsing fails

def format_row(row, cursor):
    """ Converts a cursor row into a dict using cursor.description """
    return {desc[0]: value for desc, value in zip(cursor.description, row)}

def get_next_unique_id(cursor, table_name):
    """
    Gera o próximo ID único para uma tabela, garantindo que não há duplicatas,
    já que o Databricks pode falhar ao aplicar restrições de unicidade de PK.
    """
    cursor.execute(f"SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM cri_cra_dev.crm.{table_name}")
    next_id_row = cursor.fetchone()
    next_id = int(next_id_row.next_id) if next_id_row and next_id_row.next_id else 1
    
    while True:
        cursor.execute(f"SELECT id FROM cri_cra_dev.crm.{table_name} WHERE id = ?", (next_id,))
        if not cursor.fetchone():
            return next_id
        next_id += 1
