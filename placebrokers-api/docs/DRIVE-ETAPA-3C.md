# Etapa 3C — descoberta do acervo por atalhos

Esta entrega implementa a descoberta recursiva de metadados. Não conclui toda a sincronização comercial.

## Fluxo implementado

Drive Place → pastas de segmento → atalho da construtora → pasta original → subpastas dos empreendimentos → arquivos originais.

O módulo `scripts/drive-arvore.cjs` é usado pelos dois scripts existentes:

- `auditar-drive-documentos.cjs`: apresenta o resultado da comparação, sem escrever.
- `registrar-pendencias-drive.cjs`: simula por padrão; `--apply` continua limitado à tabela de pendências existente.

A origem continua sendo configurada em `GOOGLE_DRIVE_DOCUMENTOS_FOLDER_IDS`. Pode ser a pasta raiz da Place, ou uma seleção de pastas de segmentos. IDs repetidos, pastas alcançadas por caminhos diferentes e arquivos originais repetidos são deduplicados.

Não são necessários novos pacotes ou migrações SQL.

## Regras

- O atalho é resolvido por `shortcutDetails.targetId`. A comparação usa ID, nome e `modifiedTime` do arquivo original.
- O tipo atual do destino é consultado; o `targetMimeType` gravado no atalho não é tomado como verdade definitiva.
- Resource keys presentes nos metadados dos atalhos são encaminhadas em cabeçalho para consultas aos destinos. Não aparecem nos resultados ou logs da varredura.
- A conta usada pelo script precisa conseguir ler o destino. Acesso ao atalho não garante acesso à pasta da construtora.
- Apenas chamadas GET de metadados são realizadas pelo novo módulo. Ele não baixa arquivos, altera permissões ou escreve no Google Drive.
- Fotos, vídeos e outros arquivos acessíveis são inventariados por seus metadados; a comparação comercial existente continua tratando apenas PDFs.
- Mesmo ID com nova data pode gerar revisão de modificação. Um PDF mensal com novo ID é candidato sem vínculo: nome semelhante não autoriza substituição nem associação automática ao empreendimento/fase.
- Não há publicação automática de documentos ou de imagens no site.

## Leitura incompleta

403/404 de pasta ou destino geram avisos explícitos. Esses retornos não comprovam exclusão: podem significar perda de acesso.

A simulação continua mostrando os arquivos acessíveis, mas termina com código 2 quando a leitura fica incompleta. O modo `--apply` recusa a gravação nesse caso. Falhas de autenticação, limite da API, erro do servidor, timeout, busca incompleta, paginação repetida ou excesso de limites abortam a execução antes de qualquer gravação.

Limites padrão: 1.000 pastas, 20.000 itens listados, profundidade 30 e 100 páginas por pasta. Atingir um limite interrompe a varredura; não produz um resultado apresentado como completo.

## Configuração existente

O script mantém as variáveis já utilizadas:

```text
GOOGLE_APPLICATION_CREDENTIALS
GOOGLE_DRIVE_DOCUMENTOS_FOLDER_IDS
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

`GOOGLE_APPLICATION_CREDENTIALS` aponta para o JSON da conta de serviço fora do repositório. Não envie o arquivo ou o conteúdo de `.env` em mensagens, commits ou capturas. O projeto Google precisa da Drive API habilitada. A autenticação continua solicitando apenas `drive.metadata.readonly`.

Pasta raiz informada pelo usuário: `1YFvZRQ6P3pjp1hTgVzpd2kvlB55AQ3Ld`. Configurar esse ID é uma escolha explícita de escopo: a varredura tentará percorrer todas as subpastas e destinos acessíveis dos atalhos encontrados nele. É possível começar por uma pasta de segmento menor para avaliar a saída.

## Como validar

Na pasta `placebrokers-api`:

```powershell
npm run test:drive
npm test -- --runInBand
node scripts/registrar-pendencias-drive.cjs
```

O último comando é uma simulação: consulta metadados do Drive e registros do Supabase, sem gravar. Revise o resumo, os avisos e as pendências antes de considerar uma gravação. Não use `--apply` como teste de instalação.

## O que ainda falta

- Validar esta versão com as credenciais e os destinos reais das construtoras. Os testes automatizados usam respostas simuladas.
- Definir a estratégia de acesso e armazenamento dos materiais; o código não copia os arquivos para uma nova central.
- Persistir histórico de varreduras para acompanhar arquivos antes encontrados que deixaram de aparecer. Ausência na listagem, sozinha, não comprova exclusão.
- Integrar resolução/encerramento da pendência à aprovação explícita do ADM. Esta entrega não altera a tela nem o fluxo comercial de aprovação.
- Tratar ingestão/aprovação de fotos, vídeos e plantas como fluxo próprio. Inventariar metadados não publica esses materiais.
- Implantar a execução periódica após a validação das fontes e acessos. Nenhum agendamento foi criado nesta entrega.

O viabilizador permanece fora do escopo desta etapa.

## Referências técnicas

- https://developers.google.com/workspace/drive/api/guides/shortcuts
- https://developers.google.com/workspace/drive/api/guides/resource-keys
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list

## Progresso e limites de espera

A execução agora informa imediatamente:

1. Consulta do catálogo e dos documentos no Supabase (20 segundos por requisição).
2. Autenticação da conta de serviço no Google (20 segundos).
3. Percurso do Drive, com tempo decorrido, pasta/atalho em consulta e quantidade de itens listados.

Os eventos são emitidos antes das consultas remotas e após receber cada página. Nenhum token, chave do Supabase, resource key ou conteúdo do JSON de credenciais é impresso.

Cada consulta de metadados do Drive continua limitada a 20 segundos. A varredura possui prazo total padrão de 10 minutos. Opcionalmente, `GOOGLE_DRIVE_TIMEOUT_MS` pode definir o prazo total em milissegundos, até 1.800.000. Não é necessário acrescentar essa variável para usar o padrão.

O prazo total limita a varredura do Drive; consultas do Supabase e autenticação têm seus limites próprios. Um erro ou prazo excedido aborta a execução antes de gravar pendências. A ausência de resumo final não comprova sucesso.
# Revisão do acervo inicial (relatório JSON)

O log real de 25/10/2026 terminou em 576s: 799 pastas, 19 atalhos,
6.065 itens lidos e 5.259 arquivos únicos. As 1.610 pendências tinham motivo
`PDF_NOVO_SEM_VINCULO`; isso não comprova atualização nem documento vigente.
Há material comercial, jurídico, técnico e institucional misturado.

Para preservar IDs, caminhos, datas, tipos MIME e motivos em UTF-8:

```powershell
$env:GOOGLE_DRIVE_TIMEOUT_MS = "900000"
$relatorioPlace = Join-Path $env:USERPROFILE ("Downloads\place-drive-inventario-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
node scripts/registrar-pendencias-drive.cjs --relatorio "$relatorioPlace"
```

O prazo de 15 minutos vale só para a execução deste terminal. O levantamento
anterior quase atingiu o padrão de 10 minutos. O comando continua em simulação,
não aceita `--apply` junto, não sobrescreve arquivo existente e não exporta
credenciais, tokens ou resource keys. Não cria a pasta de destino.

O relatório inclui todos os arquivos encontrados (inclusive fotos e vídeos),
mas o detector de pendências comerciais continua restrito a PDFs.
`catalogo_consultado` informa quantos registros a consulta retornou, não uma
garantia de inventário integral do banco. `completo: false` e código 2 sinalizam
varredura parcial. Nenhum vínculo é deduzido pelo nome ou caminho.

Próxima revisão: escolher empreendimento/pasta de origem, conferir manualmente
book e tabela vigentes e vincular aos registros corretos. Nomes como “tabela”
ou “outubro” servem para triagem, não aprovação. Certidões, ônus, contratos e
logos não devem virar automaticamente books/tabelas comerciais.
O limite de 100 pendências por gravação permanece ativo.
