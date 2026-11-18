'use strict';

const MENSAGEM_SENHA_VAZADA = 'Esta senha já apareceu em vazamentos de dados na internet. Escolha outra.';

/**
 * Devolve a mensagem de erro se a senha já vazou; null se está ok.
 * Se o serviço de consulta cair, não trava o cadastro nem a troca de senha (só registra no log).
 * @param {{ vezesQueVazou: (senha: string) => Promise<number> } | null} cliente
 * @param {string} senha
 * @param {{ warn: Function }} [log]
 */
async function conferirSenhaVazada(cliente, senha, log = console) {
  if (!cliente || !senha) return null;
  try {
    const vezes = await cliente.vezesQueVazou(senha);
    return vezes > 0 ? MENSAGEM_SENHA_VAZADA : null;
  } catch (err) {
    log.warn('Não foi possível conferir se a senha vazou (seguindo sem a checagem):', err?.message ?? err);
    return null;
  }
}

module.exports = { conferirSenhaVazada, MENSAGEM_SENHA_VAZADA };
