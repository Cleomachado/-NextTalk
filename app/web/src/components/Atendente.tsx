"use client";

// Atendente IA — a rede embaixo de tudo. Quem manda mensagem e não cai em nenhum fluxo (palavra-chave,
// 1º contato) era ATENDIDO POR NINGUÉM: o lead que volta dias depois perguntando o preço ficava no
// vácuo. Aqui o dono escreve quem ela é e o que ela sabe; o motor faz o resto (áudio transcrito,
// imagem descrita, pausa quando o dono assume pelo celular) porque reusa o mesmo Agente IA dos fluxos.
import { useEffect, useState } from "react";
import Link from "next/link";
import { jget, jsend } from "@/lib/client";
import { Icon } from "@/components/icons";

interface Caminho { name: string; description: string; reply: string; midia?: string }
interface Cfg {
  ativa: boolean;
  nome: string;
  systemPrompt: string;
  paths: Caminho[];
  maxTurns: number;
  keepAlive: boolean;
  canais: { lite: boolean; oficial: boolean };
  soEtiqueta: string; // responder só quem tem esta etiqueta (vazio = todo mundo)
  horario: { ativo: boolean; dias: number[]; inicio: string; fim: string; foraTexto: string };
}

const DIAS = [
  { n: 0, r: "Dom" }, { n: 1, r: "Seg" }, { n: 2, r: "Ter" }, { n: 3, r: "Qua" },
  { n: 4, r: "Qui" }, { n: 5, r: "Sex" }, { n: 6, r: "Sáb" },
];

const EXEMPLO_PROMPT = `Você é a Ana, atendente da [SEU NEGÓCIO]. Fala como gente: frases curtas, simpática, no máximo 1 emoji por mensagem.

O QUE VENDEMOS
- [produto/serviço], por [preço], [forma de pagamento]
- Prazo de entrega: [prazo]
- Diferencial: [o que te separa do concorrente]

COMO ATENDER
- Cumprimente pelo nome quando souber.
- Responda só o que perguntaram, sem despejar tudo de uma vez.
- Se perguntarem algo que você NÃO sabe, diga que vai confirmar com a equipe — nunca invente preço, prazo ou condição.
- Se a pessoa quiser comprar, mande o link: [SEU LINK]

NUNCA
- Prometer desconto que não existe.
- Falar mal de concorrente.
- Insistir depois que a pessoa disse não.`;

export function Atendente() {
  const [c, setC] = useState<Cfg | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    jget("/api/atendente").then((d) => setC(d.atendente)).catch((e) => setErro(e.message));
  }, []);

  function set<K extends keyof Cfg>(k: K, v: Cfg[K]) { setC((p) => (p ? { ...p, [k]: v } : p)); }

  async function salvar(patch?: Partial<Cfg>) {
    if (!c || salvando) return;
    const corpo = { ...c, ...(patch ?? {}) };
    setSalvando(true); setErro(""); setAviso("");
    try {
      const d = await jsend("/api/atendente", "PUT", corpo);
      setC(d.atendente);
      setAviso("Salvo" + (d.atendente?.ativa ? " — a atendente está no ar." : " — atendente desligada."));
      setTimeout(() => setAviso(""), 5000);
    } catch (e: any) { setErro(e.message); }
    setSalvando(false);
  }

  if (erro && !c) return <div className="card"><div className="card-pad"><b style={{ color: "var(--crit)" }}>{erro}</b></div></div>;
  if (!c) return <div className="card"><div className="card-pad muted">Carregando…</div></div>;

  const semPrompt = !c.systemPrompt.trim();

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Liga/desliga + o que ela é */}
      <div className="card"><div className="card-pad">
        <div className="atd-topo">
          <span className={"atd-ico" + (c.ativa ? " on" : "")}><Icon name="ai_agent" size={20} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 15 }}>{c.ativa ? "Atendente ligada" : "Atendente desligada"}</b>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Ela responde quem manda mensagem e <b>não cai em nenhum fluxo</b> — inclusive quem já falou antes e voltou.
            </div>
          </div>
          <span role="switch" aria-checked={c.ativa} tabIndex={0}
            className={"toggle" + (c.ativa ? "" : " off")}
            onClick={() => { if (!c.ativa && semPrompt) { setErro("Escreva primeiro o que ela precisa saber (o campo abaixo) — sem isso ela não sabe o que responder."); return; } salvar({ ativa: !c.ativa }); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); salvar({ ativa: !c.ativa }); } }} />
        </div>
        {c.ativa && semPrompt && (
          <div className="ia-avisos" style={{ marginTop: 12 }}>
            <b><Icon name="warn" size={13} /> Falta o essencial</b>
            <div className="linha">Sem “o que ela precisa saber” preenchido, a atendente fica parada mesmo ligada.</div>
          </div>
        )}
      </div></div>

      <div className="atd-grid">
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <div className="card"><div className="card-pad" style={{ display: "grid", gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15 }}>Quem ela é e o que ela sabe</h3>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                Escreva como você explicaria pra uma funcionária no primeiro dia: o que você vende, preço, prazo, o que ela pode e o que ela <b>não</b> pode falar.
              </div>
            </div>
            <div>
              <label className="lbl">Nome da atendente</label>
              <input className="inp" style={{ maxWidth: 240 }} maxLength={40} value={c.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ana" />
            </div>
            <div>
              <label className="lbl" style={{ display: "flex", alignItems: "center" }}>
                O que ela precisa saber
                {semPrompt && <button className="disp2-doclink" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => set("systemPrompt", EXEMPLO_PROMPT)}>usar um exemplo pra preencher</button>}
              </label>
              <textarea className="inp" rows={16} style={{ width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.55, fontSize: 13.5 }}
                value={c.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)}
                placeholder="Você é a Ana, atendente da…" />
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                Dá pra usar {"{{primeiro_nome}}"} e {"{{saudacao}}"} aqui dentro. Quanto mais específico, menos ela inventa.
              </div>
            </div>
          </div></div>

          {/* Caminhos */}
          <div className="card"><div className="card-pad" style={{ display: "grid", gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15 }}>Caminhos <span className="muted" style={{ fontWeight: 500, fontSize: 12.5 }}>(opcional)</span></h3>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                Situações que ela deve reconhecer. Quando ela identifica uma, manda a resposta pronta que você escreveu — útil pra link de compra, endereço, tabela de preços e “falar com humano”.
              </div>
            </div>
            {c.paths.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Nenhum caminho — ela vai só conversar pelo texto acima.</div>}
            {c.paths.map((p, i) => (
              <div key={i} className="atd-caminho">
                <div className="atd-caminho-topo">
                  <input className="inp" style={{ flex: "1 1 160px" }} placeholder="nome_do_caminho (ex.: quer_comprar)" value={p.name}
                    onChange={(e) => set("paths", c.paths.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <button className="btn ic" title="Remover caminho" onClick={() => set("paths", c.paths.filter((_, j) => j !== i))}>
                    <Icon name="trash" size={14} style={{ color: "var(--crit)" }} />
                  </button>
                </div>
                <input className="inp" placeholder="Quando usar: ex. quando a pessoa demonstra que quer comprar" value={p.description}
                  onChange={(e) => set("paths", c.paths.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                <textarea className="inp" rows={2} style={{ resize: "vertical", fontFamily: "inherit" }} placeholder="O que ela responde nesse caso (texto pronto)"
                  value={p.reply} onChange={(e) => set("paths", c.paths.map((x, j) => (j === i ? { ...x, reply: e.target.value } : x)))} />
                <input className="inp" placeholder="Mídia junto (opcional): URL de vídeo, imagem ou PDF. O texto acima vira a legenda" value={p.midia ?? ""}
                  onChange={(e) => set("paths", c.paths.map((x, j) => (j === i ? { ...x, midia: e.target.value.trim() || undefined } : x)))} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn ic" disabled={c.paths.length >= 8} onClick={() => set("paths", [...c.paths, { name: "", description: "", reply: "" }])}>
                <Icon name="plus" size={14} /> Adicionar caminho
              </button>
              {!c.paths.some((p) => /humano|atendente/i.test(p.name)) && (
                <button className="btn" onClick={() => set("paths", [...c.paths, {
                  name: "falar_com_humano",
                  description: "quando a pessoa pede pra falar com uma pessoa de verdade, reclama ou fica insatisfeita",
                  reply: "Claro! Já estou chamando alguém da equipe pra te atender por aqui 🙂",
                }])}>+ caminho “falar com humano”</button>
              )}
            </div>
          </div></div>
        </div>

        {/* Lateral: onde ela atende */}
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <div className="card"><div className="card-pad" style={{ display: "grid", gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14.5 }}>Onde ela atende</h3>
            <label className="disp2-chk"><input type="checkbox" checked={c.canais.lite} onChange={(e) => set("canais", { ...c.canais, lite: e.target.checked })} /> WhatsApp Lite</label>
            <label className="disp2-chk"><input type="checkbox" checked={c.canais.oficial} onChange={(e) => set("canais", { ...c.canais, oficial: e.target.checked })} /> API Oficial</label>
            <div className="muted" style={{ fontSize: 11.5 }}>Na API Oficial ela responde dentro da janela da Meta: 24h desde a última mensagem do cliente, ou 7 dias quando o lead veio de anúncio (Click-to-WhatsApp).</div>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Responder só quem tem a etiqueta</label>
            <input className="inp" placeholder="ex.: anuncio-wpp (vazio = todo mundo)" value={c.soEtiqueta ?? ""}
              onChange={(e) => set("soEtiqueta", e.target.value)} />
            <div className="muted" style={{ fontSize: 11.5 }}>Com uma etiqueta aqui, ela só conversa com quem a tem — os leads de anúncio ganham a etiqueta <b>anuncio-wpp</b> sozinhos. As outras conversas ficam em silêncio pra você responder.</div>
          </div></div>

          <div className="card"><div className="card-pad" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 14.5, flex: 1 }}>Horário de atendimento</h3>
              <span role="switch" aria-checked={c.horario.ativo} tabIndex={0} className={"toggle" + (c.horario.ativo ? "" : " off")}
                onClick={() => set("horario", { ...c.horario, ativo: !c.horario.ativo })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); set("horario", { ...c.horario, ativo: !c.horario.ativo }); } }} />
            </div>
            {!c.horario.ativo ? (
              <div className="muted" style={{ fontSize: 12 }}>Atende 24h por dia, todo dia.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {DIAS.map((d) => (
                    <button key={d.n} className={"atd-dia" + (c.horario.dias.includes(d.n) ? " on" : "")}
                      onClick={() => set("horario", { ...c.horario, dias: c.horario.dias.includes(d.n) ? c.horario.dias.filter((x) => x !== d.n) : [...c.horario.dias, d.n] })}>
                      {d.r}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input className="inp" type="time" style={{ width: 120 }} value={c.horario.inicio} onChange={(e) => set("horario", { ...c.horario, inicio: e.target.value })} />
                  <span className="muted" style={{ fontSize: 12 }}>até</span>
                  <input className="inp" type="time" style={{ width: 120 }} value={c.horario.fim} onChange={(e) => set("horario", { ...c.horario, fim: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">Recado fora do horário</label>
                  <textarea className="inp" rows={3} style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                    placeholder="Oi! Nosso atendimento é de segunda a sexta, das 9h às 18h. Deixa sua mensagem que a gente responde assim que abrir 🙂"
                    value={c.horario.foraTexto} onChange={(e) => set("horario", { ...c.horario, foraTexto: e.target.value })} />
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Enviado no máximo 1× a cada 6h por pessoa. Em branco = silêncio total fora do horário.</div>
                </div>
              </>
            )}
          </div></div>

          <div className="card"><div className="card-pad" style={{ display: "grid", gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14.5 }}>Ajustes finos</h3>
            <div>
              <label className="lbl">Máximo de idas e vindas</label>
              <input className="inp" type="number" min={1} max={20} style={{ width: 90 }} value={c.maxTurns}
                onChange={(e) => set("maxTurns", Math.max(1, Math.min(20, Number(e.target.value) || 8)))} />
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>Depois disso ela encerra a conversa.</div>
            </div>
            <label className="disp2-chk"><input type="checkbox" checked={c.keepAlive} onChange={(e) => set("keepAlive", e.target.checked)} /> Continuar atendendo depois de responder</label>
          </div></div>

          <div className="disp2-dica-verde">
            <Icon name="info" size={15} style={{ color: "var(--accent-deep)", flex: "none" }} />
            <span>Quando <b>você</b> responder pelo celular, a atendente cala a boca sozinha nessa conversa. Fluxos com palavra-chave continuam tendo prioridade sobre ela.</span>
          </div>
        </div>
      </div>

      {erro && <div style={{ color: "var(--crit)", fontSize: 13 }}>{erro}</div>}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Link className="btn" href="/fluxos">Ver meus fluxos</Link>
        {aviso && <span className="muted" style={{ fontSize: 12.5 }}>{aviso}</span>}
        <button className="btn primary" style={{ marginLeft: "auto", padding: "10px 24px", fontWeight: 700 }} onClick={() => salvar()} disabled={salvando}>
          {salvando ? "salvando…" : "Salvar atendente"}
        </button>
      </div>
    </div>
  );
}
