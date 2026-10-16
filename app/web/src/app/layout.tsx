import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Shell } from "@/components/Shell";
import { AccountProvider } from "@/components/accounts";
import { AuthProvider } from "@/components/Auth";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "ZapConverte — Painel",
  description: "Automação de WhatsApp",
  // Favicon: sem isto a aba do painel ficava com o ícone genérico do navegador (Admin, 18/09).
  // O .ico cobre navegador antigo e atalho; o .svg deixa o ícone nítido em tela retina.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

// Sem isto, o Safari/Chrome mobile renderiam a página no viewport de DESKTOP (~980px) e só
// depois encolhiam tudo pra caber na tela — nenhum @media (max-width:...) do painel disparava
// no tamanho certo (é o que deixava o WPP Api minúsculo e espremido no celular).
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="tech">
      <head>
        {/* Aplica o tema salvo ANTES da primeira pintura — senão a tela pisca no "tech" e só
            depois vira claro (o refresh parecia "perder" a escolha). */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('zc-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}` }} />
        {/* Mesma ideia pro idioma: sem isto o <html lang> nasce pt-BR e o navegador oferece
            "traduzir esta página" pra quem escolheu inglês. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var i=localStorage.getItem('zc-idioma');if(i)document.documentElement.lang=i==='pt'?'pt-BR':i}catch(e){}` }} />
      </head>
      <body>
        <AuthProvider>
          <I18nProvider>
            <AccountProvider>
              <Shell>{children}</Shell>
            </AccountProvider>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
