"use client";
// Cartão de CONTATO compartilhado (vCard no Lite, `contacts` na Cloud API) — igual WhatsApp:
// avatar com as iniciais, nome, telefone e os botões Conversar / Copiar número.
// Usado pelos dois inboxes; nasceu no Inbox.tsx e virou componente em 10/09, quando o dono
// pediu o mesmo comportamento na API Oficial.

export interface Contato { nome: string; telefone: string }

function initials(nome: string): string {
  const p = (nome || "").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function ContatoCard({
  contatos, onConversar, onCopiar, rotuloConversar = "Conversar", rotuloCopiar = "Copiar número",
}: {
  contatos: Contato[];
  onConversar?: (tel: string, nome: string) => void;
  onCopiar?: (tel: string) => void;
  rotuloConversar?: string;
  rotuloCopiar?: string;
}) {
  const lista = contatos.filter((c) => c.nome || c.telefone);
  if (!lista.length) return null;
  return (
    <div className="msg-contact-wrap">
      {lista.map((c, i) => (
        <div key={i} className="msg-contact">
          <div className="msg-contact-ava">{initials(c.nome || c.telefone)}</div>
          <div className="msg-contact-info">
            <span className="msg-contact-name">{c.nome || c.telefone}</span>
            {c.telefone && <span className="msg-contact-phone">{c.telefone}</span>}
          </div>
        </div>
      ))}
      {/* Um só par de botões: quando vêm vários contatos numa mensagem, valem para o primeiro
          (é o que o WhatsApp faz — os demais abrem pela lista). */}
      {lista[0].telefone && (onConversar || onCopiar) && (
        <div className="msg-contact-acoes">
          {onConversar && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onConversar(lista[0].telefone, lista[0].nome); }}>{rotuloConversar}</button>
          )}
          {onCopiar && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onCopiar(lista[0].telefone); }}>{rotuloCopiar}</button>
          )}
        </div>
      )}
    </div>
  );
}
