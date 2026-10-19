"use client";

// Página INTEGRAÇÕES — o hub de conexões do ZapConverte com o mundo de fora.
// Hoje: Conectores Google (conta de serviço) + os canais de ENTRADA que já existem
// (webhook de fluxo e o webhook de compras Kiwify), pra pessoa achar tudo num lugar só.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { useAuth } from "@/components/Auth";
import { jget, jsend } from "@/lib/client";
import GuiaTokenMetaAds from "@/components/GuiaTokenMetaAds";

function Card({ title, sub, children, soon, icon }: { title: string; sub?: string; children?: React.ReactNode; soon?: boolean; icon?: string }) {
  return (
    <div className="card" style={{ opacity: soon ? 0.72 : 1 }}>
      <div className="card-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: sub ? 3 : 12 }}>
          {icon && <Icon name={icon} size={16} />}
          <h3 style={{ margin: 0, fontSize: 15.5 }}>{title}</h3>
          {soon && <span className="tpl-status warn" style={{ fontSize: 10.5 }}>em breve</span>}
        </div>
        {sub && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>{sub}</div>}
        {children}
      </div>
    </div>
  );
}

// Campo de segredo JÁ SALVO (18/10/2026, pedido do dono): um input de senha vazio com placeholder
// parecia "não tem nada aqui". Salvo → faixa "Token salvo · termina em …XXXX" + botão Trocar; o campo
// só abre quando a pessoa quer trocar. Vale pra qualquer card que guarda token cifrado.
function CampoSegredo({ salvo, final, rotulo = "Token", value, onChange, placeholder }: {
  salvo: boolean; final?: string | null; rotulo?: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  const [editando, setEditando] = useState(false);
  useEffect(() => { if (salvo && !value) setEditando(false); }, [salvo]); // eslint-disable-line react-hooks/exhaustive-deps
  if (salvo && !editando) {
    return (
      <div className="segredo-salvo">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10.5" width="16" height="10" rx="2.2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
        <span><b>{rotulo} salvo</b>{final ? <> · termina em <code>…{final}</code></> : null} · guardado cifrado</span>
        <button type="button" className="btn" onClick={() => setEditando(true)}>Trocar {rotulo.toLowerCase()}</button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input className="inp" style={{ flex: 1 }} type="password" autoComplete="off" autoFocus={editando} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {salvo && <button type="button" className="btn" onClick={() => { onChange(""); setEditando(false); }}>Cancelar</button>}
    </div>
  );
}

// 📈 Meta Ads (métricas de campanha): credencial do nó "Métricas Meta Ads" / relatório diário.
function MetaAdsCard() {
  const [st, setSt] = useState<any | null>(null);
  const [actId, setActId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { jget("/api/meta-ads/config").then((d) => { setSt(d); setActId(d.actId ?? ""); }).catch((e) => setErr(e.message)); }, []);
  async function salvar() {
    setBusy(true); setErr(""); setMsg("");
    try { const d = await jsend("/api/meta-ads/config", "POST", { actId, token: token.trim() }); setSt({ ...st, ...d }); setToken(""); setMsg(d.configurado ? "Salvo." : "Removido."); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function testar() {
    setBusy(true); setErr(""); setMsg("");
    try { const d = await jsend("/api/meta-ads/testar", "POST", {}); setMsg(`Funcionou: gasto de hoje ${Number(d.gastoHoje).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · conta "${d.nome}" · fuso ${d.fuso}`); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Card title="Meta Ads (métricas de campanha)" icon="meta"
      sub="O nó Métricas Meta Ads e o relatório diário de vendas puxam daqui o gasto e os resultados das suas campanhas (Click-to-WhatsApp e compra). Cole o ID da conta de anúncio e um token com a permissão ads_read.">
      <div style={{ display: "grid", gap: 8 }}>
        <input className="inp" placeholder="ID da conta de anúncio (act_…)" value={actId} onChange={(e) => setActId(e.target.value)} />
        <CampoSegredo salvo={!!st?.configurado && st?.origem !== "env"} final={st?.last4} value={token} onChange={setToken}
          placeholder={st?.configurado ? "cole o token novo" : "Token de acesso (ads_read)"} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn primary" disabled={busy} onClick={salvar}>Salvar</button>
          <button className="btn" disabled={busy || !st?.configurado} onClick={testar}>Testar</button>
          {msg && <span className="muted" style={{ fontSize: 12.5 }}>{msg}</span>}
          {err && <span style={{ color: "var(--crit)", fontSize: 12.5 }}>{err}</span>}
        </div>
        <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          O período (hoje/ontem) roda no <b>fuso da conta de anúncio</b> — o Testar mostra qual é. O gasto de "ontem" ainda
          ajusta por algumas horas depois da virada, então o fechamento de 00h01 pode divergir um pouco do Gerenciador de manhã.
        </div>
        {st?.origem === "env" && <div className="muted" style={{ fontSize: 11.5 }}>Usando o token guardado no servidor (.env). Salvar um token aqui passa a valer no lugar dele.</div>}
        <GuiaTokenMetaAds onde="integracoes" aberto={!!st && !st.configurado} />
      </div>
    </Card>
  );
}

// 🔵 Conversões de WhatsApp (CAPI de mensagens): o dataset + token que as ETIQUETAS DA META usam
// pra avisar o anúncio de Click-to-WhatsApp que a conversa virou venda/lead qualificado.
function CapiWhatsAppCard() {
  const [c, setC] = useState<any | null>(null);
  const [dataset, setDataset] = useState("");
  const [token, setToken] = useState("");
  const [testCode, setTestCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { jget("/api/capi-whatsapp").then((d) => { setC(d); setDataset(d.datasetId ?? ""); setTestCode(d.testCode ?? ""); }).catch((e) => setErr(e.message)); }, []);
  async function salvar() {
    setBusy(true); setErr(""); setMsg("");
    try { const d = await jsend("/api/capi-whatsapp", "POST", { datasetId: dataset, token: token.trim() || "", testCode: testCode.trim() }); setC(d); setDataset(d.datasetId ?? ""); setTestCode(d.testCode ?? ""); setToken(""); setMsg(d.testCode ? "Salvo em MODO TESTE." : "Salvo."); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function descobrir() {
    setBusy(true); setErr(""); setMsg("");
    try { const d = await jsend("/api/capi-whatsapp/descobrir", "POST", {}); setC(d); setDataset(d.datasetId ?? ""); setMsg("Conjunto de dados descoberto pela sua conexão oficial."); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const quando = (v: string) => new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <Card title="Conversões de WhatsApp (Meta)" icon="meta"
      sub="As etiquetas azuis da Meta (Compra aprovada, Lead qualificado…) avisam o anúncio de Click-to-WhatsApp que a conversa virou venda — a campanha passa a otimizar por compra, não por clique. Aqui mora o conjunto de dados (dataset) da sua WABA.">
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="inp" style={{ flex: 1, minWidth: 180 }} placeholder="ID do conjunto de dados (dataset)" value={dataset} onChange={(e) => setDataset(e.target.value)} />
          <button className="btn" disabled={busy || !c?.conexaoOficial} title={c?.conexaoOficial ? "Busca (ou cria) o dataset da WABA conectada" : "conecte a API Oficial primeiro"} onClick={descobrir}>Descobrir pela conexão oficial</button>
        </div>
        <CampoSegredo salvo={!!c?.temToken} final={c?.tokenLast4} value={token} onChange={setToken}
          placeholder={c?.temToken ? "cole o token novo" : "Token de acesso (opcional — sem ele uso o da conexão oficial)"} />
        <input className="inp" placeholder="Código de teste (opcional) — ex.: TEST12345" value={testCode} onChange={(e) => setTestCode(e.target.value)} />
        {c?.testCode ? (
          <div style={{ fontSize: 12, color: "var(--warn)" }}>
            <b>Modo teste ligado ({c.testCode}).</b> As etiquetas mandam o evento só pra aba Testar eventos e nada conta como conversão. Apague o código e salve quando terminar o teste.
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 11.5 }}>
            Pra testar sem sujar a campanha: no Gerenciador de Eventos, abra o conjunto de dados, vá em <b>Testar eventos</b>, copie o código e cole aqui. Depois marque a etiqueta num lead que veio de anúncio.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn primary" disabled={busy || !dataset.trim()} onClick={salvar}>Salvar</button>
          {msg && <span className="muted" style={{ fontSize: 12.5 }}>{msg}</span>}
          {err && <span style={{ color: "var(--crit)", fontSize: 12.5 }}>{err}</span>}
        </div>
        <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          É o <b>dataset</b> do WhatsApp (nasce da WABA), não o número da conta de anúncios (act_…). O evento só casa com o anúncio
          quando o lead veio de Click-to-WhatsApp — contato comum não tem o clique e nada é enviado. O token precisa da permissão
          <i> whatsapp_business_manage_events</i>.
        </div>
        {(c?.eventos ?? []).length > 0 && (
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Últimos eventos</div>
            {(c.eventos as any[]).map((e, i) => (
              <div key={i} className="muted" style={{ fontSize: 11.5, display: "flex", gap: 6 }}>
                <span>{quando(e.created_at)}</span>
                <span style={{ fontWeight: 600, color: e.status === "ok" ? "var(--ok, #16a34a)" : undefined }}>{e.evento}{e.valor ? ` R$ ${Number(e.valor).toFixed(2)}` : ""} · {e.status}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.detalhe ?? ""}>{e.phone}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function Integracoes() {
  const { session } = useAuth();
  const isAdmin = session?.user.role === "admin";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 680 }}>
      <GoogleContatosCard />
      <CapiWhatsAppCard />
      <MetaAdsCard />
      <AsaasCard />
      <ZapSignCard />
      <ResendCard />
      <ConectoresCard />

      <Card title="Webhook de entrada (formulários e sites)" sub="Qualquer formulário ou sistema dispara um fluxo seu: o gatilho Webhook gera uma URL única por fluxo — cole ela na ferramenta de origem e todo cadastro vira uma conversa no WhatsApp.">
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
          Onde fica: abra um fluxo no builder → clique no <b>gatilho</b> (topo da paleta) → <b>Webhook</b> → <b>Gerar URL</b>. O telefone vem em <code>telefone</code>/<code>phone</code>/<code>whatsapp</code> e o resto do JSON vira variável (<code>{"{{nome}}"}</code>, <code>{"{{utm_source}}"}</code>…).
        </div>
        <Link className="btn ic" style={{ marginTop: 10, display: "inline-flex" }} href="/fluxos">Abrir meus fluxos</Link>
      </Card>

      <OrigemPaginaCard />

      {isAdmin && (
        <Card title="Kiwify (compras)" sub="Eventos de compra (aprovada, recusada, PIX gerado, carrinho abandonado…) chegam pelo webhook e disparam os fluxos de venda/recuperação.">
          <span className="tpl-status on" style={{ background: "rgba(37,211,102,.16)", color: "var(--accent-deep)", fontWeight: 700 }}>Ativo</span>
        </Card>
      )}
    </div>
  );
}

// ── Asaas (cobranças) ────────────────────────────────────────────────────────────────────────
// A chave de API fica AQUI, cifrada por workspace — o nó Asaas dos fluxos lê daqui em runtime.
// Nunca dentro do fluxo: o n8n exportava a chave em texto claro no JSON; esse erro não se repete.
function AsaasCard() {
  const [st, setSt] = useState<{ configurado: boolean; ambiente?: string; last4?: string | null } | null>(null);
  const [chave, setChave] = useState("");
  const [ambiente, setAmbiente] = useState<"producao" | "sandbox">("producao");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  async function load() {
    try {
      const d = await jget("/api/asaas/config");
      setSt(d);
      if (d?.ambiente === "sandbox") setAmbiente("sandbox");
    } catch { setSt({ configurado: false }); }
  }
  useEffect(() => { load(); }, []);

  async function salvar() {
    if (busy || !chave.trim()) return;
    setBusy(true); setMsg({});
    try {
      await jsend("/api/asaas/config", "POST", { chave: chave.trim(), ambiente });
      setChave("");
      setMsg({ ok: "Chave salva. Clique em testar pra confirmar que está tudo certo." });
      await load();
    } catch (e: any) { setMsg({ err: e?.message || "erro ao salvar" }); }
    setBusy(false);
  }
  async function testar() {
    if (busy) return;
    setBusy(true); setMsg({});
    try {
      const r = await jsend("/api/asaas/testar", "POST", {});
      setMsg({ ok: `Conectado! Sua conta Asaas respondeu (${r.clientes} cliente(s) cadastrados${r.ambiente === "sandbox" ? " · ambiente de teste" : ""}).` });
    } catch (e: any) { setMsg({ err: e?.message || "o Asaas recusou — confira a chave e o ambiente" }); }
    setBusy(false);
  }
  async function remover() {
    if (busy || !window.confirm("Remover a chave do Asaas?\n\nOs nós Asaas dos fluxos param de funcionar (registram no log e o fluxo segue).")) return;
    setBusy(true); setMsg({});
    try { await jsend("/api/asaas/config", "POST", { chave: "" }); setMsg({ ok: "Chave removida." }); await load(); }
    catch (e: any) { setMsg({ err: e?.message || "erro" }); }
    setBusy(false);
  }

  return (
    <Card title="Asaas (cobranças)" icon="money"
      sub="Com a chave salva, o nó Asaas dos fluxos checa pagamento, envia comprovante, cria cobrança PIX/boleto e lista quem venceu — sem colar chave dentro de fluxo nenhum.">
      {st?.configurado && (
        <div style={{ marginBottom: 10 }}>
          <span className="tpl-status on" style={{ background: "rgba(37,211,102,.16)", color: "var(--accent-deep)", fontWeight: 700 }}>
            Conectado · chave …{st.last4}{st.ambiente === "sandbox" ? " · TESTE (sandbox)" : ""}
          </span>
        </div>
      )}
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        Onde pegar: no Asaas, <b>Conta → Integrações → Chave de API</b>. Ela fica guardada criptografada e não aparece de volta.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="inp" style={{ flex: "1 1 220px" }} type="password" autoComplete="off"
          placeholder={st?.configurado ? "•••••••••• (trocar a chave)" : "cole a chave de API do Asaas"}
          value={chave} onChange={(e) => setChave(e.target.value)} />
        <select className="inp" style={{ flex: "0 0 150px" }} value={ambiente} onChange={(e) => setAmbiente(e.target.value as "producao" | "sandbox")}>
          <option value="producao">Produção</option>
          <option value="sandbox">Teste (sandbox)</option>
        </select>
        <button className="btn primary" disabled={busy || !chave.trim()} onClick={salvar}>{busy ? "…" : "salvar chave"}</button>
        {st?.configurado && <button className="btn" disabled={busy} onClick={testar}>testar conexão</button>}
        {st?.configurado && <button className="btn" disabled={busy} onClick={remover}>remover</button>}
      </div>
      {msg.ok && <div style={{ color: "var(--accent-deep)", fontSize: 12.5, marginTop: 8 }}>{msg.ok}</div>}
      {msg.err && <div style={{ color: "var(--crit)", fontSize: 12.5, marginTop: 8 }}>{msg.err}</div>}
    </Card>
  );
}

// ── ZapSign (assinatura eletrônica) ──────────────────────────────────────────────────────────
// Mesma receita do Asaas: o token fica aqui, cifrado por workspace; o nó ZapSign lê em runtime.
function ResendCard() {
  const [st, setSt] = useState<{ configurado: boolean; last4?: string | null; remetente?: string; nome?: string; responderPara?: string } | null>(null);
  const [chave, setChave] = useState("");
  const [remetente, setRemetente] = useState("");
  const [nome, setNome] = useState("");
  const [responder, setResponder] = useState("");
  const [testePara, setTestePara] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  async function load() {
    try { const d = await jget("/api/resend/config"); setSt(d); setRemetente(d?.remetente ?? ""); setNome(d?.nome ?? ""); setResponder(d?.responderPara ?? ""); }
    catch { setSt({ configurado: false }); }
  }
  useEffect(() => { load(); }, []);

  async function salvar() {
    if (busy) return;
    setBusy(true); setMsg({});
    try { await jsend("/api/resend/config", "POST", { chave: chave.trim(), remetente, nome, responderPara: responder }); setChave(""); setMsg({ ok: "Salvo. Mande um e-mail de teste pra confirmar." }); await load(); }
    catch (e: any) { setMsg({ err: e?.message || "erro ao salvar" }); }
    setBusy(false);
  }
  async function testar() {
    if (busy || !testePara.trim()) return;
    setBusy(true); setMsg({});
    try { await jsend("/api/resend/testar", "POST", { para: testePara.trim() }); setMsg({ ok: `E-mail de teste enviado pra ${testePara.trim()}. Confira a caixa de entrada (e o spam).` }); }
    catch (e: any) { setMsg({ err: e?.message || "a Resend recusou" }); }
    setBusy(false);
  }
  async function remover() {
    if (busy || !window.confirm("Remover a Resend?\n\nOs passos Enviar e-mail dos fluxos param de enviar (registram no log e o fluxo segue).")) return;
    setBusy(true); setMsg({});
    try { await jsend("/api/resend/config", "POST", { remover: true }); setMsg({ ok: "Resend removida." }); await load(); }
    catch (e: any) { setMsg({ err: e?.message || "erro" }); }
    setBusy(false);
  }

  return (
    <Card title="Resend (e-mail)" icon="mail"
      sub="Com a sua conta Resend conectada, o passo Enviar e-mail dos fluxos manda e-mails com o seu domínio: acesso de compra, link de aula, lembretes.">
      {st?.configurado && (
        <div style={{ marginBottom: 10 }}>
          <span className="tpl-status on" style={{ background: "rgba(37,211,102,.16)", color: "var(--accent-deep)", fontWeight: 700 }}>
            Conectado · chave …{st.last4} · {st.nome ? `${st.nome} <${st.remetente}>` : st.remetente}
          </span>
        </div>
      )}
      <div className="muted" style={{ fontSize: 12, marginBottom: 6, lineHeight: 1.5 }}>
        Na Resend: <b>Domains</b> → verifique o seu domínio; depois <b>API Keys</b> → crie uma chave (começa com <b>re_</b>). O remetente precisa ser um e-mail desse domínio. A chave fica guardada criptografada e não aparece de volta.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input className="inp" type="password" autoComplete="off" placeholder={st?.configurado ? "•••••••••• (trocar a chave)" : "chave da API da Resend (re_…)"}
          value={chave} onChange={(e) => setChave(e.target.value)} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="inp" style={{ flex: "1 1 200px" }} placeholder="remetente: contato@seudominio.com.br" value={remetente} onChange={(e) => setRemetente(e.target.value)} />
          <input className="inp" style={{ flex: "1 1 160px" }} placeholder="nome que aparece (ex.: Admin)" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <input className="inp" placeholder="responder para (opcional)" value={responder} onChange={(e) => setResponder(e.target.value)} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn primary" disabled={busy || (!chave.trim() && !st?.configurado) || !remetente.trim()} onClick={salvar}>{busy ? "…" : "salvar"}</button>
          {st?.configurado && <button className="btn" disabled={busy} onClick={remover}>remover</button>}
        </div>
        {st?.configurado && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="inp" style={{ flex: "1 1 220px" }} placeholder="seu e-mail pra receber o teste" value={testePara} onChange={(e) => setTestePara(e.target.value)} />
            <button className="btn" disabled={busy || !testePara.trim()} onClick={testar}>enviar teste</button>
          </div>
        )}
      </div>
      {msg.ok && <div style={{ color: "var(--accent-deep)", fontSize: 12.5, marginTop: 8 }}>{msg.ok}</div>}
      {msg.err && <div style={{ color: "var(--crit)", fontSize: 12.5, marginTop: 8 }}>{msg.err}</div>}
    </Card>
  );
}

function ZapSignCard() {
  const [st, setSt] = useState<{ configurado: boolean; ambiente?: string; last4?: string | null } | null>(null);
  const [token, setToken] = useState("");
  const [ambiente, setAmbiente] = useState<"producao" | "sandbox">("producao");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  async function load() {
    try { const d = await jget("/api/zapsign/config"); setSt(d); if (d?.ambiente === "sandbox") setAmbiente("sandbox"); }
    catch { setSt({ configurado: false }); }
  }
  useEffect(() => { load(); }, []);

  async function salvar() {
    if (busy || !token.trim()) return;
    setBusy(true); setMsg({});
    try { await jsend("/api/zapsign/config", "POST", { token: token.trim(), ambiente }); setToken(""); setMsg({ ok: "Token salvo. Clique em testar pra confirmar." }); await load(); }
    catch (e: any) { setMsg({ err: e?.message || "erro ao salvar" }); }
    setBusy(false);
  }
  async function testar() {
    if (busy) return;
    setBusy(true); setMsg({});
    try {
      const r = await jsend("/api/zapsign/testar", "POST", {});
      setMsg({ ok: `Conectado! A ZapSign respondeu: ${r.pendentes} documento(s) pendente(s) de assinatura${r.ambiente === "sandbox" ? " · ambiente de teste" : ""}.` });
    } catch (e: any) { setMsg({ err: e?.message || "a ZapSign recusou — confira o token e o ambiente" }); }
    setBusy(false);
  }
  async function remover() {
    if (busy || !window.confirm("Remover o token da ZapSign?\n\nOs nós ZapSign dos fluxos param de funcionar (registram no log e o fluxo segue).")) return;
    setBusy(true); setMsg({});
    try { await jsend("/api/zapsign/config", "POST", { token: "" }); setMsg({ ok: "Token removido." }); await load(); }
    catch (e: any) { setMsg({ err: e?.message || "erro" }); }
    setBusy(false);
  }

  return (
    <Card title="ZapSign (assinatura eletrônica)" icon="pencil"
      sub="Com o token salvo, o nó ZapSign dos fluxos consulta as assinaturas pendentes — por exemplo, um aviso diário pra equipe com quem ainda não assinou o contrato.">
      {st?.configurado && (
        <div style={{ marginBottom: 10 }}>
          <span className="tpl-status on" style={{ background: "rgba(37,211,102,.16)", color: "var(--accent-deep)", fontWeight: 700 }}>
            Conectado · token …{st.last4}{st.ambiente === "sandbox" ? " · TESTE (sandbox)" : ""}
          </span>
        </div>
      )}
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        Onde pegar: na ZapSign, <b>Configurações → Integração → ZAPSIGN API</b> (exige plano de API). Ele fica guardado criptografado e não aparece de volta.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="inp" style={{ flex: "1 1 220px" }} type="password" autoComplete="off"
          placeholder={st?.configurado ? "•••••••••• (trocar o token)" : "cole o token da API da ZapSign"}
          value={token} onChange={(e) => setToken(e.target.value)} />
        <select className="inp" style={{ flex: "0 0 150px" }} value={ambiente} onChange={(e) => setAmbiente(e.target.value as "producao" | "sandbox")}>
          <option value="producao">Produção</option>
          <option value="sandbox">Teste (sandbox)</option>
        </select>
        <button className="btn primary" disabled={busy || !token.trim()} onClick={salvar}>{busy ? "…" : "salvar token"}</button>
        {st?.configurado && <button className="btn" disabled={busy} onClick={testar}>testar conexão</button>}
        {st?.configurado && <button className="btn" disabled={busy} onClick={remover}>remover</button>}
      </div>
      {msg.ok && <div style={{ color: "var(--accent-deep)", fontSize: 12.5, marginTop: 8 }}>{msg.ok}</div>}
      {msg.err && <div style={{ color: "var(--crit)", fontSize: 12.5, marginTop: 8 }}>{msg.err}</div>}
    </Card>
  );
}

// ── Google Contatos (OAuth por usuário) ───────────────────────────────────────────────────────
// Diferente do card acima (conta de serviço p/ Planilha/Agenda): o Google Contatos PESSOAL só é
// gravável com o login/consentimento OAuth do dono da conta. "Conectar" leva pra tela do Google;
// na volta, o callback do motor guarda o refresh_token e redireciona pra cá com ?google_contatos=ok.
function GoogleContatosCard() {
  const { session } = useAuth();
  const ehAdmin = session?.user.role === "admin";
  const [st, setSt] = useState<{ connected: boolean; completo?: boolean; email?: string | null; configurado?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [testando, setTestando] = useState(false);
  const [planilhaUrl, setPlanilhaUrl] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; err?: string; link?: string; ativarUrl?: string }>({});

  async function load() {
    try { setSt(await jget("/api/app/google/contacts/status")); } catch { setSt({ connected: false }); }
  }
  useEffect(() => { load(); }, []);

  // Lê o resultado da volta do Google (?google_contatos=ok|erro|sem_refresh) e limpa a URL.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const r = p.get("google_contatos");
      if (!r) return;
      if (r === "ok") setMsg({ ok: "Google Contatos conectado! ✅" });
      else if (r === "sem_refresh") setMsg({ err: "O Google não devolveu a permissão de acesso contínuo. Revogue em myaccount.google.com/permissions e conecte de novo." });
      else setMsg({ err: "Não consegui conectar — tente de novo." });
      p.delete("google_contatos");
      window.history.replaceState({}, "", window.location.pathname + (p.toString() ? "?" + p.toString() : ""));
    } catch { /* SSR */ }
  }, []);

  async function conectar() {
    if (busy) return;
    setBusy(true); setMsg({});
    try {
      const r = await jsend("/api/app/google/contacts/connect", "POST", {});
      if (r?.url) { window.location.href = r.url; return; } // vai pra tela de consentimento do Google
      setMsg({ err: r?.error || "não consegui iniciar a conexão" });
    } catch (e: any) { setMsg({ err: e?.message || "erro ao conectar" }); }
    setBusy(false);
  }
  async function testar() {
    if (testando) return;
    setTestando(true); setMsg({});
    try {
      await jsend("/api/app/google/contacts/test", "POST", {});
      setMsg({ ok: "Contato \"Teste ZapConverte\" criado! Se está aí, o passo do fluxo funciona.", link: "https://contacts.google.com" });
    } catch (e: any) {
      setMsg({ err: e?.message || "não consegui criar o contato de teste" });
      await load(); // a autorização pode ter vencido — o card volta pra "desconectado"
    }
    setTestando(false);
  }
  // Testa um escopo específico (doc | planilha | agenda) e devolve o LINK do que foi criado —
  // é o que prova a funcionalidade de cada permissão (e o que o vídeo de verificação precisa mostrar).
  async function testarOutro(oque: "doc" | "planilha" | "agenda", rotulo: string) {
    if (testando) return;
    setTestando(true); setMsg({});
    try {
      const r = await jsend(`/api/app/google/test/${oque}`, "POST", oque === "planilha" && planilhaUrl.trim() ? { sheetUrl: planilhaUrl.trim() } : {});
      setMsg({ ok: `${rotulo} criado!`, link: r?.link });
    } catch (e: any) {
      const bruto = String(e?.message || "");
      // "API has not been used in project … or it is disabled" — o Google manda a URL de ativar no
      // meio de um texto em inglês. Vira aviso em português com botão, em vez de erro cru.
      const m = bruto.match(/https:\/\/console\.(?:developers|cloud)\.google\.com\/[^\s]+/);
      if (m && /has not been used|is disabled/i.test(bruto)) {
        const nomeApi = oque === "doc" ? "Google Docs" : oque === "planilha" ? "Google Sheets" : "Google Calendar";
        setMsg({
          err: `A API do ${nomeApi} ainda não está ativada no projeto do Google. Ative (leva 1 minuto e é de graça) e clique no teste de novo.`,
          ativarUrl: m[0],
        });
      } else {
        setMsg({ err: bruto || `não consegui criar o ${rotulo.toLowerCase()}` });
        await load();
      }
    }
    setTestando(false);
  }
  async function desconectar() {
    if (busy || !window.confirm("Desconectar o Google Contatos? O nó Google Contatos dos fluxos para de salvar.")) return;
    setBusy(true); setMsg({});
    try { await jsend("/api/app/google/contacts/disconnect", "POST", {}); setMsg({ ok: "Desconectado." }); await load(); }
    catch (e: any) { setMsg({ err: e?.message || "erro" }); }
    setBusy(false);
  }

  return (
    <Card title="Conectar o Google" sub="Libera os passos Contatos, Docs, Planilha e Agenda nos seus fluxos. Existem duas formas de conectar — comece pela primeira, que é a fácil.">
      <div className="via-titulo">
        <span className="via-num">1</span>
        <div>
          <b>Jeito fácil — recomendado</b>
          <div className="muted" style={{ fontSize: 12 }}>Um clique, você escolhe sua conta e autoriza. Não precisa criar nem compartilhar nada.</div>
        </div>
      </div>
      <div className={"conn-item" + (st?.connected ? " on" : "")} style={{ marginBottom: 10 }}>
        {/* Logos oficiais em vez de emoji (pedido do dono, 06/10; regra: nada de emoji como ícone). */}
        <GoogleG /><b>Conta Google</b>
        <span className={"tpl-status" + (st?.connected ? " on" : "")}>{st == null ? "…" : st.connected ? "Conectado" : "Desconectado"}</span>
      </div>
      {/* O que este login libera — num relance. "Reconecte" = autorização antiga, só Contatos. */}
      <div className="conn-grid" style={{ marginBottom: 10 }}>
        {([["contatos", "Contatos", true], ["docs", "Docs", false], ["planilha", "Planilha", false], ["agenda", "Agenda", false]] as Array<[string, string, boolean]>).map(([logo, nome, soContatos]) => {
          const ok = !!st?.connected && (soContatos || st.completo !== false);
          return (
            <div key={nome} className={"conn-item" + (ok ? " on" : "")}>
              <LogoGoogle de={logo} /><b>{nome}</b>
              <span className={"tpl-status" + (ok ? " on" : "")}>{st == null ? "…" : ok ? "Ativo" : st.connected ? "Reconecte" : "—"}</span>
            </div>
          );
        })}
      </div>
      {/* Conexão FEITA antes de Docs/Planilha/Agenda existirem: o Google não amplia escopo de token
          antigo, então só reconectando. O nó avisa a mesma coisa se alguém tentar usar. */}
      {st?.connected && st.completo === false && (
        <div className="ask-note" style={{ marginBottom: 10, borderColor: "var(--warn)", background: "color-mix(in srgb, var(--warn) 12%, transparent)" }}>
          <b>Reconecte pra liberar Docs, Planilha e Agenda.</b> Sua autorização é de antes desses
          conectores e cobre só os Contatos — o Google não amplia permissão de uma autorização
          antiga. Clique em <b>Conectar com o Google</b> de novo (leva 10 segundos e não desfaz nada).
        </div>
      )}
      {st?.connected && st.email && (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Conta: <b>{st.email}</b></div>
      )}
      {/* NÃO CONFIGURADO. Pro cliente isso não é problema dele — ele não cria nada no Google. Pro
          admin (dono da plataforma) é um cadastro ÚNICO que libera o botão pra todos os clientes. */}
      {st && st.configurado === false && (
        ehAdmin ? (
          <div className="ask-note" style={{ marginBottom: 10 }}>
            <b>Falta o cadastro único da plataforma.</b> O app OAuth do ZapConverte não está
            configurado no servidor, então o botão fica desligado — pros clientes e pra você.
            O passo a passo completo está em <code>docs/google-contatos-setup.md</code> (inclui o
            que quase sempre é esquecido: além do <code>deploy/.env</code>, as variáveis precisam
            estar no <b>stack</b> e no <b>deploy.sh</b>, senão não chegam no contêiner).
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            Estamos liberando este conector — ele aparece aqui assim que estiver disponível. Você não
            precisa configurar nada: quando abrir, é só clicar e autorizar com a sua conta Google.
          </div>
        )
      )}
      {st?.configurado !== false && !st?.connected && (
        <>
          <button className="btn primary" onClick={conectar} disabled={busy}>
            {busy ? "…" : "Conectar com o Google"}
          </button>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Um clique: abre a tela do Google, você escolhe a sua conta e autoriza. Só isso.
          </div>
        </>
      )}
      {st?.connected && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flexBasis: "100%" }}>
            <div className="teste-titulo">Testar se está funcionando</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Cada botão cria algo de verdade na sua conta Google — é a prova de que o passo do fluxo vai
              funcionar. Pode apagar depois.
            </div>
          </div>
          <button className="btn primary" onClick={testar} disabled={testando}>
            {testando ? "criando…" : <><LogoGoogle de="contatos" pequeno /> Criar contato de teste</>}
          </button>
          {st.completo !== false && (
            <>
              <div style={{ flexBasis: "100%", marginBottom: 2 }}>
                <input className="inp" value={planilhaUrl} onChange={(e) => setPlanilhaUrl(e.target.value)}
                  placeholder="Opcional: cole o link de uma planilha SUA pra escrever nela" />
                <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                  Com o login Google você <b>não precisa compartilhar</b> a planilha com ninguém — ele escreve
                  como você. Em branco, o botão cria uma planilha nova.
                </div>
              </div>
              <button className="btn" onClick={() => testarOutro("doc", "Documento")} disabled={testando}><LogoGoogle de="docs" pequeno /> Criar documento de teste</button>
              <button className="btn" onClick={() => testarOutro("planilha", planilhaUrl.trim() ? "Linha na planilha" : "Planilha")} disabled={testando}>
                <LogoGoogle de="planilha" pequeno /> {planilhaUrl.trim() ? "Escrever na minha planilha" : "Criar planilha de teste"}
              </button>
              <button className="btn" onClick={() => testarOutro("agenda", "Evento")} disabled={testando}><LogoGoogle de="agenda" pequeno /> Criar evento de teste</button>
            </>
          )}
          {st.completo === false && (
            <button className="btn primary" onClick={conectar} disabled={busy}>Reconectar (libera Docs/Planilha/Agenda)</button>
          )}
          <button className="btn" onClick={desconectar} disabled={busy}>Desconectar</button>
        </div>
      )}
      {msg.ok && (
        <div className="muted" style={{ color: "var(--accent-deep)", fontSize: 12.5, marginTop: 8 }}>
          {msg.ok}{" "}
          {msg.link && <a href={msg.link} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>Abrir ↗</a>}
        </div>
      )}
      {msg.err && (
        <div style={{ color: "var(--crit)", fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
          {msg.err}
          {msg.ativarUrl && (
            <div style={{ marginTop: 8 }}>
              <a className="btn primary" href={msg.ativarUrl} target="_blank" rel="noopener noreferrer"
                 style={{ display: "inline-flex", textDecoration: "none" }}>Ativar a API no Google ↗</a>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Conectores Google (conta de serviço — mesma arquitetura provada no Sua Empresa) ──────
// O usuário cria a conta de serviço no Google Cloud, cola o JSON aqui (vai criptografado pro
// motor) e compartilha a planilha com o e-mail dela. O nó "📊 Planilha Google" dos fluxos usa isto.
function ConectoresCard() {
  const [st, setSt] = useState<{ connected: boolean; clientEmail: string | null } | null>(null);
  const [json, setJson] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [calId, setCalId] = useState("");
  const [calLink, setCalLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  async function load() {
    try { setSt(await jget("/api/app/google/status")); } catch { setSt({ connected: false, clientEmail: null }); }
  }
  useEffect(() => { load(); }, []);

  async function conectar() {
    if (!json.trim() || busy) return;
    setBusy(true); setMsg({});
    try {
      await jsend("/api/app/google/connect", "POST", { json });
      setJson("");
      setMsg({ ok: "Google conectado ✅ Agora compartilhe a planilha com o e-mail abaixo (como Editor) e teste a escrita." });
      await load();
    } catch (e: any) { setMsg({ err: e.message }); }
    finally { setBusy(false); }
  }
  async function desconectar() {
    if (busy || !window.confirm("Desconectar o Google? O nó Planilha Google dos fluxos para de escrever.")) return;
    setBusy(true); setMsg({});
    try { await jsend("/api/app/google/disconnect", "POST", {}); setMsg({ ok: "Desconectado." }); await load(); }
    catch (e: any) { setMsg({ err: e.message }); }
    finally { setBusy(false); }
  }
  async function testar() {
    if (busy) return;
    setBusy(true); setMsg({});
    try {
      await jsend("/api/app/google/test-sheets", "POST", { sheetUrl });
      setMsg({ ok: "Linha escrita na planilha ✅ Abre ela e confere: “Teste · data/hora · Conexão OK”." });
    } catch (e: any) { setMsg({ err: e.message }); }
    finally { setBusy(false); }
  }
  async function testarAgenda() {
    if (busy) return;
    setBusy(true); setMsg({}); setCalLink("");
    try {
      const r = await jsend("/api/app/google/test-calendar", "POST", { calendarId: calId });
      setCalLink(r?.link || "");
      setMsg({ ok: "Evento criado na agenda ✅ “Teste ZapConverte” daqui a 30 minutos — pode apagar depois." });
    } catch (e: any) { setMsg({ err: e.message }); }
    finally { setBusy(false); }
  }
  function copiaEmail() {
    if (st?.clientEmail) { navigator.clipboard?.writeText(st.clientEmail).catch(() => {}); setMsg({ ok: "E-mail copiado 📋 — cole no Compartilhar da planilha (Editor)." }); }
  }

  return (
    <Card title="Outra forma de conectar (só se a primeira não servir)">
      <div className="via-titulo">
        <span className="via-num alt">2</span>
        <div>
          <b>Jeito manual — para quem já usava assim</b>
          <div className="muted" style={{ fontSize: 12 }}>
            Você cria uma conta de robô no Google Cloud e <b>compartilha cada planilha e agenda</b> com o
            e-mail dela. Dá mais trabalho e <b>não</b> serve pros Contatos. Se você já conectou pelo jeito
            fácil ali em cima, <b>ignore esta parte</b>.
          </div>
        </div>
      </div>
      <details className="conn-passo">
        <summary className="conn-summary">{st?.connected ? "Conta de robô conectada — mostrar configuração e testes" : "Quero usar o jeito manual mesmo assim"}</summary>
        <div style={{ marginTop: 12 }}>

      {st != null && !st.connected && (
        <>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Cole aqui o JSON da conta de serviço (arquivo baixado do Google Cloud)</label>
            <textarea className="inp" style={{ minHeight: 96, fontFamily: "var(--mono)", fontSize: 11.5 }} value={json}
              onChange={(e) => setJson(e.target.value)} placeholder={'{ "type": "service_account", "project_id": "…", "private_key": "…", "client_email": "…@…iam.gserviceaccount.com", … }'} />
          </div>
          <button className="btn primary" onClick={conectar} disabled={busy || !json.trim()}>{busy ? "…" : "Conectar Google"}</button>
        </>
      )}

      {st?.connected && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="set-line">
            <span className="muted">Conta de serviço</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <b style={{ fontSize: 12, fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.clientEmail}</b>
              <button className="btn" style={{ padding: "3px 9px", fontSize: 11.5, flex: "none" }} onClick={copiaEmail}>Copiar</button>
            </span>
          </div>
          <div className="field">
            <label>Testar escrita — cole o LINK da planilha</label>
            <input className="inp" type="url" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…" />
            <div className="muted" style={{ fontSize: 12 }}>⚠️ É o <b>link da planilha</b> (copie da barra do navegador) — não é palavra-chave nem outro texto. E ela precisa estar <b>compartilhada</b> com o e-mail acima como <b>Editor</b>.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" onClick={testar} disabled={busy || !sheetUrl.trim()}>{busy ? "…" : "Testar escrita"}</button>
            <button className="btn" onClick={desconectar} disabled={busy}>Desconectar</button>
          </div>

          <div className="field" style={{ marginTop: 6, paddingTop: 12, borderTop: "1px solid var(--line-2)" }}>
            <label><LogoGoogle de="agenda" pequeno /> Testar Agenda — ID da agenda (na pessoal, é o seu e-mail do Google)</label>
            <input className="inp" type="email" value={calId} onChange={(e) => setCalId(e.target.value)} placeholder="voce@gmail.com" />
            <div className="muted" style={{ fontSize: 12 }}>Antes: no Google Agenda → ⚙️ da sua agenda → <b>Compartilhar com pessoas específicas</b> → cole o e-mail da conta de serviço → permissão <b>“Fazer alterações nos eventos”</b>. E ative a <b>Google Calendar API</b> na Biblioteca do projeto.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn primary" onClick={testarAgenda} disabled={busy || !calId.trim()}>{busy ? "…" : "Criar evento de teste"}</button>
            {calLink && <a className="btn ic" href={calLink} target="_blank" rel="noopener noreferrer">Abrir o evento ↗</a>}
          </div>
        </div>
      )}

      {msg.ok && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--accent-deep)" }}>{msg.ok}</div>}
      {msg.err && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--crit)" }}>{msg.err}</div>}

      <details className="conn-passo">
        <summary className="conn-summary">📖 Como conectar (passo a passo à prova de erro)</summary>
        <div className="conn-passos">
          <div><b>1 · Projeto e API</b><br />Entre em <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer">console.cloud.google.com</a> → crie um projeto (ou use um existente) → Menu ☰ <b>→ APIs e serviços → Biblioteca</b> → busque <b>“Google Sheets API”</b> → <b>Ativar</b>. (Aproveite e ative Docs/Drive/Calendar pros próximos conectores.)</div>
          <div><b>2 · Conta de serviço</b><br />Menu ☰ <b>→ APIs e serviços → Credenciais</b> → <b>+ Criar credenciais → Conta de serviço</b> → dê um nome (ex.: <code>zapconverte</code>) → <b>Criar e continuar</b> → as 2 telas seguintes são opcionais → <b>Concluído</b>.</div>
          <div><b>3 · Baixar a chave JSON</b><br />Clique no <b>e-mail da conta</b> que apareceu → aba <b>Chaves</b> → <b>Adicionar chave → Criar nova chave</b> → marque <b>JSON</b> → <b>Criar</b> → o arquivo baixa sozinho ⬇️</div>
          <div><b>4 · Conectar aqui</b><br />Abra o arquivo baixado → selecione TUDO e copie → <b>cole no campo acima</b> → <b>Conectar Google</b>.</div>
          <div><b>5 · Copiar o e-mail da conta</b><br />Depois de conectar, o e-mail aparece aqui em cima (termina em <code>@…iam.gserviceaccount.com</code>) → botão <b>Copiar</b>. (Também está em <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer">IAM → Contas de serviço</a>.)</div>
          <div><b>6 · Compartilhar a planilha</b><br />Abra sua planilha → <b>Compartilhar</b> (canto superior direito) → cole o e-mail → deixe como <b>Editor</b> → <b>Enviar</b> → volte aqui → cole o <b>link</b> da planilha → <b>Testar escrita</b> ✅</div>
          <div><b>7 · (Agenda) Compartilhar a agenda</b><br />No <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer">Google Agenda</a> → passe o mouse na sua agenda (lista à esquerda) → ⋮ <b>→ Configurações e compartilhamento</b> → <b>Compartilhar com pessoas específicas</b> → cole o e-mail da conta de serviço → permissão <b>“Fazer alterações nos eventos”</b> → ative também a <b>Google Calendar API</b> na Biblioteca (passo 1) → volte aqui → <b>Criar evento de teste</b> ✅</div>
        </div>
      </details>
        </div>
      </details>
    </Card>
  );
}

// Logos dos produtos Google (app/web/public/google/*.png, vindos da pasta PRINTS do dono).
function LogoGoogle({ de, pequeno }: { de: string; pequeno?: boolean }) {
  const cls = pequeno ? "g-logo sm" : "g-logo";
  // Planilha e Agenda em SVG: os arquivos da pasta eram JPG com fundo branco e margem — no tema
  // escuro viravam um quadrado branco (print do dono, 06/10). Contatos e Docs têm PNG transparente.
  if (de === "planilha") {
    return (
      <svg className={cls} viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#0F9D58" d="M30 4H12a4 4 0 0 0-4 4v32a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4V14L30 4z" />
        <path fill="#087F42" d="M30 4v6a4 4 0 0 0 4 4h6L30 4z" />
        <path fill="#fff" d="M15 22h18v14H15V22zm2.5 2.5v3h5.5v-3h-5.5zm8 0v3h5.5v-3h-5.5zm-8 5.5v3h5.5v-3h-5.5zm8 0v3h5.5v-3h-5.5z" />
      </svg>
    );
  }
  if (de === "agenda") {
    return (
      <svg className={cls} viewBox="0 0 48 48" aria-hidden="true">
        <rect x="6" y="6" width="36" height="36" rx="6" fill="#4285F4" />
        <rect x="6" y="6" width="36" height="12" rx="6" fill="#1967D2" />
        <rect x="6" y="14" width="36" height="4" fill="#1967D2" />
        <circle cx="16" cy="12" r="2" fill="#fff" /><circle cx="32" cy="12" r="2" fill="#fff" />
        <text x="24" y="36" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="17" fill="#fff">31</text>
      </svg>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/google/${de}.png`} alt="" className={cls} />;
}
// O "G" do Google, em SVG (não há arquivo dele na pasta).
function GoogleG() {
  return (
    <svg className="g-logo" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.2c-.3 2-1.6 5-4.6 7l7 5.4c4.1-3.8 6.5-9.4 6.5-15.7z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.6-5.4l-7-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.9-12.5-9.2l-7.3 5.6C7.8 41 15.3 46 24 46z" />
      <path fill="#FBBC05" d="M11.5 28.2c-.5-1.4-.7-2.8-.7-4.2s.3-2.9.7-4.2l-7.3-5.6C2.8 17 2 20.4 2 24s.8 7 2.2 9.8l7.3-5.6z" />
      <path fill="#EA4335" d="M24 10.6c3.3 0 5.5 1.4 6.8 2.6l5-4.9C32.7 5.4 28.5 3 24 3 15.3 3 7.8 8 4.2 15.2l7.3 5.6C13.3 14.5 18.2 10.6 24 10.6z" />
    </svg>
  );
}

// ── Origem dos leads pela página (UTM/gclid) ─────────────────────────────────────────────────
// O lead que chega pelo WhatsApp não traz de onde veio. Este snippet, colado na página do cliente,
// avisa o motor no clique do botão (UTMs + código) e esconde o código na mensagem em caracteres
// invisíveis; o motor casa os dois na 1ª mensagem (engine/clique-origem.ts, 06/10).
function OrigemPaginaCard() {
  const [t, setT] = useState<{ token: string; url: string } | null>(null);
  const [copiado, setCopiado] = useState("");
  useEffect(() => { jget("/api/clique/token").then(setT).catch(() => setT(null)); }, []);
  const snippet = t ? `<script>
(function(){
  var URL_ZC = "${t.url}";
  var A = "abcdefghijklmnopqrstuvwxyz234567", cod = "";
  for (var i = 0; i < 6; i++) cod += A.charAt(Math.floor(Math.random() * 32));
  var marca = "";
  for (var j = 0; j < 6; j++) { var n = A.indexOf(cod.charAt(j)); for (var b = 4; b >= 0; b--) marca += ((n >> b) & 1) ? "\u200c" : "\u200b"; }
  var p = new URLSearchParams(location.search), d = { codigo: cod, pagina: location.pathname };
  ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","fbclid"].forEach(function (k) { if (p.get(k)) d[k] = p.get(k); });
  document.querySelectorAll('a[href*="wa.me"],a[href*="whatsapp.com"]').forEach(function (a) {
    try { var u = new URL(a.href); u.searchParams.set("text", (u.searchParams.get("text") || "") + marca); a.href = u.toString(); } catch (e) {}
    a.addEventListener("click", function () { try { navigator.sendBeacon(URL_ZC, new Blob([JSON.stringify(d)], { type: "text/plain" })); } catch (e) {} });
  });
})();
</script>` : "";
  function copiar(txt: string, rot: string) { navigator.clipboard?.writeText(txt).then(() => { setCopiado(rot); setTimeout(() => setCopiado(""), 1800); }); }
  return (
    <Card title="Origem dos leads pela sua página (UTM)" sub="Quem chega pelo WhatsApp não traz de onde veio. Com este trecho na sua página, o clique no botão de WhatsApp avisa o ZapConverte com as UTMs e o gclid, e a 1ª mensagem do lead é casada com o clique. O lead não vê nada de diferente.">
      {!t ? <div className="muted" style={{ fontSize: 12.5 }}>Carregando…</div> : (
        <>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: 8 }}>
            Cole antes do <code>&lt;/body&gt;</code> da página que tem o botão de WhatsApp (links <code>wa.me</code>). As UTMs e o gclid da URL da página
            (ex.: <code>?utm_source=google&amp;utm_campaign=…&amp;gclid=…</code>) chegam na ficha do contato e viram <code>{"{{utm_source}}"}</code>, <code>{"{{utm_campaign}}"}</code>,
            <code>{"{{gclid}}"}</code>… nos fluxos. Na conversa aparece o selo <b>ADS</b>.
          </div>
          <textarea className="inp" readOnly rows={8} value={snippet} style={{ fontFamily: "var(--mono)", fontSize: 11.5 }} onFocus={(e) => e.currentTarget.select()} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={() => copiar(snippet, "snippet")}>{copiado === "snippet" ? "Copiado" : "Copiar o trecho"}</button>
            <button className="btn" onClick={() => copiar(t.url, "url")}>{copiado === "url" ? "Copiado" : "Copiar só o endereço"}</button>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>
            Se o lead apagar a mensagem pré-preenchida e escrever a dele, o código se perde e a origem fica em branco. O clique vale por 7 dias.
          </div>
        </>
      )}
    </Card>
  );
}
