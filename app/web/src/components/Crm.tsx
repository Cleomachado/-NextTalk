"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { jget, jsend, initials, ago, evLabel, ContactRow } from "@/lib/client";
import { Icon } from "@/components/icons";
import { useT } from "@/lib/i18n";
import { ImportarContatosModal } from "@/components/ImportarContatosModal";

const GROUP_IMPORT_TAG = "importado grupo"; // tag universal de importação de grupo (destaque)

const FILTERS = [
  { key: "", label: "contatos.filtroTodos" },
  { key: "comprador", label: "contatos.filtroCompradores" },
  { key: "carrinho", label: "contatos.filtroCarrinho" },
  { key: "optout", label: "contatos.filtroOptOut" },
];
const LIMIT = 50;

// Páginas visíveis na barra: 1 … vizinhas da atual … última ("…" onde pula).
function paginasVisiveis(atual: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, atual - 1, atual, atual + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) out.push("…");
    out.push(nums[i]);
  }
  return out;
}

export function Crm() {
  const t = useT();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState("");
  const [pagina, setPagina] = useState(1);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshingPics, setRefreshingPics] = useState(false);
  const [importandoAgenda, setImportandoAgenda] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [importarAberto, setImportarAberto] = useState(false);
  const [tagSel, setTagSel] = useState("");
  const [tagsDisponiveis, setTagsDisponiveis] = useState<Array<{ tag: string; total: number }>>([]);

  // Tags do workspace pro seletor (mesma fonte que o Disparador usa nos segmentos).
  async function carregaTags() {
    try {
      const d = await jget("/api/contacts/segments");
      setTagsDisponiveis((d?.tags ?? []) as Array<{ tag: string; total: number }>);
    } catch { /* sem tags: o seletor some */ }
  }
  useEffect(() => { carregaTags(); }, []);

  useEffect(() => {
    // busca nova = volta pra página 1 (setState em lote → um fetch só)
    const t = setTimeout(() => { setDebounced(search); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  async function fetchPage(pag: number) {
    setLoading(true);
    setErr(null);
    try {
      const p = new URLSearchParams();
      if (debounced) p.set("search", debounced);
      if (filter) p.set("filter", filter);
      if (tagSel) p.set("tag", tagSel);
      p.set("limit", String(LIMIT));
      p.set("offset", String((pag - 1) * LIMIT));
      const r = await jget("/api/contacts?" + p.toString());
      setTotal(r.total ?? 0);
      setContacts(r.contacts ?? []);
    } catch (ex: any) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPage(pagina);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, filter, tagSel, pagina]);

  const totalPag = Math.max(1, Math.ceil(total / LIMIT));
  function irPara(p: number) {
    if (p < 1 || p > totalPag || p === pagina) return;
    setPagina(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Sincroniza do WhatsApp (LITE): importa todas as conversas 1:1 como contatos + puxa as fotos.
  async function refreshPics() {
    if (refreshingPics) return;
    setRefreshingPics(true);
    setSyncMsg(null);
    try {
      const r = await jsend("/api/contacts/refresh-avatars", "POST", {});
      setPagina(1);
      await fetchPage(1);
      setSyncMsg(t("contatos.sincronizadoResultado", { imported: r.imported ?? 0, avatars: r.avatars ?? 0 }));
      setTimeout(() => setSyncMsg(null), 5000);
    } catch {
      setSyncMsg(t("contatos.sincronizarErro"));
    } finally {
      setRefreshingPics(false);
    }
  }

  // Importa a AGENDA inteira do celular (só quem está salvo — pode passar de milhares).
  async function importarAgenda() {
    if (importandoAgenda) return;
    if (!confirm(t("contatos.importarAgendaConfirmacao"))) return;
    setImportandoAgenda(true);
    setSyncMsg(null);
    try {
      const r = await jsend("/api/contacts/import-agenda", "POST", {});
      setPagina(1);
      await fetchPage(1);
      setSyncMsg(t("contatos.importarAgendaResultado", { importados: r.importados ?? 0, total: r.total ?? 0 }));
      setTimeout(() => setSyncMsg(null), 8000);
    } catch (ex: any) {
      setSyncMsg(ex?.message || t("contatos.importarAgendaErro"));
    } finally {
      setImportandoAgenda(false);
    }
  }

  function exportCsv() {
    const head = ["nome", "telefone", "email", "plataforma", "tags", "fluxos", "compras", "ultimo_evento", "opt_out", "ultimo_contato"];
    const rows = contacts.map((c) => [
      c.name ?? "",
      c.phone,
      c.email ?? "",
      c.platform ?? "",
      (c.tags ?? []).join(" | "),
      (c.flows ?? []).map((f) => f.name).join(" | "),
      c.purchases,
      c.last_event ?? "",
      c.opted_out ? "sim" : "não",
      c.last_seen,
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contatos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <input
          className="inp"
          style={{ maxWidth: 280 }}
          placeholder={t("contatos.buscarPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.key} className={filter === f.key ? "on" : ""} onClick={() => { setFilter(f.key); setPagina(1); }}>{t(f.label)}</button>
          ))}
        </div>
        {tagsDisponiveis.length > 0 && (
          <select className="inp" style={{ maxWidth: 230 }} value={tagSel}
            onChange={(e) => { setTagSel(e.target.value); setPagina(1); }}
            title="Mostrar só os contatos com essa tag">
            <option value="">Todas as tags</option>
            {tagsDisponiveis.map((t2) => <option key={t2.tag} value={t2.tag}>{t2.tag} ({t2.total})</option>)}
          </select>
        )}
        <button className="btn" style={{ marginLeft: "auto" }} onClick={refreshPics} disabled={refreshingPics} title={t("contatos.sincronizarWhatsappDica")}>
          {refreshingPics ? t("contatos.sincronizando") : t("contatos.sincronizarWhatsapp")}
        </button>
        <button className="btn" onClick={importarAgenda} disabled={importandoAgenda} title={t("contatos.importarAgendaDica")}>
          {importandoAgenda ? t("contatos.importando") : t("contatos.importarAgenda")}
        </button>
        <button className="btn primary" onClick={() => setImportarAberto(true)} title="Importar lista de contatos de Excel, CSV ou TXT, com tag">Importar lista</button>
        <button className="btn" onClick={exportCsv} disabled={!contacts.length}>{t("contatos.exportarCsv")}</button>
      </div>
      {importarAberto && (
        <ImportarContatosModal
          onClose={() => setImportarAberto(false)}
          onDone={(r) => { setSyncMsg(`✅ ${r.importados} contatos importados${r.tags.length ? ` com a tag ${r.tags.join(", ")}` : ""}`); carregaTags(); fetchPage(1); setPagina(1); }}
        />
      )}
      {syncMsg && <div className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: 13, color: syncMsg.startsWith("✅") ? "var(--accent-deep)" : "var(--crit)" }}>{syncMsg}</div>}

      <div className="card">
        <div className="card-head"><h3>{t("contatos.tituloCard")}</h3><span className="page-hint">{t("contatos.totalContatos", { total })}</span></div>
        {err ? (
          <div className="card-pad"><b style={{ color: "var(--crit)" }}>{t("templates.erroPrefixo")}</b> <span className="muted">{err}</span></div>
        ) : contacts.length === 0 && !loading ? (
          <div className="card-pad muted">{t("contatos.vazio")}</div>
        ) : (
          <div className="feed">
            {contacts.map((c) => {
              const l = c.last_event ? evLabel(c.last_event) : null;
              const detail = `/contatos/${encodeURIComponent(c.phone)}`;
              return (
                <div key={c.phone} className="feed-item">
                  <Link href={detail} className="crm-ava-link" aria-label={t("contatos.abrirContatoAria", { nome: c.name || c.phone })}>
                    {c.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatar_url} alt="" className="g-ava crm-ava-img" width={38} height={38} />
                    ) : (
                      <div className="g-ava" style={{ width: 38, height: 38, fontSize: 12 }}>{initials(c.name || c.phone)}</div>
                    )}
                  </Link>
                  <div className="feed-txt" style={{ flex: 1, minWidth: 0 }}>
                    <Link href={detail} className="crm-name-link">
                      <b>{c.name || t("contatos.semNome")}</b>
                      {c.purchases > 0 && <span className="pill on" style={{ marginLeft: 8 }}>{t("contatos.seloCliente")}</span>}
                      {c.opted_out && <span className="pill" style={{ marginLeft: 6, color: "var(--crit)" }}>{t("contatos.seloOptOut")}</span>}
                    </Link>
                    <div className="feed-time" style={{ fontFamily: "var(--mono)" }}>{c.phone}{c.platform ? ` · ${c.platform}` : ""}</div>
                    {c.email && <div className="feed-time">{c.email}</div>}
                    {c.flows && c.flows.length > 0 && (
                      <div className="crm-flows">
                        <span className="crm-flows-lbl">{t("contatos.passouPor")}</span>
                        {c.flows.map((f) =>
                          f.exists ? (
                            <Link key={f.id} href={`/fluxos/${encodeURIComponent(f.id)}`} className="flow-chip node crm-flow-chip">{f.name}</Link>
                          ) : (
                            <span key={f.id} className="flow-chip muted-chip crm-flow-chip" title={t("contatos.fluxoRemovido")}>{f.name}</span>
                          ),
                        )}
                      </div>
                    )}
                    {c.tags && c.tags.length > 0 && (
                      <div className="crm-tags">
                        {c.tags.map((t) => (
                          // clicar na etiqueta filtra a lista por ela (clicar de novo tira o filtro)
                          <button key={t} type="button"
                            className={"crm-tag clicavel" + (t === GROUP_IMPORT_TAG ? " universal" : "") + (tagSel === t ? " ativa" : "")}
                            title={tagSel === t ? `Tirar o filtro "${t}"` : `Filtrar por "${t}"`}
                            onClick={(ev) => { ev.preventDefault(); setTagSel(tagSel === t ? "" : t); setPagina(1); }}>
                            <Icon name="tag" size={11} /><span className="crm-tag-txt">{t}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {l && (
                    <div style={{ textAlign: "right", fontSize: 12.5, whiteSpace: "nowrap" }}>
                      <div><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", marginRight: 6, verticalAlign: "middle" }} className={"badge-ico " + l.c} />{l.t}</div>
                      {c.last_event_at && <div className="feed-time">{ago(c.last_event_at)}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {totalPag > 1 && (
          <div className="paginacao">
            <button className="pag-btn" onClick={() => irPara(pagina - 1)} disabled={pagina <= 1 || loading} aria-label={t("contatos.paginaAnterior")}>‹</button>
            {paginasVisiveis(pagina, totalPag).map((p, i) =>
              p === "…" ? (
                <span key={"e" + i} className="pag-etc">…</span>
              ) : (
                <button key={p} className={"pag-btn" + (p === pagina ? " on" : "")} onClick={() => irPara(p)} disabled={loading}>{p}</button>
              ),
            )}
            <button className="pag-btn" onClick={() => irPara(pagina + 1)} disabled={pagina >= totalPag || loading} aria-label={t("contatos.proximaPagina")}>›</button>
            <span className="pag-info">{t("contatos.paginacaoInfo", { pagina, totalPag, total })}</span>
          </div>
        )}
      </div>
    </>
  );
}
