-- Place Brokers PI4:
-- 1) Miniatura da capa (640 px) para os cards do site e do catálogo.
--    Preenchida no upload da capa e, para as antigas, pelo script scripts/gerar-miniaturas.cjs.
-- 2) Aviso de lead novo também no app React Native (Expo): a inscrição do app guarda só o token
--    do Expo, sem as chaves do Web Push.
-- Aditivo: não apaga dados.
BEGIN;

ALTER TABLE public.empreendimentos ADD COLUMN IF NOT EXISTS capa_miniatura_url text;

ALTER TABLE public.push_inscricoes ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'web';
ALTER TABLE public.push_inscricoes ALTER COLUMN p256dh DROP NOT NULL;
ALTER TABLE public.push_inscricoes ALTER COLUMN auth DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_inscricoes_tipo_valido') THEN
    ALTER TABLE public.push_inscricoes ADD CONSTRAINT push_inscricoes_tipo_valido
      CHECK (tipo = 'expo' OR (tipo = 'web' AND p256dh IS NOT NULL AND auth IS NOT NULL));
  END IF;
END $$;

COMMIT;
