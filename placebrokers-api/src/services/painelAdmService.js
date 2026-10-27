
'use strict';

const { AppError } = require('../errors/AppError');

const SEVERIDADE_TAG = {
  critico: { tagLabel: 'Crítico', tagTone: 'danger' },
  atencao: { tagLabel: 'Atenção', tagTone: 'gold' },
  info: { tagLabel: 'Info', tagTone: 'info' },
};

const STATUS_LABEL = {
  sugestao: 'Sugestão',
  em_analise: 'Em análise',
  planejado: 'Planejado',
  concluido: 'Concluído',
};

function formatarMelhoria(item) {
  return {
    id: item.id,
    title: item.titulo,
    description: item.descricao,
    date: item.criado_em.slice(0, 10),
    tagLabel: STATUS_LABEL[item.status] ?? item.status,
    tagTone: item.status === 'concluido' ? 'ok' : 'neutral',
  };
}

class PainelAdmService {
  /** @param {{ painelAdmRepository }} deps */
  constructor({ painelAdmRepository }) {
    this.painelAdmRepository = painelAdmRepository;
  }

  async listarAvisosSeguranca() {
    const avisos =
      await this.painelAdmRepository.listarAvisosSeguranca();

    return avisos.map((aviso) => ({
      id: aviso.id,
      title: aviso.titulo,
      description: aviso.descricao,
      date: aviso.criado_em.slice(0, 10),
      ...(SEVERIDADE_TAG[aviso.severidade] ?? SEVERIDADE_TAG.info),
    }));
  }

  async listarMelhorias() {
    const melhorias =
      await this.painelAdmRepository.listarMelhorias();

    return melhorias.map(formatarMelhoria);
  }

  async listarModificacoes() {
    const modificacoes =
      await this.painelAdmRepository.listarModificacoes();

    return modificacoes.map((item) => ({
      id: item.id,
      title: item.titulo,
      description: item.descricao,
      date: item.criado_em.slice(0, 10),
      author: item.autor?.nome ?? null,
    }));
  }

  async criarMelhoria(
    { titulo, descricao, status = 'sugestao' } = {}
  ) {
    const errors = {};

    if (!titulo?.trim()) errors.titulo = 'Informe o título.';
    if (!descricao?.trim()) errors.descricao = 'Informe a descrição.';
    if (!Object.keys(STATUS_LABEL).includes(status)) {
      errors.status = 'Status inválido';
    }

    if (Object.keys(errors).length) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Verifique os campos destacados.',
        errors
      );
    }

    const melhoria =
      await this.painelAdmRepository.criarMelhoria({
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        status,
      });

    return formatarMelhoria(melhoria);
  }
}

module.exports = { PainelAdmService };
