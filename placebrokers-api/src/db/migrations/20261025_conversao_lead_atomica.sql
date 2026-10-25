-- PLACE BROKERS | Conversao atomica de lead em cliente
-- APLICAR NO SUPABASE SQL EDITOR UMA VEZ, APOS BACKUP E REVISAO.
-- Nenhum lead/cliente existente e modificado por esta migracao.
-- Pre-condicao: a consulta de duplicidades de clientes.lead_id retornou zero linhas.
-- Implantar SQL antes de publicar o backend que chama a RPC.
BEGIN;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.clientes
    WHERE lead_id IS NOT NULL
    GROUP BY lead_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem clientes com lead_id duplicado: nao foi realizada nenhuma alteracao.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='converter_lead_em_cliente'
  ) THEN
    RAISE EXCEPTION 'A funcao converter_lead_em_cliente ja existe: revisar antes de aplicar.';
  END IF;
END;
$guard$;

CREATE UNIQUE INDEX clientes_lead_id_unico_idx
  ON public.clientes (lead_id)
  WHERE lead_id IS NOT NULL;

CREATE FUNCTION public.converter_lead_em_cliente(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_cliente_id uuid;
BEGIN
  -- O bloqueio da linha serializa conversoes simultaneas do mesmo lead.
  SELECT * INTO v_lead
    FROM public.leads
   WHERE id = p_lead_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PB_LEAD_NOT_FOUND';
  END IF;
  IF v_lead.status = 'convertido'::public.lead_status THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PB_LEAD_ALREADY_CONVERTED';
  END IF;
  IF v_lead.corretor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PB_LEAD_MISSING_OWNER';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clientes WHERE lead_id = p_lead_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PB_LEAD_ALREADY_HAS_CLIENT';
  END IF;

  INSERT INTO public.clientes (nome, email, telefone, corretor_id, lead_id)
  VALUES (v_lead.nome, v_lead.email, v_lead.telefone, v_lead.corretor_id, p_lead_id)
  RETURNING id INTO v_cliente_id;

  UPDATE public.leads
     SET status = 'convertido'::public.lead_status
   WHERE id = p_lead_id;

  RETURN v_cliente_id;
END;
$func$;

-- O SQL Editor cria a funcao em schema exposto ao PostgREST;
-- a execucao fica reservada a credencial de SERVICO no backend.
REVOKE ALL ON FUNCTION public.converter_lead_em_cliente(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.converter_lead_em_cliente(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.converter_lead_em_cliente(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.converter_lead_em_cliente(uuid) TO service_role;

COMMIT;
