# ZapConverte — painel visual (Next.js standalone), roda na VPS atrás do Traefik.
# Build em 2 estágios: compila e depois copia só o necessário (imagem pequena).

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# A pasta public NUNCA era copiada — por isso /favicon.ico dava 404 no painel (18/09). O
# standalone serve o que estiver em ./public na raiz do site.
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
