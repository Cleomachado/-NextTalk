// Acha chamada do painel pra rota que NÃO existe. Rode: node scripts/rotas-orfas.mjs
// Nasceu do "Não consegui ligar: Erro 404" (22/08): o motor tinha /app/lite/call, mas ninguém
// criou o proxy em src/app/api — e isso só aparecia em produção, no clique do usuário.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const tsx = [];
(function anda(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) anda(p);
    else if (/\.tsx?$/.test(f)) tsx.push(p);
  }
})("src");

// toda string "/api/..." que aparece no código do painel
const chamadas = new Map();
for (const f of tsx) {
  if (f.includes("src/app/api/")) continue;           // as próprias rotas não contam
  if (f.endsWith("middleware.ts")) continue;         // lá são PREFIXOS públicos, não chamadas
  for (const m of readFileSync(f, "utf8").matchAll(/["'`](\/api\/[a-zA-Z0-9\-_/[\]]+)["'`?]/g)) {
    const rota = m[1].replace(/\/$/, "");
    if (!chamadas.has(rota)) chamadas.set(rota, f);
  }
}

const orfas = [];
for (const [rota, arq] of chamadas) {
  // rota dinâmica: /api/convite/abc casa com src/app/api/convite/[token]/route.ts
  const partes = rota.replace(/^\/api\//, "").split("/");
  let dir = "src/app/api", ok = true;
  for (const parte of partes) {
    if (existsSync(join(dir, parte))) { dir = join(dir, parte); continue; }
    const din = existsSync(dir) && readdirSync(dir).find((d) => d.startsWith("[") && statSync(join(dir, d)).isDirectory());
    if (din) { dir = join(dir, din); continue; }
    ok = false; break;
  }
  if (!ok || !existsSync(join(dir, "route.ts"))) orfas.push({ rota, arq });
}

console.log(`\n  ${chamadas.size} rotas chamadas pelo painel\n`);
if (!orfas.length) { console.log("  ✅ todas têm route.ts — nenhuma órfã\n"); process.exit(0); }
console.log(`  ❌ ${orfas.length} SEM route.ts (vão dar 404 no clique do usuário):\n`);
for (const o of orfas) console.log(`     ${o.rota}\n        chamada em ${o.arq}`);
console.log();
process.exit(1);
