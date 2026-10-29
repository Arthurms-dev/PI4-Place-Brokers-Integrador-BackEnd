-- Place Brokers PI4: roleta de leads por ordem de chegada.
-- Regras (combinadas com a operação):
--   * A recepção marca quem chegou; a ordem de chegada é uma lista geral do dia.
--   * Apto = chegou antes das 09h (seg a sáb). Domingo não há roleta.
--   * A lista fecha às 09h (ou quando a recepção inicia a roleta) e a distribuição começa.
--   * Funciona das 07h às 18h de seg a sex e das 08h às 18h no sábado (horário de Recife).
--     Lead que chega fora disso espera a roleta do próximo dia.
--   * Cada lead vai para o próximo apto da lista que tem foco no empreendimento do lead;
--     ao chegar no fim, a lista recomeça do topo (favorece quem chegou mais cedo).
--   * Lead sem empreendimento, de empreendimento que ninguém tem em foco, ou sem apto
--     com foco no dia, fica aguardando o administrador atribuir.
--   * Não há repasse automático: gerente ou diretor repassa manualmente.
-- Aditivo: não apaga nada.
BEGIN;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS atribuido_em timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS roleta_dia date;
-- Ordem de entrega da roleta (desempata entregas feitas no mesmo instante).
CREATE SEQUENCE IF NOT EXISTS public.roleta_entrega_seq;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS roleta_seq bigint;
CREATE INDEX IF NOT EXISTS leads_aguardando_roleta_idx ON public.leads (criado_em) WHERE corretor_id IS NULL;
CREATE INDEX IF NOT EXISTS leads_roleta_dia_idx ON public.leads (roleta_dia) WHERE roleta_dia IS NOT NULL;

-- Empreendimentos em que o gerente colocou o corretor para receber leads.
CREATE TABLE IF NOT EXISTS public.corretor_focos (
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  empreendimento_id uuid NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
  definido_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretor_id, empreendimento_id)
);
CREATE INDEX IF NOT EXISTS corretor_focos_empreendimento_idx ON public.corretor_focos (empreendimento_id);

-- Caderno da recepção: quem chegou, em que ordem e se está apto a receber.
CREATE TABLE IF NOT EXISTS public.roleta_chegadas (
  dia date NOT NULL,
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chegou_em timestamptz NOT NULL DEFAULT now(),
  ordem integer NOT NULL CHECK (ordem > 0),
  apto boolean NOT NULL DEFAULT true,
  marcado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (dia, corretor_id),
  UNIQUE (dia, ordem)
);

-- Dia em que a lista foi fechada e a roleta começou.
CREATE TABLE IF NOT EXISTS public.roleta_dias (
  dia date PRIMARY KEY,
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  iniciada_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Só o back (service_role) lê e escreve.
ALTER TABLE public.corretor_focos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roleta_chegadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roleta_dias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.corretor_focos, public.roleta_chegadas, public.roleta_dias FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.roleta_entrega_seq FROM anon, authenticated;

-- Marca a chegada do corretor (idempotente: marcar de novo devolve a mesma posição).
CREATE OR REPLACE FUNCTION public.roleta_registrar_chegada(
  p_corretor uuid,
  p_por uuid,
  p_agora timestamptz DEFAULT now()
)
RETURNS TABLE (ordem integer, apto boolean, chegou_em timestamptz, novo boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_local timestamp := p_agora AT TIME ZONE 'America/Recife';
  v_dia date := (p_agora AT TIME ZONE 'America/Recife')::date;
  v_ordem integer;
  v_apto boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_corretor AND p.cargo = 'corretor'::public.user_role
       AND p.ativo AND p.status::text = 'aprovado'
  ) THEN
    RAISE EXCEPTION 'CORRETOR_INVALIDO' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('roleta:' || v_dia::text));

  RETURN QUERY
    SELECT c.ordem, c.apto, c.chegou_em, false
      FROM public.roleta_chegadas c
     WHERE c.dia = v_dia AND c.corretor_id = p_corretor;
  IF FOUND THEN RETURN; END IF;

  SELECT coalesce(max(c.ordem), 0) + 1 INTO v_ordem FROM public.roleta_chegadas c WHERE c.dia = v_dia;
  v_apto := extract(isodow FROM v_local) <> 7
        AND v_local::time < time '09:00'
        AND NOT EXISTS (SELECT 1 FROM public.roleta_dias d WHERE d.dia = v_dia);

  INSERT INTO public.roleta_chegadas (dia, corretor_id, chegou_em, ordem, apto, marcado_por)
  VALUES (v_dia, p_corretor, p_agora, v_ordem, v_apto, p_por);

  RETURN QUERY SELECT v_ordem, v_apto, p_agora, true;
END;
$func$;

-- Distribui os leads que estão sem corretor. Devolve quantos foram entregues.
CREATE OR REPLACE FUNCTION public.roleta_distribuir(p_agora timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_local timestamp := p_agora AT TIME ZONE 'America/Recife';
  v_dia date := (p_agora AT TIME ZONE 'America/Recife')::date;
  v_dow integer := extract(isodow FROM (p_agora AT TIME ZONE 'America/Recife'))::integer;
  v_abre time;
  v_lead record;
  v_ultima integer;
  v_corretor uuid;
  v_ordem integer;
  v_total integer := 0;
BEGIN
  IF v_dow = 7 THEN RETURN 0; END IF;
  v_abre := CASE WHEN v_dow = 6 THEN time '08:00' ELSE time '07:00' END;
  IF v_local::time < v_abre OR v_local::time >= time '18:00' THEN RETURN 0; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('roleta:' || v_dia::text));

  -- A lista fecha sozinha às 09h se a recepção ainda não iniciou a roleta.
  IF NOT EXISTS (SELECT 1 FROM public.roleta_dias d WHERE d.dia = v_dia) THEN
    IF v_local::time >= time '09:00'
       AND EXISTS (SELECT 1 FROM public.roleta_chegadas c WHERE c.dia = v_dia AND c.apto) THEN
      INSERT INTO public.roleta_dias (dia, iniciada_em, iniciada_por) VALUES (v_dia, p_agora, NULL)
      ON CONFLICT (dia) DO NOTHING;
    ELSE
      RETURN 0;
    END IF;
  END IF;

  FOR v_lead IN
    SELECT l.id, l.empreendimento_id
      FROM public.leads l
     WHERE l.corretor_id IS NULL
       AND l.status = 'novo'::public.lead_status
       AND l.criado_em >= p_agora - interval '7 days'
       AND l.criado_em <= p_agora
     ORDER BY l.criado_em
     FOR UPDATE SKIP LOCKED
  LOOP
    -- Só quem tem foco no empreendimento recebe; sem empreendimento, fica com o admin.
    IF v_lead.empreendimento_id IS NULL THEN CONTINUE; END IF;

    -- Posição de quem recebeu o último lead deste empreendimento hoje.
    SELECT c.ordem INTO v_ultima
      FROM public.leads l2
      JOIN public.roleta_chegadas c ON c.dia = v_dia AND c.corretor_id = l2.corretor_id
     WHERE l2.roleta_dia = v_dia
       AND l2.empreendimento_id IS NOT DISTINCT FROM v_lead.empreendimento_id
     ORDER BY l2.roleta_seq DESC NULLS LAST
     LIMIT 1;

    SELECT c.corretor_id, c.ordem INTO v_corretor, v_ordem
      FROM public.roleta_chegadas c
      JOIN public.profiles p ON p.id = c.corretor_id
     WHERE c.dia = v_dia AND c.apto
       AND p.ativo AND p.cargo = 'corretor'::public.user_role AND p.status::text = 'aprovado'
       AND EXISTS (
             SELECT 1 FROM public.corretor_focos f
              WHERE f.corretor_id = c.corretor_id AND f.empreendimento_id = v_lead.empreendimento_id)
     ORDER BY (c.ordem <= coalesce(v_ultima, 0)), c.ordem
     LIMIT 1;

    IF v_corretor IS NULL THEN CONTINUE; END IF;

    UPDATE public.leads
       SET corretor_id = v_corretor, atribuido_em = p_agora, roleta_dia = v_dia,
           roleta_seq = nextval('public.roleta_entrega_seq')
     WHERE id = v_lead.id;

    INSERT INTO public.lead_atividades (lead_id, autor_id, tipo, descricao)
    VALUES (v_lead.id, NULL, 'observacao', 'Recebido pela roleta (nº ' || v_ordem || ' da lista de chegada).');

    v_total := v_total + 1;
    v_corretor := NULL;
    v_ultima := NULL;
  END LOOP;

  RETURN v_total;
END;
$func$;

REVOKE ALL ON FUNCTION public.roleta_registrar_chegada(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.roleta_distribuir(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.roleta_registrar_chegada(uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.roleta_distribuir(timestamptz) TO service_role;

COMMIT;
