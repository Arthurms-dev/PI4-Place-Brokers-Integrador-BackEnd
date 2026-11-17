-- Place Brokers PI4: divisão de cargos (reunião com a diretoria em 17/11/2026).
-- Cargos novos, todos criados só pelo admin na aba Equipe (sem cadastro público):
--   * rh ........ candidaturas e vagas do Trabalhe conosco
--   * recepcao .. lista de chegada e roleta do dia
--   * diretor ... VGV, dashboard e vendas da própria diretoria (só leitura)
--   * cadastro .. empreendimentos, fotos, books e tabelas
--
-- PARTE 1 de 2. Rode este arquivo SOZINHO e só depois o 20261117_trabalhe_conosco.sql:
-- o Postgres só deixa usar um valor novo de enum depois que a transação que o criou termina.
-- O gatilho profiles_avisos_seguranca já avisa o admin quando alguém muda de cargo.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'rh';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'recepcao';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'diretor';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'cadastro';

-- Diretoria do diretor: é o que limita o VGV e o dashboard que ele vê.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS diretoria_id uuid REFERENCES public.diretorias(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS profiles_diretoria_id_idx ON public.profiles (diretoria_id);

COMMENT ON COLUMN public.profiles.diretoria_id IS
  'Só para o cargo diretor: a diretoria cujos números ele acompanha.';
