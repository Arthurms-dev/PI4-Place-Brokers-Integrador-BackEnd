-- Place Brokers PI4: um lead por pessoa.
-- Quando o mesmo e-mail OU o mesmo telefone chega de novo pelo site (mesmo com outro nome),
-- o contato é registrado no lead que já existe (histórico em lead_atividades) em vez de criar outro.
-- Aditivo: não apaga nada. Executar uma vez no SQL Editor do Supabase.
BEGIN;

-- Telefones guardados só com dígitos (o back já grava assim; isto acerta registros antigos).
UPDATE public.leads
   SET telefone = regexp_replace(telefone, '\D', '', 'g')
 WHERE telefone IS NOT NULL AND telefone ~ '\D';

CREATE INDEX IF NOT EXISTS leads_email_lower_idx ON public.leads (lower(email));
CREATE INDEX IF NOT EXISTS leads_telefone_idx ON public.leads (telefone);

CREATE OR REPLACE FUNCTION public.registrar_lead_site(
  p_nome text,
  p_email text,
  p_telefone text,
  p_empreendimento_id uuid,
  p_mensagem text
)
RETURNS TABLE (lead_id uuid, repetido boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_email text := nullif(lower(btrim(p_email)), '');
  v_tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_nome text := btrim(p_nome);
  v_msg text := nullif(btrim(p_mensagem), '');
  v_lead public.leads%ROWTYPE;
  v_achou boolean;
  v_id uuid;
  v_desc text;
BEGIN
  -- Serializa os envios do site: dois cliques ao mesmo tempo não geram dois leads.
  PERFORM pg_advisory_xact_lock(hashtext('registrar_lead_site'));

  -- Mesma pessoa = mesmo e-mail ou mesmo telefone. Prefere o lead ainda em aberto.
  SELECT * INTO v_lead
    FROM public.leads l
   WHERE (v_email IS NOT NULL AND lower(l.email) = v_email)
      OR (v_tel IS NOT NULL AND l.telefone = v_tel)
   ORDER BY CASE l.status::text WHEN 'novo' THEN 0 WHEN 'em_atendimento' THEN 0 WHEN 'perdido' THEN 1 ELSE 2 END,
            l.criado_em DESC
   LIMIT 1
   FOR UPDATE;
  v_achou := FOUND;

  v_desc := 'Novo contato pelo site'
    || CASE WHEN v_achou AND lower(v_nome) <> lower(btrim(v_lead.nome)) THEN ' com o nome "' || v_nome || '"' ELSE '' END
    || CASE WHEN v_achou AND v_email IS NOT NULL AND v_lead.email IS DISTINCT FROM v_email THEN ' · e-mail ' || v_email ELSE '' END
    || CASE WHEN v_achou AND v_tel IS NOT NULL AND v_lead.telefone IS DISTINCT FROM v_tel THEN ' · telefone ' || v_tel ELSE '' END
    || coalesce('. ' || v_msg, '');

  IF v_achou AND v_lead.status <> 'convertido'::public.lead_status THEN
    UPDATE public.leads
       SET status = CASE WHEN status = 'perdido'::public.lead_status THEN 'novo'::public.lead_status ELSE status END,
           email = coalesce(email, v_email),
           telefone = coalesce(telefone, v_tel),
           empreendimento_id = coalesce(empreendimento_id, p_empreendimento_id),
           atualizado_em = now()
     WHERE id = v_lead.id;

    INSERT INTO public.lead_atividades (lead_id, autor_id, tipo, descricao)
    VALUES (v_lead.id, NULL, 'observacao',
            left(v_desc || CASE WHEN v_lead.status = 'perdido'::public.lead_status THEN ' (lead reaberto)' ELSE '' END, 2000));

    RETURN QUERY SELECT v_lead.id, true;
    RETURN;
  END IF;

  -- Pessoa nova, ou já cliente voltando com novo interesse: abre um lead novo.
  INSERT INTO public.leads (nome, email, telefone, empreendimento_id, mensagem, origem, status)
  VALUES (v_nome, v_email, v_tel, p_empreendimento_id,
          nullif(CASE WHEN v_achou THEN 'Já é cliente (voltou pelo site). ' ELSE '' END || coalesce(v_msg, ''), ''),
          'site', 'novo'::public.lead_status)
  RETURNING id INTO v_id;

  IF v_achou THEN
    INSERT INTO public.lead_atividades (lead_id, autor_id, tipo, descricao)
    VALUES (v_id, NULL, 'observacao', left('Mesma pessoa do lead convertido ' || v_lead.id::text || '. ' || v_desc, 2000));
  END IF;

  RETURN QUERY SELECT v_id, v_achou;
END;
$func$;

REVOKE ALL ON FUNCTION public.registrar_lead_site(text, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_lead_site(text, text, text, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.registrar_lead_site(text, text, text, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_lead_site(text, text, text, uuid, text) TO service_role;

COMMIT;
