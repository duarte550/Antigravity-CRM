"""
mock_db_utils.py — Camada de abstração SQLite ↔ Databricks para testes.

Converte queries do dialeto Databricks SQL (schema prefixes, tipos, MERGE, etc.)
para SQLite in-memory, permitindo rodar a suite completa sem cluster real.
"""
import sqlite3
import re
import os


class GenericRow:
    def __init__(self, d):
        self._d = d
        self.__dict__.update(d)

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self._d.values())[key]
        return self._d.get(key)

    def get(self, key, default=None):
        return self._d.get(key, default)

    def __iter__(self):
        return iter(self._d.values())

    def __len__(self):
        return len(self._d)


class DatabricksToSqliteMockCursor:
    def __init__(self, cursor):
        self.cursor = cursor
        self.description = None
        self.lastrowid = None

    def execute(self, query, params=()):
        # Remove Databricks specific schema prefixes
        query = query.replace("cri_cra_dev.crm.", "")
        query = query.replace("cri_cra_dev.comite.", "")
        query = query.replace("risco_dev.risco_cri.", "risco_dev_risco_cri_")
        query = query.replace("middle_dev.fundos.", "middle_dev_fundos_")

        # Databricks allows string casts like CAST(id AS STRING). SQLite uses CAST(id AS TEXT)
        query = re.sub(r'CAST\(([^ ]+)\s+AS\s+STRING\)', r'CAST(\1 AS TEXT)', query, flags=re.IGNORECASE)
        query = re.sub(r'CURRENT_TIMESTAMP\(\)', 'CURRENT_TIMESTAMP', query, flags=re.IGNORECASE)
        query = query.replace('TRUE', '1').replace('FALSE', '0')

        # Handle MERGE statements (convert to INSERT OR REPLACE for SQLite)
        if query.strip().upper().startswith('MERGE'):
            query, params = self._convert_merge(query, params)

        # Convert any datetime objects in params to strings
        from datetime import datetime, date
        converted = []
        for p in params:
            if isinstance(p, datetime):
                converted.append(p.isoformat())
            elif isinstance(p, date):
                converted.append(p.isoformat())
            else:
                converted.append(p)
        params = tuple(converted)

        self.cursor.execute(query, params)
        self.description = self.cursor.description
        self.lastrowid = self.cursor.lastrowid
        return self

    def _convert_merge(self, query, params):
        """
        Converte MERGE INTO ... para INSERT OR REPLACE ...
        Esta é uma conversão simplificada que cobre os padrões usados no app.
        """
        # Pattern para operation_review_notes MERGE
        if 'operation_review_notes' in query:
            insert_query = """
                INSERT OR REPLACE INTO operation_review_notes (operation_id, notes, updated_at, updated_by)
                VALUES (?, ?, ?, ?)
            """
            # O MERGE para review_notes recebe 7 params:
            # (op_id, notes, now, user, op_id, notes, now, user)
            # Precisamos apenas dos primeiros 4
            return insert_query, params[:4]

        # Pattern para analyst_notes MERGE
        if 'analyst_notes' in query:
            insert_query = """
                INSERT OR REPLACE INTO analyst_notes (analyst_name, notes, updated_at)
                VALUES (?, ?, ?)
            """
            return insert_query, params[:3]

        # Fallback: tenta executar como está (vai falhar se não coberto)
        return query, params

    def fetchone(self):
        row = self.cursor.fetchone()
        if not row:
            return None
        d = {desc[0]: val for desc, val in zip(self.description, row)}
        return GenericRow(d)

    def fetchall(self):
        rows = self.cursor.fetchall()
        res = []
        for row in rows:
            d = {desc[0]: val for desc, val in zip(self.description, row)}
            res.append(GenericRow(d))
        return res


class MockDatabricksConnection:
    def __init__(self, memory_conn):
        self.conn = memory_conn

    def cursor(self):
        class CursorContextManager:
            def __init__(self, c):
                self.c = DatabricksToSqliteMockCursor(c)

            def __enter__(self):
                return self.c

            def __exit__(self, exc_type, exc_val, exc_tb):
                pass

        return CursorContextManager(self.conn.cursor())

    def commit(self):
        self.conn.commit()

    def close(self):
        # We don't close the memory connection between requests so state persists during the test
        pass


def init_mock_db():
    schema_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'sql_schema.sql')
    with open(schema_path, 'r', encoding='utf-8') as f:
        sql = f.read()

    # Remove schema databricks syntax
    sql = re.sub(r'CREATE SCHEMA IF NOT EXISTS [A-Za-z0-9_.]+;', '', sql)
    sql = re.sub(r'USE [A-Za-z0-9_.]+;', '', sql)
    sql = sql.replace('cri_cra_dev.crm.', '')
    sql = sql.replace('cri_cra_dev.comite.', '')

    # Convert column types and identity definitions
    sql = re.sub(r'(id\s+)BIGINT GENERATED BY DEFAULT AS IDENTITY', r'\1INTEGER', sql)
    sql = sql.replace('BIGINT', 'INTEGER')
    sql = sql.replace('STRING', 'TEXT')
    sql = sql.replace('TIMESTAMP', 'TEXT')
    sql = sql.replace('BOOLEAN', 'INTEGER')

    # Remove COMMENT clauses using regex
    sql = re.sub(r"COMMENT\s+'[^']*'", "", sql)

    conn = sqlite3.connect(':memory:', check_same_thread=False)
    c = conn.cursor()
    try:
        c.executescript(sql)

        # Tabelas externas que o fund_simulator usa
        c.execute("CREATE TABLE IF NOT EXISTS risco_dev_risco_cri_dadosconsolidadoscris (Fundo TEXT, Data TEXT, Info TEXT, Valor REAL)")
        c.execute("CREATE TABLE IF NOT EXISTS middle_dev_fundos_fundos (codigo TEXT, area INTEGER)")
        c.execute("INSERT INTO middle_dev_fundos_fundos VALUES ('FUNDO_FAKE_AUTOMATIZADO', 8)")
        c.execute("INSERT INTO risco_dev_risco_cri_dadosconsolidadoscris VALUES ('FUNDO_FAKE_AUTOMATIZADO', '2025-01-01', 'Taxa Média MTM CDI', 12.0)")

        # Adicionar coluna extra usada pelo fund_simulator que está em update_db mas não no schema base
        try:
            c.execute("ALTER TABLE fund_allocation_inputs ADD COLUMN simulated_ops_overrides TEXT")
        except Exception:
            pass  # Coluna já pode existir

        # Adicionar colunas extras que podem estar no update_db mas não no sql_schema.sql
        extra_cols = [
            ("operations", "structuring_analyst TEXT"),
            ("operations", "estimated_date TEXT"),
            ("operations", "rating_group TEXT"),
            ("rating_history", "rating_master_group TEXT"),
            ("operation_contacts", "id INTEGER PRIMARY KEY"),
            ("operation_contacts", "operation_id INTEGER"),
            ("operation_contacts", "name TEXT"),
            ("operation_contacts", "email TEXT"),
            ("operation_contacts", "phone TEXT"),
            ("operation_contacts", "role TEXT"),
        ]
        for table, col_def in extra_cols:
            col_name = col_def.split()[0]
            try:
                c.execute(f"ALTER TABLE {table} ADD COLUMN {col_def}")
            except Exception:
                pass  # Column might already exist

        # Cria tabela operation_contacts se não existir (não está no sql_schema.sql base)
        c.execute("""
            CREATE TABLE IF NOT EXISTS operation_contacts (
                id INTEGER PRIMARY KEY,
                operation_id INTEGER NOT NULL,
                name TEXT,
                email TEXT,
                phone TEXT,
                role TEXT
            )
        """)

        # insert mock patch_notes para testes
        c.execute("""
            INSERT OR IGNORE INTO patch_notes (id, version, date, title, description, changes) 
            VALUES (1, '1.0.0', '2025-01-01', 'Versão Inicial', 'Lançamento do CRM', '["Feature 1", "Feature 2"]')
        """)

        conn.commit()
    except Exception as e:
        print("MOCK DB SCHEMA ERROR:", e)
        raise e

    return MockDatabricksConnection(conn)
