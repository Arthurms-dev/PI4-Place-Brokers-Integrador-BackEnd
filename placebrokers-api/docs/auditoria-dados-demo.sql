-- PLACE BROKERS - AUDITORIA PRE-PUBLICACAO (SOMENTE LEITURA)
-- NAO remove nem altera registros. Executar no SQL Editor APENAS apos selecionar
-- o projeto Supabase correto. Validar os candidatos com Joao e registrar evidencias.
-- Criterios automaticos parciais: leads.origem = 'demo' ou email @exemplo.com.
-- ATENCAO: registros reais podem ter emails de teste; eventos sinteticos nao sao
-- identificaveis por esses criterios. A listagem e apenas preliminar.

WITH leads_demo AS (
  SELECT id FROM public.leads
  WHERE lower(btrim(coalesce(origem, ''))) = 'demo'
     OR lower(coalesce(email, '')) LIKE '%@exemplo.com'
), clientes_demo AS (
  SELECT id FROM public.clientes
  WHERE lower(coalesce(email, '')) LIKE '%@exemplo.com'
     OR lead_id IN (SELECT id FROM leads_demo)
), agendamentos_demo AS (
  SELECT id FROM public.agendamentos
  WHERE cliente_id IN (SELECT id FROM clientes_demo)
     OR lead_id IN (SELECT id FROM leads_demo)
     OR lead_origem_id IN (SELECT id FROM leads_demo)
), vendas_demo AS (
  SELECT id FROM public.vendas
  WHERE cliente_id IN (SELECT id FROM clientes_demo)
)
SELECT 'leads' AS tabela, (SELECT count(*) FROM public.leads) AS total,
       (SELECT count(*) FROM leads_demo) AS candidatos
UNION ALL SELECT 'clientes', (SELECT count(*) FROM public.clientes), (SELECT count(*) FROM clientes_demo)
UNION ALL SELECT 'agendamentos', (SELECT count(*) FROM public.agendamentos), (SELECT count(*) FROM agendamentos_demo)
UNION ALL SELECT 'vendas', (SELECT count(*) FROM public.vendas), (SELECT count(*) FROM vendas_demo)
UNION ALL SELECT 'eventos_acesso', (SELECT count(*) FROM public.eventos_acesso), NULL::bigint
ORDER BY tabela;

-- Conferir os candidatos nominalmente, sem alterar o banco.
-- Nomes e emails podem conter dados pessoais: nao compartilhar prints publicamente.
SELECT id, nome, email, origem, status, criado_em
FROM public.leads
WHERE lower(btrim(coalesce(origem, ''))) = 'demo'
   OR lower(coalesce(email, '')) LIKE '%@exemplo.com'
ORDER BY criado_em DESC LIMIT 100;

SELECT id, nome, email, lead_id, criado_em
FROM public.clientes
WHERE lower(coalesce(email, '')) LIKE '%@exemplo.com'
   OR lead_id IN (
     SELECT id FROM public.leads
     WHERE lower(btrim(coalesce(origem, ''))) = 'demo'
        OR lower(coalesce(email, '')) LIKE '%@exemplo.com'
   )
ORDER BY criado_em DESC LIMIT 100;

-- Revisao obrigatoria ANTES de criar qualquer script de exclusao:
-- [ ] Joao conferiu o conjunto exato de IDs e dependencias (todas as tabelas)
-- [ ] backup PG custom-format armazenado e validado com pg_restore -l
-- [ ] ambiente selecionado e confirmado (homologacao/producao)
-- [ ] existe plano de rollback e autorizacao explicita para apagar
-- [ ] eventos sinteticos analisados separadamente (nao inferir)
-- A contagem historica do Trello nao e evidencia suficiente para apagar.
