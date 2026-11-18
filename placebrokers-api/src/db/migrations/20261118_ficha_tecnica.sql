-- Place Brokers PI4: ficha técnica e registro da incorporação do empreendimento.
-- Ficha técnica: torres, andares, aptos por andar, total de unidades, elevadores por torre e área do terreno.
-- Registro da incorporação (Lei 4.591/64, art. 32): número do registro na matrícula, cartório e data.
-- Tudo opcional e público (vai para a página do empreendimento). Aditivo: não apaga nada. Aplicada no Supabase em 18/11/2026.
BEGIN;

ALTER TABLE public.empreendimentos
  ADD COLUMN IF NOT EXISTS torres smallint CHECK (torres IS NULL OR torres BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS andares smallint CHECK (andares IS NULL OR andares BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS aptos_por_andar smallint CHECK (aptos_por_andar IS NULL OR aptos_por_andar BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS unidades_total integer CHECK (unidades_total IS NULL OR unidades_total BETWEEN 1 AND 50000),
  ADD COLUMN IF NOT EXISTS elevadores_por_torre smallint CHECK (elevadores_por_torre IS NULL OR elevadores_por_torre BETWEEN 0 AND 50),
  ADD COLUMN IF NOT EXISTS area_terreno_m2 numeric(12,2) CHECK (area_terreno_m2 IS NULL OR area_terreno_m2 > 0),
  ADD COLUMN IF NOT EXISTS registro_incorporacao text CHECK (registro_incorporacao IS NULL OR char_length(registro_incorporacao) BETWEEN 2 AND 120),
  ADD COLUMN IF NOT EXISTS registro_cartorio text CHECK (registro_cartorio IS NULL OR char_length(registro_cartorio) BETWEEN 2 AND 120),
  ADD COLUMN IF NOT EXISTS registro_data date;

COMMENT ON COLUMN public.empreendimentos.registro_incorporacao IS 'Número do registro da incorporação na matrícula (ex.: R-5 da matrícula 12.345). Lei 4.591/64, art. 32.';

COMMIT;
