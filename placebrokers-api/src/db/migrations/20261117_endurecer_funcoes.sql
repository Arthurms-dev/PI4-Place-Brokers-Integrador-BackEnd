-- Place Brokers PI4: ajustes pedidos pela verificação de segurança do Supabase (17/11/2026).
--
-- 1. registrar_distribuicao_lead é função de gatilho (SECURITY DEFINER). Ela só deve rodar
--    dentro do banco, quando um lead muda de corretor, e nunca por /rest/v1/rpc com a chave pública.
--    Tirar o EXECUTE não afeta o gatilho: o Postgres só confere essa permissão ao criar o gatilho.
-- 2. Funções sem search_path fixo: alguém com permissão de criar objetos poderia "trocar" uma
--    tabela por outra com o mesmo nome em outro schema. Fixar o search_path fecha isso.
-- Os avisos "RLS sem policy" ficam como estão: a API é a única porta (20261102_api_unica_porta.sql).
BEGIN;

REVOKE EXECUTE ON FUNCTION public.registrar_distribuicao_lead() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.set_atualizado_em() SET search_path = '';
ALTER FUNCTION public.dashboard_vgv(timestamptz, timestamptz, uuid[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.dashboard_acessos_por_dia SET search_path = public, pg_temp;
ALTER FUNCTION public.dashboard_agendamentos_por_dia SET search_path = public, pg_temp;
ALTER FUNCTION public.dashboard_imoveis_mais_procurados SET search_path = public, pg_temp;

COMMIT;
