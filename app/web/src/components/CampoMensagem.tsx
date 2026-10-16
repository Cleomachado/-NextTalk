"use client";

// Campo de escrever mensagem dos chats (WPP ao Vivo e WPP Api). Era um <input> de UMA linha: colar
// uma lista ("Nome completo: / CPF: / RG: …") virava uma tripa só, e não existia como quebrar linha
// (pedido do dono, 02/10). Agora é um <textarea> que cresce com o texto até um teto e depois
// rola. Quem decide o que o Enter faz é o chat (Enter envia, Shift+Enter quebra) — aqui só mora o
// tamanho. `ref` devolve o próprio <textarea>, então menção (@) e resposta rápida, que leem a
// posição do cursor, seguem funcionando igual.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & { maxAltura?: number };

export const CampoMensagem = forwardRef<HTMLTextAreaElement, Props>(function CampoMensagem(
  { value, maxAltura = 168, className, title, ...resto }, ref,
) {
  const interno = useRef<HTMLTextAreaElement | null>(null);
  useImperativeHandle(ref, () => interno.current as HTMLTextAreaElement, []);
  // Recalcula a altura a cada mudança do texto — digitar, colar, resposta rápida, e o esvaziar
  // depois do envio (volta pra uma linha).
  useEffect(() => {
    const el = interno.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight não conta a BORDA; com box-sizing border-box, sem somá-la a última linha fica
    // 1-2px cortada (e aparece uma barrinha de rolagem fantasma).
    const borda = el.offsetHeight - el.clientHeight;
    const alvo = el.scrollHeight + borda;
    el.style.height = Math.min(alvo, maxAltura) + "px";
    el.style.overflowY = alvo > maxAltura ? "auto" : "hidden";
  }, [value, maxAltura]);
  return (
    <textarea
      ref={interno}
      rows={1}
      value={value}
      className={"compose-txt" + (className ? " " + className : "")}
      title={title ?? "Enter envia · Shift+Enter quebra a linha"}
      {...resto}
    />
  );
});
