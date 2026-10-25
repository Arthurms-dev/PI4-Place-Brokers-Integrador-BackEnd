# Revisão das pendências do Drive no ADM

Implementação sobre o backend main a7dd997 e o front main f487513 / branch
melhoria/home-galeria-place. Na inspeção havia só GET da fila e ações de abrir
links. A edição manual de documentos já existia e foi preservada.

## Banco e acesso

Execute `src/db/migrations/20261025_revisao_pendencias_drive.sql` no SQL Editor
do Supabase, após as migrações de documentos e da fila de 23 e 24/10.
Ela adiciona campos de revisão, tabela privada de histórico e a função
`revisar_pendencia_drive`. Não altera a aprovação dos documentos existentes.
Somente service_role pode executar a função; ela confere também se o revisor
é ADM ativo e aprovado. Não há política pública de leitura do histórico.

O backend obtém o revisor da sessão; não aceita esse identificador do cliente.
GET e PATCH da fila exigem autenticação e cargo admin. As mutações acontecem
em uma transação no banco, com trava da pendência e número de revisão.

## Fluxo da interface

Em ADM → Empreendimentos → Pendências do Google Drive:

1. Abrir o PDF para conferência e clicar em Revisar pendência.
2. Escolher empreendimento, book/tabela, título, fase e validade quando conhecida.
   Não existe associação automática pelo nome ou pela pasta.
3. Selecionar Criar novo documento ou o registro existente a atualizar.
   A tela permite abrir o documento atual para comparar.
4. Salvar vínculo em revisão. Este passo altera só a pendência, sem criar,
   aprovar ou editar um documento comercial.
5. Registrar o motivo da decisão e marcar a confirmação de conferência.
6. Aprovar e concluir revisão. Só neste passo o documento é criado/atualizado
   com status aprovado e a pendência passa a resolvido. A data-base é a data
   original do Drive, não a hora de revisão. Acesso permanece interno.

Ignorar com motivo encerra um candidato sem alterar documentos comerciais.
As situações Concluídas e Ignoradas permitem consultar decisões anteriores.
O histórico privado guarda o ADM, ação, horário e os dados antes/depois.
O detector existente usa upsert com ignoreDuplicates por ID e data do Drive;
não reabre automaticamente a mesma versão resolvida/ignorada. Uma nova data
do mesmo arquivo pode gerar uma nova pendência para revisão.

## Proteções e limites

- Aprovação exige vínculo salvo, confirmação expressa e motivo de 8 a 500 caracteres.
- Uma validade informada já vencida bloqueia a aprovação. Validade não é
  deduzida por nome, data do Drive ou OCR; o ADM deve verificar o PDF.
- Documento de outro empreendimento não pode ser selecionado pela API.
- Conflitos de arquivo ou documento vigente do mesmo tipo/fase exigem escolher
  explicitamente o registro a atualizar; não há substituição em lote.
- Se o documento alvo mudar após salvar o vínculo, a aprovação é bloqueada.
  Feche, reabra, compare os documentos e salve o vínculo novamente.
- Falha ao gravar o histórico reverte a alteração do documento e da pendência.
- O limite de 100 do registrador continua ativo. A fila exibe até 100 registros
  por situação. Não foi implementada paginação nesta entrega.
- O Drive é somente lido. Nenhum PDF é movido, apagado ou compartilhado.
- Esta entrega não agenda sincronização nem publica imagens na galeria.

## Rotas

- GET `/empreendimentos/documentos/pendencias?status=pendente|resolvido|ignorado`
- PATCH `/empreendimentos/documentos/pendencias/:pendenciaId`

PATCH recebe `acao`, `revisao` e os campos da ação. Para vincular:
`empreendimentoId`, `documentoId` (ou null para novo), `tipo`, `titulo`, `fase`,
`validadeAte`. Para ignorar: `motivo`. Para concluir: `motivo` e
`confirmarAprovacao: true`. Versão antiga/decisão encerrada retorna 409.

## Validação realizada

- Backend: testes de validação, RPC, autorização nas rotas e suíte Jest.
- Front: vínculo sem aprovação, confirmação, revisão atualizada, ignorar,
  conflito e falha de consulta de documentos; suíte Vitest e build Vite.
- SQL: 22 verificações em PostgreSQL embarcado (PGlite), com tabelas de teste,
  aprovação, conflito, validade vencida, histórico e rollback forçado.
  A migração não foi executada no Supabase do cliente nesta sessão.
- Os testes de interface usam DOM simulado; inspeção visual no navegador e
  teste com sessão real do ADM ainda devem ser feitos no ambiente do projeto.
