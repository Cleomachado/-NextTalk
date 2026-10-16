// Logo oficial da Meta (infinito azul, fundo transparente) nas etiquetas que enviam conversão.
// Arquivo em /public/meta-logo.png, recortado da arte que o dono mandou (14/10/2026).
export function LogoMeta({ size = 12 }: { size?: number }) {
  return <img src="/meta-logo.png" alt="Meta" className="logo-meta" style={{ height: size, width: "auto" }} draggable={false} />;
}
