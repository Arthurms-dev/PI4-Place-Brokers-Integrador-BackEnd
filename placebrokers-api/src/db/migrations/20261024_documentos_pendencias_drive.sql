-- Place Brokers — Fila privada de pendências de documentos comerciais do Google Drive.
-- Não modifica a tabela existente empreendimento_documentos e não aprova PDFs.
-- Execute uma vez no Supabase SQL Editor antes de usar o modo --apply.

create table if not exists public.empreendimento_documentos_pendencias (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null check (drive_file_id ~ '^[A-Za-z0-9_-]{10,}$'),
  drive_pasta_id text,
  arquivo_nome text not null,
  drive_modificado_em timestamptz not null,
  motivo text not null check (motivo in (
    'PDF_NOVO_SEM_VINCULO',
    'ARQUIVO_MODIFICADO',
    'SEM_DATA_REFERENCIA',
    'VINCULOS_REPETIDOS',
    'LEGADO_REPETIDO'
  )),
  empreendimento_id uuid references public.empreendimentos(id) on delete set null,
  documento_id uuid references public.empreendimento_documentos(id) on delete set null,
  tipo text check (tipo in ('book', 'tabela')),
  fase text,
  status text not null default 'pendente' check (status in ('pendente', 'resolvido', 'ignorado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint uq_drive_pendencia_versao unique (drive_file_id, drive_modificado_em)
);

create index if not exists idx_documentos_pendencias_status
  on public.empreendimento_documentos_pendencias(status, criado_em desc);

alter table public.empreendimento_documentos_pendencias enable row level security;
-- Sem política de acesso público. Somente back-end com service role deverá gerenciar.
