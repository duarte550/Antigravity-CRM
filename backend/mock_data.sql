-- CRM Mock Data Seeding Script (com testes para todas as funcionalidades)
USE cri_cra_dev.crm;

-- ====================================================================
-- 1. LIMPEZA TOTAL DE TODAS AS TABELAS
-- ====================================================================
DELETE FROM cri_cra_dev.crm.task_exceptions;
DELETE FROM cri_cra_dev.crm.rating_history;
DELETE FROM cri_cra_dev.crm.events;
DELETE FROM cri_cra_dev.crm.task_rules;
DELETE FROM cri_cra_dev.crm.sync_queue;
DELETE FROM cri_cra_dev.crm.operation_review_notes;
DELETE FROM cri_cra_dev.crm.operation_risks;
DELETE FROM cri_cra_dev.crm.operation_projects;
DELETE FROM cri_cra_dev.crm.operation_guarantees;
DELETE FROM cri_cra_dev.crm.audit_logs;
DELETE FROM cri_cra_dev.crm.change_requests;
DELETE FROM cri_cra_dev.crm.patch_notes;
DELETE FROM cri_cra_dev.crm.analyst_notes;
DELETE FROM cri_cra_dev.crm.fund_allocation_inputs;
DELETE FROM cri_cra_dev.crm.operation_series;
DELETE FROM cri_cra_dev.crm.operation_stages;
DELETE FROM cri_cra_dev.crm.operations;
DELETE FROM cri_cra_dev.crm.projects;
DELETE FROM cri_cra_dev.crm.guarantees;
DELETE FROM cri_cra_dev.crm.economic_groups;
DELETE FROM cri_cra_dev.crm.master_group_contacts;
DELETE FROM cri_cra_dev.crm.master_groups;

-- ====================================================================
-- 2. INSERÇÃO DE MASTER GROUPS E GRUPOS ECONÔMICOS
-- ====================================================================
INSERT INTO cri_cra_dev.crm.master_groups (id, name, sector, rating) VALUES
(1, 'Grupo Faria Lima & Shoppings', 'Real Estate / Shopping Centers', 'A4'),
(2, 'Agro forte S.A.', 'Agronegócio', 'Ba1'),
(3, 'Logística Expansão S.A.', 'Logística', 'Ba4'),
(4, 'Tech Infra Holding', 'Infraestrutura', 'A1');

INSERT INTO cri_cra_dev.crm.economic_groups (id, master_group_id, name, sector, rating, created_at) VALUES
(1, 1, 'Faria Lima Comercial', 'Real Estate', 'A4', '2024-01-01T00:00:00'),
(2, 1, 'Shoppings Sudeste', 'Shopping Centers', 'A3', '2024-01-01T00:00:00'),
(3, 2, 'Agro forte Holdings', 'Agronegócio', 'Ba1', '2024-01-01T00:00:00'),
(4, 3, 'TransLog Sul', 'Logística', 'Ba4', '2024-01-01T00:00:00');

INSERT INTO cri_cra_dev.crm.master_group_contacts (master_group_id, name, email, phone, role) VALUES
(1, 'Roberto Carlos', 'roberto@flima.com', '(11) 99999-1111', 'CFO'),
(1, 'Ana Clara', 'ana@flima.com', '(11) 99999-1112', 'RI'),
(2, 'João Agro', 'joao@agroforte.com', '(62) 98888-2222', 'Diretor Financeiro'),
(3, 'Maria Silva', 'maria@logexpansao.com', '(41) 97777-3333', 'Gerente de Tesouraria'),
(4, 'Pedro Tech', 'pedro@techinfra.com', '(31) 96666-4444', 'CEO');


-- ====================================================================
-- 3. INSERÇÃO ENTIDADES COMPARTILHADAS (Projetos e Garantias)
-- ====================================================================
INSERT INTO cri_cra_dev.crm.projects (id, name, status, state, city) VALUES
(1, 'Edifício Faria Lima Prime', 'Em Operação', 'SP', 'São Paulo'), 
(2, 'Complexo Agroindustrial Forte', 'Em Construção', 'GO', 'Goiânia'), 
(3, 'Shopping Pátio Central', 'Em Operação', 'RJ', 'Rio de Janeiro'),
(4, 'Fazendas Reunidas Bioenergia', 'Em Operação', 'MT', 'Sorriso'), 
(5, 'Centro Logístico Sul', 'Em Projeto', 'SC', 'Joinville'), 
(6, 'Datacenter SP1', 'Em Operação', 'SP', 'Campinas');

INSERT INTO cri_cra_dev.crm.guarantees (id, name, type, value, description) VALUES
(10, 'Alienação Fiduciária de Imóvel', 'Imóvel', 150000000.0, 'Prédio comercial'), 
(11, 'Cessão Fiduciária de Recebíveis', 'Recebíveis', 50000000.0, 'Recebíveis de aluguel'),
(12, 'Fiança Corporativa do Grupo', 'Fiança', 0.0, 'Fiança holding'), 
(13, 'Penhor de Ações da SPE', 'Ações', 0.0, 'Penhor de 100% das cotas'), 
(14, 'Aval dos Sócios', 'Aval', 0.0, 'Aval PF dos sócios majoritários');

-- ====================================================================
-- 4. INSERÇÃO DAS OPERAÇÕES (Estoque + Originação via is_structuring)
-- ====================================================================
INSERT INTO cri_cra_dev.crm.operations 
(id, name, master_group_id, economic_group_id, area, operation_type, maturity_date, responsible_analyst, review_frequency, call_frequency, df_frequency, segmento, rating_operation, watchlist, ltv, dscr, monitoring_news, monitoring_spe_dfs, status, description, moved_to_legacy_date, is_structuring, pipeline_stage, risk, temperature, liquidation_date, is_active, originator, modality, created_at) VALUES
-- ESTOQUE (is_structuring = FALSE ou NULL)
(10, 'CRI Edifício Faria Lima', 1, 1, 'CRI', 'CRI', '2032-06-30T00:00:00', 'Fernanda', 'Anual', 'Trimestral', 'Semestral', 'Asset Finance - FII', 'A4', 'Verde', 0.50, 2.5, true, true, 'Ativa', 'Operação estabilizada de locação comercial. Alocada em FIIs.', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, NULL, NULL, '2024-01-01T00:00:00'),
(20, 'Debênture Agro Forte', 2, 3, 'Capital Solutions', 'Debênture', '2029-09-30T00:00:00', 'Ricardo', 'Semestral', 'Mensal', 'Semestral', 'Crédito Corporativo', 'Ba1', 'Amarelo', 0.6, 1.5, true, false, 'Ativa', 'Dívida para ampliação de capacidade produtiva.', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, NULL, NULL, '2024-01-01T00:00:00'),
(30, 'CRI Shopping Pátio Central', 1, 2, 'CRI', 'CRI', '2027-03-31T00:00:00', 'Fernanda', 'Trimestral', 'Mensal', 'Trimestral', 'Asset Finance', 'B3', 'Amarelo', 0.75, 1.2, true, true, 'Ativa', 'Recuperação judicial, foco em trazer novas âncoras.', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, NULL, NULL, '2024-01-01T00:00:00'),
(40, 'CRA Fazendas Reunidas', 2, 3, 'CRA', 'CRA', '2031-08-31T00:00:00', 'Ricardo', 'Semestral', 'Trimestral', 'Semestral', 'Crédito Corporativo', 'Ba4', 'Verde', null, null, true, true, 'Ativa', 'Produção e exportação de soja e milho.', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, NULL, NULL, '2024-01-01T00:00:00'),
(50, 'CRI Logística Sul', 3, 4, 'CRI', 'CRI', '2028-02-28T00:00:00', 'Fernanda', 'Semestral', 'Mensal', 'Trimestral', 'Financiamento Construção', 'Ba6', 'Verde', 0.7, 1.6, true, true, 'Ativa', 'Galpões BTS BTL em SC.', NULL, FALSE, NULL, NULL, NULL, NULL, TRUE, NULL, NULL, '2024-01-01T00:00:00'),
(60, 'Debênture Tech Infra (Legado)', 4, NULL, 'Capital Solutions', 'Debênture', '2024-01-30T00:00:00', 'João', 'Anual', 'Anual', 'Anual', 'Infraestrutura', 'A1', 'Verde', 0.3, 3.5, false, false, 'Legada', 'Operação já liquidada.', '2024-02-05T00:00:00', FALSE, NULL, NULL, NULL, NULL, FALSE, NULL, NULL, '2024-01-01T00:00:00'),

-- ORIGINAÇÃO / ESTRUTURAÇÃO (is_structuring = TRUE)
(101, 'CRI Faria Lima Fase 2', 1, 1, 'CRI', NULL, NULL, 'Fernanda', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, false, NULL, NULL, NULL, TRUE, 'Em Estruturação', 'High Grade', 'Morno', '2024-12-15T00:00:00', TRUE, 'Orig Faria', 'Projeto', '2024-10-01T00:00:00'),
(102, 'CRA Agro Forte Expansão', 2, 3, 'CRA', NULL, NULL, 'Ricardo', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, false, NULL, NULL, NULL, TRUE, 'Mandato Assinado', 'High Yield', 'Quente', '2024-11-30T00:00:00', TRUE, 'Orig Agro', 'Corporativo', '2024-10-05T00:00:00'),
(103, 'Debênture Logística Sul', 3, 4, 'Capital Solutions', NULL, NULL, 'João', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, false, NULL, NULL, NULL, TRUE, 'Conversa Inicial', 'High Yield', 'Frio', '2025-03-01T00:00:00', TRUE, 'Orig Sul', 'Aquisição', '2024-10-10T00:00:00'),
(104, 'CRI Faria Lima Refin', 1, 1, 'CRI', NULL, NULL, 'Fernanda', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, false, NULL, NULL, NULL, TRUE, 'Comitê Aprovado', 'High Grade', 'Quente', '2024-10-15T00:00:00', TRUE, 'Orig Faria', 'Refin', '2024-09-01T00:00:00'),
(105, 'Debênture Tech Infra Nova', 4, NULL, 'Capital Solutions', NULL, NULL, 'João', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, false, NULL, NULL, NULL, TRUE, 'Liquidação', 'High Grade', 'Morno', '2024-10-30T00:00:00', FALSE, 'Orig Tech', 'Corporativo', '2024-08-01T00:00:00');

-- ====================================================================
-- 5. RELAÇÕES PROJETOS E GARANTIAS (Estoque)
-- ====================================================================
INSERT INTO cri_cra_dev.crm.operation_projects (operation_id, project_id) VALUES (10, 1), (20, 2), (30, 3), (40, 4), (50, 5), (60, 6);
INSERT INTO cri_cra_dev.crm.operation_guarantees (operation_id, guarantee_id) VALUES (10, 10), (20, 11), (20, 12), (30, 10), (30, 11), (40, 11), (40, 14), (50, 10), (60, 12);

-- ====================================================================
-- 6. DADOS DE SÉRIES E ETAPAS (Originação)
-- ====================================================================
-- Séries (Atreladas via operation_id, mesmo para estruturação)
INSERT INTO cri_cra_dev.crm.operation_series (operation_id, name, rate, indexer, volume, fund) VALUES
(101, 'Série Sênior', '2.5%', 'CDI', 100000000.00, 'FII XPTO'),
(101, 'Série Subordinada', '4.5%', 'CDI', 50000000.00, 'FII XPTO'),
(102, 'Série Única', '7.0%', 'IPCA', 85000000.00, 'Fundo Agro CRA'),
(103, 'Série 1', '3.0%', 'CDI', 100000000.00, 'Fundo A'),
(103, 'Série 2', '3.5%', 'CDI', 100000000.00, 'Fundo B'),
(104, 'Série Refinanciamento', '6.5%', 'IPCA', 50000000.00, 'FII ABC');

-- Etapas (Stages) - Pipeline Workflow 
INSERT INTO cri_cra_dev.crm.operation_stages (operation_id, order_index, name, is_completed) VALUES
(101, 0, 'Conversa Inicial', true), (101, 1, 'Proposta', true), (101, 2, 'Due Diligence', false), (101, 3, 'Aprovação', false), (101, 4, 'Liquidação', false),
(102, 0, 'Conversa Inicial', true), (102, 1, 'Proposta', true), (102, 2, 'Due Diligence', true), (102, 3, 'Aprovação', false), (102, 4, 'Liquidação', false),
(103, 0, 'Conversa Inicial', true), (103, 1, 'Proposta', false), (103, 2, 'Due Diligence', false), (103, 3, 'Aprovação', false), (103, 4, 'Liquidação', false),
(104, 0, 'Conversa Inicial', true), (104, 1, 'Proposta', true), (104, 2, 'Due Diligence', true), (104, 3, 'Aprovação', true), (104, 4, 'Liquidação', true);

-- ====================================================================
-- 7. EVENTOS E HISTORICOS (Estoque e Originação)
-- ====================================================================
-- Histórico de Ratings para Estoque
INSERT INTO cri_cra_dev.crm.rating_history (operation_id, date, rating_operation, rating_group, watchlist, sentiment, event_id) VALUES
(10, '2024-01-20T10:00:00', 'A4', 'A4', 'Verde', 'Neutro', NULL),
(20, '2024-02-10T09:00:00', 'Baa4', 'Baa4', 'Verde', 'Neutro', NULL),
(20, '2024-06-05T15:00:00', 'Ba1', 'Baa4', 'Amarelo', 'Negativo', NULL),
(30, '2023-11-20T16:00:00', 'C2', 'B1', 'Vermelho', 'Negativo', NULL),
(30, '2024-02-15T10:00:00', 'C2', 'B1', 'Vermelho', 'Neutro', NULL),
(30, '2024-05-30T14:00:00', 'B3', 'Ba5', 'Amarelo', 'Positivo', NULL),
(40, '2024-07-01T14:00:00', 'Ba4', 'Ba1', 'Verde', 'Neutro', NULL),
(50, '2024-03-01T10:00:00', 'Ba6', 'Ba4', 'Verde', 'Neutro', NULL),
(60, '2021-01-01T10:00:00', 'A1', 'A1', 'Verde', 'Neutro', NULL);

-- Eventos (Master Group, Estoque e Originação)
INSERT INTO cri_cra_dev.crm.events (master_group_id, operation_id, date, type, title, description, registered_by, next_steps, attention_points, our_attendees, operation_attendees, is_origination, operation_stage_id) VALUES
-- Master Groups Events
(1, NULL, '2024-05-10T10:00:00', 'Reunião', 'Governança', 'Alinhamento com CFO do Grupo sobre a estratégia 2025.', 'Fernanda', NULL, NULL, NULL, NULL, false, NULL),
(2, NULL, '2024-06-20T14:00:00', 'Call', 'Call Trimestral Holding', 'Aumento de margem Ebitda.', 'Ricardo', NULL, NULL, NULL, NULL, false, NULL),
-- Operações de Estoque Events
(NULL, 10, '2024-04-25T11:00:00', 'Call Trimestral', 'Acompanhamento', 'Vacância baixa.', 'Fernanda', 'Monitorar INCC.', 'Sem pontos.', 'Fernanda', 'Roberto CFO', false, NULL),
(NULL, 20, '2024-06-05T15:00:00', 'Mudança de Watchlist', 'Downgrade PDD', 'Aumento inesperado. Risco de quebra de cov.', 'Ricardo', 'Novo cronograma.', 'Covenant técnico', 'Ricardo', 'João Agro', false, NULL),
(NULL, 30, '2023-11-20T16:00:00', 'Reunião Especial', 'Aumento Vacância', 'Saída de ancoras.', 'Fernanda', 'Aprov. em assembleia.', 'Despejo da loja X', 'Fernanda', 'Adm Shopping', false, NULL),
-- Structuring Operations Events (is_origination = TRUE)
(NULL, 101, '2024-08-01T11:00:00', 'Upload de Documento', 'Term Sheet Assinada', 'Contrato inicial fechado com o cliente, pendente aprovação em comitê interno.', 'Fernanda', NULL, NULL, NULL, NULL, true, 2),
(NULL, 102, '2024-08-15T15:00:00', 'Reunião', 'Comitê Operacional', 'Termos totalmente fechados. Equipe aprovou.', 'Ricardo', NULL, NULL, NULL, NULL, true, 3),
(NULL, 103, '2024-09-01T15:00:00', 'Reunião Presencial', 'Conversa Inicial com o Cliente', 'Call introdutório para apresentação da operação de logística e viabilidade do indexador.', 'Tiago', NULL, NULL, NULL, NULL, true, 1);

-- ====================================================================
-- 8. TAREFAS (Rules e Exceptions)
-- ====================================================================
INSERT INTO cri_cra_dev.crm.task_rules (operation_id, name, frequency, start_date, end_date, description, priority, is_origination, operation_stage_id) VALUES
-- Estoque
(10, 'Revisão Política', 'Anual', '2024-01-20T00:00:00', '2032-06-30T00:00:00', 'Revisão de política de crédito anual.', 'Média', false, NULL),
(10, 'Call Trimestral', 'Trimestral', '2024-01-20T00:00:00', '2032-06-30T00:00:00', 'Call de acompanhamento.', 'Baixa', false, NULL),
(20, 'Revisão Gerencial Semestral', 'Semestral', '2024-02-10T00:00:00', '2029-09-30T00:00:00', 'Revisão periódica', 'Alta', false, NULL),
(30, 'Revisão Crise (Gerencial Trimestral)', 'Trimestral', '2023-01-15T00:00:00', '2027-03-31T00:00:00', 'Revisão de crise do shopping.', 'Urgente', false, NULL),
(50, 'Relatório Mensal de Obra', 'Mensal', '2024-03-30T00:00:00', '2025-12-31T00:00:00', 'Análise Eng.', 'Alta', false, NULL),
-- Originação
(101, 'Diligence Jurídica', 'Pontual', '2024-11-20T00:00:00', '2024-11-20T00:00:00', 'Revisar contratos.', 'Urgente', true, 3),
(101, 'KYC', 'Pontual', '2024-11-25T00:00:00', '2024-11-25T00:00:00', 'Verificar apontamentos.', 'Média', true, 3),
(102, 'Comitê 2', 'Pontual', '2024-11-15T00:00:00', '2024-11-15T00:00:00', 'Aprovar condições definitivas.', 'Alta', true, 4),
(103, 'Modelo DCF', 'Pontual', '2024-12-05T00:00:00', '2024-12-05T00:00:00', 'Valuation.', 'Alta', true, 2);


-- ====================================================================
-- 9. OUTROS DADOS COMPLEMENTARES
-- ====================================================================
-- Analyst Notes
INSERT INTO cri_cra_dev.crm.analyst_notes (analyst_name, notes, updated_at) VALUES 
('Fernanda', 'Lembrar de cobrar CFO na terça.', '2024-10-01T00:00:00');

-- Operation Risks
INSERT INTO cri_cra_dev.crm.operation_risks (operation_id, master_group_id, title, description, severity, created_at, updated_at) VALUES
(30, 1, 'Risco de Liquidez das SPEs', 'SPE12 está queimando caixa devido vacância.', 'Alta', '2024-09-01T10:00:00', '2024-09-01T10:00:00'),
(NULL, 2, 'Clima Severo', 'Risco de quebra de safra afetando Agro forte', 'Média', '2024-09-10T10:00:00', '2024-09-10T10:00:00');

-- Operation Review Notes
INSERT INTO cri_cra_dev.crm.operation_review_notes (operation_id, notes, updated_at, updated_by) VALUES
(10, 'Excelente ativo. Monitorar apenas macroeconomia.', '2024-10-05T00:00:00', 'Fernanda');

-- Audit Logs
INSERT INTO cri_cra_dev.crm.audit_logs (timestamp, user_name, action, entity_type, entity_id, details) VALUES
('2024-10-20T10:00:00', 'Fernanda', 'UPDATE', 'Operation', '10', 'Alterou rating de A3 para A4');

-- Change Requests
INSERT INTO cri_cra_dev.crm.change_requests (title, description, requester, status, created_at, updated_at) VALUES
('Filtros Avançados', 'Poder cruzar risco vs yield na analise de comparáveis', 'Ricardo', 'pending', '2024-10-25T10:00:00', '2024-10-25T10:00:00');

-- Fund Simulator Inputs
INSERT INTO cri_cra_dev.crm.fund_allocation_inputs (fund_name, emission, prepayment, repurchases, new_repo, updated_at) VALUES
('Fundo Agro CRA', 50000000.0, 10000000.0, 5000000.0, 0, '2024-10-25T10:00:00'),
('FII XPTO', 200000000.0, 25000000.0, 0.0, 15000000.0, '2024-10-25T10:00:00');

-- ====================================================================
-- 10. MOCK DE TABELAS EXTERNAS E INFORMAÇÕES FINANCEIRAS DOS FUNDOS
-- ====================================================================
-- Criando mocks das tabelas externas dentro do mesmo schema para evitar erro de NO_SUCH_CATALOG_EXCEPTION 
-- (O backend agora lê via variável de ambiente RISCO_TABLE e MIDDLE_TABLE)

-- Tabela: Fundos do Middle Office (Mock)
CREATE TABLE IF NOT EXISTS cri_cra_dev.crm.middle_fundos (
    codigo STRING PRIMARY KEY,
    area INT
);

-- Tabela: Dados Consolidados de Risco (Mock)
CREATE TABLE IF NOT EXISTS cri_cra_dev.crm.risco_dadosconsolidadoscris (
    Data TIMESTAMP,
    Fundo STRING,
    Info STRING,
    Valor FLOAT
);

-- Limpar Tabelas Externas para testes limpos
DELETE FROM cri_cra_dev.crm.middle_fundos WHERE codigo IN ('Fundo Agro CRA', 'FII XPTO', 'Fundo A', 'Fundo B');
DELETE FROM cri_cra_dev.crm.risco_dadosconsolidadoscris WHERE Fundo IN ('Fundo Agro CRA', 'FII XPTO', 'Fundo A', 'Fundo B');

-- Inserindo os fundos na tabela do Middle (Area = 8 para aparecer no simulador do CRM)
INSERT INTO cri_cra_dev.crm.middle_fundos (codigo, area) VALUES 
('Fundo Agro CRA', 8),
('FII XPTO', 8),
('Fundo A', 8),
('Fundo B', 8);

-- Inserindo os dados financeiros fictícios e as MTMs
INSERT INTO cri_cra_dev.crm.risco_dadosconsolidadoscris (Data, Fundo, Info, Valor) VALUES 
-- Fundo Agro CRA
('2024-10-25T00:00:00', 'Fundo Agro CRA', 'CRI IPCA - Financeiro', 150000000.00),
('2024-10-25T00:00:00', 'Fundo Agro CRA', 'Compromissadas - Financeiro', 20000000.00),
('2024-10-25T00:00:00', 'Fundo Agro CRA', 'PL - Financeiro', 140000000.00),
('2024-10-25T00:00:00', 'Fundo Agro CRA', 'Taxa Média MTM IPCA', 7.5),
('2024-10-25T00:00:00', 'Fundo Agro CRA', 'Taxa Média Curva IPCA', 8.0),

-- FII XPTO
('2024-10-25T00:00:00', 'FII XPTO', 'CRI CDI - Financeiro', 300000000.00),
('2024-10-25T00:00:00', 'FII XPTO', 'CRI IPCA - Financeiro', 50000000.00),
('2024-10-25T00:00:00', 'FII XPTO', 'Caixa Líquido - Financeiro', 45000000.00),
('2024-10-25T00:00:00', 'FII XPTO', 'PL - Financeiro', 350000000.00),
('2024-10-25T00:00:00', 'FII XPTO', 'Taxa Média MTM CDI', 3.2),
('2024-10-25T00:00:00', 'FII XPTO', 'Taxa Média Curva CDI', 3.5),

-- Fundos Auxiliares (Simulação Vazia/Limpa)
('2024-10-25T00:00:00', 'Fundo A', 'PL - Financeiro', 50000000.00),
('2024-10-25T00:00:00', 'Fundo B', 'PL - Financeiro', 75000000.00);
