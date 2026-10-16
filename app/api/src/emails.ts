// Templates de e-mail transacional do ZapConverte (Fase A: ciclo do teste grátis + dunning).
// HTML seguro pra cliente de e-mail: tabelas + estilos inline (nada de CSS externo/flex/grid, que
// Gmail/Outlook ignoram). Marca em TEXTO (não há arquivo de logo; gradiente CSS não renderiza no
// Outlook). Enviados pelo motor via Resend (lib/mail.ts) — NÃO são configurados em painel nenhum.
import { esc } from "./lib/mail.js";
import { OFERTAS, fmtReais } from "./afiliados-promo.js";

const SITE = (process.env.SITE_PUBLIC_URL || "https://seudominio.com.br").replace(/\/+$/, "");
const PLANOS_URL = SITE + "/#planos";
const PAINEL_URL = (process.env.PAINEL_PUBLIC_URL || "https://painel.seudominio.com.br").replace(/\/+$/, "");
// Contato/suporte do dono (mesmo número usado no site e nos fluxos).
const SUPORTE_WA = "https://wa.me/5511999999999";
// Grupo de afiliados no WhatsApp (mesmo link do afiliados.html).
const GRUPO_AFILIADOS = "https://chat.whatsapp.com/SEU-GRUPO";
// Cadastro de afiliado na Kiwify — é ELA quem paga a comissão (mesma URL do server.ts/site).
const KIWIFY_AFILIADO = process.env.KIWIFY_AFILIADO_URL || "https://dashboard.kiwify.com/join/affiliate/51lFnv0D";

export interface EmailTemplate { subject: string; html: string }

// Layout base: cabeçalho com a marca, título, corpo, botão CTA verde, bloco de ajuda no WhatsApp
// e rodapé. `ctaUrl` vazio = sem botão. `ps` = linha fina abaixo do botão (opcional).
function layout(opts: { heading: string; bodyHtml: string; ctaText?: string; ctaUrl?: string; ps?: string; preheader?: string }): string {
  const { heading, bodyHtml, ctaText, ctaUrl, ps, preheader } = opts;
  const botao = ctaText && ctaUrl
    ? `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:26px 0"><tr><td style="border-radius:999px;background:#12A150">
         <a href="${esc(ctaUrl)}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${esc(ctaText)}</a>
       </td></tr></table>`
    : "";
  const psHtml = ps ? `<p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#71717a">${ps}</p>` : "";
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f9">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>` : ""}
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f5f9;padding:32px 0;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:#ffffff;border-radius:16px;padding:36px 32px">
      <tr><td>
        <p style="margin:0;font-size:20px;font-weight:800;color:#0e1a15">Zap<span style="color:#12A150">Converte</span></p>
        <h1 style="margin:22px 0 12px;font-size:22px;line-height:1.3;color:#18181b">${esc(heading)}</h1>
        <div style="font-size:15px;line-height:1.6;color:#3f3f46">${bodyHtml}</div>
        ${botao}
        ${psHtml}
        <hr style="border:none;border-top:1px solid #e4e4e7;margin:26px 0 20px">
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#3f3f46">Precisa de ajuda?</p>
        <table cellpadding="0" cellspacing="0" role="presentation"><tr><td style="border-radius:999px;background:#25d366">
          <a href="${SUPORTE_WA}?text=${encodeURIComponent("Olá! Vim de um e-mail do ZapConverte e preciso de ajuda.")}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:700;color:#04331b;text-decoration:none;border-radius:999px">Falar no WhatsApp</a>
        </td></tr></table>
        <p style="margin:18px 0 0;font-size:12px;color:#a1a1aa">ZapConverte · automação de vendas no WhatsApp · <a href="${SITE}" style="color:#a1a1aa">seudominio.com.br</a></p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

const oi = (nome: string) => (nome ? "Olá " + esc(nome) + "! " : "Olá! ");

// Teste acaba AMANHÃ → CTA pra assinar (com o gancho do anual).
// ctaUrl: se o lead veio de um afiliado, aponta pra página DELE (checkouts com o ?afid= dele, pra
// a comissão da conversão ir pro afiliado certo); senão, a página de planos geral.
export function tplTrialExpiringTomorrow(nome: string, ctaUrl: string = PLANOS_URL): EmailTemplate {
  return {
    subject: "⏳ Seu teste do ZapConverte acaba amanhã",
    html: layout({
      preheader: "Falta 1 dia do seu teste grátis — garanta seu plano pra não perder seus fluxos.",
      heading: "Seu teste acaba amanhã",
      bodyHtml:
        `<p style="margin:0 0 14px">${oi(nome)}seu teste grátis do ZapConverte termina <b>amanhã</b>.</p>` +
        `<p style="margin:0">Pra não perder seus fluxos, contatos e automações — e continuar respondendo no automático — garanta seu plano agora. Leva 2 minutos.</p>`,
      ctaText: "Escolher meu plano",
      ctaUrl,
      ps: "💡 No plano <b>anual</b> você paga o preço do plano de baixo e ainda leva o setup de BM + API Oficial de graça.",
    }),
  };
}

// Teste EXPIROU → reativar (dados seguem salvos). ctaUrl idem: página do afiliado se veio de um.
export function tplTrialExpired(nome: string, ctaUrl: string = PLANOS_URL): EmailTemplate {
  return {
    subject: "Seu teste do ZapConverte acabou — reative em 1 clique",
    html: layout({
      preheader: "Seus fluxos e contatos continuam salvos. Assine e volte a vender no automático hoje.",
      heading: "Seu teste acabou 😕",
      bodyHtml:
        `<p style="margin:0 0 14px">${oi(nome)}seu teste grátis do ZapConverte terminou.</p>` +
        `<p style="margin:0">Boa notícia: <b>seus fluxos e contatos continuam salvos</b>. É só assinar que você volta a vender no automático hoje mesmo — de onde parou.</p>`,
      ctaText: "Assinar e reativar",
      ctaUrl,
      ps: "Qualquer dúvida na escolha do plano, me chama no WhatsApp aqui embaixo. 👇",
    }),
  };
}

// ── Fase B: boas-vindas ───────────────────────────────────────────────────────
// Afiliado que ACABOU de gerar a página: link da página, links de divulgação, tabela de comissão
// (50% em tudo), grupo de afiliados e o link de edição. Substitui o e-mail simples de edição.
export function tplAfiliadoWelcome(d: { nome: string; pageUrl: string; editUrl: string; links: Array<{ rotulo: string; url: string }> }): EmailTemplate {
  const linksHtml = d.links.map((l) =>
    `<tr><td style="padding:7px 0;font-size:13px;color:#3f3f46;border-bottom:1px solid #f0f0f2"><b>${esc(l.rotulo)}</b><br><a href="${esc(l.url)}" style="color:#12A150;word-break:break-all">${esc(l.url)}</a></td></tr>`,
  ).join("");
  const comissaoHtml = OFERTAS.map((o) =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px">${esc(o.rotulo)} · ${o.numeros} número${o.numeros > 1 ? "s" : ""}</td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:right;color:#6a7a72">${fmtReais(o.precoCents)}</td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-weight:700;color:#12A150">${fmtReais(o.ganhoCents)}</td></tr>`,
  ).join("");
  return {
    subject: "🎉 Bem-vindo(a) ao time de afiliados do ZapConverte",
    html: layout({
      preheader: "Sua página está no ar. Aqui estão seus links de divulgação e sua comissão.",
      heading: "Você é afiliado ZapConverte! 🎉",
      bodyHtml:
        `<p style="margin:0 0 12px">${oi(d.nome)}sua página de vendas de afiliado está no ar:</p>` +
        `<p style="margin:0 0 18px"><a href="${esc(d.pageUrl)}" style="color:#12A150;font-weight:700;word-break:break-all">${esc(d.pageUrl)}</a></p>` +
        `<p style="margin:0 0 6px;font-weight:700">📣 Seus links de divulgação (use o certo pra cada lugar):</p>` +
        `<table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin-bottom:18px">${linksHtml}</table>` +
        `<p style="margin:0 0 18px">🎨 <b>Criativos prontos</b> (artes e vídeos pra divulgar): <a href="https://drive.google.com/drive/folders/1ElY2Zu6prQouuwwfg72kKtmyhxSgGqGM?usp=drive_link" style="color:#12A150">abrir a pasta no Drive</a>.</p>` +
        `<p style="margin:0 0 6px;font-weight:700">💰 Sua comissão — <b>50% em todos os planos</b>:</p>` +
        `<table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:6px">` +
          `<tr><td style="padding:6px 8px;font-size:11px;color:#a1a1aa;text-transform:uppercase">Plano</td>` +
          `<td style="padding:6px 8px;font-size:11px;color:#a1a1aa;text-transform:uppercase;text-align:right">Preço</td>` +
          `<td style="padding:6px 8px;font-size:11px;color:#a1a1aa;text-transform:uppercase;text-align:right">Você ganha</td></tr>` +
          comissaoHtml +
        `</table>`,
      ctaText: "Entrar no grupo de afiliados",
      ctaUrl: GRUPO_AFILIADOS,
      ps: `🔑 <b>Guarde seu link de edição</b> (só você tem): <a href="${esc(d.editUrl)}" style="color:#12A150">editar minha página</a>. Sem ele, ninguém altera seus checkouts. ` +
        `Sua página também fica na aba <b>Meus sites</b> do seu painel: <a href="https://painel.seudominio.com.br/meus-sites" style="color:#12A150">painel.seudominio.com.br/meus-sites</a> (entre com este mesmo e-mail) — lá você recupera o link de edição quando precisar.`,
    }),
  };
}

// Lead que acabou de entrar no teste grátis (3 dias): onboarding — conectar o WhatsApp e começar.
export function tplTrialLeadWelcome(nome: string): EmailTemplate {
  return {
    subject: "🎁 Seu teste grátis do ZapConverte começou!",
    html: layout({
      preheader: "3 dias com tudo liberado. Conecte seu WhatsApp e comece a vender no automático.",
      heading: "Seu teste de 3 dias começou! 🎁",
      bodyHtml:
        `<p style="margin:0 0 14px">${oi(nome)}sua conta do ZapConverte está ativa por 3 dias, com <b>tudo liberado</b>.</p>` +
        `<p style="margin:0 0 8px;font-weight:700">Pra começar a vender no automático:</p>` +
        `<ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.8;color:#3f3f46">` +
          `<li><b>Conecte seu WhatsApp</b> no painel (1 minuto, é só escanear o QR).</li>` +
          `<li>Escolha um fluxo pronto ou monte o seu.</li>` +
          `<li>Deixe o ZapConverte responder e vender por você.</li>` +
        `</ol>`,
      ctaText: "Entrar no meu painel",
      ctaUrl: PAINEL_URL,
      ps: "Qualquer dúvida nos primeiros passos, me chama no WhatsApp aqui embaixo. 👇",
    }),
  };
}

// Afiliado ATIVOU o trial de 30 dias (botão na tela de sucesso do gerador → /public/afiliados/lead).
// Copy específica: parabéns por se afiliar + 30 dias de acesso COMPLETO pra dominar a ferramenta e
// vender mais. Diferente do tplTrialLeadWelcome (lead de 3 dias) e do tplAfiliadoWelcome (só página).
export function tplAfiliadoTrial30(d: { nome: string; acessoLink: string }): EmailTemplate {
  return {
    subject: "🎁 Seus 30 dias grátis de ZapConverte estão liberados!",
    html: layout({
      preheader: "Acesso completo por 30 dias — domine a ferramenta e venda muito mais como afiliado.",
      heading: "Bem-vindo(a) ao time! Seus 30 dias grátis estão liberados 🎁",
      bodyHtml:
        `<p style="margin:0 0 14px">${oi(d.nome)}que bom ter você como afiliado(a) do ZapConverte! 🎉</p>` +
        `<p style="margin:0 0 14px">Além dos <b>50% de comissão recorrente</b>, liberamos <b>30 dias de acesso completo</b> à plataforma — <b>todas as funcionalidades</b>, sem restrição nenhuma.</p>` +
        `<p style="margin:0 0 8px;font-weight:700">Por que aproveitar de verdade:</p>` +
        `<p style="margin:0 0 14px">Afiliado que <b>conhece a ferramenta por dentro</b> vende muito mais. Explore os fluxos, dispare mensagens, veja a automação rodando — aí você mostra na prática pros seus indicados o que o ZapConverte faz por eles.</p>` +
        // Sem o cadastro na Kiwify o afiliado NÃO recebe (é ela quem paga) — a jornada não cobrava
        // esse passo em lugar nenhum (auditoria 10/08). Vai destacado, antes do resto.
        `<table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 18px;background:#fff8e1;border:1px solid #f0c24a;border-radius:12px">` +
          `<tr><td style="padding:14px 16px;font-size:14px;line-height:1.6;color:#3f3f46">` +
            `<b>⚠️ Falta 1 passo pra você receber</b><br>As comissões são pagas pela <b>Kiwify</b>. Se você ainda não fez, ` +
            `<a href="${KIWIFY_AFILIADO}" style="color:#12A150;font-weight:700">cadastre-se como afiliado na Kiwify</a> (2 min) — é isso que garante que toda venda sua caia na sua conta.` +
          `</td></tr>` +
        `</table>` +
        `<p style="margin:0 0 8px;font-weight:700">Comece em 3 passos:</p>` +
        `<ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.8;color:#3f3f46">` +
          `<li><b>Defina sua senha</b> e entre no painel (botão abaixo).</li>` +
          `<li><b>Conecte um WhatsApp</b> — 1 minuto, é só escanear o QR.</li>` +
          `<li>Use um fluxo pronto ou monte o seu e veja vendendo no automático.</li>` +
        `</ol>` +
        `<p style="margin:16px 0 0">👥 E entra no nosso <a href="${GRUPO_AFILIADOS}" style="color:#12A150;font-weight:700">grupo de afiliados</a> pra pegar material de divulgação e acompanhar o ranking com premiações.</p>`,
      ctaText: "Definir senha e ativar meus 30 dias",
      ctaUrl: d.acessoLink,
      ps: "Seus 30 dias começam agora — é o tempo de dominar a ferramenta e virar um afiliado que vende de verdade. 🚀",
    }),
  };
}

// Cliente que ASSINOU (conta já existia, virou pagante): confirmação + próximos passos.
export function tplClienteWelcome(nome: string, plano: string | null): EmailTemplate {
  const planoTxt = plano ? `<b>${esc(plano.toUpperCase())}</b>` : "";
  return {
    subject: "🚀 Sua assinatura do ZapConverte está ativa!",
    html: layout({
      preheader: "Assinatura confirmada. Tudo que você montou continua salvo — bora vender.",
      heading: "Assinatura ativa — bora vender! 🚀",
      bodyHtml:
        `<p style="margin:0 0 14px">${oi(nome)}sua assinatura${planoTxt ? " " + planoTxt : ""} do ZapConverte está <b>ativa</b>. Obrigado pela confiança! 🙌</p>` +
        `<p style="margin:0">Tudo que você montou continua salvo. É só entrar e seguir vendendo no automático — agora sem limite de tempo.</p>`,
      ctaText: "Acessar meu painel",
      ctaUrl: PAINEL_URL,
      ps: "No plano anual, a gente faz o setup de BM + API Oficial pra você. Precisando, é só chamar. 👇",
    }),
  };
}

// Confirmação de e-mail (double opt-in): ativa a conta. Link vale 24h.
export function tplConfirmarEmail(nome: string, confirmUrl: string): EmailTemplate {
  return {
    subject: "Confirme seu e-mail — ZapConverte",
    html: layout({
      preheader: "Falta um passo pra ativar sua conta: confirme seu e-mail.",
      heading: "Confirme seu e-mail",
      bodyHtml:
        `<p style="margin:0 0 14px">${oi(nome)}falta um passo pra ativar sua conta no ZapConverte.</p>` +
        `<p style="margin:0">Clique no botão abaixo e você já entra. O link vale por <b>24 horas</b>.</p>`,
      ctaText: "Confirmar meu e-mail",
      ctaUrl: confirmUrl,
      ps: "Se você não criou uma conta no ZapConverte, pode ignorar este e-mail.",
    }),
  };
}

// Reset de senha ("Esqueci minha senha"): link com token, vale 1h.
export function tplResetSenha(nome: string, resetUrl: string): EmailTemplate {
  return {
    subject: "🔑 Redefinir sua senha do ZapConverte",
    html: layout({
      preheader: "Link pra criar uma nova senha — vale por 1 hora.",
      heading: "Redefinir sua senha",
      bodyHtml:
        `<p style="margin:0 0 14px">${oi(nome)}recebemos um pedido pra redefinir a senha da sua conta no ZapConverte.</p>` +
        `<p style="margin:0">Clique no botão abaixo pra criar uma nova senha. O link vale por <b>1 hora</b>.</p>`,
      ctaText: "Criar nova senha",
      ctaUrl: resetUrl,
      ps: "Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.",
    }),
  };
}

// ── Fase D: cancelamento (win-back) ───────────────────────────────────────────
// Cliente desligou a renovação. A Kiwify manda o "cancelado" seco; ESTE aqui é retenção: mostra
// até quando o acesso continua e convida a voltar. paidUntil ISO (ou null se já sem acesso).
export function tplCancelamento(nome: string, paidUntil: string | null): EmailTemplate {
  let ateTxt = "";
  if (paidUntil) {
    const d = new Date(paidUntil);
    if (!isNaN(d.getTime()) && d.getTime() > Date.now()) {
      ateTxt = ` Seu acesso continua ativo até <b>${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</b> — dá pra usar tudo até lá.`;
    }
  }
  return {
    subject: "Você cancelou sua assinatura — mas a porta continua aberta 💚",
    html: layout({
      preheader: "Sua renovação foi desligada. Veja até quando seu acesso continua e como voltar.",
      heading: "Que pena te ver ir… 😢",
      bodyHtml:
        `<p style="margin:0 0 14px">${oi(nome)}sua renovação do ZapConverte foi <b>desligada</b>.${ateTxt}</p>` +
        `<p style="margin:0 0 14px">Seus fluxos e contatos ficam <b>guardados</b> — se você voltar, é de onde parou, sem perder nada.</p>` +
        `<p style="margin:0">Se teve algo que não funcionou pra você, me conta no WhatsApp aqui embaixo — sua opinião ajuda demais, e talvez eu resolva na hora.</p>`,
      ctaText: "Reativar minha assinatura",
      ctaUrl: PLANOS_URL,
      ps: "Sem pressa — quando quiser voltar, é só assinar de novo. 💚",
    }),
  };
}

// ── Fase C: afiliado ────────────────────────────────────────────────────────
// Nova venda pela indicação do afiliado → "você vendeu!" com comissão e os dados do cliente.
const brl = (v: number) => "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function tplAfiliadoVenda(d: { nome: string; comissao: number; plano: string | null; buyerName: string | null; buyerEmail: string | null }): EmailTemplate {
  const cliente = d.buyerName || d.buyerEmail || "novo cliente";
  const linhaCli =
    `<table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:8px 0 4px">` +
    `<tr><td style="padding:5px 0;font-size:13px;color:#6a7a72;width:90px">Cliente</td><td style="padding:5px 0;font-size:13px;color:#18181b"><b>${esc(cliente)}</b></td></tr>` +
    (d.buyerEmail ? `<tr><td style="padding:5px 0;font-size:13px;color:#6a7a72">E-mail</td><td style="padding:5px 0;font-size:13px;color:#18181b">${esc(d.buyerEmail)}</td></tr>` : "") +
    (d.plano ? `<tr><td style="padding:5px 0;font-size:13px;color:#6a7a72">Plano</td><td style="padding:5px 0;font-size:13px;color:#18181b">${esc(d.plano.toUpperCase())}</td></tr>` : "") +
    `</table>`;
  return {
    subject: `💸 Você vendeu! Comissão de ${brl(d.comissao)} no ZapConverte`,
    html: layout({
      preheader: `Nova venda pela sua indicação — comissão de ${brl(d.comissao)}.`,
      heading: "Você fez uma venda! 🎉",
      bodyHtml:
        `<p style="margin:0 0 14px">${oi(d.nome)}alguém acabou de assinar o ZapConverte <b>pela sua indicação</b>. 🚀</p>` +
        `<div style="background:#f0fbf4;border:1px solid #c9efd8;border-radius:12px;padding:16px;margin:0 0 14px">` +
          `<div style="font-size:13px;color:#6a7a72">Sua comissão</div>` +
          `<div style="font-size:28px;font-weight:800;color:#12A150;line-height:1.2">${brl(d.comissao)}</div>` +
        `</div>` +
        `<p style="margin:0 0 4px;font-weight:700">Dados do cliente:</p>` +
        linhaCli,
      ctaText: "Acompanhar minhas comissões",
      ctaUrl: "https://dashboard.kiwify.com",
      ps: "A Kiwify paga sua comissão conforme as regras do programa. Bora vender mais! 👇",
    }),
  };
}

// Pagamento da renovação FALHOU (dunning) → regularizar pra não perder acesso.
export function tplPaymentFailed(nome: string): EmailTemplate {
  return {
    subject: "⚠️ Não conseguimos renovar sua assinatura do ZapConverte",
    html: layout({
      preheader: "A cobrança da sua assinatura não passou. Regularize pra não perder o acesso.",
      heading: "Falha no pagamento da renovação",
      bodyHtml:
        `<p style="margin:0 0 14px">${oi(nome)}tentamos renovar sua assinatura do ZapConverte, mas a <b>cobrança não passou</b> (cartão expirado, sem limite ou recusado).</p>` +
        `<p style="margin:0">Pra não perder o acesso e suas automações, regularize seu pagamento. Se precisar de ajuda, é só me chamar no WhatsApp — resolvo com você na hora.</p>`,
      ctaText: "Regularizar meu pagamento",
      ctaUrl: PLANOS_URL,
      ps: `Já regularizou? Pode ignorar este e-mail. Prefere acessar sua conta? <a href="${PAINEL_URL}/entrar" style="color:#12A150">Entrar no painel</a>.`,
    }),
  };
}

// ═══ RECUPERAÇÃO DE PIX E CARRINHO (só o produto ZapConverte) ═════════════════════════════════
// Pedido do dono (03/10): o Pix gerado na Kiwify chegava no webhook e nada ia por e-mail — nem o
// código, nem o lembrete. Estes são os e-mails da régua (`recuperacao.ts` agenda e decide).
// `qrUrl` aponta pro PNG servido pelo motor (/pix/qr/<id>.png): imagem em data: URI o Gmail bloqueia.
export interface DadosPix { nome: string; valor: string | null; pix: string; qrUrl: string; expira: string | null; checkout: string | null }

function blocoPix(d: DadosPix): string {
  return (
    `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:18px 0 6px;width:100%"><tr><td align="center" style="background:#f6f5f9;border-radius:14px;padding:20px">` +
    `<img src="${esc(d.qrUrl)}" width="220" height="220" alt="QR Code do Pix" style="display:block;width:220px;height:220px;border:0;margin:0 auto">` +
    `<p style="margin:12px 0 0;font-size:13px;color:#71717a">Abra o app do seu banco, escolha <b>Pix &gt; Ler QR Code</b> e aponte a câmera.</p>` +
    `</td></tr></table>` +
    `<p style="margin:18px 0 6px;font-size:14px;font-weight:600;color:#3f3f46">Ou use o Pix Copia e Cola:</p>` +
    `<div style="font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.5;color:#18181b;background:#f6f5f9;border:1px dashed #d4d4d8;border-radius:10px;padding:12px;word-break:break-all">${esc(d.pix)}</div>` +
    `<p style="margin:8px 0 0;font-size:13px;color:#71717a">Copie o código inteiro e cole no app do banco, em <b>Pix Copia e Cola</b>.</p>`
  );
}

const linhaValor = (d: DadosPix) =>
  (d.valor ? ` no valor de <b>${esc(d.valor)}</b>` : "") + (d.expira ? `, válido até <b>${esc(d.expira)}</b>` : "");

// 1) Na hora em que o Pix é gerado: QR + copia e cola.
export function tplPixGerado(d: DadosPix): EmailTemplate {
  return {
    subject: "Seu Pix do ZapConverte está pronto",
    html: layout({
      preheader: "Pague com o QR Code ou o Pix Copia e Cola e libere seu acesso na hora.",
      heading: "Falta só o pagamento",
      bodyHtml: `<p style="margin:0">${oi(d.nome)}Seu Pix da assinatura do <b>ZapConverte</b> foi gerado${linhaValor(d)}.</p>` +
        `<p style="margin:12px 0 0">Assim que o pagamento cair, você recebe o acesso por e-mail e por WhatsApp.</p>` + blocoPix(d),
      ctaText: d.checkout ? "Prefiro pagar com cartão" : undefined,
      ctaUrl: d.checkout ?? undefined,
    }),
  };
}

// 2) Algumas horas depois, se não pagou.
export function tplPixLembrete(d: DadosPix): EmailTemplate {
  return {
    subject: "Seu Pix do ZapConverte ainda está aguardando",
    html: layout({
      preheader: "O código continua valendo. Leva menos de um minuto pra pagar.",
      heading: "Seu Pix ainda não caiu",
      bodyHtml: `<p style="margin:0">${oi(d.nome)}Vi que o Pix da sua assinatura do <b>ZapConverte</b> ainda não foi pago. O código continua valendo${d.expira ? ` até <b>${esc(d.expira)}</b>` : ""}.</p>` +
        `<p style="margin:12px 0 0">Se ficou alguma dúvida, é só responder pelo WhatsApp aqui embaixo.</p>` + blocoPix(d),
      ctaText: d.checkout ? "Pagar com cartão" : undefined,
      ctaUrl: d.checkout ?? undefined,
    }),
  };
}

// 3) Último aviso, horas antes de o código vencer.
export function tplPixVence(d: DadosPix): EmailTemplate {
  return {
    subject: "Último aviso: seu Pix do ZapConverte vence hoje",
    html: layout({
      preheader: "Depois do vencimento, o código para de funcionar.",
      heading: "Seu Pix vence em breve",
      bodyHtml: `<p style="margin:0">${oi(d.nome)}O Pix da sua assinatura do <b>ZapConverte</b> vence${d.expira ? ` em <b>${esc(d.expira)}</b>` : " em breve"}. Depois disso o código para de funcionar e será preciso gerar outro.</p>` + blocoPix(d),
      ctaText: d.checkout ? "Gerar novo pagamento" : undefined,
      ctaUrl: d.checkout ?? undefined,
    }),
  };
}

export interface DadosCarrinho { nome: string; checkout: string }

// 4) Carrinho abandonado (preencheu os dados e não gerou pagamento).
export function tplCarrinho(d: DadosCarrinho): EmailTemplate {
  return {
    subject: "Sua assinatura do ZapConverte ficou pela metade",
    html: layout({
      preheader: "Seus dados já estão salvos. Falta só escolher como pagar.",
      heading: "Faltou só um passo",
      bodyHtml: `<p style="margin:0">${oi(d.nome)}Você começou a assinatura do <b>ZapConverte</b> e parou antes do pagamento. Seus dados já estão salvos no checkout.</p>` +
        `<p style="margin:12px 0 0">Com o ZapConverte você dispara e automatiza pela <b>API Oficial do WhatsApp</b>, sem risco de banimento, com CRM e métricas no mesmo painel.</p>`,
      ctaText: "Concluir minha assinatura",
      ctaUrl: d.checkout,
      ps: "Travou em alguma etapa ou ficou com dúvida? Responda pelo WhatsApp abaixo que eu te ajudo.",
    }),
  };
}

// 5) Carrinho, 24h depois.
export function tplCarrinho24h(d: DadosCarrinho): EmailTemplate {
  return {
    subject: "Ainda dá tempo de ativar seu ZapConverte",
    html: layout({
      preheader: "Seu checkout continua aberto.",
      heading: "Seu checkout continua aberto",
      bodyHtml: `<p style="margin:0">${oi(d.nome)}Ontem você chegou pertinho de assinar o <b>ZapConverte</b>. O checkout continua aberto e leva um minuto pra concluir.</p>` +
        `<p style="margin:12px 0 0">O plano mensal não tem fidelidade, e toda compra online tem <b>7 dias de arrependimento</b> garantidos por lei.</p>`,
      ctaText: "Voltar ao checkout",
      ctaUrl: d.checkout,
    }),
  };
}
