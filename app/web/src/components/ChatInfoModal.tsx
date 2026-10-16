"use client";

// Modal "Dados da conversa" — réplica do painel de informações do WhatsApp Desktop (pedido de
// 08/08, prints do app): sidebar (Dados / Membros), herói com foto + ações, descrição, Sair do
// grupo e o rodapé "Criado por … / Criado em …". Sem "Mostrar mudanças de membros", mensagem
// temporária, privacidade avançada e tema (cortados de propósito no pedido).
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { jget, jsend, initials } from "@/lib/client";
import { fmtNumber } from "@/components/accounts";
import { Icon } from "@/components/icons";
import { FotoZoom } from "@/components/FotoZoom";
import { FichaContato } from "@/components/FichaContato";

interface Membro { lid: string; phone: string; name: string; isAdmin: boolean; isSuperAdmin: boolean }
interface Ficha {
  name?: string;
  description?: string;
  createdAt?: string;
  ownerPhone?: string;
  ownerName?: string;
  mePhone?: string;
  meAdmin?: boolean;
  participants: Membro[];
}
export interface ChatInfoAlvo { id: string; name: string; image?: string; phone?: string; isGroup: boolean; pinned?: boolean }

export function ChatInfoModal({ account, chat, onClose, onTogglePin, onLeft, onOpenChat, onNome }: {
  account: string;
  chat: ChatInfoAlvo;
  onClose: () => void;
  // Fixa/desafixa no pai (que atualiza a lista). Devolve mensagem de erro (ex.: limite de 10) ou null.
  onTogglePin: (pin: boolean) => Promise<string | null>;
  onLeft: () => void; // saiu do grupo → o pai fecha a conversa e recarrega a lista
  onOpenChat: (phone: string, nome: string) => void; // "Conversar no privado" com um membro
  onNome?: (nome: string) => void; // nome trocado na Ficha → o pai atualiza título e lista
}) {
  // Contato abre direto na FICHA: clicar no nome é pra editar os dados da pessoa (pedido 09/10).
  const [aba, setAba] = useState<"dados" | "membros" | "ficha">(chat.isGroup ? "dados" : "ficha");
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [fichaErr, setFichaErr] = useState("");
  const [buscaM, setBuscaM] = useState("");
  const [buscaOn, setBuscaOn] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addNums, setAddNums] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState("");
  const [confirmaSair, setConfirmaSair] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [sairErr, setSairErr] = useState("");
  const [pinned, setPinned] = useState(!!chat.pinned);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinErr, setPinErr] = useState("");
  // Menu de contexto do membro (popover estilo WhatsApp, ancorado na linha clicada).
  const [menu, setMenu] = useState<{ m: Membro; x: number; y: number; acima: boolean } | null>(null);
  const [menuBusy, setMenuBusy] = useState(false);
  const [menuErr, setMenuErr] = useState("");
  // Foto do contato/grupo AMPLIADA (igual WhatsApp: clicar na foto abre ela grande). Pedido do
  // Admin, 10/09 — antes a foto era só um enfeite de 108px e não dava pra ver o rosto.
  const [fotoGrande, setFotoGrande] = useState(false);

  // Esc fecha na ordem: foto ampliada → menu do membro → confirm de sair → o modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (fotoGrande) setFotoGrande(false);
      else if (menu) setMenu(null);
      else if (confirmaSair) setConfirmaSair(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirmaSair, menu, fotoGrande]);

  async function carregaFicha() {
    try { setFicha(await jget(`/api/inbox/group-info?account=${encodeURIComponent(account)}&chatid=${encodeURIComponent(chat.id)}`)); }
    catch (e: any) { setFichaErr(e.message); }
  }
  useEffect(() => {
    if (!chat.isGroup) return;
    let vivo = true;
    jget(`/api/inbox/group-info?account=${encodeURIComponent(account)}&chatid=${encodeURIComponent(chat.id)}`)
      .then((r) => { if (vivo) setFicha(r); })
      .catch((e: any) => { if (vivo) setFichaErr(e.message); });
    return () => { vivo = false; };
  }, [account, chat.id, chat.isGroup]);

  const membros = useMemo(() => {
    const lista = ficha?.participants ?? [];
    const q = buscaM.trim().toLowerCase();
    if (!q) return lista;
    const dig = q.replace(/\D/g, "");
    return lista.filter((m) => (m.name || "").toLowerCase().includes(q) || (dig.length >= 2 && m.phone.includes(dig)));
  }, [ficha, buscaM]);

  const telefone = (chat.phone || chat.id).replace(/@.*/, "").replace(/\D/g, "");
  const criadoEm = ficha?.createdAt
    ? new Date(ficha.createdAt).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const criadoPor = ficha?.ownerName || (ficha?.ownerPhone ? fmtNumber(ficha.ownerPhone) : "");

  async function alternaFixar() {
    if (pinBusy) return;
    setPinBusy(true);
    setPinErr("");
    const alvo = !pinned;
    const erro = await onTogglePin(alvo);
    if (erro) setPinErr(erro);
    else setPinned(alvo);
    setPinBusy(false);
  }

  async function adicionar() {
    const nums = addNums.split(/[\s,;\n]+/).map((s) => s.replace(/\D/g, "")).filter((s) => s.length >= 8);
    if (!nums.length) { setAddMsg("Digite ao menos um número com DDD (ex.: 11 91234-5678)."); return; }
    setAddBusy(true);
    setAddMsg("");
    try {
      const r = await jsend("/api/inbox/group-add", "POST", { account, chatid: chat.id, numbers: nums });
      const ok: string[] = r.ok ?? [];
      const fail: Array<{ number: string; reason: string }> = r.fail ?? [];
      setAddMsg(
        `${ok.length} adicionado${ok.length === 1 ? "" : "s"}` +
        (fail.length ? ` · não deu pra ${fail.length}: ` + fail.map((f) => `${fmtNumber(f.number)} (${f.reason})`).join("; ") : "")
      );
      if (ok.length) { setAddNums(""); await carregaFicha(); }
    } catch (e: any) {
      setAddMsg("Falhou: " + e.message);
    } finally {
      setAddBusy(false);
    }
  }

  async function sairDoGrupo() {
    setSaindo(true);
    setSairErr("");
    try {
      await jsend("/api/inbox/group-leave", "POST", { account, chatid: chat.id });
      onLeft();
    } catch (e: any) {
      setSairErr(e.message);
      setSaindo(false);
    }
  }

  // ── Menu do membro ──────────────────────────────────────────────────────────
  const ehEu = (m: Membro) => !!ficha?.mePhone && !!m.phone && m.phone.slice(-8) === ficha.mePhone.slice(-8);
  // meAdmin === false esconde as ações de admin; undefined (não deu pra saber) mostra e deixa o
  // motor recusar com a mensagem certa. Precisa do telefone — o updateParticipants vai por número.
  const podeGerir = (m: Membro) => ficha?.meAdmin !== false && !ehEu(m) && !!m.phone;

  function abreMenu(e: React.MouseEvent, m: Membro) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const acima = r.bottom + 250 > window.innerHeight; // não deixa o popover estourar embaixo
    setMenuErr("");
    setMenu({ m, x: Math.min(r.left + 70, window.innerWidth - 336), y: acima ? r.top - 6 : r.bottom + 4, acima });
  }

  async function acaoMembro(action: "promote" | "demote" | "remove") {
    if (!menu || menuBusy) return;
    setMenuBusy(true);
    setMenuErr("");
    try {
      await jsend("/api/inbox/group-member", "POST", { account, chatid: chat.id, action, participant: menu.m.phone });
      await carregaFicha();
      setMenu(null);
    } catch (e: any) {
      setMenuErr(e.message);
    } finally {
      setMenuBusy(false);
    }
  }

  const ava = chat.image ? (
    <button type="button" className="wi-ava clicavel" onClick={() => setFotoGrande(true)}
            title="Ver foto ampliada" aria-label="Ver foto ampliada">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={chat.image} alt="" />
    </button>
  ) : (
    <span className="wi-ava">{initials(chat.name)}</span>
  );

  const fotoAmpliada = fotoGrande && chat.image
    ? <FotoZoom url={chat.image} nome={chat.name} onClose={() => setFotoGrande(false)} />
    : null;

  return createPortal(
    <>
    <div className="modal-overlay">
      <div className="modal wi-modal" onClick={(e) => e.stopPropagation()}>
        <aside className="wi-side">
          <h2>{chat.isGroup ? "Grupo" : "Contato"}</h2>
          <button className={"wi-item" + (aba === "dados" ? " on" : "")} onClick={() => setAba("dados")}>
            <Icon name="info" size={17} /> Dados
          </button>
          {!chat.isGroup && (
            <button className={"wi-item" + (aba === "ficha" ? " on" : "")} onClick={() => setAba("ficha")}>
              <Icon name="user" size={17} /> Ficha
            </button>
          )}
          {chat.isGroup && (
            <button className={"wi-item" + (aba === "membros" ? " on" : "")} onClick={() => setAba("membros")}>
              <Icon name="group" size={17} /> Membros
            </button>
          )}
        </aside>

        <section className="wi-main">
          {aba === "ficha" && !chat.isGroup ? (
            <>
              <div className="wi-head"><b>Ficha do contato</b><span className="wi-head-sub">{fmtNumber(telefone)}</span></div>
              <div className="wi-body"><FichaContato phone={telefone} onNome={onNome} /></div>
            </>
          ) : aba === "dados" ? (
            <>
              <div className="wi-head"><b>Dados</b><span className="wi-head-sub">{chat.name}</span></div>
              <div className="wi-body">
                <div className="wi-hero">
                  {ava}
                  <div className="wi-nome">{chat.name}</div>
                  <div className="wi-sub">
                    {chat.isGroup
                      ? <>Grupo · {ficha ? `${ficha.participants.length} membros` : "carregando…"}</>
                      : fmtNumber(telefone)}
                  </div>
                  <div className="wi-actions">
                    {!chat.isGroup && (
                      <a className="wi-act" href={"tel:+" + telefone} title={"Ligar pra " + fmtNumber(telefone)}>
                        <Icon name="phone" size={18} /><span>Ligar</span>
                      </a>
                    )}
                    {chat.isGroup && (
                      <button className="wi-act" onClick={() => { setAba("membros"); setAddOpen(true); }}>
                        <Icon name="plus" size={18} /><span>Adicionar</span>
                      </button>
                    )}
                    <button className="wi-act" onClick={alternaFixar} disabled={pinBusy} title={pinned ? "Tirar do topo da lista" : "Fixar no topo da lista (até 10)"}>
                      <Icon name="pin" size={18} /><span>{pinned ? "Desafixar" : "Fixar"}</span>
                    </button>
                  </div>
                  {pinErr && <div className="wi-erro">{pinErr}</div>}
                </div>

                {chat.isGroup && ficha?.description && <div className="wi-card wi-desc">{ficha.description}</div>}

                {chat.isGroup && (
                  <div className="wi-card">
                    <button className="wi-row perigo" onClick={() => { setSairErr(""); setConfirmaSair(true); }}>
                      <Icon name="logout" size={16} /> Sair do grupo
                    </button>
                  </div>
                )}

                {chat.isGroup && (criadoPor || criadoEm) && (
                  <div className="wi-criado">
                    {criadoPor && <div>Criado por {criadoPor}.</div>}
                    {criadoEm && <div>Criado em {criadoEm}.</div>}
                  </div>
                )}
                {fichaErr && <div className="wi-erro">{fichaErr}</div>}
              </div>
            </>
          ) : (
            <>
              <div className="wi-head">
                <b>Membros</b>
                {buscaOn ? (
                  <input
                    className="inp wi-busca" autoFocus placeholder="Pesquisar por nome ou telefone"
                    value={buscaM} onChange={(e) => setBuscaM(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { setBuscaM(""); setBuscaOn(false); } }}
                  />
                ) : (
                  <button className="wi-lupa" title="Pesquisar membro" onClick={() => setBuscaOn(true)}>
                    <Icon name="search" size={16} />
                  </button>
                )}
              </div>
              <div className="wi-body wi-body-membros">
                <button className="wi-member wi-member-add" onClick={() => setAddOpen((o) => !o)}>
                  <span className="wi-mava add"><Icon name="plus" size={17} /></span>
                  <span className="wi-mtxt"><b>Adicionar membro</b></span>
                </button>
                {addOpen && (
                  <div className="wi-add-form">
                    <textarea
                      className="inp" rows={2} value={addNums} autoFocus
                      placeholder={"Números com DDD, um por linha ou separados por vírgula.\nEx.: 11 91234-5678"}
                      onChange={(e) => { setAddNums(e.target.value); setAddMsg(""); }}
                    />
                    <div className="wi-add-acoes">
                      <button className="btn" onClick={() => { setAddOpen(false); setAddMsg(""); }} disabled={addBusy}>Cancelar</button>
                      <button className="btn primary" onClick={adicionar} disabled={addBusy}>{addBusy ? "Adicionando…" : "Adicionar ao grupo"}</button>
                    </div>
                    {addMsg && <div className="wi-add-msg">{addMsg}</div>}
                  </div>
                )}
                {!ficha && !fichaErr && <div className="muted" style={{ padding: "14px 4px", fontSize: 13 }}>Carregando membros…</div>}
                {fichaErr && <div className="wi-erro">{fichaErr}</div>}
                {membros.map((m) => (
                  <button key={m.lid || m.phone} className="wi-member wi-member-clic" onClick={(e) => abreMenu(e, m)} title={ehEu(m) ? "Você" : "Opções do membro"}>
                    <span className="wi-mava">{initials(m.name || m.phone)}</span>
                    <span className="wi-mtxt">
                      <b>{m.name || fmtNumber(m.phone)}</b>{ehEu(m) && <span className="wi-voce"> · você</span>}
                    </span>
                    <span className="wi-mdir">
                      {m.isAdmin && <span className="wi-admin">{m.isSuperAdmin ? "Admin do grupo" : "Admin"}</span>}
                      {m.name && m.phone && <span className="wi-mfone">{fmtNumber(m.phone)}</span>}
                    </span>
                    <Icon name="chevron-right" size={15} className="wi-chev" />
                  </button>
                ))}
                {ficha && !membros.length && <div className="muted" style={{ padding: "14px 4px", fontSize: 13 }}>Ninguém com “{buscaM.trim()}”.</div>}
              </div>
            </>
          )}
          <div className="wi-foot">
            <button className="btn primary" onClick={onClose}>OK</button>
          </div>
        </section>

        {confirmaSair && (
          <div className="wi-confirma" onClick={() => !saindo && setConfirmaSair(false)}>
            <div className="wi-confirma-caixa" onClick={(e) => e.stopPropagation()}>
              <h3>Sair do grupo “{chat.name}”?</h3>
              <p className="muted">Você deixa de receber as mensagens deste grupo neste número. Só um admin pode te colocar de volta.</p>
              {sairErr && <p className="wi-erro">{sairErr}</p>}
              <div className="wi-add-acoes">
                <button className="btn" onClick={() => setConfirmaSair(false)} disabled={saindo}>Cancelar</button>
                <button className="btn danger" onClick={sairDoGrupo} disabled={saindo}>{saindo ? "Saindo…" : "Sair do grupo"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Popover do membro — réplica do menu do WhatsApp (cabeçalho com foto/nome, itens em
            cartões com o ícone à direita, destrutivos em vermelho). Posição fixa ancorada na
            linha clicada; o fundo transparente fecha sem fechar o modal. */}
        {menu && (
          <>
            <div className="wi-menu-fundo" onClick={(e) => { e.stopPropagation(); if (!menuBusy) setMenu(null); }} />
            <div className="wi-menu" style={{ left: menu.x, top: menu.y, transform: menu.acima ? "translateY(-100%)" : undefined }}>
              <div className="wi-menu-cab">
                <span className="wi-mava">{initials(menu.m.name || menu.m.phone)}</span>
                <b>{menu.m.name || fmtNumber(menu.m.phone)}</b>
              </div>
              {menu.m.phone && !ehEu(menu.m) && (
                <button className="wi-menu-item" disabled={menuBusy}
                  onClick={() => { setMenu(null); onOpenChat(menu.m.phone, menu.m.name || fmtNumber(menu.m.phone)); }}>
                  Conversar no privado <Icon name="text" size={17} />
                </button>
              )}
              {podeGerir(menu.m) && (
                <>
                  {menu.m.isSuperAdmin ? null : menu.m.isAdmin ? (
                    <button className="wi-menu-item perigo" disabled={menuBusy} onClick={() => acaoMembro("demote")}>
                      Remover da lista de admins <Icon name="user-minus" size={17} />
                    </button>
                  ) : (
                    <button className="wi-menu-item" disabled={menuBusy} onClick={() => acaoMembro("promote")}>
                      Promover a admin do grupo <Icon name="user-check" size={17} />
                    </button>
                  )}
                  <button className="wi-menu-item perigo" disabled={menuBusy} onClick={() => acaoMembro("remove")}>
                    Remover do grupo <Icon name="circle-minus" size={17} />
                  </button>
                </>
              )}
              {ehEu(menu.m) && <div className="wi-menu-nota">Esse é o seu número neste grupo — pra sair, use “Sair do grupo” em Dados.</div>}
              {menuBusy && <div className="wi-menu-nota">Aplicando…</div>}
              {menuErr && <div className="wi-menu-err">{menuErr}</div>}
            </div>
          </>
        )}
      </div>
    </div>
    {fotoAmpliada}
    </>,
    document.body
  );
}
