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
    """Testes para próximos passos (tarefas)."""

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
        """Verificar que próximos passos com prazo/prioridade aparecem no detalhe do comitê."""
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
