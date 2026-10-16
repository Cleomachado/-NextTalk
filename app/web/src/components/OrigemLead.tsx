"use client";
// Selo "Origem" no topo do chat: de onde o lead veio (UTMs do checkout da Kiwify e/ou clique no
// anúncio de Click-to-WhatsApp). Os dados já moravam na ficha do contato; faltava mostrar (14/10/2026).
import { useEffect, useState } from "react";
import { jget } from "@/lib/client";

export type Origem = Record<string, string>;

export const ROTULOS_ORIGEM: Array<[string, string]> = [
  ["utm_source", "Origem (utm_source)"],
  ["utm_medium", "Mídia (utm_medium)"],
  ["utm_campaign", "Campanha (utm_campaign)"],
  ["utm_content", "Criativo (utm_content)"],
  ["utm_term", "Público (utm_term)"],
  ["ad_id", "ID do anúncio (sck)"],
  ["anuncio_clique", "Clique no anúncio (WhatsApp)"],
];

export function resumoOrigem(o: Origem): string {
  const fonte = o.utm_source || (o.anuncio_clique ? "anúncio WhatsApp" : "");
  if (!fonte) return "";
  const det = o.utm_content || o.utm_campaign || "";
  return det ? `${fonte} · ${det}` : fonte;
}

export function OrigemLead({ phone }: { phone: string }) {
  const [o, setO] = useState<Origem | null>(null);
  useEffect(() => {
    let vivo = true;
    setO(null);
    const tel = phone.replace(/@.*/, "").replace(/\D/g, "");
    if (tel.length < 10) return;
    jget("/api/contacts/" + encodeURIComponent(tel) + "/ficha").then((f) => { if (vivo) setO(f?.origem ?? {}); }).catch(() => {});
    return () => { vivo = false; };
  }, [phone]);
  if (!o) return null;
  const resumo = resumoOrigem(o);
  if (!resumo) return null;
  const titulo = ROTULOS_ORIGEM.filter(([k]) => o[k]).map(([k, r]) => `${r}: ${o[k]}`).join("\n");
  return (
    <span className="origem-lead" title={titulo}>
      <b>Origem</b> {resumo.length > 42 ? resumo.slice(0, 41) + "…" : resumo}
    </span>
  );
}
