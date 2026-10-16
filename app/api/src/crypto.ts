// Cripto simétrica pra SEGREDOS de cliente — AES-256-GCM (autenticado). Esta chave protege TUDO
// que é segredo de terceiro no banco: chave da OpenAI e do Asaas por workspace, accessToken e
// appSecret da Meta, refresh token do Google, segredo do nó HTTP e o SEGREDO TOTP do 2FA.
//
// 🔴 FALHA FECHADA (auditoria 07/09). Antes, faltando ZC_ENCRYPTION_KEY o código caía no
// UAZAPI_ADMIN_TOKEN e, faltando os dois, numa constante escrita AQUI NO FONTE
// ("zc-fallback-dev-key"). O motor subia normalmente e passava a cifrar com uma chave pública:
// quem tivesse um dump do banco decifrava tudo com uma linha de Node. E a falha era SILENCIOSA —
// exatamente o tipo de coisa que ninguém descobre até vazar.
// Agora o boot ABORTA. É seguro abortar: sem a chave certa os segredos já não descriptografariam
// (decryptSecret devolve null e o 2FA quebra), então subir assim nunca foi um estado útil.
// ⚠️ Trocar a chave depois invalida todos os segredos já salvos — ela não se rotaciona sozinha.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const CHAVE_MESTRA = process.env.ZC_ENCRYPTION_KEY?.trim();
if (!CHAVE_MESTRA || CHAVE_MESTRA.length < 16) {
  throw new Error(
    "ZC_ENCRYPTION_KEY ausente ou curta demais (mínimo 16 caracteres). Ela cifra os segredos dos " +
    "clientes no banco — sem ela o motor não sobe. Defina nos TRÊS lugares: deploy/.env, " +
    "deploy/deploy.sh e deploy/zapconverte-app-stack.yml.",
  );
}
const MASTER = createHash("sha256").update(CHAVE_MESTRA).digest(); // 32 bytes

// Devolve "iv:tag:ciphertext" (todos base64). Formato estável e auto-descritivo.
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", MASTER, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

// Volta o texto claro, ou null se o blob for inválido/adulterado/chave-mestra trocada.
export function decryptSecret(blob: string): string | null {
  try {
    const [ivB, tagB, encB] = String(blob).split(":");
    if (!ivB || !tagB || !encB) return null;
    const decipher = createDecipheriv("aes-256-gcm", MASTER, Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// Máscara pra UI: "••••" + últimos 4 (nunca devolve a chave inteira depois de salva).
export function maskSecret(plain: string): string {
  const s = String(plain);
  return s.length <= 4 ? "••••" : "••••" + s.slice(-4);
}
