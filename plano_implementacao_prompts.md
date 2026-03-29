# Plano de Implementação CRM Antigravity (v3 — Validado Integralmente)

Cada prompt abaixo instrui exaustivamente o Gemini 3.1 referenciando **todas** as regras do `architecture.md` e **todos** os requisitos do `To dos projeto CRM.md`, sem exceção.

---

## 🏗️ Fase 1: Estabilização de Ambiente (Sync Crítico + Rotas)

### Prompt:
> "Com base no guia @[.agents/rules/architecture.md], execute as correções infraestruturais:
>
> **1. Bug 415 — Sync Queue:**
> Analise o erro '415 Unsupported Media Type' em '/api/operations/sync-all'. A causa é o envio via `navigator.sendBeacon()` no evento `visibilitychange` (Graceful Shutdown descrito no architecture.md §3), que despacha Content-Type `text/plain`. Corrija de DUAS formas simultâneas:
> - **Frontend:** No handler de `visibilitychange`, troque o `sendBeacon(url, JSON.stringify(data))` por `sendBeacon(url, new Blob([JSON.stringify(data)], { type: 'application/json' }))`. Faça o mesmo ajuste em qualquer `fetch(..., { keepalive: true })` que esteja sem o header `'Content-Type': 'application/json'`.
> - **Backend (Flask):** Como fallback defensivo, no endpoint `sync_all_operations` em `app.py`, troque `request.json` por `request.get_json(force=True, silent=True)` dentro de um bloco `try/except/finally` (regra architecture.md §3.1). Se `None`, tente `json.loads(request.data)`.
>
> **2. Deletes no Sync:**
> Investigue o loop de processamento da fila de sync no frontend. Confirme se payloads com método `DELETE` são despachados pela `processGenericQueue` e pelo `sendBeacon` de fallback. No backend, confirme que a rota `sync-all` processa itens com ação de delete e não apenas upserts.
>
> **3. Separação de Rotas:**
> Reorganize o frontend React em rotas e diretórios distintos: `/originação`, `/monitoramento`, `/comites`. Adicione entradas no Enum `Page` em `types.ts` (architecture.md §4) para cada nova página. Leia `types.ts` com `view_file` antes de modificar (architecture.md §Instruções IA, regra 1)."

---

## 🏗️ Fase 2: Testes Automatizados e CI

### Prompt:
> "Seguindo @[.agents/rules/architecture.md] (regra IA §4 — testes obrigatórios para novas rotas):
>
> **1. Testes Backend:**
> Monte testes PyTest cobrindo **todos** os endpoints existentes em `app.py`. Mocke o `databricks-sql-connector` para não depender do cluster. Dê ênfase especial a:
> - Rota `sync-all`: teste com Content-Type `application/json`, com `text/plain` (deve funcionar via `force=True`), com payload contendo deletes.
> - Todos os CRUDs de `operations`, `structuring_operations`, `events`, `tasks`, `task_rules`, `operation_risks`, `master_groups`.
> - Confirme que todas as rotas tratam conexões com `try/except/finally` (architecture.md §3.1) e retornam JSON com chaves em snake_case (§3.2).
>
> **2. CI:**
> Crie arquivo de pipeline (GitHub Actions `.yml` ou Azure DevOps `azure-pipelines.yml`) que execute todos os testes a cada push/PR e valide sintaxe do TypeScript com `tsc --noEmit`."

---

## 🏗️ Fase 3: Schema do Banco e Tipagem (Backend + Frontend)

### Prompt:
> "Seguindo @[.agents/rules/architecture.md] (regra IA §6 — toda mudança de tabela via `@update_db.py`; regra §2 — atualizar `types.ts` ANTES dos componentes):
>
> **1. Alterações no `@update_db.py`:**
> - Criar o schema inteiramente novo `cri_cra_dev.comite` com as seguintes tabelas:
>   - `comite_rules`: id, tipo (investimento/monitoramento), area, dia_da_semana, horario, data_criacao, ativo.
>   - `comites`: id, comite_rule_id, data, status (agendado/concluido), ata_gerada_em.
>   - `comite_secoes`: id, comite_id, nome, ordem, is_default.
>   - `comite_itens_pauta`: id, comite_id, secao_id, titulo, descricao, criador_user_id, criador_nome, tipo (video/presencial), video_url, video_duracao, prioridade (normal/alta/urgente), operation_id (FK nullable p/ `cri_cra_dev.crm.operations` ou `structuring_operations`), tipo_caso (aprovacao/revisao/geral), created_at.
>   - `comite_comentarios`: id, item_pauta_id, user_id, user_nome, texto, parent_comment_id (FK p/ threading/respostas), created_at.
>   - `comite_likes`: id, comentario_id, user_id, created_at.
>   - `comite_votos`: id, item_pauta_id, user_id, user_nome, tipo_voto (aprovado/reprovado/discussao), cargo_voto (gestao/risco/diretoria), comentario, created_at, updated_at (registrar mudança e data).
>   - `comite_videos_assistidos`: id, item_pauta_id, user_id, user_nome, assistido (boolean), created_at.
>   - `comite_proximos_passos`: id, item_pauta_id, comite_id, descricao, responsavel_user_id, responsavel_nome, status (pendente/concluido), created_at.
>   - `comite_config_email`: id, comite_rule_id, horario_envio, habilitado (boolean).
>   - `users`: id, nome, email, roles (array/multivalor: administrador, risco, gestor, diretor_presidente, analista, comum).
> - Todas as DDLs devem usar bloco `try/except/finally` ao executar.
>
> **2. Atualizar `/types.ts` (usar `view_file` antes!):**
> - Declare: `Role = 'administrador' | 'risco' | 'gestor' | 'diretor_presidente' | 'analista' | 'comum'`
> - Declare: `TipoVoto = 'aprovado' | 'reprovado' | 'discussao'`
> - Declare: `CargoVoto = 'gestao' | 'risco' | 'diretoria'`
> - Declare: `PrioridadeComite = 'normal' | 'alta' | 'urgente'`
> - Declare tipos para: `ComiteRule`, `Comite`, `ItemPauta`, `ComentarioComite`, `VotoComite`, `ProximoPasso`, `VideoAssistido`, `User`.
> - Adicione novas entradas no Enum `Page` para as páginas de comitê/vídeo/carteira."

---

## 🏗️ Fase 4: Autenticação Mock (Preparação Entra ID)

### Prompt:
> "Seguindo @[.agents/rules/architecture.md] (UI.tsx para formulários, `types.ts` para tipos):
>
> **1. MockAuthContext:**
> Implemente um Context React (`MockAuthContext`) que exponha: `user: User` (id, nome, roles: Role[]) e helpers `hasRole(role)`, `canVote(cargo)`. O User pode ter **múltiplas roles simultaneamente** (ex: Administrador + Gestor). O Administrador tem poder total em todas as ferramentas e pode acumular outros cargos.
>
> **2. Dev Toggle Bar:**
> Crie uma barra fixa discreta na base da tela (visível apenas em ambiente de desenvolvimento), usando componentes de `UI.tsx`. Essa barra deve:
> - Permitir alternar o perfil mock entre: Administrador, Diretor Presidente, Gestor, Risco, Analista, Usuário Comum.
> - Exibir o nome e roles atuais do mock.
> - Ter um toggle «Simular EntraID Ligado/Desligado» (controlado pelo Admin — conforme requisito To Dos L62).
>
> **3. Restrições por Role (preparação):**
> - **Analistas e Gestores:** podem criar operações e tarefas nas páginas de operação ativa e originação.
> - **Hub do Analista:** visível apenas para roles 'analista'.
> - **Usuário Comum:** acesso read-only a todas as páginas. Não possui Hub do Analista. Não pode votar.
> - **Risco:** pode votar no comitê pelo voto de risco.
> - **Gestão:** pode votar no comitê pelo voto de gestão.
> - **Diretor Presidente:** pode votar pelo voto de diretoria.
> - **Administrador:** acesso total, pode dar cargos a outros usuários."

---

## 🏗️ Fase 5: UX Originação, Dashboard, Carteira e Hub Analista

### Prompt:
> "Use EXCLUSIVAMENTE Tailwind CSS e componentes de `components/UI.tsx` (Modal, Label, Input, Select, FormRow) conforme @[.agents/rules/architecture.md] §4 e regras IA §3 e §5. Leia `view_file` em `types.ts` e nos componentes relevantes antes de editar (regra IA §1). Toda interação de escrita deve usar o padrão Optimistic UI (architecture.md §3.3): atualizar state → `pushToGenericQueue` → localStorage → debounce → processGenericQueue.
>
> **1. Originação — PorFundoTab:**
> - Na primeira abertura, exibir automaticamente o fundo com **mais caixa disponível**.
> - Salvar via `localStorage` o último fundo que o usuário estava visualizando. Se existir cache, abrir naquele fundo; senão, fallback para o de maior caixa.
> - Em **todas as abas de originação** (não só PorFundoTab), adicionar filtros toggles para: 'High Yield' e 'High Grade'.
>
> **2. Dashboard / Resumo Geral (Tela Inicial):**
> - **Remover** a tabela de carteira completa desta página.
> - Substituir por seções compactas:
>   - Gráfico de bolinhas (Bubble Chart) de Watchlist mostrando **apenas operações que receberam alteração recente**.
>   - Lista de **alterações recentes de todos os usuários** (puxar de `audit_logs`).
>   - Card de **tarefas marcadas como importantes ou urgentes da semana**.
>   - Card de **novos riscos levantados** recentemente.
>   - Card de **novas operações adicionadas** recentemente.
>
> **3. Nova Página: Carteira Completa:**
> - Recriar a tabela detalhada de operações que foi removida do dashboard.
> - Adicionar no topo **quadro de resumo KPI** contendo:
>   - Volume agrupado por analista.
>   - Número total de operações.
>   - Número de revisões calculado por ano (baseado na periodicidade de cada operação).
>   - Número de casos em watchlist.
>   - Revisões em atraso.
>   - Revisões previstas para o mês corrente.
>
> **4. Hub do Analista (restrito a role 'analista' via MockAuthContext):**
> - Criar um **pipeline/tabuleiro kanban** de tarefas que o analista pretende executar, com etapas concluíveis.
> - Ao marcar uma tarefa como concluída, o sistema envia pela Optimistic Queue e o backend avança a próxima tarefa do pipeline.
> - Abaixo do pipeline, incluir dois quadros: **'Resumo da Semana Concluída'** e **'Resumo da Semana a Vir'**."

---

## 🏗️ Fase 6: Engine Core e Pauta de Comitês

### Prompt:
> "Desenvolva o módulo 'Comitê' usando Tailwind e aplicando a skill ui-ux-pro-max (@[.agents/rules/architecture.md]). Toda escrita via Optimistic Queue. Novas rotas backend com `try/except/finally` e JSON snake_case. Testes para cada endpoint novo (regra IA §4). Tabelas no schema `cri_cra_dev.comite` via `@update_db.py` (regra IA §6). Gostaria que essa página ficasse em uma rota diferente, exemplo /comites.
>
> **1. Página Geral de Comitês (Timeline):**
> - Exibir **timeline horizontal** de todos os comitês: passados brilham em verde com ícone de conclusão; o próximo comitê ativo (agendado, ainda não realizado) aparece destacado; comitês futuros além do próximo ficam ocultos.
> - Abaixo de cada **comitê concluído**, mostrar os próximos passos e status das tarefas geradas naquele comitê.
> - **Todos os comitês (passados e ativo)** clicáveis para acessar a página do comitê específico.
> - **Botão 'Adicionar Item na Pauta'** nesta página: abre modal onde o usuário deve selecionar **qual comitê** (apenas o ativo ou o próximo após o ativo) e **qual data**, e depois preencher os mesmos campos do formulário de criação da página do comitê específico.
> - **Filtros** por área específica (ex: CRI, CRA, Geral, etc.).
> - Para cada comitê de cada área, exibir **resumo dos últimos 4 comitês** realizados da mesma área.
>
> **2. Regras de Recorrência (Motor de Comitê):**
> - Comitês são criados com **regra de task recorrente semanal** (integrar com engine `task_rules`/`tasks` do architecture.md §2).
> - Cada regra define: tipo (investimento OU monitoramento), **área**, dia da semana, horário, data criação.
> - **Restrição absoluta:** deve haver **no máximo 1 comitê de investimento + 1 de monitoramento por área**.
>
> **3. Comitê Específico — Layout de Pauta (Seções):**
> - Para **Comitê de Investimentos**, seções default (nesta ordem): RI, Risco, Assuntos Gerais, Casos para Aprovação, Casos de Revisão, IA/Inovação.
> - Para **Comitê de Monitoramento**, seções default: Assuntos Gerais, Watchlist, Assunto Recorrente da Semana, Inovação.
> - Deve existir opção de **adicionar novas seções**, mas com **menor destaque visual** (botão secundário discreto).
>
> **4. Criação de Itens de Pauta:**
> - Campos obrigatórios: título, seção destino.
> - Campos opcionais: descrição, prioridade ('Urgente' ou 'Alta').
> - Campos automáticos: nome do usuário criador (puxado do MockAuthContext), data de criação.
> - Flag: 'Vídeo' ou 'Presencial'. Se vídeo: campo para URL do vídeo (Microsoft Stream) e duração.
> - Para **Casos para Aprovação**: obrigatório vincular a uma operação em originação (`structuring_operations`) ou ativa (`operations`). Tag com nome da operação e link. Deve ser possível **criar nova operação em estruturação** direto daqui (reutilizar mesmo modal de formulário existente). Exibir tag de aprovação.
> - Para **Casos de Revisão**: obrigatório vincular a uma operação ativa. Tag com nome da operação + link + **farol de watchlist atual**. Ordenar **sempre** por importância: Vermelho > Rosa > Amarelo > Verde. Mostrar **sentimento do analista** na conclusão. Ao expandir (sanfona), exibir **todos os campos da tarefa de conclusão de revisão**.
> - Prioridade 'Urgente'/'Alta' sobe o item para o **topo da lista** com **tag visual vermelha/laranja**.
>
> **5. Itens de Pauta — Comportamento Sanfona:**
> - **Não abrir nova tela.** Cada item expande/colapsa (accordion).
> - Na versão colapsada: título, prioridade (badge), tipo (vídeo/presencial), **duração do vídeo** (se houver), **quem assistiu** (avatares/nomes dos usuários que marcaram checkbox).
> - Na versão expandida: todas as informações + feed de **comentários** (nome do usuário, data, texto, botão de **like com contador**) + campo para **novo comentário**.
>
> **6. Funcionalidades de Vídeo no Comitê:**
> - Cada item com vídeo: **checkbox 'Assistir'** para marcar como visto. Registrar por usuário no banco (`comite_videos_assistidos`).
> - Exibir próximo ao item na pauta **quem assistiu** o vídeo.
> - Para casos com vídeo, botão para **solicitar detalhamento/discussão no próximo comitê**.
>
> **7. Automação — Revisões de Crédito:**
> - Quando uma tarefa de **revisão de crédito (política ou gerencial)** é **concluída** no módulo de Monitoramento, o sistema deve automaticamente **criar um item na pauta do próximo comitê de investimentos daquela área específica**, importando os ratings/warnings atuais da operação.
>
> **8. Próximos Passos e Tarefas (durante o comitê):**
> - Cada item da pauta pode gerar campo de **próximos passos** e **tarefas pontuais** atribuídas a uma pessoa indicada (default: criador do item, mas pode ser outra pessoa).
> - Itens de comitê ligados a operações ativas/em estruturação devem **salvar suas tarefas e eventos nas tabelas da operação** em `cri_cra_dev.crm` (não apenas no schema `comite`).
>
> **9. Relatório de Resumo da Pauta (pré-comitê):**
> - Botão que gere relatório conciso em **HTML formatado para e-mail Outlook**: título de cada item, descrição, criador, nº comentários, status de aprovação (Aprovado/Reprovado/Discussão em Comitê), **quem falta aprovar**.
> - **Envio automático de e-mail:** configurável com **horário** no dia anterior ao comitê. Opção de **desabilitar** envio.
>
> **10. Botão 'Completar Comitê' (pós-comitê):**
> - Gera **ata completa** diferente do relatório: todos os itens da pauta, comentários de cada um, tarefas geradas, próximos passos atribuídos. Congela edições do comitê no banco."

---

## 🏗️ Fase 7: Página de Vídeo (YouTube-Style), Votação Tríplice e Ata Final

### Prompt:
> "Integre a página de visualização de vídeos e o sistema triplo de aprovações. Use Tailwind, `UI.tsx` e Optimistic Queue conforme @[.agents/rules/architecture.md]. Adicione testes para cada endpoint novo (regra §4).
>
> **1. Página de Vídeo (YouTube-Style):**
> - Tela complementar que se abre ao clicar em itens de vídeo da pauta do comitê.
> - **Player central** em tamanho padrão YouTube. Vídeo sempre provindo do **Microsoft Stream** (iframe embed). **Caso o vídeo não esteja disponível, exibir indicação clara** (fallback visual).
> - **Sidebar lateral** ao lado do vídeo contendo:
>   - Resumo/descrição do vídeo (inserido pelo criador do item).
>   - Principais **riscos** puxados da operação vinculada (se existirem, via `operation_risks`).
>   - **Ratings** da operação, **watchlist** e **sentimento** (se existirem).
>   - Nome da revisão e **para qual comitê e data** foi submetida.
>
> **2. Espaço de Votação (abaixo do player):**
> - **Para itens de aprovação:** botões Aprovado, Reprovado, Discutir em Comitê.
>   - Ao clicar **Reprovado ou Discutir**: exibir sugestão insistente (mas não bloqueante) para o usuário comentar o porquê.
>   - O usuário **pode mudar seu voto**. Registrar no banco: user_id, tipo de voto, data original e data de cada mudança (histórico completo de alterações).
>   - Votos só habilitados para quem possui a Role correspondente (Gestão → voto gestão; Risco → voto risco; Diretor Presidente → voto diretoria). Demais não podem votar.
> - **Para vídeos não-aprovação:** botão simples 'Marcar como Assistido' para aquele usuário, registrando no banco.
>
> **3. Faróis Tríplices de Aprovação:**
> - Em destaque na página: 3 indicadores semafóricos (verde/amarelo/vermelho):
>   - **Aprovação Time de Gestão**
>   - **Aprovação Risco**
>   - **Aprovação Diretoria**
> - Abaixo de cada farol: comentário justificativo de quem votou + nome + data.
> - Estes faróis e comentários devem ser **os mesmos dados** apresentados na página do comitê específico (fonte única no banco).
> - Tags indicando **quem falta aprovar** em cada trilha.
>
> **4. Comentários (abaixo da votação):**
> - Feed de comentários com: nome do usuário, data, texto.
> - Funcionalidade de **resposta** (threading com `parent_comment_id`).
> - Botão de **like com contador**.
> - os comentários dessa pagina devem ser os mesmos comentários da pagina do comitê específico.
> - comentários devem ter a funcionalidade de resposta
>
> **5. Aprovação Cruzada:**
> - Usuários devem poder aprovar **tanto na página de comitê específico quanto na página de vídeo** (mesmas rotas backend).
> - Na **página de resumo de comitês** (timeline geral): se há uma aprovação pendente para o role do usuário logado, **sinalizar** e dar **link direto** para a página de votação.
>
> **6. Fechamento de Comitê e Ata HTML:**
> - Na página do comitê específico, adicionar botão **'Completar Comitê'**, que:
>   - Gera ata com todos os itens, comentários, votos, tarefas e próximos passos.
>   - Congela editabilidade no banco (status = 'concluido').
>   - Exporta template HTML para envio via Outlook."

---

## 🏗️ Fase 8: Integração Real Microsoft Entra ID

### Prompt:
> "Substitua o MockAuthContext pela integração oficial com Microsoft Entra ID:
>
> **1. Implementar `@azure/msal-react`:**
> - A aplicação deve exigir login Microsoft. Sem credenciais válidas = sem acesso.
> - Remover a Dev Toggle Bar do footer.
>
> **2. Mapeamento de Roles:**
> - O AuthContext derivará as roles lendo os **Groups/Claims do token de acesso** do Azure AD.
> - Mapear groups do AD → `Types.Role` (os mesmos tipos usados pelo Mock). Se o mapeamento falhar, tratar como **'comum'** (read-only).
> - A aplicação deve identificar o analista como o **usuário logado pela Microsoft**.
>
> **3. Painel Administrador:**
> - O Administrador deve poder **atribuir cargos/roles** a outros usuários via painel dedicado.
> - O Administrador deve poder **ligar/desligar o Entra ID** para permitir testes no ambiente de desenvolvimento (switch para voltar ao Mock se necessário).
>
> **4. Validação:**
> - Como todas as interfaces já reagem a `user.roles` via Context, nenhuma alteração de UI deve ser necessária. Testar os fluxos reais: votação por perfis corporativos, hub do analista, restrições de leitura."
