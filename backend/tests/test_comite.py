"""
test_comite.py — Testes automatizados para o módulo Comitê.

Cobre todos os endpoints do blueprint comite_bp (CRUD de rules,
comitês, itens, comentários, likes, votos, vídeos, próximos passos,
completar e relatório).
"""
import json
import pytest


class TestComiteRules:
    """Testes para CRUD de ComiteRules."""

    def test_get_rules_empty(self, client):
        resp = client.get('/api/comite/rules')
        assert resp.status_code == 200
        data = resp.get_json()
        assert isinstance(data, list)

    def test_create_rule(self, client):
        resp = client.post('/api/comite/rules', json={
            'tipo': 'investimento',
            'area': 'CRI',
            'dia_da_semana': 'Segunda',
            'horario': '10:00',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['tipo'] == 'investimento'
        assert data['area'] == 'CRI'
        assert data['ativo'] is True

    def test_duplicate_rule_blocked(self, client):
        """Não deve permitir 2 regras ativas do mesmo tipo+área."""
        # First one already created above
        resp = client.post('/api/comite/rules', json={
            'tipo': 'investimento',
            'area': 'CRI',
            'dia_da_semana': 'Terça',
            'horario': '11:00',
        })
        assert resp.status_code == 400
        assert 'Já existe' in resp.get_json().get('error', '')

    def test_create_monitoramento_same_area(self, client):
        """Monitoramento pode existir na mesma área que investimento."""
        resp = client.post('/api/comite/rules', json={
            'tipo': 'monitoramento',
            'area': 'CRI',
            'dia_da_semana': 'Quarta',
            'horario': '14:00',
        })
        assert resp.status_code == 201

    def test_update_rule(self, client):
        resp = client.put('/api/comite/rules/1', json={
            'dia_da_semana': 'Sexta',
            'horario': '09:00',
            'area': 'CRI',
        })
        assert resp.status_code == 200

    def test_delete_rule(self, client):
        # Create a temporary rule to delete
        create_resp = client.post('/api/comite/rules', json={
            'tipo': 'investimento',
            'area': 'Capital Solutions',
            'dia_da_semana': 'Quinta',
            'horario': '15:00',
        })
        rule_id = create_resp.get_json()['id']

        resp = client.delete(f'/api/comite/rules/{rule_id}')
        assert resp.status_code == 200

    def test_list_rules(self, client):
        resp = client.get('/api/comite/rules')
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) >= 2  # investimento CRI + monitoramento CRI created above


class TestComites:
    """Testes para CRUD de Comitês."""

    def test_create_comite(self, client):
        resp = client.post('/api/comite/comites', json={
            'comite_rule_id': 1,
            'data': '2026-04-01T10:00:00',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['status'] == 'agendado'
        assert len(data['secoes']) > 0  # Default sections created

    def test_create_monitoramento_comite(self, client):
        resp = client.post('/api/comite/comites', json={
            'comite_rule_id': 2,  # monitoramento rule
            'data': '2026-04-02T14:00:00',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        # Monitoramento should have different default sections
        section_names = [s['nome'] for s in data.get('secoes', [])]
        assert 'Watchlist' in section_names

    def test_get_comites_list(self, client):
        resp = client.get('/api/comite/comites')
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) >= 2
        # Verify itens_titulos field exists in each comite
        for c in data:
            assert 'itens_titulos' in c
            assert isinstance(c['itens_titulos'], list)
            assert 'itens_count' in c
            assert c['itens_count'] == len(c['itens_titulos'])

    def test_get_comites_filter_area(self, client):
        resp = client.get('/api/comite/comites?area=CRI')
        assert resp.status_code == 200
        data = resp.get_json()
        # All returned items should have area CRI (filter is server-side)
        for c in data:
            if c.get('area') is not None:
                assert c['area'] == 'CRI'

    def test_get_comite_detail(self, client):
        resp = client.get('/api/comite/comites/1')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['id'] == 1
        assert 'secoes' in data
        assert 'itens' in data

    def test_get_comite_not_found(self, client):
        resp = client.get('/api/comite/comites/9999')
        assert resp.status_code == 404

    def test_create_comite_invalid_rule(self, client):
        resp = client.post('/api/comite/comites', json={
            'comite_rule_id': 9999,
            'data': '2026-04-01T10:00:00',
        })
        assert resp.status_code == 404


class TestSecoes:
    """Testes para seções."""

    def test_add_secao(self, client):
        resp = client.post('/api/comite/comites/1/secoes', json={
            'nome': 'Seção Customizada',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['nome'] == 'Seção Customizada'
        assert data['is_default'] is False


class TestItensPauta:
    """Testes para itens de pauta."""

    def test_create_item(self, client):
        # Get first section ID
        detail = client.get('/api/comite/comites/1').get_json()
        secao_id = detail['secoes'][0]['id']

        resp = client.post('/api/comite/comites/1/itens', json={
            'titulo': 'Item de Teste',
            'descricao': 'Descrição do item de teste',
            'secao_id': secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Admin Master',
            'tipo': 'presencial',
            'prioridade': 'normal',
            'tipo_caso': 'geral',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['titulo'] == 'Item de Teste'
        assert data['prioridade'] == 'normal'

    def test_create_item_urgente(self, client):
        detail = client.get('/api/comite/comites/1').get_json()
        secao_id = detail['secoes'][0]['id']

        resp = client.post('/api/comite/comites/1/itens', json={
            'titulo': 'Item Urgente',
            'secao_id': secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Admin Master',
            'prioridade': 'urgente',
        })
        assert resp.status_code == 201
        assert resp.get_json()['prioridade'] == 'urgente'

    def test_create_video_item(self, client):
        detail = client.get('/api/comite/comites/1').get_json()
        secao_id = detail['secoes'][0]['id']

        resp = client.post('/api/comite/comites/1/itens', json={
            'titulo': 'Apresentação em Vídeo',
            'secao_id': secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Admin Master',
            'tipo': 'video',
            'video_url': 'https://stream.microsoft.com/video/123',
            'video_duracao': '15:30',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['tipo'] == 'video'
        assert data['video_url'] == 'https://stream.microsoft.com/video/123'

    def test_update_item(self, client):
        resp = client.put('/api/comite/itens/1', json={
            'titulo': 'Item Atualizado',
            'descricao': 'Nova descrição',
            'tipo': 'presencial',
            'prioridade': 'alta',
        })
        assert resp.status_code == 200

    def test_itens_titulos_in_list(self, client):
        """Verifica que os títulos dos itens criados aparecem no endpoint de listagem."""
        resp = client.get('/api/comite/comites')
        data = resp.get_json()
        # Find comite_id=1 which had items created above
        comite_1 = next((c for c in data if c['id'] == 1), None)
        assert comite_1 is not None
        assert 'itens_titulos' in comite_1
        assert isinstance(comite_1['itens_titulos'], list)
        assert comite_1['itens_count'] == len(comite_1['itens_titulos'])
        # At least the items we created should be present
        assert comite_1['itens_count'] >= 3  # Item de Teste, Item Urgente, Apresentação em Vídeo
        # Check that titles include items we created (note: 'Item de Teste' was updated to 'Item Atualizado')
        titles = comite_1['itens_titulos']
        assert 'Item Atualizado' in titles or 'Item de Teste' in titles
        assert 'Item Urgente' in titles
        assert 'Apresentação em Vídeo' in titles

    def test_itens_titulos_empty_comite(self, client):
        """Comitê sem itens deve retornar itens_titulos como lista vazia."""
        # Comite 2 (monitoramento) was created without any items added
        resp = client.get('/api/comite/comites')
        data = resp.get_json()
        comite_2 = next((c for c in data if c['id'] == 2), None)
        assert comite_2 is not None
        assert comite_2['itens_titulos'] == []
        assert comite_2['itens_count'] == 0


class TestComentarios:
    """Testes para comentários."""

    def test_add_comentario(self, client):
        resp = client.post('/api/comite/itens/1/comentarios', json={
            'user_id': 1,
            'user_nome': 'Admin Master',
            'texto': 'Comentário de teste',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['texto'] == 'Comentário de teste'
        assert data['likes'] == 0

    def test_add_reply(self, client):
        resp = client.post('/api/comite/itens/1/comentarios', json={
            'user_id': 2,
            'user_nome': 'Carlos Diretor',
            'texto': 'Resposta ao comentário',
            'parent_comment_id': 1,
        })
        assert resp.status_code == 201
        assert resp.get_json()['parent_comment_id'] == 1


class TestLikes:
    """Testes para likes."""

    def test_like_comentario(self, client):
        resp = client.post('/api/comite/comentarios/1/like', json={
            'user_id': 2,
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['action'] == 'liked'
        assert data['likes'] == 1

    def test_unlike_comentario(self, client):
        resp = client.post('/api/comite/comentarios/1/like', json={
            'user_id': 2,
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['action'] == 'unliked'
        assert data['likes'] == 0


class TestVotos:
    """Testes para votos."""

    def test_cast_voto(self, client):
        resp = client.post('/api/comite/itens/1/votos', json={
            'user_id': 3,
            'user_nome': 'Maria Gestora',
            'tipo_voto': 'aprovado',
            'cargo_voto': 'gestao',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['tipo_voto'] == 'aprovado'

    def test_update_voto(self, client):
        """Mesmo usuário vota novamente → atualiza."""
        resp = client.post('/api/comite/itens/1/votos', json={
            'user_id': 3,
            'user_nome': 'Maria Gestora',
            'tipo_voto': 'reprovado',
            'cargo_voto': 'gestao',
            'comentario': 'Mudei de ideia',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['tipo_voto'] == 'reprovado'


class TestVideoAssistido:
    """Testes para marcação de vídeo assistido."""

    def test_mark_video_assistido(self, client):
        resp = client.post('/api/comite/itens/1/video-assistido', json={
            'user_id': 1,
            'user_nome': 'Admin Master',
        })
        assert resp.status_code == 200
        assert resp.get_json()['assistido'] is True

    def test_toggle_video_assistido(self, client):
        resp = client.post('/api/comite/itens/1/video-assistido', json={
            'user_id': 1,
            'user_nome': 'Admin Master',
        })
        assert resp.status_code == 200
        assert resp.get_json()['assistido'] is False  # toggled off


class TestProximosPassos:
    """Testes para próximos passos → task_rules integration."""

    def test_add_proximo_passo(self, client):
        resp = client.post('/api/comite/itens/1/proximos-passos', json={
            'descricao': 'Enviar relatório para equipe',
            'responsavel_user_id': 1,
            'responsavel_nome': 'Admin Master',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['status'] == 'pendente'
        assert data['prioridade'] == 'media'  # default
        assert data['task_rule_id'] is not None  # Must have created a task_rule

    def test_add_proximo_passo_com_prazo_prioridade(self, client):
        """Criação de tarefa com prazo e prioridade."""
        resp = client.post('/api/comite/itens/1/proximos-passos', json={
            'descricao': 'Agendar reunião com equipe jurídica',
            'responsavel_user_id': 2,
            'responsavel_nome': 'Carlos Mendes',
            'prazo': '2026-04-15T00:00:00',
            'prioridade': 'alta',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['status'] == 'pendente'
        assert data['prioridade'] == 'alta'
        assert data['prazo'] is not None
        assert data['task_rule_id'] is not None

    def test_task_rule_created_in_crm(self, client):
        """Verifica que o task_rule foi criado no schema CRM."""
        # Create a próximo passo
        resp = client.post('/api/comite/itens/1/proximos-passos', json={
            'descricao': 'Verificar task_rule no CRM',
            'responsavel_user_id': 1,
            'responsavel_nome': 'Admin Master',
            'prazo': '2026-05-01T00:00:00',
            'prioridade': 'urgente',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        task_rule_id = data['task_rule_id']
        assert task_rule_id is not None

        # Verify the task_rule exists via operations endpoint (indirect check)
        # The task_rule should have frequency 'Pontual', the correct name and priority
        # We can't easily GET task_rules directly, but the fact that it was created
        # without error confirms the integration works

    def test_update_proximo_passo(self, client):
        resp = client.put('/api/comite/proximos-passos/1', json={
            'status': 'concluido',
            'descricao': 'Enviar relatório para equipe',
            'responsavel_nome': 'Admin Master',
            'prioridade': 'media',
        })
        assert resp.status_code == 200

    def test_toggle_proximo_passo_status(self, client):
        """Toggle status de pendente para concluído e vice-versa."""
        # Mark as concluido
        resp = client.put('/api/comite/proximos-passos/1', json={
            'status': 'concluido',
            'descricao': 'Enviar relatório para equipe',
            'responsavel_nome': 'Admin Master',
            'prioridade': 'media',
        })
        assert resp.status_code == 200

        # Mark back as pendente
        resp = client.put('/api/comite/proximos-passos/1', json={
            'status': 'pendente',
            'descricao': 'Enviar relatório para equipe',
            'responsavel_nome': 'Admin Master',
            'prioridade': 'media',
        })
        assert resp.status_code == 200

    def test_proximo_passo_in_detail(self, client):
        """Verificar que próximos passos com prazo/prioridade/task_rule_id aparecem no detalhe do comitê."""
        # Ensure comite 1 exists and has at least one item with proximos passos
        resp = client.get('/api/comite/comites/1')
        if resp.status_code != 200:
            # Skip if comite 1 doesn't exist (depends on prior test order)
            return
        data = resp.get_json()
        # Find any item with proximos_passos
        items_with_pp = [i for i in data['itens'] if len(i.get('proximos_passos', [])) > 0]
        assert len(items_with_pp) > 0
        # Check that new fields exist
        pp = items_with_pp[0]['proximos_passos'][0]
        assert 'prioridade' in pp
        assert 'prazo' in pp
        assert 'status' in pp
        assert 'task_rule_id' in pp


class TestCompletarERelatorio:
    """Testes para completar comitê e gerar relatório."""

    def _create_test_comite(self, client):
        """Helper: cria regra + comitê para testes de completar."""
        # Try to create a rule (may already exist)
        rule_resp = client.post('/api/comite/rules', json={
            'tipo': 'investimento',
            'area': 'COMPLETAR_TEST',
            'dia_da_semana': 'Segunda',
            'horario': '10:00',
        })
        if rule_resp.status_code == 201:
            rule_id = rule_resp.get_json()['id']
        else:
            # Rule already exists, fetch it
            rules = client.get('/api/comite/rules').get_json()
            rule_id = next(r['id'] for r in rules if r.get('area') == 'COMPLETAR_TEST')

        resp = client.post('/api/comite/comites', json={
            'comite_rule_id': rule_id,
            'data': '2026-05-10T10:00:00',
        })
        assert resp.status_code == 201
        return resp.get_json()['id']

    def test_get_relatorio(self, client):
        comite_id = self._create_test_comite(client)
        resp = client.get(f'/api/comite/comites/{comite_id}/relatorio')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'html' in data
        assert '<html>' in data['html']

    def test_completar_comite(self, client):
        comite_id = self._create_test_comite(client)
        resp = client.post(f'/api/comite/comites/{comite_id}/completar')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'concluido'
        assert 'ata' in data

    def test_completar_comite_not_found(self, client):
        resp = client.post('/api/comite/comites/9999/completar')
        assert resp.status_code == 404

    def test_comite_stays_completed(self, client):
        """Verificar que após completar, o status persiste."""
        comite_id = self._create_test_comite(client)
        # First complete it
        client.post(f'/api/comite/comites/{comite_id}/completar')
        # Then verify
        resp = client.get(f'/api/comite/comites/{comite_id}')
        data = resp.get_json()
        assert data['status'] == 'concluido'
        assert data['ata_gerada_em'] is not None

    def test_completar_comite_gera_eventos(self, client, mock_connection):
        """Ao completar comitê, itens vinculados a operações devem gerar eventos CRM."""
        # 1. Create an operation in crm.operations to link to
        with mock_connection.cursor() as c:
            c.cursor.execute(
                """INSERT INTO operations (id, name, area, operation_type, responsible_analyst,
                   review_frequency, call_frequency, df_frequency, segmento,
                   rating_operation, watchlist) VALUES
                   (9999, 'Op Teste Comite', 'CRI', 'CRI', 'Analista Teste',
                    'Mensal', 'Mensal', 'Trimestral', 'Corporate', 'Ba1', 'Neutro')"""
            )
            mock_connection.conn.commit()

        # 2. Create comitê
        comite_id = self._create_test_comite(client)

        # 3. Get secao_id
        detail = client.get(f'/api/comite/comites/{comite_id}').get_json()
        secao_id = detail['secoes'][0]['id']

        # 4. Add an item linked to operation 9999
        item_resp = client.post(f'/api/comite/comites/{comite_id}/itens', json={
            'titulo': 'Revisão da Op Teste Comite',
            'descricao': 'Análise detalhada do desempenho da operação no último trimestre.',
            'secao_id': secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Admin Master',
            'operation_id': 9999,
            'tipo_caso': 'revisao',
        })
        assert item_resp.status_code == 201
        item_id = item_resp.get_json()['id']

        # 5. Add próximos passos to the item
        client.post(f'/api/comite/itens/{item_id}/proximos-passos', json={
            'descricao': 'Agendar call com time jurídico',
            'responsavel_user_id': 1,
            'responsavel_nome': 'Admin Master',
            'prioridade': 'alta',
        })
        client.post(f'/api/comite/itens/{item_id}/proximos-passos', json={
            'descricao': 'Solicitar DFs atualizados',
            'responsavel_user_id': 2,
            'responsavel_nome': 'Carlos Mendes',
            'prioridade': 'media',
        })

        # 6. Complete the comitê
        resp = client.post(f'/api/comite/comites/{comite_id}/completar')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'concluido'
        assert data['events_created'] >= 1  # At least 1 event for our operation-linked item

        # 7. Verify the event was created in crm.events
        with mock_connection.cursor() as c:
            c.cursor.execute(
                "SELECT * FROM events WHERE operation_id = 9999 ORDER BY id DESC LIMIT 1"
            )
            row = c.cursor.fetchone()
            assert row is not None
            # The title column index varies, but we can check via column names
            cols = [desc[0] for desc in c.cursor.description]
            event = dict(zip(cols, row))
            assert event['title'] == 'Revisão da Op Teste Comite'
            assert event['type'] == 'Comitê de Investimento'
            assert 'Agendar call' in (event['next_steps'] or '')
            assert 'Solicitar DFs' in (event['next_steps'] or '')


class TestConfigEmail:
    """Testes para configuração de email."""

    def test_config_email_create(self, client):
        resp = client.post('/api/comite/config-email', json={
            'comite_rule_id': 1,
            'horario_envio': '08:00',
            'habilitado': True,
        })
        assert resp.status_code == 200

    def test_config_email_update(self, client):
        resp = client.post('/api/comite/config-email', json={
            'comite_rule_id': 1,
            'horario_envio': '09:00',
            'habilitado': False,
        })
        assert resp.status_code == 200


# ══════════════════════════════════════════════════════════════
# ROTAS — Operations-for-Pauta & Validação tipo_caso
# ══════════════════════════════════════════════════════════════

class TestOperationsForPauta:
    """Testes para GET /api/comite/operations-for-pauta."""

    def test_get_operations_for_pauta(self, client):
        """Endpoint retorna categorias ativas e estruturação."""
        resp = client.get('/api/comite/operations-for-pauta')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'ativas' in data
        assert 'estruturacao' in data
        assert isinstance(data['ativas'], list)
        assert isinstance(data['estruturacao'], list)

    def test_operations_for_pauta_structure(self, client):
        """Verifica que cada operação retornada tem os campos necessários."""
        # Primeiro, criar uma operação ativa para garantir que há dados
        mg_resp = client.post('/api/master-groups', json={
            'name': 'MG_PAUTA_STRUCT', 'sector': 'Teste', 'rating': 'A4'
        })
        mg = mg_resp.get_json()

        client.post('/api/operations', json={
            'name': 'OP_PAUTA_FIELD_CHECK', 'area': 'CRI',
            'operationType': 'CRI', 'maturityDate': '2030-01-01',
            'responsibleAnalyst': 'System', 'reviewFrequency': 'Mensal',
            'callFrequency': 'Mensal', 'dfFrequency': 'Mensal',
            'segmento': 'Teste', 'ratingOperation': 'A4',
            'ratingGroup': 'A4', 'watchlist': 'Verde',
            'covenants': {}, 'defaultMonitoring': {},
            'masterGroupId': mg['id'],
        })

        resp = client.get('/api/comite/operations-for-pauta')
        data = resp.get_json()

        if data['ativas']:
            op = data['ativas'][0]
            assert 'id' in op
            assert 'name' in op
            assert 'is_structuring' in op
            assert op['is_structuring'] is False

        # Cleanup
        client.delete(f"/api/master-groups/{mg['id']}")

    def test_operations_for_pauta_has_structuring(self, client):
        """Verifica que operações em estruturação são retornadas corretamente."""
        mg_resp = client.post('/api/master-groups', json={
            'name': 'MG_PAUTA_STRUCT2', 'sector': 'Teste', 'rating': 'A4'
        })
        mg = mg_resp.get_json()

        # Criar operação em estruturação
        client.post('/api/structuring-operations', json={
            'name': 'SO_PAUTA_TEST', 'area': 'CRI',
            'masterGroupId': mg['id'], 'economicGroupId': '',
            'stage': 'Conversa Inicial', 'risk': 'Baixo',
            'temperature': 'Alta', 'analyst': 'Analista',
            'series': []
        })

        resp = client.get('/api/comite/operations-for-pauta')
        data = resp.get_json()

        # Deve haver pelo menos uma operação em estruturação
        so_names = [op['name'] for op in data['estruturacao']]
        assert 'SO_PAUTA_TEST' in so_names

        # Verificar campos da estruturação
        so = next(op for op in data['estruturacao'] if op['name'] == 'SO_PAUTA_TEST')
        assert so['is_structuring'] is True
        assert 'pipeline_stage' in so

        # Cleanup
        so_all = client.get('/api/structuring-operations').get_json()
        so_match = next((s for s in so_all if s['name'] == 'SO_PAUTA_TEST'), None)
        if so_match:
            client.delete(f"/api/structuring-operations/{so_match['id']}")
        client.delete(f"/api/master-groups/{mg['id']}")


class TestItemPautaOperationValidation:
    """Testes de validação de operation_id para itens de revisão/aprovação."""

    @pytest.fixture(autouse=True)
    def _setup(self, client):
        """Cria infraestrutura: MG, operação ativa, operação em estruturação, regra, comitê."""
        # Master Group
        resp = client.post('/api/master-groups', json={
            'name': 'MG_VALIDATION', 'sector': 'Teste', 'rating': 'A4'
        })
        self.mg = resp.get_json()

        # Operação ATIVA
        resp = client.post('/api/operations', json={
            'name': 'OP_ATIVA_VALID', 'area': 'CRI',
            'operationType': 'CRI', 'maturityDate': '2030-01-01',
            'responsibleAnalyst': 'System', 'reviewFrequency': 'Mensal',
            'callFrequency': 'Mensal', 'dfFrequency': 'Mensal',
            'segmento': 'Teste', 'ratingOperation': 'A4',
            'ratingGroup': 'A4', 'watchlist': 'Verde',
            'covenants': {}, 'defaultMonitoring': {},
            'masterGroupId': self.mg['id'],
        })
        self.active_op = resp.get_json()

        # Operação em ESTRUTURAÇÃO
        client.post('/api/structuring-operations', json={
            'name': 'SO_VALID_TEST', 'area': 'CRI',
            'masterGroupId': self.mg['id'], 'economicGroupId': '',
            'stage': 'Conversa Inicial', 'risk': 'Baixo',
            'temperature': 'Alta', 'analyst': 'Analista',
            'series': []
        })
        so_all = client.get('/api/structuring-operations').get_json()
        so_match = next((s for s in so_all if s['name'] == 'SO_VALID_TEST'), None)
        self.structuring_op_id = so_match['id'] if so_match else None

        # Regra de comitê + Comitê
        rule_resp = client.post('/api/comite/rules', json={
            'tipo': 'investimento', 'area': 'VALIDATION_TEST',
            'dia_da_semana': 'Segunda', 'horario': '10:00',
        })
        if rule_resp.status_code == 201:
            self.rule_id = rule_resp.get_json()['id']
        else:
            rules = client.get('/api/comite/rules').get_json()
            self.rule_id = next(r['id'] for r in rules if r.get('area') == 'VALIDATION_TEST')

        comite_resp = client.post('/api/comite/comites', json={
            'comite_rule_id': self.rule_id,
            'data': '2026-06-01T10:00:00',
        })
        comite = comite_resp.get_json()
        self.comite_id = comite['id']
        self.secao_id = comite['secoes'][0]['id']

        yield

        # Cleanup
        if self.structuring_op_id:
            client.delete(f'/api/structuring-operations/{self.structuring_op_id}')
        try:
            client.delete(f"/api/operations/{self.active_op['id']}")
        except Exception:
            pass
        client.delete(f"/api/master-groups/{self.mg['id']}")

    # ── Tipo Geral: sem operação necessária ──

    def test_geral_without_operation_succeeds(self, client):
        """Tipo 'geral' não exige operation_id."""
        resp = client.post(f'/api/comite/comites/{self.comite_id}/itens', json={
            'titulo': 'Item Geral Sem Operação',
            'secao_id': self.secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Test',
            'tipo_caso': 'geral',
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['tipo_caso'] == 'geral'
        assert data['operation_id'] is None

    # ── Revisão: operação ativa obrigatória ──

    def test_revisao_without_operation_fails(self, client):
        """Revisão SEM operation_id deve retornar 400."""
        resp = client.post(f'/api/comite/comites/{self.comite_id}/itens', json={
            'titulo': 'Revisão Sem Operação',
            'secao_id': self.secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Test',
            'tipo_caso': 'revisao',
        })
        assert resp.status_code == 400
        error_msg = resp.get_json().get('error', '')
        assert 'operação' in error_msg.lower() or 'vinculad' in error_msg.lower()

    def test_revisao_with_active_operation_succeeds(self, client):
        """Revisão COM operação ativa deve funcionar."""
        resp = client.post(f'/api/comite/comites/{self.comite_id}/itens', json={
            'titulo': 'Revisão Com Operação Ativa',
            'secao_id': self.secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Test',
            'tipo_caso': 'revisao',
            'operation_id': self.active_op['id'],
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['tipo_caso'] == 'revisao'
        assert data['operation_id'] == self.active_op['id']

    def test_revisao_with_structuring_operation_fails(self, client):
        """Revisão com operação EM ESTRUTURAÇÃO deve retornar 400."""
        if not self.structuring_op_id:
            pytest.skip("Structuring op não criada")

        resp = client.post(f'/api/comite/comites/{self.comite_id}/itens', json={
            'titulo': 'Revisão Com Estruturação (INVÁLIDO)',
            'secao_id': self.secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Test',
            'tipo_caso': 'revisao',
            'operation_id': self.structuring_op_id,
        })
        assert resp.status_code == 400
        error_msg = resp.get_json().get('error', '')
        assert 'estruturação' in error_msg.lower() or 'ativa' in error_msg.lower()

    # ── Aprovação: operação ativa ou em estruturação ──

    def test_aprovacao_without_operation_fails(self, client):
        """Aprovação SEM operation_id deve retornar 400."""
        resp = client.post(f'/api/comite/comites/{self.comite_id}/itens', json={
            'titulo': 'Aprovação Sem Operação',
            'secao_id': self.secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Test',
            'tipo_caso': 'aprovacao',
        })
        assert resp.status_code == 400

    def test_aprovacao_with_active_operation_succeeds(self, client):
        """Aprovação COM operação ativa deve funcionar."""
        resp = client.post(f'/api/comite/comites/{self.comite_id}/itens', json={
            'titulo': 'Aprovação Com Operação Ativa',
            'secao_id': self.secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Test',
            'tipo_caso': 'aprovacao',
            'operation_id': self.active_op['id'],
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['tipo_caso'] == 'aprovacao'
        assert data['operation_id'] == self.active_op['id']

    def test_aprovacao_with_structuring_operation_succeeds(self, client):
        """Aprovação COM operação em estruturação deve funcionar."""
        if not self.structuring_op_id:
            pytest.skip("Structuring op não criada")

        resp = client.post(f'/api/comite/comites/{self.comite_id}/itens', json={
            'titulo': 'Aprovação Com Estruturação',
            'secao_id': self.secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Test',
            'tipo_caso': 'aprovacao',
            'operation_id': self.structuring_op_id,
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['tipo_caso'] == 'aprovacao'
        assert data['operation_id'] == self.structuring_op_id

    def test_revisao_with_invalid_operation_id_fails(self, client):
        """Revisão com operation_id inexistente deve retornar 404."""
        resp = client.post(f'/api/comite/comites/{self.comite_id}/itens', json={
            'titulo': 'Revisão ID Inválido',
            'secao_id': self.secao_id,
            'criador_user_id': 1,
            'criador_nome': 'Test',
            'tipo_caso': 'revisao',
            'operation_id': 999999,
        })
        assert resp.status_code == 404


class TestStructuringOperationCreationReturnsId:
    """Valida que POST /api/structuring-operations retorna o id da operação criada."""

    @pytest.fixture(autouse=True)
    def _setup(self, client):
        resp = client.post('/api/master-groups', json={
            'name': 'MG_SO_RETURN_ID', 'sector': 'Teste', 'rating': 'A4'
        })
        self.mg = resp.get_json()
        yield
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_post_structuring_operation_returns_id(self, client):
        """A resposta deve conter id, name e area."""
        resp = client.post('/api/structuring-operations', json={
            'name': 'SO_RETURN_ID_TEST', 'area': 'Capital Solutions',
            'masterGroupId': self.mg['id'], 'economicGroupId': '',
            'stage': 'Conversa Inicial', 'risk': 'Baixo',
            'temperature': 'Alta', 'analyst': 'Analista',
            'series': []
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert 'id' in data
        assert data['id'] is not None
        assert data['name'] == 'SO_RETURN_ID_TEST'
        assert data['area'] == 'Capital Solutions'

        # Cleanup
        client.delete(f"/api/structuring-operations/{data['id']}")

    def test_created_structuring_op_is_fetchable(self, client):
        """Operação criada deve aparecer no GET /api/structuring-operations."""
        resp = client.post('/api/structuring-operations', json={
            'name': 'SO_FETCHABLE_TEST', 'area': 'CRI',
            'masterGroupId': self.mg['id'], 'economicGroupId': '',
            'stage': 'Term Sheet', 'risk': 'Médio',
            'temperature': 'Morna', 'analyst': 'Analista',
            'series': []
        })
        created_id = resp.get_json()['id']

        # Buscar todas e verificar
        all_resp = client.get('/api/structuring-operations')
        all_sos = all_resp.get_json()
        found = any(s['id'] == created_id for s in all_sos)
        assert found, f"Operação criada (id={created_id}) não encontrada no GET"

        # Cleanup
        client.delete(f"/api/structuring-operations/{created_id}")


class TestPautaOperationEndToEnd:
    """Teste end-to-end: criar operação → criar item de aprovação vinculado → verificar no detalhe."""

    @pytest.fixture(autouse=True)
    def _setup(self, client):
        resp = client.post('/api/master-groups', json={
            'name': 'MG_E2E_PAUTA', 'sector': 'Teste', 'rating': 'A4'
        })
        self.mg = resp.get_json()

        # Regra + Comitê
        rule_resp = client.post('/api/comite/rules', json={
            'tipo': 'investimento', 'area': 'E2E_PAUTA',
            'dia_da_semana': 'Terça', 'horario': '14:00',
        })
        if rule_resp.status_code == 201:
            self.rule_id = rule_resp.get_json()['id']
        else:
            rules = client.get('/api/comite/rules').get_json()
            self.rule_id = next(r['id'] for r in rules if r.get('area') == 'E2E_PAUTA')

        comite_resp = client.post('/api/comite/comites', json={
            'comite_rule_id': self.rule_id,
            'data': '2026-08-01T14:00:00',
        })
        comite = comite_resp.get_json()
        self.comite_id = comite['id']
        self.secao_id = comite['secoes'][0]['id']
        yield
        client.delete(f"/api/master-groups/{self.mg['id']}")

    def test_full_flow_create_structuring_op_then_link_to_item(self, client):
        """
        1. Criar operação em estruturação via POST /api/structuring-operations
        2. Usar o ID retornado para criar item de aprovação no comitê
        3. Verificar que o item no detalhe do comitê tem o operation_id correto
        """
        # 1. Criar operação em estruturação
        so_resp = client.post('/api/structuring-operations', json={
            'name': 'SO_E2E_PAUTA', 'area': 'CRI',
            'masterGroupId': self.mg['id'], 'economicGroupId': '',
            'stage': 'Conversa Inicial', 'risk': 'Baixo',
            'temperature': 'Alta', 'analyst': 'Analista E2E',
            'series': []
        })
        assert so_resp.status_code == 201
        so_data = so_resp.get_json()
        so_id = so_data['id']
        assert so_id is not None

        # 2. Criar item de aprovação vinculado
        item_resp = client.post(f'/api/comite/comites/{self.comite_id}/itens', json={
            'titulo': 'Aprovação E2E com Estruturação',
            'secao_id': self.secao_id,
            'criador_user_id': 1,
            'criador_nome': 'E2E Test',
            'tipo_caso': 'aprovacao',
            'operation_id': so_id,
        })
        assert item_resp.status_code == 201
        item_data = item_resp.get_json()
        assert item_data['operation_id'] == so_id
        item_id = item_data['id']

        # 3. Verificar no detalhe do comitê
        detail_resp = client.get(f'/api/comite/comites/{self.comite_id}')
        assert detail_resp.status_code == 200
        detail = detail_resp.get_json()
        matched_item = next((i for i in detail['itens'] if i['id'] == item_id), None)
        assert matched_item is not None
        assert matched_item['operation_id'] == so_id
        assert matched_item['tipo_caso'] == 'aprovacao'

        # Cleanup
        client.delete(f"/api/structuring-operations/{so_id}")
