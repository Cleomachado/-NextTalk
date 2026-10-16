import type { Metadata } from "next";
import { AfiliadoLanding } from "@/components/AfiliadoLanding";

export const metadata: Metadata = {
  title: "Seja afiliado do ZapConverte — 50% recorrente",
  description:
    "Indique o ZapConverte e receba comissão recorrente todo mês, enquanto o cliente pagar. Afilie-se na Kiwify e entre no grupo dos afiliados.",
};

// Página PÚBLICA (sem login) — é o link que o dono manda pra quem quer divulgar.
export default function Page() {
  return <AfiliadoLanding />;
}
