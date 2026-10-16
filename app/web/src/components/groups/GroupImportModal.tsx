"use client";

// Popup: importar contatos de um grupo pro CRM. Lista os grupos do número, sugere a tag = nome do
// grupo (editável) e importa os participantes marcando com essa tag + a universal "importado grupo".
import { useMemo, useState } from "react";
import { jsend, GroupListItem } from "@/lib/client";
import { useGroupList } from "@/components/groups/useGroupList";
import { Icon } from "@/components/icons";

export function GroupImportModal({ onClose, preset }: { onClose: () => void; preset?: { jid: string; name: string } }) {
  const { groupList, groupsErr, loaded } = useGroupList();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<GroupListItem | null>(preset ? ({ jid: preset.jid, name: preset.name } as GroupListItem) : null);
  const [tag, setTag] = useState(preset?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; group: string; tag: string; comNome?: number; semNome?: number; daAgenda?: number; doPerfil?: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? groupList.filter((g) => (g.name || "").toLowerCase().includes(t)) : groupList;
  }, [groupList, q]);

  function pick(g: GroupListItem) {
    setSel(g);
    setTag(g.name || ""); // tag sugerida = nome do grupo (editável)
    setResult(null);
    setErr(null);
  }

  async function importar() {
    if (!sel || !tag.trim() || busy) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await jsend("/api/groups/import-contacts", "POST", { jid: sel.jid, tag: tag.trim() });
      setResult({ imported: r.imported ?? 0, skipped: r.skipped ?? 0, group: r.group || sel.name || "", tag: tag.trim(), comNome: r.comNome ?? 0, semNome: r.semNome ?? 0, daAgenda: r.daAgenda ?? 0, doPerfil: r.doPerfil ?? 0 });
    } catch (e: any) {
      setErr(e?.message || "falha ao importar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="import-head">
          <div>
            <h3 style={{ margin: 0 }}>{preset ? "Importar contatos do grupo" : "Importar contatos de um grupo"}</h3>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {preset ? <>Traga os participantes de <b>{preset.name}</b> pro seu CRM.</> : "Escolha um grupo, confira a tag e traga os participantes pro seu CRM."}
            </div>
          </div>
          <button className="btn ic" onClick={onClose} aria-label="Fechar"><Icon name="close" size={16} /></button>
        </div>

        {!preset && (
          <>
            <input className="inp" placeholder="Buscar grupo…" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: "12px 0 10px" }} />
            {groupsErr ? (
              <div className="muted" style={{ color: "var(--crit)", padding: "8px 0" }}>Não consegui listar os grupos: {groupsErr}</div>
            ) : !loaded ? (
              <div className="muted" style={{ padding: "8px 0" }}>Carregando grupos…</div>
            ) : groupList.length === 0 ? (
              <div className="muted" style={{ padding: "8px 0" }}>Este número não está em nenhum grupo.</div>
            ) : (
              <div className="import-grouplist">
                {filtered.map((g) => (
                  <button key={g.jid} className={"import-group" + (sel?.jid === g.jid ? " sel" : "")} onClick={() => pick(g)}>
                    <span className="import-g-name">{g.name || g.jid}</span>
                    {typeof g.participantCount === "number" && <span className="import-g-count">{g.participantCount}</span>}
                  </button>
                ))}
                {filtered.length === 0 && <div className="muted" style={{ padding: 8 }}>Nenhum grupo pra “{q}”.</div>}
              </div>
            )}
          </>
        )}

        {sel && (
          <div className="import-foot">
            <label className="import-taglbl">Tag (aparece nos contatos)</label>
            <input className="inp" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="nome da tag" />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Além dessa, cada contato recebe também a tag <b>importado grupo</b>.</div>
            <button className="btn primary" style={{ marginTop: 12, width: "100%" }} disabled={busy || !tag.trim()} onClick={importar}>
              {busy ? "Importando…" : `Importar contatos de “${sel.name || "grupo"}”`}
            </button>
          </div>
        )}

        {result && (
          <div className="import-result ok">
            <Icon name="check" size={16} /> {result.imported} contato(s) importado(s) de “{result.group}” com a tag “{result.tag}”.
            {result.skipped > 0 && ` (${result.skipped} sem telefone, ignorados)`}
            {/* Transparência de onde veio cada nome — em grupo grande a maioria não tem nome
                disponível (o WhatsApp não expõe o nome de quem você não salvou e nunca falou). */}
            {typeof result.comNome === "number" && (
              <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
                <b>{result.comNome}</b> com nome ({result.daAgenda} da sua agenda · {result.doPerfil} do perfil público)
                {(result.semNome ?? 0) > 0 && <> · <b>{result.semNome}</b> entraram só com o telefone — o WhatsApp não revela o nome de quem você não tem salvo e que nunca falou no grupo.</>}
              </div>
            )}
          </div>
        )}
        {err && <div className="import-result err"><Icon name="close" size={16} /> {err}</div>}
      </div>
    </div>
  );
}
