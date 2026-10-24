'use strict';

const ID_VALIDO = /^[A-Za-z0-9_-]{10,}$/;

function idDriveDaUrl(valor) {
  if (typeof valor !== 'string') return null;
  try {
    const url = new URL(valor.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') return null;
    const encontrado = /^\/file\/d\/([A-Za-z0-9_-]+)\/(?:view|preview)\/?$/.exec(url.pathname);
    if (!encontrado) return null;
    return ID_VALIDO.test(encontrado[1]) ? encontrado[1] : null;
  } catch {
    return null;
  }
}

function compararDocumentosDrive({ arquivos = [], documentos = [], empreendimentos = [] }) {
  const nomePorId = new Map(empreendimentos.map((item) => [item.id, item.nome]));
  const docsPorArquivo = new Map();
  const legadosPorArquivo = new Map();

  for (const doc of documentos) {
    if (!doc.drive_file_id) continue;
    const grupo = docsPorArquivo.get(doc.drive_file_id) ?? [];
    grupo.push(doc);
    docsPorArquivo.set(doc.drive_file_id, grupo);
  }

  for (const emp of empreendimentos) {
    for (const [campo, tipo] of [['book_url', 'book'], ['tabela_url', 'tabela']]) {
      const id = idDriveDaUrl(emp[campo]);
      if (!id) continue;
      const grupo = legadosPorArquivo.get(id) ?? [];
      grupo.push({ empreendimento: emp.nome, tipo });
      legadosPorArquivo.set(id, grupo);
    }
  }

  const resultados = arquivos
    .filter((arquivo) => arquivo.mimeType === 'application/pdf')
    .map((arquivo) => {
      const docs = docsPorArquivo.get(arquivo.id) ?? [];
      const legados = legadosPorArquivo.get(arquivo.id) ?? [];
      const base = {
        arquivo: arquivo.name,
        situacao: '',
        empreendimento: '',
        tipo: '',
        fase: '',
        observacao: '',
      };

      if (docs.length > 1) {
        return {
          ...base, situacao: 'REVISAR_ID_REPETIDO',
          observacao: 'O mesmo arquivo está vinculado a vários registros comerciais.',
        };
      }

      if (docs.length === 1) {
        const doc = docs[0];
        const anterior = Date.parse(doc.fonte_atualizada_em ?? '');
        const noDrive = Date.parse(arquivo.modifiedTime ?? '');
        const mudou = Number.isFinite(anterior) &&
          Number.isFinite(noDrive) && noDrive - anterior > 5000;

        return {
          ...base,
          empreendimento: nomePorId.get(doc.empreendimento_id) ?? 'ID não encontrado',
          tipo: doc.tipo,
          fase: doc.fase ?? 'Geral',
          situacao: !Number.isFinite(anterior)
            ? 'SEM_DATA_REFERENCIA'
            : mudou ? 'REVISAR_MODIFICACAO' : 'CADASTRADO',
          observacao: !Number.isFinite(anterior)
            ? 'Não é possível comparar versões sem data de referência.'
            : mudou
              ? 'O arquivo no Drive tem data posterior à referência cadastrada.'
              : 'Sem mudança de data detectada.',
        };
      }

      if (legados.length) {
        return {
          ...base,
          empreendimento: legados.map((x) => x.empreendimento).join(', '),
          tipo: legados.map((x) => x.tipo).join(', '),
          fase: 'Legado',
          situacao: legados.length > 1 ? 'REVISAR_LEGADO_REPETIDO' : 'VINCULO_LEGADO',
          observacao: 'O link já está cadastrado em empreendimentos.',
        };
      }

      return {
        ...base,
        situacao: 'CANDIDATO_SEM_VINCULO',
        observacao: 'PDF novo nesta pasta; conferir imóvel, tipo e fase manualmente.',
      };
    });

  return resultados.sort((a, b) =>
    a.situacao.localeCompare(b.situacao, 'pt-BR') ||
    a.arquivo.localeCompare(b.arquivo, 'pt-BR')
  );
}

module.exports = { idDriveDaUrl, compararDocumentosDrive };
