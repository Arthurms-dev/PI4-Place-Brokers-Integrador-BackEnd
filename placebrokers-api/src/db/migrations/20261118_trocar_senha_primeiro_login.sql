-- Place Brokers PI4: troca obrigatória da senha temporária (18/11/2026).
-- Acessos internos criados pelo admin (gerente, RH, recepção, diretor, cadastro) nascem com trocar_senha = true.
-- Enquanto estiver true, a API só deixa ver o próprio perfil (GET /auth/me) e trocar a senha (PATCH /auth/senha).
-- Volta para false quando a pessoa troca a senha ou redefine pelo e-mail.
-- Só o admin altera profiles (RLS), então o próprio usuário não consegue desligar a marca pelo front.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trocar_senha boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.trocar_senha IS
  'true = acesso criado pelo admin com senha temporária; a pessoa precisa trocar a senha no primeiro login.';
