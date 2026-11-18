-- Place Brokers PI4: foto de perfil (17/11/2026). Cada usuário troca a própria em Configurações.
-- A API recorta a foto em 256 x 256 px e salva em WebP; a coluna profiles.avatar_url já existia.
-- Bucket público: a foto aparece no topo das telas e na lista da equipe direto pelo link.
-- O nome do arquivo é aleatório e fica na pasta do próprio usuário (<id>/<uuid>.webp).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatares', 'avatares', true, 524288, ARRAY['image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true, file_size_limit = 524288, allowed_mime_types = ARRAY['image/webp'];
