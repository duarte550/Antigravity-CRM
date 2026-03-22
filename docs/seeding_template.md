
# Template para Carga de Operações em Lote

Este documento serve como um modelo para formatar dados de operações para uma carga inicial ou em lote no CRM de Crédito Estruturado. O objetivo é ter uma planilha clara, sem ambiguidades, que possa ser facilmente convertida em scripts SQL.

## Instruções

1.  **Preencha uma linha por operação.**
2.  **Use os valores exatos** para campos com opções predefinidas (ex: `Area`, `WatchlistStatus`).
3.  **Para campos de múltipla escolha** (como `projetos` e `garantias`), separe os valores com uma vírgula (`,`).
4.  **Para as colunas de monitoramento** (`acompanhar_...`), use `TRUE` para ativar a regra de tarefa correspondente e `FALSE` para desativá-la. A frequência já está pré-definida no sistema.
5.  **Data de Vencimento:** Use o formato `AAAA-MM-DD`.

---

### Tabela de Exemplo

| nome_operacao                | area                | tipo_operacao | segmento                       | data_vencimento | analista_responsavel | rating_operacao | rating_grupo | watchlist | projetos                         | garantias                             | freq_revisao_gerencial | freq_call    | freq_df_divida | acompanhar_noticias | acompanhar_relatorio_fii | acompanhar_infos_operacionais | acompanhar_carteira_recebiveis | acompanhar_relatorio_obras | acompanhar_infos_comerciais | acompanhar_dfs_spe |
| ---------------------------- | ------------------- | ------------- | ------------------------------ | --------------- | -------------------- | --------------- | ------------ | --------- | -------------------------------- | ------------------------------------- | ---------------------- | ------------ | -------------- | ------------------- | -------------------------- | ------------------------------- | -------------------------------- | ---------------------------- | ----------------------------- | ------------------ |
| **Exemplo: CRI Shopping Praias** | CRI                 | CRI           | Asset Finance                  | 2035-12-31      | Ricardo              | Baa3            | Baa1         | Verde     | Shopping Praias, Estacionamento | Alienação Fiduciária de Imóvel        | Semestral              | Mensal       | Trimestral     | TRUE                | FALSE                      | TRUE                            | TRUE                             | FALSE                        | TRUE                          | TRUE               |
| **Exemplo: Debênture AgroSol** | Capital Solutions   | Debênture     | Crédito Corporativo            | 2030-06-30      | Fernanda             | Ba1             | Baa4         | Amarelo   | Fazenda Sol Nascente             | Cessão Fiduciária de Recebíveis,Fiança | Anual                  | Trimestral   | Semestral      | TRUE                | FALSE                      | FALSE                           | TRUE                             | FALSE                        | FALSE                         | FALSE              |
