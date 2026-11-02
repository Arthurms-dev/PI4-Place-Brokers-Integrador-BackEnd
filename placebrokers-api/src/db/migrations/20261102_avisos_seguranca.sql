-- Place Brokers PI4: avisos de segurança gerados pelo próprio banco.
-- Toda mudança de cargo ou de acesso em profiles vira aviso no painel do admin,
-- não importa se foi feita pela tela Equipe, pela API ou direto no Supabase.
--   * novo administrador criado ............ crítico
--   * cargo alterado (para admin: crítico) .. atenção
--   * acesso desativado / reativado ......... info
--   * cadastro recusado que foi aprovado .... atenção
-- Os outros avisos (login bloqueado, acesso negado repetido, muitos documentos abertos,
-- robô no formulário, senha alterada) são criados pela API em src/services/avisosSeguranca.js.
-- Aditivo: não apaga nada.
BEGIN;

CREATE OR REPLACE FUNCTION public.aviso_mudanca_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_quem text := coalesce(nullif(trim(NEW.nome), ''), NEW.email, 'Usuário sem nome');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.cargo::text = 'admin' THEN
      INSERT INTO public.avisos_seguranca (titulo, descricao, severidade)
      VALUES ('Novo administrador criado',
              v_quem || ' (' || coalesce(NEW.email, 'sem e-mail') || ') foi criado com acesso de administrador. Se ninguém da equipe fez isso, desative o acesso agora.',
              'critico');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.cargo IS DISTINCT FROM OLD.cargo THEN
    INSERT INTO public.avisos_seguranca (titulo, descricao, severidade)
    VALUES (CASE WHEN NEW.cargo::text = 'admin' THEN 'Usuário virou administrador' ELSE 'Cargo alterado' END,
            v_quem || ' passou de ' || coalesce(OLD.cargo::text, 'sem cargo') || ' para ' || coalesce(NEW.cargo::text, 'sem cargo') || '.',
            CASE WHEN NEW.cargo::text = 'admin' THEN 'critico' ELSE 'atencao' END);
  END IF;

  IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    INSERT INTO public.avisos_seguranca (titulo, descricao, severidade)
    VALUES (CASE WHEN NEW.ativo THEN 'Acesso reativado' ELSE 'Acesso desativado' END,
            v_quem || CASE WHEN NEW.ativo THEN ' voltou a ter acesso ao sistema.' ELSE ' perdeu o acesso ao sistema.' END,
            'info');
  END IF;

  IF OLD.status::text = 'recusado' AND NEW.status::text = 'aprovado' THEN
    INSERT INTO public.avisos_seguranca (titulo, descricao, severidade)
    VALUES ('Cadastro recusado foi aprovado',
            'O cadastro de ' || v_quem || ' tinha sido recusado e agora foi aprovado. Confira se foi intencional.',
            'atencao');
  END IF;

  RETURN NEW;
END;
$func$;

REVOKE ALL ON FUNCTION public.aviso_mudanca_perfil() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER profiles_avisos_seguranca
  AFTER INSERT OR UPDATE OF cargo, ativo, status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.aviso_mudanca_perfil();

COMMIT;
