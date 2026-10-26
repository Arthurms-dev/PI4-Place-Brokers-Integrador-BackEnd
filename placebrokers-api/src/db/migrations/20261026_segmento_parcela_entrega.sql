-- Já aplicada no Supabase em 26/10/2026.
-- Segmento comercial, parcela MCMV e previsão de entrega do empreendimento.
ALTER TABLE public.empreendimentos
  ADD COLUMN IF NOT EXISTS segmento text
    CHECK (segmento IN ('mcmv', 'medio_padrao', 'alto_padrao', 'litoral')),
  ADD COLUMN IF NOT EXISTS parcela_min numeric(12,2)
    CHECK (parcela_min IS NULL OR parcela_min > 0),
  ADD COLUMN IF NOT EXISTS previsao_entrega date;

COMMENT ON COLUMN public.empreendimentos.segmento IS 'mcmv | medio_padrao | alto_padrao | litoral';
COMMENT ON COLUMN public.empreendimentos.parcela_min IS 'MCMV: "parcelas a partir de" (R$ 499 longe do centro, R$ 599 perto). Demais segmentos usam preco_min (unidade mais barata).';
COMMENT ON COLUMN public.empreendimentos.previsao_entrega IS 'Mês previsto de entrega (dia 1). Nulo quando status = pronto.';
