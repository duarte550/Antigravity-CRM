---
trigger: always_on
---

# CRM Antigravity - Documentação de Arquitetura e Decisões de Projeto

Este documento resume a infraestrutura, as escolhas tecnológicas, os padrões de dados e o funcionamento interno do projeto CRM Antigravity, servindo como guia de base para futuras integrações e manutenções.

## 1. Stack Tecnológico

**Frontend:**
- **Framework:** React.js com TypeScript
- **Estilização:** Tailwind CSS (Uso primário e quase exclusivo para estilizações via classes utilitárias no próprio `.tsx`).
- **Navegação:** Gerenciamento de rotas e abas de página controladas via estado interno (Enum `Page` em `types.ts`).
- **Ícones e Gráficos:** Lucide-React (ícones de ferramentas) e integração nativa com SVGs locais.

**Backend:**
- **Framework:** Python com Flask
- **Banco de Dados:** Databricks SQL (Schema: `cri_cra_dev.crm`)
- **Bibliotecas Relevantes:** `databricks-sql-connector` (para chamadas SQL diretas ao DB).

## 2. Estrutura do Banco de Dados (Schema `cri_cra_dev.crm`)

O projeto utiliza um paradigma relacional hospedado via cluster PySpark/Databricks.
**Tabelas listadas:**
- `master_groups`: Entidades globais (grupos econômicos, empresas ou holdings) às quais as operações estão ligadas.
- `master_group_contacts`: Contatos específicos associados ao master group (nome, email, telefone, cargo).
- `operations`: Operações "Ativas" e oficiais em curso (nome, tipo, garantias, analista, frequências, avaliações recorrentes). Possuem vínculo via `master_group_id`.
- `structuring_operations`: Operações em fase de Originação e/ou Estruturação. Ainda não são ativas, possuem pipeline/Kanban dedicado que evolui nos seus estágios próprios.
- `structuring_operation_series`: Detalhamento financeiro das tranches/séries (taxas, volume e fundos) de uma operação ainda não liquidada.
- `structuring_operation_stages`: Lista de estágios de uma operação em estruturação (Conversa Inicial, Term Sheet, Due Diligence, Aprovação, Liquidação) e os status booleanos.
- `events`: Tabela de Eventos Globais. Grava e relata todas os acompanhamentos de reuniões, call, comitês, visitas in-loco (Registra descrições, pontos de atenção, situacao, rating final e revisão). Chaves estrangeiras opcionais: `operation_id` e `master_group_id`.
- `task_rules` e `tasks`: Arquitetura de motor/engine de tarefas (TaskEngine). O usuário não "cria tarefas estáticas de repetição", ele cadastra *Regras de Tarefa* (ex. Receber Relatório Mensal). O backend (via CRON ou `task_engine.py`) processa os prazos e instancia recursivamente os registros estáticos atrelados a operação na tabela `tasks`.
- `operation_risks`: Sistema de riscos ou Pontos de Atenção atrelados. Pode possuir origem direta sob uma operação ativa (`operation_id`) ou pertencer a um grupo inteiro (`master_group_id`). 
- `rating_history`: Tabela histórica que grava alterações de Ratings (Nota Operação e Grupo) e Tendências (Sentimento) ao longo dos repasses dos analistas.
- `audit_logs`: Central de logs auditáveis. Grava "Quem fez, Qual alteração, Onde foi" (CRUD actions track) provendo dados dinâmicos para seções como "Alterações Recentes".
- `guarantees` / `guarantee_items`: Tabelas parametrizáveis dos tipos de garantias disponíveis e seus objetos.
- `operation_review_notes`, `change_requests`, `patch_notes`: Controle de documentação administrativa cruzada do sistema.

## 3. Padrões de API e Consultas (Queries)

Ao criar novas rotas ou manusear as antigas no Flask do Backend:
1. **Conexões do Banco:** Sempre abra as chamadas de banco com um bloco `try / except / finally`. No backend deste app, conexões via pool do cursor em Databricks demoram tempo sensível e vazamentos de memória fatalizam o ambiente.
2. **Formatação JSON:** Todo o backend devolve chaves padronizadas (evite PascalCase).
3. **Optimistic UI e Fila de Sincronização (Sync Queue):** 
   Para viabilizar uma experiência fluida mesmo perante a latência do Databricks no backend, o projeto adota estritamente o paradigma de "Optimistic UI". As atualizações seguem o seguinte fluxo:
   - **Atualização Imediata do Estado:** Interações do usuário (como avançar um Kanban, alterar uma série, salvar formulário) chamam imediatamente os *Setters* de estado do React (`setMasterGroup` ou `setOperations`). O usuário vê a tela reagir instantaneamente.
   - **Fila em Background:** Em vez de fazer um `await fetch()`, o payload da alteração é injetado via `pushToGenericQueue(url, method, payload)` (ou na fila central `syncQueue`).
   - **Camada de Persistência (Local Storage):** Assim que a fila é alimentada no estado do React, um `useEffect` faz o dump imediato da fila em `localStorage` (chaves `generic_sync_queue` ou `sync_queue`). Isso protege as alterações contra reloads acidentais; se a internet cair ou a aba ser fechada, o payload continuará no cache.
   - **Processamento Assíncrono (Debounce):** Um segundo `useEffect` interno observa a fila. Ele aguarda um *debounce* (espera x segundos sem novas adições) para disparar múltiplos enfileiramentos ou agrupá-los transparentemente via `processGenericQueue`, limpando o cache conforme processa.
   - **Graceful Shutdown:** Caso a aba seja violentamente encerrada antes do debounce ocorrer, um listener em `visibilitychange` (quando `document.visibilityState === 'hidden'`) dispara uma rajada final. Ela utiliza a Web API `navigator.sendBeacon` ou `fetch(..., { keepalive: true })`, forçando o próprio navegador nível-sistema-operacional a concluir os requests HTTP remanescentes, salvando as edições.

## 4. Gestão de Interfaces Frontend e Componentização

A interface prega reusabilidade restrita e hierarquia linear. Extensa e profunda abstração é desencorajada por gerar acoplamento.
- **Tipagem Centralizada (`/types.ts`):** O coração da tipagem. Nenhum tipo aninhado ou global pode existir isolado em sub-pastas, exceto de escopo restrito de prop. 
- **Design System Nativo (`components/UI.tsx`):** Sempre utilize componentes reutilizáveis definidos pelo projeto, como `<Modal>`, `<Label>`, `<Input>`, `<Select>` para garantir padrão de dark-mode, espaçamentos padronizados e cores da marca unificadas.

---

## 🤖 Instruções para a IA (Gemini)

Ao atuar neste repositório, siga estas diretrizes:

1. **Leia antes de modificar:** Sempre use o `view_file` para ler o conteúdo atual de `/types.ts` e dos componentes antes de fazer edições. Não presuma a estrutura baseada apenas no nome do arquivo.
2. **Tipagem Estrita:** Mantenha o TypeScript rigoroso. Se adicionar um novo campo no banco de dados, atualize `/types.ts` primeiro e depois os formulários React correspondentes.
3. **Estilização:** Use exclusivamente Tailwind CSS. Evite criar arquivos `.css` customizados a menos que seja estritamente necessário.
4. **Backend Python:** Ao adicionar novas rotas no backend, certifique-se de tratar conexões de banco de dados corretamente (abrir e fechar cursores/conexões no bloco `try/finally`) e retornar JSON padronizado. Realize os testes automatizados para garantir que está tudo funcionando quando ouverem novas implementações ou alterações de código e adicione novos testes sempre que houverem novas rotas ou funcionalidades sendo implementadas.
5. **Consistência de UI:** Utilize os componentes base localizados em `/components/UI.tsx` (como `Label`, `Input`, `Select`, `FormRow`) para manter a consistência visual dos formulários.
6. Sempre que novas definições de arquitetura da implementação forem surgindo sugira atualizações para esse arquivo @architecture.md
