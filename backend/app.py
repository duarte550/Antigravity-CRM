
import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import db
from task_engine import generate_tasks_for_operation
## import update_db  # Schema migration runs at BUILD time only (see vercel.json)
from datetime import datetime, date, timedelta
from utils import safe_isoformat, parse_iso_date, get_next_unique_id
from operations import load_operations, save_operation, create_operation
from collections import defaultdict
import json
import base64
import logging

from master_groups import master_groups_bp
from economic_groups import economic_groups_bp
from fund_simulator import fund_simulator_bp
from comite import comite_bp
from auth import check_global_auth

# Configurações básicas de logging
# Serve static files from 'dist' folder in production
app = Flask(__name__, static_folder='../dist', static_url_path='')

@app.before_request
def enforce_global_api_auth():
    return check_global_auth()

app.register_blueprint(master_groups_bp)
app.register_blueprint(economic_groups_bp)
app.register_blueprint(fund_simulator_bp)
app.register_blueprint(comite_bp)
logging.basicConfig(level=logging.INFO)
##############################################################################################################################
# Schema migration now runs at BUILD time via vercel.json buildCommand.
# Do NOT re-enable a before_request hook here — on Vercel serverless every cold
# start resets globals, so update_schema() would run (30-60 s of Databricks DDL)
# on almost every request, causing cascading timeouts.
##############################################################################################################################
# Configuração de CORS dinâmica permitindo requisições na Edge API
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}})

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if origin:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return response

@app.route('/', defaults={'path': ''}, methods=['OPTIONS'])
@app.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    return '', 200


# Regras de negócio centralizadas
RATING_TO_POLITICA_FREQUENCY = {
    # Anual (Melhor que B1)
    'A4': 'Anual', 'Baa1': 'Anual', 'Baa3': 'Anual', 'Baa4': 'Anual',
    'Ba1': 'Anual', 'Ba4': 'Anual', 'Ba5': 'Anual', 'Ba6': 'Anual',
    # Semestral (B1 ou pior)
    'B1': 'Semestral', 'B2': 'Semestral', 'B3': 'Semestral', 'B4': 'Semestral',
    'C1': 'Semestral', 'C2': 'Semestral', 'C3': 'Semestral',
}

# Usado para comparar a "velocidade" das frequências. Menor número = mais frequente.
FREQUENCY_VALUE_MAP = {
    'Diário': 1, 'Semanal': 7, 'Quinzenal': 15, 'Mensal': 30,
    'Trimestral': 90, 'Semestral': 180, 'Anual': 365
}

def decode_if_waf_encoded(data: dict, *fields: str) -> dict:
    """Decodifica campos HTML que foram codificados em Base64 pelo frontend
    para contornar o Azure WAF (que bloqueia HTML no body com 403
    mediatypeblockedupload). Retorna um novo dict com os campos decodificados.

    Uso: data = decode_if_waf_encoded(data, 'notes', 'description')
    """
    if not data.get('__html_encoded'):
        return data
    result = dict(data)
    for field in fields:
        v = result.get(field)
        if v:
            try:
                result[field] = base64.b64decode(v).decode('utf-8')
            except Exception:
                pass  # Mantém o valor original em caso de falha de decodificação
    return result


def format_row(row, cursor):
    """ Converte uma linha do banco de dados em um dicionário. """
    return {desc[0]: value for desc, value in zip(cursor.description, row)}

def log_action(cursor, user_name, action, entity_type, entity_id, details=""):
    """Grava uma ação no log de auditoria."""
    from utils import get_next_unique_id
    new_audit_id = get_next_unique_id(cursor, 'audit_logs')
    cursor.execute(
        """
        INSERT INTO cri_cra_dev.crm.audit_logs (id, timestamp, user_name, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (new_audit_id, datetime.now(), user_name, action, entity_type, str(entity_id), details)
    )

def generate_diff_details(old_data: dict, new_data: dict, fields_to_compare: dict) -> str:
    """ Gera uma string de detalhes comparando dados antigos e novos. """
    details: list[str] = []
    for field, field_name in fields_to_compare.items():
        # Handle snake_case for old_data from DB and camelCase for new_data from client
        old_field_key = field.replace('ratingGroup', 'rating_group').replace('ratingOperation', 'rating_operation')
        old_value = old_data.get(old_field_key)
        new_value = new_data.get(field)
        
        if old_value != new_value:
            details.append(f"Alterou '{field_name}' de '{old_value}' para '{new_value}'")
    return "; ".join(details)



# ================== Rotas da API ==================
# ================== Auth / RBAC Endpoints ==================
@app.route('/api/auth/me', methods=['GET'])
def get_current_user_roles():
    """Retorna os papéis do usuário logado baseando-se no contexto injetado pelo before_request."""
    import flask
    user_roles = getattr(flask.g, 'user_roles', ['comum'])
    user_email = getattr(flask.g, 'user_email', 'unknown')
    return jsonify({
        'email': user_email,
        'roles': user_roles
    })

@app.route('/api/user-roles', methods=['GET', 'POST', 'PUT'])
def manage_user_roles():
    """Gerencia as permissões dos usuários via banco de dados. Apenas admins."""
    import flask
    user_roles = getattr(flask.g, 'user_roles', [])
    if 'administrador' not in user_roles:
        return jsonify({'error': 'Forbidden: Admin access required'}), 403

    conn = db.get_db_connection()
    try:
        with conn.cursor() as cursor:
            if request.method == 'GET':
                cursor.execute("SELECT email, roles, updated_at FROM cri_cra_dev.crm.user_roles ORDER BY email")
                users = []
                for row in cursor.fetchall():
                    users.append({
                        "email": row.email,
                        "roles": json.loads(row.roles),
                        "updated_at": safe_isoformat(getattr(row, 'updated_at', None))
                    })
                return jsonify(users)

            elif request.method in ['POST', 'PUT']:
                data = request.json
                email = data.get('email', '').strip().lower()
                roles = data.get('roles', ['comum'])
                
                if not email:
                    return jsonify({'error': 'Email is required'}), 400

                now = datetime.now()
                # Upsert using MERGE
                cursor.execute("""
                    MERGE INTO cri_cra_dev.crm.user_roles AS target
                    USING (SELECT ? AS email, ? AS roles, ? AS updated_at) AS source
                    ON target.email = source.email
                    WHEN MATCHED THEN UPDATE SET roles = source.roles, updated_at = source.updated_at
                    WHEN NOT MATCHED THEN INSERT (email, roles, created_at, updated_at) VALUES (source.email, source.roles, source.updated_at, source.updated_at)
                """, (email, json.dumps(roles), now))
                
                admin_email = getattr(flask.g, 'user_email', 'System')
                log_action(cursor, admin_email, 'UPDATE_ROLES', 'UserRole', email, f"Roles de {email} atualizados para {roles}.")
                
                conn.commit()
                return jsonify({'status': 'success', 'email': email, 'roles': roles})
    except Exception as e:
        app.logger.error(f"Error managing user roles: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/analysts', methods=['GET'])
def get_analysts():
    conn = db.get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT DISTINCT responsible_analyst AS analyst FROM cri_cra_dev.crm.operations WHERE responsible_analyst IS NOT NULL AND TRIM(responsible_analyst) != ''
                UNION
                SELECT DISTINCT structuring_analyst AS analyst FROM cri_cra_dev.crm.operations WHERE structuring_analyst IS NOT NULL AND TRIM(structuring_analyst) != ''
                UNION
                SELECT DISTINCT registered_by AS analyst FROM cri_cra_dev.crm.events WHERE registered_by IS NOT NULL AND TRIM(registered_by) != ''
                ORDER BY analyst
            """)
            analysts = [row.analyst for row in cursor.fetchall() if row.analyst.strip() != '']
        return jsonify(analysts)
    except Exception as e:
        app.logger.error(f"Error in /api/analysts: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/operations', methods=['GET', 'POST'])
def manage_operations_collection():
    conn = db.get_db_connection()
    if request.method == 'GET':
        try:
            with conn.cursor() as cursor:
                return jsonify(load_operations(cursor))
        except Exception as e:
            app.logger.error(f"Exception on /api/operations [GET]: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500
        finally: 
            if conn: conn.close()
    
    elif request.method == 'POST':
        try:
            data = request.json
            with conn.cursor() as cursor:
                new_op_data = create_operation(cursor, data, user_name=data.get('responsibleAnalyst', 'System'))
            conn.commit()
            return jsonify(new_op_data), 201
        except Exception as e:
            app.logger.error(f"Error in POST /api/operations: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500
        finally: 
            if conn: conn.close()

@app.route('/api/operations/sync-all', methods=['POST'])
def sync_all_operations():
    """
    Endpoint de emergência chamado pelo Graceful Shutdown (visibilitychange/beforeunload).
    O frontend envia via sendBeacon com Blob application/json, mas como fallback
    defensivo, forçamos o parse do body mesmo que o Content-Type esteja incorreto.
    """
    conn = db.get_db_connection()
    try:
        # Tentativa primária: parse normal com tolerância a Content-Type errado
        data = request.get_json(force=True, silent=True)
        
        # Fallback: se get_json retornou None, tenta manualmente via request.data
        if data is None:
            raw = request.data
            if raw:
                try:
                    data = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    app.logger.warning("sync-all: impossível decodificar body como JSON.")
                    return jsonify({"error": "Invalid JSON payload"}), 400
            else:
                return jsonify({"error": "Empty request body"}), 400

        if not isinstance(data, list):
            return jsonify({"error": "Expected a list of operations"}), 400
        
        with conn.cursor() as cursor:
            for op in data:
                op_id = op.get('id')
                if op_id:
                    cursor.execute(
                        "INSERT INTO cri_cra_dev.crm.sync_queue (operation_id, data, created_at, processed) VALUES (?, ?, ?, ?)",
                        (op_id, json.dumps(op), datetime.now(), False)
                    )
        conn.commit()
        return jsonify({"status": "queued", "count": len(data)}), 200
    except Exception as e:
        app.logger.error(f"Error in /api/operations/sync-all: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()




@app.route('/api/operations/<int:op_id>/patch', methods=['POST'])
def patch_operation(op_id):
    """
    Lightweight field-level PATCH for a single operation.
    Accepts a JSON body with only the fields to update (camelCase).
    Does NOT run the full save_operation pipeline — no event/task/project syncing.
    Ideal for quick UI changes like watchlist, status, rating fields, etc.
    """
    conn = db.get_db_connection()
    FIELD_MAP = {
        'watchlist': 'watchlist',
        'status': 'status',
        'ratingOperation': 'rating_operation',
        'responsibleAnalyst': 'responsible_analyst',
        'structuringAnalyst': 'structuring_analyst',
        'description': 'description',
        'area': 'area',
        'name': 'name',
        'segmento': 'segmento',
        'maturityDate': 'maturity_date',
        'estimatedDate': 'estimated_date',
        'wasStructured': 'was_structured',
        'movedToLegacyDate': 'moved_to_legacy_date',
    }
    try:
        data = request.get_json(force=True, silent=True) or {}
        if not data:
            return jsonify({'error': 'Empty patch body'}), 400

        updates = {}
        for camel_key, db_col in FIELD_MAP.items():
            if camel_key in data:
                val = data[camel_key]
                # Parse date strings for date columns
                if camel_key in ('maturityDate', 'estimatedDate', 'movedToLegacyDate'):
                    val = parse_iso_date(val) if val else None
                updates[db_col] = val

        if not updates:
            return jsonify({'status': 'noop', 'message': 'No patchable fields found'}), 200

        set_clauses = ', '.join(f'{col} = ?' for col in updates.keys())
        values = list(updates.values()) + [op_id]

        with conn.cursor() as cursor:
            cursor.execute(
                f'UPDATE cri_cra_dev.crm.operations SET {set_clauses} WHERE id = ?',
                values
            )
            import flask
            user_name = data.get('responsibleAnalyst') or getattr(flask.g, 'user_email', 'System')
            details = '; '.join(f"{k}={v}" for k, v in updates.items())
            log_action(cursor, user_name, 'PATCH', 'Operation', op_id, details[:500])
        conn.commit()
        return jsonify({'status': 'ok', 'updated': list(updates.keys())}), 200
    except Exception as e:
        app.logger.error(f'Error in PATCH /api/operations/{op_id}: {e}', exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()


@app.route('/api/operations/<int:op_id>', methods=['GET', 'PUT', 'DELETE'])
def manage_operation(op_id):
    conn = db.get_db_connection()
    try:
        if request.method == 'GET':
            with conn.cursor() as cursor:
                operation = load_operations(cursor, op_id=op_id)
                if not operation:
                    return jsonify({"error": "Operação não encontrada"}), 404
                return jsonify(operation)
        
        elif request.method == 'PUT':
            data = request.json
            with conn.cursor() as cursor:
                save_operation(cursor, op_id, data, user_name=data.get('responsibleAnalyst', 'System'))
                conn.commit()
                new_operation_full = load_operations(cursor, op_id=op_id)
            return jsonify(new_operation_full), 200
            
        elif request.method == 'DELETE':
            with conn.cursor() as cursor:
                cursor.execute("SELECT name, responsible_analyst FROM cri_cra_dev.crm.operations WHERE id = ?", (op_id,))
                op_info = cursor.fetchone()
                cursor.execute("DELETE FROM cri_cra_dev.crm.operation_projects WHERE operation_id = ?", (op_id,))
                cursor.execute("DELETE FROM cri_cra_dev.crm.operation_guarantees WHERE operation_id = ?", (op_id,))
                cursor.execute("DELETE FROM cri_cra_dev.crm.rating_history WHERE operation_id = ?", (op_id,))
                cursor.execute("DELETE FROM cri_cra_dev.crm.events WHERE operation_id = ?", (op_id,))
                cursor.execute("DELETE FROM cri_cra_dev.crm.task_rules WHERE operation_id = ?", (op_id,))
                cursor.execute("DELETE FROM cri_cra_dev.crm.task_exceptions WHERE operation_id = ?", (op_id,))
                cursor.execute("DELETE FROM cri_cra_dev.crm.operations WHERE id = ?", (op_id,))
                log_action(cursor, op_info.responsible_analyst if op_info else 'System', 'DELETE', 'Operation', op_id, f"Operação '{op_info.name if op_info else 'ID: ' + str(op_id)}' deletada.")
            conn.commit()
            return '', 204
    except Exception as e:
        app.logger.error(f"Error in /api/operations/{op_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()
@app.route('/api/operations/<int:op_id>/watchlist-update', methods=['POST'])
def watchlist_update_operation(op_id):
    """
    Dedicated endpoint for watchlist status changes from WatchlistPage.
    Executes only 3-4 SQL statements instead of the 20+ in save_operation:
      1. UPDATE operations SET watchlist, rating_operation, rating_group, rating_master_group
      2. INSERT INTO events
      3. INSERT INTO rating_history
      4. INSERT INTO audit_logs
    """
    conn = db.get_db_connection()
    try:
        data = request.get_json(force=True, silent=True) or {}
        watchlist     = data.get('watchlist')
        rating_op     = data.get('ratingOperation')
        rating_group  = data.get('ratingGroup')
        rating_master = data.get('ratingMasterGroup')
        sentiment     = data.get('sentiment', 'Neutro')
        user_name     = data.get('responsibleAnalyst', 'System')
        event         = data.get('event', {})

        if not watchlist:
            return jsonify({'error': 'watchlist field is required'}), 400

        with conn.cursor() as cursor:
            # 1. Update the operation row (only the rating/watchlist fields)
            cursor.execute(
                """UPDATE cri_cra_dev.crm.operations
                   SET watchlist = ?, rating_operation = ?, responsible_analyst = ?
                   WHERE id = ?""",
                (watchlist, rating_op, user_name, op_id)
            )

            # 2. Insert the new event (if provided)
            new_event_id = None
            if event.get('title') or event.get('description'):
                new_event_id = get_next_unique_id(cursor, 'events')
                cursor.execute(
                    """INSERT INTO cri_cra_dev.crm.events
                       (id, operation_id, date, type, title, description, registered_by,
                        next_steps, completed_task_id, attention_points, our_attendees, operation_attendees)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        new_event_id, op_id,
                        event.get('date') or datetime.now().isoformat(),
                        event.get('type', 'Revisão Periódica'),
                        event.get('title', f'Atualização Watchlist → {watchlist}'),
                        event.get('description', ''),
                        user_name,
                        event.get('nextSteps'),
                        event.get('completedTaskId'),
                        event.get('attentionPoints'),
                        event.get('ourAttendees'),
                        event.get('operationAttendees'),
                    )
                )

            # 3. Insert the rating history entry
            rh_id = get_next_unique_id(cursor, 'rating_history')
            cursor.execute(
                """INSERT INTO cri_cra_dev.crm.rating_history
                   (id, operation_id, date, rating_operation, rating_group,
                    rating_master_group, watchlist, sentiment, event_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    rh_id, op_id,
                    event.get('date') or datetime.now().isoformat(),
                    rating_op, rating_group, rating_master,
                    watchlist, sentiment, new_event_id
                )
            )

            # 4. Audit log
            log_action(cursor, user_name, 'UPDATE', 'Operation', op_id,
                       f"Watchlist atualizado para '{watchlist}' (Rating Op: {rating_op}, Grupo: {rating_group})")

        conn.commit()
        return jsonify({
            'status': 'ok',
            'eventId': new_event_id,
            'ratingHistoryId': rh_id,
        }), 200
    except Exception as e:
        app.logger.error(f'Error in /api/operations/{op_id}/watchlist-update: {e}', exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()


@app.route('/api/operations/<int:op_id>/sync-events', methods=['POST'])
def sync_operation_events(op_id):
    """
    Endpoint dedicado para sincronizar APENAS os eventos de uma operação.
    Executa 2-3 queries no Databricks ao invés das 20+ do bulk-update,
    evitando timeout em eventos com texto longo (descrição, próximos passos, etc).
    """
    conn = db.get_db_connection()
    try:
        data = request.get_json(force=True, silent=True) or {}
        events_payload = data.get('events', [])
        user_name = data.get('responsibleAnalyst', 'System')
        html_encoded = data.get('__html_encoded', False)

        # Se o frontend codificou os campos HTML em Base64 para contornar o Azure WAF,
        # decodifica antes de processar. Campos não preenchidos retornam string vazia.
        def decode_html_field(value):
            if not html_encoded or not value:
                return value
            try:
                return base64.b64decode(value).decode('utf-8')
            except Exception:
                return value  # Fallback: usa o valor original se a decodificação falhar

        if html_encoded:
            decoded_events = []
            for ev in events_payload:
                decoded_events.append({
                    **ev,
                    'description':     decode_html_field(ev.get('description')),
                    'nextSteps':       decode_html_field(ev.get('nextSteps')),
                    'attentionPoints': decode_html_field(ev.get('attentionPoints')),
                    'ourAttendees':    decode_html_field(ev.get('ourAttendees')),
                    'operationAttendees': decode_html_field(ev.get('operationAttendees')),
                })
            events_payload = decoded_events

        with conn.cursor() as cursor:
            # 1. Carrega os eventos atuais do banco para esta operação
            cursor.execute(
                "SELECT * FROM cri_cra_dev.crm.events WHERE operation_id = ?", (op_id,)
            )
            db_events = {str(row.id): format_row(row, cursor) for row in cursor.fetchall()}
            db_event_ids = set(db_events.keys())  # set de strings → comparação segura

            created, updated, deleted = 0, 0, 0

            for event in events_payload:
                event_id_str = str(event.get('id', ''))
                is_existing = event_id_str.isdigit() and event_id_str in db_event_ids

                # Deleção explícita
                if event.get('deleted'):
                    if is_existing:
                        cursor.execute(
                            "DELETE FROM cri_cra_dev.crm.events WHERE id = ?",
                            (int(event_id_str),)
                        )
                        log_action(cursor, user_name, 'DELETE', 'Event', event_id_str,
                                   f"Evento '{event.get('title')}' deletado via sync-events.")
                        deleted += 1
                    continue

                if not is_existing:
                    # Novo evento
                    new_id = get_next_unique_id(cursor, 'events')
                    cursor.execute(
                        """INSERT INTO cri_cra_dev.crm.events
                           (id, operation_id, date, type, title, description, registered_by,
                            next_steps, completed_task_id, attention_points,
                            our_attendees, operation_attendees)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            new_id, op_id,
                            event.get('date'), event.get('type'), event.get('title'),
                            event.get('description'), event.get('registeredBy'),
                            event.get('nextSteps'), event.get('completedTaskId'),
                            event.get('attentionPoints'), event.get('ourAttendees'),
                            event.get('operationAttendees'),
                        )
                    )
                    log_action(cursor, event.get('registeredBy', user_name), 'CREATE', 'Event',
                               new_id, f"Evento '{event.get('title')}' criado via sync-events.")
                    created += 1
                else:
                    # Evento existente — atualiza apenas se mudou
                    old = db_events[event_id_str]  # chave normalizada como string
                    def norm(v): return str(v).strip() if v is not None else ""
                    def norm_date(v): return str(v)[:10] if v is not None else ""

                    changed = (
                        norm_date(event.get('date')) != norm_date(old.get('date')) or
                        norm(event.get('type'))        != norm(old.get('type')) or
                        norm(event.get('title'))       != norm(old.get('title')) or
                        norm(event.get('description')) != norm(old.get('description')) or
                        norm(event.get('nextSteps'))   != norm(old.get('next_steps')) or
                        norm(event.get('attentionPoints')) != norm(old.get('attention_points')) or
                        norm(event.get('ourAttendees'))    != norm(old.get('our_attendees')) or
                        norm(event.get('operationAttendees')) != norm(old.get('operation_attendees'))
                    )
                    if changed:
                        cursor.execute(
                            """UPDATE cri_cra_dev.crm.events
                               SET date=?, type=?, title=?, description=?, registered_by=?,
                                   next_steps=?, completed_task_id=?, attention_points=?,
                                   our_attendees=?, operation_attendees=?
                               WHERE id=?""",
                            (
                                event.get('date'), event.get('type'), event.get('title'),
                                event.get('description'), event.get('registeredBy'),
                                event.get('nextSteps'), event.get('completedTaskId'),
                                event.get('attentionPoints'), event.get('ourAttendees'),
                                event.get('operationAttendees'), int(event_id_str),
                            )
                        )
                        log_action(cursor, event.get('registeredBy', user_name), 'UPDATE', 'Event',
                                   event_id_str, f"Evento '{event.get('title')}' atualizado via sync-events.")
                        updated += 1

        conn.commit()
        app.logger.info(f"[sync-events] op {op_id}: +{created} criados, ~{updated} atualizados, -{deleted} deletados.")
        return jsonify({'status': 'ok', 'created': created, 'updated': updated, 'deleted': deleted}), 200

    except Exception as e:
        app.logger.error(f"Error in sync-events for op {op_id}: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()


@app.route('/api/operations/bulk-update', methods=['POST'])
def bulk_update_operations():
    conn = db.get_db_connection()
    try:
        # Use force=True to tolerate Content-Type variations (e.g. from Azure WAF proxy)
        data = request.get_json(force=True, silent=True)
        if data is None:
            raw = request.data
            if raw:
                try:
                    data = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    return jsonify({"error": "Invalid JSON payload"}), 400
            else:
                return jsonify({"error": "Empty request body"}), 400
        operations = data.get('operations', [])
        results = {'success': [], 'failed': []}
        
        with conn.cursor() as cursor:
            for op_data in operations:
                try:
                    save_operation(cursor, op_data['id'], op_data, user_name=op_data.get('responsibleAnalyst', 'System'))
                    results['success'].append(op_data['id'])
                except Exception as e:
                    app.logger.error(f"Error updating operation {op_data.get('id')}: {e}", exc_info=True)
                    results['failed'].append({'id': op_data.get('id'), 'error': str(e)})
            
            conn.commit()
        return jsonify(results), 200
    except Exception as e:
        app.logger.error(f"Error in bulk update: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/operations/sync-rules', methods=['POST'])
def sync_operation_rules():
    """
    Endpoint de manutenção para garantir que operações inseridas manualmente
    tenham suas regras de tarefas e histórico inicial criados.
    Também corrige datas de início de regras baseadas no histórico existente.
    """
    conn = db.get_db_connection()
    try:
        with conn.cursor() as cursor:
            fixed_count = 0
            
            # 3. Busca operações que não possuem NENHUMA regra de tarefa (Criação Inicial)
            cursor.execute("""
                SELECT o.id, o.name, COALESCE(eg.rating, m.rating) as rating_group, o.review_frequency, o.call_frequency, o.df_frequency, 
                       o.maturity_date, o.monitoring_news, o.rating_operation, o.watchlist, o.responsible_analyst
                FROM cri_cra_dev.crm.operations o
                LEFT JOIN cri_cra_dev.crm.economic_groups eg ON o.economic_group_id = eg.id
                LEFT JOIN cri_cra_dev.crm.master_groups m ON o.master_group_id = m.id
                LEFT JOIN cri_cra_dev.crm.task_rules tr ON o.id = tr.operation_id
                WHERE tr.operation_id IS NULL
                LIMIT 10
            """)
            ops_to_create_rules = [format_row(row, cursor) for row in cursor.fetchall()]
            
            for op in ops_to_create_rules:
                op_id = op['id']
                politica_freq = RATING_TO_POLITICA_FREQUENCY.get(op['rating_group'], 'Anual')
                gerencial_freq = op['review_frequency']
                
                if FREQUENCY_VALUE_MAP.get(gerencial_freq, 999) > FREQUENCY_VALUE_MAP.get(politica_freq, 0):
                    gerencial_freq = politica_freq
                
                # Tenta buscar histórico existente para usar como data base
                cursor.execute("SELECT date FROM cri_cra_dev.crm.rating_history WHERE operation_id = ? ORDER BY date DESC LIMIT 1", (op_id,))
                last_history = cursor.fetchone()
                start_date_base = last_history.date if last_history else datetime.now()
                
                end_date = op['maturity_date']
                
                rules = [
                    ('Revisão Gerencial', gerencial_freq, 'Revisão periódica gerencial.', 'Alta'),
                    ('Revisão Política', politica_freq, 'Revisão de política de crédito anual.', 'Alta'),
                    ('Call de Acompanhamento', op['call_frequency'], 'Call de acompanhamento.', 'Média'),
                    ('Análise de DFs & Dívida', op['df_frequency'], 'Análise dos DFs.', 'Média')
                ]
                
                if op.get('monitoring_news'):
                    rules.append(('Monitorar Notícias', 'Semanal', 'Acompanhar notícias.', 'Baixa'))
                
                for name, freq, desc, *rest in rules:
                    priority = rest[0] if rest else 'Média'
                    rule_id = get_next_unique_id(cursor, 'task_rules')
                    cursor.execute("""
                        INSERT INTO cri_cra_dev.crm.task_rules (id, operation_id, name, frequency, start_date, end_date, description, priority)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (rule_id, op_id, name, freq, start_date_base, end_date, desc, priority))
                
                # Se não tinha histórico e usamos datetime.now(), cria o histórico inicial
                if not last_history:
                    rh_id = get_next_unique_id(cursor, 'rating_history')
                    cursor.execute("""
                        INSERT INTO cri_cra_dev.crm.rating_history (id, operation_id, date, rating_operation, rating_group, watchlist, sentiment, event_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
                    """, (rh_id, op_id, start_date_base, op['rating_operation'], op['rating_group'], op['watchlist'], 'Neutro'))
                
                log_action(cursor, 'System', 'UPDATE', 'Operation', op_id, "Regras criadas via sync.")
                fixed_count += 1

            # 2. Corrige datas de regras existentes que estão desincronizadas com o histórico
            # Busca regras onde o start_date é diferente da data do último histórico de rating
            cursor.execute("""
                SELECT tr.id, tr.operation_id, tr.name, tr.start_date, MAX(rh.date) as last_history_date
                FROM cri_cra_dev.crm.task_rules tr
                JOIN cri_cra_dev.crm.rating_history rh ON tr.operation_id = rh.operation_id
                WHERE tr.name IN ('Revisão Gerencial', 'Revisão Política')
                GROUP BY tr.id, tr.operation_id, tr.name, tr.start_date
                HAVING MAX(rh.date) <> tr.start_date
                LIMIT 50
            """)
            rules_to_fix = [format_row(row, cursor) for row in cursor.fetchall()]
            
            for rule in rules_to_fix:
                # Atualiza start_date para a data do último histórico
                new_start_date = rule['last_history_date']
                cursor.execute("UPDATE cri_cra_dev.crm.task_rules SET start_date = ? WHERE id = ?", (new_start_date, rule['id']))
                log_action(cursor, 'System', 'UPDATE', 'TaskRule', rule['id'], f"Data base da regra '{rule['name']}' corrigida para {new_start_date} (baseado no histórico).")
                fixed_count += 1
                
            conn.commit()
            return jsonify({"status": "success", "fixed_count": fixed_count, "message": f"{fixed_count} itens processados (criação ou correção)."})
    except Exception as e:
        app.logger.error(f"Error syncing operation rules: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/tasks/delete', methods=['POST'])
def delete_task():
    conn = db.get_db_connection()
    try:
        data = request.json
        with conn.cursor() as cursor:
            cursor.execute("INSERT INTO cri_cra_dev.crm.task_exceptions (task_id, operation_id, deleted_at, deleted_by) VALUES (?, ?, ?, ?)", (data['taskId'], data['operationId'], datetime.now(), data.get('responsibleAnalyst')))
            log_action(cursor, data.get('responsibleAnalyst'), 'DELETE', 'Task', data['taskId'], f"Tarefa deletada para a operação ID {data['operationId']}.")
        conn.commit()
        with conn.cursor() as cursor:
            updated_op = load_operations(cursor, op_id=data['operationId'])
        return jsonify(updated_op)
    except Exception as e:
        app.logger.error(f"Error deleting task: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()
        
@app.route('/api/tasks/edit', methods=['PUT'])
def edit_task():
    conn = db.get_db_connection()
    try:
        data = request.json
        updates = data['updates']
        with conn.cursor() as cursor:
            cursor.execute("INSERT INTO cri_cra_dev.crm.task_exceptions (task_id, operation_id, deleted_at, deleted_by) VALUES (?, ?, ?, ?)", (data['originalTaskId'], data['operationId'], datetime.now(), data.get('responsibleAnalyst')))
            due_date = updates['dueDate']
            new_rule_id = get_next_unique_id(cursor, 'task_rules')
            cursor.execute("INSERT INTO cri_cra_dev.crm.task_rules (id, operation_id, name, frequency, start_date, end_date, description, priority) VALUES (?, ?, ?, 'Pontual', ?, ?, ?, ?)", (new_rule_id, data['operationId'], updates['name'], due_date, due_date, f"Tarefa editada a partir de {data['originalTaskId']}", updates.get('priority') or 'Média'))
            log_action(cursor, data.get('responsibleAnalyst'), 'UPDATE', 'Task', data['originalTaskId'], f"Tarefa editada para ter nome '{updates['name']}' e vencimento em {due_date}.")
        conn.commit()
        with conn.cursor() as cursor:
            updated_op = load_operations(cursor, op_id=data['operationId'])
        return jsonify(updated_op)
    except Exception as e:
        app.logger.error(f"Error editing task: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/audit_logs', methods=['GET'])
def get_audit_logs():
    conn = db.get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM cri_cra_dev.crm.audit_logs ORDER BY timestamp DESC")
            logs = [format_row(row, cursor) for row in cursor.fetchall()]
            for log in logs:
                if log.get('timestamp'):
                    log['timestamp'] = safe_isoformat(log['timestamp'])
            return jsonify(logs)
    except Exception as e:
        app.logger.error(f"Error fetching audit logs: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/operation_review_notes', methods=['POST'])
def manage_operation_review_notes():
    conn = db.get_db_connection()
    try:
        data = request.get_json(force=True, silent=True) or {}
        data = decode_if_waf_encoded(data, 'notes')
        notes = data.get('notes', '')
        with conn.cursor() as cursor:
            # Using MERGE for "upsert" logic
            cursor.execute("""
                MERGE INTO cri_cra_dev.crm.operation_review_notes AS target
                USING (SELECT ? AS operation_id) AS source
                ON target.operation_id = source.operation_id
                WHEN MATCHED THEN
                    UPDATE SET notes = ?, updated_at = ?, updated_by = ?
                WHEN NOT MATCHED THEN
                    INSERT (operation_id, notes, updated_at, updated_by)
                    VALUES (?, ?, ?, ?)
            """, (
                data['operationId'],
                notes, datetime.now(), data.get('userName', 'System'), # for UPDATE
                data['operationId'], notes, datetime.now(), data.get('userName', 'System') # for INSERT
            ))
            log_action(cursor, data.get('userName', 'System'), 'UPDATE', 'OperationReviewNote', data['operationId'], f"Nota de revisão para operação {data['operationId']} atualizada.")
        conn.commit()
        return jsonify({'status': 'success', 'operationId': data['operationId'], 'notes': notes}), 200
    except Exception as e:
        app.logger.error(f"Error saving operation review note: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/change-requests', methods=['GET', 'POST'])
def manage_change_requests():
    conn = db.get_db_connection()
    try:
        if request.method == 'GET':
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM cri_cra_dev.crm.change_requests ORDER BY created_at DESC")
                requests = [format_row(row, cursor) for row in cursor.fetchall()]
                for req in requests:
                    req['createdAt'] = safe_isoformat(req.get('created_at'))
                    req['updatedAt'] = safe_isoformat(req.get('updated_at'))
                    del req['created_at']
                    del req['updated_at']
                return jsonify(requests)
        
        elif request.method == 'POST':
            data = request.get_json(force=True, silent=True) or {}
            data = decode_if_waf_encoded(data, 'description')
            now = datetime.now()
            with conn.cursor() as cursor:
                new_id = get_next_unique_id(cursor, 'change_requests')
                cursor.execute(
                    "INSERT INTO cri_cra_dev.crm.change_requests (id, title, description, requester, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (new_id, data['title'], data['description'], data['requester'], 'pending', now, now)
                )
            conn.commit()
            return jsonify({'id': new_id, 'status': 'pending', 'createdAt': safe_isoformat(now), 'updatedAt': safe_isoformat(now)}), 201
            
    except Exception as e:
        app.logger.error(f"Error in /api/change-requests: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/change-requests/<int:req_id>', methods=['PUT'])
def update_change_request(req_id):
    conn = db.get_db_connection()
    try:
        data = request.json
        now = datetime.now()
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE cri_cra_dev.crm.change_requests SET status = ?, updated_at = ? WHERE id = ?",
                (data['status'], now, req_id)
            )
        conn.commit()
        return jsonify({'status': 'success', 'updatedAt': safe_isoformat(now)})
    except Exception as e:
        app.logger.error(f"Error updating change request {req_id}: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/patch-notes', methods=['GET'])
def get_patch_notes():
    conn = db.get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM cri_cra_dev.crm.patch_notes ORDER BY date DESC")
            notes = [format_row(row, cursor) for row in cursor.fetchall()]
            for note in notes:
                note['date'] = safe_isoformat(note.get('date'))
                note['changes'] = json.loads(note['changes'])
            return jsonify(notes)
    except Exception as e:
        app.logger.error(f"Error fetching patch notes: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/analyst-notes/<string:analyst_name>', methods=['GET', 'POST'])
def manage_analyst_notes(analyst_name):
    conn = db.get_db_connection()
    try:
        with conn.cursor() as cursor:
            if request.method == 'GET':
                cursor.execute("SELECT notes FROM cri_cra_dev.crm.analyst_notes WHERE analyst_name = ?", (analyst_name,))
                row = cursor.fetchone()
                return jsonify({'notes': row[0] if row else ""})
            else:
                data = request.get_json(force=True, silent=True) or {}
                data = decode_if_waf_encoded(data, 'notes')
                notes = data.get('notes', '')
                cursor.execute(f"""
                    MERGE INTO cri_cra_dev.crm.analyst_notes AS target
                    USING (SELECT ? AS analyst_name, ? AS notes, ? AS updated_at) AS source
                    ON target.analyst_name = source.analyst_name
                    WHEN MATCHED THEN UPDATE SET notes = source.notes, updated_at = source.updated_at
                    WHEN NOT MATCHED THEN INSERT (analyst_name, notes, updated_at) VALUES (source.analyst_name, source.notes, source.updated_at)
                """, (analyst_name, notes, datetime.now()))
                conn.commit()
                return jsonify({'status': 'success'})
    except Exception as e:
        app.logger.error(f"Error managing analyst notes: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()


# --- Risk Management Endpoints ---
@app.route('/api/operations/<int:op_id>/risks', methods=['POST'])
def add_operation_risk(op_id):
    conn = db.get_db_connection()
    try:
        data = request.json
        now = datetime.now()
        with conn.cursor() as cursor:
            risk_id = get_next_unique_id(cursor, 'operation_risks')
            cursor.execute(
                "INSERT INTO cri_cra_dev.crm.operation_risks (id, operation_id, title, description, severity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (risk_id, op_id, data['title'], data.get('description'), data.get('severity', 'Média'), now, now)
            )
            log_action(cursor, data.get('userName', 'System'), 'CREATE', 'OperationRisk', op_id, f"Risco '{data['title']}' adicionado.")
        conn.commit()
        with conn.cursor() as cursor:
            updated_op = load_operations(cursor, op_id=op_id)
        return jsonify(updated_op), 201
    except Exception as e:
        app.logger.error(f"Error adding risk to operation {op_id}: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/operations/<int:op_id>/risks/<int:risk_id>', methods=['PUT', 'DELETE'])
def manage_operation_risk(op_id, risk_id):
    conn = db.get_db_connection()
    try:
        if request.method == 'PUT':
            data = request.json
            now = datetime.now()
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE cri_cra_dev.crm.operation_risks SET title = ?, description = ?, severity = ?, updated_at = ? WHERE id = ? AND operation_id = ?",
                    (data['title'], data.get('description'), data.get('severity', 'Média'), now, risk_id, op_id)
                )
                log_action(cursor, data.get('userName', 'System'), 'UPDATE', 'OperationRisk', risk_id, f"Risco '{data['title']}' atualizado.")
            conn.commit()
        elif request.method == 'DELETE':
            user_name = request.args.get('userName', 'System')
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM cri_cra_dev.crm.operation_risks WHERE id = ? AND operation_id = ?", (risk_id, op_id))
                log_action(cursor, user_name, 'DELETE', 'OperationRisk', risk_id, f"Risco ID {risk_id} deletado.")
            conn.commit()
        
        with conn.cursor() as cursor:
            updated_op = load_operations(cursor, op_id=op_id)
        return jsonify(updated_op)
    except Exception as e:
        app.logger.error(f"Error managing risk {risk_id} for operation {op_id}: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/operations/<int:op_id>/litigation-comments', methods=['POST'])
def add_operation_litigation_comment(op_id):
    conn = db.get_db_connection()
    try:
        data = request.get_json(force=True, silent=True) or {}
        data = decode_if_waf_encoded(data, 'description')
        now = datetime.now()
        with conn.cursor() as cursor:
            comment_id = get_next_unique_id(cursor, 'operation_litigation_comments')
            cursor.execute(
                "INSERT INTO cri_cra_dev.crm.operation_litigation_comments (id, operation_id, date, description, user_name) VALUES (?, ?, ?, ?, ?)",
                (comment_id, op_id, now, data['description'], data.get('userName', 'Analista'))
            )
            log_action(cursor, data.get('userName', 'System'), 'CREATE', 'LitigationComment', comment_id or 0, "Comentário de litígio adicionado.")
        conn.commit()
        
        with conn.cursor() as cursor:
            updated_op = load_operations(cursor, op_id=op_id)
        return jsonify(updated_op), 201
    except Exception as e:
        app.logger.error(f"Error adding litigation comment to operation {op_id}: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/operations/<int:op_id>/litigation-comments/<int:comment_id>', methods=['PUT', 'DELETE'])
def manage_operation_litigation_comment(op_id, comment_id):
    conn = db.get_db_connection()
    try:
        if request.method == 'PUT':
            data = request.get_json(force=True, silent=True) or {}
            data = decode_if_waf_encoded(data, 'description')
            now = datetime.now()
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE cri_cra_dev.crm.operation_litigation_comments SET description = ?, date = ?, user_name = ? WHERE id = ? AND operation_id = ?",
                    (data['description'], now, data.get('userName', 'Analista'), comment_id, op_id)
                )
                log_action(cursor, data.get('userName', 'System'), 'UPDATE', 'LitigationComment', comment_id, "Comentário de litígio atualizado.")
            conn.commit()
        elif request.method == 'DELETE':
            user_name = request.args.get('userName', 'System')
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM cri_cra_dev.crm.operation_litigation_comments WHERE id = ? AND operation_id = ?", (comment_id, op_id))
                log_action(cursor, user_name, 'DELETE', 'LitigationComment', comment_id, f"Comentário de litígio deletado.")
            conn.commit()
        
        with conn.cursor() as cursor:
            updated_op = load_operations(cursor, op_id=op_id)
        return jsonify(updated_op)
    except Exception as e:
        app.logger.error(f"Error managing litigation comment {comment_id} for operation {op_id}: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()

# ================== Servidor de Frontend ==================
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react_app(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print(f"Running app on port {port}")
    app.run(host='0.0.0.0', port=port)

