-- Place Brokers PI4: andamento da obra por módulo/torre (ex.: "Módulo 01 – 86,29%"), com o mês da medição.
-- Quem atualiza é o cadastro, uma vez por mês, junto com a tabela (as construtoras publicam assim).
-- Por enquanto só o corretor vê (o público fica para a futura área do comprador); com mais de 60 dias aparece como desatualizado.
-- Aditivo: não apaga nada. Aplicada no Supabase em 18/11/2026.
BEGIN;

ALTER TABLE public.empreendimentos
  ADD COLUMN IF NOT EXISTS andamento_obra jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS andamento_referencia date,
  ADD COLUMN IF NOT EXISTS andamento_fonte_url text;

-- Regras no banco (sem DROP: só cria se ainda não existir).
DO $regras$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empreendimentos_andamento_obra_lista') THEN
    ALTER TABLE public.empreendimentos ADD CONSTRAINT empreendimentos_andamento_obra_lista
      CHECK (jsonb_typeof(andamento_obra) = 'array' AND jsonb_array_length(andamento_obra) <= 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empreendimentos_andamento_referencia_dia1') THEN
    ALTER TABLE public.empreendimentos ADD CONSTRAINT empreendimentos_andamento_referencia_dia1
      CHECK (andamento_referencia IS NULL OR extract(day FROM andamento_referencia) = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empreendimentos_andamento_fonte_https') THEN
    ALTER TABLE public.empreendimentos ADD CONSTRAINT empreendimentos_andamento_fonte_https
      CHECK (andamento_fonte_url IS NULL OR (andamento_fonte_url ~ '^https://' AND length(andamento_fonte_url) <= 500));
  END IF;
END
$regras$;

COMMENT ON COLUMN public.empreendimentos.andamento_obra IS 'Lista [{ "modulo": "Módulo 01", "percentual": 86.29 }] (até 10 módulos/torres).';
COMMENT ON COLUMN public.empreendimentos.andamento_referencia IS 'Mês da medição informada pela construtora (dia 1).';
COMMENT ON COLUMN public.empreendimentos.andamento_fonte_url IS 'Página da construtora de onde veio o andamento (só https).';

COMMIT;
