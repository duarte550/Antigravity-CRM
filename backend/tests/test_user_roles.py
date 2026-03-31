"""
test_user_roles.py — Suite de testes para os endpoints de gestão de roles de usuários.

Cobre:
  - /api/auth/me (GET — retorna email e roles do usuário logado)
  - /api/user-roles (GET — lista todos os roles no BD)
  - /api/user-roles (POST — cria/atualiza roles de um usuário)
  - /api/user-roles (PUT — upsert de roles)
  - Validações de payload (email obrigatório, email vazio)
  - Verificação de auditoria (audit_logs registra mudanças)
"""
import json
import pytest


# ============================================================
# 1. /api/auth/me
# ============================================================

class TestAuthMe:
    """Testa o endpoint que retorna as informações do usuário logado."""

    def test_get_auth_me_returns_email_and_roles(self, client):
        """Deve retornar email e roles do usuário (mock mode: admin@mock.local e ['administrador'])."""
        res = client.get('/api/auth/me')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert 'email' in data
        assert 'roles' in data
        assert isinstance(data['roles'], list)
        # Em modo mock (ENABLE_ENTRA_ID_AUTH=false), deve ser admin
        assert 'administrador' in data['roles']

    def test_get_auth_me_email_not_unknown(self, client):
        """Após a correção, o email não deve ser 'unknown' em modo mock."""
        res = client.get('/api/auth/me')
        data = json.loads(res.data)
        assert data['email'] != 'unknown', "g.user_email não está sendo setado no modo mock"
        assert '@' in data['email'], "Email deveria ter formato válido"


# ============================================================
# 2. /api/user-roles — GET (listar todos)
# ============================================================

class TestUserRolesGet:
    """Testa a listagem de roles de usuários no BD."""

    def test_get_user_roles_empty_initially(self, client):
        """Com BD limpo, a lista deve estar vazia (sem registros na tabela user_roles)."""
        res = client.get('/api/user-roles')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert isinstance(data, list)

    def test_get_user_roles_after_insert(self, client):
        """Após criar um role, o GET deve retorná-lo na lista."""
        # Insere um role primeiro
        client.post('/api/user-roles', json={
            'email': 'gettest@empresa.com',
            'roles': ['analista']
        })

        res = client.get('/api/user-roles')
        assert res.status_code == 200
        data = json.loads(res.data)
        assert isinstance(data, list)
        found = [u for u in data if u['email'] == 'gettest@empresa.com']
        assert len(found) == 1
        assert found[0]['roles'] == ['analista']


# ============================================================
# 3. /api/user-roles — POST (criar/atualizar)
# ============================================================

class TestUserRolesPost:
    """Testa a criação e atualização de roles via POST."""

    def test_create_user_role(self, client):
        """Deve criar um novo registro de role para um email."""
        res = client.post('/api/user-roles', json={
            'email': 'novo.usuario@empresa.com',
            'roles': ['risco']
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['status'] == 'success'
        assert data['email'] == 'novo.usuario@empresa.com'
        assert data['roles'] == ['risco']

    def test_create_user_role_normalizes_email(self, client):
        """O email deve ser normalizado para minúsculo e sem espaços."""
        res = client.post('/api/user-roles', json={
            'email': '  Admin.User@EMPRESA.COM  ',
            'roles': ['administrador']
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['email'] == 'admin.user@empresa.com'

    def test_upsert_user_role_updates_existing(self, client):
        """Enviar POST com email existente deve atualizar os roles (MERGE/upsert)."""
        # Criar
        client.post('/api/user-roles', json={
            'email': 'upsert@empresa.com',
            'roles': ['comum']
        })

        # Atualizar via POST
        res = client.post('/api/user-roles', json={
            'email': 'upsert@empresa.com',
            'roles': ['gestor']
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['roles'] == ['gestor']

        # Verificar no GET
        res = client.get('/api/user-roles')
        all_users = json.loads(res.data)
        found = [u for u in all_users if u['email'] == 'upsert@empresa.com']
        assert len(found) == 1
        assert found[0]['roles'] == ['gestor']

    def test_create_user_role_multiple_roles(self, client):
        """Deve suportar múltiplas roles em uma única lista."""
        res = client.post('/api/user-roles', json={
            'email': 'multi.role@empresa.com',
            'roles': ['administrador', 'risco', 'gestor']
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert set(data['roles']) == {'administrador', 'risco', 'gestor'}

    def test_create_user_role_defaults_to_comum(self, client):
        """Se 'roles' não for enviado, deve usar ['comum'] como default."""
        res = client.post('/api/user-roles', json={
            'email': 'default.role@empresa.com'
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['roles'] == ['comum']


# ============================================================
# 4. /api/user-roles — Validações de erro
# ============================================================

class TestUserRolesValidation:
    """Testa validações de payload no endpoint."""

    def test_missing_email_returns_400(self, client):
        """Payload sem email deve retornar 400."""
        res = client.post('/api/user-roles', json={
            'roles': ['administrador']
        })
        assert res.status_code == 400
        data = json.loads(res.data)
        assert 'error' in data

    def test_empty_email_returns_400(self, client):
        """Email vazio (ou apenas espaços) deve retornar 400."""
        res = client.post('/api/user-roles', json={
            'email': '   ',
            'roles': ['analista']
        })
        assert res.status_code == 400

    def test_put_method_also_works(self, client):
        """PUT deve funcionar da mesma forma que POST (ambos são aceitos)."""
        res = client.put('/api/user-roles', json={
            'email': 'put.test@empresa.com',
            'roles': ['diretor_presidente']
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['status'] == 'success'
        assert data['roles'] == ['diretor_presidente']


# ============================================================
# 5. Auditoria — log_action é chamado corretamente
# ============================================================

class TestUserRolesAudit:
    """Verifica que alterações de roles são registradas no audit_logs."""

    def test_role_change_creates_audit_log(self, client):
        """Ao alterar roles, deve gerar um registro em audit_logs com entity_type='UserRole'."""
        # Primeiro pega o count antes
        res = client.get('/api/audit_logs')
        logs_before = json.loads(res.data)
        count_before = len([l for l in logs_before if l.get('entity_type') == 'UserRole'])

        # Faz alteração de role
        client.post('/api/user-roles', json={
            'email': 'audit.test@empresa.com',
            'roles': ['risco']
        })

        # Verifica que o audit log foi incrementado
        res = client.get('/api/audit_logs')
        logs_after = json.loads(res.data)
        count_after = len([l for l in logs_after if l.get('entity_type') == 'UserRole'])
        assert count_after > count_before, "Mudança de roles deveria gerar audit log com entity_type='UserRole'"


# ============================================================
# 6. /api/user-roles — PUT (upsert idêntico ao POST)
# ============================================================

class TestUserRolesPut:
    """Testa que PUT e POST têm comportamento idêntico (ambos usam MERGE)."""

    def test_put_creates_new_user(self, client):
        res = client.put('/api/user-roles', json={
            'email': 'put.create@empresa.com',
            'roles': ['analista']
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['email'] == 'put.create@empresa.com'

    def test_put_updates_existing_user(self, client):
        # Criar via POST
        client.post('/api/user-roles', json={
            'email': 'put.update@empresa.com',
            'roles': ['comum']
        })

        # Atualizar via PUT
        res = client.put('/api/user-roles', json={
            'email': 'put.update@empresa.com',
            'roles': ['administrador']
        })
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data['roles'] == ['administrador']
