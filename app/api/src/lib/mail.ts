// Envio de email transacional (dados de acesso do cliente). Usa a Resend via HTTP — SEM dependência
// nova (só fetch). Configure no deploy/.env: RESEND_API_KEY e MAIL_FROM (ex.: "ZapConverte
// <acesso@seudominio.com.br>", com o domínio verificado na Resend). Sem chave → não envia (loga),
// e o fluxo NÃO quebra — o WhatsApp ainda entrega as credenciais.
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "ZapConverte <acesso@seudominio.com.br>";
  if (!key) {
    console.warn("⚠️  RESEND_API_KEY não configurado — email de acesso NÃO enviado (configure no deploy/.env).");
    return false;
  }
  if (!to || !to.includes("@")) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("resend:", res.status, t.slice(0, 200));
      return false;
    }
    return true;
  } catch (e: any) {
    console.error("resend:", e?.message);
    return false;
  }
}

// Escapa texto pra interpolar no HTML do email com segurança (senha, nome…).
export function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
