"use client";

import { useEffect, useState } from "react";
import { jget, brl, ago, evLabel, Stats, EventRow } from "@/lib/client";

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [s, e] = await Promise.all([jget("/api/stats"), jget("/api/events?limit=15")]);
      setStats(s);
      setEvents(e.events ?? []);
    } catch (ex: any) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  if (loading && !stats) return <div className="card"><div className="card-pad muted">Carregando dados do motor…</div></div>;
  if (err) return (
    <div className="card">
      <div className="card-pad">
        <b style={{ color: "var(--crit)" }}>Não consegui falar com o motor.</b>
        <div className="muted" style={{ marginTop: 4 }}>{err}</div>
        <button className="btn" style={{ marginTop: 12 }} onClick={load}>Tentar de novo</button>
      </div>
    </div>
  );

  const cards: Array<[string, string, string, string]> = [
    ["Faturamento hoje", brl(stats?.today.revenue ?? 0), `${stats?.today.sales ?? 0} venda(s) aprovada(s)`, "b-green"],
    ["Eventos hoje", String(stats?.today.events ?? 0), "webhooks recebidos", "b-blue"],
    ["Faturamento (7 dias)", brl(stats?.last7d.revenue ?? 0), `${stats?.last7d.events ?? 0} eventos`, "b-teal"],
    ["Contatos", String(stats?.contacts ?? 0), `${stats?.optedOut ?? 0} sem receber (opt-out)`, "b-amber"],
  ];

  return (
    <>
      <div className="grid-stats">
        {cards.map((c, i) => (
          <div key={i} className="card stat">
            <div className="stat-top">
              <span className="stat-label">{c[0]}</span>
              <span className={"badge-ico " + c[3]} />
            </div>
            <div className="stat-num tnum">{c[1]}</div>
            <div className="stat-delta"><span className="muted">{c[2]}</span></div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Eventos de hoje por tipo</h3><span className="page-hint">São Paulo</span></div>
          <div className="card-pad">
            {(stats?.byEventToday?.length ?? 0) === 0 ? (
              <div className="muted">Nenhum evento hoje ainda. Assim que uma venda ou PIX cair na Kiwify, aparece aqui.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {stats!.byEventToday.map((b) => {
                  const l = evLabel(b.event);
                  return (
                    <div key={b.event} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className={"badge-ico " + l.c} style={{ width: 24, height: 24 }} />
                      <span style={{ fontSize: 13.5 }}>{l.t}</span>
                      <b className="tnum" style={{ marginLeft: "auto" }}>{b.count}</b>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Atividade recente</h3>
            <button className="btn" style={{ marginLeft: "auto", padding: "5px 11px", fontSize: 12.5 }} onClick={load}>Atualizar</button>
          </div>
          <div className="feed">
            {events.length === 0 ? (
              <div className="card-pad muted">Sem atividade ainda.</div>
            ) : (
              events.map((f, i) => {
                const l = evLabel(f.event);
                const who = f.name || f.phone || "—";
                const val = f.amount ? " · " + brl(Number(f.amount)) : "";
                const prod = f.product ? ` · ${f.product}` : "";
                return (
                  <div key={i} className="feed-item">
                    <span className={"feed-ico " + l.c} />
                    <div className="feed-txt">
                      <b>{l.t}</b> · {f.platform} · {who}{prod}{val}
                      <div className="feed-time">{ago(f.created_at)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
