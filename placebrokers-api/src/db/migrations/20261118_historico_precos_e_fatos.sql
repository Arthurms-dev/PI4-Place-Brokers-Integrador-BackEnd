-- Place Brokers PI4: histórico de preço e fatos de mercado com fonte.
-- 1) Histórico: toda vez que preço "a partir de", preço máximo ou parcela mudam, guarda a foto do valor.
--    Daqui a alguns meses a Place tem a evolução real de cada empreendimento (dado próprio, com data).
-- 2) Fatos de mercado: até 3 por empreendimento, cada um com fonte (nome + link https) e mês.
--    Nada de "vai valorizar": só fato publicado por alguém, com link para conferir.
-- Aditivo: não apaga nada. Aplicada no Supabase em 18/11/2026.
BEGIN;

CREATE TABLE IF NOT EXISTS public.empreendimento_precos_historico (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empreendimento_id uuid NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
  preco_min numeric(14,2),
  preco_max numeric(14,2),
  parcela_min numeric(12,2),
  origem text NOT NULL DEFAULT 'atualizacao' CHECK (origem IN ('inicial', 'atualizacao')),
  registrado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS empreendimento_precos_historico_emp_data
  ON public.empreendimento_precos_historico (empreendimento_id, registrado_em);

-- Só o back (service role) lê e escreve.
ALTER TABLE public.empreendimento_precos_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.empreendimento_precos_historico FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_historico_preco()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
BEGIN
  IF TG_OP = 'INSERT'
     OR (NEW.preco_min, NEW.preco_max, NEW.parcela_min) IS DISTINCT FROM (OLD.preco_min, OLD.preco_max, OLD.parcela_min) THEN
    INSERT INTO public.empreendimento_precos_historico (empreendimento_id, preco_min, preco_max, parcela_min, origem)
    VALUES (NEW.id, NEW.preco_min, NEW.preco_max, NEW.parcela_min, 'atualizacao');
  END IF;
  RETURN NEW;
END;
$func$;
REVOKE ALL ON FUNCTION public.registrar_historico_preco() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_historico_preco
  AFTER INSERT OR UPDATE OF preco_min, preco_max, parcela_min ON public.empreendimentos
  FOR EACH ROW EXECUTE FUNCTION public.registrar_historico_preco();

-- Ponto de partida: o valor de hoje de cada empreendimento (uma vez só).
INSERT INTO public.empreendimento_precos_historico (empreendimento_id, preco_min, preco_max, parcela_min, origem)
SELECT e.id, e.preco_min, e.preco_max, e.parcela_min, 'inicial'
FROM public.empreendimentos e
WHERE NOT EXISTS (SELECT 1 FROM public.empreendimento_precos_historico h WHERE h.empreendimento_id = e.id);

ALTER TABLE public.empreendimentos
  ADD COLUMN IF NOT EXISTS fatos_mercado jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $regras$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empreendimentos_fatos_mercado_lista') THEN
    ALTER TABLE public.empreendimentos ADD CONSTRAINT empreendimentos_fatos_mercado_lista
      CHECK (jsonb_typeof(fatos_mercado) = 'array' AND jsonb_array_length(fatos_mercado) <= 3);
  END IF;
END
$regras$;

COMMENT ON TABLE public.empreendimento_precos_historico IS 'Foto dos preços a cada mudança (trigger). Base da "evolução do preço de entrada".';
COMMENT ON COLUMN public.empreendimentos.fatos_mercado IS 'Até 3 [{ "texto", "fonte", "url" (https), "mes" (AAAA-MM) }]: fatos publicados, com fonte para conferir.';

COMMIT;
