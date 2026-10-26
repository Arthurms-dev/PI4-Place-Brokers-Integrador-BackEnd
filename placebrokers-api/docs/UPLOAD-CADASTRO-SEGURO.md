# Upload na criação de empreendimentos

Base: `melhoria/drive-atalhos-3c`, commit `655f4f8`.

## Comportamento

As imagens e os PDFs recebem caminhos únicos e são enviados com `upsert: false`. Criar outro cadastro com o mesmo nome não sobrescreve a capa, a galeria, o book ou a tabela de um cadastro anterior. Os métodos antigos de upload também passam a usar nomes únicos.

O lote do cadastro confere tipos e limites antes de começar: imagens JPG/PNG/WebP, até 15 MB por arquivo, no máximo 20 fotos de galeria, PDFs com MIME de PDF e cabeçalho `%PDF-`. A imagem é decodificada e convertida para WebP, com limite de 40 milhões de pixels e largura de até 1600 px. O teste de cabeçalho do PDF não é uma validação completa do documento nem uma análise de malware.

Os uploads do lote são sequenciais. Se uma etapa falhar, não ficam outros envios paralelos em andamento que possam terminar depois da limpeza. O manifesto contém apenas os caminhos e buckets dos uploads confirmados desta tentativa. A limpeza usa esse manifesto, nunca o slug para apagar uma pasta inteira e nunca as URLs do cadastro anterior.

## Falhas e recuperação

| Situação | Tratamento |
| --- | --- |
| Upload interrompido antes de iniciar o cadastro | Tenta limpar apenas os arquivos novos já confirmados; devolve o erro original |
| INSERT recusado por erro SQL de entrada, constraint ou permissão | Tenta limpar o lote novo |
| Nome/slug já cadastrado | HTTP 409 com erro no nome; o cadastro anterior é preservado |
| Cadastro salvo e inserção da galeria falha | Tenta desfazer exclusivamente o UUID novo; só limpa os arquivos após receber confirmação da exclusão |
| FK, indisponibilidade ou falta de confirmação impedem desfazer o cadastro | Preserva os arquivos e retorna `CREATE_UNCONFIRMED` com orientação para conferir a lista antes de reenviar |
| Resposta do INSERT perdida | Consulta somente o UUID pré-alocado pela tentativa; se não puder confirmar e desfazer, preserva os arquivos |
| Limpeza do Storage também falha | Registra a falha no servidor e mantém o diagnóstico original; pode restar arquivo novo para revisão operacional |

O método de rollback não exclui registros filhos, não procura cadastro por nome e não toca IDs de empreendimentos anteriores. Se houver dependências que bloqueiem a exclusão, o registro e seus arquivos ficam preservados. O cache público é invalidado também nas falhas após a tentativa de persistência.

## Compatibilidade e limites

- As rotas, as respostas de sucesso e o formulário atual continuam compatíveis. Este pacote altera somente o back.
- Não exige migração SQL, nova dependência ou alteração de `.env`.
- Os arquivos antigos não são renomeados nem apagados pela instalação.
- O método usado para PDFs do viabilizador também recebe nomes únicos, mas a compensação de falha após atualização desse fluxo separado não foi reimplementada neste pacote.
- Banco e Storage não formam uma transação única. Em respostas perdidas ou falhas na compensação, o sistema prioriza preservar os arquivos que podem estar referenciados. Não há garantia de ausência de órfãos em todas as falhas de rede.

## Verificações executadas

- 324 testes Jest passaram; 5 todo.
- 57 testes dos scripts do Drive passaram.
- 21 testes novos cobrem caminhos distintos, preservação dos arquivos anteriores, interrupção na galeria/PDF, imagem ilegível, limites, limpeza em ambos os buckets, duplicidade, confirmação de rollback e respostas perdidas.
- Os testes de imagem usam o Sharp real com imagens pequenas. As chamadas ao banco e ao Storage são simuladas.
- `git diff --check` passou. Nenhuma gravação no banco ou Storage reais foi feita durante a implementação.

Ainda é necessário conferir um upload real pela sessão do ADM após a instalação e o reinício do back.

## Instalação e commit

Execute `INSTALAR.ps1`. O instalador confere os arquivos contra a versão base, faz backup, copia os sete arquivos deste pacote e executa os testes. Em falha, restaura os arquivos de código modificados.

Após a instalação passar, execute `COMMIT-BACK.ps1`. Ele faz commit e push apenas dos arquivos deste pacote e para se houver outros caminhos previamente staged. Não faz merge de branches e não inclui configurações de ambiente.
