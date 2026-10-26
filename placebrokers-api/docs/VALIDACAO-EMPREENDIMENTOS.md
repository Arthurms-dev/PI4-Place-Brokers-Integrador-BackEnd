# Validação de valores do empreendimento

Base revisada: branch `melhoria/drive-atalhos-3c`, commit `3490490`.

A criação e a edição agora compartilham as regras de números e intervalos.

- Preço e área: números finitos, não negativos, dentro dos limites das colunas documentadas no schema. Zero continua aceito para compatibilidade com o formulário.
- Quartos e vagas: inteiros de 0 a 32767.
- Latitude entre -90 e 90; longitude entre -180 e 180.
- O mínimo não pode ultrapassar o máximo quando ambos são informados.
- Campos opcionais vazios permanecem `null`. Não se inventa preço para imóveis sob consulta.
- Na edição parcial, o novo limite é conferido com o outro limite já cadastrado. Alterar os dois confere a nova faixa completa. Limpar um limite continua permitido.
- Uma inconsistência antiga em faixa não tocada não impede a edição isolada de descrição, nome ou publicação. Corrigir a faixa exige um resultado válido.

O POST multipart converte números de texto para número, inclusive decimais com ponto. Texto inválido, arrays, booleanos, números infinitos e formatos locais como `350.000,00` são rejeitados com HTTP 400, antes de qualquer upload ou gravação. O formulário atual já envia os números no formato aceito. PATCH JSON continua exigindo números JSON em campos preenchidos; strings numéricas não são convertidas implicitamente.

Os erros de campo usam os nomes da API (`precoMin`, `areaMax`, etc.), compatíveis com o formulário ADM. Coordenadas também retornam o erro em `coords` para o campo combinado do formulário. Os valores aceitos não são arredondados pelo validador; a escala decimal continua dependendo do banco.

## Exemplo de atualização parcial

Registro atual: `preco_min = 300000`, `preco_max = 400000`.

```json
{ "precoMin": 450000 }
```

Retorna HTTP 400 com erro em `precoMin`. Para uma nova faixa completa:

```json
{ "precoMin": 450000, "precoMax": 500000 }
```

Os testes verificam as rejeições sem gravação e sem upload, a atualização parcial, a correção de faixas antigas, campos vazios/zero e a conversão na entrada do controller.

## Verificação

- `npm test -- --runInBand`: 303 testes passaram; 5 todo.
- `npm run test:drive`: 57 testes passaram.
- 43 testes novos na validação do serviço e na conversão do controller.
- `git diff --check`: passou.

Os testes usam dependências simuladas. Nenhuma gravação no Supabase real ou migração foi executada. As regras protegem as requisições à API; não acrescentam constraints de banco nem garantia transacional contra alterações concorrentes.

## Instalação e commits

O pacote inclui `INSTALAR.ps1`, que confere a versão dos arquivos, faz backup, copia os seis arquivos deste ajuste e executa os testes. Em falha, restaura os arquivos alterados. Não edita `.env`, dependências, front ou banco.

Depois de instalar, reinicie o back. Para registrar esta alteração, execute `COMMIT-BACK.ps1`. Para registrar a revisão anterior da home já instalada, execute `COMMIT-FRONT.ps1`. Os scripts de commit incluem apenas os caminhos do respectivo pacote e param se houver outros arquivos previamente staged. Executam commit e push; não fazem merge de branches.

O fluxo antigo de upload na criação **ainda é uma etapa separada**. Ele não foi modificado neste pacote de validação.
