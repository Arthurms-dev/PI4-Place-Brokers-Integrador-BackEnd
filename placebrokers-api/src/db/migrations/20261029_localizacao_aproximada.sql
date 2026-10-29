-- Place Brokers PI4: marca quando a localização do empreendimento é aproximada (bairro/rua, sem o ponto exato).
-- O site mostra "localização aproximada" e o link do Google Maps busca pelo endereço, não pelo ponto.
-- Quando alguém corrigir latitude/longitude pelo painel, a marca sai sozinha.
-- Aditivo: não apaga nada.
BEGIN;

ALTER TABLE public.empreendimentos
  ADD COLUMN IF NOT EXISTS localizacao_aproximada boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.empreendimento_localizacao_conferida()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $func$
BEGIN
  -- Coordenada mudou e quem salvou não mexeu na marca: é um ponto conferido à mão.
  IF (NEW.latitude, NEW.longitude) IS DISTINCT FROM (OLD.latitude, OLD.longitude)
     AND NEW.localizacao_aproximada IS NOT DISTINCT FROM OLD.localizacao_aproximada THEN
    NEW.localizacao_aproximada := false;
  END IF;
  RETURN NEW;
END;
$func$;

CREATE OR REPLACE TRIGGER trg_empreendimento_localizacao_conferida
  BEFORE UPDATE OF latitude, longitude ON public.empreendimentos
  FOR EACH ROW EXECUTE FUNCTION public.empreendimento_localizacao_conferida();

COMMIT;
