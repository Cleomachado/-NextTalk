"use client";

// RESUMOS (pedido do dono, 03/10/2026): resumo de uma conversa, de um grupo e o relatório do
// período, com um campo livre pra perguntar/extrair informação das conversas. Usa o número da
// bolinha ativa (mesma regra do WPP ao Vivo). Os números do relatório vêm do banco; a IA lê as
// conversas e escreve o texto — com a chave OpenAI da própria conta.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { jget, jsend } from "@/lib/client";
import { Icon } from "@/components/icons";
import { useAccounts, fmtNumber } from "@/components/accounts";
import { CalendarioPeriodo, atalhoPeriodo, rotuloPeriodo, type PeriodoDatas } from "@/components/CalendarioPeriodo";

type Aba = "periodo" | "conversa" | "grupo";
interface ChatOpcao { id: string; nome: string; grupo: boolean; quando?: number }
interface Metricas {
  contatosNovos: number; conversasAtivas: number;
  etiquetas: Array<{ tag: string; n: number }>;
  eventos: Array<{ evento: string; n: number; valor: number }>;
  fluxos: Array<{ fluxo: string; entraram: number; caminhos: Array<{ caminho: string; n: number }> }>;
}
// "Bom dia, Fulano, tudo bem?" pro botão Chamar. Hora de BRASÍLIA (o painel pode estar aberto em
// outro fuso) e só o primeiro nome, como o motor faz no {{primeiro_nome}}. Nome que não é nome
// ("99pop", emoji, "Dr Exemplo…" vira "Exemplo") cai em "Bom dia, tudo bem?".
const TITULOS = new Set(["dr", "dra", "sr", "sra", "srta", "prof", "profa"]);
function saudacaoPara(nome: string): string {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  const saud = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const palavras = String(nome || "").trim().split(/\s+/).map((p) => p.replace(/[.,]/g, ""));
  const primeiro = palavras.find((p) => !TITULOS.has(p.toLowerCase())) ?? "";
  const ehNome = /^[A-Za-zÀ-ÖØ-öø-ÿ]{2,}$/.test(primeiro);
  const n = ehNome ? primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR") : "";
  return n ? `${saud}, ${n}, tudo bem?` : `${saud}, tudo bem?`;
}

interface Classificada { nome: string; telefone: string; status: "fechou" | "em_andamento" | "perdido" | "nao_lead"; motivo: string; resposta?: string }
interface Resultado { tipo: string; texto: string; mensagens?: number; metricas?: Metricas; conversas?: Classificada[]; limitado?: boolean }

const STATUS: Record<Classificada["status"], { rot: string; cls: string }> = {
  fechou: { rot: "Fechou", cls: "ok" }, em_andamento: { rot: "Em andamento", cls: "and" },
  perdido: { rot: "Ficou pelo caminho", cls: "perd" }, nao_lead: { rot: "Não é lead", cls: "nao" },
};
const EVENTO: Record<string, string> = {
  purchase_approved: "Compras aprovadas", pix_generated: "Pix gerados", cart_abandoned: "Carrinhos abandonados",
  boleto_generated: "Boletos gerados", refund: "Reembolsos", subscription_renewed: "Renovações",
};
const EXEMPLOS: Record<Aba, string[]> = {
  periodo: ["Quais objeções mais apareceram?", "Quem pediu orçamento e não respondeu?", "De quais bairros vieram os pedidos?"],
  conversa: ["O que ficou combinado?", "Quais documentos ele já mandou?", "Qual valor foi passado?"],
  grupo: ["Quais tarefas ficaram pendentes e com quem?", "Alguém pediu ajuda e ficou sem resposta?", "Quais links e arquivos foram compartilhados?"],
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function Resumos() {
  const { accounts, activeAcct } = useAccounts();
  const router = useRouter();
  const conta = activeAcct?.id ?? accounts[0]?.id ?? "";
  const ehApi = (activeAcct?.type ?? accounts[0]?.type) === "API";
  const [aba, setAba] = useState<Aba>("periodo");
  const [periodo, setPeriodo] = useState<PeriodoDatas>(() => atalhoPeriodo("7d"));
  const [calAberto, setCalAberto] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [chats, setChats] = useState<ChatOpcao[]>([]);
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<ChatOpcao | null>(null);
  const [usarPeriodoConversa, setUsarPeriodoConversa] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [semChave, setSemChave] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Lista de conversas/grupos do número ativo (Lite: conversas + grupos; API Oficial: só conversas).
  useEffect(() => {
    if (!conta) return;
    let vivo = true;
    setChats([]); setEscolhido(null);
    const carrega = ehApi
      ? jget("/api/oficial/chats?limit=500").then((d) => (d.chats ?? []).map((c: any) => ({ id: c.chat_id, nome: c.name || fmtNumber(c.chat_id), grupo: false, quando: c.last_ts ? c.last_ts * 1000 : undefined })))
      : jget("/api/inbox/chats?account=" + encodeURIComponent(conta) + "&limit=1500").then((d) => (d.chats ?? []).map((c: any) => ({ id: c.id, nome: c.name || c.phone || c.id, grupo: !!c.isGroup, quando: c.timestamp ? (c.timestamp > 1e12 ? c.timestamp : c.timestamp * 1000) : undefined })));
    carrega.then((l: ChatOpcao[]) => { if (vivo) setChats(l); }).catch(() => { if (vivo) setChats([]); });
    return () => { vivo = false; };
  }, [conta, ehApi]);
  useEffect(() => { setEscolhido(null); setBusca(""); setRes(null); setErro(""); }, [aba]);

  const opcoes = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return chats.filter((c) => (aba === "grupo" ? c.grupo : !c.grupo) && (!t || c.nome.toLowerCase().includes(t) || c.id.includes(t))).slice(0, 60);
  }, [chats, busca, aba]);

  async function gerar() {
    setErro(""); setSemChave(false); setRes(null); setCopiado(false);
    if (aba !== "periodo" && !escolhido) { setErro(aba === "grupo" ? "Escolha um grupo." : "Escolha uma conversa."); return; }
    setGerando(true);
    try {
      const usaDatas = aba !== "conversa" || usarPeriodoConversa;
      const r = await jsend("/api/resumos", "POST", {
        tipo: aba, account: conta, pergunta: pergunta.trim() || undefined,
        ...(escolhido ? { chatid: escolhido.id, nome: escolhido.nome } : {}),
        ...(usaDatas ? { de: periodo.de, ate: periodo.ate } : {}),
      });
      setRes(r);
    } catch (e: any) {
      const msg = String(e?.message || "Não consegui gerar o resumo.");
      setErro(msg); setSemChave(/chave da OpenAI/i.test(msg));
    }
    setGerando(false);
  }

  function copiar() {
    if (!res) return;
    navigator.clipboard?.writeText(res.texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800); }).catch(() => {});
  }

  const contagem = (s: Classificada["status"]) => (res?.conversas ?? []).filter((c) => c.status === s).length;
  const compras = res?.metricas?.eventos.find((e) => e.evento === "purchase_approved");

  return (
    <div className="resumos">
      <div className="card card-pad">
        <div className="resumos-abas" role="tablist">
          {([["periodo", "Relatório do período", "chart"], ["conversa", "Uma conversa", "user"], ["grupo", "Um grupo", "group"]] as const).map(([id, rot, ic]) => (
            <button key={id} role="tab" aria-selected={aba === id} className={"resumos-aba" + (aba === id ? " on" : "")}
              disabled={id === "grupo" && ehApi} title={id === "grupo" && ehApi ? "Grupos existem só no WhatsApp Lite" : undefined}
              onClick={() => setAba(id)}>
              <Icon name={ic} size={15} /> {rot}
            </button>
          ))}
        </div>

        <div className="resumos-conta muted">
          Número: <b>{activeAcct?.number ? fmtNumber(activeAcct.number) : activeAcct?.name || "—"}</b> · para trocar, clique em outra bolinha na barra lateral.
        </div>

        {aba !== "periodo" && (
          <div className="field">
            <label>{aba === "grupo" ? "Grupo" : "Conversa"}</label>
            {escolhido ? (
              <div className="resumos-escolhido">
                <Icon name={escolhido.grupo ? "group" : "user"} size={14} /> <b>{escolhido.nome}</b>
                <button className="btn" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setEscolhido(null)}>Trocar</button>
              </div>
            ) : (
              <>
                <input className="inp" placeholder={aba === "grupo" ? "Buscar grupo pelo nome" : "Buscar por nome ou telefone"} value={busca} onChange={(e) => setBusca(e.target.value)} />
                <div className="resumos-lista">
                  {opcoes.length === 0 && <div className="muted" style={{ padding: 10, fontSize: 13 }}>{chats.length ? "Nada encontrado." : "Carregando…"}</div>}
                  {opcoes.map((c) => (
                    <button key={c.id} className="resumos-item" onClick={() => setEscolhido(c)}>
                      <span>{c.nome}</span>
                      {c.quando && <small className="muted">{new Date(c.quando).toLocaleDateString("pt-BR")}</small>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {(aba !== "conversa" || usarPeriodoConversa) && (
          <div className="field">
            <label>{aba === "grupo" ? "Mensagens de qual período" : "Período"}</label>
            <div className="resumos-periodo">
              {(aba === "grupo" ? ["hoje", "ontem", "7d"] : ["7d", "30d", "mes"]).map((id) => {
                const p = atalhoPeriodo(id); const on = p.de === periodo.de && p.ate === periodo.ate;
                const rot = { hoje: "Hoje", ontem: "Ontem", "7d": "7 dias", "30d": "30 dias", mes: "Este mês" }[id];
                return <button key={id} className={"btn" + (on ? " primary" : "")} style={{ padding: "6px 14px", fontSize: 13 }} onClick={() => { setCalAberto(false); setPeriodo(p); }}>{rot}</button>;
              })}
              <div className="cal-pop">
                <button className="btn" style={{ padding: "6px 14px", fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center" }} onClick={() => setCalAberto((v) => !v)}>
                  <Icon name="calendar" size={13} />{rotuloPeriodo(periodo)}
                </button>
                {calAberto && <CalendarioPeriodo valor={periodo} onChange={(p) => { setPeriodo(p); setCalAberto(false); }} onFechar={() => setCalAberto(false)} />}
              </div>
            </div>
          </div>
        )}
        {aba === "conversa" && (
          <label className="resumos-check">
            <input type="checkbox" checked={usarPeriodoConversa} onChange={(e) => setUsarPeriodoConversa(e.target.checked)} />
            Só as mensagens de um período (sem marcar, lê o histórico recente da conversa)
          </label>
        )}

        <div className="field">
          <label>O que você quer saber? <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
          <textarea className="inp" rows={2} maxLength={500} value={pergunta} onChange={(e) => setPergunta(e.target.value)}
            placeholder="Ex.: quantos pediram orçamento e não responderam? Quais endereços apareceram?" />
          <div className="resumos-exemplos">
            {EXEMPLOS[aba].map((x) => <button key={x} className="tpl-chip" onClick={() => setPergunta(x)}>{x}</button>)}
          </div>
        </div>

        <div className="resumos-acoes">
          <button className="btn primary" disabled={gerando || !conta} onClick={gerar}>
            <Icon name="spark" size={14} /> {gerando ? (aba === "periodo" ? "Lendo as conversas… pode levar até 1 minuto" : "Gerando…") : aba === "periodo" ? "Gerar relatório" : "Gerar resumo"}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>Usa a chave da OpenAI da sua conta.</span>
        </div>
        {erro && (
          <div className="ask-note" style={{ borderColor: "var(--crit)", marginTop: 10 }}>
            {erro} {semChave && <Link href="/integracoes" style={{ fontWeight: 700 }}>Abrir Integrações</Link>}
          </div>
        )}
      </div>

      {res && (
        <div className="card card-pad resumos-resultado">
          {res.metricas && (
            <div className="resumos-kpis">
              <div><b>{res.metricas.contatosNovos}</b><span>contatos novos</span></div>
              <div><b>{res.metricas.conversasAtivas}</b><span>conversas no período</span></div>
              <div className="ok"><b>{contagem("fechou")}</b><span>fecharam</span></div>
              <div><b>{contagem("em_andamento")}</b><span>em andamento</span></div>
              <div className="perd"><b>{contagem("perdido")}</b><span>ficaram pelo caminho</span></div>
              {compras && <div className="ok"><b>{brl(compras.valor)}</b><span>{compras.n} compra(s) aprovada(s)</span></div>}
            </div>
          )}
          {res.limitado && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>A IA leu as 40 conversas mais recentes do período. Os números de contatos, etiquetas e fluxos contam todas.</div>}

          <div className="resumos-texto-cab">
            <h3>{res.tipo === "periodo" ? "Relatório" : "Resumo"}</h3>
            {res.mensagens != null && <span className="muted" style={{ fontSize: 12 }}>{res.mensagens} mensagens lidas</span>}
            <button className="btn" style={{ marginLeft: "auto", padding: "5px 12px", fontSize: 12.5 }} onClick={copiar}><Icon name="copy" size={13} /> {copiado ? "Copiado" : "Copiar"}</button>
          </div>
          <div className="resumos-texto">{res.texto}</div>

          {res.metricas && (res.metricas.fluxos.length > 0 || res.metricas.etiquetas.length > 0 || res.metricas.eventos.length > 0) && (
            <div className="resumos-blocos">
              {res.metricas.fluxos.length > 0 && (
                <div>
                  <h4>Fluxos</h4>
                  {res.metricas.fluxos.map((f) => (
                    <div key={f.fluxo} className="resumos-linha-fluxo">
                      <div><b>{f.fluxo}</b> <span className="muted">· {f.entraram} entraram</span></div>
                      {f.caminhos.map((c) => <div key={c.caminho} className="muted" style={{ fontSize: 12.5, paddingLeft: 10 }}>{c.caminho}: {c.n}</div>)}
                    </div>
                  ))}
                </div>
              )}
              {res.metricas.etiquetas.length > 0 && (
                <div>
                  <h4>Etiquetas aplicadas</h4>
                  <div className="resumos-tags">{res.metricas.etiquetas.map((t) => <span key={t.tag} className="tpl-chip">{t.tag} · {t.n}</span>)}</div>
                </div>
              )}
              {res.metricas.eventos.length > 0 && (
                <div>
                  <h4>Vendas</h4>
                  {res.metricas.eventos.map((e) => <div key={e.evento} style={{ fontSize: 13 }}>{EVENTO[e.evento] ?? e.evento}: <b>{e.n}</b>{e.valor ? ` · ${brl(e.valor)}` : ""}</div>)}
                </div>
              )}
            </div>
          )}

          {res.conversas && res.conversas.length > 0 && (
            <>
              <h4 style={{ marginTop: 18 }}>Conversas analisadas</h4>
              <div className="resumos-tabela">
                <table>
                  <thead><tr><th>Contato</th><th>Situação</th><th>Motivo</th>{res.conversas.some((c) => c.resposta) && <th>Sua pergunta</th>}<th></th></tr></thead>
                  <tbody>
                    {res.conversas.map((c) => (
                      <tr key={c.telefone}>
                        <td><b>{c.nome}</b><div className="muted" style={{ fontSize: 11.5 }}>{fmtNumber(c.telefone)}</div></td>
                        <td><span className={"resumos-status " + STATUS[c.status].cls}>{STATUS[c.status].rot}</span></td>
                        <td>{c.motivo}</td>
                        {res.conversas!.some((x) => x.resposta) && <td>{c.resposta}</td>}
                        <td style={{ whiteSpace: "nowrap" }}>
                          {/* Abre a conversa no painel com a saudação já escrita: é só clicar em Enviar.
                              Calculada no CLIQUE (não na renderização): o relatório pode ficar aberto
                              da manhã pra tarde. */}
                          <button className="btn" style={{ padding: "4px 10px", fontSize: 12.5, fontWeight: 600, color: "#0A8F3C", borderColor: "rgba(37,211,102,.55)" }}
                            title="Abrir a conversa com a saudação pronta pra enviar"
                            onClick={() => {
                              const q = new URLSearchParams({ abrir: c.telefone, nome: c.nome, texto: saudacaoPara(c.nome) });
                              router.push((ehApi ? "/oficial/inbox" : "/ao-vivo") + "?" + q.toString());
                            }}>
                            Chamar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
