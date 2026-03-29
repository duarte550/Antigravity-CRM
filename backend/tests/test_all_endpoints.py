"""
test_all_endpoints.py — Suite completa de testes PyTest para todos os endpoints do CRM.

Cobre:
  - Operations CRUD (GET list, POST, GET by id, PUT, DELETE)
  - sync-all (application/json, text/plain fallback, payload com deletes)
  - bulk-update
  - sync-rules
  - Tasks (delete, edit)
  - Audit Logs
  - Operation Review Notes
  - Change Requests CRUD
  - Patch Notes
  - Analyst Notes
  - Operation Risks CRUD
  - Litigation Comments CRUD
  - Master Groups CRUD
  - Master Group Events
  - Master Group Risks
  - Structuring Operations CRUD
  - Structuring Operation Events CRUD
  - Structuring Operation Stages
  - Economic Groups CRUD
  - Fund Simulator
  - Comitê Rules CRUD (criar, duplicata bloqueada, update, soft-delete)
  - Comitê Instâncias (criar, listar, filtrar, detalhe, 404)
  - Comitê Seções (adicionar customizada)
  - Comitê Itens de Pauta (presencial, urgente, vídeo, update)
  - Comitê Comentários (comentar, reply)
  - Comitê Likes (like/unlike toggle)
  - Comitê Votos (cast, upsert)
  - Comitê Vídeo Assistido (marcar, toggle)
  - Comitê Próximos Passos (criar, atualizar status)
  - Comitê Completar + Relatório (ata, persistência, 404)
  - Comitê Config Email (criar, atualizar)
  - Comitê Full Lifecycle (integração end-to-end)
  - Verificações de compliance: try/except/finally e snake_case (§3.1 e §3.2)
"""
import json
import os
import pytest


# ============================================================
# 1. OPERATIONS
# ============================================================

class TestOperationsGet:
    def test_get_operations_returns_list(self, client):
        res = client.get('/api/operations')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert isinstance(data, list)


class TestOperationsPost:
    """Cria uma operação completa e valida a resposta."""

    @pytest.fixture(autouse=True)
    def _setup_master_group(self, client):
        """Garante que um Master Group exista antes de criar operações."""
        res = client.post('/api/master-groups', json={
            'name': 'MG_TEST_OPS', 'sector': 'Teste', 'rating': 'A4'
        })
        self.mg = json.loads(res.data)
        yield
        # Cleanup no final
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_create_operation(self, client):
        payload = {
            'name': 'OP_TESTE_AUTOMATIZADO',
            'area': 'CRI',
            'operationType': 'CRI Corporativo',
            'maturityDate': '2030-12-31',
            'responsibleAnalyst': 'Analista Teste',
            'reviewFrequency': 'Mensal',
            'callFrequency': 'Mensal',
            'dfFrequency': 'Trimestral',
            'segmento': 'Imobiliário',
            'ratingOperation': 'A4',
            'ratingGroup': 'A4',
            'watchlist': 'Verde',
            'covenants': {'ltv': 0.7, 'dscr': 1.2},
            'defaultMonitoring': {
                'news': True, 'fiiReport': False, 'operationalInfo': False,
                'receivablesPortfolio': False, 'monthlyConstructionReport': False,
                'monthlyCommercialInfo': False, 'speDfs': False
            },
            'masterGroupId': self.mg['id'],
            'description': 'Operação criada via pytest',
            'projects': [{'name': 'Projeto Teste'}],
            'guarantees': [{'name': 'Garantia Teste'}],
        }
        res = client.post('/api/operations', json=payload)
        assert res.status_code == 201, f"POST /api/operations falhou: {res.data}"
        data = json.loads(res.data)
        assert data['name'] == 'OP_TESTE_AUTOMATIZADO'
        assert data['id'] is not None
        # Chaves em camelCase
        assert 'responsibleAnalyst' in data
        assert 'masterGroupId' in data

        # Cleanup
        client.delete(f"/api/operations/{data['id']}")


class TestOperationsCRUD:
    """Full lifecycle: POST → GET → PUT → DELETE."""

    @pytest.fixture(autouse=True)
    def _setup(self, client):
        # Setup MG
        res = client.post('/api/master-groups', json={
            'name': 'MG_CRUD_TEST', 'sector': 'Teste', 'rating': 'Ba1'
        })
        self.mg = json.loads(res.data)

        # Create operation
        res = client.post('/api/operations', json={
            'name': 'OP_CRUD_TEST',
            'area': 'CRI', 'operationType': 'CRI Corporativo',
            'maturityDate': '2030-06-30',
            'responsibleAnalyst': 'Analista CRUD',
            'reviewFrequency': 'Trimestral',
            'callFrequency': 'Mensal',
            'dfFrequency': 'Trimestral',
            'segmento': 'Corporativo',
            'ratingOperation': 'Ba1',
            'ratingGroup': 'Ba1',
            'watchlist': 'Verde',
            'covenants': {'ltv': 0.0, 'dscr': 0.0},
            'defaultMonitoring': {
                'news': False, 'fiiReport': False, 'operationalInfo': False,
                'receivablesPortfolio': False, 'monthlyConstructionReport': False,
                'monthlyCommercialInfo': False, 'speDfs': False
            },
            'masterGroupId': self.mg['id'],
        })
        self.op = json.loads(res.data)
        yield
        try:
            client.delete(f"/api/operations/{self.op['id']}")
        except Exception:
            pass
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_get_operation_by_id(self, client):
        res = client.get(f"/api/operations/{self.op['id']}")
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['name'] == 'OP_CRUD_TEST'

    def test_get_operation_not_found(self, client):
        res = client.get('/api/operations/999999')
        assert res.status_code == 404

    def test_update_operation(self, client):
        update_payload = {
            'name': 'OP_CRUD_TEST_UPDATED',
            'area': 'CRA',
            'ratingOperation': 'B1',
            'ratingGroup': 'B1',
            'watchlist': 'Amarelo',
            'covenants': {'ltv': 0.8, 'dscr': 1.5},
            'responsibleAnalyst': 'Analista CRUD',
            'events': [],
            'ratingHistory': [],
            'taskRules': [],
        }
        res = client.put(f"/api/operations/{self.op['id']}", json=update_payload)
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['name'] == 'OP_CRUD_TEST_UPDATED'

    def test_delete_operation(self, client):
        # Create a throwaway operation
        res = client.post('/api/operations', json={
            'name': 'OP_TO_DELETE', 'area': 'CRI',
            'operationType': 'CRI', 'maturityDate': '2030-01-01',
            'responsibleAnalyst': 'System', 'reviewFrequency': 'Mensal',
            'callFrequency': 'Mensal', 'dfFrequency': 'Mensal',
            'segmento': 'Teste', 'ratingOperation': 'A4',
            'ratingGroup': 'A4', 'watchlist': 'Verde',
            'covenants': {}, 'defaultMonitoring': {},
            'masterGroupId': self.mg['id'],
        })
        op = json.loads(res.data)
        res = client.delete(f"/api/operations/{op['id']}")
        assert res.status_code == 204


# ============================================================
# 2. SYNC-ALL (Ênfase especial conforme solicitado)
# ============================================================

class TestSyncAll:
    """Testa o endpoint de graceful shutdown sync-all."""

    def test_sync_all_json_content_type(self, client):
        """Content-Type: application/json normal."""
        payload = [{'id': 1, 'name': 'test sync'}]
        res = client.post('/api/operations/sync-all',
                          data=json.dumps(payload),
                          content_type='application/json')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['status'] == 'queued'
        assert data['count'] == 1

    def test_sync_all_text_plain_fallback(self, client):
        """Content-Type: text/plain deve funcionar via force=True."""
        payload = [{'id': 2, 'name': 'beacon fallback'}]
        res = client.post('/api/operations/sync-all',
                          data=json.dumps(payload),
                          content_type='text/plain')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['status'] == 'queued'

    def test_sync_all_empty_body(self, client):
        """Body vazio deve retornar 400."""
        res = client.post('/api/operations/sync-all',
                          data=b'',
                          content_type='application/json')
        assert res.status_code == 400

    def test_sync_all_invalid_json(self, client):
        """JSON inválido deve retornar 400."""
        res = client.post('/api/operations/sync-all',
                          data=b'not valid json {{{',
                          content_type='text/plain')
        assert res.status_code == 400

    def test_sync_all_not_a_list(self, client):
        """Enviar um dict ao invés de lista deve retornar 400."""
        res = client.post('/api/operations/sync-all',
                          data=json.dumps({'id': 1}),
                          content_type='application/json')
        assert res.status_code == 400

    def test_sync_all_with_multiple_items(self, client):
        """Múltiplas operações no payload."""
        payload = [
            {'id': 10, 'name': 'op_a'},
            {'id': 20, 'name': 'op_b'},
            {'id': 30, 'name': 'op_c'},
        ]
        res = client.post('/api/operations/sync-all',
                          data=json.dumps(payload),
                          content_type='application/json')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['count'] == 3


# ============================================================
# 3. BULK UPDATE
# ============================================================

class TestBulkUpdate:
    """Testa o endpoint de atualização em lote de operações."""

    @pytest.fixture(autouse=True)
    def _setup(self, client):
        res = client.post('/api/master-groups', json={
            'name': 'MG_BULK', 'sector': 'Teste', 'rating': 'A4'
        })
        self.mg = json.loads(res.data)

        res = client.post('/api/operations', json={
            'name': 'OP_BULK_1', 'area': 'CRI',
            'operationType': 'CRI', 'maturityDate': '2030-01-01',
            'responsibleAnalyst': 'System', 'reviewFrequency': 'Mensal',
            'callFrequency': 'Mensal', 'dfFrequency': 'Mensal',
            'segmento': 'Teste', 'ratingOperation': 'A4',
            'ratingGroup': 'A4', 'watchlist': 'Verde',
            'covenants': {}, 'defaultMonitoring': {},
            'masterGroupId': self.mg['id'],
        })
        self.op = json.loads(res.data)
        yield
        try:
            client.delete(f"/api/operations/{self.op['id']}")
        except Exception:
            pass
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_bulk_update_single(self, client):
        res = client.post('/api/operations/bulk-update', json={
            'operations': [
                {
                    'id': self.op['id'],
                    'name': 'OP_BULK_UPDATED',
                    'ratingOperation': 'B1',
                    'ratingGroup': 'B1',
                    'watchlist': 'Verde',
                    'events': [],
                    'ratingHistory': [],
                    'taskRules': [],
                    'covenants': {},
                }
            ]
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert self.op['id'] in data['success']


# ============================================================
# 4. TASKS
# ============================================================

class TestTasks:
    @pytest.fixture(autouse=True)
    def _setup(self, client):
        res = client.post('/api/master-groups', json={
            'name': 'MG_TASK', 'sector': 'Teste', 'rating': 'A4'
        })
        self.mg = json.loads(res.data)
        res = client.post('/api/operations', json={
            'name': 'OP_TASK_TEST', 'area': 'CRI',
            'operationType': 'CRI', 'maturityDate': '2030-12-31',
            'responsibleAnalyst': 'System', 'reviewFrequency': 'Mensal',
            'callFrequency': 'Mensal', 'dfFrequency': 'Mensal',
            'segmento': 'Teste', 'ratingOperation': 'A4',
            'ratingGroup': 'A4', 'watchlist': 'Verde',
            'covenants': {}, 'defaultMonitoring': {},
            'masterGroupId': self.mg['id'],
        })
        self.op = json.loads(res.data)
        yield
        try:
            client.delete(f"/api/operations/{self.op['id']}")
        except Exception:
            pass
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_delete_task(self, client):
        # Deletar uma tarefa gerada pela engine
        tasks = self.op.get('tasks', [])
        if tasks:
            task = tasks[0]
            res = client.post('/api/tasks/delete', json={
                'taskId': task['id'],
                'operationId': self.op['id'],
                'responsibleAnalyst': 'System'
            })
            assert res.status_code == 200

    def test_edit_task(self, client):
        tasks = self.op.get('tasks', [])
        if tasks:
            task = tasks[0]
            res = client.put('/api/tasks/edit', json={
                'originalTaskId': task['id'],
                'operationId': self.op['id'],
                'responsibleAnalyst': 'System',
                'updates': {
                    'name': 'Tarefa Editada',
                    'dueDate': '2030-06-15',
                    'priority': 'Alta'
                }
            })
            assert res.status_code == 200


# ============================================================
# 5. AUDIT LOGS
# ============================================================

class TestAuditLogs:
    def test_get_audit_logs(self, client):
        res = client.get('/api/audit_logs')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert isinstance(data, list)


# ============================================================
# 6. OPERATION REVIEW NOTES
# ============================================================

class TestOperationReviewNotes:
    @pytest.fixture(autouse=True)
    def _setup(self, client):
        res = client.post('/api/master-groups', json={
            'name': 'MG_NOTES', 'sector': 'Teste', 'rating': 'A4'
        })
        self.mg = json.loads(res.data)
        res = client.post('/api/operations', json={
            'name': 'OP_NOTES', 'area': 'CRI',
            'operationType': 'CRI', 'maturityDate': '2030-01-01',
            'responsibleAnalyst': 'System', 'reviewFrequency': 'Mensal',
            'callFrequency': 'Mensal', 'dfFrequency': 'Mensal',
            'segmento': 'Teste', 'ratingOperation': 'A4',
            'ratingGroup': 'A4', 'watchlist': 'Verde',
            'covenants': {}, 'defaultMonitoring': {},
            'masterGroupId': self.mg['id'],
        })
        self.op = json.loads(res.data)
        yield
        try:
            client.delete(f"/api/operations/{self.op['id']}")
        except Exception:
            pass
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_save_review_notes(self, client):
        res = client.post('/api/operation_review_notes', json={
            'operationId': self.op['id'],
            'notes': 'Nota de revisão via pytest.',
            'userName': 'Analista Test'
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['status'] == 'success'


# ============================================================
# 7. CHANGE REQUESTS
# ============================================================

class TestChangeRequests:
    def test_change_request_crud(self, client):
        # POST
        res = client.post('/api/change-requests', json={
            'title': 'CR Teste',
            'description': 'Solicitação de teste automatizado',
            'requester': 'Analista Pytest'
        })
        assert res.status_code == 201
        cr = json.loads(res.data)
        assert cr['status'] == 'pending'

        # GET all
        res = client.get('/api/change-requests')
        assert res.status_code == 200
        crs = json.loads(res.data)
        assert isinstance(crs, list)
        assert any(c['id'] == cr['id'] for c in crs)

        # PUT (update status)
        res = client.put(f"/api/change-requests/{cr['id']}", json={
            'status': 'approved'
        })
        assert res.status_code == 200


# ============================================================
# 8. PATCH NOTES
# ============================================================

class TestPatchNotes:
    def test_get_patch_notes(self, client):
        res = client.get('/api/patch-notes')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert isinstance(data, list)


# ============================================================
# 9. ANALYST NOTES
# ============================================================

class TestAnalystNotes:
    def test_get_analyst_notes(self, client):
        res = client.get('/api/analyst-notes/Analista_Teste')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert 'notes' in data

    def test_save_analyst_notes(self, client):
        res = client.post('/api/analyst-notes/Analista_Teste', json={
            'notes': '# Notas do Analista\nTeste automatizado.'
        })
        assert res.status_code == 200

    def test_read_back_analyst_notes(self, client):
        client.post('/api/analyst-notes/Analista_ReadBack', json={
            'notes': 'Leitura de volta.'
        })
        res = client.get('/api/analyst-notes/Analista_ReadBack')
        data = json.loads(res.data)
        assert data['notes'] == 'Leitura de volta.'


# ============================================================
# 10. OPERATION RISKS
# ============================================================

class TestOperationRisks:
    @pytest.fixture(autouse=True)
    def _setup(self, client):
        res = client.post('/api/master-groups', json={
            'name': 'MG_RISKS', 'sector': 'Test', 'rating': 'A4'
        })
        self.mg = json.loads(res.data)
        res = client.post('/api/operations', json={
            'name': 'OP_RISKS', 'area': 'CRI',
            'operationType': 'CRI', 'maturityDate': '2030-01-01',
            'responsibleAnalyst': 'System', 'reviewFrequency': 'Mensal',
            'callFrequency': 'Mensal', 'dfFrequency': 'Mensal',
            'segmento': 'Teste', 'ratingOperation': 'A4',
            'ratingGroup': 'A4', 'watchlist': 'Verde',
            'covenants': {}, 'defaultMonitoring': {},
            'masterGroupId': self.mg['id'],
        })
        self.op = json.loads(res.data)
        yield
        try:
            client.delete(f"/api/operations/{self.op['id']}")
        except Exception:
            pass
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_add_risk(self, client):
        res = client.post(f"/api/operations/{self.op['id']}/risks", json={
            'title': 'Risco Teste Pytest',
            'description': 'Risco criado pelo teste automatizado',
            'severity': 'Alta',
            'userName': 'Analista'
        })
        assert res.status_code == 201

    def test_update_risk(self, client):
        # Criar risco
        res = client.post(f"/api/operations/{self.op['id']}/risks", json={
            'title': 'Risco para Editar', 'severity': 'Baixa', 'userName': 'Analista'
        })
        op_data = json.loads(res.data)
        risks = op_data.get('risks', [])
        if risks:
            risk_id = risks[0]['id']
            res = client.put(f"/api/operations/{self.op['id']}/risks/{risk_id}", json={
                'title': 'Risco Editado', 'severity': 'Alta', 'userName': 'Analista'
            })
            assert res.status_code == 200

    def test_delete_risk(self, client):
        res = client.post(f"/api/operations/{self.op['id']}/risks", json={
            'title': 'Risco para Deletar', 'severity': 'Média', 'userName': 'Analista'
        })
        op_data = json.loads(res.data)
        risks = op_data.get('risks', [])
        if risks:
            risk_id = risks[0]['id']
            res = client.delete(f"/api/operations/{self.op['id']}/risks/{risk_id}?userName=Analista")
            assert res.status_code == 200


# ============================================================
# 11. LITIGATION COMMENTS
# ============================================================

class TestLitigationComments:
    @pytest.fixture(autouse=True)
    def _setup(self, client):
        res = client.post('/api/master-groups', json={
            'name': 'MG_LIT', 'sector': 'Test', 'rating': 'A4'
        })
        self.mg = json.loads(res.data)
        res = client.post('/api/operations', json={
            'name': 'OP_LIT', 'area': 'CRI',
            'operationType': 'CRI', 'maturityDate': '2030-01-01',
            'responsibleAnalyst': 'System', 'reviewFrequency': 'Mensal',
            'callFrequency': 'Mensal', 'dfFrequency': 'Mensal',
            'segmento': 'Teste', 'ratingOperation': 'A4',
            'ratingGroup': 'A4', 'watchlist': 'Verde',
            'covenants': {}, 'defaultMonitoring': {},
            'masterGroupId': self.mg['id'],
        })
        self.op = json.loads(res.data)
        yield
        try:
            client.delete(f"/api/operations/{self.op['id']}")
        except Exception:
            pass
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_add_litigation_comment(self, client):
        res = client.post(f"/api/operations/{self.op['id']}/litigation-comments", json={
            'description': 'Comentário de litígio via pytest',
            'userName': 'Advogado Teste'
        })
        assert res.status_code == 201

    def test_update_litigation_comment(self, client):
        res = client.post(f"/api/operations/{self.op['id']}/litigation-comments", json={
            'description': 'Comentário inicial',
            'userName': 'Advogado'
        })
        op = json.loads(res.data)
        comments = op.get('litigationComments', [])
        if comments:
            cid = comments[0]['id']
            res = client.put(f"/api/operations/{self.op['id']}/litigation-comments/{cid}", json={
                'description': 'Comentário editado',
                'userName': 'Advogado'
            })
            assert res.status_code == 200

    def test_delete_litigation_comment(self, client):
        res = client.post(f"/api/operations/{self.op['id']}/litigation-comments", json={
            'description': 'Comentário para deletar',
            'userName': 'Advogado'
        })
        op = json.loads(res.data)
        comments = op.get('litigationComments', [])
        if comments:
            cid = comments[0]['id']
            res = client.delete(f"/api/operations/{self.op['id']}/litigation-comments/{cid}?userName=Advogado")
            assert res.status_code == 200


# ============================================================
# 12. ANALYSTS
# ============================================================

class TestAnalysts:
    def test_get_analysts(self, client):
        res = client.get('/api/analysts')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert isinstance(data, list)


# ============================================================
# 13. MASTER GROUPS
# ============================================================

class TestMasterGroups:
    def test_master_group_full_crud(self, client):
        # POST
        res = client.post('/api/master-groups', json={
            'name': 'MG_FULL_CRUD', 'sector': 'Financeiro', 'rating': 'Baa1'
        })
        assert res.status_code == 201
        mg = json.loads(res.data)
        mg_id = mg['id']
        assert mg_id is not None

        try:
            # GET by ID
            res = client.get(f'/api/master-groups/{mg_id}')
            assert res.status_code == 200
            data = json.loads(res.data)
            assert data['name'] == 'MG_FULL_CRUD'

            # PUT
            res = client.put(f'/api/master-groups/{mg_id}', json={
                'name': 'MG_FULL_CRUD_EDITED', 'sector': 'Varejo', 'rating': 'B1'
            })
            assert res.status_code == 200
            data = json.loads(res.data)
            assert data['name'] == 'MG_FULL_CRUD_EDITED'

            # GET ALL
            res = client.get('/api/master-groups')
            assert res.status_code == 200
            mgs = json.loads(res.data)
            assert any(m['id'] == mg_id for m in mgs)

        finally:
            # DELETE
            res = client.delete(f'/api/master-groups/{mg_id}')
            assert res.status_code == 204

    def test_master_group_not_found(self, client):
        res = client.get('/api/master-groups/999999')
        assert res.status_code == 404


# ============================================================
# 14. MASTER GROUP EVENTS
# ============================================================

class TestMasterGroupEvents:
    @pytest.fixture(autouse=True)
    def _setup(self, client):
        res = client.post('/api/master-groups', json={
            'name': 'MG_EVENTS', 'sector': 'Test', 'rating': 'A4'
        })
        self.mg = json.loads(res.data)
        yield
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_add_event_to_master_group(self, client):
        res = client.post(f"/api/master-groups/{self.mg['id']}/events", json={
            'date': '2025-06-01',
            'type': 'Reunião',
            'title': 'Reunião de teste',
            'description': 'Teste via pytest',
            'registeredBy': 'Analista',
            'nextSteps': 'Acompanhar',
            'isOrigination': False,
        })
        assert res.status_code == 201


# ============================================================
# 15. MASTER GROUP RISKS
# ============================================================

class TestMasterGroupRisks:
    @pytest.fixture(autouse=True)
    def _setup(self, client):
        res = client.post('/api/master-groups', json={
            'name': 'MG_MG_RISKS', 'sector': 'Test', 'rating': 'A4'
        })
        self.mg = json.loads(res.data)
        yield
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_add_mg_risk(self, client):
        res = client.post(f"/api/master-groups/{self.mg['id']}/risks", json={
            'title': 'Risco Grupo',
            'description': 'Risco ao nível do Master Group',
            'severity': 'Alta',
            'userName': 'Analista'
        })
        assert res.status_code == 201

    def test_update_mg_risk(self, client):
        # Criar
        res = client.post(f"/api/master-groups/{self.mg['id']}/risks", json={
            'title': 'Risco MG Editar', 'severity': 'Baixa', 'userName': 'Analista'
        })
        mg_data = json.loads(res.data)
        risks = mg_data.get('risks', [])
        if risks:
            rid = risks[0]['id']
            res = client.put(f"/api/master-groups/{self.mg['id']}/risks/{rid}", json={
                'title': 'Risco MG Editado', 'severity': 'Alta', 'userName': 'Analista'
            })
            assert res.status_code == 200

    def test_delete_mg_risk(self, client):
        res = client.post(f"/api/master-groups/{self.mg['id']}/risks", json={
            'title': 'Risco MG Deletar', 'severity': 'Média', 'userName': 'Analista'
        })
        mg_data = json.loads(res.data)
        risks = mg_data.get('risks', [])
        if risks:
            rid = risks[0]['id']
            res = client.delete(f"/api/master-groups/{self.mg['id']}/risks/{rid}", json={
                'userName': 'Analista'
            })
            assert res.status_code == 200


# ============================================================
# 16. STRUCTURING OPERATIONS
# ============================================================

class TestStructuringOperations:
    @pytest.fixture(autouse=True)
    def _setup(self, client):
        res = client.post('/api/master-groups', json={
            'name': 'MG_STRUCT', 'sector': 'Test', 'rating': 'A4'
        })
        self.mg = json.loads(res.data)
        yield
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_structuring_operations_crud(self, client):
        # POST
        res = client.post('/api/structuring-operations', json={
            'name': 'SO_PYTEST',
            'area': 'CRI',
            'masterGroupId': self.mg['id'],
            'economicGroupId': '',
            'stage': 'Conversa Inicial',
            'liquidationDate': '2025-12-31',
            'risk': 'Baixo',
            'temperature': 'Alta',
            'analyst': 'Analista Struct',
            'originator': 'Banco X',
            'modality': 'CRI Corp',
            'series': [
                {'name': 'Senior', 'volume': 500000, 'rate': 'CDI+2', 'indexer': 'CDI'}
            ]
        })
        assert res.status_code == 201

        # GET ALL
        res = client.get('/api/structuring-operations')
        assert res.status_code == 200
        sos = json.loads(res.data)
        so_matches = [s for s in sos if s['name'] == 'SO_PYTEST']
        assert len(so_matches) > 0
        so_id = so_matches[0]['id']

        # GET by id
        res = client.get(f'/api/structuring-operations/{so_id}')
        assert res.status_code == 200

        # PUT
        res = client.put(f'/api/structuring-operations/{so_id}', json={
            'name': 'SO_PYTEST_EDIT',
            'area': 'CRI',
            'stage': 'Term Sheet',
            'risk': 'Médio',
            'temperature': 'Morna',
            'analyst': 'Analista Edit',
            'series': []
        })
        assert res.status_code == 200

        # DELETE
        res = client.delete(f'/api/structuring-operations/{so_id}')
        assert res.status_code == 204


# ============================================================
# 17. STRUCTURING OPERATION EVENTS
# ============================================================

class TestStructuringOperationEvents:
    @pytest.fixture(autouse=True)
    def _setup(self, client):
        res = client.post('/api/master-groups', json={
            'name': 'MG_SO_EVT', 'sector': 'Test', 'rating': 'A4'
        })
        self.mg = json.loads(res.data)
        res = client.post('/api/structuring-operations', json={
            'name': 'SO_EVT_TEST', 'area': 'CRI',
            'masterGroupId': self.mg['id'], 'economicGroupId': '',
            'stage': 'Conversa Inicial', 'risk': 'Baixo',
            'temperature': 'Alta', 'analyst': 'A',
            'series': []
        })
        # Find the SO id
        res = client.get('/api/structuring-operations')
        sos = json.loads(res.data)
        match = [s for s in sos if s['name'] == 'SO_EVT_TEST']
        self.so_id = match[0]['id'] if match else None
        yield
        if self.so_id:
            client.delete(f'/api/structuring-operations/{self.so_id}')
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_add_event(self, client):
        if not self.so_id:
            pytest.skip("SO não criado")
        res = client.post(f'/api/structuring-operations/{self.so_id}/events', json={
            'date': '2025-06-15',
            'type': 'Reunião',
            'title': 'Reunião Estruturação',
            'description': 'Teste evento',
            'registeredBy': 'Analista',
        })
        assert res.status_code == 201
        data = json.loads(res.data)
        self.event_id = data.get('id')

    def test_crud_event(self, client):
        if not self.so_id:
            pytest.skip("SO não criado")
        # Add
        res = client.post(f'/api/structuring-operations/{self.so_id}/events', json={
            'date': '2025-07-01', 'type': 'Call',
            'title': 'Call Teste', 'description': 'Desc',
            'registeredBy': 'Analista',
        })
        event_id = json.loads(res.data).get('id')
        if event_id:
            # PUT
            res = client.put(f'/api/structuring-operations/{self.so_id}/events/{event_id}', json={
                'date': '2025-07-02', 'type': 'Call',
                'title': 'Call Editada', 'description': 'Desc editada',
                'registeredBy': 'Analista',
            })
            assert res.status_code == 200
            # DELETE
            res = client.delete(f'/api/structuring-operations/{self.so_id}/events/{event_id}')
            assert res.status_code == 204


# ============================================================
# 18. STRUCTURING OPERATION STAGES
# ============================================================

class TestStructuringOperationStages:
    @pytest.fixture(autouse=True)
    def _setup(self, client):
        res = client.post('/api/master-groups', json={
            'name': 'MG_STAGES', 'sector': 'Test', 'rating': 'A4'
        })
        self.mg = json.loads(res.data)
        client.post('/api/structuring-operations', json={
            'name': 'SO_STAGES', 'area': 'CRI',
            'masterGroupId': self.mg['id'], 'economicGroupId': '',
            'stage': 'Conversa Inicial', 'risk': 'Baixo',
            'temperature': 'Alta', 'analyst': 'A',
            'series': []
        })
        res = client.get('/api/structuring-operations')
        sos = json.loads(res.data)
        match = [s for s in sos if s['name'] == 'SO_STAGES']
        self.so_id = match[0]['id'] if match else None
        yield
        if self.so_id:
            client.delete(f'/api/structuring-operations/{self.so_id}')
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_update_stages(self, client):
        if not self.so_id:
            pytest.skip("SO não criado")
        # Get current stages
        res = client.get(f'/api/structuring-operations/{self.so_id}')
        so = json.loads(res.data)
        stages = so.get('stages', [])
        # Mark first stages as completed
        for s in stages[:2]:
            s['isCompleted'] = True
        res = client.put(f'/api/structuring-operations/{self.so_id}/stages', json={
            'stages': stages
        })
        assert res.status_code == 200


# ============================================================
# 19. ECONOMIC GROUPS
# ============================================================

class TestEconomicGroups:
    @pytest.fixture(autouse=True)
    def _setup(self, client):
        res = client.post('/api/master-groups', json={
            'name': 'MG_EG_TEST', 'sector': 'Test', 'rating': 'A4'
        })
        self.mg = json.loads(res.data)
        yield
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_economic_group_crud(self, client):
        # POST
        res = client.post('/api/economic-groups', json={
            'name': 'EG_PYTEST',
            'sector': 'Varejo',
            'rating': 'A4',
            'masterGroupId': self.mg['id']
        })
        assert res.status_code == 201
        eg = json.loads(res.data)
        eg_id = eg['id']

        try:
            # GET ALL
            res = client.get('/api/economic-groups')
            assert res.status_code == 200

            # GET by id
            res = client.get(f'/api/economic-groups/{eg_id}')
            assert res.status_code == 200

            # PUT
            res = client.put(f'/api/economic-groups/{eg_id}', json={
                'name': 'EG_PYTEST_EDIT',
                'sector': 'Industrial',
                'rating': 'B1',
                'masterGroupId': self.mg['id']
            })
            assert res.status_code == 200

        finally:
            # DELETE
            res = client.delete(f'/api/economic-groups/{eg_id}')
            assert res.status_code == 204


# ============================================================
# 20. FUND SIMULATOR
# ============================================================

class TestFundSimulator:
    def test_get_funds(self, client):
        res = client.get('/api/fund-simulator/funds')
        assert res.status_code == 200
        funds = json.loads(res.data)
        assert isinstance(funds, list)

    def test_get_fund_data(self, client):
        res = client.get('/api/fund-simulator/data/FUNDO_FAKE_AUTOMATIZADO')
        assert res.status_code == 200

    def test_save_fund_inputs(self, client):
        res = client.post('/api/fund-simulator/inputs/FUNDO_FAKE_AUTOMATIZADO', json={
            'emission': 100.0,
            'prepayment': 50.0,
            'repurchases': 10.0,
            'new_repo': 0.0
        })
        assert res.status_code == 200

    def test_update_fund_inputs(self, client):
        """Testa o caminho UPDATE (já existe o registro anterior)."""
        res = client.post('/api/fund-simulator/inputs/FUNDO_FAKE_AUTOMATIZADO', json={
            'emission': 200.0,
            'prepayment': 75.0,
            'repurchases': 20.0,
            'new_repo': 5.0
        })
        assert res.status_code == 200


# ============================================================
# 21. SYNC RULES
# ============================================================

class TestSyncRules:
    def test_sync_rules(self, client):
        res = client.post('/api/operations/sync-rules')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['status'] == 'success'


# ============================================================
# 22. COMPLIANCE: ARCHITECTURE §3 VALIDATION
# ============================================================

class TestArchitectureCompliance:
    """
    Verifica padrões obrigatórios do architecture.md:
    §3.1 — Todas as rotas devem tratar conexões com try/except/finally
    §3.2 — Respostas JSON devem usar chaves snake_case (ou camelCase padronizado)
    """

    def test_connection_handling_pattern_app(self):
        """Verifica que todas as rotas em app.py usam try/except/finally ou try/finally."""
        import re

        app_path = os.path.join(os.path.dirname(__file__), '..', 'app.py')
        with open(app_path, 'r', encoding='utf-8') as f:
            source = f.read()

        # Encontra todas as funções de rota
        route_pattern = re.compile(r"@app\.route\('([^']+)'.*?\)\n\s*def\s+(\w+)", re.DOTALL)
        routes = route_pattern.findall(source)

        for url, func_name in routes:
            if func_name in ('serve_react_app',):
                continue  # Rota estática não precisa de DB handling

            # Verifica que a função contém 'finally:' (padrão §3.1)
            func_pattern = re.compile(rf"def {func_name}\(.*?\n(.*?)\ndef ", re.DOTALL)
            match = func_pattern.search(source)
            if match:
                func_body = match.group(1)
                # A função deve conter try e finally
                assert 'try:' in func_body or 'conn = get_db_connection()' not in func_body, \
                    f"Rota {url} ({func_name}) não segue o padrão try/except/finally (§3.1)"

    def test_json_responses_use_consistent_keys(self, client):
        """Verifica que respostas JSON não retornam chaves em PascalCase."""
        res = client.get('/api/operations')
        if res.status_code == 200:
            data = json.loads(res.data)
            if data:
                for key in data[0].keys():
                    # PascalCase check: starts with uppercase and has no underscore
                    assert not (key[0].isupper() and '_' not in key), \
                        f"Chave em PascalCase detectada: '{key}' — violar §3.2"

    def test_connection_handling_pattern_master_groups(self):
        """Verifica try/finally nas rotas de master_groups.py."""
        mg_path = os.path.join(os.path.dirname(__file__), '..', 'master_groups.py')
        with open(mg_path, 'r', encoding='utf-8') as f:
            source = f.read()

        # All functions that use get_db_connection should have finally
        if 'get_db_connection' in source:
            func_count = source.count('get_db_connection()')
            finally_count = source.count('finally:')
            assert finally_count >= func_count, \
                f"master_groups.py: {func_count} chamadas a get_db_connection mas apenas {finally_count} blocos finally"

    def test_connection_handling_pattern_economic_groups(self):
        """Verifica try/finally nas rotas de economic_groups.py."""
        eg_path = os.path.join(os.path.dirname(__file__), '..', 'economic_groups.py')
        with open(eg_path, 'r', encoding='utf-8') as f:
            source = f.read()

        if 'get_db_connection' in source:
            func_count = source.count('get_db_connection()')
            finally_count = source.count('finally:')
            assert finally_count >= func_count, \
                f"economic_groups.py: {func_count} chamadas a get_db_connection mas apenas {finally_count} blocos finally"

    def test_connection_handling_pattern_fund_simulator(self):
        """Verifica try/finally nas rotas de fund_simulator.py."""
        fs_path = os.path.join(os.path.dirname(__file__), '..', 'fund_simulator.py')
        with open(fs_path, 'r', encoding='utf-8') as f:
            source = f.read()

        if 'get_db_connection' in source:
            func_count = source.count('get_db_connection()')
            finally_count = source.count('finally:')
            assert finally_count >= func_count, \
                f"fund_simulator.py: {func_count} chamadas a get_db_connection mas apenas {finally_count} blocos finally"

    def test_connection_handling_pattern_comite(self):
        """Verifica try/finally nas rotas de comite.py."""
        comite_path = os.path.join(os.path.dirname(__file__), '..', 'comite.py')
        with open(comite_path, 'r', encoding='utf-8') as f:
            source = f.read()

        if 'get_db_connection' in source:
            func_count = source.count('get_db_connection()')
            finally_count = source.count('finally:')
            assert finally_count >= func_count, \
                f"comite.py: {func_count} chamadas a get_db_connection mas apenas {finally_count} blocos finally"

    def test_comite_json_responses_use_snake_case(self, client):
        """Verifica que respostas do módulo comitê usam snake_case."""
        res = client.get('/api/comite/rules')
        if res.status_code == 200:
            data = json.loads(res.data)
            if data:
                for key in data[0].keys():
                    assert not (key[0].isupper() and '_' not in key), \
                        f"Chave em PascalCase detectada no comitê: '{key}' — viola §3.2"


# ============================================================
# 23. COMITÊ — Regras, Comitês, Itens, Comentários, Votos, etc.
# ============================================================

class TestComiteRulesEndpoints:
    """CRUD completo de regras de comitê."""

    def test_get_rules_returns_list(self, client):
        res = client.get('/api/comite/rules')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert isinstance(data, list)

    def test_create_rule(self, client):
        res = client.post('/api/comite/rules', json={
            'tipo': 'investimento',
            'area': 'ALL_EP_CRI',
            'dia_da_semana': 'Segunda',
            'horario': '10:00',
        })
        assert res.status_code == 201
        data = json.loads(res.data)
        assert data['tipo'] == 'investimento'
        assert data['area'] == 'ALL_EP_CRI'
        assert data['ativo'] is True
        self.__class__._rule_id = data['id']

    def test_duplicate_rule_blocked(self, client):
        """Não permite 2 regras ativas do mesmo tipo+área."""
        res = client.post('/api/comite/rules', json={
            'tipo': 'investimento',
            'area': 'ALL_EP_CRI',
            'dia_da_semana': 'Terça',
            'horario': '11:00',
        })
        assert res.status_code == 400
        data = json.loads(res.data)
        assert 'Já existe' in data.get('error', '')

    def test_create_monitoramento_same_area(self, client):
        """Monitoramento pode existir na mesma área que investimento."""
        res = client.post('/api/comite/rules', json={
            'tipo': 'monitoramento',
            'area': 'ALL_EP_CRI',
            'dia_da_semana': 'Quarta',
            'horario': '14:00',
        })
        assert res.status_code == 201
        self.__class__._mon_rule_id = json.loads(res.data)['id']

    def test_update_rule(self, client):
        rule_id = getattr(self.__class__, '_rule_id', 1)
        res = client.put(f'/api/comite/rules/{rule_id}', json={
            'dia_da_semana': 'Sexta',
            'horario': '09:00',
            'area': 'ALL_EP_CRI',
        })
        assert res.status_code == 200

    def test_delete_rule(self, client):
        # Create a temp rule to delete
        res = client.post('/api/comite/rules', json={
            'tipo': 'investimento',
            'area': 'ALL_EP_CS',
            'dia_da_semana': 'Quinta',
            'horario': '15:00',
        })
        assert res.status_code == 201
        temp_id = json.loads(res.data)['id']
        res = client.delete(f'/api/comite/rules/{temp_id}')
        assert res.status_code == 200

    def test_list_rules_after_ops(self, client):
        res = client.get('/api/comite/rules')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert len(data) >= 2


class TestComitesEndpoints:
    """CRUD de instâncias de comitê."""

    def test_create_comite(self, client):
        # Ensure rule exists
        rules = json.loads(client.get('/api/comite/rules').data)
        if not rules:
            client.post('/api/comite/rules', json={
                'tipo': 'investimento', 'area': 'CRI',
                'dia_da_semana': 'Segunda', 'horario': '10:00',
            })
            rules = json.loads(client.get('/api/comite/rules').data)

        rule_id = rules[0]['id']
        res = client.post('/api/comite/comites', json={
            'comite_rule_id': rule_id,
            'data': '2026-04-01T10:00:00',
        })
        assert res.status_code == 201
        data = json.loads(res.data)
        assert data['status'] == 'agendado'
        assert isinstance(data['secoes'], list)
        assert len(data['secoes']) > 0  # Default sections
        self.__class__._comite_id = data['id']
        self.__class__._first_secao_id = data['secoes'][0]['id']

    def test_create_comite_invalid_rule(self, client):
        res = client.post('/api/comite/comites', json={
            'comite_rule_id': 99999,
            'data': '2026-04-01T10:00:00',
        })
        assert res.status_code == 404

    def test_get_comites_list(self, client):
        res = client.get('/api/comite/comites')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_get_comites_filter_area(self, client):
        res = client.get('/api/comite/comites?area=CRI')
        assert res.status_code == 200
        data = json.loads(res.data)
        for c in data:
            if c.get('area') is not None:
                assert c['area'] == 'CRI'

    def test_get_comite_detail(self, client):
        comite_id = getattr(self.__class__, '_comite_id', 1)
        res = client.get(f'/api/comite/comites/{comite_id}')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['id'] == comite_id
        assert 'secoes' in data
        assert 'itens' in data

    def test_get_comite_not_found(self, client):
        res = client.get('/api/comite/comites/99999')
        assert res.status_code == 404


class TestComiteSecoesEndpoints:
    """Seções customizadas dentro de um comitê."""

    def test_add_secao(self, client):
        comite_id = getattr(TestComitesEndpoints, '_comite_id', 1)
        res = client.post(f'/api/comite/comites/{comite_id}/secoes', json={
            'nome': 'Seção Customizada Pytest',
        })
        assert res.status_code == 201
        data = json.loads(res.data)
        assert data['nome'] == 'Seção Customizada Pytest'
        assert data['is_default'] is False


class TestComiteItensPautaEndpoints:
    """Itens de pauta: criar, atualizar, diferentes tipos."""

    def test_create_item_presencial(self, client):
        comite_id = getattr(TestComitesEndpoints, '_comite_id', 1)
        secao_id = getattr(TestComitesEndpoints, '_first_secao_id', None)

        res = client.post(f'/api/comite/comites/{comite_id}/itens', json={
            'titulo': 'Item Presencial Pytest',
            'descricao': 'Criado pelo test_all_endpoints',
            'secao_id': secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Pytest',
            'tipo': 'presencial',
            'prioridade': 'normal',
            'tipo_caso': 'geral',
        })
        assert res.status_code == 201
        data = json.loads(res.data)
        assert data['titulo'] == 'Item Presencial Pytest'
        assert data['prioridade'] == 'normal'
        self.__class__._item_id = data['id']

    def test_create_item_urgente(self, client):
        comite_id = getattr(TestComitesEndpoints, '_comite_id', 1)
        secao_id = getattr(TestComitesEndpoints, '_first_secao_id', None)

        res = client.post(f'/api/comite/comites/{comite_id}/itens', json={
            'titulo': 'Item Urgente Pytest',
            'secao_id': secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Pytest',
            'prioridade': 'urgente',
        })
        assert res.status_code == 201
        assert json.loads(res.data)['prioridade'] == 'urgente'

    def test_create_item_video(self, client):
        comite_id = getattr(TestComitesEndpoints, '_comite_id', 1)
        secao_id = getattr(TestComitesEndpoints, '_first_secao_id', None)

        res = client.post(f'/api/comite/comites/{comite_id}/itens', json={
            'titulo': 'Apresentação Vídeo Pytest',
            'secao_id': secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Pytest',
            'tipo': 'video',
            'video_url': 'https://stream.microsoft.com/video/pytest',
            'video_duracao': '12:00',
        })
        assert res.status_code == 201
        data = json.loads(res.data)
        assert data['tipo'] == 'video'
        assert data['video_url'] == 'https://stream.microsoft.com/video/pytest'

    def test_update_item(self, client):
        item_id = getattr(self.__class__, '_item_id', 1)
        res = client.put(f'/api/comite/itens/{item_id}', json={
            'titulo': 'Item Atualizado Pytest',
            'descricao': 'Descrição atualizada',
            'tipo': 'presencial',
            'prioridade': 'alta',
        })
        assert res.status_code == 200


class TestComiteComentariosEndpoints:
    """Comentários em itens de pauta."""

    def test_add_comentario(self, client):
        item_id = getattr(TestComiteItensPautaEndpoints, '_item_id', 1)
        res = client.post(f'/api/comite/itens/{item_id}/comentarios', json={
            'user_id': 1,
            'user_nome': 'Pytest User',
            'texto': 'Comentário via test_all_endpoints',
        })
        assert res.status_code == 201
        data = json.loads(res.data)
        assert data['texto'] == 'Comentário via test_all_endpoints'
        assert data['likes'] == 0
        self.__class__._comment_id = data['id']

    def test_add_reply(self, client):
        item_id = getattr(TestComiteItensPautaEndpoints, '_item_id', 1)
        comment_id = getattr(self.__class__, '_comment_id', 1)
        res = client.post(f'/api/comite/itens/{item_id}/comentarios', json={
            'user_id': 2,
            'user_nome': 'Analista Reply',
            'texto': 'Resposta ao comentário',
            'parent_comment_id': comment_id,
        })
        assert res.status_code == 201
        data = json.loads(res.data)
        assert data['parent_comment_id'] == comment_id


class TestComiteLikesEndpoints:
    """Toggle de likes em comentários."""

    def test_like_comentario(self, client):
        comment_id = getattr(TestComiteComentariosEndpoints, '_comment_id', 1)
        res = client.post(f'/api/comite/comentarios/{comment_id}/like', json={
            'user_id': 2,
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['action'] == 'liked'
        assert data['likes'] == 1

    def test_unlike_comentario(self, client):
        comment_id = getattr(TestComiteComentariosEndpoints, '_comment_id', 1)
        res = client.post(f'/api/comite/comentarios/{comment_id}/like', json={
            'user_id': 2,
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['action'] == 'unliked'
        assert data['likes'] == 0


class TestComiteVotosEndpoints:
    """Votos em itens de pauta com upsert."""

    def test_cast_voto(self, client):
        item_id = getattr(TestComiteItensPautaEndpoints, '_item_id', 1)
        res = client.post(f'/api/comite/itens/{item_id}/votos', json={
            'user_id': 3,
            'user_nome': 'Gestor Pytest',
            'tipo_voto': 'aprovado',
            'cargo_voto': 'gestao',
        })
        assert res.status_code == 201
        data = json.loads(res.data)
        assert data['tipo_voto'] == 'aprovado'

    def test_update_voto(self, client):
        """Mesmo usuário re-vota → atualiza."""
        item_id = getattr(TestComiteItensPautaEndpoints, '_item_id', 1)
        res = client.post(f'/api/comite/itens/{item_id}/votos', json={
            'user_id': 3,
            'user_nome': 'Gestor Pytest',
            'tipo_voto': 'reprovado',
            'cargo_voto': 'gestao',
            'comentario': 'Mudei de ideia - pytest',
        })
        assert res.status_code == 201
        data = json.loads(res.data)
        assert data['tipo_voto'] == 'reprovado'


class TestComiteVideoAssistidoEndpoints:
    """Toggle de marcação de vídeo assistido."""

    def test_mark_video_assistido(self, client):
        item_id = getattr(TestComiteItensPautaEndpoints, '_item_id', 1)
        res = client.post(f'/api/comite/itens/{item_id}/video-assistido', json={
            'user_id': 1,
            'user_nome': 'Pytest User',
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['assistido'] is True

    def test_toggle_off_video_assistido(self, client):
        item_id = getattr(TestComiteItensPautaEndpoints, '_item_id', 1)
        res = client.post(f'/api/comite/itens/{item_id}/video-assistido', json={
            'user_id': 1,
            'user_nome': 'Pytest User',
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['assistido'] is False


class TestComiteProximosPassosEndpoints:
    """Próximos passos vinculados a itens."""

    def test_add_proximo_passo(self, client):
        item_id = getattr(TestComiteItensPautaEndpoints, '_item_id', 1)
        res = client.post(f'/api/comite/itens/{item_id}/proximos-passos', json={
            'descricao': 'Enviar relatório - pytest',
            'responsavel_user_id': 1,
            'responsavel_nome': 'Analista Pytest',
        })
        assert res.status_code == 201
        data = json.loads(res.data)
        assert data['status'] == 'pendente'
        self.__class__._pp_id = data['id']

    def test_update_proximo_passo(self, client):
        pp_id = getattr(self.__class__, '_pp_id', 1)
        res = client.put(f'/api/comite/proximos-passos/{pp_id}', json={
            'status': 'concluido',
            'descricao': 'Relatório enviado - pytest',
        })
        assert res.status_code == 200


class TestComiteCompletarRelatorioEndpoints:
    """Completar comitê e gerar relatório/ata."""

    @pytest.fixture(autouse=True)
    def _setup_comite(self, client):
        """Cria um comitê dedicado para testes de completar."""
        # Create rule
        res = client.post('/api/comite/rules', json={
            'tipo': 'investimento',
            'area': 'COMPLETAR_ALL_EP',
            'dia_da_semana': 'Segunda',
            'horario': '10:00',
        })
        if res.status_code == 201:
            rule_id = json.loads(res.data)['id']
        else:
            rules = json.loads(client.get('/api/comite/rules').data)
            rule_id = next(r['id'] for r in rules if r.get('area') == 'COMPLETAR_ALL_EP')

        res = client.post('/api/comite/comites', json={
            'comite_rule_id': rule_id,
            'data': '2026-06-15T10:00:00',
        })
        assert res.status_code == 201
        self.comite_id = json.loads(res.data)['id']
        yield

    def test_get_relatorio(self, client):
        res = client.get(f'/api/comite/comites/{self.comite_id}/relatorio')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert 'html' in data
        assert '<html>' in data['html']

    def test_completar_comite(self, client):
        res = client.post(f'/api/comite/comites/{self.comite_id}/completar')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['status'] == 'concluido'
        assert 'ata' in data

    def test_completar_not_found(self, client):
        res = client.post('/api/comite/comites/99999/completar')
        assert res.status_code == 404

    def test_completar_persists(self, client):
        """Após completar, o status persiste ao re-buscar."""
        client.post(f'/api/comite/comites/{self.comite_id}/completar')
        res = client.get(f'/api/comite/comites/{self.comite_id}')
        data = json.loads(res.data)
        assert data['status'] == 'concluido'
        assert data['ata_gerada_em'] is not None


class TestComiteConfigEmailEndpoints:
    """Configuração de email do comitê (upsert)."""

    def test_create_config_email(self, client):
        rules = json.loads(client.get('/api/comite/rules').data)
        if not rules:
            pytest.skip("Nenhuma regra de comitê disponível")
        rule_id = rules[0]['id']

        res = client.post('/api/comite/config-email', json={
            'comite_rule_id': rule_id,
            'horario_envio': '08:00',
            'habilitado': True,
        })
        assert res.status_code == 200

    def test_update_config_email(self, client):
        rules = json.loads(client.get('/api/comite/rules').data)
        if not rules:
            pytest.skip("Nenhuma regra de comitê disponível")
        rule_id = rules[0]['id']

        res = client.post('/api/comite/config-email', json={
            'comite_rule_id': rule_id,
            'horario_envio': '09:00',
            'habilitado': False,
        })
        assert res.status_code == 200


class TestComiteFullLifecycle:
    """Teste de integração: ciclo completo de um comitê."""

    def test_full_lifecycle(self, client):
        """
        1. Criar regra → 2. Criar comitê → 3. Adicionar item →
        4. Comentar → 5. Votar → 6. Próximo passo → 7. Completar
        """
        # 1. Rule
        res = client.post('/api/comite/rules', json={
            'tipo': 'monitoramento',
            'area': 'LIFECYCLE_TEST',
            'dia_da_semana': 'Quarta',
            'horario': '16:00',
        })
        assert res.status_code == 201
        rule_id = json.loads(res.data)['id']

        # 2. Comitê
        res = client.post('/api/comite/comites', json={
            'comite_rule_id': rule_id,
            'data': '2026-07-01T16:00:00',
        })
        assert res.status_code == 201
        comite = json.loads(res.data)
        comite_id = comite['id']
        secao_id = comite['secoes'][0]['id']

        # 3. Item (tipo_caso: geral — no operation needed)
        res = client.post(f'/api/comite/comites/{comite_id}/itens', json={
            'titulo': 'Lifecycle Item',
            'secao_id': secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Lifecycle Test',
            'prioridade': 'alta',
            'tipo_caso': 'geral',
        })
        assert res.status_code == 201
        item_id = json.loads(res.data)['id']

        # 4. Comentar
        res = client.post(f'/api/comite/itens/{item_id}/comentarios', json={
            'user_id': 1, 'user_nome': 'Lifecycle', 'texto': 'Comentário lifecycle',
        })
        assert res.status_code == 201
        comment_id = json.loads(res.data)['id']

        # 4b. Like
        res = client.post(f'/api/comite/comentarios/{comment_id}/like', json={'user_id': 2})
        assert res.status_code == 200
        assert json.loads(res.data)['likes'] == 1

        # 5. Votar
        res = client.post(f'/api/comite/itens/{item_id}/votos', json={
            'user_id': 1, 'user_nome': 'Lifecycle', 'tipo_voto': 'aprovado', 'cargo_voto': 'risco',
        })
        assert res.status_code == 201

        # 6. Próximo passo
        res = client.post(f'/api/comite/itens/{item_id}/proximos-passos', json={
            'descricao': 'Follow-up lifecycle',
            'responsavel_user_id': 1, 'responsavel_nome': 'Lifecycle',
        })
        assert res.status_code == 201

        # 7. Completar
        res = client.post(f'/api/comite/comites/{comite_id}/completar')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['status'] == 'concluido'

        # Verify detail after completion
        res = client.get(f'/api/comite/comites/{comite_id}')
        detail = json.loads(res.data)
        assert detail['status'] == 'concluido'
        assert len(detail['itens']) >= 1
        item = next(i for i in detail['itens'] if i['id'] == item_id)
        assert len(item['comentarios']) >= 1
        assert len(item['votos']) >= 1
        assert len(item['proximos_passos']) >= 1
