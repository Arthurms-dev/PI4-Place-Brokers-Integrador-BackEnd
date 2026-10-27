-- Place Brokers PI4: o corretor já pode levar o lead para a carteira (POST /leads/:id/cliente)
-- para agendar a visita. Quando o admin converter esse lead depois, a conversão reaproveita
-- o cliente que já está ligado ao lead em vez de dar erro ou criar um segundo cliente.
-- Executar uma vez no SQL Editor do Supabase (substitui a função de 20261025).
BEGIN;

CREATE OR REPLACE FUNCTION public.converter_lead_em_cliente(p_lead_id uuid)
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

  -- Já virou cliente pela carteira do corretor: só marca o lead como convertido.
  SELECT id INTO v_cliente_id FROM public.clientes WHERE lead_id = p_lead_id;

  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (nome, email, telefone, corretor_id, lead_id)
    VALUES (v_lead.nome, v_lead.email, v_lead.telefone, v_lead.corretor_id, p_lead_id)
    RETURNING id INTO v_cliente_id;
  END IF;

  UPDATE public.leads
     SET status = 'convertido'::public.lead_status
   WHERE id = p_lead_id;

  RETURN v_cliente_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.converter_lead_em_cliente(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.converter_lead_em_cliente(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.converter_lead_em_cliente(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.converter_lead_em_cliente(uuid) TO service_role;

COMMIT;
