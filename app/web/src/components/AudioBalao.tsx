"use client";
// Player de áudio compartilhado pelos dois inboxes (WPP ao Vivo e API Oficial). Veio do Inbox.tsx
// em 10/09, quando o dono pediu o player "quase idêntico ao do app da Meta".
import { useEffect, useMemo, useRef, useState } from "react";

// Player de áudio estilo WhatsApp: mostra a DURAÇÃO antes do play (a API já manda os segundos —
// o player nativo mostrava "0:00/0:00" porque só sabe a duração depois de baixar o arquivo).
// Durante a reprodução o tempo vira o decorrido; tem 1x/1.5x/2x como no WhatsApp.
const N_BARRAS = 46;
// ONDA REAL: o WhatsApp já manda as amplitudes prontas (base64, ~100 bytes 0-255) no campo
// `waveform` — decodificamos e reamostramos pras N barrinhas. Não precisa baixar nem decodificar
// o áudio (Web Audio por balão seria caríssimo). Sem waveform (ex.: áudio que NÓS enviamos),
// cai num desenho estável derivado da URL — cada áudio com a sua "cara", que não muda a cada render.
function ondaDe(waveform?: string, src?: string): number[] {
  if (waveform) {
    try {
      const bin = atob(waveform);
      const amostras: number[] = [];
      for (let i = 0; i < bin.length; i++) amostras.push(bin.charCodeAt(i));
      if (amostras.length) {
        // ESCALA PELO PICO (com piso): o WhatsApp desenha a fala mais alta chegando no topo da
        // onda. Só pelo absoluto (0-255) a onda saía baixinha comparada ao app (print de 10/09).
        // O piso de 64 evita que um áudio quase mudo vire uma onda cheia.
        const pico = Math.max(64, ...amostras);
        const out: number[] = [];
        for (let i = 0; i < N_BARRAS; i++) {
          // média do bloco correspondente (reamostragem simples)
          const ini = Math.floor((i * amostras.length) / N_BARRAS);
          const fim = Math.max(ini + 1, Math.floor(((i + 1) * amostras.length) / N_BARRAS));
          let soma = 0;
          for (let k = ini; k < fim; k++) soma += amostras[k];
          const media = soma / (fim - ini);
          out.push(Math.round(8 + Math.min(1, media / pico) * 92));
        }
        return out;
      }
    } catch { /* base64 inválido → cai no desenho */ }
  }
  let h = 0;
  const chave = src || "zc";
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < N_BARRAS; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(26 + ((h >>> 8) % 70));
  }
  return out;
}

export function AudioBalao({ url, durationSec, waveform, onBaixar, avatar, meu }: { url?: string; durationSec?: number; waveform?: string; onBaixar?: () => Promise<void>; avatar?: string; meu?: boolean }) {
  const audRef = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(durationSec ?? 0);
  const [taxa, setTaxa] = useState(1);
  const [baixando, setBaixando] = useState(false);
  // BAIXAR O ARQUIVO (14/10/2026, pedido do dono): busca os bytes e salva com nome legível. O
  // arquivo mora em outro domínio (app.), onde o atributo download sozinho não funciona; se a busca
  // falhar, abre o áudio numa aba nova (lá dá pra salvar pelo menu do navegador).
  async function salvarArquivo() {
    if (!url) return;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      const ext = /mpeg|mp3/.test(blob.type) ? "mp3" : /mp4|m4a|aac/.test(blob.type) ? "m4a" : /webm/.test(blob.type) ? "webm" : "ogg";
      const quando = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `audio-${quando}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch {
      window.open(url, "_blank", "noopener");
    }
  }
  const [ouvido, setOuvido] = useState(false); // já ouviu até o fim → bolinha e mic ficam cinza (igual WhatsApp)
  const ondaRef = useRef<HTMLDivElement | null>(null);
  const fmt = (sg: number) => `${Math.floor(sg / 60)}:${String(Math.floor(sg % 60)).padStart(2, "0")}`;
  const barras = useMemo(() => ondaDe(waveform, url), [waveform, url]);
  const progresso = dur > 0 ? Math.min(1, pos / dur) : 0;

  // POSIÇÃO da bolinha e do recorte da onda: escrita DIRETO no DOM (variável --p), não no state.
  // O `timeupdate` do navegador só dispara ~4x por segundo — a bolinha andava aos saltos (print do
  // Admin, 10/09). Aqui um requestAnimationFrame acompanha o áudio a 60fps, e como quem muda é
  // uma CSS var, o React não re-renderiza as 42 barrinhas a cada quadro.
  const pintaProgresso = (v: number) => ondaRef.current?.style.setProperty("--p", String(Math.min(1, Math.max(0, v))));
  useEffect(() => {
    if (!tocando) return;
    let vivo = true;
    const passo = () => {
      if (!vivo) return;
      const a = audRef.current;
      if (a && a.duration > 0) pintaProgresso(a.currentTime / a.duration);
      requestAnimationFrame(passo);
    };
    const id = requestAnimationFrame(passo);
    return () => { vivo = false; cancelAnimationFrame(id); };
  }, [tocando]);
  // Parado (pausa, seek, fim, primeira pintura): acompanha o state.
  useEffect(() => { if (!tocando) pintaProgresso(progresso); }, [tocando, progresso]);
  // No WhatsApp o seletor de velocidade (1x/1.5x/2x) só existe DURANTE a reprodução — e entra no
  // lugar da foto. Parou no fim → a foto volta.
  const emReproducao = !!url && (tocando || pos > 0);

  function alterna() {
    // Sem URL ainda = o áudio não foi baixado → a setinha ⬇ baixa (igual WhatsApp). Depois vira play.
    if (!url) {
      if (onBaixar && !baixando) { setBaixando(true); onBaixar().finally(() => setBaixando(false)); }
      return;
    }
    const a = audRef.current;
    if (!a) return;
    if (a.paused) { a.playbackRate = taxa; a.play().catch(() => {}); } else a.pause();
  }
  function mudaTaxa() {
    const prox = taxa === 1 ? 1.5 : taxa === 1.5 ? 2 : 1;
    setTaxa(prox);
    if (audRef.current) audRef.current.playbackRate = prox;
  }
  function buscaNaOnda(e: React.MouseEvent<HTMLDivElement>) {
    if (!url || dur <= 0 || !audRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    audRef.current.currentTime = pct * dur;
    setPos(pct * dur);
    pintaProgresso(pct);
  }
  return (
    <div className={"audio-balao" + (ouvido && !emReproducao ? " ouvido" : "")}>
      <button
        type="button"
        className={"ab-play" + (!url ? " baixar" : "")}
        onClick={alterna}
        disabled={!url && (baixando || !onBaixar)}
        title={url ? (tocando ? "Pausar" : "Ouvir") : baixando ? "Baixando…" : "Baixar áudio"}
        aria-label={url ? (tocando ? "Pausar" : "Ouvir") : "Baixar áudio"}
      >
        {url
          ? tocando
            ? <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><rect x="5" y="4" width="5" height="16" rx="1.2" fill="currentColor" /><rect x="14" y="4" width="5" height="16" rx="1.2" fill="currentColor" /></svg>
            : <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><path d="M7 4.5v15a1 1 0 0 0 1.52.86l12.2-7.5a1 1 0 0 0 0-1.72L8.52 3.64A1 1 0 0 0 7 4.5z" fill="currentColor" /></svg>
          : baixando
            ? <span className="ab-spin" aria-hidden />
            : <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </button>
      <div className="ab-meio">
        {/* DUAS CAMADAS da mesma onda: a de baixo cinza, a de cima na cor "já tocada", recortada em
            `--p` por clip-path. Antes as barras tocadas ganhavam largura no LAYOUT e o balão inteiro
            ia esticando enquanto o áudio rodava (print do dono, 10/09). Agora a largura extra vem
            de um scaleX, que não mexe no fluxo: a caixa fica parada e a onda só se sobrescreve.
            O recorte é contínuo, então a fronteira coincide com a bolinha em qualquer instante. */}
        <div
          ref={ondaRef}
          className={"ab-onda" + (url ? " ativa" : "")}
          onClick={buscaNaOnda}
          role="slider" aria-label="Posição do áudio" aria-valuemin={0}
          aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(pos)} tabIndex={0}
        >
          <div className="ab-onda-cam">
            {barras.map((alt, i) => <span key={i} className="ab-barra-onda" style={{ height: `${alt}%` }} />)}
          </div>
          <div className="ab-onda-cam tocada" aria-hidden>
            {barras.map((alt, i) => <span key={i} className="ab-barra-onda" style={{ height: `${alt}%` }} />)}
          </div>
          {/* A bolinha corre na ponta do trecho tocado: azul enquanto não ouviu até o fim, cinza depois. */}
          {url && <span className="ab-bolinha" aria-hidden />}
        </div>
        <div className="ab-tempo">
          <span>{tocando || pos > 0 ? fmt(pos) : fmt(dur)}</span>
          {url && (
            <button type="button" className="ab-salvar" onClick={salvarArquivo} title="Baixar o áudio" aria-label="Baixar o áudio">
              <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span>Baixar</span>
            </button>
          )}
        </div>
      </div>
      {/* Foto de quem mandou + microfoninho sobreposto (igual WhatsApp). ULTRA leve: reusa a foto
          que o painel JÁ tem em memória (a da conversa aberta / da sua conta) — zero consulta extra.
          Durante a reprodução a foto dá lugar ao seletor de velocidade, como no app. */}
      {(avatar || emReproducao) && (
        <span className={"ab-ava" + (meu ? " meu" : "")}>
          {emReproducao ? (
            <button type="button" className="ab-taxa" onClick={mudaTaxa} title="Velocidade" aria-label={`Velocidade ${taxa}x`}>{taxa}x</button>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatar} alt="" loading="lazy" decoding="async" />
              <svg className="ab-mic" viewBox="0 0 12 16" width="12" height="16" aria-hidden>
                <rect x="3.6" y="1" width="4.8" height="8.2" rx="2.4" fill="currentColor" />
                <path d="M1.6 7.4a4.4 4.4 0 0 0 8.8 0M6 11.8V15M3.8 15h4.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </>
          )}
        </span>
      )}
      {url && (
        <audio
          ref={audRef} src={url} preload="metadata"
          onPlay={() => setTocando(true)} onPause={() => setTocando(false)}
          onEnded={() => { setTocando(false); setPos(0); setOuvido(true); pintaProgresso(0); }}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDur(d); }}
        />
      )}
    </div>
  );
}

