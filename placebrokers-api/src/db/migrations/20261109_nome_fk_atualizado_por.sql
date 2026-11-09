-- Aplicada no Supabase em 09/11/2026.
-- O empreendimentoRepository pede a relação "empreendimentos_atualizados_por_fkey" (autor da última
-- atualização, commit 881a9f9). No banco a chave se chamava "empreendimentos_atualizado_por_fkey",
-- e GET /empreendimentos respondia 500: o site ficou sem imóveis até a correção.
alter table public.empreendimentos rename constraint empreendimentos_atualizado_por_fkey to empreendimentos_atualizados_por_fkey;
notify pgrst, 'reload schema';
