-- Place Brokers PI4: Trabalhe conosco e painel do RH (reunião com a diretoria em 17/11/2026).
-- PARTE 2 de 2: rode depois do 20261117_cargos_novos.sql.
--
-- vagas ........ vagas específicas abertas pelo RH (o banco de talentos é a candidatura sem vaga)
-- candidaturas . quem se candidatou pelo site; o currículo fica no bucket privado "curriculos"
-- Mesmo e-mail ou mesmo telefone na mesma vaga = mesma pessoa: a API atualiza em vez de duplicar.
-- A API é a única porta (20261102_api_unica_porta.sql): anon e authenticated não leem nada.
BEGIN;

CREATE TABLE IF NOT EXISTS public.vagas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        text NOT NULL CHECK (char_length(titulo) BETWEEN 3 AND 120),
  area          text NOT NULL CHECK (area IN ('corretor', 'captacao', 'administrativo', 'marketing', 'tecnologia', 'outra')),
  unidade       text CHECK (unidade IN ('Recife', 'Caruaru', 'Paulista')),
  descricao     text CHECK (char_length(descricao) <= 2000),
  aberta        boolean NOT NULL DEFAULT true,
  criado_por    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.candidaturas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vaga_id              uuid REFERENCES public.vagas(id) ON DELETE SET NULL,
  nome                 text NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 120),
  email                text NOT NULL CHECK (char_length(email) <= 160),
  telefone             text NOT NULL CHECK (char_length(telefone) BETWEEN 10 AND 13),
  unidade              text CHECK (unidade IN ('Recife', 'Caruaru', 'Paulista')),
  area                 text NOT NULL CHECK (area IN ('corretor', 'captacao', 'administrativo', 'marketing', 'tecnologia', 'outra')),
  creci                text CHECK (char_length(creci) <= 30),
  linkedin             text CHECK (char_length(linkedin) <= 200),
  mensagem             text CHECK (char_length(mensagem) <= 1500),
  curriculo_path       text,
  status               text NOT NULL DEFAULT 'novo'
                         CHECK (status IN ('novo', 'em_analise', 'entrevista', 'aprovado', 'recusado')),
  notas                text CHECK (char_length(notas) <= 3000),
  consentimento_versao text NOT NULL,
  reenvios             integer NOT NULL DEFAULT 0,
  atualizado_por       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS candidaturas_email_idx ON public.candidaturas (lower(email));
CREATE INDEX IF NOT EXISTS candidaturas_telefone_idx ON public.candidaturas (telefone);
CREATE INDEX IF NOT EXISTS candidaturas_status_idx ON public.candidaturas (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS vagas_aberta_idx ON public.vagas (aberta, criado_em DESC);

DROP TRIGGER IF EXISTS trg_vagas_atualizado_em ON public.vagas;
CREATE TRIGGER trg_vagas_atualizado_em BEFORE UPDATE ON public.vagas
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();
DROP TRIGGER IF EXISTS trg_candidaturas_atualizado_em ON public.candidaturas;
CREATE TRIGGER trg_candidaturas_atualizado_em BEFORE UPDATE ON public.candidaturas
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

ALTER TABLE public.vagas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidaturas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vagas, public.candidaturas FROM anon, authenticated;

-- Currículos: bucket privado, só PDF, até 5 MB. O RH abre por link temporário gerado pela API.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('curriculos', 'curriculos', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = 5242880, allowed_mime_types = ARRAY['application/pdf'];

COMMIT;
