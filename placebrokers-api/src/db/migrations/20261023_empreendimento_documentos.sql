-- Place Brokers: múltiplos documentos comerciais por empreendimento e fase.
-- Execute uma vez no SQL Editor do Supabase ANTES de importar as tabelas por fase.
-- Sem políticas RLS de acesso direto: somente o back-end (service role) pode ler/alterar.
-- Os PDFs continuam no Drive; guardamos IDs, não copiamos arquivos.

create extension if not exists pgcrypto;

create table if not exists public.empreendimento_documentos (
  id uuid primary key default gen_random_uuid(),
  empreendimento_id uuid not null references public.empreendimentos(id) on delete cascade,
  tipo text not null check (tipo in ('book', 'tabela')),
  fase text,
  titulo text not null,
  drive_file_id text not null check (drive_file_id ~ '^[A-Za-z0-9_-]{10,}$'),
  status text not null default 'pendente' check (status in ('pendente','aprovado','arquivado')),
  fonte_nome text,
  fonte_atualizada_em timestamptz,
  validade_ate date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists uq_empreendimento_documento_origem
  on public.empreendimento_documentos(empreendimento_id, drive_file_id);
create index if not exists idx_empreendimento_documentos_aprovados
  on public.empreendimento_documentos(empreendimento_id, status, tipo);

alter table public.empreendimento_documentos enable row level security;
-- Não criar política SELECT pública: a aplicação acessa por rotas autenticadas do backend.
