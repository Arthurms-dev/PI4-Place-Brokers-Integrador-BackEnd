
CREATE TABLE IF NOT EXISTS public.empreendimento_tipologias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empreendimento_id uuid NOT NULL
    REFERENCES public.empreendimentos(id)
    ON DELETE CASCADE,
  nome text NOT NULL,
  quartos smallint,
  suites smallint,
  vagas smallint,
  area_m2 numeric(8, 2),
  ordem smallint NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tipologia_nome_valido
    CHECK (length(trim(nome)) >= 2),

  CONSTRAINT tipologia_quartos_valido
    CHECK (quartos IS NULL OR quartos >= 0),

  CONSTRAINT tipologia_suites_valido
    CHECK (suites IS NULL OR suites >= 0),

  CONSTRAINT tipologia_vagas_valido
    CHECK (vagas IS NULL OR vagas >= 0),

  CONSTRAINT tipologia_area_valida
    CHECK (area_m2 IS NULL OR area_m2 > 0),

  CONSTRAINT tipologia_suites_quartos
    CHECK (
      suites IS NULL
      OR quartos IS NULL
      OR suites <= quartos
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_tipologias_empreendimento_nome
ON public.empreendimento_tipologias (
  empreendimento_id,
  lower(trim(nome))
);

CREATE INDEX IF NOT EXISTS
  idx_tipologias_empreendimento
ON public.empreendimento_tipologias (
  empreendimento_id,
  ordem
);

ALTER TABLE public.empreendimento_tipologias
ENABLE ROW LEVEL SECURITY;
