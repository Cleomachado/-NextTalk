import pg from "pg";

// Se DATABASE_URL existir, usa Postgres; senão, o app roda com fallback em memória
// (útil no dev local). Em produção, o Postgres vem no stack.
const url = process.env.DATABASE_URL;
export const dbEnabled = Boolean(url);

export const pool = dbEnabled ? new pg.Pool({ connectionString: url, max: 5 }) : null;

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  if (!pool) return [];
  const res = await pool.query(text, params);
  return res.rows as T[];
}

// Cria as tabelas (idempotente). Roda no boot.
export async function initSchema(): Promise<void> {
  if (!pool) {
    console.log("⚠️  sem DATABASE_URL — rodando com persistência em memória");
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      phone       TEXT PRIMARY KEY,
      name        TEXT,
      platform    TEXT,
      opted_out   BOOLEAN NOT NULL DEFAULT FALSE,
      first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS events (
      id          BIGSERIAL PRIMARY KEY,
      phone       TEXT,
      platform    TEXT,
      event       TEXT,
      product     TEXT,
      amount      NUMERIC,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS webhook_dedup (
      key         TEXT PRIMARY KEY,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sent_messages (
      id          BIGSERIAL PRIMARY KEY,
      phone       TEXT,
      kind        TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS group_messages (
      id          BIGSERIAL PRIMARY KEY,
      group_jid   TEXT NOT NULL,
      sender_name TEXT,
      text        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_group_messages_jid_ts
      ON group_messages(group_jid, created_at);
    -- ARQUIVO PRÓPRIO DAS CONVERSAS (06/08): a UazAPI só guarda o que passou por ela desde que a
    -- instância conectou (medido: ~1 semana / 92 msgs num grupo ativo) e ZERA se reconectar. Aqui o
    -- histórico é NOSSO: alimentado pelo webhook (tempo real) e por cada abertura de conversa.
    CREATE TABLE IF NOT EXISTS inbox_messages (
      workspace_id TEXT NOT NULL,
      account      TEXT NOT NULL DEFAULT 'lite', -- conta/instância que recebeu (id lite-xxxx)
      chat_id      TEXT NOT NULL,                -- JID da conversa (…@s.whatsapp.net / …@g.us)
      msg_id       TEXT NOT NULL,                -- messageid curto (chave de dedup)
      mid          TEXT,                         -- id completo (owner:ID) p/ baixar mídia
      from_me      BOOLEAN NOT NULL DEFAULT false,
      sender_name  TEXT,
      body         TEXT NOT NULL DEFAULT '',
      msg_type     TEXT,
      ts           BIGINT,                       -- messageTimestamp (segundos)
      extra        JSONB NOT NULL DEFAULT '{}'::jsonb, -- waveform, duração, arquivo, botões…
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, msg_id)
    );
    CREATE INDEX IF NOT EXISTS idx_inbox_msgs_chat
      ON inbox_messages(workspace_id, chat_id, ts DESC);

    -- Contadores DIÁRIOS da API Oficial, alimentados pelos webhooks de STATUS da Meta
    -- (sent/delivered/read/failed). É o que dá "Entregues/Lidas/Taxa de entrega" REAIS na página
    -- Métricas — a Graph só devolve enviadas/entregues agregadas, LIDAS só a gente contando.
    CREATE TABLE IF NOT EXISTS meta_stats (
      workspace_id TEXT NOT NULL,
      dia          DATE NOT NULL,
      phone_id     TEXT NOT NULL,                 -- phone_number_id do número oficial
      enviadas     INT  NOT NULL DEFAULT 0,
      entregues    INT  NOT NULL DEFAULT 0,
      lidas        INT  NOT NULL DEFAULT 0,
      falhas       INT  NOT NULL DEFAULT 0,
      PRIMARY KEY (workspace_id, dia, phone_id)
    );
    CREATE TABLE IF NOT EXISTS flow_node_hits (
      id            BIGSERIAL PRIMARY KEY,
      automation_id TEXT NOT NULL,
      node_id       TEXT NOT NULL,
      phone         TEXT NOT NULL,
      ran_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_flow_node_hits_auto_ts
      ON flow_node_hits(automation_id, ran_at);
    -- Conversa PAUSADA esperando resposta (nó "perguntar"): 1 pendência por telefone.
    CREATE TABLE IF NOT EXISTS flow_pending (
      phone         TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL,
      next_index    INT NOT NULL,
      variable      TEXT NOT NULL,
      hint          TEXT,
      node_id       TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE flow_pending ADD COLUMN IF NOT EXISTS node_id TEXT;
    -- CÓDIGO do produto (não só o nome): o nó "Consulta de pagamento" filtra por código OU nome,
    -- e o nome muda quando o dono renomeia a oferta na plataforma — o código não.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS product_id TEXT;
    -- A consulta é "esta pessoa pagou este produto?" → índice por (ws, telefone, evento).
    CREATE INDEX IF NOT EXISTS idx_events_ws_phone_event ON events(workspace_id, phone, event);
    -- Conversa ATIVA com o Agente IA: histórico + turnos + caminhos já entregues (1 por telefone).
    CREATE TABLE IF NOT EXISTS agent_sessions (
      phone         TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL,
      next_index    INT NOT NULL,
      node_id       TEXT,
      turns         INT NOT NULL DEFAULT 0,
      history       JSONB NOT NULL DEFAULT '[]',
      delivered     JSONB NOT NULL DEFAULT '[]',
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS node_id TEXT;
    -- Campos personalizados por contato (o que a IA capturou das respostas).
    CREATE TABLE IF NOT EXISTS contact_fields (
      phone       TEXT NOT NULL,
      field       TEXT NOT NULL,
      value       TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (phone, field)
    );
    -- Tags/etiquetas de contato (ex.: importação de grupo). Um contato pode ter várias.
    CREATE TABLE IF NOT EXISTS contact_tags (
      workspace_id TEXT,
      phone        TEXT NOT NULL,
      tag          TEXT NOT NULL,
      source       TEXT, -- 'group-import' etc (de onde a tag veio)
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Clique no botão de WhatsApp da PÁGINA do cliente (UTM/gclid), casado com a 1ª mensagem pelo
    -- código invisível (engine/clique-origem.ts, 06/10).
    CREATE TABLE IF NOT EXISTS lead_clicks (
      workspace_id TEXT NOT NULL,
      codigo       TEXT NOT NULL,
      dados        JSONB NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      usado_em     TIMESTAMPTZ,
      phone        TEXT,
      PRIMARY KEY (workspace_id, codigo)
    );
    -- Mídia hospedada (upload do builder). Guardamos os bytes e servimos por URL, pra NÃO
    -- inflar a config dos fluxos com base64 (o que estourava o "Payload Too Large" ao salvar).
    CREATE TABLE IF NOT EXISTS media (
      id          TEXT PRIMARY KEY,
      mime        TEXT NOT NULL,
      data        BYTEA NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- ── Fundação SaaS: contas, sessões, workspaces, cupons, afiliados, comissões ──
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      pass_hash   TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'user',      -- 'admin' | 'user'
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id            TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      name          TEXT NOT NULL,
      plan          TEXT,                             -- 'start' | 'pro' | 'escala' | NULL
      status        TEXT NOT NULL DEFAULT 'trial',    -- 'trial' | 'active' | 'canceled'
      trial_ends_at TIMESTAMPTZ,
      paid_until    TIMESTAMPTZ,
      referred_by   TEXT,                             -- affiliates.id (atribuição do ?ref)
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS coupons (
      code        TEXT PRIMARY KEY,                   -- salvo em MAIÚSCULAS
      trial_days  INT NOT NULL,
      max_uses    INT,                                -- NULL = ilimitado
      uses        INT NOT NULL DEFAULT 0,
      expires_at  TIMESTAMPTZ,                        -- NULL = sem validade
      active      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      coupon_code  TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      redeemed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (coupon_code, workspace_id)         -- 1 uso por workspace por cupom
    );
    CREATE TABLE IF NOT EXISTS affiliates (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT,
      phone       TEXT,
      instagram   TEXT,
      kind        TEXT NOT NULL DEFAULT 'afiliado',   -- 'afiliado' | 'parceiro'
      ref_code    TEXT UNIQUE NOT NULL,
      commission_pct NUMERIC NOT NULL DEFAULT 30,
      active      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS commissions (
      id           TEXT PRIMARY KEY,
      affiliate_id TEXT NOT NULL,
      workspace_id TEXT,
      order_id     TEXT,                              -- id do pedido Kiwify (idempotência + estorno)
      amount       NUMERIC NOT NULL,                  -- valor da comissão (R$)
      sale_amount  NUMERIC,                           -- valor da venda que gerou
      plan         TEXT,
      status       TEXT NOT NULL DEFAULT 'pendente',  -- 'pendente' | 'pago' | 'estornado'
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      paid_at      TIMESTAMPTZ
    );
    ALTER TABLE commissions ADD COLUMN IF NOT EXISTS order_id TEXT;
    -- 1 comissão por pedido: retry do webhook Kiwify não duplica (order_id NULL fica de fora).
    CREATE UNIQUE INDEX IF NOT EXISTS commissions_order_uniq ON commissions(order_id) WHERE order_id IS NOT NULL;
    -- DISPAROS FEITOS POR FLUXO (passo Loop): 1 linha por execução, pra tela "Em andamento" mostrar o
    -- progresso, as métricas e deixar PAUSAR (os envios restantes moram em flow_jobs).
    CREATE TABLE IF NOT EXISTS disparos_fluxo (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL,
      automation_id TEXT NOT NULL,
      nome          TEXT,
      total         INT NOT NULL DEFAULT 0,
      intervalo_ms  INT NOT NULL DEFAULT 8000,
      templates     TEXT[] NOT NULL DEFAULT '{}',
      inicio        TIMESTAMPTZ NOT NULL DEFAULT now(),
      pausado       BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE INDEX IF NOT EXISTS disparos_fluxo_ws ON disparos_fluxo(workspace_id, inicio DESC);

    -- EVENTOS MANDADOS À META pela CAPI DE MENSAGENS (etiquetas da Meta no chat): 1 linha por
    -- tentativa, com o resultado. A Meta NÃO deduplica — é esta tabela que impede a mesma conversa
    -- virar duas conversões.
    CREATE TABLE IF NOT EXISTS capi_eventos (
      id           BIGSERIAL PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      phone        TEXT NOT NULL,
      evento       TEXT NOT NULL,
      valor        NUMERIC,
      ctwa_clid    TEXT,
      dataset_id   TEXT,
      status       TEXT NOT NULL,
      detalhe      TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS capi_eventos_ws ON capi_eventos(workspace_id, phone, evento);

    -- 📣 Liga cada job à EXECUÇÃO do disparo (disparos_fluxo.id): pausar/retomar/parar e o
    -- progresso da tela "Em andamento" passam a enxergar SÓ o lote certo (antes era por
    -- automation_id e lotes do mesmo fluxo se misturavam — bug 13/10).
    ALTER TABLE flow_jobs ADD COLUMN IF NOT EXISTS disparo_id TEXT;
    CREATE INDEX IF NOT EXISTS flow_jobs_disparo ON flow_jobs(workspace_id, disparo_id, status);

    -- 📊 MÉTRICAS DIÁRIAS POR CAMPANHA (Meta Ads) — base do Dashboard de Lançamento. Chave por NOME
    -- da campanha: o CSV exportado do Gerenciador não traz id, e a sincronização pela API
    -- sobrescreve a mesma linha quando entra (fonte vira 'api').
    CREATE TABLE IF NOT EXISTS ads_diario (
      workspace_id TEXT NOT NULL,
      data         DATE NOT NULL,
      campanha     TEXT NOT NULL,
      campanha_id  TEXT,
      objetivo     TEXT,
      gasto        NUMERIC NOT NULL DEFAULT 0,
      impressoes   INT NOT NULL DEFAULT 0,
      alcance      INT NOT NULL DEFAULT 0,
      ctr_link     NUMERIC,
      lpv          INT NOT NULL DEFAULT 0,
      ic           INT NOT NULL DEFAULT 0,
      compras      INT NOT NULL DEFAULT 0,
      valor        NUMERIC NOT NULL DEFAULT 0,
      conversas    INT NOT NULL DEFAULT 0,
      fonte        TEXT NOT NULL DEFAULT 'api',
      atualizado   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, data, campanha)
    );
    -- Funil completo por turma (18/10): cliques no link, vídeo 3 s (hook) e ThruPlay (hold).
    ALTER TABLE ads_diario ADD COLUMN IF NOT EXISTS cliques  INT NOT NULL DEFAULT 0;
    ALTER TABLE ads_diario ADD COLUMN IF NOT EXISTS video_3s INT NOT NULL DEFAULT 0;
    ALTER TABLE ads_diario ADD COLUMN IF NOT EXISTS thruplay INT NOT NULL DEFAULT 0;

    -- 🎟️ TURMAS DO WORKSHOP (Dashboard de Lançamento, 18/10): o que a Kiwify e a Meta não sabem —
    -- meta de vendas e comparecimento (grupo, pico na live, quem ficou até o pitch do White Label).
    -- 1 linha por sábado de aula; vendas e gasto são calculados na hora, não ficam aqui.
    CREATE TABLE IF NOT EXISTS ws_turmas (
      workspace_id   TEXT NOT NULL,
      turma          DATE NOT NULL,
      meta_ingressos INT,
      meta_wl        INT,
      membros_grupo  INT,
      pico_live      INT,
      ficaram_pitch  INT,
      obs            TEXT,
      atualizado     TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, turma)
    );

    -- Pedidos APROVADOS que chegam pelo webhook de fluxo da Kiwify (ingresso + order bumps + qualquer
    -- produto): 1 linha por pedido, com o LÍQUIDO e a UTM. É o que monta o {{resumo_compra}} do
    -- aviso de venda — a Kiwify manda cada bump como um pedido separado, segundos depois do principal.
    CREATE TABLE IF NOT EXISTS kiwify_pedidos (
      order_id     TEXT PRIMARY KEY,
      workspace_id TEXT,
      phone        TEXT,
      email        TEXT,
      produto      TEXT,
      bruto        NUMERIC,
      liquido      NUMERIC,
      utm_source   TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS kiwify_pedidos_ws_phone ON kiwify_pedidos(workspace_id, phone, created_at);
    CREATE INDEX IF NOT EXISTS kiwify_pedidos_ws_email ON kiwify_pedidos(workspace_id, email, created_at);
    -- Dashboard de Lançamento (18/10): lote (checkout_link = código do lote), Pix × cartão e o "src"
    -- (= trk da sessão da página → checkout_sessions.landing_url, pra saber QUAL página vendeu).
    ALTER TABLE kiwify_pedidos ADD COLUMN IF NOT EXISTS oferta    TEXT;
    ALTER TABLE kiwify_pedidos ADD COLUMN IF NOT EXISTS pagamento TEXT;
    ALTER TABLE kiwify_pedidos ADD COLUMN IF NOT EXISTS src       TEXT;
    ALTER TABLE ws_turmas ADD COLUMN IF NOT EXISTS meta_investimento NUMERIC;
    -- Gasto ACUMULADO do dia na Meta, uma foto a cada sincronização (30 min) → gráficos por hora.
    CREATE TABLE IF NOT EXISTS ads_hora (
      workspace_id TEXT NOT NULL,
      ts           TIMESTAMPTZ NOT NULL,
      data         DATE NOT NULL,
      gasto        NUMERIC NOT NULL DEFAULT 0,
      PRIMARY KEY (workspace_id, ts)
    );
    -- Nome do comprador: o Google Meet não entrega e-mail do participante, então "quem assistiu e
    -- comprou" no Meet só fecha pelo nome.
    ALTER TABLE kiwify_pedidos ADD COLUMN IF NOT EXISTS nome TEXT;

    -- 🎥 LIVES (Google Meet / Zoom / CSV de presença) → /lancamento/live-metricas. Pitch e marcos
    -- são marcados à mão no painel e sobrevivem à ressincronização.
    CREATE TABLE IF NOT EXISTS lives (
      workspace_id TEXT NOT NULL,
      id           TEXT NOT NULL,
      fonte        TEXT NOT NULL,
      titulo       TEXT,
      codigo       TEXT,
      inicio       TIMESTAMPTZ NOT NULL,
      fim          TIMESTAMPTZ,
      turma        DATE,
      pitch        TEXT,
      marcos       JSONB,
      sincronizado TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, id)
    );
    CREATE TABLE IF NOT EXISTS live_sessoes (
      workspace_id TEXT NOT NULL,
      live_id      TEXT NOT NULL,
      pessoa       TEXT NOT NULL,
      nome         TEXT,
      email        TEXT,
      entrada      TIMESTAMPTZ NOT NULL,
      saida        TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS live_sessoes_live ON live_sessoes(workspace_id, live_id);
    -- gravação/transcrição no Drive (link pra assistir) e nome trocado à mão (não volta a ser o da Agenda)
    ALTER TABLE lives ADD COLUMN IF NOT EXISTS gravacoes JSONB;
    ALTER TABLE lives ADD COLUMN IF NOT EXISTS titulo_manual BOOLEAN NOT NULL DEFAULT false;

    -- 🏆 Métricas por ANÚNCIO (ranking de criativos) + miniatura/link do criativo.
    CREATE TABLE IF NOT EXISTS ads_anuncio_diario (
      workspace_id TEXT NOT NULL,
      data         DATE NOT NULL,
      ad_id        TEXT NOT NULL,
      ad_nome      TEXT, conjunto TEXT, campanha TEXT,
      gasto        NUMERIC NOT NULL DEFAULT 0,
      impressoes   INT NOT NULL DEFAULT 0, alcance INT NOT NULL DEFAULT 0, cliques INT NOT NULL DEFAULT 0,
      lpv          INT NOT NULL DEFAULT 0, ic INT NOT NULL DEFAULT 0, compras INT NOT NULL DEFAULT 0,
      valor        NUMERIC NOT NULL DEFAULT 0, video_3s INT NOT NULL DEFAULT 0, thruplay INT NOT NULL DEFAULT 0,
      atualizado   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, data, ad_id)
    );
    CREATE TABLE IF NOT EXISTS ads_criativos (
      workspace_id TEXT NOT NULL,
      ad_id        TEXT NOT NULL,
      nome         TEXT, status TEXT, thumb TEXT, imagem TEXT, video_id TEXT, link TEXT,
      atualizado   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, ad_id)
    );

    -- Vendas aprovadas (dashboard financeiro): 1 linha por pedido, com o detalhamento da Kiwify.
    -- gross=bruto, kiwify_fee=taxa, producer_net=SEU líquido (my_commission), affiliate_commission=pago ao afiliado.
    CREATE TABLE IF NOT EXISTS sales (
      order_id        TEXT PRIMARY KEY,       -- idempotência por pedido Kiwify
      plan            TEXT,                   -- 'start' | 'pro' | 'escala' | NULL
      plan_name       TEXT,                   -- nome do plano na Kiwify
      offer_code      TEXT,                   -- checkout_link (identifica a oferta)
      gross           NUMERIC NOT NULL DEFAULT 0,  -- bruto (R$)
      kiwify_fee      NUMERIC NOT NULL DEFAULT 0,  -- taxa Kiwify (R$)
      producer_net    NUMERIC NOT NULL DEFAULT 0,  -- líquido do dono (R$)
      affiliate_id    TEXT,                   -- affiliates.id (se venda de afiliado)
      affiliate_name  TEXT,
      affiliate_commission NUMERIC NOT NULL DEFAULT 0, -- pago ao afiliado (R$)
      buyer_email     TEXT,
      status          TEXT NOT NULL DEFAULT 'paga',  -- 'paga' | 'estornada'
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS sales_created_idx ON sales(created_at);
    -- 🔐 ESTA VENDA DÁ ACESSO AO APP? Nem toda linha aqui é assinatura: o ingresso do workshop
    -- (R$ 17) também é registrado, pra alimentar o contador da landing e o financeiro. Sem esta
    -- coluna, syncPaidAccess (que ativa o plano pelo e-mail do comprador) lia QUALQUER venda
    -- paga e transformava um ingresso de R$ 17 em 37 dias de plano completo (auditoria 07/09).
    -- DEFAULT TRUE de propósito: todas as linhas que existem hoje vieram do caminho de assinatura
    -- (handleBillingEvent, que já filtra por produto), então a migração não muda nada do passado.
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS grants_access BOOLEAN NOT NULL DEFAULT TRUE;
    -- UTM/origem da venda (de onde veio: meta/afiliado/campanha…). Migração idempotente.
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS utm_source   TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS utm_medium   TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS utm_content  TEXT;
    -- ── Afiliados self-service (docs/afiliados-modulo-spec.md) ────────────────
    -- Página de vendas gerada pelo afiliado: /promo/<slug> com os checkouts DELE.
    -- E-MAIL é a chave do afiliado (regra de ouro §3 da spec): recadastrar com o
    -- mesmo e-mail ATUALIZA; o slug só muda se o nome mudar.
    CREATE TABLE IF NOT EXISTS affiliate_promo (
      id             TEXT PRIMARY KEY,
      slug           TEXT UNIQUE NOT NULL,      -- vira a URL /promo/<slug>
      nome           TEXT NOT NULL,
      email          TEXT UNIQUE NOT NULL,      -- CHAVE do afiliado
      telefone       TEXT NOT NULL,             -- só dígitos, com DDI
      whatsapp       TEXT,                      -- só dígitos, com DDI
      link_start           TEXT NOT NULL,       -- checkouts DELE (com ?afid=)
      link_pro             TEXT NOT NULL,
      link_escala          TEXT NOT NULL,
      link_start_anual     TEXT NOT NULL,
      link_pro_anual       TEXT NOT NULL,
      link_escala_anual    TEXT NOT NULL,
      trial_3_dias   BOOLEAN NOT NULL DEFAULT FALSE,
      meta_pixel_id       TEXT,                 -- rastreio opcional do próprio afiliado
      meta_capi_token     TEXT,
      google_ads_id       TEXT,
      google_ads_label    TEXT,
      tiktok_pixel_id     TEXT,
      tiktok_access_token TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Chave de edição: prova de posse pra ALTERAR uma página existente. Sem ela, o upsert por
    -- e-mail (público) permitiria a qualquer um reescrever a página de um afiliado conhecido e
    -- desviar a comissão (auditoria 09/08). Guardamos só o HASH; o segredo vai pro dono na criação.
    ALTER TABLE affiliate_promo ADD COLUMN IF NOT EXISTS edit_secret_hash TEXT;
    -- Opt-in do afiliado: bolinha flutuante de WhatsApp na /promo com o número DELE (aparece após 30s).
    ALTER TABLE affiliate_promo ADD COLUMN IF NOT EXISTS whats_flutuante BOOLEAN NOT NULL DEFAULT FALSE;
    -- Leads do TESTE GRÁTIS vindos de página de afiliado. slug = o slug DA PÁGINA
    -- visitada (pode diferir do interno — consultar sempre por conjunto de slugs).
    CREATE TABLE IF NOT EXISTS trial_leads (
      id             TEXT PRIMARY KEY,
      slug           TEXT NOT NULL,
      lead_nome      TEXT NOT NULL,
      lead_email     TEXT NOT NULL,
      lead_telefone  TEXT,
      lead_whatsapp  TEXT,
      account_id     TEXT,                      -- workspace/conta criada pro lead
      utm_source     TEXT,
      utm_medium     TEXT,
      utm_campaign   TEXT,
      utm_content    TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS trial_leads_slug_idx ON trial_leads (slug);
    -- Registro de e-mails do ciclo de vida (Fase A): trava anti-duplicação. 1 linha por
    -- (workspace, tipo); sent_at atualiza quando reenvia após o cooldown. Sem isto, o job de
    -- hora em hora reenviaria "teste expirou" toda hora.
    CREATE TABLE IF NOT EXISTS email_log (
      workspace_id TEXT NOT NULL,
      kind         TEXT NOT NULL,        -- 'trial_soon' | 'trial_expired' | 'dunning' | …
      sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, kind)
    );
    -- Reset de senha self-service: guarda só o HASH do token (nunca o token cru), 1 uso, TTL 1h.
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id);
    -- Confirmação de e-mail (double opt-in). DEFAULT TRUE = contas ANTIGAS já entram confirmadas
    -- (grandfather); só cadastro novo direto nasce FALSE. Fecha a pré-empção de conta (auditoria).
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmed BOOLEAN NOT NULL DEFAULT TRUE;
    CREATE TABLE IF NOT EXISTS email_confirmations (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS email_confirmations_user_idx ON email_confirmations (user_id);
    CREATE TABLE IF NOT EXISTS app_config (
      key         TEXT PRIMARY KEY,
      value       JSONB NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- ═══ MULTI-TENANT · Fase 4: roteamento INSTÂNCIA → WORKSPACE ═══
    -- Chave do roteamento do inbound: cada webhook UazAPI traz body.token; aqui achamos o workspace dono.
    -- Meta roteia por phone_number_id. É a tabela que mata o "401 cego" (hoje só o número do dono roda fluxos).
    CREATE TABLE IF NOT EXISTS instances (
      token           TEXT PRIMARY KEY,     -- token da instância UazAPI (LITE) — chave do inbound
      workspace_id    TEXT NOT NULL,        -- dono
      platform        TEXT NOT NULL DEFAULT 'lite', -- 'lite' | 'api'
      phone_number_id TEXT,                 -- roteamento da Meta (Cloud API)
      name            TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS instances_ws_idx  ON instances(workspace_id);
    CREATE INDEX IF NOT EXISTS instances_pni_idx ON instances(phone_number_id);

    -- ═══ MULTI-TENANT · Fase 1 (aditivo) ═══
    -- workspace_id em TODA tabela de dados de tenant. Nulo por enquanto → backfillTenancy()
    -- (rodado no boot, depois do admin ser semeado) preenche os dados atuais no workspace do dono.
    -- O ESCOPO das queries (filtrar por workspace_id) vem na Fase 2 — por ora a coluna só existe.
    -- Permissões finas por membro (JSON): quais páginas ele abre e quais contas enxerga.
    -- NULL = sem restrição (todo membro criado antes disto continua como estava).
    ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS permissions TEXT;
    ALTER TABLE workspace_invites ADD COLUMN IF NOT EXISTS permissions TEXT;
    ALTER TABLE contacts        ADD COLUMN IF NOT EXISTS workspace_id TEXT;
    ALTER TABLE contacts        ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE contacts        ADD COLUMN IF NOT EXISTS avatar_url TEXT; -- foto de perfil hospedada (persiste)
    ALTER TABLE users           ADD COLUMN IF NOT EXISTS avatar_url TEXT; -- foto do USUÁRIO do painel (Perfil em Configurações)
    ALTER TABLE users           ADD COLUMN IF NOT EXISTS tours_seen TEXT NOT NULL DEFAULT '';
    ALTER TABLE users           ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false; -- senha resetada pelo admin: obriga trocar no 1º login (a que passou pela tela dele morre no uso) -- tours de boas-vindas já vistos POR USUÁRIO (lista de chaves separadas por vírgula) — no servidor, não no navegador
    ALTER TABLE users           ADD COLUMN IF NOT EXISTS totp_enc TEXT;                        -- segredo TOTP (2FA) CRIPTOGRAFADO (crypto.ts)
    ALTER TABLE users           ADD COLUMN IF NOT EXISTS totp_on  BOOLEAN NOT NULL DEFAULT false; -- 2FA ativo? (false + totp_enc = cadastro pendente)
    -- Anti força-bruta do 2FA: contador CUMULATIVO por conta (não por ticket/IP — ticket rotaciona)
    -- + lock com backoff. Persistido: sobrevive a restart/redeploy do motor.
    ALTER TABLE users           ADD COLUMN IF NOT EXISTS totp_fails        INT NOT NULL DEFAULT 0;
    ALTER TABLE users           ADD COLUMN IF NOT EXISTS totp_locked_until TIMESTAMPTZ;
    ALTER TABLE users           ADD COLUMN IF NOT EXISTS totp_last_counter BIGINT; -- guard de replay (código não loga 2x)
    -- Break-glass do 2FA do admin: registra que a flag ADMIN_2FA_RESET já foi consumida (one-shot).
    CREATE TABLE IF NOT EXISTS admin_flags (
      flag       TEXT PRIMARY KEY,
      used_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ═══ FOLLOW-UP AGENDADO (retomada persistente de fluxo) ═══
    -- Espera LONGA num fluxo não pode ser setTimeout: (a) trava a fila daquele telefone — o lead
    -- responde e fica sem resposta até a espera acabar; (b) morre no redeploy. Aqui o fluxo PAUSA e
    -- grava onde retomar; um tick de 30s pega o que venceu e continua de onde parou.
    -- cancel_on_reply: o follow-up de vácuo se cancela sozinho quando o lead responde (é o certo).
    CREATE TABLE IF NOT EXISTS flow_jobs (
      id             TEXT PRIMARY KEY,
      workspace_id   TEXT NOT NULL,
      phone          TEXT NOT NULL,
      automation_id  TEXT NOT NULL,
      node_id        TEXT NOT NULL,          -- nó por onde RETOMAR
      instance_token TEXT,                   -- por qual número responder (cliente com 2+ números)
      run_at         TIMESTAMPTZ NOT NULL,
      cancel_on_reply BOOLEAN NOT NULL DEFAULT TRUE,
      status         TEXT NOT NULL DEFAULT 'pending', -- pending | done | canceled
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS flow_jobs_due_idx   ON flow_jobs(status, run_at);
    CREATE INDEX IF NOT EXISTS flow_jobs_phone_idx ON flow_jobs(workspace_id, phone, status);

    -- ═══ CRM KANBAN (board estilo Trello: colunas + cards arrastáveis) ═══
    -- Cada workspace tem suas COLUNAS (etapas do funil). position é DOUBLE de propósito: inserir
    -- entre dois vizinhos é só (a+b)/2 — não precisa renumerar a coluna/card inteira a cada arraste.
    CREATE TABLE IF NOT EXISTS crm_stages (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name         TEXT NOT NULL,
      color        TEXT,
      position     DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS crm_stages_ws_idx ON crm_stages(workspace_id, position);
    -- O CARD é o próprio contato (não duplica cadastro): onde ele está no board + a ficha rica.
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS crm_stage_id TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS crm_pos      DOUBLE PRECISION;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address      TEXT;   -- endereço
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes        TEXT;   -- descrição / bullet points (uma linha por "•")
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS crm_value    NUMERIC(12,2); -- valor do negócio
    -- Foto de perfil por CONVERSA da API Oficial (16/10/2026): a maioria das conversas da API não
    -- tem linha em contacts com o mesmo número (9º dígito, só template enviado…), então a foto
    -- buscada na UazAPI mora aqui, por chat_id. tentado_em segura a re-tentativa (2 dias).
    CREATE TABLE IF NOT EXISTS chat_avatars (
      workspace_id TEXT NOT NULL,
      chat_id      TEXT NOT NULL,
      url          TEXT,
      tentado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, chat_id)
    );
    CREATE INDEX IF NOT EXISTS contacts_crm_stage_idx ON contacts(workspace_id, crm_stage_id, crm_pos);

    -- ═══ EQUIPE (multiusuário por workspace) ═══
    -- O DONO é workspaces.owner_user_id (não fica aqui). Esta tabela são os CONVIDADOS.
    -- Papéis: 'admin' (tudo operacional + convida) | 'atendente' (só inbox/contatos).
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'atendente',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ws_members_uniq    ON workspace_members(workspace_id, user_id);
    -- Um usuário pertence a NO MÁXIMO um workspace como membro (evita sessão ambígua na resolução).
    CREATE UNIQUE INDEX IF NOT EXISTS ws_members_user_uq ON workspace_members(user_id);

    -- Convites pendentes. Amarrados ao E-MAIL (só ele aceita) + uso único + expiram.
    CREATE TABLE IF NOT EXISTS workspace_invites (
      token        TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      email        TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'atendente',
      invited_by   TEXT,
      expires_at   TIMESTAMPTZ NOT NULL,
      accepted_at  TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ws_invites_ws_idx    ON workspace_invites(workspace_id);
    CREATE INDEX IF NOT EXISTS ws_invites_email_idx ON workspace_invites(email);
    -- Registro de tags por workspace: permite CRIAR uma tag antes de aplicar num contato (o CRM só
    -- criava tag ao aplicar). A lista de tags = registro UNIÃO tags já usadas em contact_tags.
    CREATE TABLE IF NOT EXISTS tag_registry (
      workspace_id TEXT NOT NULL,
      tag          TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS tag_registry_uniq ON tag_registry(workspace_id, tag);
    -- FICHA DO CLIQUE. A plataforma de checkout devolve no webhook uma lista FIXA de campos, e
    -- fbp/fbc não estão nela — então a venda chegava sem NADA que a Meta use pra casar com o
    -- anúncio. Aqui a ficha inteira fica guardada com uma chave curta (trk) que viaja no link do
    -- checkout; quando o webhook volta com ela, recupera-se tudo e o Purchase sai com fbp+fbc.
    CREATE TABLE IF NOT EXISTS checkout_sessions (
      trk           TEXT PRIMARY KEY,
      fbp           TEXT,
      fbc           TEXT,
      gclid         TEXT,
      ttclid        TEXT,
      utm_source    TEXT,
      utm_medium    TEXT,
      utm_campaign  TEXT,
      utm_content   TEXT,
      utm_term      TEXT,
      ad_id         TEXT,
      adset_id      TEXT,
      campaign_id   TEXT,
      placement     TEXT,
      ip            TEXT,
      user_agent    TEXT,
      landing_url   TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS checkout_sessions_criado ON checkout_sessions(created_at);
    -- ⚖️ ACEITE DOS TERMOS. É prova, não preferência: quando um número é banido pela Meta, o cliente
    -- culpa a ferramenta, e o que ganha a discussão é mostrar que ele leu o aviso e clicou "aceito"
    -- ANTES de conectar aquele número. Por isso NADA aqui é apagado ou atualizado — cada aceite é
    -- uma linha nova, append-only, com o hash do texto exato que estava na tela naquele dia.
    -- Sem UNIQUE de propósito: o aceite do momento 'canal' se repete a cada número conectado.
    CREATE TABLE IF NOT EXISTS termos_aceites (
      id            BIGSERIAL PRIMARY KEY,
      workspace_id  TEXT,
      user_id       TEXT NOT NULL,
      email         TEXT,
      nome          TEXT,
      momento       TEXT NOT NULL,   -- 'login' (uma vez por versão) | 'canal' (todo número novo)
      versao        TEXT NOT NULL,
      hash_termos   TEXT NOT NULL,   -- sha256 do texto canônico exibido
      ip            TEXT,
      user_agent    TEXT,
      dispositivo   TEXT,            -- JSON do navegador (tela, fuso, idioma, plataforma)
      referencia    TEXT,            -- rótulo do canal, quando houver
      aceito_em     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS termos_aceites_user  ON termos_aceites(user_id, momento);
    CREATE INDEX IF NOT EXISTS termos_aceites_ws    ON termos_aceites(workspace_id);
    CREATE INDEX IF NOT EXISTS termos_aceites_data  ON termos_aceites(aceito_em);
    -- Idioma do painel escolhido pelo usuário (pt | en | es). No SERVIDOR de propósito:
    -- quem escolhe inglês e entra de outro computador tem que continuar em inglês.
    ALTER TABLE users           ADD COLUMN IF NOT EXISTS idioma TEXT;
    ALTER TABLE events          ADD COLUMN IF NOT EXISTS workspace_id TEXT;
    ALTER TABLE flow_node_hits  ADD COLUMN IF NOT EXISTS workspace_id TEXT;
    ALTER TABLE flow_pending    ADD COLUMN IF NOT EXISTS workspace_id TEXT;
    ALTER TABLE agent_sessions  ADD COLUMN IF NOT EXISTS workspace_id TEXT;
    ALTER TABLE contact_fields  ADD COLUMN IF NOT EXISTS workspace_id TEXT;
    ALTER TABLE media           ADD COLUMN IF NOT EXISTS workspace_id TEXT;
    ALTER TABLE sent_messages   ADD COLUMN IF NOT EXISTS workspace_id TEXT;
    ALTER TABLE group_messages  ADD COLUMN IF NOT EXISTS workspace_id TEXT;
    ALTER TABLE app_config      ADD COLUMN IF NOT EXISTS workspace_id TEXT;
    -- app_config vira POR-WORKSPACE: tira o PK de 'key' e passa a ser único por (workspace_id, key).
    -- Seguro/idempotente: backfillTenancy (no boot, antes do listen) preenche workspace_id antes de qualquer escrita.
    ALTER TABLE app_config      DROP CONSTRAINT IF EXISTS app_config_pkey;
    CREATE UNIQUE INDEX IF NOT EXISTS app_config_ws_key_uniq ON app_config(workspace_id, key);
    -- PKs keyed por telefone viram (workspace_id, phone) — senão dois clientes com o mesmo lead colidem.
    -- Único por (ws, phone) via índice (aceita null pré-backfill; backfill roda antes do listen).
    ALTER TABLE contacts        DROP CONSTRAINT IF EXISTS contacts_pkey;
    ALTER TABLE flow_pending    DROP CONSTRAINT IF EXISTS flow_pending_pkey;
    ALTER TABLE agent_sessions  DROP CONSTRAINT IF EXISTS agent_sessions_pkey;
    ALTER TABLE contact_fields  DROP CONSTRAINT IF EXISTS contact_fields_pkey;
    CREATE UNIQUE INDEX IF NOT EXISTS contacts_ws_phone_uniq       ON contacts(workspace_id, phone);
    CREATE UNIQUE INDEX IF NOT EXISTS flow_pending_ws_phone_uniq   ON flow_pending(workspace_id, phone);
    CREATE UNIQUE INDEX IF NOT EXISTS agent_sessions_ws_phone_uniq ON agent_sessions(workspace_id, phone);
    CREATE UNIQUE INDEX IF NOT EXISTS contact_fields_ws_pf_uniq    ON contact_fields(workspace_id, phone, field);
    CREATE INDEX IF NOT EXISTS contacts_ws_idx       ON contacts(workspace_id);
    CREATE INDEX IF NOT EXISTS events_ws_idx         ON events(workspace_id);
    CREATE INDEX IF NOT EXISTS flow_node_hits_ws_idx ON flow_node_hits(workspace_id);
    -- CRM (listContacts): as subqueries LATERAL correlacionam por (workspace_id, phone). Sem estes
    -- índices, cada contato varre events/flow_node_hits inteiro → a lista fica O(contatos × eventos).
    CREATE INDEX IF NOT EXISTS events_ws_phone_idx         ON events(workspace_id, phone);
    CREATE INDEX IF NOT EXISTS flow_node_hits_ws_phone_idx ON flow_node_hits(workspace_id, phone);
    -- contact_tags: único por (ws, phone, tag) e leitura por (ws, phone) na lista de contatos.
    CREATE UNIQUE INDEX IF NOT EXISTS contact_tags_uniq     ON contact_tags(workspace_id, phone, tag);
    CREATE INDEX IF NOT EXISTS contact_tags_ws_phone_idx    ON contact_tags(workspace_id, phone);
    -- Ficha do contato (ficha-contato.ts): nome digitado à mão vence o do WhatsApp na lista, e os
    -- documentos pessoais (RG/CPF) ficam FORA da tabela media — essa é servida sem login.
    ALTER TABLE contacts        ADD COLUMN IF NOT EXISTS name_manual BOOLEAN;
    CREATE TABLE IF NOT EXISTS contact_docs (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      phone        TEXT NOT NULL,
      tipo         TEXT,
      nome         TEXT,
      mime         TEXT NOT NULL,
      tamanho      INT,
      data         BYTEA NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS contact_docs_ws_phone_idx    ON contact_docs(workspace_id, phone);
    -- Sugestões da página Novidades (17/10/2026): guardadas aqui e avisadas no WhatsApp do dono
    -- pelo fluxo "fluxo-sugestoes-novidades" do workspace principal.
    CREATE TABLE IF NOT EXISTS sugestoes (
      id           BIGSERIAL PRIMARY KEY,
      workspace_id TEXT,
      user_id      TEXT,
      nome         TEXT,
      email        TEXT,
      telefone     TEXT,
      texto        TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- 1 workspace por dono: sem isto, 2 webhooks concorrentes do MESMO comprador criavam 2 workspaces
    -- (getSession pegava um arbitrário; refund cancelava só um → comprador estornado mantinha acesso).
    CREATE UNIQUE INDEX IF NOT EXISTS workspaces_owner_uniq ON workspaces(owner_user_id);
    CREATE INDEX IF NOT EXISTS flow_pending_ws_idx   ON flow_pending(workspace_id);
    CREATE INDEX IF NOT EXISTS agent_sessions_ws_idx ON agent_sessions(workspace_id);
    CREATE INDEX IF NOT EXISTS contact_fields_ws_idx ON contact_fields(workspace_id);
    CREATE INDEX IF NOT EXISTS app_config_ws_idx     ON app_config(workspace_id, key);
  `);
  console.log("🗄️  Postgres conectado e schema pronto");
}

// Backfill da tenancy: joga TODOS os dados atuais (sem workspace) no workspace do admin (Admin).
// Roda no boot DEPOIS de ensureAdminSeed (o workspace do admin já existe). Idempotente (só toca NULLs).
// Retorna o workspace do admin (o "primário") pra o config-store usar como default do single-tenant.
export async function backfillTenancy(): Promise<string | null> {
  if (!dbEnabled) return null;
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@seudominio.com.br").toLowerCase();
  const rows = await query<{ id: string }>(
    "SELECT w.id FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE u.email=$1 ORDER BY w.created_at LIMIT 1",
    [adminEmail],
  );
  const wsId = rows[0]?.id;
  if (!wsId) { console.warn("⚠️  backfillTenancy: workspace do admin ainda não existe — pulei (rode ADMIN_PASSWORD)."); return null; }
  const tables = ["contacts", "events", "flow_node_hits", "flow_pending", "agent_sessions", "contact_fields", "media", "sent_messages", "group_messages", "app_config"];
  let total = 0;
  for (const t of tables) {
    const r = await query<{ n: string }>(`WITH u AS (UPDATE ${t} SET workspace_id=$1 WHERE workspace_id IS NULL RETURNING 1) SELECT count(*)::text AS n FROM u`, [wsId]);
    const n = Number(r[0]?.n ?? 0);
    if (n) { total += n; console.log(`  · ${t}: ${n} linhas → workspace ${wsId}`); }
  }
  if (total) console.log(`🏷️  backfillTenancy: ${total} linhas atribuídas ao workspace do admin (${wsId}).`);
  return wsId;
}
