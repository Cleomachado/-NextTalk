// TOTP nativo (RFC 6238) — o padrão do Google Authenticator/Authy. Sem lib externa:
// HMAC-SHA1 + base32 são do crypto/nós mesmos. Usado pela Verificação em 2 fatores.
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

// Segredo novo: 20 bytes aleatórios em base32 (32 chars) — o tamanho clássico do TOTP.
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

// URI otpauth:// pro app autenticador (vira QR code no painel).
export function otpauthUri(email: string, secretB32: string): string {
  const label = encodeURIComponent(`ZapConverte:${email}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=ZapConverte&algorithm=SHA1&digits=6&period=30`;
}

// HOTP (RFC 4226): HMAC-SHA1(chave, contador BE64) → truncagem dinâmica → 6 dígitos.
function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const code = (((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}

// Confere o código com janela ±1 (aceita relógio do celular até 30s fora). Comparação em tempo
// constante. Retorna o CONTADOR que casou (pro guard de replay) ou null se inválido.
export function verifyTotp(secretB32: string, code: string, window = 1): number | null {
  const c = String(code ?? "").replace(/\D/g, "");
  if (c.length !== 6) return null;
  const key = base32Decode(secretB32);
  if (key.length < 10) return null;
  const counter = Math.floor(Date.now() / 30_000);
  let matched: number | null = null;
  for (let w = -window; w <= window; w++) {
    const expect = hotp(key, counter + w);
    // compara TODAS as janelas (sem early-return) pra não vazar timing de qual janela casou
    if (expect.length === c.length && timingSafeEqual(Buffer.from(expect), Buffer.from(c))) matched = counter + w;
  }
  return matched;
}
