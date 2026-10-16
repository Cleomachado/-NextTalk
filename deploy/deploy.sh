#!/usr/bin/env bash
# Deploy do ZapConverte (motor + painel + site) na VPS Hostinger (Swarm + Traefik).
#
# RODA NO SEU MAC. Faz:
#   1. Sincroniza o código pra VPS (rsync, sem node_modules/.next).
#   2. Confere que o código novo chegou, reconstrói as imagens com TAG ÚNICA (timestamp).
#   3. Publica no Swarm com essa tag (--resolve-image never) → Swarm SEMPRE rola pra versão nova.
#   4. Auto-verifica pela HTTPS se o motor novo respondeu.
#
# Por que tag única? Com ":latest" fixa o Swarm não troca a imagem de forma confiável
# (não há registry pra resolver o digest). Tag nova por deploy resolve isso de vez.
#
# Uso:   bash deploy/deploy.sh
# Pede a senha do root da VPS 2x (rsync + ssh). Pra não pedir: ssh-copy-id root@SEU_IP_DA_VPS
set -euo pipefail

VPS="root@SEU_IP_DA_VPS"
REMOTE="/opt/zapconverte"
MOTOR="https://app.seudominio.com.br"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ 1/3  Enviando código pra VPS ($REMOTE)…"
ssh "$VPS" "mkdir -p $REMOTE"
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude '.DS_Store' --exclude '*.log' --exclude dist \
  "$HERE/app" "$HERE/deploy" "$VPS:$REMOTE/"

echo "▶ 2/3  Reconstruindo (tag única) e publicando no Swarm…"
ssh "$VPS" bash -s <<'REMOTE_CMDS'
set -euo pipefail
cd /opt/zapconverte
# Sanidade: confirma que o código novo REALMENTE chegou (senão o build usaria o antigo).
grep -q "admin/groups" app/api/src/server.ts || { echo "❌ código novo não chegou na VPS (rsync falhou) — abortei"; exit 1; }
TAG=$(date +%Y%m%d-%H%M%S)
echo "· tag do deploy: $TAG"
echo "· build motor…"  && docker build -t zapconverte-api:$TAG  -t zapconverte-api:latest  ./app/api
echo "· build painel…" && docker build -t zapconverte-web:$TAG  -t zapconverte-web:latest  ./app/web
echo "· build site…"   && docker build -t zapconverte-site:$TAG -t zapconverte-site:latest ./app/site
# Segredos do .env (ficam FORA do yml): injeta na substituição do compose.
export UAZAPI_ADMIN_TOKEN="$(grep -E '^UAZAPI_ADMIN_TOKEN=' deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//')"
[ -n "$UAZAPI_ADMIN_TOKEN" ] && echo "· UAZAPI_ADMIN_TOKEN carregado do .env" || echo "· (aviso) UAZAPI_ADMIN_TOKEN vazio — conexão LITE por QR não vai funcionar até preencher deploy/.env"
export OPENAI_API_KEY="$(grep -E '^OPENAI_API_KEY=' deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//')"
[ -n "$OPENAI_API_KEY" ] && echo "· OPENAI_API_KEY carregada do .env" || echo "· (aviso) OPENAI_API_KEY vazia — o nó Perguntar (IA) salva a resposta CRUA (sem extração)"
export ADMIN_PASSWORD="$(grep -E '^ADMIN_PASSWORD=' deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//')"
[ -n "$ADMIN_PASSWORD" ] && echo "· ADMIN_PASSWORD carregada do .env (admin será semeado)" || echo "· (aviso) ADMIN_PASSWORD vazia — o dono NÃO consegue entrar como admin até preencher deploy/.env"
export ZAPCONVERTE_PRODUCT_IDS="$(grep -E '^ZAPCONVERTE_PRODUCT_IDS=' deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//')"
[ -n "$ZAPCONVERTE_PRODUCT_IDS" ] && echo "· ZAPCONVERTE_PRODUCT_IDS carregado do .env" || echo "· (aviso) ZAPCONVERTE_PRODUCT_IDS vazio — ativacao por VALOR (>= R\$60). Configure os IDs dos produtos ZapConverte."
export RESEND_API_KEY="$(grep -E '^RESEND_API_KEY=' deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//')"
export MAIL_FROM="$(grep -E '^MAIL_FROM=' deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//')"
[ -n "$RESEND_API_KEY" ] && echo "· RESEND_API_KEY carregada do .env (email de acesso ligado)" || echo "· (aviso) RESEND_API_KEY vazia — cliente recebe acesso SÓ por WhatsApp (email desligado). Configure no deploy/.env."
export ZC_ENCRYPTION_KEY="$(grep -E '^ZC_ENCRYPTION_KEY=' deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//')"
[ -n "$ZC_ENCRYPTION_KEY" ] && echo "· ZC_ENCRYPTION_KEY carregada do .env (cripto dos segredos de cliente)" || echo "· (aviso) ZC_ENCRYPTION_KEY vazia — a cripto cai no admin-token (se ele rotacionar, chaves OpenAI salvas se perdem)"
export TRIAL_WEBHOOK_TOKEN="$(grep -E '^TRIAL_WEBHOOK_TOKEN=' deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//')"
[ -n "$TRIAL_WEBHOOK_TOKEN" ] && echo "· TRIAL_WEBHOOK_TOKEN carregado (webhook de teste grátis LIGADO)" || echo "· (aviso) TRIAL_WEBHOOK_TOKEN vazio — /webhooks/trial fica desligado (503)"
export OPS_TOKEN="$(grep -E '^OPS_TOKEN=' deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//')"
[ -n "$OPS_TOKEN" ] && echo "· OPS_TOKEN carregado (/ops/dossie LIGADO — consulta de contato, só leitura)" || echo "· (aviso) OPS_TOKEN vazio — /ops/dossie fica desligado (503)"
# Google Contatos (OAuth por usuário). Sem as duas, o card de Integrações fica desligado e o nó
# "Google Contatos" dos fluxos não salva nada. O app OAuth é ÚNICO da plataforma: o cliente só
# clica e autoriza — ver docs/google-contatos-setup.md.
for v in GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET GOOGLE_OAUTH_REDIRECT; do
  export "$v=$(grep -E "^$v=" deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//; s/^<//; s/>$//')"
done
[ -n "$GOOGLE_OAUTH_CLIENT_ID" ] && [ -n "$GOOGLE_OAUTH_CLIENT_SECRET" ] && echo "· Google OAuth carregado (conector Google Contatos LIGADO)" || echo "· (aviso) GOOGLE_OAUTH_CLIENT_ID/SECRET vazios — o card Google Contatos fica desligado"
# Meta Ads (métricas de campanha): reserva do token do usuário do sistema pro workspace PRINCIPAL.
# O salvo em Integrações → Meta Ads sempre vence; este só entra quando lá está vazio.
for v in META_ADS_TOKEN META_ADS_ACT_ID; do
  export "$v=$(grep -E "^$v=" deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//; s/^<//; s/>$//')"
done
[ -n "$META_ADS_TOKEN" ] && echo "· META_ADS_TOKEN carregado do .env (Dashboard/relatório puxam a Meta)" || echo "· (info) META_ADS_TOKEN vazio — o Meta Ads usa só o que estiver em Integrações"
for v in META_PIXEL_ID META_CAPI_TOKEN META_TEST_EVENT; do
  export "$v=$(grep -E "^$v=" deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//')"
done
[ -n "$META_PIXEL_ID" ] && [ -n "$META_CAPI_TOKEN" ] && echo "· Meta CAPI ligada (venda aprovada vira conversão no Gerenciador de Anúncios)" || echo "· (aviso) META_PIXEL_ID/META_CAPI_TOKEN vazios — o Meta NÃO recebe as vendas (anúncio otimiza no escuro)"
export LGU_LEAD_WEBHOOK_URL="$(grep -E '^LGU_LEAD_WEBHOOK_URL=' deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//')"
[ -n "$LGU_LEAD_WEBHOOK_URL" ] && echo "· LGU_LEAD_WEBHOOK_URL carregada (fluxo de lead do Sua Empresa já nasce configurado)"
export ADMIN_2FA_RESET="$(grep -E '^ADMIN_2FA_RESET=' deploy/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//')"
[ "$ADMIN_2FA_RESET" = "1" ] && echo "· ⚠️ ADMIN_2FA_RESET=1 — o boot vai DESLIGAR o 2FA do admin (remova a flag depois)"
echo "· stack deploy (ZC_TAG=$TAG)…"
ZC_TAG=$TAG docker stack deploy --resolve-image never -c deploy/zapconverte-app-stack.yml zapconverte-app
docker stack services zapconverte-app
# Confirma que a VERSÃO NOVA respondeu (o /health devolve a tag do deploy). Sem isto, um deploy
# que morre no meio passa despercebido e a gente caça bug num código que nem está no ar.
echo "· conferindo se a versão $TAG entrou no ar…"
for i in $(seq 1 30); do
  # A porta 3333 só existe DENTRO do contêiner: no host este curl dava exit 7 na 1ª tentativa e,
  # com `set -e`, abortava o script ANTES do auto-teste de segurança (visto em 30/09). O /health
  # público via Traefik é o que prova que a versão nova está de fato atendendo.
  # `|| true`: sob `set -e -o pipefail`, um soluço do curl (timeout=28, conexão=7) dentro do $( )
  # abortava o script inteiro no meio do loop — o deploy já tinha acontecido, mas o auto-teste de
  # segurança nunca rodava (30/09: exit 7 no 1º deploy, exit 28 no 3º). O loop trata o vazio.
  v=$( (curl -sS -m 8 https://app.seudominio.com.br/health 2>/dev/null || true) | sed -nE 's/.*"versao":"([^"]*)".*/\1/p')
  [ "$v" = "$TAG" ] && { echo "  ✅ no ar: versão $TAG"; break; }
  [ $i -eq 30 ] && echo "  ⚠️  o motor ainda responde a versão '${v:-?}' (esperado $TAG) — o deploy pode não ter trocado. Rode de novo e confira."
  sleep 2
done
REMOTE_CMDS

echo "▶ 3/3  Verificando o motor novo pela HTTPS…"
ok=""
for i in 1 2 3 4 5 6; do
  sleep 6
  # /admin/groups SEM token: 401 = rota nova existe (deploy OK) · 404 = ainda no código antigo
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$MOTOR/admin/groups" || echo "000")
  echo "   tentativa $i: /admin/groups → HTTP $code"
  if [ "$code" = "401" ]; then ok="1"; break; fi
done
if [ -n "$ok" ]; then
  echo "✅ Deploy no ar (motor com a versão nova). Verifique em https://painel.seudominio.com.br"
else
  echo "⚠️  O motor ainda respondeu 404/erro — a versão nova pode não ter subido. Me avise pra investigar."
fi

echo "▶ 🔒 Auto-teste de SEGURANÇA (sessão de trial NÃO pode ler dados de admin)…"
# Cria uma conta de trial descartável e confirma que o MOTOR a barra (403) nas rotas /admin/*.
# Se isto passar 200, um cliente conseguiria ver o painel do admin — NÃO libere ninguém.
# best-effort: nunca aborta o deploy (já concluído) por um curl trêmulo.
set +e
# O motor compara `x-admin-token` com ADMIN_TOKEN — o grep antigo lia UAZAPI_TOKEN, então o
# auto-teste mandava um token errado e "passava" (403) por engano: um falso positivo por construção.
ADMINTOKEN="$(grep -E '^\s*ADMIN_TOKEN:' "$HERE/deploy/zapconverte-app-stack.yml" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')"
STEMAIL="selftest_$(date +%s)@zc-selftest.local"
STOK="$(curl -s --max-time 20 -X POST "$MOTOR/auth/signup" -H 'content-type: application/json' \
  -d "{\"name\":\"selftest\",\"email\":\"$STEMAIL\",\"password\":\"selftest12345\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))' 2>/dev/null)"
if [ -z "$STOK" ]; then
  echo "   (não deu pra criar conta de teste — pulei o auto-teste; verifique manualmente)"
else
  scode=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 \
    -H "x-admin-token: $ADMINTOKEN" -H "x-session-token: $STOK" "$MOTOR/admin/stats")
  if [ "$scode" = "403" ]; then
    echo "   ✅ blindagem OK — sessão de trial barrada no motor (HTTP 403)."
  elif [ -z "$scode" ] || [ "$scode" = "000" ]; then
    echo "   (auto-teste inconclusivo — motor não respondeu a tempo; verifique manualmente)"
  else
    echo "   🚨🚨 FALHA DE SEGURANCA: sessao de trial leu /admin/stats (HTTP $scode). NAO libere clientes — me avise AGORA."
  fi
fi
set -e
