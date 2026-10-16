"use client";

// Configurações UNIFICADA (admin + cliente, adapta por papel). Espelha o menu do Sua Empresa,
// mas com o vocabulário do ZapConverte (WhatsApp, não Instagram). O admin é "Super Administrador" e
// vê Parceiros/trials + Respostas rápidas + Declaração matinal; o cliente é "Dono" do próprio workspace.
// Perfil/Senha/Workspace usam /api/app/me* (derivam o workspace DA SESSÃO — vale pros dois papéis).
import { LogoMeta } from "@/components/LogoMeta";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { ETIQUETAS_META, ehEtiquetaMeta } from "@/lib/etiquetas-meta";
import { PermissoesMembro, type Permissoes } from "@/components/PermissoesMembro";
import PasswordInput from "@/components/PasswordInput";
import { FUNDOS, fundoAtual, salvarFundo, type FundoSalvo } from "@/lib/chatbg";
import { useAuth } from "@/components/Auth";
import { subirArquivo, jget, jsend, QuickReply } from "@/lib/client";
import { MorningAffirmationModal, affirmationEnabled, setAffirmationEnabled } from "@/components/MorningAffirmation";
import { useT } from "@/lib/i18n";

function Card({ title, sub, children, soon, icon }: { title: string; sub?: string; children?: React.ReactNode; soon?: boolean; icon?: string }) {
  const t = useT();
  return (
    <div className="card" style={{ opacity: soon ? 0.72 : 1 }}>
      <div className="card-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: sub ? 3 : 12 }}>
          {icon && <Icon name={icon} size={16} />}
          <h3 style={{ margin: 0, fontSize: 15.5 }}>{title}</h3>
          {soon && <span className="tpl-status warn" style={{ fontSize: 10.5 }}>{t("config.emBreve")}</span>}
        </div>
        {sub && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>{sub}</div>}
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4, color: "var(--muted)" }}>{label}</label>{children}</div>;
}

export function Settings() {
  const t = useT();
  const { session } = useAuth();
  const isAdmin = session?.user.role === "admin";
  const wsRole = session?.user.wsRole ?? "dono";     // papel na Equipe
  const ehDono = isAdmin || wsRole === "dono";        // quem manda no workspace (plano, nome, IA)
  const ehAtendente = !isAdmin && wsRole === "atendente";
  const [name, setName] = useState(session?.user.name ?? "");
  const [wsName, setWsName] = useState(session?.workspace.name ?? "");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState("");
  const [connected, setConnected] = useState<number | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  function uploadPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMsg({ err: t("config.erroFotoTipo") }); return; }
    if (file.size > 5 * 1024 * 1024) { setMsg({ err: t("config.erroFotoTamanho") }); return; }
    setPhotoBusy(true); setMsg({});
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await jsend("/api/app/me/photo", "POST", { dataUri: String(reader.result || "") });
        setMsg({ ok: t("config.fotoAtualizada") });
        setTimeout(() => window.location.reload(), 700); // recarrega pra a nova foto aparecer no menu
      } catch (e: any) { setMsg({ err: e.message }); setPhotoBusy(false); }
    };
    reader.onerror = () => { setMsg({ err: t("config.erroLerImagem") }); setPhotoBusy(false); };
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    jget("/api/accounts").then((d) => {
      const list = Array.isArray(d.accounts) ? d.accounts : [];
      setConnected(list.filter((a: any) => a.connected).length);
    }).catch(() => setConnected(null));
  }, []);

  if (!session) return <div className="muted">{t("comum.carregando")}</div>;
  // Admin (Super Admin) tem acesso total — não passa pela lógica de trial/paywall do cliente.
  const ativo = isAdmin || !!session.workspace.paid_until || (session.workspace.days_left ?? 0) > 0;
  const statusLabel = isAdmin ? t("config.statusAcessoTotal") : session.workspace.paid_until ? t("config.statusAssinaturaAtiva") : (session.workspace.days_left ?? 0) > 0 ? t("config.statusTeste", { dias: session.workspace.days_left ?? 0 }) : t("config.statusSemAcesso");

  async function save(key: string, path: string, method: "PUT" | "POST", body: any, okMsg: string) {
    setBusy(key); setMsg({});
    try {
      await jsend(path, method, body);
      setMsg({ ok: okMsg });
      if (key === "name" || key === "ws") setTimeout(() => window.location.reload(), 900);
      if (key === "pw") { setCurPw(""); setNewPw(""); }
    } catch (e: any) { setMsg({ err: e.message }); }
    setBusy("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 680 }}>
      {msg.ok && <div className="card"><div className="card-pad" style={{ color: "var(--accent-deep)", fontWeight: 600, fontSize: 13.5 }}>✅ {msg.ok}</div></div>}
      {msg.err && <div className="card"><div className="card-pad" style={{ color: "var(--crit)", fontWeight: 600, fontSize: 13.5 }}>{msg.err}</div></div>}

      {/* 1 · Perfil */}
      <Card title={t("config.perfilTitulo")} sub={t("config.perfilSub")} icon="user">
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <span className="set-avatar">
            {session.user.avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={session.user.avatar} alt="" />
              : <span className="set-avatar-init">{(session.user.name || "?").slice(0, 2).toUpperCase()}</span>}
          </span>
          <div>
            <label className={"btn ic" + (photoBusy ? " disabled" : "")} style={{ cursor: photoBusy ? "default" : "pointer" }}>
              <Icon name="download" size={14} /> {photoBusy ? t("comum.enviando") : t("config.trocarFoto")}
              <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} disabled={photoBusy} onChange={(e) => uploadPhoto(e.target.files?.[0])} />
            </label>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>{t("config.fotoFormatos")}</div>
          </div>
        </div>
        <Field label={t("contatos.campoNome")}><input className="inp" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "2px 0 12px" }}>
          <span className="tpl-status" style={{ fontSize: 11.5 }}>{t("config.emailDoUsuario", { email: session.user.email })}</span>
          <span className="tpl-status" style={{ fontSize: 11.5, background: isAdmin ? "rgba(124,108,240,.16)" : (ROLE_PILL[wsRole]?.bg ?? ""), color: isAdmin ? "var(--violet)" : (ROLE_PILL[wsRole]?.fg ?? ""), fontWeight: 700 }}>
            {isAdmin ? t("config.papelSuperAdmin") : t(ROLE_PILL[wsRole]?.label ?? "config.papelDono")}
          </span>
        </div>
        <button className="btn primary" disabled={busy === "name"} onClick={() => save("name", "/api/app/me", "PUT", { name }, t("config.nomeAtualizado"))}>{busy === "name" ? t("comum.salvando") : t("comum.salvar")}</button>
      </Card>

      {/* 2 · Senha */}
      <Card title={t("config.senhaTitulo")} sub={t("config.senhaSub")}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("config.senhaAtual")}><PasswordInput value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" /></Field>
          <Field label={t("config.novaSenha")}><PasswordInput value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" placeholder={t("config.novaSenhaPlaceholder")} /></Field>
        </div>
        <button className="btn primary" disabled={busy === "pw" || !curPw || !newPw} onClick={() => save("pw", "/api/app/me/password", "POST", { current: curPw, next: newPw }, t("config.senhaTrocada"))}>{busy === "pw" ? t("config.trocandoSenha") : t("config.trocarSenha")}</button>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }} dangerouslySetInnerHTML={{ __html: t("config.senhaAvisoDispositivos") }} />
      </Card>

      {/* 3 · 2FA */}
      <TwoFactorCard />

      {/* 4 · Parceiros e trials (só admin) */}
      {isAdmin && <PartnersCard />}

      {/* 5 · Workspace — só o dono renomeia */}
      <Card title={t("config.workspaceTitulo")} sub={t("config.workspaceSub")}>
        <Field label={t("config.nomeWorkspace")}><input className="inp" value={wsName} onChange={(e) => setWsName(e.target.value)} disabled={!ehDono} /></Field>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{ehDono ? t("config.emailResponsavel", { email: session.user.email }) : t("config.soDonoRenomeia")}</div>
        {ehDono && <button className="btn primary" disabled={busy === "ws"} onClick={() => save("ws", "/api/app/me/workspace", "PUT", { name: wsName }, t("config.workspaceAtualizado"))}>{busy === "ws" ? t("comum.salvando") : t("comum.salvar")}</button>}
      </Card>

      {/* 6 · Equipe */}
      <TeamCard />

      {/* 7 · Plano atual */}
      <Card title={t("config.planoTitulo")} sub={t("config.planoSub")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
          <div className="set-line"><span className="muted">{t("config.planoLabel")}</span><b>{session.workspace.plan || t("config.planoPadrao")}</b></div>
          <div className="set-line"><span className="muted">{t("config.statusAssinaturaLabel")}</span><span className="tpl-status" style={{ background: ativo ? "rgba(37,211,102,.16)" : "rgba(229,84,75,.16)", color: ativo ? "var(--accent-deep)" : "var(--crit)", fontWeight: 700 }}>{statusLabel}</span></div>
          <div className="set-line"><span className="muted">{t("config.whatsappsConectados")}</span><b>{connected == null ? "…" : t(connected === 1 ? "config.conectadoSingular" : "config.conectadoPlural", { n: connected })}</b></div>
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 12, background: "var(--surface-2)", padding: "8px 10px", borderRadius: 8, lineHeight: 1.5 }}>
          <b>{t("config.upgradeEmBreveTitulo")}</b> {t("config.upgradeEmBreveTexto")}{isAdmin ? t("config.upgradeAcaoAdmin") : t("config.upgradeAcaoCliente")}
        </div>
      </Card>

      {/* 8 · Tags por conta (atendente vê, não edita — o motor barra a escrita também) */}
      <TagsManager readOnly={ehAtendente} />

      {/* 9 · IA (OpenAI) — chave é do dono/admin (é a conta OpenAI dele que paga) */}
      {!ehAtendente && <AIKeyManager isAdmin={!!isAdmin} />}

      {/* 10 · Perfil advocacia: API de contratos (só aparece pra conta com esse perfil) */}
      {!ehAtendente && <ContratosAdvocaciaCard />}


      {/* Privacidade e LGPD */}
      {/* Fundo da conversa (WPP ao Vivo) — escolha leve, fica só neste navegador */}
      <FundoDaConversa />

      <Card title={t("config.lgpdTitulo")} sub={t("config.lgpdSub")}>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
          <span dangerouslySetInnerHTML={{ __html: t("config.lgpdTexto1") }} /><br /><br />
          {t("config.lgpdTexto2")}
        </div>
      </Card>

      {/* Extras só do admin: respostas rápidas + declaração matinal */}
      {isAdmin && (
        <>
          <QuickReplies />
          <AffirmationCard />
        </>
      )}

      <div style={{ height: 8 }} />
    </div>
  );
}

// Parceiros e trials (admin): libera dias de cortesia pra um e-mail (parceiro/afiliado testar grátis).
function PartnersCard() {
  const t = useT();
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [email, setEmail] = useState("");
  const [dias, setDias] = useState(30);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok?: string; err?: string }>({});

  async function liberar() {
    const clean = email.trim().toLowerCase();
    if (!clean.includes("@") || busy) { setRes({ err: t("config.parceirosErroEmail") }); return; }
    setBusy(true); setRes({});
    try {
      await jsend("/api/trial/grant", "POST", { email: clean, days: Math.max(1, dias) });
      setRes({ ok: t("config.parceirosLiberado", { dias, email: clean }) + (nome ? " (" + nome + ")" : "") });
      setNome(""); setContato(""); setEmail("");
    } catch (e: any) { setRes({ err: e.message || t("config.parceirosErroFalha") }); }
    setBusy(false);
  }

  return (
    <Card title={t("config.parceirosTitulo")} sub={t("config.parceirosSub")}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label={t("config.parceiroNome")}><input className="inp" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t("config.parceiroNomePlaceholder")} /></Field>
        <Field label={t("config.parceiroContato")}><input className="inp" value={contato} onChange={(e) => setContato(e.target.value)} placeholder={t("config.parceiroContatoPlaceholder")} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <Field label={t("config.parceiroEmail")}><input className="inp" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("config.parceiroEmailPlaceholder")} /></Field>
        <Field label={t("config.parceiroDias")}><input className="inp" type="number" min={1} value={dias} onChange={(e) => setDias(Number(e.target.value) || 30)} /></Field>
      </div>
      {res.ok && <div style={{ color: "var(--accent-deep)", fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>✅ {res.ok}</div>}
      {res.err && <div style={{ color: "var(--crit)", fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>{res.err}</div>}
      <button className="btn primary ic" disabled={busy} onClick={liberar}><Icon name="user" size={14} /> {busy ? t("config.parceiroLiberando") : t("config.parceiroLiberar")}</button>
    </Card>
  );
}

// EQUIPE: dono + membros + convites pendentes. Convidar gera um LINK (copiável) e tenta e-mail.
interface TeamMember { user_id: string; email: string; name: string; role: string; is_owner: boolean; last_seen: string | null; permissions?: Permissoes | null }
interface TeamInvite { token: string; email: string; role: string; expires_at: string; link: string }
const ROLE_PILL: Record<string, { label: string; bg: string; fg: string }> = {
  dono: { label: "config.papelDono", bg: "rgba(37,211,102,.16)", fg: "var(--accent-deep)" },
  admin: { label: "config.papelAdministrador", bg: "rgba(124,108,240,.16)", fg: "var(--violet)" },
  atendente: { label: "config.papelAtendente", bg: "rgba(42,169,224,.14)", fg: "var(--info)" },
};

function TeamCard() {
  const t = useT();
  const [data, setData] = useState<{ members: TeamMember[]; invites: TeamInvite[]; myRole: string; myId: string } | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("atendente");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string; link?: string }>({});
  const [editando, setEditando] = useState<string | null>(null);   // user_id com o editor aberto
  const [permsEdit, setPermsEdit] = useState<Permissoes | null>(null);
  const [permsConvite, setPermsConvite] = useState<Permissoes | null>(null);

  useEffect(() => { load(); }, []);
  async function load() { try { setData(await jget("/api/app/team")); } catch (e: any) { setMsg({ err: e.message }); } }

  async function convidar() {
    const e = email.trim().toLowerCase();
    if (!e.includes("@") || busy) return;
    setBusy(true); setMsg({});
    try {
      const d = await jsend("/api/app/team/invite", "POST", { email: e, role, permissoes: permsConvite });
      setMsg({ ok: d.emailed ? t("config.conviteEnviadoEmail", { email: d.email }) : t("config.conviteCriadoLink", { email: d.email }), link: d.link });
      setEmail(""); setPermsConvite(null); await load();
    } catch (er: any) { setMsg({ err: er.message }); }
    setBusy(false);
  }
  async function act(path: string, body: any, okMsg: string) {
    setBusy(true); setMsg({});
    try { await jsend(path, "POST", body); setMsg({ ok: okMsg }); await load(); }
    catch (e: any) { setMsg({ err: e.message }); }
    setBusy(false);
  }
  async function remover(m: TeamMember) {
    if (!confirm(t("config.confirmarRemoverMembro", { pessoa: m.name || m.email }))) return;
    await act("/api/app/team/remove", { userId: m.user_id }, t("config.membroRemovido", { pessoa: m.name || m.email }));
  }
  async function trocarPapel(m: TeamMember, novo: string) {
    await act("/api/app/team/role", { userId: m.user_id, role: novo }, t("config.papelTrocado", { pessoa: m.name || m.email, papel: t(ROLE_PILL[novo]?.label ?? novo) }));
  }

  const podeGerenciar = data?.myRole === "dono" || data?.myRole === "admin";
  const ehDono = data?.myRole === "dono";

  return (
    <Card title={t("config.equipeTitulo")} sub={t("config.equipeSub")}>
      {!data ? <div className="muted">{t("comum.carregando")}</div> : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {data.members.map((m) => {
              const pill = ROLE_PILL[m.role] ?? ROLE_PILL.atendente;
              const eu = m.user_id === data.myId;
              return (
                <div key={m.user_id} className="qr-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 13 }}>{m.name || m.email}</b>{eu && <span className="muted" style={{ fontSize: 11.5 }}>{t("config.membroVoce")}</span>}
                    <div className="muted" style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</div>
                  </div>
                  <span className="tpl-status" style={{ background: pill.bg, color: pill.fg, fontWeight: 700 }}>{t(pill.label)}</span>
                  {ehDono && !m.is_owner && (
                    <select className="inp" style={{ width: "auto", padding: "2px 6px", fontSize: 11.5 }} value={m.role} disabled={busy}
                      onChange={(e) => trocarPapel(m, e.target.value)} title={t("config.mudarPapelTitle")}>
                      <option value="atendente">{t("config.papelAtendente")}</option>
                      <option value="admin">{t("config.papelAdministrador")}</option>
                    </select>
                  )}
                  {ehDono && !m.is_owner && (
                    <button className="btn" style={{ padding: "3px 9px", fontSize: 11.5 }} disabled={busy}
                      title="Escolher o que essa pessoa pode abrir"
                      onClick={() => { const abrir = editando !== m.user_id; setEditando(abrir ? m.user_id : null); setPermsEdit(m.permissions ?? null); }}>
                      {m.permissions?.paginas ? `Acesso (${m.permissions.paginas.length})` : "Acesso total"}
                    </button>
                  )}
                  {podeGerenciar && !m.is_owner && !eu && (
                    <button className="btn danger ic" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy} onClick={() => remover(m)} title={t("config.removerDaEquipe")}><Icon name="trash" size={13} /></button>
                  )}
                </div>
              );
            })}
            {editando && (
              <div className="card" style={{ marginTop: 2 }}>
                <div className="card-pad" style={{ display: "grid", gap: 12 }}>
                  <PermissoesMembro
                    titulo={`Acesso de ${data.members.find((x) => x.user_id === editando)?.name || data.members.find((x) => x.user_id === editando)?.email || "membro"}`}
                    valor={permsEdit}
                    onChange={setPermsEdit}
                  />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn" disabled={busy} onClick={() => setEditando(null)}>{t("comum.cancelar")}</button>
                    <button className="btn primary" disabled={busy}
                      onClick={async () => { await act("/api/app/team/permissoes", { userId: editando, permissoes: permsEdit }, "Acesso atualizado."); setEditando(null); }}>
                      Salvar acesso
                    </button>
                  </div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    Quem já estiver com o painel aberto passa a ver a mudança ao recarregar a página.
                  </div>
                </div>
              </div>
            )}
          </div>

          {data.invites.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="muted" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700, marginBottom: 6 }}>{t("config.convitesPendentes")}</div>
              {data.invites.map((i) => (
                <div key={i.token} className="qr-item" style={{ marginBottom: 5 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 12.5 }}>{i.email}</b>
                    <div className="muted" style={{ fontSize: 11 }}>{t("config.conviteVence", { papel: t(ROLE_PILL[i.role]?.label ?? i.role), data: new Date(i.expires_at).toLocaleDateString("pt-BR") })}</div>
                  </div>
                  <button className="btn" style={{ padding: "3px 9px", fontSize: 11.5 }} onClick={() => { navigator.clipboard?.writeText(i.link); setMsg({ ok: t("config.linkCopiadoWhats") }); }}>{t("config.copiarLink")}</button>
                  {podeGerenciar && <button className="btn danger" style={{ padding: "3px 9px", fontSize: 11.5 }} disabled={busy} onClick={() => act("/api/app/team/invite/revoke", { token: i.token }, t("config.conviteCancelado"))}>{t("comum.cancelar")}</button>}
                </div>
              ))}
            </div>
          )}

          {podeGerenciar ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "end" }}>
                <Field label={t("config.emailDaPessoa")}><input className="inp" placeholder={t("config.emailDaPessoaPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && convidar()} /></Field>
                <Field label={t("config.papelLabel")}>
                  <select className="inp" value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="atendente">{t("config.papelAtendente")}</option>
                    <option value="admin">{t("config.papelAdministrador")}</option>
                  </select>
                </Field>
                <div style={{ marginBottom: 10 }}><button className="btn primary ic" disabled={busy || !email.includes("@")} onClick={convidar}><Icon name="plus" size={14} /> {busy ? "…" : t("config.convidar")}</button></div>
              </div>
              {ehDono && (
                <div className="card" style={{ marginBottom: 10 }}>
                  <div className="card-pad">
                    {/* As permissões viajam NO CONVITE: a pessoa já entra restrita, sem uma janela
                        de acesso total entre o aceite e o dono lembrar de limitar. */}
                    <PermissoesMembro titulo="O que essa pessoa vai poder abrir" valor={permsConvite} onChange={setPermsConvite} />
                  </div>
                </div>
              )}
              <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                <span dangerouslySetInnerHTML={{ __html: t("config.ajudaAtendente") }} /><br />
                <span dangerouslySetInnerHTML={{ __html: t("config.ajudaAdministrador") }} /><br />
                <span dangerouslySetInnerHTML={{ __html: t("config.ajudaDono") }} />
              </div>
            </>
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>{t("config.equipeSemPermissao")}</div>
          )}

          {msg.ok && <div style={{ color: "var(--accent-deep)", fontSize: 12.5, marginTop: 10, fontWeight: 600 }}>✅ {msg.ok}</div>}
          {msg.link && (
            <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
              <input className="inp" readOnly value={msg.link} style={{ fontSize: 11.5 }} onFocus={(e) => e.currentTarget.select()} />
              <button className="btn" style={{ padding: "4px 10px", fontSize: 11.5 }} onClick={() => { navigator.clipboard?.writeText(msg.link!); setMsg((m) => ({ ...m, ok: t("config.linkCopiado") })); }}>{t("comum.copiar")}</button>
            </div>
          )}
          {msg.err && <div style={{ color: "var(--crit)", fontSize: 12.5, marginTop: 10, fontWeight: 600 }}>{msg.err}</div>}
        </>
      )}
    </Card>
  );
}

// Verificação em 2 fatores (TOTP nativo no motor — mesma experiência do OminiFlow, sem Supabase):
// ativar → QR + segredo → código de 6 dígitos confirma → no login passa a pedir o código.
function TwoFactorCard() {
  const t = useT();
  const [status, setStatus] = useState<"loading" | "off" | "asking" | "enrolling" | "on" | "disabling">("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    jget("/api/app/2fa").then((d) => setStatus(d?.enabled ? "on" : "off")).catch(() => setStatus("off"));
  }, []);

  // Exige a senha atual: se alguém entrar com a sua senha vazada, não consegue plantar o 2FA dele.
  async function ativar() {
    setErro(""); setBusy(true);
    try {
      const d = await jsend("/api/app/2fa/setup", "POST", { password: pw });
      setSecret(d.secret);
      const QRCode = (await import("qrcode")).default; // lib só carrega quando precisa
      setQr(await QRCode.toDataURL(d.uri, { margin: 1, width: 220 }));
      setCode(""); setPw(""); setStatus("enrolling");
    } catch (e: any) { setErro(e.message || t("config.erro2faIniciar")); }
    setBusy(false);
  }
  async function confirmar() {
    setErro(""); setBusy(true);
    try {
      await jsend("/api/app/2fa/confirm", "POST", { code: code.trim() });
      setQr(null); setSecret(null); setCode(""); setStatus("on");
    } catch (e: any) { setErro(e.message || t("config.erro2faCodigoApp")); }
    setBusy(false);
  }
  async function cancelarCadastro() {
    setBusy(true);
    try { await jsend("/api/app/2fa/disable", "POST", { code: "" }); } catch { /* cadastro pendente limpa sem código */ }
    setQr(null); setSecret(null); setCode(""); setErro(""); setStatus("off"); setBusy(false);
  }
  async function desativar() {
    setErro(""); setBusy(true);
    try {
      await jsend("/api/app/2fa/disable", "POST", { code: code.trim() });
      setCode(""); setStatus("off");
    } catch (e: any) { setErro(e.message || t("config.erro2faCodigo")); }
    setBusy(false);
  }

  return (
    <Card title={t("config.doisFatoresTitulo")} sub={t("config.doisFatoresSub")}>
      {status === "loading" && <div className="muted" style={{ fontSize: 13 }}>{t("config.verificando")}</div>}

      {status === "off" && (
        <div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }} dangerouslySetInnerHTML={{ __html: t("config.doisFatoresDesativada") }} />
          {erro && <div style={{ color: "var(--crit)", fontSize: 12.5, marginBottom: 8 }}>{erro}</div>}
          <button className="btn primary" disabled={busy} onClick={() => { setErro(""); setPw(""); setStatus("asking"); }}>{t("config.ativarDoisFatores")}</button>
        </div>
      )}

      {status === "asking" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="muted" style={{ fontSize: 12.5 }} dangerouslySetInnerHTML={{ __html: t("config.doisFatoresConfirmeSenha") }} />
          <Field label={t("config.senhaAtual")}>
            <PasswordInput autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pw && ativar()} style={{ maxWidth: 280 }} autoFocus />
          </Field>
          {erro && <div style={{ color: "var(--crit)", fontSize: 12.5 }}>{erro}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => { setStatus("off"); setPw(""); setErro(""); }} disabled={busy}>{t("comum.cancelar")}</button>
            <button className="btn primary" onClick={ativar} disabled={busy || !pw}>{busy ? t("config.gerando") : t("comum.continuar")}</button>
          </div>
        </div>
      )}

      {status === "enrolling" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ol className="muted" style={{ fontSize: 12.5, paddingLeft: 18, lineHeight: 1.7, margin: 0 }}>
            <li dangerouslySetInnerHTML={{ __html: t("config.doisFatoresPasso1") }} />
            <li>{t("config.doisFatoresPasso2")}</li>
            <li>{t("config.doisFatoresPasso3")}</li>
          </ol>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={t("config.qrCodeAlt")} style={{ width: 200, height: 200, borderRadius: 8, background: "#fff", padding: 6 }} />
            )}
            {secret && (
              <div className="muted" style={{ fontSize: 11.5, textAlign: "center" }}>
                {t("config.doisFatoresSemEscanear")}<br />
                <code style={{ fontSize: 12.5, wordBreak: "break-all", color: "var(--ink)" }}>{secret}</code>
              </div>
            )}
          </div>
          <Field label={t("config.codigoSeisDigitos")}>
            <input className="inp" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              style={{ fontSize: 20, letterSpacing: "0.3em", textAlign: "center", maxWidth: 200, fontVariantNumeric: "tabular-nums" }} />
          </Field>
          {erro && <div style={{ color: "var(--crit)", fontSize: 12.5 }}>{erro}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn" onClick={cancelarCadastro} disabled={busy}>{t("comum.cancelar")}</button>
            <button className="btn primary" onClick={confirmar} disabled={busy || code.length !== 6}>{busy ? t("config.confirmando") : t("config.confirmarEAtivar")}</button>
          </div>
        </div>
      )}

      {status === "on" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: "rgba(37,211,102,.13)", color: "var(--accent-deep)", fontWeight: 600, fontSize: 13, borderRadius: 9, padding: "8px 12px" }}>
            {t("config.doisFatoresAtiva")}
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>{t("config.doisFatoresPerdeuCelular")}</div>
          <div><button className="btn" disabled={busy} onClick={() => { setErro(""); setCode(""); setStatus("disabling"); }}>{t("config.desativarDoisFatores")}</button></div>
        </div>
      )}

      {status === "disabling" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="muted" style={{ fontSize: 12.5 }}>{t("config.doisFatoresDesativarInstrucao")}</div>
          <input className="inp" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            style={{ fontSize: 20, letterSpacing: "0.3em", textAlign: "center", maxWidth: 200, fontVariantNumeric: "tabular-nums" }} />
          {erro && <div style={{ color: "var(--crit)", fontSize: 12.5 }}>{erro}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => { setStatus("on"); setCode(""); setErro(""); }} disabled={busy}>{t("comum.cancelar")}</button>
            <button className="btn danger" onClick={desativar} disabled={busy || code.length !== 6}>{busy ? t("config.desativando") : t("config.desativar")}</button>
          </div>
        </div>
      )}
    </Card>
  );
}

// Chave OpenAI por-cliente (nó Agente IA). Nunca exibe a chave inteira depois de salva.
function AIKeyManager({ isAdmin }: { isAdmin: boolean }) {
  const t = useT();
  const [st, setSt] = useState<{ configured: boolean; last4: string | null; systemFallback?: boolean } | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  useEffect(() => { load(); }, []);
  async function load() { try { setSt(await jget("/api/app/ai/key")); } catch { setSt({ configured: false, last4: null }); } }
  async function salvar() {
    const k = key.trim();
    if (!k.startsWith("sk-")) { setMsg({ err: t("config.erroChaveOpenai") }); return; }
    setBusy(true); setMsg({});
    try { await jsend("/api/app/ai/key", "POST", { key: k }); setKey(""); setMsg({ ok: t("config.chaveSalva") }); await load(); }
    catch (e: any) { setMsg({ err: e.message }); } finally { setBusy(false); }
  }
  async function remover() {
    if (!confirm(t("config.confirmarRemoverChave"))) return;
    setBusy(true); setMsg({});
    try { await jsend("/api/app/ai/key/remove", "POST", {}); setMsg({ ok: t("config.chaveRemovida") }); await load(); }
    catch (e: any) { setMsg({ err: e.message }); } finally { setBusy(false); }
  }

  return (
    <Card title={t("config.iaTitulo")} sub={t("config.iaSub")}>
      {st?.configured ? (
        <div className="qr-item" style={{ marginBottom: 10 }}>
          <span className="tpl-status on" style={{ fontSize: 11.5 }}>{t("config.chaveConfigurada")}</span>
          <span className="muted" style={{ fontSize: 12.5, flex: 1 }}>••••{st.last4}</span>
          <button className="btn danger" style={{ padding: "3px 10px", fontSize: 12 }} disabled={busy} onClick={remover}>{t("config.removerChave")}</button>
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
          {st?.systemFallback
            ? t("config.iaFallbackSistema")
            : <span dangerouslySetInnerHTML={{ __html: t("config.iaSemChave") }} />}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input className="inp" placeholder="sk-…" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && salvar()} autoComplete="off" />
        <button className="btn primary" disabled={busy || !key.trim()} onClick={salvar}>{busy ? t("comum.salvando") : st?.configured ? t("config.trocarChave") : t("config.salvarChave")}</button>
      </div>
      {msg.ok && <div style={{ color: "var(--accent-deep)", fontSize: 12.5, marginTop: 8 }}>✅ {msg.ok}</div>}
      {msg.err && <div style={{ color: "var(--crit)", fontSize: 12.5, marginTop: 8 }}>{msg.err}</div>}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>{t("config.iaChaveCriptografada")}</div>
    </Card>
  );
}

// PERFIL ADVOCACIA: endereço + token da API de contratos do escritório. É o que faz o botão
// "Contrato e procuração" do chat funcionar. Só aparece pra conta marcada como advocacia em
// Clientes (o motor confere o perfil de novo ao salvar). O token nunca volta pro painel.
function ContratosAdvocaciaCard() {
  const [st, setSt] = useState<{ perfil: string | null; url: string; configurado: boolean; last4: string | null } | null>(null);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  async function load() {
    try { const d = await jget("/api/advocacia/status"); setSt(d); setUrl(d.url || ""); } catch { setSt(null); }
  }
  useEffect(() => { load(); }, []);
  if (st?.perfil !== "advocacia") return null;

  async function salvar() {
    setBusy(true); setMsg({});
    try {
      await jsend("/api/advocacia/config", "POST", { url: url.trim(), ...(token.trim() ? { token: token.trim() } : {}) });
      setToken(""); setMsg({ ok: "Salvo. O botão \"Contrato e procuração\" já aparece nas conversas." }); await load();
    } catch (e: any) { setMsg({ err: e.message }); } finally { setBusy(false); }
  }
  async function remover() {
    if (!confirm("Remover o endereço e o token? O botão de contrato some das conversas até salvar de novo.")) return;
    setBusy(true); setMsg({});
    try { await jsend("/api/advocacia/config/remove", "POST", {}); setUrl(""); setMsg({ ok: "Removido." }); await load(); }
    catch (e: any) { setMsg({ err: e.message }); } finally { setBusy(false); }
  }
  const precisaToken = !st.configurado && !token.trim();

  return (
    <Card title="Contrato e procuração" sub="Liga o botão das conversas que gera o contrato e a procuração com os dados do cliente e devolve o link de assinatura. Os modelos dos documentos ficam no sistema do escritório.">
      {st.configurado && (
        <div className="qr-item" style={{ marginBottom: 10 }}>
          <span className="tpl-status on" style={{ fontSize: 11.5 }}>Conectado</span>
          <span className="muted" style={{ fontSize: 12.5, flex: 1 }}>token ••••{st.last4}</span>
          <button className="btn danger" style={{ padding: "3px 10px", fontSize: 12 }} disabled={busy} onClick={remover}>Remover</button>
        </div>
      )}
      <Field label="Endereço da API de contratos">
        <input className="inp" placeholder="https://seuescritorio.adv.br/api/contratos" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
      </Field>
      <Field label={st.configurado ? "Token (deixe em branco pra manter o atual)" : "Token da integração ZapConverte"}>
        <input className="inp" type="password" placeholder={st.configurado ? "••••" + (st.last4 ?? "") : "cole o token"} value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
      </Field>
      <button className="btn primary" disabled={busy || !url.trim() || precisaToken} onClick={salvar}>{busy ? "Salvando…" : "Salvar"}</button>
      {msg.ok && <div style={{ color: "var(--accent-deep)", fontSize: 12.5, marginTop: 8 }}>{msg.ok}</div>}
      {msg.err && <div style={{ color: "var(--crit)", fontSize: 12.5, marginTop: 8 }}>{msg.err}</div>}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
        O token é o mesmo da integração ZapConverte no painel do escritório (Escritório Virtual → Integração ZapConverte).
        Ele fica guardado criptografado e não aparece de novo aqui.
      </div>
    </Card>
  );
}

// Tags por conta: lista as etiquetas do workspace + criar / renomear / excluir. Escopado por sessão.
function TagsManager({ readOnly = false }: { readOnly?: boolean }) {
  const t = useT();
  const [tags, setTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [nova, setNova] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { load(); }, []);
  async function load() {
    try { const d = await jget("/api/app/tags"); setTags(Array.isArray(d.tags) ? d.tags : []); }
    catch { /* silencioso */ } finally { setLoading(false); }
  }
  async function act(path: string, body: any) {
    setBusy(true); setErr("");
    try { const d = await jsend(path, "POST", body); if (Array.isArray(d.tags)) setTags(d.tags); }
    catch (e: any) { setErr(e.message || t("config.tagsErroFalha")); } finally { setBusy(false); }
  }
  async function criar() { const nv = nova.trim(); if (!nv) return; await act("/api/app/tags/create", { tag: nv }); setNova(""); }
  async function renomear(old: string) {
    const nv = prompt(t("config.renomearTagPrompt", { tag: old }), old);
    if (!nv || nv.trim() === old) return;
    await act("/api/app/tags/rename", { old, new: nv.trim() });
  }
  async function excluir(tag: string) {
    if (!confirm(t("config.confirmarExcluirTag", { tag }))) return;
    await act("/api/app/tags/delete", { tag });
  }

  return (
    <Card title={t("config.tagsTitulo")} sub={t("config.tagsSub")}>
      {readOnly ? (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{t("config.tagsSomenteLeitura")}</div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input className="inp" placeholder={t("config.novaTagPlaceholder")} value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criar()} />
          <button className="btn primary ic" disabled={busy || !nova.trim()} onClick={criar}><Icon name="plus" size={14} /> {t("contatos.criar")}</button>
        </div>
      )}
      {err && <div style={{ color: "var(--crit)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
      {/* 🔵 Etiquetas da Meta: fixas (sem renomear/excluir) — marcar um contato com uma delas envia
          o evento de conversão da conversa pro anúncio (Integrações → Conversões de WhatsApp). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {ETIQUETAS_META.map((e) => {
          const n = tags.find((x) => x.tag.toLowerCase() === e.tag.toLowerCase())?.count ?? 0;
          return (
            <div key={e.tag} className="qr-item">
              <span className="etq-chip etq-meta" style={{ fontSize: 11.5 }}><LogoMeta size={12} />{e.tag}</span>
              <span className="muted" style={{ fontSize: 12, flex: 1 }}>{e.dica}{n > 0 ? ` · ${n} contato${n === 1 ? "" : "s"}` : ""}</span>
              <span className="muted" style={{ fontSize: 11 }}>fixa</span>
            </div>
          );
        })}
      </div>
      {loading ? <div className="muted">{t("comum.carregando")}</div> : tags.filter((x) => !ehEtiquetaMeta(x.tag)).length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>{t("config.tagsVazio")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tags.filter((x) => !ehEtiquetaMeta(x.tag)).map((et) => (
            <div key={et.tag} className="qr-item">
              <span className="tpl-status on" style={{ fontSize: 11.5 }}>🏷️ {et.tag}</span>
              <span className="muted" style={{ fontSize: 12, flex: 1 }}>{t(et.count === 1 ? "config.contatoSingular" : "config.contatoPlural", { n: et.count })}</span>
              {!readOnly && <>
                <button className="btn ic" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy} onClick={() => renomear(et.tag)} title={t("contatos.renomear")}><Icon name="edit" size={13} /></button>
                <button className="btn danger ic" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy} onClick={() => excluir(et.tag)} title={t("comum.excluir")}><Icon name="trash" size={13} /></button>
              </>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Declaração matinal (admin): popup do começo do dia.
function AffirmationCard() {
  const t = useT();
  const [enabled, setEnabled] = useState(true);
  const [preview, setPreview] = useState(false);
  useEffect(() => setEnabled(affirmationEnabled()), []);
  function toggle() { const next = !enabled; setEnabled(next); setAffirmationEnabled(next); }
  return (
    <div className="card">
      <div className="card-head"><h3>{t("config.declaracaoTitulo")}</h3><span className="page-hint">{t("config.declaracaoHint")}</span></div>
      <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="set-row">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 650 }}>{t("config.declaracaoMostrar")}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{t("config.declaracaoDesc")}</div>
          </div>
          <button className={"flow-toggle" + (enabled ? " on" : "")} role="switch" aria-checked={enabled} onClick={toggle} title={enabled ? t("config.toggleAtivadoTitle") : t("config.toggleDesativadoTitle")}>
            <span className="ft-knob" /><span className="ft-label">{enabled ? t("config.ativado") : t("templates.statusDesativado")}</span>
          </button>
        </div>
        <div><button className="btn ic" onClick={() => setPreview(true)}><Icon name="play" size={15} /> {t("config.verAgora")}</button></div>
      </div>
      {preview && <MorningAffirmationModal open onClose={() => setPreview(false)} onDisable={() => { setAffirmationEnabled(false); setEnabled(false); setPreview(false); }} />}
    </div>
  );
}

// Respostas rápidas: atalho (o "/" no chat) + o texto enviado.
function QuickReplies() {
  const t = useT();
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    jget("/api/config/quick-replies").then((d) => setItems(Array.isArray(d.items) ? d.items : [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function persist(next: QuickReply[]) {
    const prev = items;
    setItems(next); setStatus("salvando…");
    try {
      const r = await jsend("/api/config/quick-replies", "PUT", { items: next });
      if (Array.isArray(r.items)) setItems(r.items);
      setStatus("salvo!"); setTimeout(() => setStatus(""), 1500);
    } catch (e: any) { setItems(prev); setStatus(e?.message || t("config.qrFalhaSalvar")); }
  }

  const scClean = shortcut.trim().replace(/^\/+/, "").replace(/\s+/g, "-");
  function add() {
    if (!scClean || !text.trim()) return;
    const rest = items.filter((q) => q.shortcut.toLowerCase() !== scClean.toLowerCase());
    persist([...rest, { shortcut: scClean, text: text.trim() }]);
    setShortcut(""); setText("");
  }
  function del(sc: string) { persist(items.filter((q) => q.shortcut !== sc)); }

  return (
    <div className="card">
      <div className="card-head"><h3>{t("config.respostasRapidasTitulo")}</h3><span className="page-hint">{t("config.respostasRapidasHint")}</span></div>
      <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="muted" style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: t("config.respostasRapidasDesc") }} />
        <div className="qr-add">
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span className="qr-slash">/</span>
            <input className="inp" style={{ maxWidth: 200 }} placeholder={t("config.atalhoPlaceholder")} value={shortcut} onChange={(e) => setShortcut(e.target.value)} onKeyDown={(e) => e.key === "Enter" && scClean && text.trim() && add()} />
          </div>
          <textarea className="inp" placeholder={t("config.textoRespostaPlaceholder")} value={text} rows={2} onChange={(e) => setText(e.target.value)} style={{ resize: "vertical" }} />
          <button className="btn primary ic" onClick={add} disabled={!scClean || !text.trim()}><Icon name="plus" size={15} /> {t("config.adicionar")}</button>
        </div>
        {loading ? <div className="muted">{t("comum.carregando")}</div> : items.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>{t("config.respostasRapidasVazio")}</div>
        ) : (
          <div className="qr-list">
            {items.map((q) => (
              <div key={q.shortcut} className="qr-item">
                <span className="qr-chip">/{q.shortcut}</span>
                <span className="qr-text">{q.text}</span>
                <button className="btn danger ic" onClick={() => del(q.shortcut)} title={t("comum.excluir")}><Icon name="trash" size={14} /></button>
              </div>
            ))}
          </div>
        )}
        {status && <div style={{ fontSize: 12.5, color: status === "salvo!" || status === "salvando…" ? "var(--accent-deep)" : "var(--crit)" }}>{status === "salvando…" ? t("config.qrSalvando") : status === "salvo!" ? t("conexao.salvo") : status}</div>}
      </div>
    </div>
  );
}


// Fundo da conversa do WPP ao Vivo: padrões embutidos (rabiscos estilo WhatsApp) ou uma imagem
// sua. A escolha fica no localStorage DESTE navegador — de propósito, nada vai pro banco.
const FUNDO_ROTULO: Record<string, string> = {
  claro: "config.fundoRabiscosClaro",
  verde: "config.fundoRabiscosVerde",
  escuro: "config.fundoRabiscosEscuro",
};

function FundoDaConversa() {
  const t = useT();
  const [sel, setSel] = useState<FundoSalvo>({ id: "padrao" });
  const [msg, setMsg] = useState("");
  const [subindo, setSubindo] = useState(false);
  useEffect(() => { setSel(fundoAtual()); }, []);

  function aplica(novo: FundoSalvo) {
    setSel(novo);
    salvarFundo(novo);
    setMsg(t("config.fundoAplicado"));
    setTimeout(() => setMsg(""), 3000);
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { setMsg(t("config.erroFundoTipo")); return; }
    if (f.size > 2 * 1024 * 1024) { setMsg(t("config.erroFundoTamanho")); return; }
    setSubindo(true); setMsg("");
    try {
      const url = await subirArquivo(f); // binário: o JSON do painel trava em 10MB
      aplica({ id: "custom", url });
    } catch (err: any) {
      setMsg(err.message || t("config.erroSubirImagem"));
    }
    setSubindo(false);
  }

  return (
    <Card title={t("config.fundoTitulo")} sub={t("config.fundoSub")}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {FUNDOS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={"fundo-swatch" + (sel.id === f.id ? " on" : "")}
            style={f.css}
            title={FUNDO_ROTULO[f.id] ? t(FUNDO_ROTULO[f.id]) : f.label}
            onClick={() => aplica({ id: f.id })}
          >
            {f.id === "padrao" ? "Aa" : ""}
          </button>
        ))}
        <label className={"fundo-swatch custom" + (sel.id === "custom" ? " on" : "")} title={t("config.fundoEnviarImagem")}
          style={sel.id === "custom" && sel.url ? { backgroundImage: `url("${sel.url}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
          {subindo ? "…" : sel.id === "custom" ? "" : "+"}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={upload} disabled={subindo} />
        </label>
        {sel.id !== "padrao" && (
          <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => aplica({ id: "padrao" })}>{t("config.fundoRemover")}</button>
        )}
      </div>
      {msg && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{msg}</div>}
    </Card>
  );
}
