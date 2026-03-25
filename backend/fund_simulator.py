import os
from flask import Blueprint, jsonify, request
from db import get_db_connection
from utils import format_row

fund_simulator_bp = Blueprint('fund_simulator', __name__)

RISCO_TABLE = os.getenv("RISCO_TABLE", "risco_dev.risco_cri.dadosconsolidadoscris")
MIDDLE_TABLE = os.getenv("MIDDLE_TABLE", "middle_dev.fundos.fundos")

@fund_simulator_bp.route('/api/fund-simulator/funds', methods=['GET'])
def get_funds():
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"""
                SELECT DISTINCT dc.Fundo 
                FROM {RISCO_TABLE} dc
                WHERE dc.Fundo IN (
                    SELECT codigo FROM {MIDDLE_TABLE} WHERE area = 8
                )
                ORDER BY dc.Fundo
            """)
            funds = [r.Fundo for r in cursor.fetchall()]
            return jsonify(funds)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()

@fund_simulator_bp.route('/api/fund-simulator/data/<string:fund_name>', methods=['GET'])
def get_fund_data(fund_name):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Pull data from Risco query
            query = f"""
                WITH base_filtrada AS (SELECT
                    dc.Data,
                    dc.Fundo,
                    dc.Info,
                    dc.Valor,
                    ROW_NUMBER() OVER (
                        PARTITION BY dc.Fundo, dc.Info
                        ORDER BY dc.Data DESC
                    ) AS rn
                FROM {RISCO_TABLE} dc
                WHERE dc.Fundo = ?
                AND dc.Info IN (
                    'CRI CDI - Financeiro',
                    'CRI IPCA - Financeiro',
                    'CRI IGPM - Financeiro',
                    'LCI - Financeiro',
                    'PL - Financeiro',
                    'Caixa Líquido - Financeiro',
                    'Compromissadas - Financeiro',
                    'Taxa Média MTM CDI',
                    'Taxa Média Curva CDI',
                    'Taxa Média MTM IPCA',
                    'Taxa Média Curva IPCA',
                    'Taxa Média MTM IGPM',
                    'Taxa Média Curva IGPM'
                )
            )
            SELECT Data, Fundo, Info, Valor FROM base_filtrada WHERE rn = 1
            """
            cursor.execute(query, (fund_name,))
            risco_data = [format_row(r, cursor) for r in cursor.fetchall()]
            
            # 2. Pull Manual Inputs
            cursor.execute("SELECT * FROM cri_cra_dev.crm.fund_allocation_inputs WHERE fund_name = ?", (fund_name,))
            input_row = cursor.fetchone()
            inputs = format_row(input_row, cursor) if input_row else {
                "emission": 0.0, "prepayment": 0.0, "repurchases": 0.0, "new_repo": 0.0
            }

            return jsonify({
                "riscoData": risco_data,
                "inputs": inputs
            })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()

@fund_simulator_bp.route('/api/fund-simulator/inputs/<string:fund_name>', methods=['POST'])
def save_fund_inputs(fund_name):
    conn = get_db_connection()
    try:
        data = request.json
        with conn.cursor() as cursor:
            cursor.execute("SELECT fund_name FROM cri_cra_dev.crm.fund_allocation_inputs WHERE fund_name = ?", (fund_name,))
            if cursor.fetchone():
                cursor.execute("""
                    UPDATE cri_cra_dev.crm.fund_allocation_inputs
                    SET emission = ?, prepayment = ?, repurchases = ?, new_repo = ?, updated_at = CURRENT_TIMESTAMP()
                    WHERE fund_name = ?
                """, (data.get('emission', 0.0), data.get('prepayment', 0.0), data.get('repurchases', 0.0), data.get('new_repo', 0.0), fund_name))
            else:
                cursor.execute("""
                    INSERT INTO cri_cra_dev.crm.fund_allocation_inputs (fund_name, emission, prepayment, repurchases, new_repo, updated_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP())
                """, (fund_name, data.get('emission', 0.0), data.get('prepayment', 0.0), data.get('repurchases', 0.0), data.get('new_repo', 0.0)))
            conn.commit()
            return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()
