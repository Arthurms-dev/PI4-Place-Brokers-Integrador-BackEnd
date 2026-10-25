'use strict';

const { performance } = require('node:perf_hooks');

const PASTA = 'application/vnd.google-apps.folder';
const ATALHO = 'application/vnd.google-apps.shortcut';
const ID = /^[A-Za-z0-9_-]{10,}$/;
const CHAVE = /^[A-Za-z0-9_-]+$/;
const CAMPOS = 'id,name,mimeType,modifiedTime,trashed,parents,resourceKey,shortcutDetails(targetId,targetMimeType,targetResourceKey)';

async function listarArvoreDrive({ pastas, token, fetchImpl = globalThis.fetch, limites = {}, onProgresso = () => {}, timeoutMs = 600000 }) {
  if (!Array.isArray(pastas) || !pastas.length || pastas.some((id) => !ID.test(id))) {
    throw new Error('Informe IDs válidos das pastas de origem do Drive.');
  }
  if (typeof token !== 'string' || !token.trim()) throw new Error('Token do Drive ausente.');
  const teto = { pastas: 1000, itens: 20000, profundidade: 30, paginas: 100, ...limites };
  if (Object.values(teto).some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error('Os limites da varredura devem ser inteiros positivos.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 1800000) {
    throw new Error('O tempo máximo da varredura deve estar entre 1 e 1800000 milissegundos.');
  }
  const inicio = performance.now();
  function tempoRestante() {
    const restante = timeoutMs - (performance.now() - inicio);
    if (restante <= 0) throw new Error('Tempo total da varredura do Drive excedido; nenhum resultado completo foi produzido.');
    return Math.max(1, Math.ceil(restante));
  }
  const arquivos = new Map();
  const visitadas = new Set();
  const alvos = new Map();
  const chaves = new Map();
  const avisos = [];
  let completo = true;
  let itensLidos = 0;
  let atalhos = 0;

  function progresso(evento, caminho = [], quantidade = null) {
    onProgresso({ evento, caminho, quantidade, segundos: Math.floor((performance.now() - inicio) / 1000),
      pastas: visitadas.size, itensLidos, arquivos: arquivos.size, atalhos });
  }

  function avisar(codigo, arquivo, caminho, mensagem) {
    completo = false;
    avisos.push({ codigo, id: arquivo.id, arquivo: arquivo.name || arquivo.id, caminho, mensagem });
  }

  function guardarChave(id, chave) {
    if (typeof chave === 'string' && CHAVE.test(chave)) chaves.set(id, chave);
  }

  async function consultar(url, contexto) {
    const headers = { Authorization: `Bearer ${token}` };
    const pares = contexto.filter((id) => chaves.has(id)).map((id) => `${id}/${chaves.get(id)}`);
    if (pares.length) headers['X-Goog-Drive-Resource-Keys'] = [...new Set(pares)].join(',');
    const espera = Math.min(20000, tempoRestante());
    try {
      const resposta = await fetchImpl(url, { method: 'GET', headers, signal: AbortSignal.timeout(espera) });
      if (resposta.status === 403 || resposta.status === 404) return { indisponivel: resposta.status };
      if (!resposta.ok) throw new Error(`Consulta ao Drive falhou (HTTP ${resposta.status}); nenhuma pendência deve ser gravada.`);
      return { dados: await resposta.json() };
    } catch (erro) {
      if (erro?.name === 'TimeoutError' || erro?.name === 'AbortError') {
        throw new Error(`Tempo de espera da consulta ao Drive excedido (${Math.ceil(espera / 1000)}s). Nenhum resultado completo foi produzido.`);
      }
      throw erro;
    }
  }

  function adicionar(arquivo, pastaId, caminho) {
    if (!arquivo.name || !arquivo.mimeType || arquivo.trashed) {
      avisar('METADADOS_INVALIDOS', arquivo, caminho, 'Arquivo sem metadados completos ou na lixeira.');
      return;
    }
    const atual = arquivos.get(arquivo.id);
    if (!atual || (!Number.isFinite(Date.parse(atual.modifiedTime)) && Number.isFinite(Date.parse(arquivo.modifiedTime))) ||
        Date.parse(arquivo.modifiedTime) > Date.parse(atual.modifiedTime)) {
      arquivos.set(arquivo.id, {
        id: arquivo.id, name: arquivo.name, mimeType: arquivo.mimeType,
        modifiedTime: arquivo.modifiedTime, pastaId: arquivo.parents?.[0] || pastaId,
        caminho,
      });
    }
  }

  async function percorrer(arquivo, pastaId, caminho, contexto, profundidade, cadeia = new Set()) {
    tempoRestante();
    if (!ID.test(arquivo.id ?? '')) {
      avisar('ID_INVALIDO', arquivo, caminho, 'ID inválido retornado pelo Drive.');
      return;
    }
    guardarChave(arquivo.id, arquivo.resourceKey);
    if (profundidade > teto.profundidade) throw new Error('Limite de profundidade do Drive atingido; varredura interrompida.');
    if (arquivo.mimeType === PASTA) {
      await percorrerPasta(arquivo.id, caminho, [...contexto, arquivo.id], profundidade);
      return;
    }
    if (arquivo.mimeType !== ATALHO) {
      adicionar(arquivo, pastaId, caminho);
      return;
    }
    atalhos += 1;
    const alvoId = arquivo.shortcutDetails?.targetId;
    if (!ID.test(alvoId ?? '')) {
      avisar('ATALHO_SEM_DESTINO', arquivo, caminho, 'O Drive não informou um destino válido para o atalho.');
      return;
    }
    if (cadeia.has(alvoId) || alvoId === arquivo.id) {
      avisar('CICLO_DE_ATALHOS', arquivo, caminho, 'Ciclo de atalhos interrompido.');
      return;
    }
    guardarChave(alvoId, arquivo.shortcutDetails?.targetResourceKey);
    const proximoContexto = [...contexto, arquivo.id, alvoId];
    let alvo = alvos.get(alvoId);
    if (!alvo) {
      const params = new URLSearchParams({ fields: CAMPOS, supportsAllDrives: 'true' });
      progresso('atalho', caminho);
      const retorno = await consultar(`https://www.googleapis.com/drive/v3/files/${alvoId}?${params}`, proximoContexto);
      if (retorno.indisponivel) {
        avisar('DESTINO_INACESSIVEL', arquivo, caminho, `Destino indisponível (HTTP ${retorno.indisponivel}). Pode ter sido removido ou exigir acesso; não foi considerado excluído.`);
        return;
      }
      alvo = retorno.dados;
      if (!alvo || alvo.id !== alvoId || alvo.trashed || !alvo.mimeType) {
        avisar('DESTINO_INVALIDO', arquivo, caminho, 'Destino na lixeira ou com metadados inválidos.');
        return;
      }
      alvos.set(alvoId, alvo);
    }
    await percorrer(alvo, pastaId, [...caminho, alvo.name || alvo.id], proximoContexto,
      profundidade + 1, new Set([...cadeia, arquivo.id]));
  }

  async function percorrerPasta(idPasta, caminho, contexto, profundidade) {
    if (visitadas.has(idPasta)) return;
    if (visitadas.size >= teto.pastas) throw new Error('Limite de pastas do Drive atingido; varredura interrompida.');
    visitadas.add(idPasta);
    let pagina;
    const paginas = new Set();
    do {
      if (paginas.size >= teto.paginas || paginas.has(pagina ?? '')) {
        throw new Error('Paginação do Drive excedeu o limite ou repetiu uma página; varredura interrompida.');
      }
      paginas.add(pagina ?? '');
      const params = new URLSearchParams({
        q: `'${idPasta}' in parents and trashed = false`,
        fields: `nextPageToken,incompleteSearch,files(${CAMPOS})`,
        pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
      });
      if (pagina) params.set('pageToken', pagina);
      progresso('pasta', caminho);
      const retorno = await consultar(`https://www.googleapis.com/drive/v3/files?${params}`, contexto);
      if (retorno.indisponivel) {
        avisar('PASTA_INACESSIVEL', { id: idPasta, name: caminho.at(-1) }, caminho,
          `Pasta indisponível (HTTP ${retorno.indisponivel}); a leitura está incompleta.`);
        return;
      }
      const dados = retorno.dados;
      if (!dados || dados.incompleteSearch || !Array.isArray(dados.files)) {
        throw new Error('O Drive retornou listagem incompleta ou inválida; varredura interrompida.');
      }
      itensLidos += dados.files.length;
      progresso('pagina', caminho, dados.files.length);
      if (itensLidos > teto.itens) throw new Error('Limite de itens do Drive atingido; varredura interrompida.');
      for (const arquivo of dados.files) {
        await percorrer(arquivo, idPasta, [...caminho, arquivo.name || arquivo.id], contexto, profundidade + 1);
      }
      pagina = dados.nextPageToken;
    } while (pagina);
  }

  for (const id of [...new Set(pastas)]) {
    const params = new URLSearchParams({ fields: CAMPOS, supportsAllDrives: 'true' });
    progresso('origem', [id]);
    const retorno = await consultar(`https://www.googleapis.com/drive/v3/files/${id}?${params}`, [id]);
    if (retorno.indisponivel) {
      avisar('ORIGEM_INACESSIVEL', { id }, [id], `Pasta de origem indisponível (HTTP ${retorno.indisponivel}).`);
      continue;
    }
    const origem = retorno.dados;
    if (!origem || origem.id !== id || origem.mimeType !== PASTA || origem.trashed) {
      avisar('ORIGEM_INVALIDA', { id }, [id], 'A origem precisa ser uma pasta acessível fora da lixeira.');
      continue;
    }
    guardarChave(id, origem.resourceKey);
    await percorrerPasta(id, [origem.name || id], [id], 0);
  }
  tempoRestante();
  progresso('concluido');
  return {
    arquivos: [...arquivos.values()].sort((a, b) => a.id.localeCompare(b.id)),
    avisos, completo,
    resumo: { pastas: visitadas.size, atalhos, itensLidos, arquivos: arquivos.size },
  };
}

function exigirVarreduraCompleta(resultado) {
  if (resultado?.completo !== true) {
    throw new Error('Leitura incompleta do Drive: corrija os avisos de acesso/atalhos antes de usar --apply. Nenhuma pendência foi gravada.');
  }
}

function formatarProgressoDrive(info) {
  const acoes = { origem: 'Conferindo origem', atalho: 'Resolvendo atalho', pasta: 'Consultando pasta',
    pagina: `Página recebida: ${info.quantidade ?? 0} itens`, concluido: 'Leitura encerrada' };
  const caminho = (info.caminho ?? []).join(' > ').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 240);
  return `[Drive ${info.segundos}s | ${info.pastas} pastas | ${info.itensLidos} itens] ${acoes[info.evento] ?? 'Consultando'}${caminho ? `: ${caminho}` : ''}`;
}

module.exports = { listarArvoreDrive, exigirVarreduraCompleta, formatarProgressoDrive };
