"use client";

import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Icon } from "@/components/icons";

// 👁️ CAMPO DE SENHA COM O "OLHINHO".
//
// Digitar senha às cegas no celular é onde o cliente erra e acha que a conta não existe — daí
// vem "não consigo entrar" no suporte. O botão só troca o type do input (password ↔ text);
// nada de guardar a senha em lugar nenhum.
//
// Usa o mesmo <input className="inp"> das outras telas; o wrapper só abre espaço à direita
// pro botão não cobrir o texto (e o padding extra some quando o botão não aparece).

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export default function PasswordInput({ className, style, ...rest }: Props) {
  const [ver, setVer] = useState(false);
  // largura vai pro wrapper, senão o olhinho fica na borda do wrapper e não na do campo
  const { width, maxWidth, minWidth, flex, ...inputStyle } = style ?? {};
  return (
    <div className="pw-wrap" style={{ width, maxWidth, minWidth, flex }}>
      <input
        {...rest}
        type={ver ? "text" : "password"}
        className={className ?? "inp"}
        style={{ paddingRight: 40, ...inputStyle }}
      />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setVer((v) => !v)}
        // não rouba o foco do campo nem entra no caminho do Tab até o "Entrar"
        tabIndex={-1}
        aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
        title={ver ? "Ocultar senha" : "Mostrar senha"}
      >
        <Icon name={ver ? "eye-off" : "eye"} size={17} />
      </button>
    </div>
  );
}
