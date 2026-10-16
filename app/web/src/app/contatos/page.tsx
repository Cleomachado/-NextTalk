"use client";

import { useEffect, useState } from "react";
import { Crm } from "@/components/Crm";
import { CrmBoard } from "@/components/CrmBoard";
import { useAuth } from "@/components/Auth";
import { useT } from "@/lib/i18n";

// Contatos em 2 visões: LISTA (a de sempre) e FUNIL (board Kanban estilo Trello).
// A escolha fica no localStorage — quem trabalha no funil abre direto nele.
export default function Page() {
  const t = useT();
  const { session } = useAuth();
  const [view, setView] = useState<"lista" | "funil">("lista");
  useEffect(() => { if (localStorage.getItem("zc-crm-view") === "funil") setView("funil"); }, []);
  function troca(v: "lista" | "funil") {
    setView(v);
    try { localStorage.setItem("zc-crm-view", v); } catch { /* modo privado */ }
  }
  // Atendente não mexe nas COLUNAS do funil (o motor barra também) — mas move card e edita a ficha.
  const canEditStages = session?.user.role === "admin" || session?.user.wsRole !== "atendente";

  return (
    <>
      <div className="crm-views">
        <button className={view === "lista" ? "on" : ""} onClick={() => troca("lista")}>{t("contatos.visaoLista")}</button>
        <button className={view === "funil" ? "on" : ""} onClick={() => troca("funil")}>{t("contatos.visaoFunil")}</button>
      </div>
      {view === "lista" ? <Crm /> : <CrmBoard canEditStages={canEditStages} />}
    </>
  );
}
