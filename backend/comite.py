"""
comite.py — Flask Blueprint para o módulo Comitê de Investimento / Monitoramento.

Schema: cri_cra_dev.comite
Todas as rotas usam try/except/finally, JSON snake_case, e IDs via get_next_unique_id.
"""

from flask import Blueprint, jsonify, request, current_app
from db import get_db_connection
from utils import safe_isoformat, parse_iso_date, format_row, get_next_unique_id
from datetime import datetime, timedelta
import json
import logging

comite_bp = Blueprint('comite', __name__)

COMITE_SCHEMA_PREFIX = "cri_cra_dev.comite"

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _get_next_id(cursor, table_name):
    """Gera próximo ID único para o schema comite."""
    full_table = f"{COMITE_SCHEMA_PREFIX}.{table_name}"
    cursor.execute(f"SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM {full_table}")
    row = cursor.fetchone()
    next_id = int(row.next_id) if row and row.next_id else 1
    while True:
        cursor.execute(f"SELECT id FROM {full_table} WHERE id = ?", (next_id,))
        if not cursor.fetchone():
            return next_id
        next_id += 1


INVESTIMENTO_DEFAULT_SECOES = [
    "RI", "Risco", "Assuntos Gerais", "Casos para Aprovação",
    "Casos de Revisão", "IA/Inovação"
]
MONITORAMENTO_DEFAULT_SECOES = [
    "Assuntos Gerais", "Watchlist",
    "Assunto Recorrente da Semana", "Inovação"
]

# Mapa de dia da semana (PT-BR) → weekday int do Python (segunda=0, terça=1, ...)
_DIA_SEMANA_MAP = {
    'segunda': 0, 'terça': 1, 'terca': 1, 'quarta': 2,
    'quinta': 3, 'sexta': 4, 'sábado': 5, 'sabado': 5, 'domingo': 6,
}

AUTO_COMPLETE_THRESHOLD_HOURS = 12


def _parse_comite_scheduled_datetime(comite_data_str, horario_str):
    """Combina a data do comitê com o horário da regra para obter o datetime agendado.
    
    Se horario_str for algo como '10:00', combina com a data.
    Se a data já tiver horário incorporado, usa ele diretamente.
    """
    try:
        # comite_data_str vem em formato ISO
        dt = datetime.fromisoformat(str(comite_data_str).replace('Z', ''))
    except Exception:
        return None

    # Se o horário está armazenado separadamente na regra, substituir
    if horario_str:
        try:
            parts = str(horario_str).strip().split(':')
            hour = int(parts[0])
            minute = int(parts[1]) if len(parts) > 1 else 0
            dt = dt.replace(hour=hour, minute=minute, second=0)
        except Exception:
            pass

    return dt


def _create_next_comite_for_rule(cursor, rule_id, rule_tipo, dia_da_semana_str):
    """Cria o próximo comitê agendado para uma regra, 7 dias após o mais recente.
    
    Só cria se não existir nenhum comitê 'agendado' para essa regra.
    """
    # Verificar se já existe agendado
    cursor.execute(
        f"SELECT COUNT(*) as cnt FROM {COMITE_SCHEMA_PREFIX}.comites WHERE comite_rule_id = ? AND status = 'agendado'",
        (rule_id,)
    )
    row = cursor.fetchone()
    if row and int(row.cnt) > 0:
        return  # já tem um próximo agendado

    # Pegar a data do último comitê dessa regra
    cursor.execute(
        f"SELECT MAX(data) as last_date FROM {COMITE_SCHEMA_PREFIX}.comites WHERE comite_rule_id = ?",
        (rule_id,)
    )
    row = cursor.fetchone()
    if not row or not row.last_date:
        return

    try:
        last_date = datetime.fromisoformat(str(row.last_date).replace('Z', ''))
    except Exception:
        return

    # Próximo comitê: 7 dias depois do último
    next_date = last_date + timedelta(days=7)

    # Ajustar para o dia da semana correto (se houver)
    if dia_da_semana_str:
        target_weekday = _DIA_SEMANA_MAP.get(dia_da_semana_str.lower().strip())
        if target_weekday is not None:
            current_weekday = next_date.weekday()
            diff = (target_weekday - current_weekday) % 7
            if diff == 0:
                diff = 7  # se cair no mesmo dia, pula pra semana seguinte
            next_date = (last_date + timedelta(days=1))  # dia seguinte ao último
            current_weekday = next_date.weekday()
            diff = (target_weekday - current_weekday) % 7
            next_date = next_date + timedelta(days=diff)
            # Se next_date ficar antes de hoje, avançar semana(s)
            now = datetime.now()
            while next_date < now:
                next_date += timedelta(days=7)

    new_id = _get_next_id(cursor, 'comites')
    cursor.execute(
        f"INSERT INTO {COMITE_SCHEMA_PREFIX}.comites (id, comite_rule_id, data, status) VALUES (?, ?, ?, ?)",
        (new_id, rule_id, next_date, 'agendado')
    )
    # Criar seções default
    _create_default_secoes(cursor, new_id, rule_tipo)


def _auto_complete_overdue_comites(conn):
    """Verifica comitês 'agendado' cuja data+horário já passou há mais de 12h.
    Marca-os como 'concluido', gera eventos CRM, e cria o próximo agendado.
    
    Chamado de forma lazy no início do GET /api/comite/comites (padrão Vercel-compatible).
    """
    now = datetime.now()
    completed_ids = []
    try:
        with conn.cursor() as cursor:
            # Buscar todos os comitês agendados com dados da regra
            cursor.execute(f"""
                SELECT c.id, c.data, c.comite_rule_id,
                       cr.horario, cr.tipo, cr.dia_da_semana
                FROM {COMITE_SCHEMA_PREFIX}.comites c
                JOIN {COMITE_SCHEMA_PREFIX}.comite_rules cr ON c.comite_rule_id = cr.id
                WHERE c.status = 'agendado'
            """)
            agendados = [format_row(r, cursor) for r in cursor.fetchall()]

            for ag in agendados:
                scheduled_dt = _parse_comite_scheduled_datetime(
                    ag.get('data'), ag.get('horario')
                )
                if not scheduled_dt:
                    continue

                # Verificar se passou mais de 12h
                if (now - scheduled_dt) < timedelta(hours=AUTO_COMPLETE_THRESHOLD_HOURS):
                    continue

                comite_id = ag['id']
                rule_id = ag.get('comite_rule_id')
                rule_tipo = ag.get('tipo', 'investimento')
                dia_da_semana = ag.get('dia_da_semana')

                # ── Marcar como concluído ──
                cursor.execute(
                    f"UPDATE {COMITE_SCHEMA_PREFIX}.comites SET status = ?, ata_gerada_em = ? WHERE id = ?",
                    ('concluido', now, comite_id)
                )

                # ── Gerar eventos CRM para itens vinculados a operações ──
                comite_date = scheduled_dt
                event_type = f"Comitê de {rule_tipo.capitalize()}" if rule_tipo else "Comitê"

                cursor.execute(
                    f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_itens_pauta WHERE comite_id = ? AND operation_id IS NOT NULL",
                    (comite_id,)
                )
                itens_com_operacao = [format_row(r, cursor) for r in cursor.fetchall()]

                for item in itens_com_operacao:
                    op_id = item.get('operation_id')
                    if not op_id:
                        continue

                    # Próximos passos do item
                    cursor.execute(
                        f"SELECT descricao, responsavel_nome FROM {COMITE_SCHEMA_PREFIX}.comite_proximos_passos WHERE item_pauta_id = ? ORDER BY created_at",
                        (item['id'],)
                    )
                    pp_rows = [format_row(r, cursor) for r in cursor.fetchall()]
                    next_steps_parts = []
                    for pp_data in pp_rows:
                        resp = pp_data.get('responsavel_nome', '')
                        desc = pp_data.get('descricao', '')
                        if resp:
                            next_steps_parts.append(f"• {desc} (Resp: {resp})")
                        else:
                            next_steps_parts.append(f"• {desc}")
                    next_steps_text = "\n".join(next_steps_parts) if next_steps_parts else None

                    event_id = get_next_unique_id(cursor, 'events')
                    cursor.execute(
                        """INSERT INTO cri_cra_dev.crm.events
                        (id, operation_id, date, type, title, description, registered_by, next_steps)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                        (event_id, op_id, comite_date, event_type,
                         item.get('titulo', 'Item de Comitê'),
                         item.get('descricao', ''),
                         item.get('criador_nome', 'Sistema (auto-complete)'),
                         next_steps_text)
                    )

                # ── Criar próximo comitê para a mesma regra ──
                _create_next_comite_for_rule(cursor, rule_id, rule_tipo, dia_da_semana)

                completed_ids.append(comite_id)

        if completed_ids:
            conn.commit()
            logging.info(
                "Auto-complete: %d comitê(s) marcados como concluídos: %s",
                len(completed_ids), completed_ids
            )
    except Exception as e:
        logging.error("Error in _auto_complete_overdue_comites: %s", e, exc_info=True)


def _create_default_secoes(cursor, comite_id, tipo):
    """Cria seções padrão para um comitê baseado no tipo."""
    secoes = INVESTIMENTO_DEFAULT_SECOES if tipo == 'investimento' else MONITORAMENTO_DEFAULT_SECOES
    for i, nome in enumerate(secoes):
        secao_id = _get_next_id(cursor, 'comite_secoes')
        cursor.execute(
            f"INSERT INTO {COMITE_SCHEMA_PREFIX}.comite_secoes (id, comite_id, nome, ordem, is_default) VALUES (?, ?, ?, ?, ?)",
            (secao_id, comite_id, nome, i + 1, True)
        )


def _fetch_comite_detail(cursor, comite_id):
    """Busca detalhes completos de um comitê.
    
    OPTIMIZED: Uses batch IN-clause queries instead of per-item loops.
    Reduces query count from ~5N+4 to ~7 total (where N = number of items).
    """
    cursor.execute(f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comites WHERE id = ?", (comite_id,))
    comite_row = cursor.fetchone()
    if not comite_row:
        return None
    comite = format_row(comite_row, cursor)

    # Buscar a regra para saber o tipo
    cursor.execute(f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_rules WHERE id = ?", (comite.get('comite_rule_id'),))
    rule_row = cursor.fetchone()
    rule = format_row(rule_row, cursor) if rule_row else {}

    # Seções
    cursor.execute(f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_secoes WHERE comite_id = ? ORDER BY ordem", (comite_id,))
    secoes = [format_row(r, cursor) for r in cursor.fetchall()]

    # Itens de pauta — materialize immediately
    cursor.execute(f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_itens_pauta WHERE comite_id = ? ORDER BY prioridade DESC, created_at", (comite_id,))
    itens_dicts = [format_row(r, cursor) for r in cursor.fetchall()]

    item_ids = [item['id'] for item in itens_dicts]

    # ── Batch: ALL comentários for all items at once ──
    comentarios_by_item = {}
    comment_ids_all = []
    if item_ids:
        in_clause = ','.join(['?'] * len(item_ids))
        cursor.execute(
            f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_comentarios WHERE item_pauta_id IN ({in_clause}) ORDER BY created_at",
            item_ids
        )
        all_comentarios = [format_row(r, cursor) for r in cursor.fetchall()]
        for c in all_comentarios:
            comment_ids_all.append(c['id'])
            if c['item_pauta_id'] not in comentarios_by_item:
                comentarios_by_item[c['item_pauta_id']] = []
            comentarios_by_item[c['item_pauta_id']].append(c)

    # ── Batch: likes count per comment (single query) ──
    likes_by_comment = {}
    if comment_ids_all:
        in_clause = ','.join(['?'] * len(comment_ids_all))
        cursor.execute(
            f"SELECT comentario_id, COUNT(*) as cnt FROM {COMITE_SCHEMA_PREFIX}.comite_likes WHERE comentario_id IN ({in_clause}) GROUP BY comentario_id",
            comment_ids_all
        )
        for r in cursor.fetchall():
            row = format_row(r, cursor)
            likes_by_comment[row['comentario_id']] = int(row['cnt'])

    # ── Batch: ALL votos for all items ──
    votos_by_item = {}
    if item_ids:
        in_clause = ','.join(['?'] * len(item_ids))
        cursor.execute(
            f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_votos WHERE item_pauta_id IN ({in_clause}) ORDER BY created_at",
            item_ids
        )
        for v_row in cursor.fetchall():
            v = format_row(v_row, cursor)
            if v['item_pauta_id'] not in votos_by_item:
                votos_by_item[v['item_pauta_id']] = []
            votos_by_item[v['item_pauta_id']].append({
                'id': v['id'],
                'item_pauta_id': v['item_pauta_id'],
                'user_id': v.get('user_id'),
                'user_nome': v.get('user_nome'),
                'tipo_voto': v.get('tipo_voto'),
                'cargo_voto': v.get('cargo_voto'),
                'comentario': v.get('comentario'),
                'created_at': safe_isoformat(v.get('created_at')),
            })

    # ── Batch: ALL videos assistidos ──
    videos_by_item = {}
    if item_ids:
        in_clause = ','.join(['?'] * len(item_ids))
        cursor.execute(
            f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_videos_assistidos WHERE item_pauta_id IN ({in_clause})",
            item_ids
        )
        for va_row in cursor.fetchall():
            va = format_row(va_row, cursor)
            if va['item_pauta_id'] not in videos_by_item:
                videos_by_item[va['item_pauta_id']] = []
            videos_by_item[va['item_pauta_id']].append({
                'id': va['id'],
                'item_pauta_id': va['item_pauta_id'],
                'user_id': va.get('user_id'),
                'user_nome': va.get('user_nome'),
                'assistido': va.get('assistido'),
                'created_at': safe_isoformat(va.get('created_at')),
            })

    # ── Batch: ALL próximos passos (with item_pauta_id) ──
    pp_by_item = {}
    if item_ids:
        in_clause = ','.join(['?'] * len(item_ids))
        cursor.execute(
            f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_proximos_passos WHERE item_pauta_id IN ({in_clause}) ORDER BY created_at",
            item_ids
        )
        for pp_row in cursor.fetchall():
            pp = format_row(pp_row, cursor)
            if pp['item_pauta_id'] not in pp_by_item:
                pp_by_item[pp['item_pauta_id']] = []
            pp_by_item[pp['item_pauta_id']].append({
                'id': pp['id'],
                'item_pauta_id': pp.get('item_pauta_id'),
                'comite_id': pp.get('comite_id'),
                'descricao': pp.get('descricao'),
                'responsavel_user_id': pp.get('responsavel_user_id'),
                'responsavel_nome': pp.get('responsavel_nome'),
                'status': pp.get('status', 'pendente'),
                'prazo': safe_isoformat(pp.get('prazo')),
                'prioridade': pp.get('prioridade', 'media'),
                'task_rule_id': pp.get('task_rule_id'),
                'created_at': safe_isoformat(pp.get('created_at')),
            })

    # ── Assemble items with pre-fetched data ──
    itens = []
    for item in itens_dicts:
        item_id = item['id']

        # Build comentarios with likes from batch
        comentarios = []
        for c in comentarios_by_item.get(item_id, []):
            comentarios.append({
                'id': c['id'],
                'item_pauta_id': c['item_pauta_id'],
                'user_id': c.get('user_id'),
                'user_nome': c.get('user_nome'),
                'texto': c.get('texto'),
                'parent_comment_id': c.get('parent_comment_id'),
                'created_at': safe_isoformat(c.get('created_at')),
                'likes': likes_by_comment.get(c['id'], 0),
            })

        itens.append({
            'id': item['id'],
            'comite_id': item['comite_id'],
            'secao_id': item.get('secao_id'),
            'titulo': item.get('titulo'),
            'descricao': item.get('descricao'),
            'criador_user_id': item.get('criador_user_id'),
            'criador_nome': item.get('criador_nome'),
            'tipo': item.get('tipo'),
            'video_url': item.get('video_url'),
            'video_duracao': item.get('video_duracao'),
            'prioridade': item.get('prioridade', 'normal'),
            'operation_id': item.get('operation_id'),
            'tipo_caso': item.get('tipo_caso'),
            'created_at': safe_isoformat(item.get('created_at')),
            'comentarios': comentarios,
            'votos': votos_by_item.get(item_id, []),
            'videos_assistidos': videos_by_item.get(item_id, []),
            'proximos_passos': pp_by_item.get(item_id, []),
        })

    # Próximos passos do comitê (sem item de pauta vinculado)
    cursor.execute(
        f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_proximos_passos WHERE comite_id = ? AND item_pauta_id IS NULL ORDER BY created_at",
        (comite_id,)
    )
    proximos_passos_gerais = []
    for pp_row in cursor.fetchall():
        pp = format_row(pp_row, cursor)
        proximos_passos_gerais.append({
            'id': pp['id'],
            'comite_id': pp.get('comite_id'),
            'descricao': pp.get('descricao'),
            'responsavel_user_id': pp.get('responsavel_user_id'),
            'responsavel_nome': pp.get('responsavel_nome'),
            'status': pp.get('status', 'pendente'),
            'prazo': safe_isoformat(pp.get('prazo')),
            'prioridade': pp.get('prioridade', 'media'),
            'task_rule_id': pp.get('task_rule_id'),
            'created_at': safe_isoformat(pp.get('created_at')),
        })

    return {
        'id': comite['id'],
        'comite_rule_id': comite.get('comite_rule_id'),
        'data': safe_isoformat(comite.get('data')),
        'status': comite.get('status'),
        'ata_gerada_em': safe_isoformat(comite.get('ata_gerada_em')),
        'rule': {
            'id': rule.get('id'),
            'tipo': rule.get('tipo'),
            'area': rule.get('area'),
            'dia_da_semana': rule.get('dia_da_semana'),
            'horario': rule.get('horario'),
        } if rule else None,
        'secoes': [{
            'id': s['id'],
            'comite_id': s['comite_id'],
            'nome': s.get('nome'),
            'ordem': s.get('ordem'),
            'is_default': s.get('is_default'),
        } for s in secoes],
        'itens': itens,
        'proximos_passos_gerais': proximos_passos_gerais,
    }


# ══════════════════════════════════════════════════════════════
# ROTAS — Regras de Comitê
# ══════════════════════════════════════════════════════════════

@comite_bp.route('/api/comite/rules', methods=['GET'])
def get_comite_rules():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_rules ORDER BY tipo, area")
            rows = cursor.fetchall()
            rules = []
            for r in rows:
                d = format_row(r, cursor)
                rules.append({
                    'id': d['id'],
                    'tipo': d.get('tipo'),
                    'area': d.get('area'),
                    'dia_da_semana': d.get('dia_da_semana'),
                    'horario': d.get('horario'),
                    'data_criacao': safe_isoformat(d.get('data_criacao')),
                    'ativo': d.get('ativo'),
                })
            return jsonify(rules)
    except Exception as e:
        current_app.logger.error(f"Error GET /api/comite/rules: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@comite_bp.route('/api/comite/rules', methods=['POST'])
def create_comite_rule():
    conn = get_db_connection()
    try:
        data = request.get_json(force=True)
        tipo = data.get('tipo')
        area = data.get('area', '')

        with conn.cursor() as cursor:
            # Validação: máximo 1 investimento + 1 monitoramento por área
            cursor.execute(
                f"SELECT COUNT(*) as cnt FROM {COMITE_SCHEMA_PREFIX}.comite_rules WHERE tipo = ? AND area = ? AND ativo = TRUE",
                (tipo, area)
            )
            count_row = cursor.fetchone()
            if count_row and int(count_row.cnt) >= 1:
                return jsonify({"error": f"Já existe uma regra de comitê de {tipo} para a área {area}."}), 400

            new_id = _get_next_id(cursor, 'comite_rules')
            now = datetime.now()
            cursor.execute(
                f"INSERT INTO {COMITE_SCHEMA_PREFIX}.comite_rules (id, tipo, area, dia_da_semana, horario, data_criacao, ativo) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (new_id, tipo, area, data.get('dia_da_semana'), data.get('horario'), now, True)
            )
        conn.commit()

        return jsonify({
            'id': new_id,
            'tipo': tipo,
            'area': area,
            'dia_da_semana': data.get('dia_da_semana'),
            'horario': data.get('horario'),
            'data_criacao': safe_isoformat(now),
            'ativo': True,
        }), 201
    except Exception as e:
        current_app.logger.error(f"Error POST /api/comite/rules: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@comite_bp.route('/api/comite/rules/<int:rule_id>', methods=['PUT'])
def update_comite_rule(rule_id):
    conn = get_db_connection()
    try:
        data = request.get_json(force=True)
        with conn.cursor() as cursor:
            cursor.execute(
                f"UPDATE {COMITE_SCHEMA_PREFIX}.comite_rules SET dia_da_semana = ?, horario = ?, area = ? WHERE id = ?",
                (data.get('dia_da_semana'), data.get('horario'), data.get('area'), rule_id)
            )
        conn.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        current_app.logger.error(f"Error PUT /api/comite/rules/{rule_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@comite_bp.route('/api/comite/rules/<int:rule_id>', methods=['DELETE'])
def delete_comite_rule(rule_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"UPDATE {COMITE_SCHEMA_PREFIX}.comite_rules SET ativo = FALSE WHERE id = ?",
                (rule_id,)
            )
        conn.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        current_app.logger.error(f"Error DELETE /api/comite/rules/{rule_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════
# ROTAS — Comitês
# ══════════════════════════════════════════════════════════════

@comite_bp.route('/api/comite/comites', methods=['GET'])
def get_comites():
    conn = get_db_connection()
    try:
        # ── Auto-complete comitês que já passaram da hora (12h threshold) ──
        _auto_complete_overdue_comites(conn)

        area_filter = request.args.get('area')
        status_filter = request.args.get('status')

        with conn.cursor() as cursor:
            query = f"""
                SELECT c.id, c.comite_rule_id, c.data, c.status, c.ata_gerada_em,
                    cr.tipo as tipo, cr.area as area, cr.dia_da_semana as dia_da_semana, cr.horario as horario
                FROM {COMITE_SCHEMA_PREFIX}.comites c
                JOIN {COMITE_SCHEMA_PREFIX}.comite_rules cr ON c.comite_rule_id = cr.id
                WHERE 1=1
            """
            params = []
            if area_filter:
                query += " AND cr.area = ?"
                params.append(area_filter)
            if status_filter:
                query += " AND c.status = ?"
                params.append(status_filter)
            query += " ORDER BY c.data DESC"

            cursor.execute(query, params)
            rows = cursor.fetchall()

            comites_raw = []
            comite_ids = []
            for r in rows:
                d = format_row(r, cursor)
                comites_raw.append(d)
                comite_ids.append(d['id'])

            # ── Batch: itens de pauta para TODOS os comitês de uma vez ──
            itens_by_comite: dict = {}
            if comite_ids:
                in_clause = ','.join(['?'] * len(comite_ids))
                cursor.execute(
                    f"SELECT id, comite_id, titulo FROM {COMITE_SCHEMA_PREFIX}.comite_itens_pauta WHERE comite_id IN ({in_clause}) ORDER BY created_at",
                    comite_ids
                )
                all_itens = [format_row(r, cursor) for r in cursor.fetchall()]
                all_item_ids = [it['id'] for it in all_itens]

                # Batch: count comments per item
                comments_count: dict = {}
                if all_item_ids:
                    item_in = ','.join(['?'] * len(all_item_ids))
                    cursor.execute(
                        f"SELECT item_pauta_id, COUNT(*) as cnt FROM {COMITE_SCHEMA_PREFIX}.comite_comentarios WHERE item_pauta_id IN ({item_in}) GROUP BY item_pauta_id",
                        all_item_ids
                    )
                    for r in cursor.fetchall():
                        row = format_row(r, cursor)
                        comments_count[row['item_pauta_id']] = int(row['cnt'])

                # Batch: count total likes (sum of likes on all comments of each item)
                likes_count: dict = {}
                if all_item_ids:
                    item_in = ','.join(['?'] * len(all_item_ids))
                    cursor.execute(
                        f"""SELECT c.item_pauta_id, COUNT(l.id) as cnt
                        FROM {COMITE_SCHEMA_PREFIX}.comite_comentarios c
                        JOIN {COMITE_SCHEMA_PREFIX}.comite_likes l ON l.comentario_id = c.id
                        WHERE c.item_pauta_id IN ({item_in})
                        GROUP BY c.item_pauta_id""",
                        all_item_ids
                    )
                    for r in cursor.fetchall():
                        row = format_row(r, cursor)
                        likes_count[row['item_pauta_id']] = int(row['cnt'])

                # Build items per comite with engagement score, sorted desc
                for it in all_itens:
                    cid = it['comite_id']
                    c_cnt = comments_count.get(it['id'], 0)
                    l_cnt = likes_count.get(it['id'], 0)
                    item_obj = {
                        'titulo': it.get('titulo', ''),
                        'comments_count': c_cnt,
                        'likes_count': l_cnt,
                        'engagement': c_cnt + l_cnt,
                    }
                    if cid not in itens_by_comite:
                        itens_by_comite[cid] = []
                    itens_by_comite[cid].append(item_obj)

                # Sort each comite's items by engagement descending
                for cid in itens_by_comite:
                    itens_by_comite[cid].sort(key=lambda x: x['engagement'], reverse=True)

            # ── Batch: próximos passos para TODOS os comitês de uma vez ──
            pp_by_comite = {}
            if comite_ids:
                in_clause = ','.join(['?'] * len(comite_ids))
                cursor.execute(
                    f"""SELECT pp.comite_id, pp.id, pp.descricao, pp.responsavel_nome, pp.status,
                        ip.titulo as item_titulo
                    FROM {COMITE_SCHEMA_PREFIX}.comite_proximos_passos pp
                    LEFT JOIN {COMITE_SCHEMA_PREFIX}.comite_itens_pauta ip ON pp.item_pauta_id = ip.id
                    WHERE pp.comite_id IN ({in_clause}) ORDER BY pp.created_at""",
                    comite_ids
                )
                for pp_row in cursor.fetchall():
                    pp = format_row(pp_row, cursor)
                    cid = pp['comite_id']
                    if cid not in pp_by_comite:
                        pp_by_comite[cid] = []
                    pp_by_comite[cid].append({
                        'id': pp['id'],
                        'descricao': pp.get('descricao'),
                        'responsavel_nome': pp.get('responsavel_nome'),
                        'status': pp.get('status', 'pendente'),
                        'item_titulo': pp.get('item_titulo'),
                    })

            # ── Montar resultado ──
            comites = []
            for d in comites_raw:
                cid = d['id']
                itens_objs = itens_by_comite.get(cid, [])
                proximos_passos = pp_by_comite.get(cid, [])

                comites.append({
                    'id': cid,
                    'comite_rule_id': d.get('comite_rule_id'),
                    'data': safe_isoformat(d.get('data')),
                    'status': d.get('status'),
                    'ata_gerada_em': safe_isoformat(d.get('ata_gerada_em')),
                    'tipo': d.get('tipo'),
                    'area': d.get('area'),
                    'dia_da_semana': d.get('dia_da_semana'),
                    'horario': d.get('horario'),
                    'itens_count': len(itens_objs),
                    'itens_titulos': [it['titulo'] for it in itens_objs],
                    'itens_pauta': itens_objs,
                    'proximos_passos': proximos_passos,
                })
            return jsonify(comites)
    except Exception as e:
        current_app.logger.error(f"Error GET /api/comite/comites: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@comite_bp.route('/api/comite/comites', methods=['POST'])
def create_comite():
    """Cria um novo comitê instanciado a partir de uma regra."""
    conn = get_db_connection()
    try:
        data = request.get_json(force=True)
        rule_id = data.get('comite_rule_id')
        data_comite = data.get('data')

        with conn.cursor() as cursor:
            # Fetch rule to know tipo
            cursor.execute(f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_rules WHERE id = ?", (rule_id,))
            rule_row = cursor.fetchone()
            if not rule_row:
                return jsonify({"error": "Regra de comitê não encontrada."}), 404
            rule = format_row(rule_row, cursor)

            new_id = _get_next_id(cursor, 'comites')
            cursor.execute(
                f"INSERT INTO {COMITE_SCHEMA_PREFIX}.comites (id, comite_rule_id, data, status) VALUES (?, ?, ?, ?)",
                (new_id, rule_id, data_comite, 'agendado')
            )

            # Criar seções default
            _create_default_secoes(cursor, new_id, rule.get('tipo', 'investimento'))

        conn.commit()

        # Fetch the created comitê with all details
        with conn.cursor() as cursor:
            comite_detail = _fetch_comite_detail(cursor, new_id)

        return jsonify(comite_detail), 201
    except Exception as e:
        current_app.logger.error(f"Error POST /api/comite/comites: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@comite_bp.route('/api/comite/comites/<int:comite_id>', methods=['GET'])
def get_comite_detail(comite_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            detail = _fetch_comite_detail(cursor, comite_id)
            if not detail:
                return jsonify({"error": "Comitê não encontrado."}), 404
            return jsonify(detail)
    except Exception as e:
        current_app.logger.error(f"Error GET /api/comite/comites/{comite_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════
# ROTAS — Seções
# ══════════════════════════════════════════════════════════════

@comite_bp.route('/api/comite/comites/<int:comite_id>/secoes', methods=['POST'])
def add_comite_secao(comite_id):
    conn = get_db_connection()
    try:
        data = request.get_json(force=True)
        with conn.cursor() as cursor:
            # Get max order
            cursor.execute(
                f"SELECT COALESCE(MAX(ordem), 0) + 1 as next_order FROM {COMITE_SCHEMA_PREFIX}.comite_secoes WHERE comite_id = ?",
                (comite_id,)
            )
            next_order = cursor.fetchone().next_order

            new_id = _get_next_id(cursor, 'comite_secoes')
            cursor.execute(
                f"INSERT INTO {COMITE_SCHEMA_PREFIX}.comite_secoes (id, comite_id, nome, ordem, is_default) VALUES (?, ?, ?, ?, ?)",
                (new_id, comite_id, data.get('nome'), int(next_order), False)
            )
        conn.commit()
        return jsonify({
            'id': new_id,
            'comite_id': comite_id,
            'nome': data.get('nome'),
            'ordem': int(next_order),
            'is_default': False,
        }), 201
    except Exception as e:
        current_app.logger.error(f"Error POST secao for comite {comite_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════
# ROTAS — Itens de Pauta
# ══════════════════════════════════════════════════════════════

@comite_bp.route('/api/comite/comites/<int:comite_id>/itens', methods=['POST'])
def add_item_pauta(comite_id):
    conn = get_db_connection()
    try:
        data = request.get_json(force=True)

        # ── Server-side validation: revisão/aprovação require an operation ──
        tipo_caso = data.get('tipo_caso', 'geral')
        operation_id = data.get('operation_id')
        if tipo_caso in ('revisao', 'aprovacao') and not operation_id:
            return jsonify({"error": "Itens de revisão ou aprovação devem estar vinculados a uma operação."}), 400

        # ── Server-side validation: monitoramento committees only accept "geral" ──
        with conn.cursor() as cur_check:
            cur_check.execute(
                f"""SELECT cr.tipo FROM {COMITE_SCHEMA_PREFIX}.comites c
                JOIN {COMITE_SCHEMA_PREFIX}.comite_rules cr ON c.comite_rule_id = cr.id
                WHERE c.id = ?""",
                (comite_id,)
            )
            rule_row_check = cur_check.fetchone()
            if rule_row_check and rule_row_check.tipo == 'monitoramento' and tipo_caso != 'geral':
                return jsonify({"error": "Comitês de monitoramento aceitam apenas itens gerais."}), 400

        with conn.cursor() as cursor:
            # If revisão, validate the operation is active (not structuring)
            if tipo_caso == 'revisao' and operation_id:
                cursor.execute(
                    "SELECT is_structuring FROM cri_cra_dev.crm.operations WHERE id = ?",
                    (operation_id,)
                )
                op_row = cursor.fetchone()
                if not op_row:
                    return jsonify({"error": "Operação não encontrada."}), 404
                if op_row.is_structuring:
                    return jsonify({"error": "Itens de revisão devem estar vinculados a operações ativas, não em estruturação."}), 400

            new_id = _get_next_id(cursor, 'comite_itens_pauta')
            now = datetime.now()
            cursor.execute(
                f"""INSERT INTO {COMITE_SCHEMA_PREFIX}.comite_itens_pauta 
                (id, comite_id, secao_id, titulo, descricao, criador_user_id, criador_nome, 
                 tipo, video_url, video_duracao, prioridade, operation_id, tipo_caso, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (new_id, comite_id, data.get('secao_id'), data.get('titulo'),
                 data.get('descricao'), data.get('criador_user_id'), data.get('criador_nome'),
                 data.get('tipo', 'presencial'), data.get('video_url'), data.get('video_duracao'),
                 data.get('prioridade', 'normal'), data.get('operation_id'),
                 data.get('tipo_caso', 'geral'), now)
            )
        conn.commit()
        return jsonify({
            'id': new_id,
            'comite_id': comite_id,
            'secao_id': data.get('secao_id'),
            'titulo': data.get('titulo'),
            'descricao': data.get('descricao'),
            'criador_user_id': data.get('criador_user_id'),
            'criador_nome': data.get('criador_nome'),
            'tipo': data.get('tipo', 'presencial'),
            'video_url': data.get('video_url'),
            'video_duracao': data.get('video_duracao'),
            'prioridade': data.get('prioridade', 'normal'),
            'operation_id': data.get('operation_id'),
            'tipo_caso': data.get('tipo_caso', 'geral'),
            'created_at': safe_isoformat(now),
            'comentarios': [],
            'votos': [],
            'videos_assistidos': [],
            'proximos_passos': [],
        }), 201
    except Exception as e:
        current_app.logger.error(f"Error POST item pauta: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@comite_bp.route('/api/comite/itens/<int:item_id>', methods=['PUT'])
def update_item_pauta(item_id):
    conn = get_db_connection()
    try:
        data = request.get_json(force=True)
        with conn.cursor() as cursor:
            cursor.execute(
                f"""UPDATE {COMITE_SCHEMA_PREFIX}.comite_itens_pauta SET
                secao_id = ?, titulo = ?, descricao = ?, tipo = ?,
                video_url = ?, video_duracao = ?, prioridade = ?,
                operation_id = ?, tipo_caso = ?
                WHERE id = ?""",
                (data.get('secao_id'), data.get('titulo'), data.get('descricao'),
                 data.get('tipo'), data.get('video_url'), data.get('video_duracao'),
                 data.get('prioridade'), data.get('operation_id'),
                 data.get('tipo_caso'), item_id)
            )
        conn.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        current_app.logger.error(f"Error PUT item {item_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════
# ROTAS — Comentários
# ══════════════════════════════════════════════════════════════

@comite_bp.route('/api/comite/itens/<int:item_id>/comentarios', methods=['POST'])
def add_comentario(item_id):
    conn = get_db_connection()
    try:
        data = request.get_json(force=True)
        with conn.cursor() as cursor:
            new_id = _get_next_id(cursor, 'comite_comentarios')
            now = datetime.now()
            cursor.execute(
                f"""INSERT INTO {COMITE_SCHEMA_PREFIX}.comite_comentarios 
                (id, item_pauta_id, user_id, user_nome, texto, parent_comment_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (new_id, item_id, data.get('user_id'), data.get('user_nome'),
                 data.get('texto'), data.get('parent_comment_id'), now)
            )
        conn.commit()
        return jsonify({
            'id': new_id,
            'item_pauta_id': item_id,
            'user_id': data.get('user_id'),
            'user_nome': data.get('user_nome'),
            'texto': data.get('texto'),
            'parent_comment_id': data.get('parent_comment_id'),
            'created_at': safe_isoformat(now),
            'likes': 0,
        }), 201
    except Exception as e:
        current_app.logger.error(f"Error POST comentario: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@comite_bp.route('/api/comite/comentarios/<int:comentario_id>/like', methods=['POST'])
def toggle_like(comentario_id):
    conn = get_db_connection()
    try:
        data = request.get_json(force=True)
        user_id = data.get('user_id')
        with conn.cursor() as cursor:
            # Check if already liked
            cursor.execute(
                f"SELECT id FROM {COMITE_SCHEMA_PREFIX}.comite_likes WHERE comentario_id = ? AND user_id = ?",
                (comentario_id, user_id)
            )
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    f"DELETE FROM {COMITE_SCHEMA_PREFIX}.comite_likes WHERE id = ?",
                    (existing.id,)
                )
                action = 'unliked'
            else:
                new_id = _get_next_id(cursor, 'comite_likes')
                cursor.execute(
                    f"INSERT INTO {COMITE_SCHEMA_PREFIX}.comite_likes (id, comentario_id, user_id, created_at) VALUES (?, ?, ?, ?)",
                    (new_id, comentario_id, user_id, datetime.now())
                )
                action = 'liked'

            # Return updated count
            cursor.execute(
                f"SELECT COUNT(*) as cnt FROM {COMITE_SCHEMA_PREFIX}.comite_likes WHERE comentario_id = ?",
                (comentario_id,)
            )
            count = cursor.fetchone()
        conn.commit()
        return jsonify({"action": action, "likes": int(count.cnt) if count else 0})
    except Exception as e:
        current_app.logger.error(f"Error toggle like: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════
# ROTAS — Votos
# ══════════════════════════════════════════════════════════════

@comite_bp.route('/api/comite/itens/<int:item_id>/votos', methods=['POST'])
def add_or_update_voto(item_id):
    conn = get_db_connection()
    try:
        data = request.get_json(force=True)
        user_id = data.get('user_id')
        with conn.cursor() as cursor:
            # Check for existing vote
            cursor.execute(
                f"SELECT id FROM {COMITE_SCHEMA_PREFIX}.comite_votos WHERE item_pauta_id = ? AND user_id = ?",
                (item_id, user_id)
            )
            existing = cursor.fetchone()
            now = datetime.now()

            if existing:
                cursor.execute(
                    f"""UPDATE {COMITE_SCHEMA_PREFIX}.comite_votos SET
                    tipo_voto = ?, cargo_voto = ?, comentario = ?, updated_at = ?
                    WHERE id = ?""",
                    (data.get('tipo_voto'), data.get('cargo_voto'),
                     data.get('comentario'), now, existing.id)
                )
                voto_id = existing.id
            else:
                voto_id = _get_next_id(cursor, 'comite_votos')
                cursor.execute(
                    f"""INSERT INTO {COMITE_SCHEMA_PREFIX}.comite_votos 
                    (id, item_pauta_id, user_id, user_nome, tipo_voto, cargo_voto, comentario, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (voto_id, item_id, user_id, data.get('user_nome'),
                     data.get('tipo_voto'), data.get('cargo_voto'),
                     data.get('comentario'), now, now)
                )
        conn.commit()
        return jsonify({
            'id': voto_id,
            'item_pauta_id': item_id,
            'user_id': user_id,
            'user_nome': data.get('user_nome'),
            'tipo_voto': data.get('tipo_voto'),
            'cargo_voto': data.get('cargo_voto'),
            'comentario': data.get('comentario'),
            'created_at': safe_isoformat(now),
        }), 201
    except Exception as e:
        current_app.logger.error(f"Error POST voto: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════
# ROTAS — Vídeos Assistidos
# ══════════════════════════════════════════════════════════════

@comite_bp.route('/api/comite/itens/<int:item_id>/video-assistido', methods=['POST'])
def toggle_video_assistido(item_id):
    conn = get_db_connection()
    try:
        data = request.get_json(force=True)
        user_id = data.get('user_id')
        with conn.cursor() as cursor:
            cursor.execute(
                f"SELECT id, assistido FROM {COMITE_SCHEMA_PREFIX}.comite_videos_assistidos WHERE item_pauta_id = ? AND user_id = ?",
                (item_id, user_id)
            )
            existing = cursor.fetchone()
            now = datetime.now()

            if existing:
                new_value = not existing.assistido
                cursor.execute(
                    f"UPDATE {COMITE_SCHEMA_PREFIX}.comite_videos_assistidos SET assistido = ? WHERE id = ?",
                    (new_value, existing.id)
                )
                assistido = new_value
            else:
                new_id = _get_next_id(cursor, 'comite_videos_assistidos')
                cursor.execute(
                    f"""INSERT INTO {COMITE_SCHEMA_PREFIX}.comite_videos_assistidos 
                    (id, item_pauta_id, user_id, user_nome, assistido, created_at) VALUES (?, ?, ?, ?, ?, ?)""",
                    (new_id, item_id, user_id, data.get('user_nome'), True, now)
                )
                assistido = True
        conn.commit()
        return jsonify({"assistido": assistido})
    except Exception as e:
        current_app.logger.error(f"Error toggle video: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════
# ROTAS — Próximos Passos
# ══════════════════════════════════════════════════════════════

@comite_bp.route('/api/comite/itens/<int:item_id>/proximos-passos', methods=['POST'])
def add_proximo_passo_item(item_id):
    conn = get_db_connection()
    try:
        data = request.get_json(force=True)
        with conn.cursor() as cursor:
            # Get comite_id AND operation_id from parent item
            cursor.execute(
                f"SELECT comite_id, operation_id FROM {COMITE_SCHEMA_PREFIX}.comite_itens_pauta WHERE id = ?",
                (item_id,)
            )
            item_row = cursor.fetchone()
            comite_id = item_row.comite_id if item_row else None
            operation_id = item_row.operation_id if item_row else None

            now = datetime.now()
            prazo_raw = data.get('prazo')
            prazo = parse_iso_date(prazo_raw) if prazo_raw else None
            prioridade = data.get('prioridade', 'media')
            responsavel_nome = data.get('responsavel_nome', '')
            descricao = data.get('descricao', '')

            # ── Map comitê prioridade → CRM priority ──
            PRIO_MAP = {'baixa': 'Baixa', 'media': 'Média', 'alta': 'Alta', 'urgente': 'Urgente'}
            crm_priority = PRIO_MAP.get(prioridade, 'Média')

            # ── Create task_rule in crm.task_rules ──
            task_rule_id = get_next_unique_id(cursor, 'task_rules')
            assignees_json = json.dumps([responsavel_nome]) if responsavel_nome else '[]'
            cursor.execute(
                """INSERT INTO cri_cra_dev.crm.task_rules
                (id, operation_id, name, frequency, start_date, end_date, description, priority, assignees)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (task_rule_id, operation_id, descricao, 'Pontual',
                 prazo or now, prazo or now,
                 f'Tarefa de comitê (item #{item_id})',
                 crm_priority, assignees_json)
            )

            # ── Create próximo passo record with task_rule_id reference ──
            new_id = _get_next_id(cursor, 'comite_proximos_passos')
            cursor.execute(
                f"""INSERT INTO {COMITE_SCHEMA_PREFIX}.comite_proximos_passos 
                (id, item_pauta_id, comite_id, descricao, responsavel_user_id, responsavel_nome, status, prazo, prioridade, task_rule_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (new_id, item_id, comite_id, descricao,
                 data.get('responsavel_user_id'), responsavel_nome,
                 'pendente', prazo, prioridade, task_rule_id, now)
            )
        conn.commit()
        return jsonify({
            'id': new_id,
            'item_pauta_id': item_id,
            'comite_id': comite_id,
            'descricao': descricao,
            'responsavel_user_id': data.get('responsavel_user_id'),
            'responsavel_nome': responsavel_nome,
            'status': 'pendente',
            'prazo': safe_isoformat(prazo),
            'prioridade': prioridade,
            'task_rule_id': task_rule_id,
            'created_at': safe_isoformat(now),
        }), 201
    except Exception as e:
        current_app.logger.error(f"Error POST proximo passo: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@comite_bp.route('/api/comite/proximos-passos/<int:pp_id>', methods=['PUT'])
def update_proximo_passo(pp_id):
    conn = get_db_connection()
    try:
        data = request.get_json(force=True)
        new_status = data.get('status', 'pendente')
        with conn.cursor() as cursor:
            # Fetch current record to get task_rule_id and old status
            cursor.execute(
                f"SELECT task_rule_id, status FROM {COMITE_SCHEMA_PREFIX}.comite_proximos_passos WHERE id = ?",
                (pp_id,)
            )
            pp_row = cursor.fetchone()
            task_rule_id = pp_row.task_rule_id if pp_row else None
            old_status = pp_row.status if pp_row else 'pendente'

            prazo_raw = data.get('prazo')
            prazo = parse_iso_date(prazo_raw) if prazo_raw else None
            cursor.execute(
                f"""UPDATE {COMITE_SCHEMA_PREFIX}.comite_proximos_passos 
                SET status = ?, descricao = ?, responsavel_nome = ?, prioridade = ?, prazo = ?
                WHERE id = ?""",
                (new_status, data.get('descricao'),
                 data.get('responsavel_nome'), data.get('prioridade', 'media'),
                 prazo, pp_id)
            )

            # ── Sync completion status with crm.task_rules via task_exceptions ──
            if task_rule_id and old_status != new_status:
                # Get operation_id from the task_rule to build the task_id
                cursor.execute(
                    "SELECT operation_id FROM cri_cra_dev.crm.task_rules WHERE id = ?",
                    (task_rule_id,)
                )
                rule_row = cursor.fetchone()
                op_id = rule_row.operation_id if rule_row else None

                # Build task_id matching task_engine Pontual format:
                # "op{op_id}-rule{rule_id}-{due_date}"  or  "general-rule{rule_id}-{due_date}"
                if op_id:
                    start_cursor_row = None
                    cursor.execute(
                        "SELECT start_date FROM cri_cra_dev.crm.task_rules WHERE id = ?",
                        (task_rule_id,)
                    )
                    start_cursor_row = cursor.fetchone()
                    start_date_str = safe_isoformat(start_cursor_row.start_date) if start_cursor_row and start_cursor_row.start_date else None
                    if start_date_str:
                        task_id = f"op{op_id}-rule{task_rule_id}-{start_date_str[:10]}"
                    else:
                        task_id = f"op{op_id}-rule{task_rule_id}-nodate"
                else:
                    # General task (no operation) — still need a unique task_id
                    task_id = f"general-rule{task_rule_id}"

                if new_status == 'concluido':
                    # Add to task_exceptions to mark as completed
                    cursor.execute(
                        "SELECT task_id FROM cri_cra_dev.crm.task_exceptions WHERE task_id = ?",
                        (task_id,)
                    )
                    if not cursor.fetchone():
                        cursor.execute(
                            """INSERT INTO cri_cra_dev.crm.task_exceptions (task_id, operation_id, deleted_at, deleted_by)
                            VALUES (?, ?, ?, ?)""",
                            (task_id, op_id, datetime.now(), data.get('responsavel_nome', 'comite'))
                        )
                elif new_status == 'pendente':
                    # Remove from task_exceptions to re-open
                    cursor.execute(
                        "DELETE FROM cri_cra_dev.crm.task_exceptions WHERE task_id = ?",
                        (task_id,)
                    )

            # ── Also sync task_rule fields if changed ──
            if task_rule_id:
                PRIO_MAP = {'baixa': 'Baixa', 'media': 'Média', 'alta': 'Alta', 'urgente': 'Urgente'}
                crm_priority = PRIO_MAP.get(data.get('prioridade', 'media'), 'Média')
                responsavel_nome = data.get('responsavel_nome', '')
                assignees_json = json.dumps([responsavel_nome]) if responsavel_nome else '[]'
                cursor.execute(
                    """UPDATE cri_cra_dev.crm.task_rules
                    SET name = ?, end_date = ?, priority = ?, assignees = ?
                    WHERE id = ?""",
                    (data.get('descricao'), prazo, crm_priority, assignees_json, task_rule_id)
                )

        conn.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        current_app.logger.error(f"Error PUT proximo passo {pp_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════
# ROTAS — Completar Comitê & Relatório
# ══════════════════════════════════════════════════════════════

@comite_bp.route('/api/comite/comites/<int:comite_id>/completar', methods=['POST'])
def completar_comite(comite_id):
    """Marca comitê como concluído, gera ata e cria eventos CRM para itens vinculados a operações."""
    conn = get_db_connection()
    try:
        now = datetime.now()
        with conn.cursor() as cursor:
            # Check comitê exists first
            cursor.execute(
                f"SELECT id, data FROM {COMITE_SCHEMA_PREFIX}.comites WHERE id = ?",
                (comite_id,)
            )
            comite_row = cursor.fetchone()
            if not comite_row:
                return jsonify({"error": "Comitê não encontrado."}), 404

            comite_date = comite_row.data  # The committee's actual date

            # Fetch rule tipo for building event type label
            cursor.execute(
                f"""SELECT cr.tipo FROM {COMITE_SCHEMA_PREFIX}.comites c
                    JOIN {COMITE_SCHEMA_PREFIX}.comite_rules cr ON c.comite_rule_id = cr.id
                    WHERE c.id = ?""",
                (comite_id,)
            )
            rule_row = cursor.fetchone()
            rule_tipo = rule_row.tipo if rule_row else 'investimento'
            event_type = f"Comitê de {rule_tipo.capitalize()}" if rule_tipo else "Comitê"

            # Mark comitê as completed
            cursor.execute(
                f"UPDATE {COMITE_SCHEMA_PREFIX}.comites SET status = ?, ata_gerada_em = ? WHERE id = ?",
                ('concluido', now, comite_id)
            )

            # ── Generate CRM events for items linked to operations ──
            cursor.execute(
                f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_itens_pauta WHERE comite_id = ? AND operation_id IS NOT NULL",
                (comite_id,)
            )
            itens_com_operacao = [format_row(r, cursor) for r in cursor.fetchall()]

            events_created = 0
            for item in itens_com_operacao:
                op_id = item.get('operation_id')
                if not op_id:
                    continue

                # Fetch próximos passos for this item
                cursor.execute(
                    f"SELECT descricao, responsavel_nome FROM {COMITE_SCHEMA_PREFIX}.comite_proximos_passos WHERE item_pauta_id = ? ORDER BY created_at",
                    (item['id'],)
                )
                pp_rows = [format_row(r, cursor) for r in cursor.fetchall()]
                next_steps_parts = []
                for pp_data in pp_rows:
                    resp = pp_data.get('responsavel_nome', '')
                    desc = pp_data.get('descricao', '')
                    if resp:
                        next_steps_parts.append(f"• {desc} (Resp: {resp})")
                    else:
                        next_steps_parts.append(f"• {desc}")
                next_steps_text = "\n".join(next_steps_parts) if next_steps_parts else None

                # Create event in crm.events
                event_id = get_next_unique_id(cursor, 'events')
                cursor.execute(
                    """INSERT INTO cri_cra_dev.crm.events
                    (id, operation_id, date, type, title, description, registered_by, next_steps)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (event_id, op_id, comite_date, event_type,
                     item.get('titulo', 'Item de Comitê'),
                     item.get('descricao', ''),
                     item.get('criador_nome', 'Comitê'),
                     next_steps_text)
                )
                events_created += 1

            current_app.logger.info(
                "Comitê %s concluído — %d evento(s) CRM gerado(s).",
                comite_id, events_created
            )

        conn.commit()

        # Fetch full detail after commit
        with conn.cursor() as cursor:
            detail = _fetch_comite_detail(cursor, comite_id)

        if not detail:
            return jsonify({"error": "Comitê não encontrado."}), 404

        # Build ata
        ata = _build_ata(detail)
        return jsonify({
            "status": "concluido",
            "ata": ata,
            "comite": detail,
            "events_created": events_created,
        })
    except Exception as e:
        current_app.logger.error(f"Error completing comite {comite_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@comite_bp.route('/api/comite/comites/<int:comite_id>/relatorio', methods=['GET'])
def get_relatorio(comite_id):
    """Gera relatório HTML formatado para e-mail Outlook."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            detail = _fetch_comite_detail(cursor, comite_id)
        if not detail:
            return jsonify({"error": "Comitê não encontrado."}), 404

        html = _build_relatorio_html(detail)
        return jsonify({"html": html, "comite": detail})
    except Exception as e:
        current_app.logger.error(f"Error generating report: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@comite_bp.route('/api/comite/operations-for-pauta', methods=['GET'])
def get_operations_for_pauta():
    """Retorna operações leves para o modal de item de pauta.
    - ativas: operações ativas (não-estruturação, não-legado)
    - estruturacao: operações em estruturação
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Active operations
            cursor.execute("""
                SELECT o.id, o.name, o.area, mg.name AS master_group_name
                FROM cri_cra_dev.crm.operations o
                LEFT JOIN cri_cra_dev.crm.master_groups mg ON o.master_group_id = mg.id
                WHERE (o.is_structuring IS NULL OR o.is_structuring = FALSE)
                AND (o.status IS NULL OR o.status != 'Legado')
                ORDER BY o.name
            """)
            ativas = []
            for r in cursor.fetchall():
                d = {desc[0]: val for desc, val in zip(cursor.description, r)}
                ativas.append({
                    'id': d['id'],
                    'name': d['name'],
                    'area': d.get('area'),
                    'master_group_name': d.get('master_group_name'),
                    'is_structuring': False,
                })

            # Structuring operations
            cursor.execute("""
                SELECT o.id, o.name, o.area, o.pipeline_stage, mg.name AS master_group_name
                FROM cri_cra_dev.crm.operations o
                LEFT JOIN cri_cra_dev.crm.master_groups mg ON o.master_group_id = mg.id
                WHERE o.is_structuring = TRUE
                ORDER BY o.name
            """)
            estruturacao = []
            for r in cursor.fetchall():
                d = {desc[0]: val for desc, val in zip(cursor.description, r)}
                estruturacao.append({
                    'id': d['id'],
                    'name': d['name'],
                    'area': d.get('area'),
                    'master_group_name': d.get('master_group_name'),
                    'pipeline_stage': d.get('pipeline_stage'),
                    'is_structuring': True,
                })

            return jsonify({'ativas': ativas, 'estruturacao': estruturacao})
    except Exception as e:
        current_app.logger.error(f"Error GET /api/comite/operations-for-pauta: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@comite_bp.route('/api/comite/config-email', methods=['POST'])
def config_email():
    conn = get_db_connection()
    try:
        data = request.get_json(force=True)
        with conn.cursor() as cursor:
            rule_id = data.get('comite_rule_id')
            cursor.execute(
                f"SELECT id FROM {COMITE_SCHEMA_PREFIX}.comite_config_email WHERE comite_rule_id = ?",
                (rule_id,)
            )
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    f"UPDATE {COMITE_SCHEMA_PREFIX}.comite_config_email SET horario_envio = ?, habilitado = ? WHERE id = ?",
                    (data.get('horario_envio'), data.get('habilitado', True), existing.id)
                )
            else:
                new_id = _get_next_id(cursor, 'comite_config_email')
                cursor.execute(
                    f"INSERT INTO {COMITE_SCHEMA_PREFIX}.comite_config_email (id, comite_rule_id, horario_envio, habilitado) VALUES (?, ?, ?, ?)",
                    (new_id, rule_id, data.get('horario_envio'), data.get('habilitado', True))
                )
        conn.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        current_app.logger.error(f"Error config email: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


# ──────────────────────────────────────────────────────────────
# Helpers de Relatório / Ata
# ──────────────────────────────────────────────────────────────

def _build_ata(detail):
    """Constrói a ata em texto estruturado."""
    lines = [f"# Ata do Comitê - {detail.get('data', '')}"]
    lines.append(f"**Tipo:** {detail.get('rule', {}).get('tipo', '')}")
    lines.append(f"**Área:** {detail.get('rule', {}).get('area', '')}")
    lines.append(f"**Status:** {detail.get('status', '')}")
    lines.append("")

    for secao in detail.get('secoes', []):
        lines.append(f"## {secao.get('nome', '')}")
        secao_itens = [i for i in detail.get('itens', []) if i.get('secao_id') == secao.get('id')]
        if not secao_itens:
            lines.append("_Sem itens nesta seção._")
        for item in secao_itens:
            prio = f" [{item.get('prioridade', '').upper()}]" if item.get('prioridade') in ('alta', 'urgente') else ""
            lines.append(f"### {item.get('titulo', '')}{prio}")
            if item.get('descricao'):
                lines.append(f"  {item['descricao']}")
            lines.append(f"  Criador: {item.get('criador_nome', 'N/A')}")
            if item.get('tipo') == 'video':
                lines.append(f"  Vídeo: {item.get('video_url', '')} ({item.get('video_duracao', '')})")

            # Comentários
            if item.get('comentarios'):
                lines.append("  **Comentários:**")
                for c in item['comentarios']:
                    lines.append(f"  - {c.get('user_nome', 'Anônimo')}: {c.get('texto', '')} (👍 {c.get('likes', 0)})")

            # Votos
            if item.get('votos'):
                lines.append("  **Votos:**")
                for v in item['votos']:
                    lines.append(f"  - {v.get('user_nome', '')}: {v.get('tipo_voto', '')}")

            # Próximos passos
            if item.get('proximos_passos'):
                lines.append("  **Próximos Passos:**")
                for pp in item['proximos_passos']:
                    lines.append(f"  - [{pp.get('status', '')}] {pp.get('descricao', '')} → {pp.get('responsavel_nome', '')}")
        lines.append("")

    return "\n".join(lines)


def _build_relatorio_html(detail):
    """Constrói relatório HTML conciso para envio por e-mail (pré-comitê)."""
    html = f"""
    <html>
    <body style="font-family: Calibri, Arial, sans-serif; color: #333; max-width: 600px; margin: auto;">
    <h1 style="color: #1a365d; border-bottom: 2px solid #2b6cb0; padding-bottom: 8px;">
        Resumo da Pauta — {detail.get('rule', {}).get('tipo', '').title()} ({detail.get('rule', {}).get('area', '')})
    </h1>
    <p style="color: #666; font-size: 14px;">Data: {detail.get('data', 'N/A')}</p>
    """

    for secao in detail.get('secoes', []):
        secao_itens = [i for i in detail.get('itens', []) if i.get('secao_id') == secao.get('id')]
        if not secao_itens:
            continue
        html += f'<h2 style="color: #2b6cb0; margin-top: 20px;">{secao.get("nome", "")}</h2>'
        for item in secao_itens:
            prio_color = '#e53e3e' if item.get('prioridade') == 'urgente' else '#dd6b20' if item.get('prioridade') == 'alta' else '#2d3748'
            html += f"""
            <div style="background: #f7fafc; border-left: 4px solid {prio_color}; padding: 10px 15px; margin-bottom: 10px; border-radius: 4px;">
                <strong style="color: {prio_color};">{item.get('titulo', '')}</strong>
                {f'<span style="background: {prio_color}; color: white; font-size: 10px; padding: 2px 6px; border-radius: 3px; margin-left: 8px;">{item.get("prioridade", "").upper()}</span>' if item.get('prioridade') in ('alta', 'urgente') else ''}
                <br><span style="font-size: 12px; color: #888;">Criador: {item.get('criador_nome', 'N/A')} | Comentários: {len(item.get('comentarios', []))}</span>
            """
            if item.get('descricao'):
                html += f'<p style="font-size: 13px; margin: 5px 0;">{item["descricao"]}</p>'

            # Votos summary
            votos = item.get('votos', [])
            if votos:
                aprovados = sum(1 for v in votos if v.get('tipo_voto') == 'aprovado')
                reprovados = sum(1 for v in votos if v.get('tipo_voto') == 'reprovado')
                discussao = sum(1 for v in votos if v.get('tipo_voto') == 'discussao')
                html += f'<p style="font-size: 12px; color: #555;">Votos: ✅ {aprovados} | ❌ {reprovados} | 💬 {discussao}</p>'

            html += '</div>'

    html += """
    <hr style="border: 1px solid #e2e8f0; margin-top: 30px;">
    <p style="font-size: 11px; color: #a0aec0; text-align: center;">
        CRM Antigravity — Relatório gerado automaticamente
    </p>
    </body></html>
    """
    return html
