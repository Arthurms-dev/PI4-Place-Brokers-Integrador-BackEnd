'use strict';

const { EmpreendimentoService } = require('./empreendimentoService');

describe('catálogo: book e tabela disponíveis', () => {
  const service = new EmpreendimentoService({ empreendimentoRepository: {}, uploadService: {} });

  test('conta documento aprovado e dentro da validade, além do link antigo', () => {
    const r = service.sanitizar({
      id: 'e1', book_url: null, tabela_url: null,
      documentos: [
        { tipo: 'tabela', status: 'aprovado', validade_ate: '2999-12-31' },
        { tipo: 'book', status: 'pendente', validade_ate: null },
      ],
    });
    expect(r.tem_tabela).toBe(true);
    expect(r.tem_book).toBe(false);
    expect(r.documentos).toBeUndefined();
  });

  test('tabela vencida não conta; link antigo continua valendo', () => {
    const r = service.sanitizar({
      id: 'e2', book_url: 'https://x/book.pdf', tabela_url: null,
      documentos: [{ tipo: 'tabela', status: 'aprovado', validade_ate: '2000-01-01' }],
    });
    expect(r.tem_book).toBe(true);
    expect(r.tem_tabela).toBe(false);
  });

  test('sem documentos na consulta (ex.: depois de editar) não quebra', () => {
    expect(service.sanitizar({ id: 'e3' })).toMatchObject({ tem_book: false, tem_tabela: false });
  });
});
