-- Place Brokers PI4: histórico de interações de leads (aditivo; não modifica dados atuais).
-- Executar uma vez no SQL Editor do Supabase, antes de ligar a interface.
create table if not exists public.lead_atividades (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  autor_id uuid references public.profiles(id) on delete set null,
  tipo text not null check (tipo in ('ligacao','whatsapp','email','visita','observacao')),
  descricao text not null check (char_length(btrim(descricao)) between 1 and 2000),
  proximo_contato_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists lead_atividades_lead_criado_idx
  on public.lead_atividades(lead_id, criado_em desc);
create index if not exists lead_atividades_proximo_idx
  on public.lead_atividades(proximo_contato_em)
  where proximo_contato_em is not null;
-- Não dar acesso direto a usuários/clientes. A API autenticada verifica o dono
-- do lead e usa supabaseAdmin (service role) para operar nesta tabela.
alter table public.lead_atividades enable row level security;
