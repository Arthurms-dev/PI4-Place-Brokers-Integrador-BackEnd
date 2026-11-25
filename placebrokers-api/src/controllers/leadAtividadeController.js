'use strict';
const { LeadAtividadeRepository } = require('../repositories/leadAtividadeRepository');
const { LeadRepository } = require('../repositories/leadRepository');
const { LeadAtividadeService } = require('../services/leadAtividadeService');
const { AppError } = require('../errors/AppError');
const service = new LeadAtividadeService({
  leadRepository: new LeadRepository(),
  atividadeRepository: new LeadAtividadeRepository(),
});
function erro(res, e) {
  if (e instanceof AppError) return res.status(e.statusCode).json({
    code: e.code, message: e.message, fieldErrors: e.fieldErrors,
  });
  console.error(e);
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno no servidor.' });
}
async function listar(req,res) {
  try { return res.json({ atividades: await service.listar(req.params.id, req.user) }); }
  catch (e) { return erro(res,e); }
}
async function registrar(req,res) {
  try { return res.status(201).json({ atividade: await service.registrar(req.params.id,req.user,req.body) }); }
  catch (e) { return erro(res,e); }
}
async function retornos(req,res) {
  try { return res.json({ retornos: await service.retornos(req.user) }); }
  catch (e) { return erro(res,e); }
}
async function buscar(req,res) {
  try { return res.json({ atividade: await service.buscar(req.params.id, req.params.atividadeId, req.user) }); }
  catch (e) { return erro(res,e); }
}
async function atualizar(req,res) {
  try { return res.json({ atividade: await service.atualizar(req.params.id, req.params.atividadeId, req.user, req.body ?? {}) }); }
  catch (e) { return erro(res,e); }
}
async function excluir(req,res) {
  try { await service.excluir(req.params.id, req.params.atividadeId, req.user); return res.status(204).end(); }
  catch (e) { return erro(res,e); }
}
module.exports = { listar, registrar, retornos, buscar, atualizar, excluir };
