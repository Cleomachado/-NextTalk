"use client";

import { Settings } from "@/components/Settings";

// Configurações UNIFICADA (adapta por papel dentro do componente): admin vê Parceiros/Super Admin +
// Respostas rápidas + Declaração matinal; cliente (Dono) vê a versão escopada do próprio workspace.
export default function Page() {
  return <Settings />;
}
