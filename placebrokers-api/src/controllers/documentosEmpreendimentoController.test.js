'use strict';

jest.mock('../config/supabase', () => ({ supabaseAdmin: {} }));
jest.mock('../repositories/empreendimentoRepository', () => ({ EmpreendimentoRepository: class {} }));
jest.mock('../services/empreendimentoService', () => ({ EmpreendimentoService: class {} }));
jest.mock('../services/uploadService', () => ({ UploadService: class {} }));

const { legados } = require('./documentosEmpreendimentoController');
const { requireRole } = require('../middlewares/requireRole');

function response() {
  return { code: 200, body: null,
    status(n) {this.code = n;return this;},
    json(data) {this.body = data;return this;},
  };
}

describe('Documentos comerciais por empreendimento', () => {
  test('preserva os dois links legados na ausência de novos documentos', () => {
    expect(legados({book_url:'abc',tabela_url:'def'},new Set()).map(d=>d.tipo)).toEqual(['book','tabela']);
  });
  test('não duplica tabela legada quando há tabela por fase aprovada', () => {
    expect(legados({book_url:'abc',tabela_url:'def'},new Set(['tabela'])).map(d=>d.tipo)).toEqual(['book']);
  });
  test('ignora links ausentes', () => {
    expect(legados({book_url:null,tabela_url:null},new Set())).toEqual([]);
  });
  test('bloqueia documento comercial a usuário não permitido', () => {
    const req={user:{cargo:'investidor'}};
    const res=response(); const next=jest.fn();
    requireRole('admin','corretor','gerente')(req,res,next);
    expect(res.code).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
  test('permite corretor e administrador', () => {
    for(const cargo of ['corretor','admin']){
      const next=jest.fn();
      requireRole('admin','corretor','gerente')({user:{cargo}},response(),next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });
});
