-- Place Brokers: corrigir recursão de public.is_admin() em políticas RLS.
-- A política de profiles chama public.is_admin(); a implementação antiga de
-- is_admin() também consulta profiles como INVOKER, disparando as políticas
-- novamente. Esta migração usa uma função SECURITY DEFINER PRIVADA para
-- consultar profiles sem recursão, e mantém public.is_admin como INVOKER.
-- Execute no SQL Editor do Supabase como administrador do projeto.
-- Não modifica linhas de dados, não desativa RLS e não mexe no Storage.

BEGIN;

DO $guard$
DECLARE
  permissao_bypass boolean;
  profiles_force_rls boolean;
BEGIN
  IF to_regnamespace('placebrokers_private') IS NULL THEN
    RAISE EXCEPTION 'placebrokers_private não existe. Confirme a migração RLS do catálogo antes de prosseguir.';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'public.is_admin() não existe. Revisar a configuração antes de prosseguir.';
  END IF;

  SELECT (rolsuper OR rolbypassrls)
    INTO permissao_bypass
    FROM pg_catalog.pg_roles
   WHERE rolname = current_user;

  IF permissao_bypass IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'A sessão precisa usar um proprietário com BYPASSRLS (por exemplo, postgres no Supabase SQL Editor). Atual: %', current_user;
  END IF;

  SELECT c.relforcerowsecurity
    INTO profiles_force_rls
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'profiles' AND c.relkind = 'r';

  IF profiles_force_rls IS NULL OR profiles_force_rls IS TRUE THEN
    RAISE EXCEPTION 'Tabela profiles ausente ou FORCE ROW LEVEL SECURITY habilitado; revisar manualmente.';
  END IF;
END
$guard$;

-- A função privilegiada não recebe ID/argumentos fornecidos pelo cliente:
-- verifica apenas o ID autenticado a partir do token Supabase (auth.uid()).
-- A regra é restrita a administrador ativo e aprovado.
CREATE OR REPLACE FUNCTION placebrokers_private.eh_admin()
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
       AND p.cargo = 'admin'::public.user_role
       AND p.ativo IS TRUE
       AND p.status = 'aprovado'::public.conta_status
  );
$function$;

REVOKE ALL ON FUNCTION placebrokers_private.eh_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION placebrokers_private.eh_admin() FROM anon;
REVOKE ALL ON FUNCTION placebrokers_private.eh_admin() FROM authenticated;

-- Necessário porque políticas antigas (ex.: imagens_admin_gerencia)
-- chamam public.is_admin() mesmo sob o papel anon. A função privada
-- revela somente um booleano sobre a PRÓPRIA sessão.
GRANT USAGE ON SCHEMA placebrokers_private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION placebrokers_private.eh_admin() TO anon, authenticated;

-- Preserva nome/assinatura usado por TODAS as políticas existentes;
-- esta função pública não é SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT placebrokers_private.eh_admin();
$function$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

COMMIT;
