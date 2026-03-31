-- CRM Antigravity - Mock Data para o Módulo de Comitês
-- Execute este arquivo após o schema ter sido inicializado e o mock principal (mock_data.sql) ter sido executado (para garantir que operation_ids existam).

-- ====================================================================
-- 1. LIMPEZA TOTAL DAS TABELAS DO COMITÊ
-- ====================================================================
DELETE FROM cri_cra_dev.comite.comite_proximos_passos;
DELETE FROM cri_cra_dev.comite.comite_videos_assistidos;
DELETE FROM cri_cra_dev.comite.comite_votos;
DELETE FROM cri_cra_dev.comite.comite_likes;
DELETE FROM cri_cra_dev.comite.comite_comentarios;
DELETE FROM cri_cra_dev.comite.comite_itens_pauta;
DELETE FROM cri_cra_dev.comite.comite_secoes;
DELETE FROM cri_cra_dev.comite.comites;
DELETE FROM cri_cra_dev.comite.comite_rules;

-- ====================================================================
-- 2. REGRAS DE COMITÊ
-- ====================================================================
INSERT INTO cri_cra_dev.comite.comite_rules (id, tipo, area, dia_da_semana, horario, data_criacao, ativo) VALUES
(1, 'investimento', 'CRI', 'Segunda', '10:00', '2024-01-01T00:00:00', true),
(2, 'monitoramento', 'CRI', 'Quarta', '14:00', '2024-01-01T00:00:00', true),
(3, 'investimento', 'Capital Solutions', 'Quinta', '10:00', '2024-01-01T00:00:00', true);

-- ====================================================================
-- 3. COMITÊS
-- ====================================================================
-- ID 1: Comitê de Investimento CRI (Concluído)
-- ID 2: Comitê de Investimento CRI (Agendado)
-- ID 3: Comitê de Monitoramento CRI (Concluído)
INSERT INTO cri_cra_dev.comite.comites (id, comite_rule_id, data, status, ata_gerada_em) VALUES
(1, 1, '2024-10-15T10:00:00', 'concluido', '2024-10-15T12:30:00'),
(2, 1, '2026-10-15T10:00:00', 'agendado', NULL),
(3, 2, '2024-10-16T14:00:00', 'concluido', '2024-10-16T16:00:00');

-- ====================================================================
-- 4. SEÇÕES
-- ====================================================================
-- Seções do Comitê 1 (Investimento CRI)
INSERT INTO cri_cra_dev.comite.comite_secoes (id, comite_id, nome, ordem, is_default) VALUES
(1, 1, 'RI', 1, true),
(2, 1, 'Risco', 2, true),
(3, 1, 'Assuntos Gerais', 3, true),
(4, 1, 'Casos para Aprovação', 4, true),
(5, 1, 'Casos de Revisão', 5, true),
(6, 1, 'IA/Inovação', 6, true);

-- Seções do Comitê 2 (Investimento CRI Agendado)
INSERT INTO cri_cra_dev.comite.comite_secoes (id, comite_id, nome, ordem, is_default) VALUES
(7, 2, 'RI', 1, true),
(8, 2, 'Risco', 2, true),
(9, 2, 'Assuntos Gerais', 3, true),
(10, 2, 'Casos para Aprovação', 4, true),
(11, 2, 'Casos de Revisão', 5, true),
(12, 2, 'IA/Inovação', 6, true);

-- Seções do Comitê 3 (Monitoramento CRI)
INSERT INTO cri_cra_dev.comite.comite_secoes (id, comite_id, nome, ordem, is_default) VALUES
(13, 3, 'Assuntos Gerais', 1, true),
(14, 3, 'Watchlist', 2, true),
(15, 3, 'Assunto Recorrente da Semana', 3, true),
(16, 3, 'Inovação', 4, true);


-- ====================================================================
-- 5. ITENS DE PAUTA
-- ====================================================================
-- Ref base para operations: 10 (CRI Edifício Faria Lima), 30 (CRI Shopping Pátio Central), 101 (CRI Faria Lima Fase 2 - Estruturação), 104 (CRI Faria Lima Refin)
INSERT INTO cri_cra_dev.comite.comite_itens_pauta 
(id, comite_id, secao_id, titulo, descricao, criador_user_id, criador_nome, tipo, video_url, video_duracao, prioridade, operation_id, tipo_caso, created_at) VALUES

-- Comitê 1 (Casos para Aprovação)
(1, 1, 4, 'CRI Faria Lima Fase 2 - Aprovação Final', 'Aprovação para liquidação da Fase 2. Condições macro e garantias revisadas.', 1, 'Fernanda', 'presencial', NULL, NULL, 'urgente', 101, 'aprovacao', '2024-10-10T09:00:00'),
-- Comitê 1 (Assuntos Gerais)
(2, 1, 3, 'Atualização Pipeline Geral', 'Briefing sobre o andamento das operações na fase de due diligence.', 2, 'Ricardo', 'presencial', NULL, NULL, 'normal', NULL, 'geral', '2024-10-10T10:00:00'),
-- Comitê 1 (IA/Inovação)
(3, 1, 6, 'Demonstração de Scoring GenAI', 'Primeira análise de balanços usando LLM.', 3, 'Duarte', 'video', 'https://stream.microsoft.com/video/poc-ia', '08:45', 'normal', NULL, 'geral', '2024-10-11T14:00:00'),

-- Comitê 3 (Watchlist)
(4, 3, 14, 'CRI Shopping Pátio Central - Aumento Vacância', 'A vacância subiu de 18% para 32%, quebrando nosso limite interno de soft covenant. Colocada na watchlist amarela.', 1, 'Fernanda', 'presencial', NULL, NULL, 'alta', 30, 'revisao', '2024-10-12T09:00:00'),
(5, 3, 13, 'Revisão Taxas Selic', 'Impacto nos CRIs atrelados ao CDI. Apresentação semanal da curva de juros.', 2, 'Ricardo', 'video', 'https://stream.microsoft.com/video/selic-impact', '15:20', 'normal', NULL, 'geral', '2024-10-12T16:00:00');

-- ====================================================================
-- 6. COMENTÁRIOS E LIKES
-- ====================================================================
-- Comentários (item 1)
INSERT INTO cri_cra_dev.comite.comite_comentarios (id, item_pauta_id, user_id, user_nome, texto, parent_comment_id, created_at) VALUES
(1, 1, 3, 'Duarte', 'As garantias já foram protocoladas no cartório?', NULL, '2024-10-15T10:15:00'),
(2, 1, 1, 'Fernanda', 'Sim, recebemos as matrículas atualizadas ontem.', 1, '2024-10-15T10:16:00'),
(3, 1, 4, 'Comitê Operacional', 'Aprovado internamente pela mesa estruturadora sem ressalvas adicionais.', NULL, '2024-10-15T10:20:00');

-- Likes (comentário 3)
INSERT INTO cri_cra_dev.comite.comite_likes (id, comentario_id, user_id, created_at) VALUES
(1, 3, 1, '2024-10-15T10:21:00'),
(2, 3, 3, '2024-10-15T10:22:00');

-- Comentários (item 4)
INSERT INTO cri_cra_dev.comite.comite_comentarios (id, item_pauta_id, user_id, user_nome, texto, parent_comment_id, created_at) VALUES
(4, 4, 2, 'Ricardo', 'Precisamos visitar o shopping na próxima semana.', NULL, '2024-10-16T14:30:00');


-- ====================================================================
-- 7. VOTOS
-- ====================================================================
-- Votos para o Item 1 (aprovacao)
INSERT INTO cri_cra_dev.comite.comite_votos (id, item_pauta_id, user_id, user_nome, tipo_voto, cargo_voto, comentario, created_at, updated_at) VALUES
(1, 1, 1, 'Fernanda', 'aprovado', 'gestao', 'De acordo. Documentação toda redonda.', '2024-10-15T10:45:00', '2024-10-15T10:45:00'),
(2, 1, 2, 'Ricardo', 'aprovado', 'risco', 'Risco mitigado pela alienação fiduciária.', '2024-10-15T10:46:00', '2024-10-15T10:46:00'),
(3, 1, 3, 'Duarte', 'aprovado', 'credito', 'Spread adequado. Aprovado.', '2024-10-15T10:50:00', '2024-10-15T10:50:00');

-- Votos para o Item 4 (revisao)
INSERT INTO cri_cra_dev.comite.comite_votos (id, item_pauta_id, user_id, user_nome, tipo_voto, cargo_voto, comentario, created_at, updated_at) VALUES
(4, 4, 2, 'Ricardo', 'discussao', 'risco', 'Necessário agendar call emergencial.', '2024-10-16T14:45:00', '2024-10-16T14:45:00');


-- ====================================================================
-- 8. VÍDEOS ASSISTIDOS
-- ====================================================================
-- Item 3
INSERT INTO cri_cra_dev.comite.comite_videos_assistidos (id, item_pauta_id, user_id, user_nome, assistido, created_at) VALUES
(1, 3, 1, 'Fernanda', true, '2024-10-15T09:00:00'),
(2, 3, 2, 'Ricardo', true, '2024-10-15T09:10:00');

-- Item 5
INSERT INTO cri_cra_dev.comite.comite_videos_assistidos (id, item_pauta_id, user_id, user_nome, assistido, created_at) VALUES
(3, 5, 1, 'Fernanda', true, '2024-10-16T13:00:00');


-- ====================================================================
-- 9. PRÓXIMOS PASSOS
-- ====================================================================
-- Relacionado ao Item 1
INSERT INTO cri_cra_dev.comite.comite_proximos_passos (id, item_pauta_id, comite_id, descricao, responsavel_user_id, responsavel_nome, status, prazo, prioridade, created_at) VALUES
(1, 1, 1, 'Formalizar ata simplificada e enviar termo para assinatura digital.', 1, 'Fernanda', 'concluido', '2024-10-17T00:00:00', 'alta', '2024-10-15T11:00:00');

-- Relacionado ao Item 4
INSERT INTO cri_cra_dev.comite.comite_proximos_passos (id, item_pauta_id, comite_id, descricao, responsavel_user_id, responsavel_nome, status, prazo, prioridade, created_at) VALUES
(2, 4, 3, 'Agendar visita in-loco ao Shopping Pátio Central.', 2, 'Ricardo', 'pendente', '2024-10-25T00:00:00', 'urgente', '2024-10-16T15:00:00');

-- Próximo Passo Global (Sem item associado) do Comitê 2 (Agendado)
INSERT INTO cri_cra_dev.comite.comite_proximos_passos (id, item_pauta_id, comite_id, descricao, responsavel_user_id, responsavel_nome, status, prazo, prioridade, created_at) VALUES
(3, NULL, 2, 'Aviso prévio: Levantar operações com LTV próximo do limite antes do próximo comitê.', 3, 'Duarte', 'pendente', '2026-10-14T00:00:00', 'media', '2026-10-10T09:00:00');
