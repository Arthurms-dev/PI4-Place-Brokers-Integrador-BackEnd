-- ============================================================================
-- PLACE BROKERS | ESQUEMA REAL DO SUPABASE (FOTOGRAFIA DOCUMENTAL)
-- Atualizado com os metadados fornecidos em 24/10/2026.
-- ============================================================================
-- !! NÃO EXECUTAR ESTE ARQUIVO NO SUPABASE EXISTENTE !!
-- Este arquivo é uma REFERÊNCIA NÃO EXECUTÁVEL: todos os comandos estão
-- comentados. NÃO é migração, dump de backup nem script de restauração.
-- Fontes: exportação das 18 tabelas (colunas, PK/FK, CHECK, defaults),
-- catálogo de 8 enums, auditoria de RLS (18/18), índices (48),
-- políticas (19), gatilhos (3), e tipos específicos conferidos.
-- As definições de funções (ex. is_admin e set_atualizado_em) NÃO foram
-- exportadas, portanto NÃO são inferidas neste arquivo.
-- Índices associados às constraints aparecem listados em separado porque
-- refletem o catálogo real (não são ordens para recriar indexes).
-- A ordem original das tabelas e constraints pode não ser válida para DDL.
-- Não executar nem retirar a proteção de comentários para reconstrução.
-- ============================================================================


-- ### 01. ENUMS CONFERIDOS

-- CREATE TYPE public.agendamento_status AS ENUM ('agendado', 'confirmado', 'realizado', 'cancelado', 'nao_compareceu');

-- CREATE TYPE public.conta_status AS ENUM ('pendente', 'aprovado', 'recusado');

-- CREATE TYPE public.empreendimento_status AS ENUM ('lancamento', 'obras', 'pronto', 'outros');

-- CREATE TYPE public.evento_tipo AS ENUM ('visualizacao_site', 'visualizacao_empreendimento', 'busca', 'contato');

-- CREATE TYPE public.lead_status AS ENUM ('novo', 'em_atendimento', 'convertido', 'perdido');

-- CREATE TYPE public.user_role AS ENUM ('admin', 'corretor', 'viabilizador', 'gerente');

-- CREATE TYPE public.venda_status AS ENUM ('pendente', 'confirmada', 'recusada');

-- CREATE TYPE public.vinculo_tipo AS ENUM ('interno', 'externo');


-- ### 02. TABELAS, COLUNAS E CONSTRAINTS CONFERIDAS

-- -----------------------------------------------------------------------

-- public.profiles

-- CREATE TABLE public.profiles (
--   id uuid NOT NULL,
--   nome text NOT NULL,
--   email text NOT NULL,
--   telefone text,
--   cargo public.user_role NOT NULL DEFAULT 'corretor'::user_role,
--   creci text,
--   avatar_url text,
--   ativo boolean NOT NULL DEFAULT true,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   vinculo public.vinculo_tipo,
--   status public.conta_status NOT NULL DEFAULT 'pendente'::conta_status,
--   aprovado_por uuid,
--   aprovado_em timestamp with time zone,
--   equipe_id uuid,
--   uf character(2),
--   construtora_id uuid,
--   CONSTRAINT profiles_pkey PRIMARY KEY (id),
--   CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
--   CONSTRAINT profiles_aprovado_por_fkey FOREIGN KEY (aprovado_por) REFERENCES public.profiles(id),
--   CONSTRAINT profiles_equipe_id_fkey FOREIGN KEY (equipe_id) REFERENCES public.equipes(id),
--   CONSTRAINT profiles_construtora_id_fkey FOREIGN KEY (construtora_id) REFERENCES public.construtoras(id)
-- );

-- -----------------------------------------------------------------------

-- public.construtoras

-- CREATE TABLE public.construtoras (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   nome text NOT NULL,
--   logo_url text,
--   site text,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT construtoras_pkey PRIMARY KEY (id)
-- );

-- -----------------------------------------------------------------------

-- public.empreendimentos

-- CREATE TABLE public.empreendimentos (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   nome text NOT NULL,
--   slug text NOT NULL UNIQUE,
--   construtora_id uuid,
--   status public.empreendimento_status NOT NULL DEFAULT 'lancamento'::empreendimento_status,
--   descricao text,
--   uf character(2) NOT NULL,
--   cidade text NOT NULL,
--   bairro text NOT NULL,
--   endereco text,
--   cep text,
--   latitude double precision,
--   longitude double precision,
--   quartos_min smallint,
--   quartos_max smallint,
--   vagas_min smallint,
--   vagas_max smallint,
--   area_min numeric(8,2),
--   area_max numeric(8,2),
--   preco_min numeric(12,2),
--   preco_max numeric(12,2),
--   lazer text[] NOT NULL DEFAULT '{}'::text[],
--   capa_url text,
--   book_url text,
--   book_atualizado_em timestamp with time zone,
--   tabela_url text,
--   tabela_atualizado_em timestamp with time zone,
--   destaque boolean NOT NULL DEFAULT false,
--   publicado boolean NOT NULL DEFAULT false,
--   criado_por uuid,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
--   disponivel boolean NOT NULL DEFAULT true,
--   documentos_atualizados_em timestamp with time zone,
--   CONSTRAINT empreendimentos_pkey PRIMARY KEY (id),
--   CONSTRAINT empreendimentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.profiles(id),
--   CONSTRAINT empreendimentos_construtora_id_fkey FOREIGN KEY (construtora_id) REFERENCES public.construtoras(id)
-- );

-- -----------------------------------------------------------------------

-- public.empreendimento_imagens

-- CREATE TABLE public.empreendimento_imagens (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   empreendimento_id uuid NOT NULL,
--   url text NOT NULL,
--   alt text,
--   ordem smallint NOT NULL DEFAULT 0,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT empreendimento_imagens_pkey PRIMARY KEY (id),
--   CONSTRAINT empreendimento_imagens_empreendimento_id_fkey FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id)
-- );

-- -----------------------------------------------------------------------

-- public.leads

-- CREATE TABLE public.leads (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   nome text NOT NULL,
--   email text,
--   telefone text,
--   empreendimento_id uuid,
--   corretor_id uuid,
--   origem text NOT NULL DEFAULT 'site'::text,
--   status public.lead_status NOT NULL DEFAULT 'novo'::lead_status,
--   mensagem text,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT leads_pkey PRIMARY KEY (id),
--   CONSTRAINT leads_empreendimento_id_fkey FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id),
--   CONSTRAINT leads_corretor_id_fkey FOREIGN KEY (corretor_id) REFERENCES public.profiles(id)
-- );

-- -----------------------------------------------------------------------

-- public.clientes

-- CREATE TABLE public.clientes (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   nome text NOT NULL,
--   email text,
--   telefone text,
--   corretor_id uuid NOT NULL,
--   lead_id uuid,
--   observacoes text,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT clientes_pkey PRIMARY KEY (id),
--   CONSTRAINT clientes_corretor_id_fkey FOREIGN KEY (corretor_id) REFERENCES public.profiles(id),
--   CONSTRAINT clientes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id)
-- );

-- -----------------------------------------------------------------------

-- public.agendamentos

-- CREATE TABLE public.agendamentos (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   empreendimento_id uuid,
--   cliente_id uuid,
--   lead_id uuid,
--   corretor_id uuid NOT NULL,
--   data_hora timestamp with time zone NOT NULL,
--   status public.agendamento_status NOT NULL DEFAULT 'agendado'::agendamento_status,
--   observacoes text,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   tipo text NOT NULL DEFAULT 'visita_imovel'::text CHECK (tipo = ANY (ARRAY['visita_imovel'::text, 'reuniao_escritorio'::text])),
--   duracao_minutos integer NOT NULL DEFAULT 60,
--   local text,
--   motivo_cancelamento text,
--   interesse_apos_visita text CHECK (interesse_apos_visita = ANY (ARRAY['alto'::text, 'medio'::text, 'baixo'::text])),
--   atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
--   lead_origem_id uuid,
--   CONSTRAINT agendamentos_pkey PRIMARY KEY (id),
--   CONSTRAINT agendamentos_empreendimento_id_fkey FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id),
--   CONSTRAINT agendamentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id),
--   CONSTRAINT agendamentos_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id),
--   CONSTRAINT agendamentos_corretor_id_fkey FOREIGN KEY (corretor_id) REFERENCES public.profiles(id),
--   CONSTRAINT agendamentos_lead_origem_id_fkey FOREIGN KEY (lead_origem_id) REFERENCES public.leads(id)
-- );

-- -----------------------------------------------------------------------

-- public.eventos_acesso

-- CREATE TABLE public.eventos_acesso (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   tipo public.evento_tipo NOT NULL,
--   empreendimento_id uuid,
--   usuario_id uuid,
--   sessao_id text,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT eventos_acesso_pkey PRIMARY KEY (id),
--   CONSTRAINT eventos_acesso_empreendimento_id_fkey FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id),
--   CONSTRAINT eventos_acesso_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.profiles(id)
-- );

-- -----------------------------------------------------------------------

-- public.avisos_seguranca

-- CREATE TABLE public.avisos_seguranca (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   titulo text NOT NULL,
--   descricao text,
--   severidade text NOT NULL DEFAULT 'info'::text CHECK (severidade = ANY (ARRAY['critico'::text, 'atencao'::text, 'info'::text])),
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT avisos_seguranca_pkey PRIMARY KEY (id)
-- );

-- -----------------------------------------------------------------------

-- public.melhorias

-- CREATE TABLE public.melhorias (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   titulo text NOT NULL,
--   descricao text,
--   status text NOT NULL DEFAULT 'sugestao'::text CHECK (status = ANY (ARRAY['sugestao'::text, 'em_analise'::text, 'planejado'::text, 'concluido'::text])),
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT melhorias_pkey PRIMARY KEY (id)
-- );

-- -----------------------------------------------------------------------

-- public.modificacoes

-- CREATE TABLE public.modificacoes (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   titulo text NOT NULL,
--   descricao text,
--   autor_id uuid,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT modificacoes_pkey PRIMARY KEY (id),
--   CONSTRAINT modificacoes_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES public.profiles(id)
-- );

-- -----------------------------------------------------------------------

-- public.equipes

-- CREATE TABLE public.equipes (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   nome text NOT NULL UNIQUE,
--   gerente_id uuid,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   diretoria_id uuid,
--   sede text CHECK (sede = ANY (ARRAY['Paulista'::text, 'Recife'::text, 'Caruaru'::text])),
--   CONSTRAINT equipes_pkey PRIMARY KEY (id),
--   CONSTRAINT equipes_gerente_id_fkey FOREIGN KEY (gerente_id) REFERENCES public.profiles(id),
--   CONSTRAINT equipes_diretoria_id_fkey FOREIGN KEY (diretoria_id) REFERENCES public.diretorias(id)
-- );

-- -----------------------------------------------------------------------

-- public.diretorias

-- CREATE TABLE public.diretorias (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   nome text NOT NULL UNIQUE,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT diretorias_pkey PRIMARY KEY (id)
-- );

-- -----------------------------------------------------------------------

-- public.vendas

-- CREATE TABLE public.vendas (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   corretor_id uuid NOT NULL,
--   cliente_id uuid,
--   empreendimento_id uuid,
--   valor numeric NOT NULL,
--   status public.venda_status NOT NULL DEFAULT 'pendente'::venda_status,
--   confirmado_por uuid,
--   confirmado_em timestamp with time zone,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT vendas_pkey PRIMARY KEY (id),
--   CONSTRAINT vendas_corretor_id_fkey FOREIGN KEY (corretor_id) REFERENCES public.profiles(id),
--   CONSTRAINT vendas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id),
--   CONSTRAINT vendas_empreendimento_id_fkey FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id),
--   CONSTRAINT vendas_confirmado_por_fkey FOREIGN KEY (confirmado_por) REFERENCES public.profiles(id)
-- );

-- -----------------------------------------------------------------------

-- public.lead_atividades

-- CREATE TABLE public.lead_atividades (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   lead_id uuid NOT NULL,
--   autor_id uuid,
--   tipo text NOT NULL CHECK (tipo = ANY (ARRAY['ligacao'::text, 'whatsapp'::text, 'email'::text, 'visita'::text, 'observacao'::text])),
--   descricao text NOT NULL CHECK (char_length(btrim(descricao)) >= 1 AND char_length(btrim(descricao)) <= 2000),
--   proximo_contato_em timestamp with time zone,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT lead_atividades_pkey PRIMARY KEY (id),
--   CONSTRAINT lead_atividades_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id),
--   CONSTRAINT lead_atividades_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES public.profiles(id)
-- );

-- -----------------------------------------------------------------------

-- public.empreendimento_documentos

-- CREATE TABLE public.empreendimento_documentos (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   empreendimento_id uuid NOT NULL,
--   tipo text NOT NULL CHECK (tipo = ANY (ARRAY['book'::text, 'tabela'::text])),
--   fase text,
--   titulo text NOT NULL,
--   drive_file_id text NOT NULL CHECK (drive_file_id ~ '^[A-Za-z0-9_-]{10,}$'::text),
--   status text NOT NULL DEFAULT 'pendente'::text CHECK (status = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'arquivado'::text])),
--   fonte_nome text,
--   fonte_atualizada_em timestamp with time zone,
--   validade_ate date,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT empreendimento_documentos_pkey PRIMARY KEY (id),
--   CONSTRAINT empreendimento_documentos_empreendimento_id_fkey FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id)
-- );

-- -----------------------------------------------------------------------

-- public.empreendimento_tipologias

-- CREATE TABLE public.empreendimento_tipologias (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   empreendimento_id uuid NOT NULL,
--   nome text NOT NULL CHECK (length(TRIM(BOTH FROM nome)) >= 2),
--   quartos smallint CHECK (quartos IS NULL OR quartos >= 0),
--   suites smallint CHECK (suites IS NULL OR suites >= 0),
--   vagas smallint CHECK (vagas IS NULL OR vagas >= 0),
--   area_m2 numeric CHECK (area_m2 IS NULL OR area_m2 > 0::numeric),
--   ordem smallint NOT NULL DEFAULT 0,
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT empreendimento_tipologias_pkey PRIMARY KEY (id),
--   CONSTRAINT empreendimento_tipologias_empreendimento_id_fkey FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id)
-- );

-- -----------------------------------------------------------------------

-- public.empreendimento_documentos_pendencias

-- CREATE TABLE public.empreendimento_documentos_pendencias (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   drive_file_id text NOT NULL CHECK (drive_file_id ~ '^[A-Za-z0-9_-]{10,}$'::text),
--   drive_pasta_id text,
--   arquivo_nome text NOT NULL,
--   drive_modificado_em timestamp with time zone NOT NULL,
--   motivo text NOT NULL CHECK (motivo = ANY (ARRAY['PDF_NOVO_SEM_VINCULO'::text, 'ARQUIVO_MODIFICADO'::text, 'SEM_DATA_REFERENCIA'::text, 'VINCULOS_REPETIDOS'::text, 'LEGADO_REPETIDO'::text])),
--   empreendimento_id uuid,
--   documento_id uuid,
--   tipo text CHECK (tipo = ANY (ARRAY['book'::text, 'tabela'::text])),
--   fase text,
--   status text NOT NULL DEFAULT 'pendente'::text CHECK (status = ANY (ARRAY['pendente'::text, 'resolvido'::text, 'ignorado'::text])),
--   criado_em timestamp with time zone NOT NULL DEFAULT now(),
--   atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
--   CONSTRAINT empreendimento_documentos_pendencias_pkey PRIMARY KEY (id),
--   CONSTRAINT empreendimento_documentos_pendencias_empreendimento_id_fkey FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id),
--   CONSTRAINT empreendimento_documentos_pendencias_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.empreendimento_documentos(id)
-- );


-- ### 03. ÍNDICES DO CATÁLOGO (48, incluindo os implícitos de PK/UNIQUE)

-- CREATE UNIQUE INDEX agendamentos_pkey ON public.agendamentos USING btree (id);

-- CREATE INDEX idx_agendamentos_corretor ON public.agendamentos USING btree (corretor_id);

-- CREATE INDEX idx_agendamentos_data ON public.agendamentos USING btree (data_hora);

-- CREATE UNIQUE INDEX avisos_seguranca_pkey ON public.avisos_seguranca USING btree (id);

-- CREATE UNIQUE INDEX clientes_pkey ON public.clientes USING btree (id);

-- CREATE INDEX idx_clientes_corretor ON public.clientes USING btree (corretor_id);

-- CREATE UNIQUE INDEX construtoras_pkey ON public.construtoras USING btree (id);

-- CREATE UNIQUE INDEX diretorias_nome_key ON public.diretorias USING btree (nome);

-- CREATE UNIQUE INDEX diretorias_pkey ON public.diretorias USING btree (id);

-- CREATE UNIQUE INDEX empreendimento_documentos_pkey ON public.empreendimento_documentos USING btree (id);

-- CREATE INDEX idx_empreendimento_documentos_aprovados ON public.empreendimento_documentos USING btree (empreendimento_id, status, tipo);

-- CREATE UNIQUE INDEX uq_empreendimento_documento_origem ON public.empreendimento_documentos USING btree (empreendimento_id, drive_file_id);

-- CREATE UNIQUE INDEX empreendimento_documentos_pendencias_pkey ON public.empreendimento_documentos_pendencias USING btree (id);

-- CREATE INDEX idx_documentos_pendencias_status ON public.empreendimento_documentos_pendencias USING btree (status, criado_em DESC);

-- CREATE UNIQUE INDEX uq_drive_pendencia_versao ON public.empreendimento_documentos_pendencias USING btree (drive_file_id, drive_modificado_em);

-- CREATE UNIQUE INDEX empreendimento_imagens_pkey ON public.empreendimento_imagens USING btree (id);

-- CREATE INDEX idx_imagens_empreendimento ON public.empreendimento_imagens USING btree (empreendimento_id);

-- CREATE UNIQUE INDEX empreendimento_tipologias_pkey ON public.empreendimento_tipologias USING btree (id);

-- CREATE INDEX idx_tipologias_empreendimento ON public.empreendimento_tipologias USING btree (empreendimento_id, ordem);

-- CREATE UNIQUE INDEX idx_tipologias_empreendimento_nome ON public.empreendimento_tipologias USING btree (empreendimento_id, lower(TRIM(BOTH FROM nome)));

-- CREATE UNIQUE INDEX empreendimentos_pkey ON public.empreendimentos USING btree (id);

-- CREATE UNIQUE INDEX empreendimentos_slug_key ON public.empreendimentos USING btree (slug);

-- CREATE INDEX idx_empreendimentos_lazer ON public.empreendimentos USING gin (lazer);

-- CREATE INDEX idx_empreendimentos_localizacao ON public.empreendimentos USING btree (uf, cidade, bairro);

-- CREATE INDEX idx_empreendimentos_status ON public.empreendimentos USING btree (status);

-- CREATE UNIQUE INDEX equipes_nome_key ON public.equipes USING btree (nome);

-- CREATE UNIQUE INDEX equipes_pkey ON public.equipes USING btree (id);

-- CREATE INDEX idx_equipes_diretoria ON public.equipes USING btree (diretoria_id);

-- CREATE INDEX idx_equipes_gerente ON public.equipes USING btree (gerente_id);

-- CREATE INDEX idx_equipes_sede ON public.equipes USING btree (sede);

-- CREATE UNIQUE INDEX eventos_acesso_pkey ON public.eventos_acesso USING btree (id);

-- CREATE INDEX idx_eventos_criado_em ON public.eventos_acesso USING btree (criado_em);

-- CREATE INDEX idx_eventos_empreendimento ON public.eventos_acesso USING btree (empreendimento_id);

-- CREATE INDEX lead_atividades_lead_criado_idx ON public.lead_atividades USING btree (lead_id, criado_em DESC);

-- CREATE UNIQUE INDEX lead_atividades_pkey ON public.lead_atividades USING btree (id);

-- CREATE INDEX lead_atividades_proximo_idx ON public.lead_atividades USING btree (proximo_contato_em) WHERE (proximo_contato_em IS NOT NULL);

-- CREATE INDEX idx_leads_corretor ON public.leads USING btree (corretor_id);

-- CREATE INDEX idx_leads_empreendimento ON public.leads USING btree (empreendimento_id);

-- CREATE UNIQUE INDEX leads_pkey ON public.leads USING btree (id);

-- CREATE UNIQUE INDEX melhorias_pkey ON public.melhorias USING btree (id);

-- CREATE UNIQUE INDEX modificacoes_pkey ON public.modificacoes USING btree (id);

-- CREATE INDEX idx_profiles_construtora ON public.profiles USING btree (construtora_id);

-- CREATE INDEX idx_profiles_equipe ON public.profiles USING btree (equipe_id);

-- CREATE INDEX idx_profiles_uf ON public.profiles USING btree (uf);

-- CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

-- CREATE INDEX idx_vendas_corretor ON public.vendas USING btree (corretor_id);

-- CREATE INDEX idx_vendas_status ON public.vendas USING btree (status);

-- CREATE UNIQUE INDEX vendas_pkey ON public.vendas USING btree (id);


-- ### 04. RLS HABILITADO NAS 18 TABELAS

-- ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.avisos_seguranca ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.construtoras ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.diretorias ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.empreendimento_documentos ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.empreendimento_documentos_pendencias ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.empreendimento_imagens ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.empreendimento_tipologias ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.empreendimentos ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.equipes ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.eventos_acesso ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.lead_atividades ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.melhorias ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.modificacoes ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;


-- ### 05. POLÍTICAS RLS DO CATÁLOGO (19)

-- public.agendamentos.agendamentos_do_corretor

-- CREATE POLICY "agendamentos_do_corretor" ON public.agendamentos
--   AS PERMISSIVE
--   FOR ALL TO public
--   USING ((corretor_id = auth.uid()) OR is_admin());

-- public.clientes.clientes_do_corretor

-- CREATE POLICY "clientes_do_corretor" ON public.clientes
--   AS PERMISSIVE
--   FOR ALL TO public
--   USING ((corretor_id = auth.uid()) OR is_admin());

-- public.construtoras.construtoras_delete_admin

-- CREATE POLICY "construtoras_delete_admin" ON public.construtoras
--   AS PERMISSIVE
--   FOR DELETE TO public
--   USING is_admin();

-- public.construtoras.construtoras_insert_admin

-- CREATE POLICY "construtoras_insert_admin" ON public.construtoras
--   AS PERMISSIVE
--   FOR INSERT TO public
--   WITH CHECK is_admin();

-- public.construtoras.construtoras_select_publico

-- CREATE POLICY "construtoras_select_publico" ON public.construtoras
--   AS PERMISSIVE
--   FOR SELECT TO public
--   USING true;

-- public.construtoras.construtoras_update_admin

-- CREATE POLICY "construtoras_update_admin" ON public.construtoras
--   AS PERMISSIVE
--   FOR UPDATE TO public
--   USING is_admin();

-- public.empreendimento_imagens.imagens_admin_gerencia

-- CREATE POLICY "imagens_admin_gerencia" ON public.empreendimento_imagens
--   AS PERMISSIVE
--   FOR ALL TO public
--   USING is_admin();

-- public.empreendimento_imagens.imagens_select_publico

-- CREATE POLICY "imagens_select_publico" ON public.empreendimento_imagens
--   AS PERMISSIVE
--   FOR SELECT TO public
--   USING true;

-- public.empreendimentos.empreendimentos_delete_admin

-- CREATE POLICY "empreendimentos_delete_admin" ON public.empreendimentos
--   AS PERMISSIVE
--   FOR DELETE TO public
--   USING is_admin();

-- public.empreendimentos.empreendimentos_insert_admin

-- CREATE POLICY "empreendimentos_insert_admin" ON public.empreendimentos
--   AS PERMISSIVE
--   FOR INSERT TO public
--   WITH CHECK is_admin();

-- public.empreendimentos.empreendimentos_select

-- CREATE POLICY "empreendimentos_select" ON public.empreendimentos
--   AS PERMISSIVE
--   FOR SELECT TO public
--   USING ((publicado = true) OR (auth.uid() IS NOT NULL));

-- public.empreendimentos.empreendimentos_update_admin

-- CREATE POLICY "empreendimentos_update_admin" ON public.empreendimentos
--   AS PERMISSIVE
--   FOR UPDATE TO public
--   USING is_admin();

-- public.eventos_acesso.eventos_insert_publico

-- CREATE POLICY "eventos_insert_publico" ON public.eventos_acesso
--   AS PERMISSIVE
--   FOR INSERT TO public
--   WITH CHECK true;

-- public.eventos_acesso.eventos_select_equipe

-- CREATE POLICY "eventos_select_equipe" ON public.eventos_acesso
--   AS PERMISSIVE
--   FOR SELECT TO public
--   USING (auth.uid() IS NOT NULL);

-- public.leads.leads_insert_publico

-- CREATE POLICY "leads_insert_publico" ON public.leads
--   AS PERMISSIVE
--   FOR INSERT TO public
--   WITH CHECK true;

-- public.leads.leads_select_equipe

-- CREATE POLICY "leads_select_equipe" ON public.leads
--   AS PERMISSIVE
--   FOR SELECT TO public
--   USING ((auth.uid() IS NOT NULL) AND ((corretor_id = auth.uid()) OR (corretor_id IS NULL) OR is_admin()));

-- public.leads.leads_update_equipe

-- CREATE POLICY "leads_update_equipe" ON public.leads
--   AS PERMISSIVE
--   FOR UPDATE TO public
--   USING ((auth.uid() IS NOT NULL) AND ((corretor_id = auth.uid()) OR is_admin()));

-- public.profiles.profiles_admin_gerencia

-- CREATE POLICY "profiles_admin_gerencia" ON public.profiles
--   AS PERMISSIVE
--   FOR ALL TO public
--   USING is_admin();

-- public.profiles.profiles_select_proprio_ou_admin

-- CREATE POLICY "profiles_select_proprio_ou_admin" ON public.profiles
--   AS PERMISSIVE
--   FOR SELECT TO public
--   USING ((id = auth.uid()) OR is_admin());


-- ### 06. GATILHOS DO CATÁLOGO (3)

-- public.agendamentos.trg_agendamentos_atualizado_em

-- CREATE TRIGGER trg_agendamentos_atualizado_em BEFORE UPDATE ON agendamentos FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- public.empreendimentos.trg_empreendimentos_atualizado_em

-- CREATE TRIGGER trg_empreendimentos_atualizado_em BEFORE UPDATE ON empreendimentos FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- public.leads.trg_leads_atualizado_em

-- CREATE TRIGGER trg_leads_atualizado_em BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();


-- ### 07. ROTINAS NÃO EXPORTADAS (NÃO RECRIAR SEM VERIFICAR)
-- A auditoria não incluiu pg_get_functiondef(public.is_admin()) nem
-- pg_get_functiondef(public.set_atualizado_em()).
-- Existe definição histórica de ambas no schema.sql antigo, mas não há
-- confirmação de que o banco atual use a mesma assinatura / SECURITY DEFINER.
-- Não inventar essas funções em documentação de esquema real.
