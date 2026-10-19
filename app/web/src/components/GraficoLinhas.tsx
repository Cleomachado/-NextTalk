"use client";
// 📈 Gráfico de linhas em SVG, sem biblioteca (Dashboard de Lançamento): até 2 eixos, área,
// tracejado, legenda, linha de referência horizontal e MARCAS verticais (pitch, prova social, venda).
// Mora dentro do tema escuro .lx (as cores de grade/eixo vêm de lá).
import { useEffect, useRef, useState } from "react";
import { brl } from "@/lib/lancamento-util";

export interface Serie { nome: string; cor: string; valores: Array<number | null>; area?: boolean; tracejado?: boolean; eixo2?: boolean; moeda?: boolean; sufixo?: string }
export interface Marca { i: number; rot: string; cor?: string }

export function Linhas({ rotulos, series, altura = 200, linhaEm, marcas }: { rotulos: string[]; series: Serie[]; altura?: number; linhaEm?: number; marcas?: Marca[] }) {
  // Desenha na LARGURA REAL do card (ResizeObserver) com altura fixa em px: antes o SVG tinha viewBox
  // de 640 e esticava pra largura toda, então numa tela larga (ou com o zoom do navegador reduzido)
  // o gráfico e o texto cresciam junto e não obedeciam ao zoom (print do dono, 18/10/2026).
  const caixa = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = caixa.current; if (!el) return;
    const mede = () => setW(Math.max(260, Math.round(el.clientWidth)));
    mede();
    const ro = new ResizeObserver(mede); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = altura, pe = 44, pd = series.some((s) => s.eixo2) ? 34 : 10, pt = marcas?.length ? 22 : 10, pb = 24;
  const max1 = Math.max(1e-9, ...series.filter((s) => !s.eixo2).flatMap((s) => s.valores.filter((v): v is number => v != null)), linhaEm ?? 0);
  const max2 = Math.max(1, ...series.filter((s) => s.eixo2).flatMap((s) => s.valores.filter((v): v is number => v != null)));
  const nx = Math.max(1, rotulos.length - 1);
  const X = (i: number) => pe + ((W - pe - pd) * i) / nx;
  const Y = (v: number, e2?: boolean) => pt + (H - pt - pb) * (1 - v / (e2 ? max2 : max1));
  const s1 = series.find((s) => !s.eixo2);
  const fmt1 = (v: number) => (s1?.moeda ? "R$ " + (v >= 1000 ? (v / 1000).toFixed(1).replace(".", ",") + "k" : v.toFixed(0)) : (v % 1 ? v.toFixed(1).replace(".", ",") : String(Math.round(v))) + (s1?.sufixo ?? ""));
  const passo = Math.ceil(rotulos.length / Math.max(4, Math.floor(W / 80)));   // rótulos do eixo cabem na largura
  return (
    <div className="lx-graf" ref={caixa}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.nome).join(", ")}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={pe} x2={W - pd} y1={pt + (H - pt - pb) * t} y2={pt + (H - pt - pb) * t} className="lx-grade" />
            <text x={pe - 6} y={pt + (H - pt - pb) * t + 3} textAnchor="end" className="lx-eixo">{fmt1(max1 * (1 - t))}</text>
            {pd > 10 && <text x={W - pd + 6} y={pt + (H - pt - pb) * t + 3} className="lx-eixo">{Math.round(max2 * (1 - t))}</text>}
          </g>
        ))}
        {linhaEm != null && <line x1={pe} x2={W - pd} y1={Y(linhaEm)} y2={Y(linhaEm)} className="lx-ref" />}
        {rotulos.map((r, i) => (i % passo === 0 || i === rotulos.length - 1) && <text key={i} x={X(i)} y={H - 6} textAnchor="middle" className="lx-eixo">{r}</text>)}
        {(marcas ?? []).filter((m) => m.i >= 0 && m.i <= nx).map((m, k) => (
          <g key={k}>
            <line x1={X(m.i)} x2={X(m.i)} y1={pt - 4} y2={H - pb} stroke={m.cor ?? "#94a3b8"} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            <text x={X(m.i)} y={pt - 8 - (k % 2) * 0} textAnchor="middle" className="lx-eixo" style={{ fill: m.cor ?? undefined }}>{m.rot}</text>
          </g>
        ))}
        {series.map((s) => {
          const pts = s.valores.map((v, i) => (v == null ? null : [X(i), Y(v, s.eixo2)] as const)).filter(Boolean) as Array<readonly [number, number]>;
          if (!pts.length) return null;
          const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
          return (
            <g key={s.nome}>
              {s.area && <path d={`${d} L${pts[pts.length - 1][0]},${H - pb} L${pts[0][0]},${H - pb} Z`} fill={s.cor} opacity={0.16} />}
              <path d={d} fill="none" stroke={s.cor} strokeWidth={2} strokeDasharray={s.tracejado ? "5 4" : undefined} vectorEffect="non-scaling-stroke" />
              {s.valores.map((v, i) => v != null && (
                <circle key={i} cx={X(i)} cy={Y(v, s.eixo2)} r={pts.length > 40 ? 0 : 2.6} fill={s.cor}>
                  <title>{`${rotulos[i]} · ${s.nome}: ${s.moeda ? brl(v) : (v % 1 ? v.toFixed(2).replace(".", ",") : v) + (s.sufixo ?? "")}`}</title>
                </circle>
              ))}
              {pts.length > 40 && s.valores.map((v, i) => v != null && i % Math.ceil(pts.length / 60) === 0 && (
                <rect key={"h" + i} x={X(i) - 3} y={pt} width={6} height={H - pt - pb} fill="transparent">
                  <title>{`${rotulos[i]} · ${s.nome}: ${s.moeda ? brl(v) : v}`}</title>
                </rect>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="lx-leg">{series.map((s) => <span key={s.nome}><i style={{ background: s.cor }} className={s.tracejado ? "trac" : ""} />{s.nome}</span>)}</div>
    </div>
  );
}
