'use strict';

const { segurancaService } = require ('../services/segurancaInstancia');

function monitorarIp({ tipo, limite, janelaMin, montarAviso}){
    return function monitoramento (req, res, next ) {
        const ip = req.ip ?? 'desconhecido';
        segurancaService
        .registrarEAvaliar ({
        tipo,
        chave: ip,
        limite,
        janelaMin,
        montarAviso: (ctx) => montarAviso({...ctx, ip}),
        })
        .catch((err) => console.error ('Erro no monitoramento de segurança ', err));
       next();
    };
}

const monitorarCadastros = monitorarIp({
    tipo: 'cadastro_ip',
    limite: 10,
    janelaMin: 60,
    montarAviso: ({ total, ip}) => ({
        titulo: 'Cadastros em massa',
        descricao: `${total} tentativas de cadastro vindas do IP ${ip} em 1 hora.`,
        severidade: 'atencao',
    }),
});

// Mesmo limite do limitador `leadPublico` em seguranca.js (8 em 10 minutos)
const monitorarEnviosPublicos = monitorarIp({
  tipo: 'lead_ip',
  limite: 8,
  janelaMin: 10,
  montarAviso: ({ total, ip }) => ({
    titulo: 'Envios em massa no formulário',
    descricao: `${total} contatos vindos do IP ${ip} em 10 minutos. Pode ser lead falso.`,
    severidade: 'info',
  }),
});
module.exports = { monitorarCadastros, monitorarEnviosPublicos};