'use strict';

// Catálogo das rotas da API, usado para gerar a documentação (/docs) e a coleção do Postman.
// Ao criar uma rota nova, acrescente aqui: o teste src/docs/rotas.test.js falha se faltar alguma.
//
// acesso: 'publico' | 'logado' | lista de cargos (['admin'], ['admin', 'corretor'], ...)
// corpo: exemplo do JSON enviado (vira o "example" da documentação e o body do Postman)
// consulta: parâmetros de query aceitos { nome: 'descrição' }

const ID = '00000000-0000-4000-8000-000000000000';

const GRUPOS = {
  Sistema: 'Saúde da API e documentação',
  Autenticação: 'Login, cadastro e perfil do usuário logado',
  Empreendimentos: 'Catálogo de imóveis, fotos, tipologias e documentos comerciais',
  Construtoras: 'Construtoras parceiras',
  Leads: 'Contatos que chegam pelo site e o atendimento do corretor',
  Roleta: 'Lista de chegada e distribuição automática de leads',
  Clientes: 'Carteira de clientes dos corretores',
  Agendamentos: 'Visitas e reuniões',
  Vendas: 'Vendas lançadas pelo corretor e confirmadas pelo gerente (VGV)',
  Equipe: 'Corretores, gerentes, equipes e diretorias (admin)',
  Gerente: 'Painel do gerente: só a própria equipe',
  Corretores: 'Lista de corretores',
  Métricas: 'Acessos ao site e dashboard',
  Painel: 'Feeds do painel do admin',
  Notificações: 'Aviso de lead novo no celular (Web Push)',
  Viabilizador: 'Área do viabilizador (pós-MVP)',
};

const ROTAS = [
  // Sistema
  { metodo: 'get', caminho: '/health', grupo: 'Sistema', acesso: 'publico', resumo: 'Verifica se a API está no ar' },
  { metodo: 'get', caminho: '/docs', grupo: 'Sistema', acesso: 'publico', resumo: 'Esta documentação (Swagger UI)' },
  { metodo: 'get', caminho: '/docs/openapi.json', grupo: 'Sistema', acesso: 'publico', resumo: 'Especificação OpenAPI 3 em JSON' },

  // Autenticação
  { metodo: 'post', caminho: '/auth/login', grupo: 'Autenticação', acesso: 'publico', resumo: 'Entra com e-mail e senha e devolve o token',
    corpo: { email: 'corretor@exemplo.com', password: 'senha-de-teste' },
    obs: 'Limite: 5 erros por e-mail e 30 por IP a cada 15 minutos.' },
  { metodo: 'post', caminho: '/auth/register', grupo: 'Autenticação', acesso: 'publico', resumo: 'Cadastro de corretor (fica pendente até o admin aprovar)',
    corpo: { nome: 'Fulano de Tal', email: 'fulano@exemplo.com', telefone: '81999998888', password: 'senha-de-teste', confirmPassword: 'senha-de-teste', role: 'corretor', vinculo: 'place', creci: null, uf: 'PE' } },
  { metodo: 'get', caminho: '/auth/me', grupo: 'Autenticação', acesso: 'logado', resumo: 'Dados do usuário logado' },
  { metodo: 'patch', caminho: '/auth/me', grupo: 'Autenticação', acesso: 'logado', resumo: 'Atualiza nome e telefone', corpo: { nome: 'Fulano de Tal', telefone: '81999998888' } },
  { metodo: 'patch', caminho: '/auth/senha', grupo: 'Autenticação', acesso: 'logado', resumo: 'Troca a senha (pede a senha atual)',
    corpo: { senhaAtual: 'senha-de-teste', novaSenha: 'nova-senha-de-teste', confirmarSenha: 'nova-senha-de-teste' } },
  { metodo: 'post', caminho: '/auth/esqueci-senha', grupo: 'Autenticação', acesso: 'publico', resumo: 'Esqueci minha senha: manda por e-mail um link para criar senha nova',
    corpo: { email: 'corretor@exemplo.com' },
    obs: 'Responde sempre a mesma mensagem, exista ou não o e-mail. O envio é pelo Resend (RESEND_API_KEY). Limite: 3 pedidos por e-mail e 10 por IP a cada hora.' },
  { metodo: 'post', caminho: '/auth/redefinir-senha', grupo: 'Autenticação', acesso: 'publico', resumo: 'Cria a senha nova com o token do link do e-mail',
    corpo: { token: 'token-do-link-do-email', novaSenha: 'nova-senha-de-teste', confirmarSenha: 'nova-senha-de-teste' },
    obs: 'O token vale 1 hora e uma vez só (TOKEN_INVALIDO se vencido). Encerra as outras sessões e registra um aviso de segurança para o admin.' },

  // Empreendimentos
  { metodo: 'get', caminho: '/empreendimentos', grupo: 'Empreendimentos', acesso: 'publico', resumo: 'Lista o catálogo (público vê só os publicados; admin vê rascunhos)' },
  { metodo: 'get', caminho: '/empreendimentos/:id', grupo: 'Empreendimentos', acesso: 'publico', resumo: 'Detalhe do empreendimento com fotos e tipologias' },
  { metodo: 'post', caminho: '/empreendimentos', grupo: 'Empreendimentos', acesso: ['admin'], resumo: 'Cria empreendimento (multipart: dados + capa, galeria, book, tabela)', multipart: true },
  { metodo: 'patch', caminho: '/empreendimentos/:id', grupo: 'Empreendimentos', acesso: ['admin'], resumo: 'Atualiza dados do empreendimento',
    corpo: { nome: 'Residencial Exemplo', status: 'lancamento', segmento: 'mcmv', parcela_min: 499, publicado: true } },
  { metodo: 'post', caminho: '/empreendimentos/:id/imagens/capa', grupo: 'Empreendimentos', acesso: ['admin'], resumo: 'Troca a foto de capa (multipart, campo "imagem")', multipart: true },
  { metodo: 'post', caminho: '/empreendimentos/:id/imagens/galeria', grupo: 'Empreendimentos', acesso: ['admin'], resumo: 'Adiciona até 5 fotos na galeria (multipart, campo "imagens")', multipart: true },
  { metodo: 'delete', caminho: '/empreendimentos/:id/imagens/:imagemId', grupo: 'Empreendimentos', acesso: ['admin'], resumo: 'Remove uma foto da galeria' },
  { metodo: 'post', caminho: '/empreendimentos/:id/tipologias', grupo: 'Empreendimentos', acesso: ['admin'], resumo: 'Cria tipologia (planta)',
    corpo: { nome: '2 quartos com suíte', quartos: 2, suites: 1, vagas: 1, area_m2: 52.4 } },
  { metodo: 'patch', caminho: '/empreendimentos/:id/tipologias/:tipologiaId', grupo: 'Empreendimentos', acesso: ['admin'], resumo: 'Atualiza tipologia', corpo: { area_m2: 54 } },
  { metodo: 'get', caminho: '/empreendimentos/:id/documentos', grupo: 'Empreendimentos', acesso: ['admin', 'corretor', 'gerente'], resumo: 'Lista book e tabelas aprovados e dentro da validade' },
  { metodo: 'get', caminho: '/empreendimentos/:id/documentos/:tipo', grupo: 'Empreendimentos', acesso: ['admin', 'corretor', 'gerente'], resumo: 'Link do book ou da tabela (tipo = book | tabela)' },
  { metodo: 'get', caminho: '/empreendimentos/:id/documentos/arquivo/:docId', grupo: 'Empreendimentos', acesso: ['admin', 'corretor', 'gerente'], resumo: 'Link de um documento específico' },
  { metodo: 'get', caminho: '/empreendimentos/:id/documentos/admin', grupo: 'Empreendimentos', acesso: ['admin'], resumo: 'Todos os documentos do empreendimento (inclusive pendentes)' },
  { metodo: 'post', caminho: '/empreendimentos/:id/documentos/admin', grupo: 'Empreendimentos', acesso: ['admin'], resumo: 'Cadastra documento do Drive',
    corpo: { tipo: 'tabela', fase: 'Lançamento', titulo: 'Tabela outubro', drive_file_id: '1AbCdEfGhIjKlMnOp', status: 'aprovado', validade_ate: '2026-12-31' } },
  { metodo: 'patch', caminho: '/empreendimentos/:id/documentos/admin/:docId', grupo: 'Empreendimentos', acesso: ['admin'], resumo: 'Atualiza documento', corpo: { status: 'aprovado' } },
  { metodo: 'get', caminho: '/empreendimentos/documentos/pendencias', grupo: 'Empreendimentos', acesso: ['admin'], resumo: 'Documentos do Drive que ainda precisam de revisão' },

  // Construtoras
  { metodo: 'get', caminho: '/construtoras', grupo: 'Construtoras', acesso: 'publico', resumo: 'Lista as construtoras' },
  { metodo: 'post', caminho: '/construtoras', grupo: 'Construtoras', acesso: ['admin'], resumo: 'Cadastra construtora', corpo: { nome: 'Construtora Exemplo' } },

  // Leads
  { metodo: 'post', caminho: '/leads', grupo: 'Leads', acesso: 'publico', resumo: 'Formulário do site: cria o lead (mesmo e-mail ou telefone = mesmo lead) e chama a roleta',
    corpo: { nome: 'Cliente Exemplo', email: 'cliente@exemplo.com', telefone: '81999998888', empreendimentoId: ID, mensagem: 'Interesse em: Residencial Exemplo' },
    obs: 'Limite de 8 envios por IP a cada 10 minutos.' },
  { metodo: 'get', caminho: '/leads', grupo: 'Leads', acesso: ['admin'], resumo: 'Todos os leads' },
  { metodo: 'get', caminho: '/leads/meus', grupo: 'Leads', acesso: ['corretor'], resumo: 'Leads do corretor logado' },
  { metodo: 'get', caminho: '/leads/retornos', grupo: 'Leads', acesso: ['corretor'], resumo: 'Lembretes de retorno (atrasados e dos próximos 7 dias)' },
  { metodo: 'patch', caminho: '/leads/:id/status', grupo: 'Leads', acesso: ['admin', 'corretor'], resumo: 'Muda o status (novo, em_atendimento, perdido; convertido só pelo admin)', corpo: { status: 'em_atendimento' } },
  { metodo: 'patch', caminho: '/leads/:id/corretor', grupo: 'Leads', acesso: ['admin'], resumo: 'Atribui ou repassa o lead (reinicia o tempo de atendimento)', corpo: { corretorId: ID } },
  { metodo: 'post', caminho: '/leads/:id/converter', grupo: 'Leads', acesso: ['admin'], resumo: 'Converte o lead em cliente (transação no banco)' },
  { metodo: 'post', caminho: '/leads/:id/cliente', grupo: 'Leads', acesso: ['admin', 'corretor'], resumo: 'Leva o lead para a carteira (cria ou reaproveita o cliente) para agendar visita' },
  { metodo: 'get', caminho: '/leads/:id/atividades', grupo: 'Leads', acesso: ['admin', 'corretor'], resumo: 'Histórico do lead (ligações, WhatsApp, observações, lembretes)' },
  { metodo: 'post', caminho: '/leads/:id/atividades', grupo: 'Leads', acesso: ['admin', 'corretor'], resumo: 'Registra contato ou lembrete',
    corpo: { tipo: 'ligacao', descricao: 'Ligou para o cliente pelo app.', proximoContatoEm: null } },

  // Roleta
  { metodo: 'get', caminho: '/roleta/hoje', grupo: 'Roleta', acesso: ['admin'], resumo: 'Painel da recepção: lista de chegada, quem falta marcar e leads aguardando' },
  { metodo: 'post', caminho: '/roleta/chegada', grupo: 'Roleta', acesso: ['admin'], resumo: 'Marca a chegada do corretor (apto se antes das 09h)', corpo: { corretorId: ID } },
  { metodo: 'patch', caminho: '/roleta/chegada/:corretorId', grupo: 'Roleta', acesso: ['admin'], resumo: 'Põe ou tira o corretor da roleta do dia', corpo: { apto: true } },
  { metodo: 'delete', caminho: '/roleta/chegada/:corretorId', grupo: 'Roleta', acesso: ['admin'], resumo: 'Tira o corretor da lista de hoje' },
  { metodo: 'post', caminho: '/roleta/iniciar', grupo: 'Roleta', acesso: ['admin'], resumo: 'Fecha a lista e começa a distribuir (às 09h acontece sozinho)' },
  { metodo: 'post', caminho: '/roleta/distribuir', grupo: 'Roleta', acesso: ['admin'], resumo: 'Distribui agora os leads que estão sem corretor' },
  { metodo: 'get', caminho: '/roleta/minha', grupo: 'Roleta', acesso: ['corretor'], resumo: 'Posição do corretor na roleta de hoje' },
  { metodo: 'get', caminho: '/roleta/focos', grupo: 'Roleta', acesso: ['admin', 'gerente'], resumo: 'Focos dos corretores (gerente: só a própria equipe)' },
  { metodo: 'put', caminho: '/roleta/focos/:corretorId', grupo: 'Roleta', acesso: ['admin', 'gerente'], resumo: 'Define em quais empreendimentos o corretor recebe leads', corpo: { empreendimentoIds: [ID] } },

  // Clientes
  { metodo: 'get', caminho: '/clientes', grupo: 'Clientes', acesso: ['admin', 'corretor'], resumo: 'Clientes (corretor: só a própria carteira)' },
  { metodo: 'get', caminho: '/clientes/:id', grupo: 'Clientes', acesso: ['admin', 'corretor'], resumo: 'Detalhe do cliente' },
  { metodo: 'post', caminho: '/clientes', grupo: 'Clientes', acesso: ['admin', 'corretor'], resumo: 'Cadastra cliente',
    corpo: { nome: 'Cliente Exemplo', telefone: '81999998888', email: 'cliente@exemplo.com', observacoes: 'Prefere contato à tarde' } },
  { metodo: 'patch', caminho: '/clientes/:id', grupo: 'Clientes', acesso: ['admin', 'corretor'], resumo: 'Atualiza cliente', corpo: { observacoes: 'Pediu simulação com FGTS' } },

  // Agendamentos
  { metodo: 'get', caminho: '/agendamentos', grupo: 'Agendamentos', acesso: ['admin', 'corretor'], resumo: 'Agendamentos (corretor: só os seus)' },
  { metodo: 'post', caminho: '/agendamentos', grupo: 'Agendamentos', acesso: ['admin', 'corretor'], resumo: 'Agenda visita ou reunião para um cliente da carteira',
    corpo: { tipo: 'visita_imovel', dataHora: '2026-11-05T14:00:00-03:00', duracaoMinutos: 60, clienteId: ID, empreendimentoId: ID, local: null, observacoes: null } },
  { metodo: 'patch', caminho: '/agendamentos/:id/data', grupo: 'Agendamentos', acesso: ['admin', 'corretor'], resumo: 'Remarca', corpo: { dataHora: '2026-11-06T10:00:00-03:00' } },
  { metodo: 'patch', caminho: '/agendamentos/:id/status', grupo: 'Agendamentos', acesso: ['admin', 'corretor'], resumo: 'Muda o status (agendado → confirmado → realizado | nao_compareceu | cancelado)',
    corpo: { status: 'realizado', interesseAposVisita: 'alto' } },

  // Vendas
  { metodo: 'post', caminho: '/vendas', grupo: 'Vendas', acesso: ['corretor'], resumo: 'Lança venda (fica aguardando o gerente)', corpo: { valor: 189000, clienteId: ID, empreendimentoId: ID } },
  { metodo: 'get', caminho: '/vendas', grupo: 'Vendas', acesso: ['admin', 'gerente', 'corretor'], resumo: 'Vendas visíveis para o cargo' },
  { metodo: 'patch', caminho: '/vendas/:id', grupo: 'Vendas', acesso: ['admin', 'gerente'], resumo: 'Confirma ou recusa a venda', corpo: { status: 'confirmada' } },
  { metodo: 'get', caminho: '/vendas/vgv', grupo: 'Vendas', acesso: ['admin', 'gerente', 'corretor'], resumo: 'Total de VGV confirmado', consulta: { equipeId: 'filtra por equipe', diretoriaId: 'filtra por diretoria' } },

  // Equipe
  { metodo: 'get', caminho: '/equipe', grupo: 'Equipe', acesso: ['admin'], resumo: 'Usuários (filtros por status e cargo)', consulta: { status: 'pendente | aprovado | recusado', cargo: 'corretor | gerente | viabilizador' } },
  { metodo: 'patch', caminho: '/equipe/:id', grupo: 'Equipe', acesso: ['admin'], resumo: 'Aprova/recusa, ativa/desativa ou muda a equipe do usuário', corpo: { status: 'aprovado', ativo: true, equipeId: ID } },
  { metodo: 'post', caminho: '/equipe/gerentes', grupo: 'Equipe', acesso: ['admin'], resumo: 'Cria gerente', corpo: { nome: 'Gerente Exemplo', email: 'gerente@exemplo.com', password: 'senha-de-teste' } },
  { metodo: 'get', caminho: '/equipe/times', grupo: 'Equipe', acesso: ['admin'], resumo: 'Equipes' },
  { metodo: 'post', caminho: '/equipe/times', grupo: 'Equipe', acesso: ['admin'], resumo: 'Cria equipe', corpo: { nome: 'Time Paulista', gerenteId: ID, diretoriaId: ID, sede: 'Paulista' } },
  { metodo: 'patch', caminho: '/equipe/times/:id', grupo: 'Equipe', acesso: ['admin'], resumo: 'Atualiza equipe', corpo: { nome: 'Time Paulista 2' } },
  { metodo: 'delete', caminho: '/equipe/times/:id', grupo: 'Equipe', acesso: ['admin'], resumo: 'Remove equipe' },
  { metodo: 'get', caminho: '/equipe/diretorias', grupo: 'Equipe', acesso: ['admin'], resumo: 'Diretorias' },
  { metodo: 'post', caminho: '/equipe/diretorias', grupo: 'Equipe', acesso: ['admin'], resumo: 'Cria diretoria', corpo: { nome: 'Diretoria Norte' } },

  // Gerente
  { metodo: 'get', caminho: '/gerente/equipe', grupo: 'Gerente', acesso: ['gerente'], resumo: 'Equipes e corretores do gerente' },
  { metodo: 'get', caminho: '/gerente/leads', grupo: 'Gerente', acesso: ['gerente'], resumo: 'Leads dos corretores da equipe' },
  { metodo: 'get', caminho: '/gerente/agendamentos', grupo: 'Gerente', acesso: ['gerente'], resumo: 'Agendamentos da equipe' },
  { metodo: 'get', caminho: '/gerente/desempenho', grupo: 'Gerente', acesso: ['gerente'], resumo: 'Leads sem atendimento (15 min) e tempo de resposta por corretor (30 dias)' },
  { metodo: 'patch', caminho: '/gerente/leads/:id/corretor', grupo: 'Gerente', acesso: ['gerente'], resumo: 'Repassa o lead para outro corretor da equipe', corpo: { corretorId: ID } },

  // Corretores
  { metodo: 'get', caminho: '/corretores', grupo: 'Corretores', acesso: ['admin'], resumo: 'Corretores aprovados (para atribuir leads)' },

  // Métricas
  { metodo: 'post', caminho: '/metricas/eventos', grupo: 'Métricas', acesso: 'publico', resumo: 'Registra visualização, busca ou contato no site',
    corpo: { tipo: 'visualizacao_empreendimento', empreendimentoId: ID, sessaoId: 'sessao-do-navegador' } },
  { metodo: 'get', caminho: '/metricas/meus-acessos', grupo: 'Métricas', acesso: 'logado', resumo: 'Últimos empreendimentos abertos pelo usuário' },
  { metodo: 'get', caminho: '/metricas/dashboard', grupo: 'Métricas', acesso: ['admin'], resumo: 'Números do dashboard do admin',
    consulta: { de: 'data inicial (AAAA-MM-DD)', ate: 'data final (AAAA-MM-DD)', equipeId: 'filtra por equipe', diretoriaId: 'filtra por diretoria' } },

  // Painel
  { metodo: 'get', caminho: '/painel/avisos-seguranca', grupo: 'Painel', acesso: ['admin'], resumo: 'Registros de segurança' },
  { metodo: 'get', caminho: '/painel/melhorias', grupo: 'Painel', acesso: ['admin'], resumo: 'Sugestões de melhoria' },
  { metodo: 'post', caminho: '/painel/melhorias', grupo: 'Painel', acesso: ['admin'], resumo: 'Cadastra sugestão de melhoria', corpo: { titulo: 'Filtro por segmento', descricao: 'No catálogo do corretor' } },
  { metodo: 'get', caminho: '/painel/modificacoes', grupo: 'Painel', acesso: ['admin'], resumo: 'Últimas modificações do site' },

  // Notificações
  { metodo: 'get', caminho: '/notificacoes/chave', grupo: 'Notificações', acesso: 'publico', resumo: 'Chave pública para o navegador se inscrever (null se desligado)' },
  { metodo: 'post', caminho: '/notificacoes/inscricao', grupo: 'Notificações', acesso: 'logado', resumo: 'Salva a inscrição de push do aparelho',
    corpo: { endpoint: 'https://fcm.googleapis.com/fcm/send/exemplo', keys: { p256dh: 'chave-do-navegador', auth: 'segredo-do-navegador' } } },
  { metodo: 'delete', caminho: '/notificacoes/inscricao', grupo: 'Notificações', acesso: 'logado', resumo: 'Cancela os avisos neste aparelho', consulta: { endpoint: 'endpoint da inscrição' } },

  // Viabilizador
  { metodo: 'get', caminho: '/viabilizador/produtos', grupo: 'Viabilizador', acesso: ['viabilizador'], resumo: 'Produtos do viabilizador' },
  { metodo: 'patch', caminho: '/viabilizador/produtos/:id', grupo: 'Viabilizador', acesso: ['viabilizador'], resumo: 'Atualiza produto', corpo: { disponivel: true } },
  { metodo: 'post', caminho: '/viabilizador/produtos/:id/documentos/:tipo', grupo: 'Viabilizador', acesso: ['viabilizador'], resumo: 'Envia book ou tabela (multipart, campo "arquivo")', multipart: true },
  { metodo: 'get', caminho: '/viabilizador/oportunidades', grupo: 'Viabilizador', acesso: ['viabilizador'], resumo: 'Procura pelos produtos no site', consulta: { dias: 'período em dias (padrão 30)' } },
];

module.exports = { ROTAS, GRUPOS, ID_EXEMPLO: ID };
