"use client";

import { useEffect, useRef, useState } from "react";
import { jget, jsend } from "@/lib/client";
import { Icon } from "@/components/icons";
import { useT } from "@/lib/i18n";

interface MetaCfg {
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  accessTokenLast4?: string;
  accessTokenConfigured?: boolean;
  appSecret: string;
  appSecretConfigured?: boolean;
  verifyToken: string;
  connected: boolean;
  displayNumber: string;
  verifiedName: string;
  webhookUrl: string;
}


function CopyField({ label, value }: { label: string; value: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="inp" readOnly value={value} style={{ fontFamily: "var(--mono)", fontSize: 12.5 }} onFocus={(e) => e.currentTarget.select()} />
        <button
          className="btn"
          onClick={() => {
            try {
              navigator.clipboard?.writeText(value);
            } catch {
              /* ignore */
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? t("comum.copiado") : t("comum.copiar")}
        </button>
      </div>
    </div>
  );
}

// ── Conectar com a Meta em 1 CLIQUE (Embedded Signup / Tech Provider) ────────
// O caminho manual abaixo tem ~8 passos e travou o próprio Admin 3× (token do webhook, número
// principal quase migrado, App Review sem precisar). Aqui é: clica → popup da Meta → pronto.
// Só aparece quando o servidor tem o app configurado (META_APP_ID / SECRET / ES_CONFIG_ID);
// sem isso seria um botão que não funciona, então nem mostramos.
declare global { interface Window { FB?: any; fbAsyncInit?: () => void } }

function ConectarComMeta({ onPronto }: { onPronto: () => void }) {
  const t = useT();
  const [cfg, setCfg] = useState<{ disponivel: boolean; appId: string; configId: string } | null>(null);
  const [sdkPronto, setSdkPronto] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState("");
  const [etapas, setEtapas] = useState<Record<string, string> | null>(null);
  const [pin, setPin] = useState("");
  // O popup manda waba_id/phone_number_id por postMessage, e o FB.login devolve o code por callback.
  // Chegam em ordens diferentes, então guardamos num ref e só chamamos o motor quando temos o code.
  const doPopup = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  useEffect(() => {
    jget("/api/meta/embedded").then((d) => {
      setCfg(d);
      if (!d?.disponivel) return;
      // Escuta o que o popup da Meta conta durante o cadastro (conta escolhida, número criado).
      const ouvinte = (e: MessageEvent) => {
        if (!/facebook\.com$/.test(new URL(e.origin).hostname)) return;
        try {
          const d2 = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
          if (d2?.type !== "WA_EMBEDDED_SIGNUP") return;
          if (d2?.data?.waba_id) doPopup.current.wabaId = String(d2.data.waba_id);
          if (d2?.data?.phone_number_id) doPopup.current.phoneNumberId = String(d2.data.phone_number_id);
        } catch { /* mensagem de outro fluxo do facebook — ignora */ }
      };
      window.addEventListener("message", ouvinte);
      if (window.FB) { window.FB.init({ appId: d.appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" }); setSdkPronto(true); return; }
      window.fbAsyncInit = () => { window.FB.init({ appId: d.appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" }); setSdkPronto(true); };
      const s = document.createElement("script");
      s.src = "https://connect.facebook.net/pt_BR/sdk.js";
      s.async = true; s.defer = true; s.crossOrigin = "anonymous";
      s.onerror = () => setErro(t("conexao.erroSdk"));
      document.body.appendChild(s);
      return () => window.removeEventListener("message", ouvinte);
    }).catch(() => setCfg({ disponivel: false, appId: "", configId: "" }));
  }, []);

  function conectar() {
    if (!cfg?.disponivel || !window.FB || conectando) return;
    setErro(""); setEtapas(null); doPopup.current = {};
    window.FB.login(async (resp: any) => {
      const code = resp?.authResponse?.code;
      if (!code) { setErro(t("conexao.erroPopupFechado")); return; }
      setConectando(true);
      try {
        const d = await jsend("/api/meta/embedded", "POST", { code, ...doPopup.current, pin });
        setEtapas(d.etapas ?? {});
        onPronto();
      } catch (e: any) {
        setErro(e?.message || t("conexao.erroConexao"));
      }
      setConectando(false);
    }, {
      config_id: cfg.configId,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
    });
  }

  if (!cfg?.disponivel) return null;

  return (
    <div className="card es-card">
      <div className="card-pad">
        <div className="es-topo">
          <span className="disp2-ico"><Icon name="spark" size={18} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 15 }}>{t("conexao.esTitulo")}</b>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {t("conexao.esSubtitulo")}
            </div>
          </div>
        </div>
        <div className="es-pin">
          <label className="lbl" style={{ margin: 0 }}>{t("conexao.pinRotulo")} <span className="muted" style={{ fontWeight: 400 }}>{t("conexao.pinAjuda")}</span></label>
          <input className="inp" style={{ width: 130, fontFamily: "var(--mono)", letterSpacing: 2 }} inputMode="numeric" maxLength={6}
            placeholder="000000" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          <span className="muted" style={{ fontSize: 11.5 }}>{t("conexao.pinAviso")}</span>
        </div>
        <button className="btn primary" style={{ padding: "11px 22px", fontWeight: 700 }} onClick={conectar} disabled={!sdkPronto || conectando}>
          {conectando ? t("conexao.conectando") : sdkPronto ? t("conexao.botaoConectar") : t("conexao.carregandoConector")}
        </button>
        {erro && <div style={{ color: "var(--crit)", fontSize: 13, marginTop: 10 }}>{erro}</div>}
        {etapas && (
          <div className="ia-avisos" style={{ marginTop: 12, background: "rgba(37,211,102,.08)", borderColor: "rgba(37,211,102,.35)" }}>
            <b style={{ color: "var(--accent-deep)" }}><Icon name="check" size={13} /> {t("conexao.conectado")}</b>
            {Object.entries(etapas).map(([k, v]) => <div key={k} className="linha"><b>{k}:</b> {v}</div>)}
          </div>
        )}
        <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
          {t("conexao.preferManual")}
        </div>
      </div>
    </div>
  );
}

// ── Outros números oficiais (2º, 3º…) ───────────────────────────────────────
// Quem já tinha um número conectado e clicava em "+ → API Oficial" caía na tela de "já conectado",
// onde o único botão é Reconfigurar — que SOBRESCREVE o número que funciona. Este card é o caminho
// certo: adiciona sem encostar no principal. Abre sozinho com ?novo=1 (é pra onde o "+" leva).
function NumerosExtras() {
  const t = useT();
  const [extras, setExtras] = useState<Array<{ id: string; nome: string; numero?: string; phoneNumberId: string }> | null>(null);
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ nome: "", phoneNumberId: "", wabaId: "", accessToken: "", appSecret: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const carrega = () => jget("/api/meta/extras").then((d) => setExtras(d.extras ?? [])).catch(() => setExtras([]));
  useEffect(() => {
    carrega();
    try { if (new URLSearchParams(window.location.search).get("novo") === "1") setAberto(true); } catch { /* SSR */ }
  }, []);

  async function adicionar() {
    if (busy) return;
    setBusy(true); setMsg("");
    try {
      const d = await jsend("/api/meta/extras", "POST", f);
      setMsg(t("conexao.extrasAdicionado", { nome: d.nome || d.numero || t("conexao.numeroFallback") }));
      setF({ nome: "", phoneNumberId: "", wabaId: "", accessToken: "", appSecret: "" });
      setAberto(false);
      carrega();
    } catch (e: any) { setMsg(e?.message || t("conexao.erroAdicionar")); }
    setBusy(false);
  }
  async function remover(id: string, nome: string) {
    if (!confirm(t("conexao.extrasRemoverConfirm", { nome }))) return;
    try { await fetch("/api/meta/extras/" + encodeURIComponent(id), { method: "DELETE" }); } catch { /* segue */ }
    carrega();
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>{t("conexao.extrasTitulo")}</h3>
        <span className="page-hint">{extras?.length ? t("conexao.extrasContagem", { n: extras.length }) : t("conexao.extrasVazio")}</span>
      </div>
      <div className="card-pad" style={{ display: "grid", gap: 10 }}>
        {(extras ?? []).map((e) => (
          <div key={e.id} className="disp2-arquivo">
            <span className="disp2-ico"><Icon name="phone" size={15} /></span>
            <div style={{ minWidth: 0 }}>
              <b style={{ display: "block" }}>{e.nome}</b>
              <span className="muted" style={{ fontSize: 12, fontFamily: "var(--mono)" }}>{e.numero || e.phoneNumberId}</span>
            </div>
            <button className="btn ic" style={{ marginLeft: "auto" }} title={t("conexao.extrasRemoverTitle")} onClick={() => remover(e.id, e.nome)}>
              <Icon name="trash" size={13} style={{ color: "var(--crit)" }} />
            </button>
          </div>
        ))}

        {!aberto ? (
          <button className="btn ic" style={{ justifySelf: "start" }} onClick={() => setAberto(true)}>
            <Icon name="plus" size={14} /> {t("conexao.extrasAdicionar")}
          </button>
        ) : (
          <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              {t("conexao.extrasAjuda")}
            </div>
            <div className="field"><label>{t("conexao.extrasApelido")}</label>
              <input className="inp" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder={t("conexao.extrasApelidoPlaceholder")} /></div>
            <div className="field"><label>Phone Number ID</label>
              <input className="inp" style={{ fontFamily: "var(--mono)" }} value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value.trim() })} /></div>
            <div className="field"><label>WABA ID</label>
              <input className="inp" style={{ fontFamily: "var(--mono)" }} value={f.wabaId} onChange={(e) => setF({ ...f, wabaId: e.target.value.trim() })} /></div>
            <div className="field"><label>{t("conexao.tokenPermanenteRotulo")}</label>
              <input className="inp" type="password" style={{ fontFamily: "var(--mono)" }} value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value.trim() })} /></div>
            <div className="field"><label>App Secret <span className="muted">{t("conexao.opcional")}</span></label>
              <input className="inp" type="password" style={{ fontFamily: "var(--mono)" }} value={f.appSecret} onChange={(e) => setF({ ...f, appSecret: e.target.value.trim() })} /></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn" onClick={() => { setAberto(false); setMsg(""); }}>{t("comum.cancelar")}</button>
              <button className="btn primary" style={{ marginLeft: "auto" }} onClick={adicionar} disabled={busy || !f.phoneNumberId || !f.accessToken}>
                {busy ? t("conexao.testandoNaMeta") : t("conexao.extrasAdicionarBotao")}
              </button>
            </div>
          </div>
        )}
        {msg && <div style={{ fontSize: 12.5, color: msg.startsWith("✅") ? "var(--accent-deep)" : "var(--crit)" }}>{msg}</div>}
      </div>
    </div>
  );
}

export function MetaConnect() {
  const t = useT();
  const [cfg, setCfg] = useState<MetaCfg | null>(null);
  const [editing, setEditing] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    jget("/api/meta")
      .then((d: MetaCfg) => {
        // O verifyToken agora vem PRONTO e JÁ PERSISTIDO do servidor (o handshake da Meta
        // funciona antes mesmo de salvar). Não geramos mais no navegador.
        setCfg(d);
        setEditing(!d.connected);
      })
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="card"><div className="card-pad"><b style={{ color: "var(--crit)" }}>{err}</b></div></div>;
  if (!cfg) return <div className="card"><div className="card-pad muted">{t("comum.carregando")}</div></div>;

  function set<K extends keyof MetaCfg>(k: K, v: MetaCfg[K]) {
    setCfg((c) => (c ? { ...c, [k]: v } : c));
  }

  async function testar() {
    if (!cfg) return;
    setTesting(true);
    setTest(null);
    try {
      const r = await jsend("/api/meta/test", "POST", { phoneNumberId: cfg.phoneNumberId, accessToken: cfg.accessToken });
      if (r.ok) {
        set("displayNumber", r.displayNumber);
        set("verifiedName", r.verifiedName);
        setTest({ ok: true, msg: t("conexao.testeOkNumero", { numero: r.displayNumber }) + (r.verifiedName ? ` · ${r.verifiedName}` : "") + (r.quality ? t("conexao.testeQualidade", { qualidade: r.quality }) : "") });
      } else {
        setTest({ ok: false, msg: r.error || t("conexao.testeFalhou") });
      }
    } catch (e: any) {
      setTest({ ok: false, msg: e.message });
    } finally {
      setTesting(false);
    }
  }

  async function salvar(markConnected: boolean) {
    if (!cfg) return;
    setStatus(t("comum.salvando"));
    try {
      const payload = { ...cfg, connected: markConnected || cfg.connected };
      await jsend("/api/meta", "PUT", payload);
      setCfg(payload);
      setStatus(t("conexao.salvo"));
      setTimeout(() => setStatus(""), 2500);
      if (markConnected) setEditing(false);
    } catch (e: any) {
      setStatus(e.message);
    }
  }

  if (cfg.connected && !editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
        <div className="card">
          <div className="card-pad" style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div className="auto-ico b-green" style={{ fontSize: 22 }}><Icon name="check" size={22} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 650 }}>{t("conexao.contaConectada")}</div>
              <div className="muted" style={{ fontSize: 13 }}>{cfg.displayNumber || t("conexao.numeroFallback")}{cfg.verifiedName ? ` · ${cfg.verifiedName}` : ""}</div>
            </div>
            <button className="btn" onClick={() => setEditing(true)}>{t("conexao.reconfigurar")}</button>
          </div>
        </div>
        <NumerosExtras />
        <PerfilOficial />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
      <ConectarComMeta onPronto={() => jget("/api/meta").then((d: MetaCfg) => setCfg(d)).catch(() => {})} />

      <div className="card">
        <div className="card-head"><h3>{t("conexao.tituloManual")}</h3><span className="page-hint">WhatsApp Cloud API</span></div>
        <div className="card-pad">
          <ol className="meta-steps">
            <li>{t("conexao.passo1")}</li>
            <li>{t("conexao.passo2")}</li>
            <li>{t("conexao.passo3")}</li>
            <li>{t("conexao.passo4")}</li>
            <li>{t("conexao.passo5")}</li>
            <li>{t("conexao.passo6")}</li>
            <li>{t("conexao.passo7")}</li>
            <li>{t("conexao.passo8")}</li>
          </ol>
          <div className="meta-aviso">
            <b>{t("conexao.avisosTitulo")}</b>
            <ul>
              <li>{t("conexao.avisoNumeroDedicado")}</li>
              <li>{t("conexao.avisoAppNaoPublicado")}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>{t("conexao.webhookTitulo")}</h3></div>
        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <CopyField label={t("conexao.webhookUrlRotulo")} value={cfg.webhookUrl} />
          <CopyField label={t("conexao.tokenVerificacaoRotulo")} value={cfg.verifyToken} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: -4 }}>
            {t("conexao.webhookTokenAtivo")}
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>{t("conexao.webhookAssineMessages")}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>{t("conexao.credenciaisTitulo")}</h3></div>
        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field"><label>Phone Number ID</label><input className="inp" value={cfg.phoneNumberId} onChange={(e) => set("phoneNumberId", e.target.value)} placeholder={t("conexao.phoneNumberIdPlaceholder")} /></div>
          <div className="field"><label>WhatsApp Business Account ID (WABA)</label><input className="inp" value={cfg.wabaId} onChange={(e) => set("wabaId", e.target.value)} /></div>
          <div className="field">
            <label>{t("conexao.accessTokenRotulo")}</label>
            <input className="inp" type="password" value={cfg.accessToken} onChange={(e) => set("accessToken", e.target.value)}
              placeholder={(cfg as any).accessTokenConfigured ? t("conexao.accessTokenSalvoPlaceholder", { last4: (cfg as any).accessTokenLast4 || "" }) : "EAAG…"} />
            {(cfg as any).accessTokenConfigured && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{t("conexao.tokenSoNoServidor")}</div>}
          </div>
          <div className="field">
            <label>{t("conexao.appSecretRotulo")}</label>
            <input className="inp" type="password" value={cfg.appSecret} onChange={(e) => set("appSecret", e.target.value)}
              placeholder={(cfg as any).appSecretConfigured ? t("conexao.appSecretSalvoPlaceholder") : t("conexao.appSecretPlaceholder")} />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{t("conexao.appSecretAjuda")}</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" onClick={testar} disabled={testing || !cfg.phoneNumberId || !(cfg.accessToken || (cfg as any).accessTokenConfigured)}>{testing ? t("conexao.testando") : t("conexao.testarConexao")}</button>
            <button className="btn primary" onClick={() => salvar(!!(test && test.ok))}>{test && test.ok ? t("conexao.salvarEConectar") : t("comum.salvar")}</button>
            {status && <span style={{ fontSize: 12.5, fontWeight: 600, color: status === t("conexao.salvo") || status === t("comum.salvando") ? "var(--accent-deep)" : "var(--crit)" }}>{status}</span>}
          </div>
          {test && (
            <div className="bubble" style={{ borderRadius: 12, display: "inline-flex", alignItems: "center", gap: 6, color: test.ok ? "var(--accent-deep)" : "var(--crit)" }}>
              <Icon name={test.ok ? "check" : "close"} size={16} />{test.msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Formata o tier de envio da Meta ("TIER_2K" → "2.000/24h"). Valor desconhecido = mostra CRU
// (diagnóstico: o dono vê exatamente o que a Graph devolveu em vez de um "—" mudo).
// Capacidade de envio no formato NOVO da Meta (nível, não número de conversas).
// `tr` é o t() do i18n, opcional de propósito: fora de componente não dá pra chamar o hook, e
// OficialMetricas.tsx importa formatTier sem tradutor — sem o parâmetro, cai no rótulo em pt.
export function rotuloThroughput(n?: string, tr?: (chave: string) => string): string {
  const v = String(n ?? "").toUpperCase();
  if (v === "STANDARD") return tr ? tr("conexao.throughputPadrao") : "Padrão";
  if (v === "HIGH") return tr ? tr("conexao.throughputAlta") : "Alta";
  if (v === "NOT_APPLICABLE") return tr ? tr("conexao.semLimiteFixo") : "Sem limite fixo";
  return v || "—";
}

export function formatTier(t?: string, tr?: (chave: string) => string): string {
  const raw = String(t ?? "").trim();
  if (!raw) return "—";
  const puro = raw.replace(/^TIER_/, "");
  if (/^UNLIMITED$/i.test(puro)) return tr ? tr("conexao.tierIlimitado") : "Ilimitado";
  const k = /^(\d+)K$/i.exec(puro);
  if (k) return (Number(k[1]) * 1000).toLocaleString("pt-BR");
  if (/^\d+$/.test(puro)) return Number(puro).toLocaleString("pt-BR");
  return raw; // formato novo/desconhecido → cru
}

// Detalhes da conexão + PERFIL comercial (o "Perfil" do Gerenciador dentro do painel):
// IDs copiáveis, qualidade, limite de envio, foto (trocável) e descrição.
function PerfilOficial() {
  const t = useT();
  const [d, setD] = useState<any | null>(null);
  const [erro, setErro] = useState("");
  const [desc, setDesc] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  function carregar() {
    jget("/api/oficial/perfil").then((x) => { setD(x); setDesc(x?.perfil?.description ?? ""); }).catch((e) => setErro(e.message));
  }
  useEffect(() => { carregar(); }, []);

  async function trocarFoto(f: File) {
    if (f.size > 5 * 1024 * 1024) { setMsg(t("conexao.perfilFotoGrande")); return; }
    setSalvando(true); setMsg("");
    try {
      const dataUri = await new Promise<string>((res, rej) => {
        const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error(t("conexao.perfilErroLerArquivo"))); fr.readAsDataURL(f);
      });
      await jsend("/api/oficial/perfil", "POST", { fotoDataUri: dataUri });
      setMsg(t("conexao.perfilFotoAtualizada"));
      carregar();
    } catch (e: any) { setMsg(e.message); }
    setSalvando(false);
  }
  async function salvarDesc() {
    setSalvando(true); setMsg("");
    try { await jsend("/api/oficial/perfil", "POST", { description: desc }); setMsg(t("conexao.perfilDescricaoSalva")); }
    catch (e: any) { setMsg(e.message); }
    setSalvando(false);
  }
  const copiar = (v: string) => navigator.clipboard?.writeText(v).then(() => { setMsg(t("conexao.copiadoAviso")); setTimeout(() => setMsg(""), 1200); });

  if (erro) return <div className="card"><div className="card-pad muted" style={{ fontSize: 13 }}>{erro}</div></div>;
  if (!d) return <div className="card"><div className="card-pad muted" style={{ fontSize: 13 }}>{t("conexao.perfilCarregando")}</div></div>;

  const q = String(d.qualidade ?? "NA");
  const qRot = q === "GREEN" ? t("conexao.throughputAlta") : q === "YELLOW" ? t("conexao.qualidadeMedia") : q === "RED" ? t("conexao.qualidadeBaixa") : "—";
  const qCor = q === "GREEN" ? "var(--accent-deep)" : q === "RED" ? "var(--crit)" : q === "YELLOW" ? "var(--warn)" : "var(--muted)";

  return (
    <div className="card"><div className="card-pad" style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <span className="pfp" style={{ width: 64, height: 64, flex: "none" }}>
          <span className="pfp-in">
            {d.perfil?.profile_picture_url
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={d.perfil.profile_picture_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <span className="acct-init" style={{ color: "var(--ink)" }}>{(d.nome || "?").slice(0, 2).toUpperCase()}</span>}
          </span>
        </span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <b style={{ fontSize: 15 }}>{d.nome || "—"}</b>
          <div className="muted" style={{ fontSize: 13 }}>{d.telefone}</div>
        </div>
        <label className="btn" style={{ cursor: "pointer" }}>
          {salvando ? t("comum.salvando") : t("conexao.trocarFoto")}
          <input type="file" accept="image/jpeg,image/png" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) trocarFoto(f); e.target.value = ""; }} />
        </label>
      </div>

      <div className="omx-tiles" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="card omx-tile"><span className="omx-rotulo">{t("conexao.tileQualidade")}</span><b style={{ color: qCor }}>{qRot}</b></div>
        <div className="card omx-tile">
          <span className="omx-rotulo">{t("conexao.tileLimiteEnvio")}</span>
          <b>{d.tier ? formatTier(d.tier, t) : d.throughput ? rotuloThroughput(d.throughput, t) : t("conexao.semLimiteFixo")}</b>
          <span className="muted omx-sub">{d.tier ? t("conexao.tileConversas24h") : d.throughput ? t("conexao.tileCapacidadeEnvio") : t("conexao.tileSemTeto")}</span>
        </div>
        <div className="card omx-tile" style={{ cursor: "pointer" }} onClick={() => copiar(d.wabaId)} title={t("conexao.cliqueParaCopiarTitle")}>
          <span className="omx-rotulo">WABA ID</span><b style={{ fontSize: 13, wordBreak: "break-all" }}>{d.wabaId || "—"}</b><span className="muted omx-sub">{t("conexao.cliqueParaCopiar")}</span>
        </div>
        <div className="card omx-tile" style={{ cursor: "pointer" }} onClick={() => copiar(d.phoneNumberId)} title={t("conexao.cliqueParaCopiarTitle")}>
          <span className="omx-rotulo">Phone Number ID</span><b style={{ fontSize: 13, wordBreak: "break-all" }}>{d.phoneNumberId || "—"}</b><span className="muted omx-sub">{t("conexao.cliqueParaCopiar")}</span>
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12.5, fontWeight: 700, display: "block", marginBottom: 5 }}>{t("conexao.descricaoPerfilRotulo")}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="inp" style={{ flex: 1 }} maxLength={512} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("conexao.descricaoPlaceholder")} />
          <button className="btn primary" onClick={salvarDesc} disabled={salvando}>{t("comum.salvar")}</button>
        </div>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: msg.includes("!") ? "var(--accent-deep)" : "var(--crit)" }}>{msg}</div>}
    </div></div>
  );
}
