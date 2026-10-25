-- PLACE BROKERS — Migração do acesso direto ao catálogo no Supabase.
-- Fonte: auditoria do usuário em 24/10/2026 (18 tabelas, RLS e políticas confirmadas).
-- EXECUTAR UMA ÚNICA VEZ no Supabase SQL Editor, após revisar.
-- NÃO altera nem remove linhas de dados; altera permissões de SELECT.
-- Operação transacional: se alguma pré-condição falhar, tudo é cancelado.

BEGIN;

DO $guard$
DECLARE
  rls_empreendimentos boolean;
  rls_imagens boolean;
BEGIN
  SELECT c.relrowsecurity INTO rls_empreendimentos
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'empreendimentos' AND c.relkind = 'r';

  SELECT c.relrowsecurity INTO rls_imagens
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'empreendimento_imagens' AND c.relkind = 'r';

  IF rls_empreendimentos IS DISTINCT FROM TRUE OR rls_imagens IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'RLS ausente/desabilitado: nenhum ajuste realizado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'empreendimentos'
      AND policyname = 'empreendimentos_select' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Política empreendimentos_select não encontrada como esperado: nenhum ajuste realizado.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'empreendimentos'
      AND cmd IN ('SELECT', 'ALL')
      AND policyname <> 'empreendimentos_select'
  ) THEN
    RAISE EXCEPTION 'Há outras políticas SELECT/ALL de empreendimentos. Revisar manualmente.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'empreendimento_imagens'
      AND policyname = 'imagens_select_publico' AND cmd = 'SELECT'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'empreendimento_imagens'
      AND policyname = 'imagens_admin_gerencia' AND cmd = 'ALL'
  ) THEN
    RAISE EXCEPTION 'Políticas originais de imagens divergentes: nenhum ajuste realizado.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'empreendimento_imagens'
      AND cmd IN ('SELECT', 'ALL')
      AND policyname NOT IN ('imagens_select_publico', 'imagens_admin_gerencia')
  ) THEN
    RAISE EXCEPTION 'Há outras políticas SELECT/ALL de imagens. Revisar manualmente.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'placebrokers_private'
  ) THEN
    RAISE EXCEPTION 'Schema placebrokers_private já existe; interrompido para conferir o proprietário.';
  END IF;
END
$guard$;

-- A função fica em schema NÃO exposto pela API Supabase/PostgREST.
-- Criada no SQL Editor pelo administrador do banco, com privilégios para
-- consultar profiles sem que políticas RLS da própria profiles causem recursão.
CREATE SCHEMA placebrokers_private;
REVOKE ALL ON SCHEMA placebrokers_private FROM PUBLIC;
GRANT USAGE ON SCHEMA placebrokers_private TO authenticated;

CREATE FUNCTION placebrokers_private.pode_ver_rascunhos()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles AS p
     WHERE p.id = (SELECT auth.uid())
       AND p.cargo IN (
         'admin'::public.user_role,
         'gerente'::public.user_role,
         'corretor'::public.user_role
       )
       AND p.ativo IS TRUE
       AND p.status = 'aprovado'::public.conta_status
  );
$function$;

REVOKE ALL ON FUNCTION placebrokers_private.pode_ver_rascunhos() FROM PUBLIC;
REVOKE ALL ON FUNCTION placebrokers_private.pode_ver_rascunhos() FROM anon;
GRANT EXECUTE ON FUNCTION placebrokers_private.pode_ver_rascunhos() TO authenticated;

-- As políticas permissivas do Postgres são OR. Remover a antiga é essencial.
DROP POLICY empreendimentos_select ON public.empreendimentos;

CREATE POLICY empreendimentos_select_publicados
  ON public.empreendimentos
  FOR SELECT
  TO anon, authenticated
  USING (publicado IS TRUE);

CREATE POLICY empreendimentos_select_perfil_interno
  ON public.empreendimentos
  FOR SELECT
  TO authenticated
  USING ((SELECT placebrokers_private.pode_ver_rascunhos()));

-- Imagens públicas ficam visíveis SOMENTE se o empreendimento pai estiver
-- visível ao próprio usuário sob as políticas de RLS acima.
-- O antigo ALL admin permanece intacto.
DROP POLICY imagens_select_publico ON public.empreendimento_imagens;
CREATE POLICY imagens_select_catalogo_visivel
  ON public.empreendimento_imagens
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.empreendimentos AS emp
       WHERE emp.id = empreendimento_id
    )
  );

COMMIT;
