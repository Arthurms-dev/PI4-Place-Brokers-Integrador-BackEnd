-- Place Brokers PI4: aviso de lead novo no celular (Web Push).
-- push_inscricoes: cada navegador/celular em que o corretor ativou os avisos.
-- leads.notificado_em: quando o aviso do lead foi mandado (para não mandar duas vezes).
-- Aditivo: não apaga nada.
BEGIN;

CREATE TABLE IF NOT EXISTS public.push_inscricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  ultimo_envio_em timestamptz
);
CREATE INDEX IF NOT EXISTS push_inscricoes_usuario_idx ON public.push_inscricoes (usuario_id);

ALTER TABLE public.push_inscricoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_inscricoes FROM anon, authenticated;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS notificado_em timestamptz;
CREATE INDEX IF NOT EXISTS leads_aguardando_aviso_idx ON public.leads (atribuido_em)
  WHERE notificado_em IS NULL AND corretor_id IS NOT NULL;

COMMIT;
