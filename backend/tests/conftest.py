"""
conftest.py — Pytest fixtures compartilhados para toda a suite de testes.

Inicializa o banco SQLite in-memory, substitui get_db_connection,
e disponibiliza o Flask test client para todos os testes.

IMPORTANTE: Mocka o módulo `databricks` e `update_db` ANTES de qualquer
import do código do app, para evitar dependência do cluster real.
"""
import sys
import os
import types

# Adiciona o diretório `backend` ao PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# ──────────────────────────────────────────────────────────
# 1. Mock do módulo `databricks` antes de importar `db.py`
# ──────────────────────────────────────────────────────────
databricks_mock = types.ModuleType('databricks')
databricks_sql_mock = types.ModuleType('databricks.sql')
databricks_sql_mock.connect = lambda **kwargs: None  # nunca será chamado
databricks_mock.sql = databricks_sql_mock
sys.modules['databricks'] = databricks_mock
sys.modules['databricks.sql'] = databricks_sql_mock

# ──────────────────────────────────────────────────────────
# 2. Mock do update_db para evitar migrações no SQLite
# ──────────────────────────────────────────────────────────
dummy_update_db = types.ModuleType('update_db')
dummy_update_db.update_schema = lambda: None
sys.modules['update_db'] = dummy_update_db

# ──────────────────────────────────────────────────────────
# 3. Agora podemos importar db e substituir get_db_connection
# ──────────────────────────────────────────────────────────
import pytest
import db
from tests.mock_db_utils import init_mock_db


@pytest.fixture(scope="session")
def mock_connection():
    """Cria uma conexão SQLite in-memory que persiste durante toda a sessão de testes."""
    conn = init_mock_db()
    original_get_db = db.get_db_connection
    db.get_db_connection = lambda: conn
    yield conn
    db.get_db_connection = original_get_db


@pytest.fixture(scope="session")
def client(mock_connection):
    """Flask test client configurado com banco mockado."""
    from app import app
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c
