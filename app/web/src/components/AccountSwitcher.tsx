"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useAccounts, fmtNumber, TELA_AO_VIVO, podeTrocarConta, type Acct } from "@/components/accounts";
import { useAuth } from "@/components/Auth";
import { AddAccountModal } from "@/components/AddAccountModal";
import { ModalTermos } from "@/components/TermosAceite";
import { jsend } from "@/lib/client";

export function AccountSwitcher() {
  const { accounts, activeId, activeAcct, setActive } = useAccounts();
  // Nome de FORNECEDOR (UazAPI) é informação interna: o cliente compra "ZapConverte", não
  // precisa saber com quem a gente fala por baixo. Só o super-admin vê o detalhe do slot.
  const { session } = useAuth();
  const superAdmin = session?.user.role === "admin";
  const router = useRouter();
  const pathname = usePathname();
  const [reconectar, setReconectar] = useState(false);
  const [pedirTermos, setPedirTermos] = useState(false);
  // Se já estou vendo um chat ao vivo, trocar de bolinha deve abrir o chat DAQUELE número
  // (não só trocar a conta ativa e deixar a tela sem bater com o que está selecionado).
  const emChatAoVivo = pathname === "/ao-vivo" || pathname === "/oficial/inbox";
  async function escolher(a: Acct) {
    // A tela aberta pode ter trabalho não salvo (fluxo em edição). O aviso padrão do painel só
    // pega clique em LINK, e isto aqui é BOTÃO — passava direto e o trabalho sumia sem pergunta.
    // A guarda: devolve false = o usuário decidiu ficar; true = pode trocar (e ela pode ter
    // redirecionado por conta própria, como o fluxo com Template indo pra tela de modelos).
    if (!(await podeTrocarConta(a.type))) return;
    setActive(a.id);
    if (emChatAoVivo) {
      const destino = TELA_AO_VIVO[a.type];
      if (destino && destino !== pathname) router.push(destino);
    }
  }
  const [showAdd, setShowAdd] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  const [err, setErr] = useState("");

  // Esc fecha o modal de remover (menos enquanto está removendo, pra não interromper a chamada).
  useEffect(() => {
    if (!showRemove) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !removing) setShowRemove(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showRemove, removing]);

  // Só dá pra remover / silenciar números LITE ADICIONADOS (id "lite-xxxx"); a conta principal
  // ("lite", do .env) e as de API oficial não saem por aqui.
  const removable = !!activeAcct && activeAcct.id.startsWith("lite-");

  async function toggleAuto() {
    if (!activeAcct || savingAuto) return;
    setSavingAuto(true);
    setErr("");
    try {
      await jsend("/api/lite/automation", "POST", { account: activeAcct.id, noAuto: !activeAcct.noAuto });
      window.location.reload(); // reflete o novo estado no seletor
    } catch (e: any) {
      setErr(e.message);
      setSavingAuto(false);
    }
  }

  // Excluir do painel. Duas rotas, porque os casos são diferentes:
  //  • número EXTRA (lite-xxxx) → apaga a instância na UazAPI e libera o slot da assinatura;
  //  • número PRINCIPAL (token do .env) → não dá pra apagar (é o remetente padrão do motor), então
  //    a bolinha some do seletor e o token fica de reserva pro "+" → Conectar por QR.
  async function remover() {
    if (!activeAcct) return;
    setRemoving(true);
    setErr("");
    try {
      if (activeAcct.id.startsWith("lite-")) await jsend("/api/lite/remove", "POST", { account: activeAcct.id });
      else await jsend("/api/lite/limpar-offline", "POST", {});
      window.location.reload(); // recarrega o seletor sem a conta removida
    } catch (e: any) {
      setErr(e.message);
      setRemoving(false);
    }
  }

  // Desvincular um WhatsApp de CLIENTE que caiu na conta do super-admin (incidente 16/08):
  // devolve pro dono, sem apagar a sessão do cliente.
  async function desvincular() {
    if (!activeAcct) return;
    if (!confirm(`Desvincular "${activeAcct.name}"? Este WhatsApp é de um cliente e vai sair da sua conta. A sessão dele NÃO é apagada — volta pra conta dele.`)) return;
    setRemoving(true); setErr("");
    try {
      await jsend("/api/lite/desvincular", "POST", { account: activeAcct.id });
      window.location.reload();
    } catch (e: any) { setErr(e.message); setRemoving(false); }
  }

  return (
    <div className="accounts-box">
      <div className="nav-label" style={{ padding: "2px 4px 6px" }}>Contas</div>
      <div className="acct-stack">
        {accounts.map((a) => (
          <button key={a.id} className={"acct-bubble" + (a.id === activeId ? " active" : "") + (a.connected ? "" : " offline") + (a.alheia ? " alheia" : "")} onClick={() => escolher(a)} title={a.alheia ? a.name + " — WhatsApp de cliente (desvincular)" : a.connected ? a.name : a.name + " — offline"}>
            {a.alheia && <span className="acct-alheia-dot" title="WhatsApp de cliente na sua conta">!</span>}
            {/* Tamanho vem do CSS: a conta ATIVA fica maior que as outras (ver .acct-bubble). */}
            <span className="pfp">
              <span className="pfp-in">
                {a.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <span className="acct-init">{(a.name || "?").slice(0, 2).toUpperCase()}</span>
                )}
              </span>
            </span>
            <span className={"acct-badge " + (a.connected ? a.type.toLowerCase() : "offline")}>{a.connected ? a.type : "OFFLINE"}</span>
          </button>
        ))}
        {/* ⚖️ NÚMERO NOVO passa pelo aceite ANTES do QR/wizard. É o aceite que mais vale numa
            discussão de banimento: foi dado segundos antes de pôr AQUELE número no ar. Só o super
            admin pula — ele é quem escreve os termos. "Reconectar QR" (abaixo) NÃO passa por aqui
            de propósito: é o mesmo número já aceito, e travar recuperação de número caído seria
            atrito no pior momento. */}
        <button className="acct-add" data-tour="connect" title="Adicionar número"
                onClick={() => { setReconectar(false); superAdmin ? setShowAdd(true) : setPedirTermos(true); }}>+</button>
      </div>
      {/* PORTAL no <body> DE PROPÓSITO: a sidebar é position:sticky → cria stacking context próprio,
          e um modal renderizado DENTRO dela é pintado POR BAIXO do conteúdo da página (o chat
          atravessava o popup e engolia os cliques — bug dos prints de 06/08). */}
      {pedirTermos && createPortal(
        <ModalTermos
          momento="canal"
          referencia="novo número pelo seletor de contas"
          onAceito={() => { setPedirTermos(false); setShowAdd(true); }}
          onCancelar={() => setPedirTermos(false)}
        />,
        document.body,
      )}
      {showAdd && createPortal(
        <AddAccountModal onClose={() => setShowAdd(false)} reconectando={reconectar ? activeAcct?.name : undefined} />,
        document.body,
      )}
      <div className="acc-label" style={{ marginTop: 10 }}>
        {activeAcct ? (
          <>
            Ativa: <b>{activeAcct.name}</b>
            {activeAcct.number && <div className="tnum" style={{ marginTop: 2, color: "#A9D6C9" }}>{fmtNumber(activeAcct.number)}</div>}
            {/* WhatsApp de CLIENTE que caiu na sua conta (incidente 16/08): avisa em VERMELHO e
                oferece desvincular (devolve pro dono, sem apagar a sessão do cliente). */}
            {activeAcct.alheia && (
              <div className="acct-aviso perigo">
                ⚠ Este WhatsApp é de um <b>cliente</b> — não é seu. Desvincule pra devolver pra conta dele (a sessão dele não é apagada).
                <div className="acct-acoes">
                  <button className="acct-chip perigo" onClick={desvincular} disabled={removing}>{removing ? "…" : "Desvincular"}</button>
                </div>
              </div>
            )}
            {/* LITE caiu (QR desparelhou/celular sem internet): a reconexão reaproveita a MESMA
                instância — não perde o histórico já arquivado. API Oficial não usa QR, então não
                mostra este aviso (a reconexão dela é pelo Gerenciador da Meta). */}
            {activeAcct.type === "LITE" && !activeAcct.connected && (
              <div className="acct-aviso">
                Este número caiu — escaneie o QR pra reconectar (o histórico continua aqui).
                <div className="acct-acoes">
                  <button className="acct-chip" onClick={() => { setReconectar(true); setShowAdd(true); }}>Reconectar QR</button>
                  {/* Rótulos CURTOS: na barra estreita dois botões longos se atropelavam (print
                      18/08). O Excluir abre a MESMA confirmação do Remover — o que ele faz por
                      baixo depende do tipo da conta (ver `remover`). */}
                  <button className="acct-chip perigo" onClick={() => { setErr(""); setShowRemove(true); }}
                    title="Tira este número do painel">Excluir</button>
                </div>
              </div>
            )}
            {removable && activeAcct.noAuto && (
              <div className="acct-aviso">Automação desligada — este número só recebe</div>
            )}
            {removable && (
              <div className="acct-acoes">
                <button className="acct-chip" onClick={toggleAuto} disabled={savingAuto}
                  title={activeAcct.noAuto ? "Voltar a rodar fluxos e agente neste número" : "Este número para de rodar fluxos/agente (continua recebendo)"}>
                  {savingAuto ? "Salvando…" : activeAcct.noAuto ? "Ligar automação" : "Pausar automação"}
                </button>
                <button className="acct-chip perigo" onClick={() => { setErr(""); setShowRemove(true); }} title="Desconectar e apagar este número do painel">
                  Remover
                </button>
              </div>
            )}
          </>
        ) : (
          <span style={{ color: "#A9D6C9" }}>Conecte um número →</span>
        )}
      </div>

      {showRemove && activeAcct && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420, padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>Tem certeza que deseja excluir?</h3>
            <p style={{ fontSize: 13, marginBottom: 10 }}>
              <b>{activeAcct.name}</b>{activeAcct.number ? ` · ${fmtNumber(activeAcct.number)}` : ""}
            </p>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>
              {activeAcct.id.startsWith("lite-") ? (
                superAdmin ? (
                  <>Isso apaga a instância na UazAPI (<b>libera o slot</b> da sua assinatura) e remove a conta do painel. Pra usar esse número de novo no LITE, você teria que reconectar pelo QR.</>
                ) : (
                  <>Este número sai do painel e <b>libera uma vaga</b> no seu plano. As conversas e automações dele param de rodar. Pra usar esse número de novo, é só conectar pelo QR Code outra vez.</>
                )
              ) : (
                <>Este é o <b>número principal</b> do painel. Ele sai do seletor e some daqui; o canal fica <b>reservado</b> pra você conectar outro aparelho quando quiser, pelo <b>+ → Conectar por QR</b>.</>
              )}
            </p>
            {err && <p style={{ color: "var(--crit)", fontSize: 12.5, marginBottom: 10 }}>{err}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setShowRemove(false)} disabled={removing}>Cancelar</button>
              <button className="btn danger" onClick={remover} disabled={removing}>{removing ? "Excluindo…" : "Sim, excluir"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
