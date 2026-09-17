# CA Planner

Gestão de finanças pessoais. Coleta os lançamentos das contas bancárias via Pluggy (Open
Finance), guarda em um banco SQLite local e permite categorizar cada lançamento com uma
árvore de categorias própria (grupo › categoria).

Roda como página web (`next dev` / `next start`) e como aplicativo de desktop (Electron),
usando o mesmo código e o mesmo banco.

Sucessor da skill `extrato-bancario` (`~/financas/SkillFinanceIntegrator`): o cliente da
Pluggy foi portado de Python para TypeScript e o destino deixou de ser o Wallet — os
lançamentos ficam aqui.

## Stack

Node 22 · Next.js 15 (App Router) · React 19 · Prisma 6 + SQLite · Tailwind 4 · Electron.

## Configuração

```bash
npm install
cp .env.example .env          # edite com suas credenciais da Pluggy
npm run db:migrate            # cria data/ca_planner.db e aplica as migrações
npm run db:seed               # categorias iniciais (pt-BR); idempotente
```

`.env`:

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | `file:../data/ca_planner.db` (relativo à pasta `prisma/`) |
| `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` | opcional, retaguarda; o normal é cadastrar pela interface |
| `CA_PLANNER_KEY_FILE` | opcional; onde fica a chave que cifra os segredos (padrão `data/.secret-key`) |

### Credenciais da Pluggy

Cadastre `clientId` e `clientSecret` em **Conexões › Credenciais da Pluggy**. Ao salvar, o app
testa as credenciais em `POST /auth` e só grava se a Pluggy aceitar. O `clientSecret` é
gravado cifrado (AES-256-GCM) na tabela `Setting`; a chave fica em `data/.secret-key`
(criada na primeira vez, permissão 0600) e nunca entra no banco — copiar só o `.db` não
expõe o secret. Faça backup dos dois arquivos juntos.

Os `itemId` de cada banco também ficam no banco, cadastrados na mesma tela.

### Vincular as contas (uma vez)

1. Conecte cada banco em [meu.pluggy.ai](https://meu.pluggy.ai).
2. No Dashboard, abra a aplicação, use o botão de demo com o conector **MeuPluggy** e
   autorize **uma vez por banco**. Cada autorização cria um *item*; copie o id.
3. Em **Conexões**, adicione o item com um apelido (ex.: `Santander PF`).

## Uso

```bash
npm run dev            # web: http://localhost:3000
npm run electron:dev   # desktop em desenvolvimento (sobe o next dev e abre a janela)
npm run electron       # desktop autônomo: next build + servidor embutido
npm run build && npm start   # web em produção
npm run dist           # empacota o app do macOS (.dmg em release/)
```

### App de desktop empacotado

`npm run dist` gera `release/CA Planner-<versão>-arm64.dmg` (Apple Silicon). Dentro do
app vão o servidor Next em modo `standalone`, as migrações e o engine do Prisma — nada
depende da pasta do projeto nem de `node_modules`.

O app **não é assinado** (não há certificado Developer ID), então na primeira vez o macOS
pede o caminho mais longo: clique com o botão direito no app › **Abrir** › **Abrir**.

Sem `.env` ao lado, o app guarda tudo em
`~/Library/Application Support/CA Planner/`: `ca_planner.db` e a chave `.secret-key`
(o nome da pasta vem do `app.setName` em `electron/main.cjs`). Um
banco novo nasce vazio — para levar o histórico desta pasta, copie os dois arquivos de
`data/` para lá com o app fechado. As migrações pendentes são aplicadas na abertura, sem
o CLI do Prisma (ver `electron/migrate.cjs`).

### Importar os JSON da skill

Pela tela **Conexões › Importar JSON da skill**, ou por linha de comando:

```bash
npm run import:json -- ~/financas/extratos-full/*.json
```

A conta é criada a partir do `contaId` da Pluggy; quando a conexão correspondente for
sincronizada, a conta é reconhecida e vinculada.

## Telas

- **Visão geral** — receitas, despesas e resultado do período (transferências fora),
  quebra por grupo › categoria e por conta, saldo atual reportado pela Pluggy.
- **Transações** — filtros por período, conta, categoria (inclusive "Sem categoria"),
  transferências e texto. Categoria editável inline; seleção múltipla para categorizar em
  lote; flag de transferência por clique. Mostra a categoria sugerida pela Pluggy só como
  dica. O botão **Sincronizar** busca lançamentos novos de todas as conexões, no período
  que está na tela (em "Tudo", nos últimos 30 dias) e mostra o resultado de cada conexão.
  O botão **Exportar** gera Excel (.xlsx), CSV ou PDF: abre com o recorte da tela e
  permite somar várias contas no mesmo arquivo e ajustar o intervalo de datas antes de
  baixar. O arquivo não tem o limite de 1000 linhas da listagem (teto de 50 mil).
- **Planejamento** — o previsto do mês: lançamentos avulsos ou recorrentes, com forma de
  pagamento (débito automático, transferência, boleto) e estado (aberto, agendado, feito).
  O estado é sempre da ocorrência — marcar setembro como feito não mexe em outubro — e pode
  ser trocado direto na lista. Em débito automático o estado fica travado em Aberto: o banco
  debita sozinho, não há o que agendar nem marcar. É informativo: quem decide o que já foi
  cumprido no Fluxo de caixa continua sendo a conciliação com as transações reais.
- **Categorias** — grupos e categorias editáveis (criar, renomear, mover, apagar). Apagar
  devolve os lançamentos para "Sem categoria".
- **Conexões** — cadastro de itens da Pluggy, sincronização por período (uma ou todas),
  contas de cada conexão (ativar/ignorar), importação de JSON e um registro da sessão.

## Decisões da v1

- **Valores em centavos, inteiros, com sinal.** Negativo = saiu dinheiro, para qualquer
  tipo de conta. Cartão de crédito tem o sinal invertido na normalização (a Pluggy usa
  positivo para despesa nova no cartão).
- **Só conta corrente e poupança.** Cartões são registrados como contas *ignoradas*; a
  fatura já aparece como débito na conta corrente. Dá para ativar um cartão em Conexões,
  mas aí o pagamento da fatura precisa ser marcado como transferência para não dobrar.
- **Categorização manual.** Nada é categorizado sozinho; a categoria da Pluggy aparece como
  dica na lista. Regras automáticas ficam para uma versão futura.
- **Transferência entre contas próprias** é uma flag na transação, marcada automaticamente
  quando a Pluggy classifica como `Same person transfer` e editável. Lançamentos com a
  flag aparecem na lista mas ficam fora dos totais. Não há pareamento das duas pontas.
- **Idempotência.** A chave é o `id` da transação na Pluggy (`externalId`, único). Repetir
  um período atualiza valor/descrição/status e preserva categoria, flag e notas. Se o banco
  alterar um lançamento a ponto da Pluggy trocar o id, ele entra duplicado — a conferência
  grosseira por conta+data+valor da skill não foi trazida para não engolir lançamentos
  legítimos iguais.
- **Credenciais no banco, cifradas.** `clientSecret` cifrado com chave local fora do
  banco. `.env` continua aceito como retaguarda quando o banco não tem credenciais.
- **Saúde da conexão antes de coletar.** Consentimento vencido não dá erro na Pluggy, só
  devolve dados velhos; por isso `GET /items/{id}` é checado antes de cada sincronização e o
  erro aparece na conexão.

## Estrutura

```
prisma/schema.prisma        modelo: Connection, Account, CategoryGroup, Category, Transaction
prisma/seed.ts              categorias iniciais
src/lib/pluggy/client.ts    cliente da Pluggy (auth, item, contas, /v2/transactions com cursor)
src/lib/pluggy/normalize.ts conversão para o formato interno e convenção de sinal
src/lib/sync.ts             sincronização de uma conexão → banco
src/lib/settings.ts         configurações (credenciais da Pluggy) na tabela Setting
src/lib/secrets.ts          cifra AES-256-GCM com chave local (data/.secret-key)
src/lib/import-json.ts      importação dos JSON da skill
src/lib/transaction-filters.ts  filtros da listagem, compartilhados com a exportação
src/lib/export/*            geração dos arquivos: rows (consulta), csv, xlsx (ExcelJS), pdf (pdf-lib)
src/app/api/*               rotas REST usadas pela interface
src/app/(páginas)           Visão geral, Transações, Categorias, Conexões
electron/main.cjs           janela + servidor Next (em processo, ou standalone no app)
electron/migrate.cjs        aplica as migrações sem o CLI do Prisma (node:sqlite)
scripts/pack-server.mjs     junta estáticos e public ao standalone antes de empacotar
scripts/import-json.ts      importação por linha de comando
```

## Próximos passos possíveis

Regras de categorização por palavra-chave; pareamento das duas pontas de uma transferência;
cliente direto do Inter (mTLS) como alternativa à Pluggy; exportação OFX; assinatura e
notarização do app (hoje o .dmg sai sem assinatura); build para Intel além do Apple Silicon.

## Licença

[MIT](LICENSE) © 2026 Flavio de Castro Alves Filho. Este projeto não é afiliado à Pluggy nem aos bancos citados;
as credenciais e os dados bancários ficam apenas na sua máquina.
