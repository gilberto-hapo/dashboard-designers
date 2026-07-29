# Criar Cards — Documento de padrão do novo sistema

Este documento registra o padrão do novo módulo "Criar Cards", que será construído
aos poucos dentro do Dashboard Designers. A ideia é que este arquivo sirva de
referência viva conforme cada etapa for implementada — decisões, integrações e
observações importantes devem ser anotadas aqui antes de serem "esquecidas".

## Visão geral

A aba **Criar Cards** foi adicionada ao menu lateral do dashboard
([src/pages/Dashboard.tsx](src/pages/Dashboard.tsx)) como ponto de partida da
reestruturação do sistema. Por ora é um placeholder — o conteúdo funcional será
construído em etapas futuras, ainda a definir.

## Hierarquia de dados (CONFIRMADO)

O novo sistema segue uma hierarquia de 3 níveis, cada um dependente do anterior:

```
Cliente (database)
  └── Calendário (board)
        └── Post (board)
```

- **Cliente**: contém os padrões/configuração do cliente (designer responsável,
  planejador responsável, locais de publicação, posts contratados por mês, etc).
- **Calendário**: pertence a um Cliente. Um calendário representa um período
  (ex: "Floricultura Filippi - Agosto/2026").
- **Post**: pertence a um Calendário (e, por transitividade, a um Cliente).

### Como o vínculo é feito (IMPORTANTE)

Confirmado via prints da interface da Goalfy (cadastro de Cliente, card de
Calendário e card de Post): **dentro da Goalfy o vínculo é um campo de
referência/lookup nativo**, não texto livre digitado à mão:

- O campo `*Cliente` no card de Calendário é um **lookup** para o registro da
  database de Clientes — ao abrir, mostra o card completo do Cliente embutido
  (Designer Responsável, Planejador Responsável, Copywriter Dedicado, Posts
  Contratados, Locais de Publicação, Link Apresentação, Link do Drive Geral).
- O campo `*Calendário` no card de Post é um **lookup** para o card de
  Calendário — ao abrir, mostra o card completo do Calendário embutido, que por
  sua vez já traz o Cliente embutido dentro dele (referência em cascata:
  Post → Calendário → Cliente, tudo visível a partir do card de Post).
- Campos com `*` na Goalfy são obrigatórios no cadastro (ex: `*Cliente`,
  `*Designer Responsável`, `*Posts Contratados`, `*Calendário`).

⚠️ **Mas no export XLSX essa relação é aplainada para texto.** As colunas
`Cliente` (no board de Calendários) e `Calendário` (no board de Posts) trazem
apenas o **nome/título** do registro referenciado, não um ID. O vínculo
estruturado existe dentro da Goalfy, mas se perde ao exportar — então, do lado
do nosso backend, ainda precisamos tratar isso como **matching por nome**:

- O campo `Cliente` no export do board de Calendários deve casar com o
  `Título`/`Cliente` da database de Clientes.
- O campo `Calendário` no export do board de Posts deve casar com o `Título`
  do card de Calendário correspondente.

Isso significa que qualquer lógica de relacionamento no backend precisa:
- Normalizar nomes (acentos, espaços, caixa) antes de comparar — o sistema já
  tem utilitários para isso em [server.js](server.js) (`normalizeLookupKey`,
  `extractClientAliases`, `normalizeDesignerName`) que devem ser reaproveitados
  ou usados como referência.
- Tolerar variações de escrita entre os 3 recursos (mesmo cliente escrito de
  formas diferentes no Calendário vs. na Database de Clientes, por exemplo).
- Nunca assumir que a correspondência é exata sem normalização — isso já causou
  problemas no sistema atual (ver `resolveClientMeta`, `shouldReplaceClientMeta`
  em server.js) e é o motivo de existir toda uma camada de matching por alias.
- Como a relação real é 1 lookup, e não texto solto, o risco de ambiguidade é
  menor do que em campos totalmente livres — mas ainda existe (ex: nome do
  cliente reescrito com abreviação diferente entre database e board).

### Campos observados na interface (cadastro real, via print)

**Card de Cliente** (ex: "Artico B2B"):
Status do Registro (Ativo/toggle), `*Cliente`, `*Designer Responsável`,
`Planejador Responsável`, `Copywriter Dedicado`, `*Posts Contratados`,
`Locais de Publicação` (tags: LINKEDIN, INSTAGRAM, FACEBOOK), `*Link
Apresentação`, `*Link do Drive Geral`. Rodapé mostra criador e data
("Criado por: Gilberto Ferreira Filho, em 22 de julho, 6 dias atrás").

**Card de Calendário** (ex: "Porto Itapoá - Julho/2026"):
Etiquetas, Vencimento, aba "Visão Geral", `*Calendário` (nome do próprio
card), `*Cliente` (lookup — expande o card completo do Cliente), campos
adicionais fora do lookup: `Link do Drive das Artes`, `*Link do Calendário
Editorial`. Histórico de fase no rodapé (ex: "Em andamento — Entrou em 24 de
julho de 2026"). Painel lateral "Mover card para..." mostra a próxima fase
disponível (`Posts Programados`).

**Card de Post** (ex: "[PORTO ITAPOÁ] POST FACEBOOK 22/07/202"):
Etiquetas (rede social: FACEBOOK, LINKEDIN, INSTAGRAM), avatares de
responsáveis, Vencimento, aba "Visão Geral", `*Conteúdo`, `*Calendário`
(lookup — expande o card completo do Calendário, que já traz o Cliente
embutido dentro), `*Formato de entrega`, `Data de entrega`. Dentro da fase
"Criação textual" aparece um campo condicional: "Verifique abaixo se este
conteúdo tem um Copywriter Dedicado" + `*Os textos foram criados?` (Sim/Não) —
com instrução: "Se não tiver um Copywriter Dedicado, crie os textos e organize
no Link do Drive do calendário." Painel lateral "Mover card para..." mostra as
próximas fases (`Criação das artes`, `Arquivado`).

⚠️ Isso indica que **cada fase do board de Posts pode ter campos condicionais
próprios** (o campo de Copywriter/textos só aparece/importa na fase "Criação
textual"). Se replicarmos a lógica de criação de card, precisamos considerar
que o card evolui campo a campo conforme muda de fase — não é um formulário
único e estático.

## Fontes de dados (Goalfy)

O sistema já usa um padrão estabelecido para consumir dados da Goalfy: **export
Excel via URL de relatório**, não a API/UI do app.goalfy.com.br diretamente.

### Como gerar uma URL de exportação Goalfy

1. **Board**: abrir o board → aba Relatórios → abrir/criar um relatório → copiar
   o ID que aparece na URL depois de `reports/`. Montar:
   ```
   https://api.goalfy.com.br/api/reports/createExcelDownload/{ID_RELATORIO}/external?apiKey={API_KEY}
   ```
2. **Database**: abrir a database → copiar o ID que aparece na URL depois de
   `datatable/`. Montar:
   ```
   https://api.goalfy.com.br/api/reports/download/database/{ID_DATABASE}/external?apiKey={API_KEY}
   ```
3. A `apiKey` é gerada em Configurações de usuário → gerar chave de API. **A
   mesma apiKey funciona para todos os boards/databases da mesma conta Goalfy**
   (confirmado — reutilizamos a apiKey já existente no `.env` para os 3 novos
   recursos sem precisar gerar uma nova).

⚠️ Os IDs que aparecem na URL do navegador ao abrir um **board**
(`app.goalfy.com.br/board/{ID}`) são diferentes do ID do **relatório** usado na
URL de exportação. É preciso entrar no board e abrir a aba Relatórios para
pegar o ID certo — o ID da URL do navegador não funciona direto na exportação.

O retorno é um arquivo `.xlsx` (`content-type: application/octet-stream`), que
o backend lê com a lib `xlsx` (já usada em [server.js](server.js) via
`XLSX.read`/`XLSX.utils.sheet_to_json`).

### Novas variáveis de ambiente (`.env`)

Adicionadas para os 3 novos recursos da hierarquia Cliente → Calendário → Post:

| Variável | Recurso | Registros testados |
|---|---|---|
| `GOALFY_CARDS_CLIENTS_DB_URL` | Database de Clientes | 23 clientes |
| `GOALFY_CARDS_CALENDAR_BOARD_URL` | Board de Calendários | 4 cards (na data do teste) |
| `GOALFY_CARDS_POSTS_BOARD_URL` | Board de Posts | 1 card (na data do teste) |

Todas testadas e confirmadas com `status: 200` em 2026-07-28.

### Colunas observadas em cada recurso

**Database de Clientes** (`GOALFY_CARDS_CLIENTS_DB_URL`):
```
Designer Responsável, Link Apresentação, Planejador Responsável,
Locais de Publicação, Cliente, Criado em, Criador, Desabilitado,
Desabilitado em, Link do Drive Geral, Posts Contratados, Identificador,
Título, Atualizado em
```

**Board de Calendários** (`GOALFY_CARDS_CALENDAR_BOARD_URL`):
```
Título, Identificador, Fase Atual, Etiquetas, Data de Vencimento, Criador,
Responsáveis, Data na Fase Atual, Criado em, Atualizado em, Concluído em,
Calendário, Cliente, Link do Drive das Artes, Link do Calendário Editorial,
Primeira vez que entrou na fase Em andamento,
Última vez que saiu da fase Em andamento, Tempo total na fase Em andamento,
Primeira vez que entrou na fase Posts Programados,
Última vez que saiu da fase Posts Programados,
Tempo total na fase Posts Programados
```
Fluxo de fases observado: `Em andamento` → `Posts Programados`.

**Board de Posts** (`GOALFY_CARDS_POSTS_BOARD_URL`):
```
Título, Identificador, Fase Atual, Etiquetas, Data de Vencimento, Criador,
Responsáveis, Data na Fase Atual, Criado em, Atualizado em, Concluído em,
Calendário, Data de entrega, Conteúdo, Formato de entrega,
Os textos foram criados?, Copywriter Dedicado,
Primeira vez que entrou na fase Criação textual,
Última vez que saiu da fase Criação textual,
Tempo total na fase Criação textual,
Primeira vez que entrou na fase Criação das artes,
Última vez que saiu da fase Criação das artes,
Tempo total na fase Criação das artes,
Tempo total na fase Direção de arte,
Tempo total na fase Montagem da apresentação,
Tempo total na fase Validação do Cliente,
Tempo total na fase Aprovado para programação,
Tempo total na fase Post Programado,
Tempo total na fase Arquivado
```
Fluxo de fases observado: `Criação textual` → `Criação das artes` →
`Direção de arte` → `Montagem da apresentação` → `Validação do Cliente` →
`Aprovado para programação` → `Post Programado` → `Arquivado`.

⚠️ Este fluxo de fases é **diferente** do fluxo do board de produção principal
já usado no resto do dashboard (`GOALFY_BOARD_URL`, ver `stageMap` em
[server.js](server.js)). Se os dois boards forem usados juntos em qualquer
lógica compartilhada, os mapeamentos de fase não podem ser reaproveitados
diretamente — precisam de seu próprio mapeamento.

## API REST oficial da Goalfy

Documentação oficial encontrada em 2026-07-29:
https://goalfy-rest-api.readme.io/reference/iniciando-com-a-rest-api-da-goalfy

Isso é diferente e **melhor** do que o padrão de engenharia reversa via
DevTools usado até aqui: é uma API estável e documentada, com endpoints REST
próprios para leitura E escrita (o export XLSX continua válido para leitura em
massa, mas para leitura pontual/escrita a API é o caminho certo).

### Autenticação (⚠️ diferente do token de sessão do navegador)

- Gerar o token em: `https://app.goalfy.com.br/settings/0` → rolar até o fim
  da página → botão "Gerar Chave".
- Header em toda requisição: `Authorization: Token SEU_TOKEN_AQUI`.
- Este é um **token de API dedicado**, diferente do token de sessão do
  navegador usado inicialmente (capturado via DevTools em 2026-07-29, com
  `exp` de curto prazo embutido no JWT — mesmo token usado para login no app
  via browser). A doc não informa expiração do token de API dedicado, mas por
  ser gerado explicitamente nas configurações (não é um token de sessão de
  login) a expectativa é que dure bem mais.
- ✅ **Concluído em 2026-07-29**: token de API dedicado gerado e salvo em
  `GOALFY_CARDS_WRITE_TOKEN` no `.env`, substituindo o token de sessão do
  navegador. Validado com sucesso via rota `/api/criar-cards/ping`.
- Toda a API é HTTPS + JSON, seguindo padrão REST.
- Base URL: `https://api.goalfy.com.br/api`.

### Como obter IDs manualmente (via URL do navegador)

- **Board ID**: `app.goalfy.com.br/boards/{ID}`.
- **Card ID**: `app.goalfy.com.br/card/{ID}`.
- **Database ID**: `app.goalfy.com.br/register/{ID}`.
- **Record ID** (registro de uma database): `app.goalfy.com.br/register/{ID}`
  (mesma URL do database, o ID muda para o do registro específico).

### Endpoints — Card

| Ação | Método | URL |
|---|---|---|
| Listar card específico | GET | `/cards/{id}` |
| Listar cards em um board | GET | `/cards/board/{id}` |
| Listar cards em uma fase | GET | `/cards/phase/{id}` |
| Criar card | POST | `/cards/form/` |
| Atualizar campo pela 1ª vez | POST | ver "Criar card" (mesmo endpoint, campo ainda sem valor) |
| Atualizar campo já preenchido | PUT | `/forms/field/{id}` |
| Atualizar título do card | PUT | (rota `atualizar-título-do-card`, não detalhada ainda) |
| Excluir card | DELETE | `/cards/{id}` |
| Mover card de fase | PUT | `/cards/moveTo/{id}` |
| Mover card para fase final | PUT | (rota `mover-um-card-para-uma-fase-final`, não detalhada ainda) |

**Criar card** — `POST https://api.goalfy.com.br/api/cards/form/`
```json
{
  "modelId": "{{modelId do formulário}}",
  "fields": [
    { "value": "Goalfy", "fieldInfoId": "{{fieldInfoId}}" }
  ]
}
```
- `value` pode ser string (texto/data) ou array (campos de lookup/múltipla
  escolha, ex: `["{{cardId do calendário}}"]` para o campo Calendário do Post).
- O card nasce na fase inicial do fluxo do formulário.
- Erros: 400 (campo obrigatório faltando/formato inválido), 401, 403, 404
  (modelId ou fieldInfoId inexistente).
- Confirmado por teste manual em 2026-07-29 (via DevTools, replicado depois
  via `server.js`): `modelId` do formulário de Posts Produção de Conteúdo =
  `e4f3df53-8085-461b-85d8-7b8d38a6e378`.

**Listar cards em um board** — `GET /cards/board/{id}` retorna array simples
`[{id, title, phase, responsible}]`. Não tem paginação/busca — para isso usar
"Listar/Filtrar cards em um Board" abaixo.

**Mover card de fase** — `PUT /cards/moveTo/{id}` com body `{"phaseId": "..."}`.
Move imediatamente. Erros: 400 (phaseId inválido/faltando), 404, 401, 403.

### Endpoints — Board

| Ação | Método | URL |
|---|---|---|
| Listar boards | GET | `/boards` |
| Listar um board específico | GET | `/boards/{id}` |
| Pesquisar board pelo título | GET | `/boards/search?query={nome}` |
| Listar/filtrar cards em um board | GET | `/cards/board/{boardId}/filter` |
| Buscar campos de um board por fase | GET | `/{boardId}/fields` |

**Listar/filtrar cards em um board** — `GET /cards/board/{boardId}/filter`
com query params:
- `limit`, `offset` — paginação. ⚠️ **A doc erra isso: `offset` começa em 0,
  não em 1.** Confirmado por teste em 2026-07-29 — `offset=1` retornava
  `cards: []` mesmo com `cardsCount` correto (pulava o único resultado);
  `offset=0` retornou certinho.
- `search` — busca textual por valores dentro do card (⚠️ este é o endpoint
  certo para "achar o calendário X pelo nome", não `/api/cards?boardId=...`,
  que na prática ignora o `boardId` e retorna cards de vários boards
  misturados — confirmado por teste em 2026-07-29).
- `startDueDate`/`endDueDate`, `startCreatedAt`/`endCreatedAt` (ISO 8601,
  sempre em par).

Resposta confirmada por teste real em 2026-07-29:
`{"cards": [{id, title, phase, responsible, dueDate}, ...], "cardsCount": N}`
— o filtro por `search` faz correspondência parcial (ex: buscar "Transfast"
retorna o card certo), então ainda é preciso comparar o título retornado
contra o nome exato procurado (normalizado) antes de usar o `id`.

✅ **Migrado e em uso** em `server.js` (`findGoalfyCardInBoardByTitle`,
usado pela rota `/api/criar-cards/test-create-post`) — substitui a leitura do
export XLSX do board de Calendários para encontrar um card pelo nome.

**Buscar campos de um board por fase** — `GET /{boardId}/fields` (sem `/api`
antes do boardId, conforme a doc — confirmar, pode ser erro de digitação na
doc já que todo o resto do padrão usa `/api/...`). Retorna campos agrupados
por fase, com `fieldInfoId` de cada um — útil como alternativa a
`GET /api/models/{modelId}` (que já usamos manualmente com sucesso em
2026-07-29 para pegar os `fieldInfoId` do formulário de Posts).

### Endpoints — Database

| Ação | Método | URL |
|---|---|---|
| Listar um registro específico | GET | (rota `listar-um-registro-específico`, não detalhada ainda) |
| Listar databases | GET | `/databases` |
| Listar registros de um database | GET | `/databases/{idDatabase}/filter?limit=&offset=` |
| Buscar modelo de formulário de um database | GET | `/databaseRegisters/models/{fieldInfoId}` |
| Atualizar campo de um registro | PUT | (rota `atualizar-atributos-de-um-card-2`, não detalhada ainda) |
| Criar registro em database | POST | `/forms` |
| Deletar registro específico | DELETE | (rota `deletar-registro-em-especifico`, não detalhada ainda) |
| Deletar todos os registros da database | DELETE | (rota `delete-todos-os-registros-da-database`, não detalhada ainda) |

**Criar registro em database** — `POST https://api.goalfy.com.br/api/forms`
```json
{
  "modelId": "{{modelId}}",
  "dataBaseId": "{{dataBaseId}}",
  "fields": [
    { "value": "Goalfy", "fieldInfoId": "{{fieldInfoId}}" },
    { "value": ["Goalfy"], "fieldInfoId": "{{fieldInfoId2}}", "name": "Database Conectado" }
  ]
}
```
Nota: mesmo formato de "Criar card", mas com `dataBaseId` adicional e endpoint
`/forms` em vez de `/cards/form/`.

**Listar registros de um database** — `GET /databases/{idDatabase}/filter`
com `limit` e `offset` obrigatórios (offset começando em 0, confirmado por
teste em 2026-07-29). Resposta: `{"registers": [{fields: [...], ...}, ...]}`.

✅ **Database de Clientes Produção de Conteúdo — confirmado em 2026-07-29:**
- `dataBaseId = 652cab0e-7792-409c-81a0-b3cba1447209` (mesmo ID já usado na
  URL de export `GOALFY_CARDS_CLIENTS_DB_URL` — confirma que é o mesmo
  recurso, obtido via `GET /api/databases` e filtrando pelo título
  "Clientes Produção de Conteúdo").
- `fieldInfoId` de cada campo (via `GET /databases/{id}/filter`, olhando o
  array `fields` de um registro):
  - Cliente (`shortText`, título do registro): `b794bfc5-f574-4b39-94b1-4c3b55345cdc`
  - Designer Responsável (`responsible`): `460d3f59-8038-43a9-a05e-b96b9e523d4a`
  - Planejador Responsável (`responsible`): `91e3359f-2bee-41c5-b0b4-635ff03d29c9`
  - Copywriter Dedicado (`responsible`): `649e9044-3ba0-4181-9aca-912dcbe896a5`
  - Posts Contratados (`number`): `f019b499-0cd3-4d95-a2a2-ed8223a47ad8`
  - Locais de Publicação (`tag`): `9c3920b7-fd9e-460f-ac48-d21110fa969c`
  - Link Apresentação (`shortText`): `72f4bb34-de63-4116-a8a0-ebc79c4acdf6`
  - Link do Drive Geral (`shortText`): `e9603c0d-1b97-4e66-9f52-d5caacab8379`
- ⚠️ Campos do tipo `responsible` (Designer/Planejador/Copywriter) retornam
  `valueTitle` com o **nome de usuário Goalfy** (ex: `"vitorya"`, `"Pablo"`),
  não o nome completo — usar esse valor para exibir/filtrar na UI de
  "Designer Responsável" do fluxo de criação em massa.

### Endpoints — Phase

| Ação | Método | URL |
|---|---|---|
| Listar fase específica | GET | (rota `listar-fase-específica`, não detalhada ainda) |
| Listar fases por board | GET | (rota `listar-fases-por-board`, não detalhada ainda) |
| Mover card de fase | PUT | `/cards/moveTo/{id}` (ver seção Card) |
| Mover card para fase final | PUT | (rota `mover-um-card-para-uma-fase-final`, não detalhada ainda) |

### Outros grupos de endpoints (não detalhados ainda, listados para referência)

- **Goalfy Events**: Listar eventos em um board específico.
- **Organization**: Listar informações da organização.
- **User**: Listar informações do usuário (`GET /api/user`, já usado e
  confirmado funcionando na rota de teste `/api/criar-cards/ping`).
- **Arquivos**: Gerar link de arquivo para a Goalfy; obter URL de download.
- **Comentários**: Adicionar comentário em um card; listar comentários.
- **Filtros**: Filtrar pelo board em uma fase específica.
- **Etiqueta**: Adicionar etiqueta em um card.

### Endpoints do backend do dashboard (implementados em `server.js`, 2026-07-29)

Todos `requireAuth`-protegidos (sessão do dashboard, não confundir com o
token da Goalfy). Usam `getGoalfyCardsWriteToken()` + `goalfyApiFetch()`
(novos helpers que encapsulam `Authorization: Token ...` e o timeout padrão).

- **`GET /api/criar-cards/designers`** → `{ designers: string[] }`. Lista
  designers únicos a partir do campo "Designer Responsável" da database de
  Clientes (`fetchCardsClients`, cache de 1h).
- **`GET /api/criar-cards/calendarios?designer=X`** → `{ calendarios: [{id,
  title, clienteNome, mesAno}] }`. Cruza Clientes do designer (por nome
  normalizado) com Calendários na fase "Caixa de Entrada"
  (`fetchAllGoalfyCardsInBoard` + `GET /cards/{id}` por card, sem cache —
  poucos cards no board hoje, aceitável).
- **`GET /api/criar-cards/preview?calendarId=X`** → `{ calendar, posts:
  [{index, total, title, formato}], formatoOptions }`. Gera os N títulos
  (`buildPostTitles`) a partir de `Posts Contratados` do Cliente vinculado.
- **`POST /api/criar-cards/create-batch`** → body `{ calendarId, dueDate,
  posts: [{title, formato}] }`. Cria cada post sequencialmente (loop `for`,
  não `Promise.all`, para permitir falha parcial sem abortar os demais);
  retorna `{ created, failed, calendarMoved }`. Move o Calendário para "Em
  andamento" apenas se pelo menos 1 post foi criado com sucesso.

⚠️ **Bug corrigido em 2026-07-29**: o campo de data "Primeiro dia do mês"
não pode ser lido via `valueTitle` (formato `dd/mm/yyyy`, ex: `"01/08/2026"`)
— `new Date("01/08/2026")` no JS interpreta como `mm/dd/yyyy` (mês 01 = 
janeiro), dando o mês errado. Usar sempre o campo `value` (ISO `yyyy-mm-dd`)
para qualquer campo do tipo `date`/`expiration` que precise ser parseado —
função `findFieldDateValue` (separada de `findFieldValue`) criada
especificamente para isso.

### Descobertas de engenharia reversa (pré-documentação, ainda relevantes)

Estas descobertas foram feitas via DevTools antes de encontrar a doc oficial,
e continuam válidas/úteis:

- `modelId` do formulário "Posts Produção de Conteúdo" (board de Posts):
  `e4f3df53-8085-461b-85d8-7b8d38a6e378`.
- `fieldInfoId` dos campos desse formulário (via `GET /api/models/{modelId}`):
  - Conteúdo (`shortText`): `9c097656-08c4-490e-81b7-70df5d53ca16`.
  - Calendário (`connectedBoard`, lookup): `f29e52ef-8afd-4239-bd33-505e148f08c8`.
  - Formato de entrega (`list`): `82d1d68c-1246-4608-9f8e-86ae251aa785`.
  - Data de entrega (`expiration`): `ab32aa3a-fe5f-4cb6-9a72-80de449f4811`.
- `boardId` do board de Calendários: `14dbab80-535b-49bd-9c01-4006d2d92388`.
  - Fase "Caixa de Entrada": `715f4368-e23d-4581-bec6-5442a3916222`.
  - Fase "Em andamento": `cca763ea-ab4d-4ea0-8a6c-fcd83eceab10`.
  - Fase "Posts Programados": `5dcada9c-8cab-4eeb-b3f0-5632cdeb05be`.
  - Campo "Primeiro dia do mês deste calendário" (`date`): `5c0802d8-cf18-4f62-836a-fb0a64663b9b`.
  - Campo "Cliente" (`databaseRegister`, lookup p/ database de Clientes): `161d97db-7214-4d95-bc02-a332e607e6d9`.
  - (Todas as três fases confirmadas via `GET /api/boards/{boardId}` em 2026-07-29.)
- Cards existentes no board de Calendários em 2026-07-29 (via export XLSX):
  Floricultura Filippi - Agosto/2026 (`72fc0459-97d1-4bf5-8860-a69185055fae`),
  Porto Itapoá - Julho/2026 (`8b4db895-57b4-411b-ba8b-e7f21f6e73f0`),
  Artico B2B - Agosto/2026 (`d48301c5-c669-4ebd-97bb-f83e66c06f38`),
  Transfast - Agosto/2026 (`f270f734-7fa3-4da8-b85e-23f1dfa6863a`).
- `dataBaseId` do database "Clientes Produção de Conteúdo":
  `652cab0e-7792-409c-81a0-b3cba1447209` (ver seção "Endpoints — Database"
  acima para todos os `fieldInfoId` desse database).

## Estado atual (o que já foi feito)

- [x] Aba "Criar Cards" adicionada ao menu lateral (placeholder, sem lógica).
- [x] Hierarquia Cliente → Calendário → Post confirmada com o usuário.
- [x] As 3 URLs de exportação testadas e validadas (status 200, leitura de
      colunas confirmada).
- [x] URLs salvas no `.env` local.
- [x] Confirmado via prints da interface real da Goalfy que o vínculo entre
      níveis é um campo de lookup nativo (não texto livre), embora se aplaine
      para texto no export XLSX.
- [x] Documentação oficial da API REST da Goalfy localizada e mapeada (ver
      seção "API REST oficial da Goalfy" abaixo) — substitui a necessidade de
      engenharia reversa via DevTools para a maior parte dos casos.
- [x] Rota de teste `/api/criar-cards/ping` criada em `server.js`, valida que
      o backend autentica na Goalfy usando um token de escrita
      (`GOALFY_CARDS_WRITE_TOKEN` no `.env`) chamando `GET /api/user`.
- [x] Rota de teste `/api/criar-cards/test-create-post` criada em
      `server.js` — cria um Post de teste vinculado a um Calendário buscado
      pelo nome (via export XLSX, não pela API — ver observação abaixo).
- [x] Token de API dedicado gerado em `settings/0` e salvo em
      `GOALFY_CARDS_WRITE_TOKEN`, substituindo o token de sessão do navegador.
- [x] Busca de card por nome migrada para o endpoint oficial
      `GET /api/cards/board/{boardId}/filter?search=...` (função
      `findGoalfyCardInBoardByTitle` em `server.js`), em vez do export XLSX —
      mais confiável, sem atraso de cache. Testado com sucesso em 2026-07-29.
- [x] Fluxo completo da aba definido pelo usuário: filtrar por Designer →
      escolher Calendário → preview editável de N posts (Formato de entrega
      por card) → Data de entrega única → criar em massa → mover Calendário
      de "Caixa de Entrada" para "Em andamento". Plano salvo em
      `C:\Users\Admin\.claude\plans\a-ideia-nesta-aba-synchronous-forest.md`.
- [x] Endpoints de backend "de verdade" implementados em `server.js`:
      `GET /api/criar-cards/designers`, `GET /api/criar-cards/calendarios`,
      `GET /api/criar-cards/preview`, `POST /api/criar-cards/create-batch`.
      Todos testados manualmente com sucesso em 2026-07-29 (calendário
      "Transfast - Agosto/2026", 12 posts contratados).
- [x] Lógica de matching por nome implementada (`fetchCardsClients` +
      `normalizeLookupKey`) entre Designer → Cliente → Calendário.
- [x] UI da aba Criar Cards implementada em `src/components/CreateCardsPanel.tsx`
      (fluxo completo: Designer → Calendário → preview → Data de entrega →
      Criar Cards → resumo), plugada em `src/pages/Dashboard.tsx`.
- [x] Rota `/api/criar-cards/designers` ajustada em 2026-07-29 para listar
      apenas designers com pelo menos 1 Calendário na fase "Caixa de
      Entrada" (antes listava todo Designer Responsável cadastrado, mesmo
      sem calendário disponível). Nova função compartilhada
      `fetchInboxCalendars` (cache de 5min) usada tanto por `/designers`
      quanto por `/calendarios`, evitando duplicar a busca.
- [x] Preview dos posts em grade de até 5 colunas (responsivo: 2 colunas em
      mobile, 3 em tablet, 5 em desktop) em vez de lista vertical — ajuste
      feito após o usuário identificar que clientes com muitos "Posts
      Contratados" (ex: 40) geravam uma lista longa de difícil visualização.
      Cada célula mostra só `#0X/0N` + o Select de Formato de entrega
      (título completo do cliente/mês fica só no cabeçalho, não repetido em
      cada célula).

## Observações importantes para as próximas etapas

- O usuário está reestruturando o sistema **aos poucos**, começando por esta
  aba. Não assumir que o restante do dashboard (StatisticsPanel, CalendarPanel,
  etc.) deve ser alterado — o escopo é isolado nesta aba até indicação
  contrária.
- O fluxo exato da aba (o que o usuário vai criar/visualizar) ainda **não foi
  definido** — o usuário optou por primeiro estabelecer as conexões de dados e
  só depois explicar o que a aba vai fazer. Não implementar formulários de
  criação/escrita na Goalfy sem confirmação explícita — as URLs testadas são
  todas de **leitura** (export), não há integração de escrita validada ainda.
- Ao construir os endpoints de backend, seguir o padrão já estabelecido em
  [server.js](server.js) (cache com TTL, `inflightPromise` para deduplicar
  requisições concorrentes, persistência em `data/` como fallback) em vez de
  criar um padrão novo.
- A partir de 2026-07-29, priorizar a **API REST oficial da Goalfy** (ver
  seção acima) para qualquer leitura pontual ou escrita — não repetir
  engenharia reversa via DevTools quando o endpoint já está documentado.
  Reservar o export XLSX para leitura em massa (ex: dashboard principal, que
  já depende dele) onde a API não tem equivalente direto de listagem completa
  sem paginação.
- Vários endpoints da doc (rotas listadas como "não detalhada ainda" nas
  tabelas acima) ainda não tiveram a página individual lida — buscar a URL
  correspondente em https://goalfy-rest-api.readme.io/reference/ quando
  precisar deles pela primeira vez.
