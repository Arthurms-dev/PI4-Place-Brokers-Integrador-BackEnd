-- Executar depois de 20261023_empreendimento_documentos.sql e
-- 20261024_documentos_pendencias_drive.sql. Não publica documentos existentes.
begin;

alter table public.empreendimento_documentos_pendencias
  add column if not exists revisao integer not null default 0,
  add column if not exists titulo_revisado text,
  add column if not exists documento_referencia jsonb,
  add column if not exists validade_revisada date,
  add column if not exists revisado_por uuid,
  add column if not exists revisado_em timestamptz,
  add column if not exists motivo_revisao text;

create table if not exists public.documentos_drive_revisoes (
  id uuid primary key default gen_random_uuid(),
  pendencia_id uuid not null references public.empreendimento_documentos_pendencias(id),
  revisor_id uuid not null,
  acao text not null check (acao in ('vincular', 'ignorar', 'concluir')),
  antes jsonb not null,
  depois jsonb not null,
  documento_antes jsonb,
  documento_depois jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists idx_documentos_drive_revisoes_pendencia
  on public.documentos_drive_revisoes(pendencia_id, criado_em);
alter table public.documentos_drive_revisoes enable row level security;
revoke all on public.documentos_drive_revisoes from public, anon, authenticated;
grant select, insert on public.documentos_drive_revisoes to service_role;

-- Uma transação para vínculo, aprovação e histórico. O ID do ADM é fornecido
-- pelo middleware autenticado do backend, nunca pelo corpo da requisição.
create or replace function public.revisar_pendencia_drive(
  p_id uuid, p_revisor uuid, p_revisao integer, p_acao text, p_dados jsonb
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  p public.empreendimento_documentos_pendencias%rowtype;
  d public.empreendimento_documentos%rowtype;
  anterior jsonb;
  doc_antes jsonb;
  doc_depois jsonb;
  emp uuid;
  alvo uuid;
  validade date;
  hoje date := (now() at time zone 'America/Recife')::date;
begin
  if not exists (select 1 from public.profiles
    where id = p_revisor and cargo = 'admin' and ativo is not false and status = 'aprovado') then
    raise exception 'REVISOR_NAO_AUTORIZADO';
  end if;
  if p_acao is null or p_acao not in ('vincular', 'ignorar', 'concluir')
    or p_revisao is null or p_revisao < 0 or jsonb_typeof(p_dados) is distinct from 'object' then
    raise exception 'REVISAO_INVALIDA';
  end if;

  select * into p from public.empreendimento_documentos_pendencias where id = p_id for update;
  if not found then raise exception 'PENDENCIA_AUSENTE'; end if;
  if p.status <> 'pendente' then raise exception 'PENDENCIA_ENCERRADA'; end if;
  if p.revisao <> p_revisao then raise exception 'REVISAO_CONFLITO'; end if;
  anterior := to_jsonb(p);

  if p_acao = 'vincular' then
    emp := nullif(p_dados->>'empreendimentoId', '')::uuid;
    alvo := nullif(p_dados->>'documentoId', '')::uuid;
    validade := nullif(p_dados->>'validadeAte', '')::date;
    if emp is null or coalesce(p_dados->>'tipo', '') not in ('book', 'tabela')
      or length(trim(coalesce(p_dados->>'titulo', ''))) not between 2 and 150
      or length(trim(coalesce(p_dados->>'fase', ''))) > 80 then
      raise exception 'REVISAO_INVALIDA';
    end if;
    perform 1 from public.empreendimentos where id = emp;
    if not found then raise exception 'EMPREENDIMENTO_AUSENTE'; end if;
    if alvo is not null then
      select * into d from public.empreendimento_documentos where id = alvo and empreendimento_id = emp;
      if not found then raise exception 'DOCUMENTO_INVALIDO'; end if;
      doc_antes := to_jsonb(d);
    end if;
    update public.empreendimento_documentos_pendencias set
      empreendimento_id = emp, documento_id = alvo, tipo = p_dados->>'tipo',
      fase = nullif(trim(p_dados->>'fase'), ''), titulo_revisado = trim(p_dados->>'titulo'),
      validade_revisada = validade, documento_referencia = doc_antes
      where id = p_id returning * into p;
    -- Salvar vínculo não modifica nem aprova empreendimento_documentos.
  else
    if length(trim(coalesce(p_dados->>'motivo', ''))) not between 8 and 500 then
      raise exception 'REVISAO_INVALIDA';
    end if;
    if p_acao = 'concluir' then
      if (p_dados->'confirmarAprovacao') is distinct from 'true'::jsonb then
        raise exception 'REVISAO_INVALIDA';
      end if;
      if p.empreendimento_id is null or p.tipo is null or p.titulo_revisado is null then
        raise exception 'VINCULO_INCOMPLETO';
      end if;
      if p.validade_revisada < hoje then raise exception 'VALIDADE_EXPIRADA'; end if;
      if p.documento_id is null and p.documento_referencia is not null then
        raise exception 'DOCUMENTO_ALTERADO';
      end if;
      -- Serializa aprovações deste fluxo para o mesmo empreendimento.
      perform pg_advisory_xact_lock(hashtextextended(p.empreendimento_id::text, 0));
      perform 1 from public.empreendimentos where id = p.empreendimento_id for key share;
      if not found then raise exception 'EMPREENDIMENTO_AUSENTE'; end if;
      if p.documento_id is not null then
        select * into d from public.empreendimento_documentos
          where id = p.documento_id and empreendimento_id = p.empreendimento_id for update;
        if not found then raise exception 'DOCUMENTO_INVALIDO'; end if;
        doc_antes := to_jsonb(d);
        if p.documento_referencia is distinct from doc_antes then
          raise exception 'DOCUMENTO_ALTERADO';
        end if;
        if d.drive_file_id = p.drive_file_id and d.fonte_atualizada_em > p.drive_modificado_em then
          raise exception 'DOCUMENTO_CONFLITO';
        end if;
      end if;
      if exists (select 1 from public.empreendimento_documentos x
        where x.empreendimento_id = p.empreendimento_id
          and (p.documento_id is null or x.id <> p.documento_id)
          and (x.drive_file_id = p.drive_file_id or
            (x.status = 'aprovado' and (x.validade_ate is null or x.validade_ate >= hoje)
             and x.tipo = p.tipo and lower(trim(coalesce(x.fase, ''))) = lower(trim(coalesce(p.fase, '')))))) then
        raise exception 'DOCUMENTO_CONFLITO';
      end if;
      if p.documento_id is null then
        insert into public.empreendimento_documentos
          (empreendimento_id, tipo, titulo, fase, drive_file_id, status, fonte_nome, fonte_atualizada_em, validade_ate)
        values (p.empreendimento_id, p.tipo, p.titulo_revisado, p.fase, p.drive_file_id,
          'aprovado', p.arquivo_nome, p.drive_modificado_em, p.validade_revisada)
        returning * into d;
      else
        update public.empreendimento_documentos set tipo = p.tipo, titulo = p.titulo_revisado,
          fase = p.fase, drive_file_id = p.drive_file_id, status = 'aprovado',
          fonte_nome = p.arquivo_nome, fonte_atualizada_em = p.drive_modificado_em,
          validade_ate = p.validade_revisada, atualizado_em = now()
        where id = p.documento_id returning * into d;
      end if;
      doc_depois := to_jsonb(d);
      update public.empreendimento_documentos_pendencias set status = 'resolvido', documento_id = d.id
        where id = p_id returning * into p;
    else
      update public.empreendimento_documentos_pendencias set status = 'ignorado'
        where id = p_id returning * into p;
    end if;
  end if;

  update public.empreendimento_documentos_pendencias set revisao = revisao + 1,
    revisado_por = p_revisor, revisado_em = now(), atualizado_em = now(),
    motivo_revisao = case when p_acao = 'vincular' then null else trim(p_dados->>'motivo') end
    where id = p_id returning * into p;
  insert into public.documentos_drive_revisoes
    (pendencia_id, revisor_id, acao, antes, depois, documento_antes, documento_depois)
    values (p_id, p_revisor, p_acao, anterior, to_jsonb(p), doc_antes, doc_depois);
  return jsonb_build_object('id', p.id, 'status', p.status, 'revisao', p.revisao,
    'documentoId', p.documento_id, 'empreendimentoId', p.empreendimento_id,
    'tipo', p.tipo, 'fase', p.fase, 'tituloRevisado', p.titulo_revisado,
    'validadeRevisada', p.validade_revisada, 'revisadoPor', p.revisado_por,
    'revisadoEm', p.revisado_em, 'motivoRevisao', p.motivo_revisao);
end;
$$;
revoke all on function public.revisar_pendencia_drive(uuid, uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.revisar_pendencia_drive(uuid, uuid, integer, text, jsonb) to service_role;

commit;
