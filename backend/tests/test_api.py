import unittest
import json
import sys
import os

# Adiciona o diretório `backend` ao PYTHONPATH para importar corretamente os componentes
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from db import get_db_connection

class TestCRMAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        """ Configuracao inicial (roda antes dos testes). Inicia o cliente Flask. """
        cls.client = app.test_client()
        # Verificar se a conexao base da DB funciona antes de tudo
        try:
            conn = get_db_connection()
            conn.close()
            cls.db_available = True
        except Exception as e:
            print(f"Bancando inativo ou erro de conexao com Databricks: {e}")
            cls.db_available = False

    def check_db(self):
        """ Skippador se db nao disponivel """
        if not self.db_available:
            self.skipTest("Banco de dados não conectado/disponível")

    def test_operations_get(self):
        self.check_db()
        response = self.client.get('/api/operations')
        self.assertEqual(response.status_code, 200, "GET /api/operations falhou (Erro 500?)")
        data = json.loads(response.data)
        self.assertTrue(isinstance(data, list), "Resultado de operações não é uma lista")

    def test_master_groups_get(self):
        self.check_db()
        response = self.client.get('/api/master-groups')
        self.assertEqual(response.status_code, 200, "GET /api/master-groups falhou")
        data = json.loads(response.data)
        self.assertTrue(isinstance(data, list), "Resultado de master groups não é uma lista")

    def test_structuring_operations_get(self):
        self.check_db()
        response = self.client.get('/api/structuring-operations')
        self.assertEqual(response.status_code, 200, "GET /api/structuring-operations falhou (Tabelas faltantes?)")
        data = json.loads(response.data)
        self.assertTrue(isinstance(data, list), "Resultado de structuring operations não é uma lista")

    def test_patch_notes_get(self):
        self.check_db()
        response = self.client.get('/api/patch-notes')
        self.assertEqual(response.status_code, 200, "GET /api/patch-notes falhou")
        data = json.loads(response.data)
        self.assertTrue(isinstance(data, list), "Resultado de patch notes não é uma lista")

if __name__ == '__main__':
    unittest.main()
