# Backend Prime Paulista (Node + Fastify + Drizzle)
FROM node:22-alpine

WORKDIR /app

# Dependências (cache eficiente)
COPY package*.json ./
RUN npm ci

# Código
COPY . .

ENV NODE_ENV=production
EXPOSE 3333

# Aplica migrations e sobe a API
CMD ["npm", "run", "start:prod"]
