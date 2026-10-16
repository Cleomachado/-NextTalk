# Runbook — Subir WhatsApp (Evolution API) numa VPS Hostinger com Docker Swarm + Traefik + Cloudflare

> Passo a passo real executado para o ZapConverte em 19/07/2026. **Este documento é o rascunho da futura skill** "montar sistema de WhatsApp lite + API oficial com Cloudflare + domínio Hostinger + VPS Hostinger". Manter atualizado.

## Contexto / cenário

- **Domínio** registrado na Hostinger, **DNS gerenciado na Cloudflare**.
- **VPS Hostinger** (Ubuntu 24.04, KVM 2 / 8 GB) que **já roda outros serviços** (no caso, n8n) num **Docker Swarm** com **Traefik** como proxy reverso e **Portainer** de gestão. ⚠️ Não derrubar o que já existe.
- Objetivo: publicar o motor não-oficial (**Evolution API v2**) em `api.DOMINIO`, com HTTPS automático, **convivendo** com os serviços existentes.

## Princípio de ouro

**Diagnóstico ANTES de qualquer alteração.** Nunca rodar `docker compose up` / `stack deploy` sem antes mapear: portas 80/443 ocupadas, proxy reverso em uso, redes docker, stacks existentes. Foi isso que evitou derrubar o n8n.

---

## Fase A — Domínio e DNS (Cloudflare)

1. **Registrar o domínio** (Hostinger → Domínios) — ex.: `seudominio.com.br`. Esperar sair de "Registrando" para **Ativo**.
2. **Adicionar o domínio na Cloudflare** (Add a domain → plano Free). As políticas de AI/Search da tela de onboarding podem ficar no padrão.
3. **Copiar os 2 nameservers** que a Cloudflare designa (ex.: `leah.ns.cloudflare.com`, `lee.ns.cloudflare.com`).
4. **Trocar os nameservers na Hostinger:** Domínios → DNS/Nameservers → "Alterar nameservers" → colar os 2 da Cloudflare → salvar. Propagação: minutos a algumas horas.
5. **Criar o registro da API na Cloudflare:** DNS → Records → Add record:
   - Type **A** · Name **api** · IPv4 **IP_DA_VPS** · Proxy status **DNS only (nuvem CINZA)** · TTL Auto.
   - ⚠️ **Nuvem CINZA obrigatória no início** — o Traefik emite o certificado Let's Encrypt via desafio HTTP, que precisa alcançar a VPS diretamente. Com a nuvem laranja o desafio pode falhar. Ligar o proxy laranja só depois, com SSL/TLS em "Full (strict)".
6. **Verificar propagação** (no seu Mac):
   ```bash
   dig +short api.DOMINIO           # deve devolver o IP da VPS
   dig +short api.DOMINIO @NS_DA_CLOUDFLARE   # confirma direto na fonte
   ```

## Fase B — Acesso à VPS (SSH)

1. Conectar: `ssh root@IP_DA_VPS`.
2. Se aparecer **"REMOTE HOST IDENTIFICATION HAS CHANGED"** (VPS reinstalada / IP reciclado): limpar a chave antiga **no seu Mac** e reconectar:
   ```bash
   ssh-keygen -R IP_DA_VPS
   ssh root@IP_DA_VPS
   ```
3. Senha do **root da VPS** (≠ senha do Mac). Se não lembrar: hpanel → VPS → Gerenciar → Configurações/Acesso SSH → redefinir senha do root. Ao digitar a senha, **nada aparece na tela** (normal). Evitar colar senha (traz caractere invisível) — digitar.
4. Segurança pós-acesso: trocar a senha do root se ela vazou em tela/histórico; depois configurar **chave SSH** (login sem senha).

## Fase C — Diagnóstico (só leitura, não altera nada)

```bash
free -h && df -h /
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
ss -tlnp | grep -E ':80 |:443 ' || echo "80/443 LIVRES"
docker network ls
```

Se detectar **Swarm + Traefik** (nomes tipo `stack_serv.1.<hash>`, redes overlay, Traefik ocupando 80/443), extrair a config do Traefik e o padrão de um serviço já roteado para **espelhar**:

```bash
docker service inspect traefik_traefik --format '{{range .Spec.TaskTemplate.ContainerSpec.Args}}{{println .}}{{end}}'
docker service inspect NOME_SERVICO_EXISTENTE --format '{{range $k,$v := .Spec.Labels}}{{$k}}={{$v}}{{println}}{{end}}'
```

Anotar dos args do Traefik: **entrypoints** (ex. `web`/`websecure`), **nome do certresolver** (ex. `letsencryptresolver`), **rede de roteamento** (`--providers.docker.network`), e se `exposedbydefault=false`.

### Valores encontrados nesta VPS (ZapConverte)
- Entrypoints: `web` (:80, redirect → https) e `websecure` (:443).
- Certresolver: **`letsencryptresolver`** (ACME httpchallenge via entrypoint `web`).
- Rede de roteamento: **`traefik_public`** (overlay).
- `exposedbydefault=false` → exige `traefik.enable=true`.
- Padrão do n8n (espelhado): router em `websecure`, `tls.certresolver=letsencryptresolver`, `loadbalancer.server.port=<porta interna>`.

## Fase D — Deploy do motor (novo stack Swarm, isolado)

Regras que evitam quebrar tudo:
- **Não** subir Caddy/nginx próprio nas portas 80/443 (o Traefik já as ocupa). Deixar o **Traefik** rotear, via **labels**.
- Labels do Traefik em Swarm vão em **`deploy.labels`** (não no nível do serviço).
- Serviço em 2 redes (traefik_public + interna) → **`traefik.docker.network=traefik_public` é obrigatório** (senão o Traefik pega o IP da rede errada).
- `loadbalancer.server.port` = porta interna do app (Evolution = **8080**).
- Postgres/Redis próprios do stack (não acoplar aos do serviço existente).

Arquivo do stack: [`zapconverte-stack.yml`](zapconverte-stack.yml) (Evolution + postgres 15 + redis 7, rede externa `traefik_public` + rede `internal`, labels espelhando o n8n).

Deploy:
```bash
mkdir -p /opt/zapconverte && cd /opt/zapconverte
# criar o zapconverte-stack.yml (via heredoc ou Portainer)
docker stack deploy -c zapconverte-stack.yml zapconverte
```

Acompanhar subida:
```bash
docker stack services zapconverte           # REPLICAS deve virar 1/1
docker service logs -f zapconverte_evolution # esperar "HTTP - ON: 8080" e migrações do Prisma
```

## Fase E — Validação

```bash
curl -s https://api.DOMINIO/            # {"status":200,"message":"...working!","version":"2.3.7"}
```
- Manager visual: `https://api.DOMINIO/manager` → colar URL da API + AUTHENTICATION_API_KEY → criar instância → escanear QR.
- Primeiro teste de PTV/áudio: ver comandos no `DEPLOY.md`.

## Fase F — Endurecimento (depois de estável)

- Cloudflare: ligar **nuvem laranja** + SSL/TLS **Full (strict)** + trancar a origem aos IPs do Cloudflare (proteção DDoS). **Feito em 11/10/2026.** Passo a passo completo na seção 7.1 de `docs/GUIA-MONTAR-SISTEMA-WHATSAPP.md`.
- Backup diário do volume `zc_postgres_data` (cron `pg_dump`).
- Reaproveitar o mesmo Traefik para o **app do ZapConverte** (Fase 1 do PRD) e para o **site de vendas**, cada um num router/host próprio.

## Pendências observadas nesta VPS
- `*** System restart required ***` (atualização de kernel) — **não reiniciar sem avisar** (derruba n8n). Agendar janela.
- Rotacionar a senha do root (apareceu em tela/histórico durante o setup).

---

### Esqueleto da futura SKILL
1. Entradas: domínio, IP da VPS, subdomínio da API, se a VPS é zerada ou já tem Swarm/Traefik.
2. Ramo A (VPS zerada): usar o kit `deploy/` (compose + Caddy, HTTPS automático).
3. Ramo B (VPS com Swarm+Traefik, como esta): diagnóstico → espelhar entrypoints/certresolver → stack isolado com labels → `docker stack deploy`.
4. Camada oficial (WhatsApp Cloud API): não precisa de VPS (é hospedada pela Meta); a VPS só recebe os webhooks. Documentar no módulo M7 do PRD.
