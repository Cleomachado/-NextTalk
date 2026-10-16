// Mede quanto do painel já está traduzido. Rode: node scripts/i18n-cobertura.mjs
// Serve pra saber quando é SEGURO gravar o screencast do App Review em inglês: app
// meio-traduzido reprova igual app em português.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = "src/lib/i18n";
const chaves = (arq) => {
  const s = readFileSync(join(DIR, arq), "utf8");
  return new Set([...s.matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]));
};

const base = chaves("pt.ts");
console.log(`\n  português (fonte da verdade): ${base.size} chaves\n`);

let pronto = true;
for (const [arq, nome] of [["en.ts", "inglês"], ["es.ts", "espanhol"]]) {
  const c = chaves(arq);
  const faltando = [...base].filter((k) => !c.has(k));
  const sobrando = [...c].filter((k) => !base.has(k));
  const pct = Math.round(((base.size - faltando.length) / base.size) * 100);
  const barra = "█".repeat(Math.round(pct / 5)).padEnd(20, "░");
  console.log(`  ${nome.padEnd(10)} ${barra} ${String(pct).padStart(3)}%  (${base.size - faltando.length}/${base.size})`);
  if (faltando.length) {
    pronto = false;
    console.log(`     faltam ${faltando.length}: ${faltando.slice(0, 6).join(", ")}${faltando.length > 6 ? "…" : ""}`);
  }
  if (sobrando.length) console.log(`     ⚠️  ${sobrando.length} chave(s) que não existem no pt: ${sobrando.slice(0, 4).join(", ")}`);
}

// Quanto do painel ainda usa texto cru em vez de t()
const tsx = [];
(function anda(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) anda(p);
    else if (f.endsWith(".tsx")) tsx.push(p);
  }
})("src");
let comT = 0;
for (const f of tsx) if (/\buseT\(|\buseI18n\(/.test(readFileSync(f, "utf8"))) comT++;
const pctArq = Math.round((comT / tsx.length) * 100);
console.log(`\n  arquivos usando i18n: ${comT}/${tsx.length} (${pctArq}%)`);
console.log(pctArq === 100 && pronto
  ? "\n  ✅ painel 100% traduzido — pode gravar o screencast em inglês\n"
  : "\n  ⏳ ainda há tela em português — não grave o screencast do App Review ainda\n");
