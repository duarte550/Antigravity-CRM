import json
import logging
from datetime import datetime, date
from collections import defaultdict

from utils import safe_isoformat, parse_iso_date, format_row, get_next_unique_id
from task_engine import generate_tasks_for_operation

# Extracted from app.py
RATING_TO_POLITICA_FREQUENCY = {
    'A4': 'Anual', 'Baa1': 'Anual', 'Baa3': 'Anual', 'Baa4': 'Anual',
    'Ba1': 'Anual', 'Ba4': 'Anual', 'Ba5': 'Anual', 'Ba6': 'Anual',
    'B1': 'Semestral', 'B2': 'Semestral', 'B3': 'Semestral', 'B4': 'Semestral',
    'C1': 'Semestral', 'C2': 'Semestral', 'C3': 'Semestral',
}

FREQUENCY_VALUE_MAP = {
    'Diário': 1, 'Semanal': 7, 'Quinzenal': 15, 'Mensal': 30,
    'Trimestral': 90, 'Semestral': 180, 'Anual': 365
}

def log_action(cursor, user_name, action, entity_type, entity_id, details=""):
    """Grava uma ação no log de auditoria."""
    new_audit_id = get_next_unique_id(cursor, 'audit_logs')
    cursor.execute(
        """
        INSERT INTO cri_cra_dev.crm.audit_logs (id, timestamp, user_name, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (new_audit_id, datetime.now(), user_name, action, entity_type, str(entity_id), details)
    )

def generate_diff_details(old_data: dict, new_data: dict, fields_to_compare: dict) -> str:
    details: list[str] = []
    for field, field_name in fields_to_compare.items():
        old_field_key = field.replace('ratingGroup', 'rating_group').replace('ratingOperation', 'rating_operation')
        old_value = old_data.get(old_field_key)
        new_value = new_data.get(field)
        if old_value != new_value:
            details.append(f"Alterou '{field_name}' de '{old_value}' para '{new_value}'")
    return "; ".join(details)


# ── Reusable Mappers ──

def map_operation_base(db_row: dict) -> dict:
    return {
        'id': db_row['id'], 'name': db_row['name'], 'area': db_row['area'],
        'masterGroupId': db_row.get('master_group_id'),
        'masterGroupName': db_row.get('master_group_name'),
        'economicGroupId': db_row.get('economic_group_id'),
        'economicGroupName': db_row.get('economic_group_name'),
        'operationType': db_row.get('operation_type'),
        'maturityDate': safe_isoformat(db_row.get('maturity_date')),
        'estimatedDate': safe_isoformat(db_row.get('estimated_date')),
        'responsibleAnalyst': db_row.get('responsible_analyst'), 
        'structuringAnalyst': db_row.get('structuring_analyst'), 
        'reviewFrequency': db_row.get('review_frequency'),
        'callFrequency': db_row.get('call_frequency'), 
        'dfFrequency': db_row.get('df_frequency'),
        'segmento': db_row.get('segmento'), 
        'ratingOperation': db_row.get('rating_operation'),
        'ratingGroup': db_row.get('rating_group'), 
        'watchlist': db_row.get('watchlist'),
        'covenants': {'ltv': db_row.get('ltv'), 'dscr': db_row.get('dscr')},
        'defaultMonitoring': {
            'news': db_row.get('monitoring_news') or False,
            'fiiReport': db_row.get('monitoring_fii_report') or False,
            'operationalInfo': db_row.get('monitoring_operational_info') or False,
            'receivablesPortfolio': db_row.get('monitoring_receivables_portfolio') or False,
            'monthlyConstructionReport': db_row.get('monitoring_construction_report') or False,
            'monthlyCommercialInfo': db_row.get('monitoring_commercial_info') or False,
            'speDfs': db_row.get('monitoring_spe_dfs') or False
        },
        'description': db_row.get('description'),
        'status': db_row.get('status') or 'Ativa',
        'movedToLegacyDate': safe_isoformat(db_row.get('moved_to_legacy_date')),
        'wasStructured': db_row.get('was_structured') or False,
        'projects': [], 'guarantees': [], 'events': [], 'taskRules': [], 
        'ratingHistory': [], 'tasks': [], 'contacts': [], 'litigationComments': [],
        'notes': None
    }

def map_event(db_row: dict) -> dict:
    return {
        'id': db_row.get('id'), 'date': safe_isoformat(db_row.get('date')),
        'type': db_row.get('type'), 'title': db_row.get('title'), 
        'description': db_row.get('description'), 'registeredBy': db_row.get('registered_by'), 
        'nextSteps': db_row.get('next_steps'), 'completedTaskId': db_row.get('completed_task_id'),
        'attentionPoints': db_row.get('attention_points'),
        'ourAttendees': db_row.get('our_attendees'),
        'operationAttendees': db_row.get('operation_attendees'),
        'isOrigination': db_row.get('is_origination') or False,
        # Added for master_groups / economic_groups usage
        'operationName': db_row.get('operation_name')
    }

def map_checklist_item(ci: dict) -> dict:
    return {
        'id': ci.get('id'), 'taskRuleId': ci.get('task_rule_id'),
        'title': ci.get('title'), 'isCompleted': ci.get('is_completed') or False,
        'completedBy': ci.get('completed_by'), 'completedAt': safe_isoformat(ci.get('completed_at')),
        'orderIndex': ci.get('order_index') or 0
    }

def map_task_rule(db_row: dict, checklist_items: list = None) -> dict:
    return {
        'id': db_row.get('id'), 'name': db_row.get('name'), 'frequency': db_row.get('frequency'),
        'startDate': safe_isoformat(db_row.get('start_date')),
        'endDate': safe_isoformat(db_row.get('end_date')),
        'description': db_row.get('description'),
        'priority': db_row.get('priority'),
        'checklistItems': checklist_items or [],
        'assignees': json.loads(db_row.get('assignees') or '[]') if db_row.get('assignees') else []
    }

def map_risk(db_row: dict) -> dict:
    return {
        'id': db_row.get('id'), 'title': db_row.get('title'), 'description': db_row.get('description'),
        'severity': db_row.get('severity'), 'createdAt': safe_isoformat(db_row.get('created_at')),
        'updatedAt': safe_isoformat(db_row.get('updated_at'))
    }

def map_rating_history(db_row: dict) -> dict:
    return {
        'id': db_row.get('id'), 'date': safe_isoformat(db_row.get('date')),
        'ratingOperation': db_row.get('rating_operation'), 'ratingGroup': db_row.get('rating_group'),
        'ratingMasterGroup': db_row.get('rating_master_group'),
        'watchlist': db_row.get('watchlist'), 'sentiment': db_row.get('sentiment'), 
        'eventId': db_row.get('event_id')
    }

def map_contact(c: dict) -> dict:
    return {
        'id': c.get('id'), 'name': c.get('name'), 'email': c.get('email'), 
        'phone': c.get('phone'), 'role': c.get('role')
    }

def map_litigation_comment(c: dict) -> dict:
    return {
        'id': c.get('id'), 'createdAt': safe_isoformat(c.get('date')), 
        'description': c.get('description'), 'userName': c.get('user_name')
    }

# ── Core Functions ──

def _sync_checklist_items(cursor, rule_id, checklist_items):
    """Sincroniza os itens de checklist apagando os antigas e criando as novas."""
    try:
        cursor.execute("DELETE FROM cri_cra_dev.crm.task_checklist_items WHERE task_rule_id = ?", (rule_id,))
        if checklist_items:
            for idx, item in enumerate(checklist_items):
                new_id = get_next_unique_id(cursor, 'task_checklist_items')
                completed_at = parse_iso_date(item.get('completedAt')) if item.get('completedAt') else None
                # If marked complete just now and missing time, set it here
                if item.get('isCompleted') and not completed_at:
                    completed_at = datetime.now()
                cursor.execute(
                    "INSERT INTO cri_cra_dev.crm.task_checklist_items (id, task_rule_id, title, is_completed, completed_by, completed_at, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (new_id, rule_id, item.get('title'), item.get('isCompleted', False), item.get('completedBy'), completed_at, idx)
                )
    except Exception as e:
        logging.warning(f"Error syncing checklist items for rule {rule_id}: {e}")

def _compute_next_reviews(operation):
    maturity_date_iso = operation.get('maturityDate')
    
    if maturity_date_iso:
        task_rules = operation.get('taskRules') or []
        for rule in task_rules:
            if isinstance(rule, dict) and rule.get('name') in ['Revisão Gerencial', 'Revisão Política']:
                rule['endDate'] = maturity_date_iso

    tasks = operation.get('tasks', [])
    operation['overdueCount'] = sum(1 for task in tasks if task['status'] == 'Atrasada')

    maturity_date_obj = parse_iso_date(maturity_date_iso)
    if hasattr(maturity_date_obj, 'date'):
        maturity_date_obj = maturity_date_obj.date()

    if maturity_date_obj and maturity_date_obj < date.today():
        operation['nextReviewGerencialTask'] = None
        operation['nextReviewPoliticaTask'] = None
        operation['nextReviewGerencial'] = None
        operation['nextReviewPolitica'] = None
    else:
        pending_and_overdue_tasks = [t for t in tasks if t['status'] != 'Concluída']
        gerencial_tasks = sorted([t for t in pending_and_overdue_tasks if t['ruleName'] == 'Revisão Gerencial'], key=lambda t: t['dueDate'] or "")
        politica_tasks = sorted([t for t in pending_and_overdue_tasks if t['ruleName'] == 'Revisão Política'], key=lambda t: t['dueDate'] or "")
        
        operation['nextReviewGerencialTask'] = gerencial_tasks[0] if gerencial_tasks else None
        operation['nextReviewPoliticaTask'] = politica_tasks[0] if politica_tasks else None
        operation['nextReviewGerencial'] = gerencial_tasks[0]['dueDate'] if gerencial_tasks else None
        operation['nextReviewPolitica'] = politica_tasks[0]['dueDate'] if politica_tasks else None


def load_operations(cursor, *, op_id: int = None):
    """Load operation(s) as ready-to-serialize camelCase DTOs."""
    operations_map = {}
    
    where_clause = "WHERE o.id = ?" if op_id is not None else "WHERE o.is_structuring IS NULL OR o.is_structuring = FALSE"
    params = (op_id,) if op_id is not None else ()
    
    cursor.execute(f"""
        SELECT o.*, mg.name AS master_group_name, eg.name AS economic_group_name,
        COALESCE(eg.rating, mg.rating) AS rating_group
        FROM cri_cra_dev.crm.operations o
        LEFT JOIN cri_cra_dev.crm.master_groups mg ON o.master_group_id = mg.id
        LEFT JOIN cri_cra_dev.crm.economic_groups eg ON o.economic_group_id = eg.id
        {where_clause}
        ORDER BY o.name
    """, params)
    
    db_operations = [format_row(row, cursor) for row in cursor.fetchall()]
    if not db_operations:
        return None if op_id is not None else []
    
    for op_db in db_operations:
        operations_map[op_db['id']] = map_operation_base(op_db)
    
    op_ids = list(operations_map.keys())
    placeholders = ', '.join(['?'] * len(op_ids))
    
    # Notes
    try:
        cursor.execute(f"SELECT operation_id, notes FROM cri_cra_dev.crm.operation_review_notes WHERE operation_id IN ({placeholders})", op_ids)
        for row in cursor.fetchall():
            operations_map[row.operation_id]['notes'] = row.notes
    except Exception as e:
        if "TABLE_OR_VIEW_NOT_FOUND" not in str(e) and "no such table" not in str(e).lower(): raise e

    # Risks (batching makes sense even for single)
    try:
        cursor.execute(f"SELECT * FROM cri_cra_dev.crm.operation_risks WHERE operation_id IN ({placeholders}) ORDER BY created_at DESC", op_ids)
        for row in cursor.fetchall():
            operations_map[row.operation_id]['risks'].append(map_risk(format_row(row, cursor)))
    except Exception as e:
        pass # Optional table

    # Projects
    cursor.execute(f"SELECT op.operation_id, p.id, p.name FROM cri_cra_dev.crm.projects p JOIN cri_cra_dev.crm.operation_projects op ON p.id = op.project_id WHERE op.operation_id IN ({placeholders})", op_ids)
    for row in cursor.fetchall():
        operations_map[row.operation_id]['projects'].append({'id': row.id, 'name': row.name})

    # Guarantees
    cursor.execute(f"SELECT og.operation_id, g.id, g.name FROM cri_cra_dev.crm.guarantees g JOIN cri_cra_dev.crm.operation_guarantees og ON g.id = og.guarantee_id WHERE og.operation_id IN ({placeholders})", op_ids)
    for row in cursor.fetchall():
        operations_map[row.operation_id]['guarantees'].append({'id': row.id, 'name': row.name})

    # Events
    cursor.execute(f"SELECT * FROM cri_cra_dev.crm.events WHERE operation_id IN ({placeholders}) ORDER BY date DESC", op_ids)
    for row in cursor.fetchall():
        operations_map[row.operation_id]['events'].append(map_event(format_row(row, cursor)))

    # Task Rules & Checklists
    cursor.execute(f"SELECT * FROM cri_cra_dev.crm.task_rules WHERE operation_id IN ({placeholders})", op_ids)
    all_rules_rows = [format_row(row, cursor) for row in cursor.fetchall()]
    all_rule_ids = [r.get('id') for r in all_rules_rows if r.get('id')]
    bulk_checklist_by_rule = defaultdict(list)
    
    if all_rule_ids:
        rule_pl = ', '.join(['?'] * len(all_rule_ids))
        try:
            cursor.execute(f"SELECT * FROM cri_cra_dev.crm.task_checklist_items WHERE task_rule_id IN ({rule_pl}) ORDER BY order_index", all_rule_ids)
            for ci_row in cursor.fetchall():
                ci = format_row(ci_row, cursor)
                bulk_checklist_by_rule[ci['task_rule_id']].append(map_checklist_item(ci))
        except Exception as e:
            if "TABLE_OR_VIEW_NOT_FOUND" not in str(e) and "no such table" not in str(e).lower(): raise e

    for rule_row in all_rules_rows:
        rule_op_id = rule_row.get('operation_id')
        items = bulk_checklist_by_rule.get(rule_row.get('id'), [])
        operations_map[rule_op_id]['taskRules'].append(map_task_rule(rule_row, items))

    # Contacts
    try:
        cursor.execute(f"SELECT * FROM cri_cra_dev.crm.operation_contacts WHERE operation_id IN ({placeholders})", op_ids)
        for row in cursor.fetchall():
            operations_map[row.operation_id]['contacts'].append(map_contact(format_row(row, cursor)))
    except Exception as e:
        pass # Optional structure

    # Litigation Comments
    try:
        cursor.execute(f"SELECT * FROM cri_cra_dev.crm.operation_litigation_comments WHERE operation_id IN ({placeholders}) ORDER BY date DESC", op_ids)
        for row in cursor.fetchall():
            if 'litigationComments' not in operations_map[row.operation_id]:
                operations_map[row.operation_id]['litigationComments'] = []
            operations_map[row.operation_id]['litigationComments'].append(map_litigation_comment(format_row(row, cursor)))
    except Exception:
        pass

    # Rating History
    cursor.execute(f"SELECT * FROM cri_cra_dev.crm.rating_history WHERE operation_id IN ({placeholders}) ORDER BY date DESC", op_ids)
    for row in cursor.fetchall():
        operations_map[row.operation_id]['ratingHistory'].append(map_rating_history(format_row(row, cursor)))

    # Task Exceptions
    cursor.execute(f"SELECT operation_id, task_id FROM cri_cra_dev.crm.task_exceptions WHERE operation_id IN ({placeholders})", op_ids)
    exceptions_by_op = defaultdict(set)
    for row in cursor.fetchall():
        exceptions_by_op[row.operation_id].add(row.task_id)

    # Process Tasks & Computed fields
    for op_id_key, op in operations_map.items():
        op['taskExceptions'] = list(exceptions_by_op.get(op_id_key, set()))
        op['tasks'] = generate_tasks_for_operation(op, exceptions_by_op.get(op_id_key, set()))
        _compute_next_reviews(op)

    if op_id is not None:
        return operations_map.get(op_id)
    return list(operations_map.values())


def save_operation(cursor, op_id: int, data: dict, user_name: str = 'System') -> None:
    """Persist operation changes with full business rule enforcement."""
    cursor.execute("SELECT * FROM cri_cra_dev.crm.operations WHERE id = ?", (op_id,))
    old_op_row = cursor.fetchone()
    if not old_op_row: raise Exception(f"Operação com id {op_id} não encontrada.")
    old_op_db = format_row(old_op_row, cursor)
    
    cursor.execute("SELECT * FROM cri_cra_dev.crm.events WHERE operation_id = ?", (op_id,))
    # Normaliza para string para garantir compatibilidade com tipos do driver ODBC
    # (Databricks pode retornar ids como int, Decimal ou string)
    db_events = {str(row.id): format_row(row, cursor) for row in cursor.fetchall()}
    db_event_ids = set(db_events.keys())  # set de strings → comparação segura
    
    cursor.execute("SELECT id FROM cri_cra_dev.crm.rating_history WHERE operation_id = ?", (op_id,))
    db_rh_ids = {str(row.id) for row in cursor.fetchall()}  # normalizado para string

    old_rating_group = old_op_db.get('rating_group')
    new_rating_group = data.get('ratingGroup', old_rating_group)
    
    if data.get('economicGroupId') == 'new' and data.get('newEGName'):
        new_eg_id = get_next_unique_id(cursor, 'economic_groups')
        cursor.execute("INSERT INTO cri_cra_dev.crm.economic_groups (id, name, master_group_id, rating) VALUES (?, ?, ?, ?)",
                       (new_eg_id, data.get('newEGName'), data.get('masterGroupId'), new_rating_group))
        data['economicGroupId'] = new_eg_id
    elif data.get('economicGroupId') == '':
        data['economicGroupId'] = None
    
    # Rating cascade logic
    if old_rating_group != new_rating_group:
        cursor.execute("SELECT name, frequency, start_date FROM cri_cra_dev.crm.task_rules WHERE operation_id = ?", (op_id,))
        all_rules = {row.name: {'frequency': row.frequency, 'start_date': row.start_date} for row in cursor.fetchall()}
        cursor.execute("SELECT type, MAX(date) as max_date FROM cri_cra_dev.crm.events WHERE operation_id = ? AND type = 'Revisão Periódica' GROUP BY type", (op_id,))
        last_review_date_row = cursor.fetchone()
        last_review_date = last_review_date_row.max_date if last_review_date_row else None
        
        new_politica_freq = RATING_TO_POLITICA_FREQUENCY.get(new_rating_group, 'Anual')
        if 'Revisão Política' in all_rules:
            start = last_review_date or all_rules['Revisão Política'].get('start_date') or datetime.now()
            cursor.execute("UPDATE cri_cra_dev.crm.task_rules SET frequency = ?, start_date = ? WHERE operation_id = ? AND name = 'Revisão Política'", (new_politica_freq, start, op_id))
            log_action(cursor, data.get('responsibleAnalyst', user_name), 'UPDATE', 'TaskRule', op_id, f"Frequência da Revisão de Política ajustada para {new_politica_freq}.")

        gerencial_rule = all_rules.get('Revisão Gerencial')
        if gerencial_rule and FREQUENCY_VALUE_MAP.get(gerencial_rule.get('frequency'), 999) > FREQUENCY_VALUE_MAP.get(new_politica_freq, 0):
            start = last_review_date or gerencial_rule.get('start_date') or datetime.now()
            cursor.execute("UPDATE cri_cra_dev.crm.task_rules SET frequency = ?, start_date = ? WHERE operation_id = ? AND name = 'Revisão Gerencial'", (new_politica_freq, start, op_id))
            log_action(cursor, data.get('responsibleAnalyst', user_name), 'UPDATE', 'TaskRule', op_id, f"Frequência da Revisão Gerencial ajustada para {new_politica_freq}.")

        final_economic_group_id = data.get('economicGroupId', old_op_db.get('economic_group_id'))
        if final_economic_group_id:
            cursor.execute("UPDATE cri_cra_dev.crm.economic_groups SET rating = ? WHERE id = ?", (new_rating_group, final_economic_group_id))
            log_action(cursor, data.get('responsibleAnalyst', user_name), 'UPDATE', 'EconomicGroup', final_economic_group_id, f"Rating do Grupo Econômico atualizado para {new_rating_group} via operação {op_id}.")

    cov = data.get('covenants', {})
    
    est_date_val = data.get('estimatedDate')
    if est_date_val == "": est_date_val = None
    final_est_date = parse_iso_date(est_date_val) if 'estimatedDate' in data else old_op_db.get('estimated_date')
    
    final_maturity_date = parse_iso_date(data.get('maturityDate')) if 'maturityDate' in data else old_op_db.get('maturity_date')
    final_description = data.get('description', old_op_db.get('description'))
    final_status = data.get('status', old_op_db.get('status'))
    final_moved_to_legacy_date = parse_iso_date(data.get('movedToLegacyDate')) if 'movedToLegacyDate' in data else old_op_db.get('moved_to_legacy_date')
    final_was_structured = data.get('wasStructured') if 'wasStructured' in data else old_op_db.get('was_structured')

    final_master_group_id = data.get('masterGroupId', old_op_db.get('master_group_id'))
    final_economic_group_id = data.get('economicGroupId', old_op_db.get('economic_group_id'))

    cursor.execute( "UPDATE cri_cra_dev.crm.operations SET name = ?, area = ?, rating_operation = ?, watchlist = ?, ltv = ?, dscr = ?, estimated_date = ?, maturity_date = ?, responsible_analyst = ?, structuring_analyst = ?, segmento = ?, description = ?, status = ?, moved_to_legacy_date = ?, master_group_id = ?, economic_group_id = ?, was_structured = ? WHERE id = ?", (data.get('name', old_op_db.get('name')), data.get('area', old_op_db.get('area')), data.get('ratingOperation', old_op_db.get('rating_operation')), data.get('watchlist', old_op_db.get('watchlist')), cov.get('ltv', old_op_db.get('ltv')), cov.get('dscr', old_op_db.get('dscr')), final_est_date, final_maturity_date, data.get('responsibleAnalyst', old_op_db.get('responsible_analyst')), data.get('structuringAnalyst', old_op_db.get('structuring_analyst')), data.get('segmento', old_op_db.get('segmento')), final_description, final_status, final_moved_to_legacy_date, final_master_group_id, final_economic_group_id, final_was_structured, op_id) )
    
    if 'notes' in data:
        try:
            cursor.execute("SELECT 1 FROM cri_cra_dev.crm.operation_review_notes WHERE operation_id = ?", (op_id,))
            if cursor.fetchone():
                cursor.execute(
                    "UPDATE cri_cra_dev.crm.operation_review_notes SET notes = ?, updated_at = ?, updated_by = ? WHERE operation_id = ?",
                    (data['notes'], datetime.now(), data.get('responsibleAnalyst', user_name), op_id)
                )
            else:
                cursor.execute(
                    "INSERT INTO cri_cra_dev.crm.operation_review_notes (operation_id, notes, updated_at, updated_by) VALUES (?, ?, ?, ?)",
                    (op_id, data['notes'], datetime.now(), data.get('responsibleAnalyst', user_name))
                )
        except Exception as e:
            if "TABLE_OR_VIEW_NOT_FOUND" not in str(e) and "no such table" not in str(e).lower(): raise e

    cursor.execute("DELETE FROM cri_cra_dev.crm.operation_projects WHERE operation_id = ?", (op_id,))
    for project in data.get('projects', []):
        project_name = project.get('name')
        if project_name:
            cursor.execute("SELECT id FROM cri_cra_dev.crm.projects WHERE name = ?", (project_name,))
            proj_row = cursor.fetchone()
            project_id = proj_row.id if proj_row else None
            if not project_id:
                project_id = get_next_unique_id(cursor, 'projects')
                cursor.execute("INSERT INTO cri_cra_dev.crm.projects (id, name) VALUES (?, ?)", (project_id, project_name))
            cursor.execute("INSERT INTO cri_cra_dev.crm.operation_projects (operation_id, project_id) VALUES (?, ?)", (op_id, project_id))

    cursor.execute("DELETE FROM cri_cra_dev.crm.operation_guarantees WHERE operation_id = ?", (op_id,))
    for guarantee in data.get('guarantees', []):
        guarantee_name = guarantee.get('name')
        if guarantee_name:
            cursor.execute("SELECT id FROM cri_cra_dev.crm.guarantees WHERE name = ?", (guarantee_name,))
            guar_row = cursor.fetchone()
            guarantee_id = guar_row.id if guar_row else None
            if not guarantee_id:
                guarantee_id = get_next_unique_id(cursor, 'guarantees')
                cursor.execute("INSERT INTO cri_cra_dev.crm.guarantees (id, name) VALUES (?, ?)", (guarantee_id, guarantee_name))
            cursor.execute("INSERT INTO cri_cra_dev.crm.operation_guarantees (operation_id, guarantee_id) VALUES (?, ?)", (op_id, guarantee_id))

    client_event_id_to_db_id_map = {}
    
    for event in data.get('events', []):
        event_id = str(event.get('id'))
        
        # Explicit deletion
        if event.get('deleted'):
            if event_id in db_event_ids:
                cursor.execute("DELETE FROM cri_cra_dev.crm.events WHERE id = ?", (int(event_id),))
                log_action(cursor, data.get('responsibleAnalyst', user_name), 'DELETE', 'Event', event_id, "Evento deletado explicitamente.")
            continue

        if event_id not in db_event_ids:
            db_event_id = get_next_unique_id(cursor, 'events')
            cursor.execute("INSERT INTO cri_cra_dev.crm.events (id, operation_id, date, type, title, description, registered_by, next_steps, completed_task_id, attention_points, our_attendees, operation_attendees) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (db_event_id, op_id, event.get('date'), event.get('type'), event.get('title'), event.get('description'), event.get('registeredBy'), event.get('nextSteps'), event.get('completedTaskId'), event.get('attentionPoints'), event.get('ourAttendees'), event.get('operationAttendees')))
            client_event_id_to_db_id_map[event_id] = db_event_id
            log_action(cursor, event.get('registeredBy'), 'CREATE', 'Event', db_event_id, f"Evento '{event.get('title')}' adicionado.")
        else:
            old_event = db_events[event_id]  # chave normalizada como string
            def norm(v): return str(v).strip() if v is not None else ""
            def norm_date(v): return str(v)[:10] if v is not None else ""
            
            changed = (
                norm_date(event.get('date')) != norm_date(old_event.get('date')) or
                norm(event.get('type')) != norm(old_event.get('type')) or
                norm(event.get('title')) != norm(old_event.get('title')) or
                norm(event.get('description')) != norm(old_event.get('description')) or
                norm(event.get('registeredBy')) != norm(old_event.get('registered_by')) or
                norm(event.get('nextSteps')) != norm(old_event.get('next_steps')) or
                norm(event.get('completedTaskId')) != norm(old_event.get('completed_task_id')) or
                norm(event.get('attentionPoints')) != norm(old_event.get('attention_points')) or
                norm(event.get('ourAttendees')) != norm(old_event.get('our_attendees')) or
                norm(event.get('operationAttendees')) != norm(old_event.get('operation_attendees'))
            )
            
            if changed:
                cursor.execute(
                    "UPDATE cri_cra_dev.crm.events SET date=?, type=?, title=?, description=?, registered_by=?, next_steps=?, completed_task_id=?, attention_points=?, our_attendees=?, operation_attendees=? WHERE id=?",
                    (event.get('date'), event.get('type'), event.get('title'), event.get('description'), event.get('registeredBy'), event.get('nextSteps'), event.get('completedTaskId'), event.get('attentionPoints'), event.get('ourAttendees'), event.get('operationAttendees'), event_id)
                )
                log_action(cursor, event.get('registeredBy'), 'UPDATE', 'Event', event_id, f"Evento '{event.get('title')}' atualizado.")

    for rh in data.get('ratingHistory', []):
        # Normaliza o id do cliente para string (JSON retorna int, db_rh_idsé set[str])
        if str(rh.get('id', '')) not in db_rh_ids:
            client_event_id = rh.get('eventId')
            db_event_id_for_rh = client_event_id_to_db_id_map.get(str(client_event_id), client_event_id)
            rh_id = get_next_unique_id(cursor, 'rating_history')
            cursor.execute("INSERT INTO cri_cra_dev.crm.rating_history (id, operation_id, date, rating_operation, rating_group, rating_master_group, watchlist, sentiment, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (rh_id, op_id, rh.get('date'), rh.get('ratingOperation'), rh.get('ratingGroup'), rh.get('ratingMasterGroup'), rh.get('watchlist'), rh.get('sentiment'), db_event_id_for_rh))

    old_watchlist = old_op_db.get('watchlist')
    new_watchlist = data.get('watchlist', old_watchlist)
    
    has_litigation_comments = False
    try:
        cursor.execute("SELECT COUNT(*) as count FROM cri_cra_dev.crm.operation_litigation_comments WHERE operation_id = ?", (op_id,))
        litigation_count_row = cursor.fetchone()
        has_litigation_comments = litigation_count_row[0] > 0 if litigation_count_row else False
    except Exception:
        pass

    if new_watchlist in ['Rosa', 'Vermelho'] and old_watchlist not in ['Rosa', 'Vermelho'] and not has_litigation_comments:
        has_litigation_rule = any(r.get('name') == 'Revisão Advogados de Litígio' for r in data.get('taskRules', []))
        
        cursor.execute("SELECT 1 FROM cri_cra_dev.crm.task_rules WHERE operation_id = ? AND name = 'Revisão Advogados de Litígio'", (op_id,))
        db_has_rule = cursor.fetchone()
        
        if not has_litigation_rule and not db_has_rule:
            if 'taskRules' not in data:
                data['taskRules'] = []
            data['taskRules'].append({
                'name': 'Revisão Advogados de Litígio',
                'frequency': 'Sem Prazo',
                'description': 'Passar a documentação da operação com os advogados de litígio devido a mudança do farol para Rosa ou Vermelho.',
                'priority': 'Alta'
            })

    cursor.execute("SELECT id, name FROM cri_cra_dev.crm.task_rules WHERE operation_id = ?", (op_id,))
    # Normaliza chaves para string — mesmo padrão dos eventos
    db_rules_map = {str(row.id): row.name for row in cursor.fetchall()}
    client_rule_ids = {str(r['id']) for r in data.get('taskRules', []) if 'id' in r and r['id'] is not None}

    for rule_id_to_delete in set(db_rules_map.keys()) - client_rule_ids:
        cursor.execute("DELETE FROM cri_cra_dev.crm.task_rules WHERE id = ?", (int(rule_id_to_delete),))
        log_action(cursor, data.get('responsibleAnalyst', user_name), 'DELETE', 'TaskRule', rule_id_to_delete, f"Regra '{db_rules_map[rule_id_to_delete]}' deletada.")

    for rule in data.get('taskRules', []):
        rule_id = rule.get('id')
        rule_id_str = str(rule_id) if rule_id is not None else None
        assignees_json = json.dumps(rule.get('assignees', [])) if rule.get('assignees') else None
        if rule_id_str and rule_id_str in db_rules_map:
            cursor.execute("UPDATE cri_cra_dev.crm.task_rules SET name=?, frequency=?, start_date=?, end_date=?, description=?, priority=?, assignees=? WHERE id=?", (rule.get('name'), rule.get('frequency'), rule.get('startDate'), rule.get('endDate'), rule.get('description'), rule.get('priority') or 'Média', assignees_json, int(rule_id_str)))
            _sync_checklist_items(cursor, int(rule_id_str), rule.get('checklistItems', []))
        else:
            new_rule_id = get_next_unique_id(cursor, 'task_rules')
            cursor.execute("INSERT INTO cri_cra_dev.crm.task_rules (id, operation_id, name, frequency, start_date, end_date, description, priority, assignees) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (new_rule_id, op_id, rule.get('name'), rule.get('frequency'), rule.get('startDate'), rule.get('endDate'), rule.get('description'), rule.get('priority') or 'Média', assignees_json))
            log_action(cursor, data.get('responsibleAnalyst', user_name), 'CREATE', 'TaskRule', 'new', f"Regra '{rule.get('name')}' adicionada.")
            _sync_checklist_items(cursor, new_rule_id, rule.get('checklistItems', []))
    
    if 'taskExceptions' in data:
        cursor.execute("DELETE FROM cri_cra_dev.crm.task_exceptions WHERE operation_id = ?", (op_id,))
        for task_id in data['taskExceptions']:
            cursor.execute("INSERT INTO cri_cra_dev.crm.task_exceptions (operation_id, task_id, deleted_at, deleted_by) VALUES (?, ?, ?, ?)", (op_id, task_id, datetime.now(), data.get('responsibleAnalyst', user_name)))
            
    if 'contacts' in data:
        cursor.execute("DELETE FROM cri_cra_dev.crm.operation_contacts WHERE operation_id = ?", (op_id,))
        for contact in data['contacts']:
            if contact.get('name'):
                cursor.execute("INSERT INTO cri_cra_dev.crm.operation_contacts (id, operation_id, name, email, phone, role) VALUES (?, ?, ?, ?, ?, ?)",
                               (get_next_unique_id(cursor, 'operation_contacts'), op_id, contact.get('name'), contact.get('email'), contact.get('phone'), contact.get('role')))

    details = generate_diff_details(old_op_db, data, {'name': 'Nome', 'ratingOperation': 'Rating Op.', 'ratingGroup': 'Rating Grupo', 'watchlist': 'Watchlist'})
    if details: log_action(cursor, data.get('responsibleAnalyst', user_name), 'UPDATE', 'Operation', op_id, details)


def create_operation(cursor, data: dict, user_name: str = 'System') -> dict:
    """Create a new operation with initial rules and rating history. Returns DTO."""
    politica_freq = RATING_TO_POLITICA_FREQUENCY.get(data['ratingGroup'], 'Anual')
    gerencial_freq = data['reviewFrequency']

    if FREQUENCY_VALUE_MAP.get(gerencial_freq, 999) > FREQUENCY_VALUE_MAP.get(politica_freq, 0):
        gerencial_freq = politica_freq
    
    data['reviewFrequency'] = gerencial_freq

    dm = data.get('defaultMonitoring', {})
    est_date = parse_iso_date(data.get('estimatedDate'))
    maturity_date = parse_iso_date(data.get('maturityDate'))
    structuring_op_id = data.get('structuringOperationId')
    
    if data.get('economicGroupId') == 'new' and data.get('newEGName'):
        new_eg_id = get_next_unique_id(cursor, 'economic_groups')
        cursor.execute("INSERT INTO cri_cra_dev.crm.economic_groups (id, name, master_group_id, rating) VALUES (?, ?, ?, ?)",
                       (new_eg_id, data.get('newEGName'), data.get('masterGroupId'), data.get('ratingGroup')))
        data['economicGroupId'] = new_eg_id
    elif data.get('economicGroupId') == '':
        data['economicGroupId'] = None
    
    if structuring_op_id:
        cursor.execute("""
            UPDATE cri_cra_dev.crm.operations SET 
            name=?, area=?, operation_type=?, maturity_date=?, responsible_analyst=?, structuring_analyst=?, review_frequency=?, 
            call_frequency=?, df_frequency=?, segmento=?, rating_operation=?, watchlist=?, 
            ltv=?, dscr=?, monitoring_news=?, monitoring_fii_report=?, monitoring_operational_info=?, 
            monitoring_receivables_portfolio=?, monitoring_construction_report=?, monitoring_commercial_info=?, 
            monitoring_spe_dfs=?, estimated_date=?, status=?, description=?, master_group_id=?, economic_group_id=?,
            is_structuring=FALSE, is_active=TRUE
            WHERE id=?
        """, (
            data['name'], data['area'], data['operationType'], maturity_date, data['responsibleAnalyst'], data.get('structuringAnalyst'),
            data['reviewFrequency'], data['callFrequency'], data['dfFrequency'], data['segmento'], 
            data['ratingOperation'], data['watchlist'], 
            data.get('covenants', {}).get('ltv'), data.get('covenants', {}).get('dscr'), 
            dm.get('news'), dm.get('fiiReport'), dm.get('operationalInfo'), 
            dm.get('receivablesPortfolio'), dm.get('monthlyConstructionReport'), 
            dm.get('monthlyCommercialInfo'), dm.get('speDfs'), est_date, 
            data.get('status', 'Ativa'), data.get('description'), data.get('masterGroupId'), data.get('economicGroupId'),
            structuring_op_id
        ))
        new_op_id = structuring_op_id
    else:
        new_op_id = get_next_unique_id(cursor, 'operations')
        cursor.execute( "INSERT INTO cri_cra_dev.crm.operations (id, name, area, operation_type, maturity_date, responsible_analyst, structuring_analyst, review_frequency, call_frequency, df_frequency, segmento, rating_operation, watchlist, ltv, dscr, monitoring_news, monitoring_fii_report, monitoring_operational_info, monitoring_receivables_portfolio, monitoring_construction_report, monitoring_commercial_info, monitoring_spe_dfs, estimated_date, status, description, master_group_id, economic_group_id, is_structuring, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, TRUE)", (new_op_id, data['name'], data['area'], data['operationType'], maturity_date, data['responsibleAnalyst'], data.get('structuringAnalyst'), data['reviewFrequency'], data['callFrequency'], data['dfFrequency'], data['segmento'], data['ratingOperation'], data['watchlist'], data.get('covenants', {}).get('ltv'), data.get('covenants', {}).get('dscr'), dm.get('news'), dm.get('fiiReport'), dm.get('operationalInfo'), dm.get('receivablesPortfolio'), dm.get('monthlyConstructionReport'), dm.get('monthlyCommercialInfo'), dm.get('speDfs'), est_date, data.get('status', 'Ativa'), data.get('description'), data.get('masterGroupId'), data.get('economicGroupId')) )
    
    for project in data.get('projects', []):
        project_name = project.get('name')
        if project_name:
            cursor.execute("SELECT id FROM cri_cra_dev.crm.projects WHERE name = ?", (project_name,))
            proj_row = cursor.fetchone()
            if proj_row:
                project_id = proj_row.id
            else:
                project_id = get_next_unique_id(cursor, 'projects')
                cursor.execute("INSERT INTO cri_cra_dev.crm.projects (id, name) VALUES (?, ?)", (project_id, project_name))
            cursor.execute("INSERT INTO cri_cra_dev.crm.operation_projects (operation_id, project_id) VALUES (?, ?)", (new_op_id, project_id))
    
    for guarantee in data.get('guarantees', []):
        guarantee_name = guarantee.get('name')
        if guarantee_name:
            cursor.execute("SELECT id FROM cri_cra_dev.crm.guarantees WHERE name = ?", (guarantee_name,))
            guar_row = cursor.fetchone()
            if guar_row:
                guarantee_id = guar_row.id
            else:
                guarantee_id = get_next_unique_id(cursor, 'guarantees')
                cursor.execute("INSERT INTO cri_cra_dev.crm.guarantees (id, name) VALUES (?, ?)", (guarantee_id, guarantee_name))
            cursor.execute("INSERT INTO cri_cra_dev.crm.operation_guarantees (operation_id, guarantee_id) VALUES (?, ?)", (new_op_id, guarantee_id))

    now = datetime.now()
    end_date = maturity_date
    rules_to_add = [ {'name': 'Revisão Gerencial', 'frequency': gerencial_freq, 'desc': 'Revisão periódica gerencial.', 'priority': 'Alta'}, {'name': 'Revisão Política', 'frequency': politica_freq, 'desc': 'Revisão de política de crédito anual.', 'priority': 'Alta'}, {'name': 'Call de Acompanhamento', 'frequency': data['callFrequency'], 'desc': 'Call de acompanhamento.', 'priority': 'Média'}, {'name': 'Análise de DFs & Dívida', 'frequency': data['dfFrequency'], 'desc': 'Análise dos DFs.', 'priority': 'Média'} ]
    if dm.get('news'): rules_to_add.append({'name': 'Monitorar Notícias', 'frequency': 'Semanal', 'desc': 'Acompanhar notícias.', 'priority': 'Baixa'})
    for rule in rules_to_add:
        rule_id = get_next_unique_id(cursor, 'task_rules')
        cursor.execute("INSERT INTO cri_cra_dev.crm.task_rules (id, operation_id, name, frequency, start_date, end_date, description, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (rule_id, new_op_id, rule['name'], rule['frequency'], now, end_date, rule['desc'], rule.get('priority') or 'Média'))
    
    rh_id = get_next_unique_id(cursor, 'rating_history')
    cursor.execute("INSERT INTO cri_cra_dev.crm.rating_history (id, operation_id, date, rating_operation, rating_group, rating_master_group, watchlist, sentiment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (rh_id, new_op_id, now, data['ratingOperation'], data['ratingGroup'], data.get('ratingMasterGroup'), data['watchlist'], 'Neutro'))
    
    if data.get('notes'):
        try:
            cursor.execute(
                "INSERT INTO cri_cra_dev.crm.operation_review_notes (operation_id, notes, updated_at, updated_by) VALUES (?, ?, ?, ?)",
                (new_op_id, data['notes'], datetime.now(), data.get('responsibleAnalyst', user_name))
            )
        except Exception as e:
            if "TABLE_OR_VIEW_NOT_FOUND" not in str(e) and "no such table" not in str(e).lower(): raise e

    log_action(cursor, data.get('responsibleAnalyst', user_name), 'CREATE', 'Operation', new_op_id, f"Operação '{data['name']}' criada na área '{data['area']}'.")
    
    # Return the full loaded operation
    return load_operations(cursor, op_id=new_op_id)
