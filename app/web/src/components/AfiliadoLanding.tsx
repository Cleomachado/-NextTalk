"use client";

// Landing PÚBLICA de afiliados (sem login). É o link que o dono divulga.
// Dois passos, nessa ordem: (1) afiliar na Kiwify — é lá que a comissão é paga —
// e (2) entrar no grupo, onde ele manda material e novidade.
// Espelha a ideia da página do Sua Empresa, com o vocabulário do ZapConverte.
import { useState } from "react";

const LINK_KIWIFY = "https://dashboard.kiwify.com/join/affiliate/51lFnv0D";
const LINK_GRUPO = "https://chat.whatsapp.com/SEU-GRUPO";

// Planos públicos (mesma tabela de Auth.tsx) — a comissão mostrada é 50% recorrente.
const PLANOS = [
  { nome: "Start", preco: 97 },
  { nome: "Profissional", preco: 147 },
  { nome: "Escala", preco: 297 },
];
const COMISSAO = 0.5;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function AfiliadoLanding() {
  // Simulador: quantos clientes o afiliado imagina indicar (a conta é dele, não promessa nossa).
  const [qtd, setQtd] = useState(10);
  const [plano, setPlano] = useState(1);
  const mensal = qtd * PLANOS[plano].preco * COMISSAO;

  return (
    <main className="afl">
      <div className="afl-wrap">
        <header className="afl-head">
          <div className="afl-logo" aria-hidden>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
          <span className="afl-marca">Zap<b>Converte</b></span>
        </header>

        <section className="afl-hero">
          <span className="afl-selo">Programa de afiliados</span>
          <h1>Indique uma vez.<br />Receba todo mês.</h1>
          <p className="afl-sub">
            O ZapConverte é assinatura — então sua comissão é <b>recorrente</b>. Você recebe{" "}
            <b>50% todo mês</b>, enquanto o cliente que você trouxe continuar pagando.
          </p>
          <div className="afl-ctas">
            <a className="afl-btn primario" href={LINK_KIWIFY} target="_blank" rel="noopener noreferrer">
              Quero ser afiliado
            </a>
            <a className="afl-btn" href={LINK_GRUPO} target="_blank" rel="noopener noreferrer">
              Entrar no grupo
            </a>
          </div>
        </section>

        {/* Simulador — a conta que o afiliado faz sozinho, com os preços públicos reais. */}
        <section className="afl-card">
          <h2>Quanto isso vira por mês</h2>
          <div className="afl-sim">
            <label>
              <span>Clientes ativos que você trouxe</span>
              <input type="range" min={1} max={50} value={qtd} onChange={(e) => setQtd(Number(e.target.value))} />
              <b>{qtd}</b>
            </label>
            <div className="afl-planos">
              {PLANOS.map((p, i) => (
                <button key={p.nome} className={"afl-plano" + (plano === i ? " on" : "")} onClick={() => setPlano(i)}>
                  {p.nome}<em>{brl(p.preco)}/mês</em>
                </button>
              ))}
            </div>
          </div>
          <div className="afl-resultado">
            <span>Sua comissão recorrente</span>
            <b>{brl(mensal)}<i>/mês</i></b>
            <small>
              50% de {brl(PLANOS[plano].preco)} × {qtd} cliente{qtd > 1 ? "s" : ""} — enquanto eles pagarem.
              Simulação com os preços públicos; não é promessa de ganho.
            </small>
          </div>
        </section>

        <section className="afl-passos">
          <h2>Como começar (2 passos)</h2>
          <ol>
            <li>
              <b>Afilie-se na Kiwify</b>
              <p>É onde a comissão é registrada e paga. Você recebe seu link de divulgação na hora.</p>
              <a className="afl-btn primario peq" href={LINK_KIWIFY} target="_blank" rel="noopener noreferrer">Abrir cadastro na Kiwify</a>
            </li>
            <li>
              <b>Entre no grupo dos afiliados</b>
              <p>É lá que eu mando material pronto, criativos, novidades da plataforma e tiro dúvida de venda.</p>
              <a className="afl-btn peq" href={LINK_GRUPO} target="_blank" rel="noopener noreferrer">Entrar no grupo do WhatsApp</a>
            </li>
          </ol>
        </section>

        <section className="afl-card">
          <h2>O que você vende</h2>
          <p className="afl-texto">
            O ZapConverte é a plataforma que automatiza o WhatsApp de quem vende: atendimento com
            inteligência artificial, recuperação de PIX e carrinho abandonado, disparos, automação de
            grupos, CRM e chat ao vivo — tudo num painel só, conectando por QR Code ou pela API
            Oficial da Meta.
          </p>
          <ul className="afl-lista">
            <li>Conecta em 1 minuto pelo QR — o cliente vê funcionando na hora</li>
            <li>Faz o que ferramenta gringa não faz: <b>automação de grupo</b> em português</li>
            <li>Preço em real, suporte em português, sem mensalidade em dólar</li>
            <li>É assinatura: quem entra tende a ficar — e sua comissão continua</li>
          </ul>
        </section>

        <section className="afl-faq">
          <h2>Perguntas de quem vai divulgar</h2>
          <details>
            <summary>Como e quando eu recebo?</summary>
            <p>Pela Kiwify, seguindo as regras e os prazos de pagamento dela. A comissão é registrada automaticamente quando a venda entra pelo seu link.</p>
          </details>
          <details>
            <summary>A comissão é só na primeira mensalidade?</summary>
            <p>Não. É <b>recorrente</b>: você recebe todo mês enquanto aquele cliente mantiver a assinatura ativa.</p>
          </details>
          <details>
            <summary>Preciso entender de tecnologia pra vender?</summary>
            <p>Não. Você indica; a plataforma faz a demonstração sozinha. No grupo você pega os materiais prontos e tira dúvidas.</p>
          </details>
          <details>
            <summary>Posso testar antes de indicar?</summary>
            <p>Pode — e é o que eu recomendo: quem usa vende melhor. Fale comigo no grupo que eu te oriento sobre o teste.</p>
          </details>
        </section>

        <section className="afl-fim">
          <h2>Bora?</h2>
          <p>Leva 2 minutos pra se afiliar e entrar no grupo.</p>
          <div className="afl-ctas">
            <a className="afl-btn primario" href={LINK_KIWIFY} target="_blank" rel="noopener noreferrer">Quero ser afiliado</a>
            <a className="afl-btn" href={LINK_GRUPO} target="_blank" rel="noopener noreferrer">Entrar no grupo</a>
          </div>
        </section>

        <footer className="afl-rodape">
          ZapConverte · automação de WhatsApp<br />
          Os valores simulados nesta página usam os preços públicos dos planos e não representam
          promessa de ganho. Resultados dependem da sua divulgação.
        </footer>
      </div>
    </main>
  );
}
