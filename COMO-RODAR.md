# Como rodar o projeto (desenvolvimento)

O sistema tem **2 partes** que rodam juntas: o **backend** (API + banco) e o **frontend** (telas).

## Pré-requisitos
- Node.js instalado
- Dependências instaladas (já feito): `npm install` na raiz e dentro de `server/`

## Passo a passo

Abra **2 terminais**.

### Terminal 1 — Backend (API)
```bash
cd server
npm run dev
```
A API sobe em **http://localhost:3333**.

### Terminal 2 — Frontend (telas)
```bash
npm run dev
```
O site abre em **http://localhost:8080**.

## Login
Use as credenciais do usuário admin criado com o script de seed
(`npx tsx src/db/seed-admin.ts "Nome" "email" "senha"`). As senhas
não ficam neste repositório por segurança.

## Scripts úteis do backend (pasta `server/`)
| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Sobe a API em modo desenvolvimento |
| `npm run db:ping` | Testa a conexão com o banco |
| `npm run db:generate` | Gera nova migration após mudar o schema |
| `npm run db:migrate` | Aplica as migrations no banco |
| `npx tsx src/db/seed-admin.ts "Nome" "email" "senha"` | Cria/atualiza um admin |
| `npx tsx src/db/tables.ts` | Lista as tabelas existentes no banco |

## Observações de segurança
- O arquivo `server/.env` e o `.env` da raiz contêm segredos e **não** vão pro Git (já estão no `.gitignore`).
- Em produção, o backend roda no mesmo servidor do banco (host interno) e a porta 5432 do Postgres deve ser **fechada** novamente no EasyPanel.
