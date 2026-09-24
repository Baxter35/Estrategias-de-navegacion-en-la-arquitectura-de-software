import json, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
r = json.load(open("resultados.json")); plt.rcParams.update({"font.family":"DejaVu Sans","font.size":10})
col = {"Dijkstra":"#9aa5b1","A*":"#1f6f8b","Bidireccional":"#e07a5f"}
for campo, yl, f in (("ms","Tiempo medio de cálculo (ms)","g_tiempo.png"),("expandidos","Nodos expandidos (promedio)","g_expandidos.png")):
    fig, ax = plt.subplots(figsize=(6.2,3.4), dpi=200)
    for a in col:
        pts = [x for x in r["escalabilidad"] if x["algoritmo"]==a]
        ax.plot([p["nodos"] for p in pts],[p[campo] for p in pts],"o-",color=col[a],label=a,lw=2)
    ax.set_xlabel("Tamaño del grafo (nodos)"); ax.set_ylabel(yl); ax.grid(alpha=.3); ax.legend(frameon=False)
    ax.spines[["top","right"]].set_visible(False); fig.tight_layout(); fig.savefig(f)
fig, ax = plt.subplots(figsize=(5,2.6), dpi=200); c = r["cache"]
ax.barh(["Con caché","Sin caché"],[c["Con caché"],c["Sin caché"]],color=["#1f6f8b","#9aa5b1"])
ax.set_xlabel("Tiempo total para 200 consultas (ms)"); ax.spines[["top","right"]].set_visible(False)
fig.tight_layout(); fig.savefig("g_cache.png")
