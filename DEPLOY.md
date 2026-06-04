# Guia de Deploy — Prime Paulista (EasyPanel)

O sistema tem **2 apps** que serão criados no mesmo projeto `prime_paulista`:
1. **API** (backend) — pasta `server/`
2. **Front** (site) — raiz do repositório

Ambos buildam direto do GitHub (`bitsmateus/primepaulista`).

---

## Pré-requisitos
- Repositório conectado ao EasyPanel (GitHub).
- Postgres e MinIO já criados no projeto (feito).

---

## Passo 1 — App da API (backend)

1. No projeto, **+ Serviço → App**. Nome: `api`.
2. **Source:** repositório `bitsmateus/primepaulista`, branch `main`.
3. **Build:**
   - Método: **Dockerfile**
   - **Build context / pasta do monorepo:** `server`
   - Dockerfile: `Dockerfile` (dentro de `server`)
4. **Ambiente (Environment):** cole as variáveis (ver tabela abaixo).
5. **Implantar**. Depois, em **Domínios**, o EasyPanel cria uma URL HTTPS (ex.: `https://prime-paulista-api.zpajmr.easypanel.host`) apontando para a porta **3333**. Anote essa URL.

### Variáveis da API
| Variável | Valor |
|----------|-------|
| `DATABASE_URL` | `postgres://postgres:SENHA_DO_BANCO@prime_paulista_postgres:5432/prime_paulista?sslmode=disable` (host **interno**) |
| `JWT_SECRET` | (chave de produção — fornecida no chat) |
| `PORT` | `3333` |
| `MINIO_ENDPOINT` | `prime-paulista-minio.zpajmr.easypanel.host` |
| `MINIO_PORT` | `443` |
| `MINIO_USE_SSL` | `true` |
| `MINIO_ACCESS_KEY` | `admin` |
| `MINIO_SECRET_KEY` | (a senha do MinIO) |
| `MINIO_BUCKET` | `prime-paulista` |
| `CORS_ORIGIN` | (preencher com a URL do Front no Passo 3) |

> A API roda **dentro** do servidor, então usa o host **interno** do Postgres (`prime_paulista_postgres`). O MinIO usa o domínio público (para as fotos abrirem no navegador).

---

## Passo 2 — App do Front (site)

1. **+ Serviço → App**. Nome: `front`.
2. **Source:** mesmo repositório, branch `main`.
3. **Build:**
   - Método: **Dockerfile**
   - **Build context:** `/` (raiz)
   - Dockerfile: `Dockerfile` (na raiz)
   - **Build Args:** `VITE_API_URL` = a URL da API do Passo 1 (ex.: `https://prime-paulista-api.zpajmr.easypanel.host`)
4. **Implantar.** Em **Domínios**, o EasyPanel cria a URL do site (porta **80**). Essa é a URL que você abre no navegador.

---

## Passo 3 — Conectar os dois (CORS)

1. Volte no app **api** → Ambiente.
2. Defina `CORS_ORIGIN` = a URL do Front (ex.: `https://prime-paulista-front.zpajmr.easypanel.host`).
3. Reimplante a **api**.

---

## Passo 4 — Primeiro acesso

- O usuário admin já existe no banco (criado no setup). Faça login com ele.
- Para criar outros usuários, use a tela (admin → cadastro de funcionários) ou rode o seed:
  `npx tsx src/db/seed-admin.ts "Nome" "email" "senha"`.

---

## ⚠️ Segurança pós-deploy
1. **Feche a porta 5432** exposta do Postgres no EasyPanel (a API usa o host interno agora).
2. **Troque a senha do banco** e atualize `DATABASE_URL` da API.
3. Mantenha `CORS_ORIGIN` apenas com a URL do Front.

## Notas
- As **migrations rodam automaticamente** quando a API sobe (`start:prod`).
- Atualizar o sistema = `git push` + **Reimplantar** os apps no EasyPanel.
