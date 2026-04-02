-- ===============================================================================
-- Script: Remover eventos duplicados (Databricks)
-- Problema: A falha no full-sync recriava repetidamente os eventos, resultando
-- em múltiplos registros com conteúdo idêntico e IDs diferentes para a mesma operação.
-- Solução: Usar a função ROW_NUMBER() para particionar por chaves únicas
-- e apagar tudo cujo row_number seja maior que 1, mantendo apenas a primeira
-- versão (o menor ID).
-- ===============================================================================

DELETE FROM cri_cra_dev.crm.events
WHERE id IN (
    SELECT id 
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER(
                -- Maior rigor: Inclui a descrição inteira e o registro. 
                -- Assim, impossibilita que dois eventos da mesma data e com 
                -- o mesmo título, mas com conteúdos diferentes, sejam considerados o mesmo.
                PARTITION BY operation_id, date, type, title, description, registered_by
                ORDER BY id ASC 
            ) as rn
        FROM cri_cra_dev.crm.events
    ) tmp
    WHERE tmp.rn > 1
);

-- Após executar, para conferir se restou alguma anomalia:
-- SELECT operation_id, title, count(*) 
-- FROM cri_cra_dev.crm.events 
-- GROUP BY operation_id, title 
-- HAVING count(*) > 1;
