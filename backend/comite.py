"""
comite.py — Flask Blueprint para o módulo Comitê de Investimento / Monitoramento.

Schema: cri_cra_dev.comite
Todas as rotas usam try/except/finally, JSON snake_case, e IDs via get_next_unique_id.
"""

from flask import Blueprint, jsonify, request, current_app
from db import get_db_connection
from utils import safe_isoformat, parse_iso_date, format_row
from datetime import datetime
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
    """Busca detalhes completos de um comitê."""
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

    # Itens de pauta
    cursor.execute(f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_itens_pauta WHERE comite_id = ? ORDER BY prioridade DESC, created_at", (comite_id,))
    itens_rows = cursor.fetchall()
    itens = []
    for item_row in itens_rows:
        item = format_row(item_row, cursor)
        item_id = item['id']

        # Comentários do item
        cursor.execute(
            f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_comentarios WHERE item_pauta_id = ? ORDER BY created_at",
            (item_id,)
        )
        comentarios_rows = cursor.fetchall()
        comentarios = []
        for c_row in comentarios_rows:
            c = format_row(c_row, cursor)
            # Contar likes
            cursor.execute(
                f"SELECT COUNT(*) as cnt FROM {COMITE_SCHEMA_PREFIX}.comite_likes WHERE comentario_id = ?",
                (c['id'],)
            )
            like_count = cursor.fetchone()
            c['likes'] = int(like_count.cnt) if like_count else 0
            comentarios.append({
                'id': c['id'],
                'item_pauta_id': c['item_pauta_id'],
                'user_id': c.get('user_id'),
                'user_nome': c.get('user_nome'),
                'texto': c.get('texto'),
                'parent_comment_id': c.get('parent_comment_id'),
                'created_at': safe_isoformat(c.get('created_at')),
                'likes': c['likes'],
            })

        # Votos do item
        cursor.execute(
            f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_votos WHERE item_pauta_id = ? ORDER BY created_at",
            (item_id,)
        )
        votos = [{
            'id': format_row(v, cursor)['id'],
            'item_pauta_id': format_row(v, cursor)['item_pauta_id'],
            'user_id': format_row(v, cursor).get('user_id'),
            'user_nome': format_row(v, cursor).get('user_nome'),
            'tipo_voto': format_row(v, cursor).get('tipo_voto'),
            'cargo_voto': format_row(v, cursor).get('cargo_voto'),
            'comentario': format_row(v, cursor).get('comentario'),
            'created_at': safe_isoformat(format_row(v, cursor).get('created_at')),
        } for v in []]  # Re-fetch properly
        cursor.execute(
            f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_votos WHERE item_pauta_id = ? ORDER BY created_at",
            (item_id,)
        )
        votos = []
        for v_row in cursor.fetchall():
            v = format_row(v_row, cursor)
            votos.append({
                'id': v['id'],
                'item_pauta_id': v['item_pauta_id'],
                'user_id': v.get('user_id'),
                'user_nome': v.get('user_nome'),
                'tipo_voto': v.get('tipo_voto'),
                'cargo_voto': v.get('cargo_voto'),
                'comentario': v.get('comentario'),
                'created_at': safe_isoformat(v.get('created_at')),
            })

        # Videos assistidos
        cursor.execute(
            f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_videos_assistidos WHERE item_pauta_id = ?",
            (item_id,)
        )
        videos_assistidos = []
        for va_row in cursor.fetchall():
            va = format_row(va_row, cursor)
            videos_assistidos.append({
                'id': va['id'],
                'item_pauta_id': va['item_pauta_id'],
                'user_id': va.get('user_id'),
                'user_nome': va.get('user_nome'),
                'assistido': va.get('assistido'),
                'created_at': safe_isoformat(va.get('created_at')),
            })

        # Próximos passos
        cursor.execute(
            f"SELECT * FROM {COMITE_SCHEMA_PREFIX}.comite_proximos_passos WHERE item_pauta_id = ? ORDER BY created_at",
            (item_id,)
        )
        proximos_passos = []
        for pp_row in cursor.fetchall():
            pp = format_row(pp_row, cursor)
            proximos_passos.append({
                'id': pp['id'],
                'item_pauta_id': pp.get('item_pauta_id'),
                'comite_id': pp.get('comite_id'),
                'descricao': pp.get('descricao'),
                'responsavel_user_id': pp.get('responsavel_user_id'),
                'responsavel_nome': pp.get('responsavel_nome'),
                'status': pp.get('status', 'pendente'),
                'created_at': safe_isoformat(pp.get('created_at')),
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
            'votos': votos,
            'videos_assistidos': videos_assistidos,
            'proximos_passos': proximos_passos,
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

            comites = []
            for r in rows:
                d = format_row(r, cursor)
                # Count itens
                cursor.execute(
                    f"SELECT COUNT(*) as cnt FROM {COMITE_SCHEMA_PREFIX}.comite_itens_pauta WHERE comite_id = ?",
                    (d['id'],)
                )
                itens_count = cursor.fetchone()

                # Get proximos passos summary
                cursor.execute(
                    f"""SELECT pp.*, ip.titulo as item_titulo 
                    FROM {COMITE_SCHEMA_PREFIX}.comite_proximos_passos pp
                    LEFT JOIN {COMITE_SCHEMA_PREFIX}.comite_itens_pauta ip ON pp.item_pauta_id = ip.id
                    WHERE pp.comite_id = ? ORDER BY pp.created_at""",
                    (d['id'],)
                )
                pp_rows = cursor.fetchall()
                proximos_passos = []
                for pp_row in pp_rows:
                    pp = format_row(pp_row, cursor)
                    proximos_passos.append({
                        'id': pp['id'],
                        'descricao': pp.get('descricao'),
                        'responsavel_nome': pp.get('responsavel_nome'),
                        'status': pp.get('status', 'pendente'),
                        'item_titulo': pp.get('item_titulo'),
                    })

                comites.append({
                    'id': d['id'],
                    'comite_rule_id': d.get('comite_rule_id'),
                    'data': safe_isoformat(d.get('data')),
                    'status': d.get('status'),
                    'ata_gerada_em': safe_isoformat(d.get('ata_gerada_em')),
                    'tipo': d.get('tipo'),
                    'area': d.get('area'),
                    'dia_da_semana': d.get('dia_da_semana'),
                    'horario': d.get('horario'),
                    'itens_count': int(itens_count.cnt) if itens_count else 0,
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
        with conn.cursor() as cursor:
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
            # Get comite_id from item
            cursor.execute(
                f"SELECT comite_id FROM {COMITE_SCHEMA_PREFIX}.comite_itens_pauta WHERE id = ?",
                (item_id,)
            )
            item_row = cursor.fetchone()
            comite_id = item_row.comite_id if item_row else None

            new_id = _get_next_id(cursor, 'comite_proximos_passos')
            now = datetime.now()
            cursor.execute(
                f"""INSERT INTO {COMITE_SCHEMA_PREFIX}.comite_proximos_passos 
                (id, item_pauta_id, comite_id, descricao, responsavel_user_id, responsavel_nome, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (new_id, item_id, comite_id, data.get('descricao'),
                 data.get('responsavel_user_id'), data.get('responsavel_nome'),
                 'pendente', now)
            )
        conn.commit()
        return jsonify({
            'id': new_id,
            'item_pauta_id': item_id,
            'comite_id': comite_id,
            'descricao': data.get('descricao'),
            'responsavel_user_id': data.get('responsavel_user_id'),
            'responsavel_nome': data.get('responsavel_nome'),
            'status': 'pendente',
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
        with conn.cursor() as cursor:
            cursor.execute(
                f"UPDATE {COMITE_SCHEMA_PREFIX}.comite_proximos_passos SET status = ?, descricao = ? WHERE id = ?",
                (data.get('status', 'pendente'), data.get('descricao'), pp_id)
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
    """Marca comitê como concluído e gera ata."""
    conn = get_db_connection()
    try:
        now = datetime.now()
        with conn.cursor() as cursor:
            # Check comitê exists first
            cursor.execute(
                f"SELECT id FROM {COMITE_SCHEMA_PREFIX}.comites WHERE id = ?",
                (comite_id,)
            )
            if not cursor.fetchone():
                return jsonify({"error": "Comitê não encontrado."}), 404

            cursor.execute(
                f"UPDATE {COMITE_SCHEMA_PREFIX}.comites SET status = ?, ata_gerada_em = ? WHERE id = ?",
                ('concluido', now, comite_id)
            )
        conn.commit()

        # Fetch full detail after commit
        with conn.cursor() as cursor:
            detail = _fetch_comite_detail(cursor, comite_id)

        if not detail:
            return jsonify({"error": "Comitê não encontrado."}), 404

        # Build ata
        ata = _build_ata(detail)
        return jsonify({"status": "concluido", "ata": ata, "comite": detail})
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
