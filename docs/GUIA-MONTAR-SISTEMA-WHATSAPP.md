# Guia — Como montar seu próprio sistema de automação de WhatsApp

> Material didático baseado na construção real do **ZapConverte** (início em 18–19/07/2026, atualizado até 11/10/2026), do zero à produção. Serve para ensinar qualquer pessoa a montar a própria estrutura: recebe eventos de plataformas de venda → dispara WhatsApp (texto, áudio, PTV, grupos, marcar todos), rodando 24/7 numa VPS.

---

## 0. O que você vai construir (visão geral)

```
Plataforma de venda (Kiwify, Hotmart...)          WhatsApp do cliente
        │ webhook (compra, pix, carrinho...)              ▲
        ▼                                                 │ envia
┌──────────────────────────────┐        ┌────────────────────────────┐
│  SEU APP (na VPS, 24/7)       │  API   │  Motor de WhatsApp (UazAPI) │
│  • recebe e valida webhook    │───────▶│  • número conectado por QR │
│  • traduz p/ evento canônico  │        │  • texto/áudio/PTV/grupos  │
│  • motor de automação (passos)│◀───────│  • manda eventos de grupo  │
└──────────────────────────────┘ webhook └────────────────────────────┘
```

**Peças:**
1. **Domínio** (ex.: Hostinger) com **DNS na Cloudflare**.
2. **VPS** (ex.: Hostinger) rodando **Docker** (aqui usamos Swarm + Traefik, mas serve compose simples).
3. **Motor de WhatsApp**: uma API que conecta um número por QR code. Usamos a **UazAPI** (hospedada, paga). Alternativa self-host gratuita: **Evolution API**.
4. **Seu app**: um servidorzinho (Node/TypeScript) que recebe os webhooks das plataformas e chama o motor.

**Decisão-chave (por quê UazAPI e não a API oficial da Meta):** a API oficial não faz PTV (vídeo de bolinha), áudio humanizado nem entra em grupos. Para relacionamento/recuperação de venda, a via não-oficial (número comum por QR) faz tudo isso. A oficial fica para escala/transacional. Veja `docs/pesquisa/comparativo-apis-nao-oficiais.md`.

---

## 1. Domínio + Cloudflare

1. Registre o domínio (ex.: `seudominio.com.br`).
2. Adicione o domínio na **Cloudflare** (plano Free) → ela dá 2 nameservers.
3. Troque os nameservers no registrador (Hostinger) para os da Cloudflare.
4. Crie os registros que você vai usar, **sempre como A → IP da VPS**:
   - `api.seudominio.com.br` (se for self-host do motor)
   - `app.seudominio.com.br` (seu app)
   - ⚠️ **Nuvem CINZA (DNS only)** no começo. O proxy laranja atrapalha a emissão do certificado HTTPS (desafio HTTP do Let's Encrypt precisa alcançar a VPS direto). Ligue o laranja só depois de tudo estável, com SSL/TLS em "Full (strict)". **Esse passo é obrigatório:** é a proteção contra DDoS (ver seção 7.1).
5. Confirme com `dig +short app.seudominio.com.br` (deve devolver o IP da VPS).

---

## 2. VPS + Docker + Traefik

**Princípio de ouro: diagnóstico ANTES de mexer.** Nunca suba nada sem antes ver o que já roda (portas 80/443, proxy reverso, stacks). Foi isso que evitou derrubar um n8n que já rodava na mesma VPS.

```bash
ssh root@IP_DA_VPS
free -h && df -h /
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
ss -tlnp | grep -E ':80 |:443 '        # quem ocupa as portas web?
docker network ls
```

- **VPS zerada:** instale Docker (`curl -fsSL https://get.docker.com | sh`), abra o firewall (22/80/443) e use o kit `deploy/` (compose + Caddy, HTTPS automático).
- **VPS com Traefik/Swarm (como a nossa):** NÃO suba outro proxy nas portas 80/443. Descubra a config do Traefik e **espelhe** o padrão de um serviço que já funciona:
  ```bash
  docker service inspect traefik_traefik --format '{{range .Spec.TaskTemplate.ContainerSpec.Args}}{{println .}}{{end}}'
  docker service inspect NOME_SERVICO_EXISTENTE --format '{{range $k,$v := .Spec.Labels}}{{$k}}={{$v}}{{println}}{{end}}'
  ```
  Anote: nomes dos **entrypoints** (`web`/`websecure`), o **certresolver** (ex.: `letsencryptresolver`), a **rede** de roteamento (`traefik_public`), e se exige `traefik.enable=true`.

Detalhes de infra: `deploy/RUNBOOK-hostinger-swarm-traefik.md`.

---

## 3. Motor de WhatsApp (UazAPI)

1. Assine a UazAPI (uazapi.dev). Plano de entrada (2 dispositivos) serve para testar; em escala, o "Servidor PRO" sai ~R$0,65/número.
2. No painel: **Criar credenciais** → escolha um subdomínio → vira sua **Server URL** (`https://SEU-SUBDOMINIO.uazapi.com`).
3. Copie o **Admin Token** (chave-mestra do servidor — trate como senha).
4. **Nova Instância** → dê um nome → aparece a **Instance Token** (chave daquela conexão).
5. **Conectar** → escaneie o **QR code** com o WhatsApp do número (⚠️ use um **chip reserva**, não o principal — risco de ban).
6. Guarde: `Server URL` + `Instance Token`. É o que o app usa.

**Endpoints essenciais** (header `token: <instance token>`):
- Texto: `POST /send/text` `{ number, text, delay, mentions? }`
- Mídia/áudio/PTV: `POST /send/media` `{ number, type: "ptt"|"ptv"|"image"|..., file, delay }`
- Presença ("digitando/gravando"): `POST /message/presence`
- Grupos: `POST /group/info`, `/group/updateParticipants`, etc.
- Webhook: `POST /webhook` `{ enabled, url, events, excludeMessages }`

Mapa completo (139 endpoints) em `docs/pesquisa/botconversa-zapi-uazapi.md` e o cliente pronto em `app/api/src/uazapi/client.ts`.

---

## 4. O app (arquitetura)

Node + TypeScript, roda com `tsx` (sem build). Estrutura em `app/api/src/`:

- **`gateway/`** — interface neutra `WhatsAppGateway` + implementação `UazapiGateway`. **Regra de ouro:** o resto do sistema fala com a interface, nunca com a UazAPI direto. Assim, trocar de motor (UazAPI ↔ Evolution ↔ WAHA) é só criar outra implementação. Isso salva o projeto quando o WhatsApp muda o protocolo.
- **`uazapi/`** — cliente completo (todos os 139 endpoints), pra usar recursos avançados.
- **`webhooks/`** — recebe e **traduz** o webhook de cada plataforma para uma **taxonomia canônica** única (`purchase_approved`, `pix_generated`, `cart_abandoned`...). O motor só enxerga os nomes canônicos.
- **`engine/`** — o motor de automação: `evento → passos` (texto, áudio, PTV, esperar, marcar todos, add ao grupo), com **delay aleatório entre passos** (anti-ban).
- **`server.ts`** — Fastify: rota `POST /webhooks/:plataforma`, responde 200 rápido e processa em background.

**Variáveis nas mensagens:** `{{nome}}`, `{{primeiro_nome}}`, `{{produto}}`, `{{valor}}`, `{{link}}`, `{{pix}}`.

---

## 5. Integrar plataformas de venda

Cada plataforma manda o webhook num formato diferente. O trabalho é: (a) **validar a assinatura**, (b) **traduzir** para o evento canônico, (c) **normalizar o telefone** para E.164 (+55).

**Taxonomia canônica** (todas as plataformas mapeiam pra cá):
`purchase_approved`, `purchase_refused`, `pix_generated`, `boleto_generated`, `cart_abandoned`, `checkout_started`, `refund`, `chargeback`, `subscription_canceled`, `subscription_renewed`, `payment_delayed`.

Mapa por plataforma em `docs/pesquisa/webhooks-*.md`. Exemplo Kiwify validado com venda real em `docs/pesquisa/kiwify-payload-real.md`.

**Validação de assinatura (segurança):** cada plataforma assina o webhook. Ex. Kiwify: `HMAC-SHA1(corpo_bruto, token)` comparado ao `?signature=` da URL. ⚠️ Valide sobre o **corpo BRUTO** exatamente como recebido — re-serializar o JSON quebra a assinatura.

**Metodologia de teste (muito importante):** aponte o webhook para um capturador (ex.: webhook.site) OU faça o app **salvar os payloads brutos** num arquivo, dispare cada evento de teste da plataforma, e **valide o parser contra os dados reais**. Foi assim que descobrimos que o "carrinho abandonado" da Kiwify tem estrutura totalmente diferente (campos no topo, não em `Customer`).

---

## 6. Deploy (colocar no ar)

Empacote o app numa imagem Docker e rode na VPS.

- **`Dockerfile`** (`node:22-slim`, `npm install`, roda via `tsx`). Segredos vêm do ambiente do Docker, NÃO de um `.env` no container (`.dockerignore` exclui o `.env`).
- **Stack Swarm** (`deploy/zapconverte-app-stack.yml`): serviço na rede `traefik_public`, com **labels do Traefik** (em `deploy.labels`) roteando `app.seudominio.com.br` → app:3333, cert `letsencryptresolver`. ⚠️ Serviço em 2 redes exige `traefik.docker.network=traefik_public`.

Fluxo de deploy (single-node, sem registry):
```bash
# no Mac: empacotar (sem node_modules/.env) e enviar
tar --exclude=node_modules --exclude=.env -czf /tmp/app.tgz -C app api ...
scp /tmp/app.tgz root@IP:/opt/                    # aba do MAC

# na VPS:
tar xzf /opt/app.tgz -C /opt/meuapp
cd /opt/meuapp/api && docker build -t meuapp:latest .
cd /opt/meuapp && docker stack deploy --resolve-image never -c stack.yml meuapp
docker stack services meuapp                       # esperar REPLICAS 1/1
curl https://app.seudominio.com.br/health          # deve responder ok
```

**Atualizar depois:** reempacota, scp, `docker build`, `docker stack deploy` de novo (rolling update, sem downtime).

**Regras de deploy que aprendemos na prática:**
- **Tag única por deploy** (ex.: timestamp `20261009-162616`), nunca `:latest`. Sem registry, o Swarm com `:latest` pode continuar rodando a imagem ANTIGA mesmo mostrando `1/1`. No stack: `image: meuapp:${TAG}`. No comando: `TAG=$(date +%Y%m%d-%H%M%S) docker stack deploy --resolve-image never ...`.
- **O deploy só segue se o typecheck e o build passarem, conferido pelo exit code.** Não confie em `build | grep erro`: o pipe esconde a falha e deixa um build quebrado subir.
- **Antes do deploy, confira se não há disparo em andamento.** O restart do motor mata a fila no meio. A nossa trava é "nenhum template enviado nos últimos 3 minutos".
- **Variável de ambiente vai em 3 lugares:** `.env`, script de deploy e `stack.yml`. Só no `.env` ela não chega no contêiner (caso do login com Google, 23/08).
- **Janela de ~30 s com 404:** no modo stop-first, o painel sai antes de o novo entrar no Traefik. Para zerar, use `update_config: order: start-first` no serviço web.
- **Verifique o deploy por HTTPS, de fora.** Uma rota nova devolver 401 (existe, mas pede login) prova que a versão nova está no ar; 404 = ainda está o código antigo.
- **Cada deploy com mudança visível gera uma entrada de "Novidades"** escrita para o cliente. Cliente que não vê novidade acha que o produto parou.

### 6.1 O Claude faz o deploy por você (sem você digitar comando)

No começo, cada deploy era copiar comando, colar no terminal, digitar a senha da VPS duas vezes e torcer. Hoje eu só peço "sobe isso" e o Claude Code faz tudo sozinho. O segredo não é mágica: são **três peças**.

**1. O Claude Code roda no SEU computador, na pasta do projeto.**
Ele usa o seu terminal, então pode rodar `ssh`, `rsync`, `git` e o script de deploy. ⚠️ O Claude no navegador (claude.ai) ou o ChatGPT **não conseguem**: eles não têm acesso ao seu terminal nem às suas chaves. Tem que ser o Claude Code (terminal, VS Code ou app desktop) aberto na pasta do projeto.

**2. Uma chave SSH do seu computador autorizada na VPS (entra sem senha).**
```bash
ssh-keygen -t ed25519                  # cria a chave (Enter em tudo); fica em ~/.ssh/id_ed25519
ssh-copy-id root@IP_DA_VPS             # copia a chave pública pra VPS (pede a senha UMA última vez)
ssh root@IP_DA_VPS 'docker service ls' # teste: tem que entrar SEM pedir senha
```
Na Hostinger também dá pra colar a chave pública (`~/.ssh/id_ed25519.pub`) no hPanel, em "Chaves SSH" da VPS. Prompt pronto pro aluno: "Crie uma chave SSH no meu computador e me explique onde colar a chave pública no painel da Hostinger pra você acessar a minha VPS sem senha. Depois teste o acesso ao IP X com o usuário root."

**3. Um script de deploy que faz tudo num comando só (`deploy/deploy.sh`).**
O script: envia o código por `rsync` (sem `node_modules`), confere que o código novo chegou, gera as imagens com **tag única**, roda `docker stack deploy` e verifica por HTTPS se a versão nova respondeu. Os segredos ficam no `deploy/.env` (no computador e na VPS), nunca no código e nunca no chat. Com isso, o Claude só precisa rodar `bash deploy/deploy.sh`.

**O ritual que eu ensino o Claude a seguir em todo deploy** (vira regra na memória dele):
1. Typecheck e build passando, conferidos pelo **código de saída**.
2. **Commit** antes de publicar.
3. Conferir se **não tem disparo programado** pros próximos minutos (o deploy reinicia o motor e mataria a fila no meio).
4. `bash deploy/deploy.sh`.
5. Esperar ~35 s e **conferir por HTTPS, de fora**.
6. **Push pro GitHub** lendo o token do `.env` dentro do próprio comando, sem mostrar o token: `GT=$(grep '^GITHUB_TOKEN=' deploy/.env | cut -d= -f2-) && git push "https://x-access-token:${GT}@github.com/USUARIO/REPO.git" main`.
7. Mudança visível pro cliente → entrada nova em "Novidades".

**Atalho: deploy só do site (sem reiniciar o motor).** Mudou só página estática? Não precisa reiniciar o sistema, nem arriscar um disparo em andamento:
```bash
rsync -az --delete app/site/ root@IP:/opt/meuapp/app/site/ && ssh root@IP 'cd /opt/meuapp; TAG=$(date +%Y%m%d-%H%M%S); docker build -q -t meuapp-site:$TAG ./app/site && docker service update -q --image meuapp-site:$TAG meuapp_site'
```
Trocou uma imagem mantendo o mesmo nome? O Cloudflare guarda a antiga em cache: mude o endereço (`foto.jpg?v=2`).

**Cuidados que aprendemos:**
- **Duas conversas do Claude no mesmo projeto:** o deploy publica tudo o que está na pasta naquele momento, inclusive o que a outra conversa ainda não terminou. Só uma publica por vez, depois do commit da outra.
- **Comandos destrutivos ficam com você:** `git push --force`, `reset --hard` e apagar coisa na VPS o Claude não deve rodar por conta própria (o próprio Claude Code bloqueia vários deles). Ele te entrega o comando pronto e você roda.
- **Token nunca no chat.** Se você colar um token na conversa, o Claude manda trocar, e ele está certo: o token vazou no histórico e pra quem estava vendo a sua tela.

---

## 7. Segurança e anti-ban

- **Valide a assinatura** de todo webhook (senão qualquer um dispara mensagens no seu nome). Teste: POST sem assinatura deve dar **401**; com assinatura válida, **200**.
- **Segredos** (tokens) fora do git; em produção, via env do Docker (idealmente Docker secrets).
- **Anti-ban** (não-oficial viola os ToS do WhatsApp):
  - Chip reserva, nunca o principal;
  - **Aquecimento**: número novo começa com poucos envios/dia e escala aos poucos;
  - **Delays aleatórios** + presença "digitando/gravando" (nunca rajada fixa);
  - Enviar só para quem **interagiu/comprou** (lista fria = ban);
  - Monitorar `connection`/desconexão e **pausar a fila** se cair;
  - Transacional crítico pode ir pela **API oficial** da Meta (híbrido).

---

## 7.1 Proteção contra DDoS (Cloudflare na frente) — passo obrigatório

**O que é, em uma frase:** DDoS é alguém mandando milhões de acessos falsos ao mesmo tempo para o seu servidor engasgar e cair. Com a nuvem cinza, todo mundo bate direto na porta da VPS. Com a nuvem laranja, o Cloudflare vira o porteiro: recebe tudo primeiro, segura a multidão falsa e só repassa quem é de verdade. As URLs não mudam, nem as de webhook.

**Limite de tentativas no código (login, cadastro) NÃO segura DDoS.** Ele protege contra força bruta, mas num ataque de volume a VPS cai antes de a requisição chegar no código.

Faça **depois** que o sistema estiver estável e com certificado HTTPS válido. Se for possível, faça fora de horário de disparo. Ordem que fizemos no ZapConverte (11/10/2026), sem nada sair do ar:

1. **Crie um token de API no Cloudflare:** My Profile → API Tokens → Create Token → Custom.
   - Permissões:
     - Zone › DNS › Edit
     - Zone › Zone Settings › Edit
     - Zone › Zone › Read
     - **Zone › WAF › Edit** (sem ela não dá para criar a regra dos webhooks pela API)
   - Zona: só o seu domínio.
   - Guarde no `.env`, nunca no git.
2. **Confira o certificado de cada subdomínio:** `curl -s -o /dev/null -w "%{ssl_verify_result}" https://app.seudominio.com.br` tem que dar `0`.
   - Subdomínio sem serviço (com o certificado padrão do Traefik) **fica cinza**. Com o laranja ele dá erro 526.
3. **Configure antes de ligar o proxy.** Essas opções só valem para registros laranja, então não afetam nada que já está no ar:
   - SSL/TLS em **Full (strict)**;
   - TLS mínimo **1.2**;
   - **Bot Fight Mode DESLIGADO** (Security → Bots). Ele bloqueia os robôs da Meta, da UazAPI e da Kiwify, e não aceita exceção.
   - **Regra WAF "Skip"** para o caminho `/webhooks/*` e para o callback do login com Google. Webhook é robô, não passa em desafio "prove que é humano".
   - Enquanto a regra de Skip não existir, deixe o **Security Level em "Essentially off"**. A proteção DDoS automática do Cloudflare continua ligada, porque ela não depende desse nível.
4. **Ligue a nuvem laranja um subdomínio por vez, do menos para o mais crítico:**
   - site → painel → **app (webhooks) por último**;
   - depois de cada um, teste por HTTPS;
   - no `app.`, olhe o access-log do Traefik: os webhooks precisam continuar chegando com **200**.
   - **Voltar atrás = clicar a nuvem para cinza.** Leva segundos.
5. **Espere ~5 minutos.** Os servidores de webhook (UazAPI, Meta) guardam o IP antigo pelo tempo do TTL. No log, o IP de origem passa a ser do Cloudflare (`172.64–71.x`, `104.16–27.x`, `162.158.x`…).
6. **Feche a porta dos fundos.** O IP da VPS já é público, e sem esta trava o atacante pula o porteiro e bate direto no IP.
   - No Traefik, crie um middleware `ipallowlist` com os IPs oficiais do Cloudflare (lista em `https://api.cloudflare.com/client/v4/ips`) e aplique nos routers do seu sistema:
     ```yaml
     - traefik.http.middlewares.so_cloudflare.ipallowlist.sourcerange=173.245.48.0/20,103.21.244.0/22,...,2c0f:f248::/32
     - traefik.http.routers.meu_app.middlewares=so_cloudflare
     ```
   - Aplique **nos routers do seu sistema**, não no firewall geral da VPS. Se tiver n8n ou outros serviços na mesma VPS, o firewall geral derruba eles.
   - Com o Traefik publicando as portas em modo `host`, ele enxerga o IP real de quem conecta, que é o do Cloudflare.
   - Dá para aplicar na hora, sem reiniciar o serviço: `docker service update --label-add ...`. **Grave também no stack.yml**, senão o próximo deploy apaga.
   - Feche primeiro o `app.`, onde só chegam robôs. Painel e site, só quando o log não mostrar mais acesso direto: abas abertas no navegador seguram a conexão antiga por horas.
7. **IP real do visitante:** atrás do Cloudflare, quem conecta é o Cloudflare.
   - Leia o IP do visitante no header `CF-Connecting-IP`, senão o limite de login vira um limite único para todo mundo.
   - Esse header **só é confiável depois do passo 6**. Antes disso, qualquer um forja e dribla o limite de tentativas.

---

## 8. Lições reais (os bugs que pegamos)

1. **Path com espaço** ("Oxi Zap") quebra `loadEnvFile` — use `fileURLToPath`, não `.pathname`.
2. **`@lid` do WhatsApp**: participantes de grupo às vezes só expõem um ID de privacidade (`@lid`), não o telefone. Sempre pegue o telefone real do campo `PhoneNumber`; para marcar/mencionar, use telefone-ou-lid.
3. **Carrinho abandonado** costuma ter payload **diferente** dos outros eventos — teste cada evento separadamente.
4. **Status/stories** não geram evento de webhook na UazAPI (confirmado 2x). Nem toda funcionalidade existe — teste antes de prometer.
5. **Reiniciar o servidor durante um teste** faz perder webhooks (segundos fora do ar). Capture tudo com o pipeline estável.
6. **Validar a assinatura ANTES de ligar em produção**: conferimos que o HMAC batia com a assinatura real (contra payloads capturados) para não rejeitar webhooks legítimos e quebrar tudo.
7. **Vazamento entre clientes (multi-tenant, 30/09):** conversa de um cliente caía no painel do dono. Regras:
   - todo dado tem dono (`workspace_id`);
   - fluxo de cliente envia pela instância **dele**, nunca a principal;
   - na dúvida, **falha fechada** (não envia) em vez de cair no número padrão;
   - endpoint só do administrador, chamado pela tela do cliente, falha em silêncio: teste logado como cliente.
8. **"Modo teste" silencioso comeu 50 leads:** uma lista de permissão de números (só eles recebiam) ficou ligada e bloqueou todo o resto, sem aviso na tela nem log. Todo bloqueio tem que **aparecer** (aviso na tela + linha no log).
9. **Mensagem fantasma:** a conversa subia sem mensagem nenhuma, porque o motor enviava **texto vazio**. Guarda no envio: texto vazio nunca sai. E logue qual passo do fluxo gerou o vazio.
10. **Função que chama a si mesma (06/10):** uma troca global de nome no código deixou uma função recursiva. Os fluxos travaram em silêncio por ~45 min. Troca "procurar e substituir" no projeto inteiro só com typecheck, build e um teste real do fluxo depois.
11. **Vídeo de template cortado (erro 131053 da Meta):** o CapCut exporta HEVC sem "faststart" e arquivos grandes chegavam cortados em ~10 MB. Exporte em **H.264 com faststart** e barre o upload de vídeo cortado antes de virar template.
12. **Métricas por template ficaram 2 meses em "—":** a Graph API pagina os resultados, e cada ponto tem o próprio `template_id`. Siga **todas** as páginas e leia o id de cada ponto.
13. **Compras em dobro no Gerenciador (CAPI, 08/10):** o pixel da Kiwify e a nossa API de Conversões mandavam a mesma compra com `event_id` diferente, e a Meta não juntava. Escolha **uma** fonte para o Purchase (aqui, a Kiwify).
14. **A IA tem que se calar quando um humano entra:** se o dono responde pelo celular ou pelo WhatsApp Web, a IA pausa naquela conversa. O webhook diz a origem (`source`: `ios`/`android`/`web`), e o que o próprio sistema envia fica registrado para a IA não pausar por causa de si mesma. A saudação automática do WhatsApp Business (prefixo invisível U+200E) não conta como humano.
15. **Estado no servidor, não no navegador:** lido/não lido, pausas e agendamentos ficam no banco ou na UazAPI. `localStorage` só para preferência visual, senão cada aparelho mostra uma coisa.
16. **Não confie 100% no Gerenciador da Meta para medir lançamento** (Workshop, 10/10):
   - a Meta mostrou ROAS 0,35 e 15 compras;
   - a planilha da Kiwify com UTM mostrou 11 compradores de anúncio e ROAS real de ~3,5, contando o upsell vendido no pitch.
   - Meça pela UTM da plataforma de venda, dê **nome único a cada anúncio** (vai no `utm_content`) e ponha UTM até no link do pitch.
17. **O sistema rodou meses sem proteção contra DDoS** (nuvem cinza, IP exposto) e ninguém percebeu, porque não dá sinal até o dia do ataque. Ligamos o Cloudflare em 11/10/2026 seguindo a seção 7.1, sem nada sair do ar e sem perder nenhum webhook. Nessa revisão apareceu um furo extra: o painel confiava no header `CF-Connecting-IP` sem o Cloudflare estar na frente, então qualquer um podia forjar o IP e driblar o limite de login.

---

## 9. Recursos que valem copiar (construídos de 29/09 a 11/10/2026)

O que mais ajudou os clientes no dia a dia. Use como lista de ideias para o seu sistema.

**Atendimento (inbox):**
- botão "Pausar IA" por conversa, com prazo;
- campo de várias linhas (Enter envia, Shift+Enter quebra a linha);
- etiquetas no topo da conversa;
- mensagem agendada com faixa acima da caixa de texto, e aviso para alguém da equipe X minutos antes;
- nome de quem da equipe respondeu no balão;
- ligação de WhatsApp aparece como ligação (atendida, recusada ou perdida), não como "mídia";
- localização vira texto com link do Maps;
- vídeo vai como vídeo, com reserva para documento se o WhatsApp recusar, sem duplicar;
- ficha do contato com CPF/RG, endereço por CEP e documentos protegidos.

**Agente de IA:**
- espera o lead terminar de digitar (acumula as mensagens por X segundos);
- entende a mensagem que o lead marcou;
- mostra "digitando…" enquanto pensa;
- passa a fala do lead do agente de triagem para o especialista;
- guarda dados da conversa em variáveis;
- selo "Agente IA" / "Automação" em cada mensagem, para o dono saber quem respondeu.

**Fluxos e integrações:**
- Ler planilha do Google como lista para envio em massa;
- Planilha que atualiza a linha do lead pela coluna-chave (uma linha por lead);
- Google Contatos sem duplicar;
- ZapSign (assinaturas pendentes);
- Enviar e-mail (Resend por cliente, chave cifrada);
- variáveis `{{tags}}` e `{{dia_semana}}`;
- gatilho por resposta de template, que aceita uma lista de templates;
- mensagem vinda de outro número da mesma conta não dispara fluxo nem IA.

**API Oficial (Meta):**
- disparador em massa com prévia, mídia do topo trocável a cada campanha e variável `{{nome}}` que nunca vai vazia;
- métricas por template com cliques por botão e calendário de período;
- galeria de templates que mostra se o botão abre link ou volta como resposta.

**Rastreamento e vendas:**
- origem do lead pela página (UTM, gclid, wbraid/gbraid) gravada por um código invisível na mensagem;
- API de Conversões só com lead qualificado;
- recuperação de Pix e carrinho por e-mail, com QR Code e régua 0h / 2h / antes de vencer;
- menu Resumos: resumo da conversa, do grupo e relatório do período com IA, sobre números do banco, sem inventar causa.

**Infra:** Cloudflare na frente contra DDoS (seção 7.1).

---

## 10. Dashboard de Lançamento (construído em 18/10/2026)

Um painel só pra acompanhar um lançamento pago (evento ao vivo com ingresso barato, order bumps no checkout e uma oferta maior no pitch). Fica em `/lancamento`, só pra admin, com 4 abas.

**De onde vêm os números**

| Fonte | O que traz | Onde mora |
|---|---|---|
| Kiwify (webhook) | venda real, valor líquido, UTM, lote, forma de pagamento, nome | `kiwify_pedidos` + `events` |
| Meta Ads (Marketing API) | gasto, impressões, cliques, checkout, vídeo, por campanha e por anúncio, a cada 30 min | `ads_diario`, `ads_anuncio_diario`, `ads_criativos`, `ads_hora` |
| API do WhatsApp (pricing) | custo dos disparos e da recuperação | consulta na hora |
| Página de vendas | visitas e de qual página veio a venda (`src` = sessão) | `checkout_sessions` |
| Google Meet / Zoom / CSV | quem entrou na live, quando entrou e saiu | `lives`, `live_sessoes` |
| Digitado no painel | metas e comparecimento da turma | `ws_turmas` |

**Regra de ouro:** a venda REAL (Kiwify) vence a atribuição da Meta. ROAS, CPA e CAC são calculados com o líquido que caiu, e o número da Meta aparece só ao lado, pra comparar.

**As 4 abas**
1. **Visão geral:** faixa de alerta (dias pro evento e vendas que faltam pra meta), fases da turma, progresso diário com meta e projeção, ROAS geral (tudo que entrou ÷ anúncio + disparos), esteira (principal, bumps, pitch), Pix × cartão, lote, página de vendas, gráficos por hora (filtro de 1 dia) ou por dia, métricas da Meta coloridas por faixa de referência, metas e comparecimento.
2. **Métricas da live:** presença minuto a minuto, pitch e marcos marcados à mão, quem estava no pitch, conversão da live, participantes × compradores, links da call e da gravação.
3. **Ranking de criativos:** cada anúncio com investido, vendas reais, taxa de conversão, CAC e ROAS. A miniatura abre o criativo na Meta.
4. **Kanban de vendas:** cada lead na coluna do passo mais avançado (carrinho → pagamento pendente → ingresso → bump → oferta do pitch → reembolso). Recarrega a cada 30 s, então o card anda sozinho quando chega evento.

**Pra configurar o seu**
1. **Seus produtos:** edite `app/web/src/lib/workshop-esteira.ts` (nomes, papel na esteira, preço, código do checkout) e a função `etapaDoProduto`, que reconhece o produto pelo nome que a Kiwify manda.
2. **Token da Meta:** Gerenciador de Negócios → Usuários do sistema → atribua a CONTA DE ANÚNCIOS (controle total) e o pixel → Gerar token (expiração Nunca; `ads_read`, `ads_management`, `read_insights`, `business_management`) → cole em Integrações → Meta Ads.
3. **Google Meet:** ative a Google Meet REST API e a Google Calendar API no projeto do login Google; adicione os escopos `https://www.googleapis.com/auth/meetings.space.readonly` e `https://www.googleapis.com/auth/calendar.events.readonly` (endereço COMPLETO); conecte a conta que CRIA a reunião.
4. **Nos anúncios:** parâmetros de URL `utm_content={{ad.name}}&ad_id={{ad.id}}`. Sem o `ad_id`, anúncios com o mesmo nome se confundem no ranking.

**Lições reais deste dia**
- **ID errado = "sem permissão":** o campo da conta de anúncios aceitava o ID do PORTFÓLIO (o `business_id` da barra de endereço). A Meta respondia "o dono da conta não deu permissão" por dias, sem ninguém ver. Agora o dashboard mostra a recusa da Meta em vermelho.
- **API mudou:** o `?ids=a,b,c` da Graph foi desativado (v26+). As miniaturas passaram a vir de `/{conta}/ads` com filtro de id.
- **CSP silenciosa:** a regra de segurança do site bloqueava o GA4 (`analytics.google.com`, sem subdomínio) e a conversão do Google Ads (`ad.doubleclick.net`). Teste com navegador limpo, listando as requisições `collect`.
- **Gráfico em SVG com viewBox fixo** cresce junto com a tela e ignora o zoom. Meça a largura real (ResizeObserver) e use altura em px.
- **Meet gratuito corta a chamada a cada 1 h:** o mesmo link no mesmo dia vira várias "conferências". Junte por link + dia.
- **Venda antes de existir o registro:** quando falta a forma de pagamento, um Pix gerado pelo mesmo telefone até 3 h antes da compra = Pix. Quando falta a página, uma visita com a mesma campanha + criativo até 90 min antes = aquela página. Deduzir na leitura, sem reescrever o banco.
- **Compras de teste do dono contaminam a turma:** exclua o seu número das contas.

## Referências no projeto
- `PRD.md` — o produto completo.
- `docs/pesquisa/` — API não-oficiais, Cloud API, UazAPI (endpoints + eventos), webhooks das plataformas, payload real da Kiwify.
- `deploy/` — Dockerfile, stacks, runbook de infra.
- `app/api/` — o código do app (gateway, cliente UazAPI, webhooks, motor).
