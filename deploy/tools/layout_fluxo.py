"""Organiza o layout de um fluxo do ZapConverte sem nós sobrepostos.
Uso: python3 layout_fluxo.py entrada.json saida.json   (entrada = objeto do fluxo, com steps/edges)
Regra (pedido do dono, 13/10/2026): fluxo criado por script nunca pode nascer com nó em cima de nó.
Altura estimada por tipo (mídia/template são altos); cada ramo novo abre uma FAIXA abaixo."""
import json, sys
ALT = {"media": 470, "template": 520, "ai_agent": 300, "condition": 150, "payment_check": 150, "switch": 200,
       "buttons": 260, "carousel": 360, "notify": 110, "gsheet_append": 110, "gsheet_read": 110, "loop": 150,
       "meta_ads": 150, "metricas_dia": 150}
COL_W, GAP_Y, X0, Y0 = 340, 70, 340, 80
def organiza(fl):
    steps = {s["_id"]: s for s in fl["steps"]}
    out = {}
    for e in fl["edges"]: out.setdefault(e["source"], []).append(e["target"])
    depth, lane, prox = {}, {}, [0]
    def visita(n, d, ln):
        if n in depth: return
        depth[n], lane[n] = d, ln
        for i, t in enumerate(out.get(n, [])):
            if t in depth: continue
            if i == 0: visita(t, d + 1, ln)
            else: prox[0] += 1; visita(t, d + 1, prox[0])
    visita("trigger", 0, 0)
    alt = lambda n: 120 if n == "trigger" else steps[n].get("h", ALT.get(steps[n]["type"], 100)) if n in steps else 100
    faixas = sorted(set(lane.values()))
    topo, y = {}, Y0
    for f in faixas:
        topo[f] = y
        y += max(alt(n) for n in lane if lane[n] == f) + GAP_Y
    lay = {n: {"x": X0 + depth[n] * COL_W - (X0 - 40 if n == "trigger" else 0), "y": topo[lane[n]]} for n in depth}
    lay["trigger"] = {"x": 40, "y": Y0}
    soltos = [s for s in steps if s not in lay]   # notas e nós sem ligação: em cima, à esquerda
    for i, s in enumerate(soltos): lay[s] = {"x": 40 + i * 320, "y": Y0 - steps[s].get("h", 200) - 60}
    fl["layout"] = lay
    return fl
if __name__ == "__main__":
    d = json.load(open(sys.argv[1]))
    d = [organiza(f) for f in d] if isinstance(d, list) else organiza(d)
    json.dump(d, open(sys.argv[2], "w"), ensure_ascii=False)
