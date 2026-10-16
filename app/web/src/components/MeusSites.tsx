"use client";

// "Meus sites": a página de vendas de afiliado do PRÓPRIO usuário logado, cruzada pelo e-mail
// (mesma chave do gerador público e da conta de trial). Mostra o endereço, os links de divulgação
// com rastreio e recupera o link de edição sem passar pelo suporte (a sessão é a prova de posse).
import { useEffect, useState } from "react";
import { jget, jsend } from "@/lib/client";

interface MinhaPagina {
  slug: string;
  url: string;
  nome: string;
  trial3Dias: boolean;
  links: Array<{ rotulo: string; url: string }>;
}

export function MeusSitesView() {
  const [carregou, setCarregou] = useState(false);
  const [pagina, setPagina] = useState<MinhaPagina | null>(null);
  const [gerador, setGerador] = useState("https://seudominio.com.br/afiliados");
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [gerandoEdit, setGerandoEdit] = useState(false);

  useEffect(() => {
    jget("/api/app/afiliado/pagina")
      .then((d) => { setPagina(d.pagina ?? null); if (d.gerador) setGerador(d.gerador); })
      .catch((e: any) => setErro(e.message))
      .finally(() => setCarregou(true));
  }, []);

  async function copiar(chave: string, texto: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(chave); setTimeout(() => setCopiado(""), 1800); } catch { /* sem permissão */ }
  }

  async function gerarEditLink() {
    setGerandoEdit(true); setErro("");
    try {
      const r = await jsend("/api/app/afiliado/edit-link", "POST", {});
      setEditUrl(r.editUrl);
    } catch (e: any) { setErro(e.message); }
    setGerandoEdit(false);
  }

  if (!carregou) return <div className="card"><div className="card-pad muted">Carregando…</div></div>;

  if (!pagina) {
    return (
      <div className="card">
        <div className="card-head"><h3>Meus sites</h3><span className="page-hint">Sua página de vendas de afiliado</span></div>
        <div className="card-pad">
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
            Você ainda não tem uma página de afiliado. Ela é a sua página de vendas do ZapConverte com
            <b> os seus checkouts</b> — todo lead e venda que entrar por ela conta pra você.
          </p>
          <a className="btn primary" style={{ marginTop: 14 }} href={gerador} target="_blank" rel="noreferrer">
            Criar a minha página
          </a>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Use o MESMO e-mail da sua conta daqui — é assim que a página aparece nesta aba.
          </p>
          {erro && <div style={{ color: "var(--crit)", fontSize: 12.5, marginTop: 10 }}>{erro}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div className="card-head"><h3>Minha página de vendas</h3><span className="page-hint">seudominio.com.br/promo/{pagina.slug}</span></div>
        <div className="card-pad">
          <div className="field">
            <label>Endereço da página</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="inp" readOnly value={pagina.url} style={{ flex: 1, minWidth: 240 }} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn" onClick={() => copiar("url", pagina.url)}>{copiado === "url" ? "copiado ✓" : "copiar"}</button>
              <a className="btn" href={pagina.url} target="_blank" rel="noreferrer">abrir</a>
            </div>
          </div>
          {pagina.trial3Dias && (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
              Sua página está com o <b>teste grátis de 3 dias</b> ligado — o lead entra pelo seu link e o cadastro dele já fica amarrado a você.
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Links de divulgação</h3><span className="page-hint">Cada um marca de onde o lead veio</span></div>
        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pagina.links.map((l) => (
            <div key={l.rotulo} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 190 }}>{l.rotulo}</span>
              <input className="inp" readOnly value={l.url} style={{ flex: 1, minWidth: 220, fontSize: 12 }} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn" onClick={() => copiar(l.rotulo, l.url)}>{copiado === l.rotulo ? "copiado ✓" : "copiar"}</button>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Use o link do canal onde você vai divulgar — a venda chega marcada com a origem e o seu nome.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--line-2)", paddingTop: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 190 }}>Criativos prontos</span>
            <span className="muted" style={{ flex: 1, minWidth: 220, fontSize: 12 }}>Artes e vídeos pra baixar e postar com o seu link junto.</span>
            <a className="btn" href="https://drive.google.com/drive/folders/1ElY2Zu6prQouuwwfg72kKtmyhxSgGqGM?usp=drive_link" target="_blank" rel="noreferrer">abrir pasta (Drive)</a>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Editar a página</h3><span className="page-hint">Trocar links, nome ou endereço</span></div>
        <div className="card-pad">
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            A edição usa um <b>link seguro</b> (só seu — quem tem o link edita a página). Gere um novo aqui
            sempre que precisar; o anterior deixa de valer na hora.
          </p>
          {editUrl ? (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <input className="inp" readOnly value={editUrl} style={{ flex: 1, minWidth: 240, fontSize: 12 }} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn" onClick={() => copiar("edit", editUrl)}>{copiado === "edit" ? "copiado ✓" : "copiar"}</button>
              <a className="btn primary" href={editUrl} target="_blank" rel="noreferrer">abrir e editar</a>
            </div>
          ) : (
            <button type="button" className="btn" style={{ marginTop: 12 }} onClick={gerarEditLink} disabled={gerandoEdit}>
              {gerandoEdit ? "gerando…" : "gerar link de edição"}
            </button>
          )}
          {erro && <div style={{ color: "var(--crit)", fontSize: 12.5, marginTop: 10 }}>{erro}</div>}
        </div>
      </div>
    </div>
  );
}
