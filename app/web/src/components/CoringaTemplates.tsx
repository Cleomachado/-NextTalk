"use client";

// Templates CORINGA: corpo inteiro em variáveis, aprovado como Utility — no disparo, as variáveis
// e a mídia do topo carregam o conteúdo real daquele envio. Biblioteca pronta em 6 variações;
// clicar abre o criador JÁ PREENCHIDO (só escolher a mídia de exemplo quando tiver, e submeter).
import { useState } from "react";
import { CreateTemplate, type TemplateInicial } from "@/components/MetaTemplates";
import { CORINGAS, MODELOS_CORINGA, MODELO_PADRAO, CORINGA_RODAPE, type Coringa, type ModeloCoringa } from "@/lib/coringas";
import { Icon } from "@/components/icons";

export function CoringaTemplates() {
  const [criando, setCriando] = useState<TemplateInicial | null>(null);
  const [feito, setFeito] = useState("");
  // Quantas variáveis o coringa vai ter. Muda o CORPO inteiro: quanto mais variável, mais texto
  // fixo o modelo traz — senão a Meta recusa por "muitas variáveis para sua extensão".
  const [modelo, setModelo] = useState<ModeloCoringa>(MODELO_PADRAO);

  function abrir(c: Coringa) {
    setFeito("");
    setCriando({
      name: c.id,
      category: "UTILITY",
      headerTipo: c.headerTipo,
      body: modelo.corpo,
      examples: modelo.exemplos,
      footerText: CORINGA_RODAPE,
      botoes: c.botoes.map((b) => ({ ...b })),
    });
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 900 }}>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
        Coringa = template com <b>espaços livres</b> ({"{{1}}"}, {"{{2}}"}…) que você preenche na hora do
        disparo. Aprova uma vez e reusa sempre; nos de mídia dá pra <b>trocar a imagem/vídeo do topo</b> a
        cada envio — tudo pelo Disparador.
      </div>

      <div className="coringa-filtro">
        <span className="cf-rot">Quantos espaços livres você quer?</span>
        <div className="cf-chips">
          {MODELOS_CORINGA.map((m) => (
            <button key={m.vars} type="button" className={"cf-chip" + (m.vars === modelo.vars ? " on" : "")}
              onClick={() => setModelo(m)} title={m.dica}>{m.rotulo}</button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 6 }}>
          {modelo.dica} <b>Por que isso importa:</b> a Meta recusa template com muita variável e pouco
          texto fixo (&ldquo;muitas variáveis para sua extensão&rdquo;). Cada modelo aqui já vem com texto
          suficiente em volta — <b>não apague o texto fixo</b> na hora de editar.
        </div>
      </div>
      <div className="coringa-aviso">
        <b>Risco real (decisão sua):</b> mandar conteúdo de <b>marketing</b> num template aprovado como
        <b> Utilidade</b> viola as políticas da Meta. A punição escala: template pausado → qualidade do
        número caindo → limite reduzido → <b>banimento da WABA/BM</b>. Use com moderação, em listas que
        esperam sua mensagem, e monitore a página <b>Métricas</b> (qualidade) depois de cada disparo.
      </div>

      {feito && <div className="card"><div className="card-pad" style={{ color: "var(--accent-deep)", fontSize: 13.5 }}>{feito}</div></div>}

      <div className="coringa-grid">
        {CORINGAS.map((c) => (
          <div key={c.id} className="card tpl-card">
            <div className="tpl-head">
              <div style={{ minWidth: 0 }}>
                <div className="tpl-name">{c.rotulo}</div>
                <div className="tpl-meta">Utility · {modelo.vars} espaços livres · {c.headerTipo === "none" ? "sem mídia" : c.headerTipo === "image" ? "imagem trocável" : "vídeo trocável"}{c.botoes.length ? " · 2 botões" : ""}</div>
              </div>
            </div>
            <div className="tpl-body" style={{ fontSize: 12.5 }}>{modelo.corpo}</div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>{c.descricao}</div>
            <div className="tpl-actions">
              <button className="btn primary ic" onClick={() => abrir(c)}>
                <Icon name="plus" size={14} /> Aprovar este coringa
              </button>
            </div>
          </div>
        ))}
      </div>

      {criando && (
        <CreateTemplate
          inicial={criando}
          onClose={() => setCriando(null)}
          onDone={() => { setCriando(null); setFeito("Coringa enviado pra aprovação da Meta — acompanhe o status em Templates Meta (minutos a horas)."); }}
        />
      )}
    </div>
  );
}
