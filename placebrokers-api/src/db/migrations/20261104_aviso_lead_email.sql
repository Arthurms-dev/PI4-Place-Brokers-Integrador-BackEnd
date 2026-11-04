-- Aviso de lead novo por e-mail: ligado para todos os corretores (não aparece no Perfil).
-- A coluna fica para, no futuro, dar a opção de desligar por corretor.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aviso_lead_email boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ALTER COLUMN aviso_lead_email SET DEFAULT true;
UPDATE public.profiles SET aviso_lead_email = true WHERE aviso_lead_email = false;

COMMENT ON COLUMN public.profiles.aviso_lead_email IS
  'Se true, o corretor também recebe por e-mail o aviso de lead novo (além do push).';
