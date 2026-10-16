// Normaliza telefone para o formato aceito pela UazAPI: dígitos com DDI, ex. "5511999999999".
// Cada plataforma manda num formato diferente (com/sem DDI, DDD separado, com máscara),
// então centralizamos aqui. Casos de borda de número BR (9º dígito) são validados depois
// via gateway.checkNumbers().
export function toWhatsAppNumber(
  raw: string | null | undefined,
  opts?: { ddi?: string; ddd?: string },
): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");

  // Plataformas que mandam DDD (e às vezes DDI) separados — ex.: Perfect Pay, Ticto.
  if (opts?.ddd) {
    const ddi = (opts.ddi ?? "55").replace(/\D/g, "") || "55";
    const ddd = opts.ddd.replace(/\D/g, "");
    digits = `${ddi}${ddd}${digits}`;
  }

  if (!digits) return null;

  // 10 (DDD+8) ou 11 (DDD+9) dígitos → número BR sem país; prefixa 55.
  if (digits.length === 10 || digits.length === 11) {
    digits = "55" + digits;
  }

  // Descarta claramente inválidos.
  if (digits.length < 11) return null;

  return digits;
}

// A OUTRA forma do 9º dígito BR: 55+DDD+9XXXXXXXX (13 díg.) ↔ 55+DDD+XXXXXXXX (12 díg.).
// O wa_id do WhatsApp DERRUBA o 9 em números antigos (um lead: Kiwify manda 5511988887777,
// a Meta devolve 551188887777) — o mesmo lead vira DUAS chaves e o estado (pending do botão,
// ficha, pix, UTM) some no meio. Este helper devolve a forma irmã pra as leituras olharem as
// duas. Devolve null quando não há variante (não-BR, fixo, tamanho estranho).
export function variante9BR(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (!d.startsWith("55")) return null;
  // O WhatsApp só derruba o 9 de números PRÉ-migração — os que em 8 dígitos começavam em 6-9.
  // Por isso a variante só existe quando o dígito depois do 9 está nessa faixa, NAS DUAS direções:
  //  · 55 11 9 3224-5742 (pós-migração, "3") NÃO vira 55 11 3224-5742 — isso seria o FIXO de
  //    outra pessoa, e o estado dos dois contatos ia se misturar;
  //  · 55 11 9 8888-7777 (com o "9") ↔ 55 11 8888-7777 ✓.
  if (d.length === 13 && d[4] === "9" && /[6-9]/.test(d[5])) return d.slice(0, 4) + d.slice(5); // tira o 9
  if (d.length === 12 && /[6-9]/.test(d[4])) return d.slice(0, 4) + "9" + d.slice(4);           // põe o 9
  return null;
}
