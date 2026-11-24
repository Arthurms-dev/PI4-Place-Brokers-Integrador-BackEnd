-- Place Brokers PI4: detalhes da vaga (revisão de telas, 24/11/2026).
-- Requisitos, tipo de vínculo, prazo para se candidatar e quantas vagas. Tudo opcional: as vagas antigas seguem iguais.
-- Rode ANTES de publicar o back novo: sem as colunas, a lista de vagas do RH e do site falha.
-- Sem DROP: as regras só são criadas se ainda não existirem.

ALTER TABLE public.vagas
  ADD COLUMN IF NOT EXISTS requisitos text,
  ADD COLUMN IF NOT EXISTS vinculo text,
  ADD COLUMN IF NOT EXISTS prazo date,
  ADD COLUMN IF NOT EXISTS quantidade integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vagas_requisitos_tamanho') THEN
    ALTER TABLE public.vagas ADD CONSTRAINT vagas_requisitos_tamanho CHECK (requisitos IS NULL OR char_length(requisitos) <= 2000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vagas_vinculo_valido') THEN
    ALTER TABLE public.vagas ADD CONSTRAINT vagas_vinculo_valido CHECK (vinculo IS NULL OR vinculo IN ('autonomo', 'clt', 'estagio'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vagas_quantidade_valida') THEN
    ALTER TABLE public.vagas ADD CONSTRAINT vagas_quantidade_valida CHECK (quantidade IS NULL OR quantidade BETWEEN 1 AND 99);
  END IF;
END $$;

COMMENT ON COLUMN public.vagas.prazo IS 'Último dia para se candidatar; depois dele a vaga some do site.';
