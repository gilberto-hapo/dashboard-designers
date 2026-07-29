# Dashboard Designers

## Seguranca

Este projeto nao deve expor segredos no frontend. As credenciais de login e as URLs da Goalfy ficam no servidor Node por meio de variaveis de ambiente.

Copie `.env.example` para `.env` e preencha:

- `SESSION_SECRET`
- `AUTH_USERS_JSON`
- `GOALFY_BOARD_URL`
- `GOALFY_CLIENTS_URL`

## Desenvolvimento

1. Instale dependencias: `npm install`
2. Inicie o app local: `npm start`

Em `NODE_ENV=development`, o `server.js` abre o frontend com Vite HMR, entao as mudancas aparecem instantaneamente no localhost.

Importante: para subir o localhost deste projeto na porta 3000, use sempre `npm start`. Nao use `npm run dev` diretamente como padrao, porque o login depende da API Express em `server.js`, que carrega o `.env` e atende `/api/auth/*`.

O Vite continua usando proxy de `/api` para `http://localhost:3000`.

## Producao

1. Configure as variaveis de ambiente no Hostinger
2. Rode o build: `npm run build`
3. Inicie a aplicacao com: `npm start`

O servidor Node publica os arquivos da pasta `dist` e atende as rotas `/api`.
