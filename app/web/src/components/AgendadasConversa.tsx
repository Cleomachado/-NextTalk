"use client";

// Mensagens AGENDADAS desta conversa (pedido do dono, 05/10): depois de agendar pelo botão
// "Agendar", nada na conversa mostrava que havia envio marcado. Agora aparece uma faixa em cima da
// caixa de mensagem ("Mensagem agendada · 06/10/26 09:00") e, clicando, uma janela com todas as
// agendadas daqui: ver, editar texto/data/hora, cancelar e agendar outras.
// Fonte: os Lembretes da conta (/api/reminders) — o agendamento do chat é um lembrete "once"
// mirando este número/grupo; os recorrentes (todo dia / dias da semana) também aparecem.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { jget, jsend } from "@/lib/client";
import { Icon } from "@/components/icons";

interface Lembrete {
  id: string; name?: string; enabled: boolean;
  schedule: { type: "once" | "daily" | "weekly"; time: string; days?: number[]; date?: string };
  target: string; message: string; account?: string; mediaType?: string; flowId?: string;
  sobre?: string; // aviso à equipe SOBRE esta conversa (Agendar → Avisar alguém)
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ehDestaConversa = (alvo: string, ehGrupo: boolean) => (r: Lembrete) => {
  const t = String(r.sobre ?? r.target ?? "");
  if (ehGrupo) return t === alvo;
  const a = alvo.replace(/\D/g, ""), b = t.replace(/\D/g, "");
  return !t.includes("@g.us") && a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8);
};
const quando = (r: Lembrete) => new Date(`${r.schedule.date}T${r.schedule.time}`);
const pendente = (r: Lembrete) => r.enabled && (r.schedule.type !== "once" || (!!r.schedule.date && quando(r) > new Date()));
function rotulo(r: Lembrete): string {
  if (r.schedule.type === "once" && r.schedule.date) {
    const [a, m, d] = r.schedule.date.split("-");
    return `${d}/${m}/${a.slice(2)} ${r.schedule.time}`;
  }
  if (r.schedule.type === "daily") return `todo dia ${r.schedule.time}`;
  return `${(r.schedule.days ?? []).map((d) => DIAS[d]).join(", ")} ${r.schedule.time}`;
}
const hojeMais = (min: number) => {
  const t = new Date(Date.now() + min * 60000);
  return { data: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`, hora: `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}` };
};

export function AgendadasConversa({ alvo, ehGrupo, nome, account }: { alvo: string; ehGrupo: boolean; nome: string; account: string }) {
  const [todos, setTodos] = useState<Lembrete[] | null>(null);
  const [aberto, setAberto] = useState(false);

  const ler = useCallback(() => {
    jget("/api/reminders").then((d) => setTodos(Array.isArray(d?.reminders) ? d.reminders : [])).catch(() => setTodos([]));
  }, []);
  useEffect(() => { setAberto(false); ler(); const t = setInterval(ler, 60_000); return () => clearInterval(t); }, [alvo, ler]);
  // O botão "Agendar" do topo avisa quando salva — a faixa aparece na hora.
  useEffect(() => { window.addEventListener("zc-agendadas-rever", ler); return () => window.removeEventListener("zc-agendadas-rever", ler); }, [ler]);

  const daqui = useMemo(() => (todos ?? []).filter(ehDestaConversa(alvo, ehGrupo)).filter(pendente)
    .sort((a, b) => (a.schedule.type === "once" ? quando(a).getTime() : Infinity) - (b.schedule.type === "once" ? quando(b).getTime() : Infinity)), [todos, alvo, ehGrupo]);

  if (!daqui.length && !aberto) return null;
  const prox = daqui[0];
  return (
    <>
      {prox && (
        <button type="button" className="agendadas-faixa" onClick={() => setAberto(true)} title="Ver, editar ou cancelar as mensagens agendadas desta conversa">
          <Icon name="clock" size={14} />
          <span>{prox.sobre ? "Aviso agendado" : "Mensagem agendada"} · <b>{rotulo(prox)}</b></span>
          <span className="agendadas-previa">{prox.message}</span>
          {daqui.length > 1 && <span className="agendadas-mais">+{daqui.length - 1}</span>}
        </button>
      )}
      {aberto && typeof document !== "undefined" && createPortal(
        <JanelaAgendadas todos={todos ?? []} daqui={daqui} alvo={alvo} ehGrupo={ehGrupo} nome={nome} account={account}
          onSalvo={(lista) => setTodos(lista)} onClose={() => setAberto(false)} />,
        document.body,
      )}
    </>
  );
}

function JanelaAgendadas({ todos, daqui, alvo, ehGrupo, nome, account, onSalvo, onClose }: {
  todos: Lembrete[]; daqui: Lembrete[]; alvo: string; ehGrupo: boolean; nome: string; account: string;
  onSalvo: (lista: Lembrete[]) => void; onClose: () => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [msg, setMsg] = useState(""); const [data, setData] = useState(""); const [hora, setHora] = useState("");
  const [ocupado, setOcupado] = useState(false); const [erro, setErro] = useState("");
  const novo = editando === "novo";

  function abreNovo() { const s = hojeMais(30); setMsg(""); setData(s.data); setHora(s.hora); setErro(""); setEditando("novo"); }
  function abreEdicao(r: Lembrete) { setMsg(r.message); setData(r.schedule.date ?? ""); setHora(r.schedule.time); setErro(""); setEditando(r.id); }
  useEffect(() => { if (!daqui.length) abreNovo(); /* conversa sem agendada: já abre o formulário */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Relê a lista INTEIRA antes de gravar: os Lembretes são um documento só da conta, e outra
  // pessoa (ou a tela de Lembretes) pode ter mexido desde que esta janela abriu.
  async function grava(muda: (lista: Lembrete[]) => Lembrete[], ok: string) {
    setOcupado(true); setErro("");
    try {
      const atual = await jget("/api/reminders");
      const lista = muda(Array.isArray(atual?.reminders) ? atual.reminders : []);
      await jsend("/api/reminders", "PUT", { reminders: lista });
      onSalvo(lista); setEditando(null);
      window.dispatchEvent(new Event("zc-agendadas-rever"));
      void ok;
    } catch (e: any) { setErro("Não consegui salvar: " + (e?.message || "erro")); }
    finally { setOcupado(false); }
  }
  function salvar() {
    const texto = msg.trim();
    if (!texto) return setErro("Escreva a mensagem que vai ser enviada.");
    if (!data || !/^\d{2}:\d{2}$/.test(hora)) return setErro("Confira a data e a hora.");
    if (new Date(`${data}T${hora}`) <= new Date()) return setErro("Esse horário já passou. Escolha um futuro.");
    if (novo) {
      return grava((l) => [...l, { id: "ag-" + Date.now(), name: "Agendada — " + nome.slice(0, 40), enabled: true,
        schedule: { type: "once", time: hora, date: data }, target: alvo, message: texto, account }], "agendada");
    }
    const id = editando;
    return grava((l) => l.map((r) => (r.id === id ? { ...r, message: texto, schedule: { ...r.schedule, type: "once", date: data, time: hora } } : r)), "editada");
  }
  function cancelar(r: Lembrete) {
    if (!window.confirm(`Cancelar a mensagem agendada pra ${rotulo(r)}?`)) return;
    grava((l) => l.filter((x) => x.id !== r.id), "cancelada");
  }
  void todos; void ehGrupo;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Fechar">×</button>
        <h3 style={{ fontSize: 17, marginBottom: 2 }}>Mensagens agendadas</h3>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>para <b>{nome}</b> · saem pelo número conectado no horário marcado</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {daqui.length === 0 && !novo && <div className="muted" style={{ fontSize: 13 }}>Nenhuma mensagem agendada nesta conversa.</div>}
          {daqui.map((r) => editando === r.id ? null : (
            <div key={r.id} className="agendada-item">
              <div className="agendada-topo">
                <b><Icon name="clock" size={13} /> {rotulo(r)}</b>
                {r.schedule.type !== "once" && <span className="tpl-status" style={{ fontSize: 10.5 }}>recorrente</span>}
                {r.sobre && <span className="tpl-status warn" style={{ fontSize: 10.5 }} title="Lembrete pra equipe, não vai pro cliente">aviso pra {String(r.target).replace(/^55/, "")}</span>}
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  {r.schedule.type === "once" && !r.flowId && !r.mediaType && <button className="btn" style={{ padding: "2px 9px", fontSize: 12 }} disabled={ocupado} onClick={() => abreEdicao(r)}>Editar</button>}
                  <button className="btn" style={{ padding: "2px 9px", fontSize: 12, color: "var(--crit)" }} disabled={ocupado} onClick={() => cancelar(r)}>Cancelar</button>
                </span>
              </div>
              <div className="agendada-texto">{r.flowId ? "(inicia um fluxo)" : r.message || (r.mediaType ? `(${r.mediaType})` : "")}</div>
            </div>
          ))}
        </div>

        {editando ? (
          <div className="agendada-form">
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{novo ? "Agendar nova mensagem" : "Editar mensagem agendada"}</div>
            <textarea className="inp ag-txt" rows={3} placeholder="O que vai ser enviado…" value={msg} autoFocus onChange={(e) => { setMsg(e.target.value); setErro(""); }} />
            <div className="ag-linha">
              <input className="inp" type="date" value={data} onChange={(e) => { setData(e.target.value); setErro(""); }} />
              <input className="inp" type="time" value={hora} onChange={(e) => { setHora(e.target.value); setErro(""); }} />
            </div>
            {erro && <div className="ag-erro">{erro}</div>}
            <div className="ag-acoes">
              {(daqui.length > 0 || !novo) && <button className="btn" onClick={() => setEditando(null)} disabled={ocupado}>Voltar</button>}
              <button className="btn primary" onClick={salvar} disabled={ocupado}>{ocupado ? "Salvando…" : novo ? "Agendar" : "Salvar"}</button>
            </div>
          </div>
        ) : (
          <>
            {erro && <div className="ag-erro" style={{ marginTop: 8 }}>{erro}</div>}
            <button className="btn primary" style={{ marginTop: 14 }} onClick={abreNovo} disabled={ocupado}>+ Agendar outra mensagem</button>
          </>
        )}
      </div>
    </div>
  );
}
