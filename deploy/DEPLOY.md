# Deploy — Motor do ZapConverte na VPS Hostinger

Sobe a **Evolution API v2.3.7** (versão fixada de propósito — a 2.4.0 ainda é release candidate) + Postgres 15 + Redis 7 + **Caddy** (HTTPS automático via Let's Encrypt) com Docker Compose.

**Requisitos:** VPS com Ubuntu 22.04/24.04 e **mínimo 2 GB de RAM** (na Hostinger: KVM 2 em diante folga; KVM 1 de 4 GB serve pra começar). Um subdomínio apontado pra VPS (ex.: `api.seudominio.com.br`).

## 1. DNS (painel do domínio)

Crie um registro **A**: `api` → IP da VPS. (TTL baixo, 300s, ajuda nos testes.)

## 2. Na VPS (SSH)

```bash
ssh root@IP_DA_VPS

# Docker (uma linha, script oficial)
curl -fsSL https://get.docker.com | sh

# Firewall — só SSH e web
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

## 3. Subir o projeto

```bash
mkdir -p /opt/zapconverte && cd /opt/zapconverte
# Envie os arquivos desta pasta deploy/ (scp, SFTP ou copie e cole):
#   docker-compose.yml · Caddyfile · .env.example

cp .env.example .env
openssl rand -hex 32   # ← use o resultado como AUTHENTICATION_API_KEY
nano .env              # preencha SERVER_URL, AUTHENTICATION_API_KEY e as 2 ocorrências da senha do Postgres
nano Caddyfile         # troque api.SEUDOMINIO.com.br pelo subdomínio real

docker compose up -d
docker compose logs -f evolution-api   # esperar "HTTP - ON: 8080"
```

## 4. Testar

```bash
# Da sua máquina:
curl https://api.SEUDOMINIO.com.br/
# → {"status":200,"message":"Welcome to the Evolution API, it is working!","version":"2.3.7",...}
```

Manager web (interface visual pra criar instância e escanear QR):
`https://api.SEUDOMINIO.com.br/manager` → cole a URL da API e a `AUTHENTICATION_API_KEY`.

Criar instância via API (alternativa ao manager):

```bash
curl -X POST https://api.SEUDOMINIO.com.br/instance/create \
  -H "apikey: SUA_AUTHENTICATION_API_KEY" -H "Content-Type: application/json" \
  -d '{"instanceName":"principal","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'
# → escaneie o qrcode.base64 com o WhatsApp (Aparelhos conectados)
```

Primeiro teste de PTV e áudio (depois de conectado):

```bash
# Áudio de voz (PTT)
curl -X POST https://api.SEUDOMINIO.com.br/message/sendWhatsAppAudio/principal \
  -H "apikey: SUA_KEY" -H "Content-Type: application/json" \
  -d '{"number":"55DDDNUMERO","audio":"https://URL/audio.mp3","encoding":true,"delay":2000}'

# PTV (vídeo de bolinha) — vídeo quadrado e curto
curl -X POST https://api.SEUDOMINIO.com.br/message/sendPtv/principal \
  -H "apikey: SUA_KEY" -H "Content-Type: application/json" \
  -d '{"number":"55DDDNUMERO","video":"https://URL/video.mp4","delay":1500}'
```

## 5. Segurança e operação

- `AUTHENTICATION_API_KEY` forte (32 bytes hex) e fora do git.
- Portas 8080/5432/6379 **não** ficam expostas — só o Caddy (80/443) fala com o mundo.
- Backup: volume `postgres_data` (ex.: `docker exec oxizap-postgres-1 pg_dump -U oxizap evolution_db > backup.sql` no cron diário).
- Atualização: trocar a tag da imagem no compose → `docker compose pull && docker compose up -d`. **Nunca usar `latest`** (hoje aponta pra RC).
- Monitoramento simples: `docker compose ps` + o evento `CONNECTION_UPDATE` no webhook (Fase 1 do app).

## Próximo passo (Fase 1 do PRD)

O app do Oxi Zap (Next.js + filas) entra neste mesmo compose como serviços `app` e `worker`, e o webhook da Evolution aponta pra ele. O motor já fica pronto e testável desde já.

## Tech Provider — variáveis do "Conectar com a Meta em 1 clique"

O botão de conexão em 1 clique (Embedded Signup) só APARECE no painel quando as três variáveis
abaixo existem no serviço `app` (arquivo de stack do Swarm, que não vai pro git). Sem elas o painel
segue mostrando só o passo a passo manual — nada quebra.

```
META_APP_ID=            # id do app da Meta (público, vai pro navegador)
META_APP_SECRET=        # chave secreta do app (SÓ servidor; também valida a assinatura dos webhooks)
META_ES_CONFIG_ID=      # id da configuração do fluxo de cadastro (Embedded Signup)
```

Onde pegar: **developers.facebook.com → seu app → Configurações → Básico** (id e chave secreta) e
**WhatsApp → Cadastro incorporado** (configuração do fluxo → id da configuração).

Antes de funcionar de verdade, do lado da Meta: empresa verificada, política de privacidade
publicada, termos de Solution Provider aceitos e App Review aprovado (com vídeo do fluxo).
Enquanto o review não sai, o botão funciona para contas de teste/desenvolvedores do app.

Opcional, já suportado: `FLOW_MODEL` (modelo que monta os fluxos por IA; padrão `claude-sonnet-5`,
cai sozinho no `SUMMARY_MODEL` se a conta não tiver acesso).
