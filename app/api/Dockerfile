FROM node:22-slim

WORKDIR /app

# ffmpeg: converte o áudio gravado no navegador (webm/mp4) pra OGG/Opus — o único formato que a
# API Oficial mostra como NOTA DE VOZ. Sem ele o Chrome grava webm e a Meta recusa.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Instala dependências primeiro (cache de camada)
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copia o código (o .env NÃO vem — .dockerignore. Em produção, env vem do Swarm)
COPY . .

ENV NODE_ENV=production
EXPOSE 3333

# Roda direto o TypeScript via tsx (sem build). O node é o PID 1 (sem npm no meio) pra receber o
# SIGTERM do Swarm e fazer o desligamento gracioso — esperar os fluxos em andamento (14/10/2026).
CMD ["node", "--import", "tsx", "src/server.ts"]
