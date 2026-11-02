-- Place Brokers PI4: a API é a única porta de entrada do banco.
-- O site e o app falam só com a API (que usa a service_role no servidor). Ninguém usa a chave
-- pública (anon) do Supabase direto, mas as tabelas ainda aceitavam leitura e escrita por ela.
-- Problemas que isso fechava:
--   * qualquer pessoa com a chave anon lia book_url e tabela_url dos empreendimentos publicados
--     (material comercial que é só para corretores);
--   * dava para criar lead direto no banco, sem o antispam e o limite de envios da API;
--   * um corretor logado lia os leads sem corretor de todo mundo.
-- O RLS continua ligado; isto só tira as permissões das funções anon e authenticated.
-- Para desfazer (não recomendado): GRANT SELECT ... ON <tabela> TO anon, authenticated.
BEGIN;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

COMMIT;
