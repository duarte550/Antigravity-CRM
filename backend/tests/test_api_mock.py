import unittest
import json
import sys
import os

# Adiciona o diretório `backend` ao PYTHONPATH para importar corretamente os componentes
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import db
from tests.mock_db_utils import init_mock_db

# Inicializa o banco de dados simulado (SQLite in-memory) e substitui o real no `db` module.
mock_db_instance = init_mock_db()
db.get_db_connection = lambda: mock_db_instance

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
            print(f"Banco inativo ou erro de conexao com Databricks simulação: {e}")
            cls.db_available = False

    def check_db(self):
        """ Skippador se db nao disponivel """
        if not self.db_available:
            self.skipTest("Banco de dados não conectado/disponível")

    def test_operations_get(self):
        self.check_db()
        response = self.client.get('/api/operations')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(isinstance(data, list))

    def test_patch_notes_get(self):
        self.check_db()
        response = self.client.get('/api/patch-notes')
        self.assertEqual(response.status_code, 200)

    # ==========================
    # TESTS PARA MASTER GROUPS
    # ==========================
    def test_master_groups_crud(self):
        self.check_db()
        
        # 1. POST
        new_mg = {
            "name": "TESTE_AUTOMATIZADO_MG",
            "sector": "Setor Teste",
            "rating": "A4"
        }
        res_post = self.client.post('/api/master-groups', json=new_mg)
        self.assertEqual(res_post.status_code, 201, "Criacao de Master Group falhou")
        mg_data = json.loads(res_post.data)
        mg_id = mg_data.get('id')
        self.assertIsNotNone(mg_id, "ID do Master Group nao foi retornado")

        try:
            # 2. GET by ID
            res_get = self.client.get(f'/api/master-groups/{mg_id}')
            self.assertEqual(res_get.status_code, 200, "Get individual Master Group falhou")
            self.assertEqual(json.loads(res_get.data)['name'], "TESTE_AUTOMATIZADO_MG")

            # 3. PUT
            update_mg = {
                "name": "TESTE_AUTOMATIZADO_MG_EDIT",
                "sector": "Setor Editado",
                "rating": "B1"
            }
            res_put = self.client.put(f'/api/master-groups/{mg_id}', json=update_mg)
            self.assertEqual(res_put.status_code, 200, "Update Master Group falhou")
            self.assertEqual(json.loads(res_put.data)['name'], "TESTE_AUTOMATIZADO_MG_EDIT")

            # 4. GET ALL
            res_get_all = self.client.get('/api/master-groups')
            self.assertEqual(res_get_all.status_code, 200)
            all_mgs = json.loads(res_get_all.data)
            self.assertTrue(any(mg['id'] == mg_id for mg in all_mgs))

            # --- Testes Embutidos para Economic Groups atrelados a este Master Group ---
            self.run_economic_groups_crud(mg_id)
            
            # --- Testes Embutidos para Structuring Ops atrelados a este Master Group ---
            self.run_structuring_operations_crud(mg_id)

        finally:
            # 5. DELETE Master Group
            res_del = self.client.delete(f'/api/master-groups/{mg_id}')
            self.assertEqual(res_del.status_code, 204, "Delete Master Group falhou")

    def run_economic_groups_crud(self, master_group_id):
        # 1. POST Economic Group
        new_eg = {
            "name": "TESTE_AUTOMATIZADO_EG",
            "sector": "Varejo",
            "rating": "A4",
            "masterGroupId": master_group_id
        }
        res_post = self.client.post('/api/economic-groups', json=new_eg)
        self.assertEqual(res_post.status_code, 201, "Criacao de Grupo Economico falhou")
        eg_data = json.loads(res_post.data)
        eg_id = eg_data.get('id')
        self.assertIsNotNone(eg_id, "ID do Grupo Economico nao foi retornado")

        try:
            # 2. GET ALL 
            res_get_all = self.client.get('/api/economic-groups')
            self.assertEqual(res_get_all.status_code, 200)
            
            # 3. GET individual
            res_get = self.client.get(f'/api/economic-groups/{eg_id}')
            self.assertEqual(res_get.status_code, 200, "Get individual Economic Group falhou")
            
            # 4. PUT
            update_eg = {
                "name": "TESTE_AUTOMATIZADO_EG_EDIT",
                "sector": "Industria",
                "rating": "B1",
                "masterGroupId": master_group_id
            }
            res_put = self.client.put(f'/api/economic-groups/{eg_id}', json=update_eg)
            self.assertEqual(res_put.status_code, 200, "Update Economic Group falhou")
        finally:
            # 5. DELETE Economic Group
            res_del = self.client.delete(f'/api/economic-groups/{eg_id}')
            self.assertEqual(res_del.status_code, 204, "Delete Economic Group falhou")

    def run_structuring_operations_crud(self, master_group_id):
        # 1. POST Structuring Operation
        new_so = {
            "name": "TESTE_AUTOMATIZADO_SO",
            "area": "CRI",
            "masterGroupId": master_group_id,
            "economicGroupId": "",
            "stage": "Conversa Inicial",
            "liquidationDate": "2024-12-31T00:00:00.000Z",
            "risk": "Baixo",
            "temperature": "Alta",
            "analyst": "Analista Teste",
            "modality": "ModTest",
            "originator": "Banco Teste",
            "series": [
                {"name": "Senior", "volume": 1000000, "rate": "IPCA+6", "indexer": "IPCA"}
            ]
        }
        res_post = self.client.post('/api/structuring-operations', json=new_so)
        self.assertEqual(res_post.status_code, 201, "Criacao de Structuring Operation falhou")
        
        # We need to GET all to find the ID since POST struct-ops returns {"status": "success"} only
        res_get_all = self.client.get('/api/structuring-operations')
        so_list = json.loads(res_get_all.data)
        so_candidates = [so for so in so_list if so['name'] == "TESTE_AUTOMATIZADO_SO" and so['master_group_id'] == master_group_id]
        
        if not so_candidates:
            self.fail("Structuring Operation was not generated correctly.")
            
        so_id = so_candidates[0]['id']

        try:
            # 2. GET individual
            res_get = self.client.get(f'/api/structuring-operations/{so_id}')
            self.assertEqual(res_get.status_code, 200, "Get individual Structuring Operation falhou")
            
            # 3. PUT
            update_so = {
                "name": "TESTE_AUTOMATIZADO_SO_EDIT",
                "area": "CRI",
                "masterGroupId": master_group_id,
                "economicGroupId": "",
                "stage": "Term Sheet",
                "liquidationDate": "2024-12-31T00:00:00.000Z",
                "risk": "Médio",
                "temperature": "Alta",
                "analyst": "Analista Edit",
                "series": [] # Apagando as series
            }
            res_put = self.client.put(f'/api/structuring-operations/{so_id}', json=update_so)
            self.assertEqual(res_put.status_code, 200, "Update Structuring Operation falhou")
        finally:
            # 4. DELETE Structuring Operation
            res_del = self.client.delete(f'/api/structuring-operations/{so_id}')
            self.assertEqual(res_del.status_code, 204, "Delete Structuring Operation falhou")

    # ==========================
    # TESTS PARA FUND SIMULATOR
    # ==========================
    def test_fund_simulator_endpoints(self):
        self.check_db()
        
        # 1. GET Fundos
        res_funds = self.client.get('/api/fund-simulator/funds')
        self.assertEqual(res_funds.status_code, 200, "Get fund names failed")
        funds = json.loads(res_funds.data)
        
        if funds:
            test_fund = funds[0]
            
            # 2. GET Fund Data
            res_data = self.client.get(f'/api/fund-simulator/data/{test_fund}')
            self.assertEqual(res_data.status_code, 200, "Get fund data failed")
            
            # 3. POST Fund Inputs (Using a generic fake fund name to avoid breaking true prod simulation)
            fake_fund = "FUNDO_FAKE_AUTOMATIZADO"
            test_inputs = {
                "emission": 100,
                "prepayment": 50,
                "repurchases": 10,
                "new_repo": 0
            }
            res_input = self.client.post(f'/api/fund-simulator/inputs/{fake_fund}', json=test_inputs)
            self.assertEqual(res_input.status_code, 200, "Save fund inputs failed")

if __name__ == '__main__':
    unittest.main()
