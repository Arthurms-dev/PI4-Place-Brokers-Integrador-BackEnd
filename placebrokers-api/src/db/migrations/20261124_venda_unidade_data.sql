-- Place Brokers PI4: unidade e data da venda (revisão de telas, 24/11/2026).
-- Antes, o card de venda mostrava só a data em que o corretor lançou a venda (criado_em).
-- As duas colunas aceitam vazio para não mexer nas vendas antigas; o back passa a exigir as duas nas novas.
-- Rode ANTES de publicar o back novo: sem as colunas, o lançamento de venda falha.

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS unidade text,
  ADD COLUMN IF NOT EXISTS data_venda date;

-- Sem DROP: só cria a regra se ela ainda não existir.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendas_unidade_tamanho') THEN
    ALTER TABLE public.vendas
      ADD CONSTRAINT vendas_unidade_tamanho CHECK (unidade IS NULL OR char_length(unidade) BETWEEN 1 AND 40);
  END IF;
END $$;

COMMENT ON COLUMN public.vendas.unidade IS 'Unidade vendida, como o corretor escreveu (ex.: Torre A, 1203).';
COMMENT ON COLUMN public.vendas.data_venda IS 'Dia em que a venda foi fechada (pode ser antes do lançamento no sistema).';
