create extension if not exists "pgcrypto";

create type user_role as enum ('admin', 'corretor', 'viabilizador');
create type empreendimento_status as enum ('lancamento', 'obras', 'pronto', 'outros');
create type lead_status as enum ('novo', 'em_atendimento', 'convertido', 'perdido');
create type agendamento_status as enum ('agendado', 'confirmado', 'realizado', 'cancelado');
create type evento_tipo as enum ('visualizacao_site', 'visualizacao_empreendimento', 'busca', 'contato');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null,
  telefone text,
  cargo user_role not null default 'corretor',
  creci text,
  avatar_url text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.construtoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  logo_url text,
  site text,
  criado_em timestamptz not null default now()
);

create table public.empreendimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  construtora_id uuid references public.construtoras (id) on delete set null,
  status empreendimento_status not null default 'lancamento',
  descricao text,
  uf char(2) not null,
  cidade text not null,
  bairro text not null,
  endereco text,
  cep text,
  latitude double precision,
  longitude double precision,
  quartos_min smallint,
  quartos_max smallint,
  vagas_min smallint,
  vagas_max smallint,
  area_min numeric(8, 2),
  area_max numeric(8, 2),
  preco_min numeric(12, 2),
  preco_max numeric(12, 2),
  lazer text[] not null default '{}',
  capa_url text,
  book_url text,
  book_atualizado_em timestamptz,
  tabela_url text,
  tabela_atualizado_em timestamptz,
  destaque boolean not null default false,
  publicado boolean not null default false,
  criado_por uuid references public.profiles (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_empreendimentos_localizacao on public.empreendimentos (uf, cidade, bairro);
create index idx_empreendimentos_status on public.empreendimentos (status);
create index idx_empreendimentos_lazer on public.empreendimentos using gin (lazer);

create table public.empreendimento_imagens (
  id uuid primary key default gen_random_uuid(),
  empreendimento_id uuid not null references public.empreendimentos (id) on delete cascade,
  url text not null,
  alt text,
  ordem smallint not null default 0,
  criado_em timestamptz not null default now()
);

create index idx_imagens_empreendimento on public.empreendimento_imagens (empreendimento_id);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  telefone text,
  empreendimento_id uuid references public.empreendimentos (id) on delete set null,
  corretor_id uuid references public.profiles (id) on delete set null,
  origem text not null default 'site',
  status lead_status not null default 'novo',
  mensagem text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_leads_corretor on public.leads (corretor_id);
create index idx_leads_empreendimento on public.leads (empreendimento_id);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  telefone text,
  corretor_id uuid not null references public.profiles (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  observacoes text,
  criado_em timestamptz not null default now()
);

create index idx_clientes_corretor on public.clientes (corretor_id);

create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  empreendimento_id uuid not null references public.empreendimentos (id) on delete cascade,
  cliente_id uuid references public.clientes (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  corretor_id uuid not null references public.profiles (id) on delete cascade,
  data_hora timestamptz not null,
  status agendamento_status not null default 'agendado',
  observacoes text,
  criado_em timestamptz not null default now()
);

create index idx_agendamentos_corretor on public.agendamentos (corretor_id);
create index idx_agendamentos_data on public.agendamentos (data_hora);

create table public.eventos_acesso (
  id uuid primary key default gen_random_uuid(),
  tipo evento_tipo not null,
  empreendimento_id uuid references public.empreendimentos (id) on delete set null,
  usuario_id uuid references public.profiles (id) on delete set null,
  sessao_id text,
  criado_em timestamptz not null default now()
);

create index idx_eventos_criado_em on public.eventos_acesso (criado_em);
create index idx_eventos_empreendimento on public.eventos_acesso (empreendimento_id);

create or replace function public.set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger trg_empreendimentos_atualizado_em
before update on public.empreendimentos
for each row execute function public.set_atualizado_em();

create trigger trg_leads_atualizado_em
before update on public.leads
for each row execute function public.set_atualizado_em();

alter table public.profiles enable row level security;
alter table public.construtoras enable row level security;
alter table public.empreendimentos enable row level security;
alter table public.empreendimento_imagens enable row level security;
alter table public.leads enable row level security;
alter table public.clientes enable row level security;
alter table public.agendamentos enable row level security;
alter table public.eventos_acesso enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and cargo = 'admin'
  );
$$;

create policy "profiles_select_proprio_ou_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_admin_gerencia" on public.profiles
  for all using (public.is_admin());

create policy "construtoras_select_publico" on public.construtoras
  for select using (true);
create policy "construtoras_insert_admin" on public.construtoras
  for insert with check (public.is_admin());
create policy "construtoras_update_admin" on public.construtoras
  for update using (public.is_admin());
create policy "construtoras_delete_admin" on public.construtoras
  for delete using (public.is_admin());

create policy "empreendimentos_select" on public.empreendimentos
  for select using (publicado = true or auth.uid() is not null);
create policy "empreendimentos_insert_admin" on public.empreendimentos
  for insert with check (public.is_admin());
create policy "empreendimentos_update_admin" on public.empreendimentos
  for update using (public.is_admin());
create policy "empreendimentos_delete_admin" on public.empreendimentos
  for delete using (public.is_admin());

create policy "imagens_select_publico" on public.empreendimento_imagens
  for select using (true);
create policy "imagens_admin_gerencia" on public.empreendimento_imagens
  for all using (public.is_admin());

create policy "leads_insert_publico" on public.leads
  for insert with check (true);
create policy "leads_select_equipe" on public.leads
  for select using (
    auth.uid() is not null
    and (corretor_id = auth.uid() or corretor_id is null or public.is_admin())
  );
create policy "leads_update_equipe" on public.leads
  for update using (
    auth.uid() is not null
    and (corretor_id = auth.uid() or public.is_admin())
  );

create policy "clientes_do_corretor" on public.clientes
  for all using (corretor_id = auth.uid() or public.is_admin());

create policy "agendamentos_do_corretor" on public.agendamentos
  for all using (corretor_id = auth.uid() or public.is_admin());

create policy "eventos_insert_publico" on public.eventos_acesso
  for insert with check (true);
create policy "eventos_select_equipe" on public.eventos_acesso
  for select using (auth.uid() is not null);