import json, random, time, statistics as st, tracemalloc
from rutaviva import *
res = {"escalabilidad": [], "cache": {}, "reruteo": {}}
for lado in (32, 100, 224, 316):
    g = ciudad_sintetica(lado); N = lado * lado; random.seed(1)
    pares = [(random.randrange(N), random.randrange(N)) for _ in range(15)]
    for e in (Dijkstra(), AEstrella(), DijkstraBidireccional()):
        ts, ex = [], []
        for o, d in pares:
            t0 = time.perf_counter(); _, _, x = e.calcular(g, o, d); ts.append((time.perf_counter()-t0)*1000); ex.append(x)
        res["escalabilidad"].append({"nodos": N, "algoritmo": e.nombre, "ms": st.mean(ts), "p95": sorted(ts)[int(.95*len(ts))-1], "expandidos": st.mean(ex)})
        print(N, e.nombre, round(st.mean(ts),2), round(st.mean(ex)))
# memoria
g = ciudad_sintetica(224)
for e in (Dijkstra(), AEstrella(), DijkstraBidireccional()):
    tracemalloc.start(); e.calcular(g, 0, 224*224-1); _, pk = tracemalloc.get_traced_memory(); tracemalloc.stop()
    res.setdefault("memoria", {})[e.nombre] = pk / 1024
# caché: 200 consultas con distribución concentrada (hospitales/zonas frecuentes)
random.seed(3); N = 224*224; zonas = [random.randrange(N) for _ in range(20)]
consultas = [(random.choice(zonas), random.choice(zonas)) for _ in range(200)]
for nombre, e in (("Sin caché", AEstrella()), ("Con caché", CacheRutas(AEstrella()))):
    t0 = time.perf_counter()
    for o, d in consultas: e.calcular(g, o, d)
    res["cache"][nombre] = (time.perf_counter()-t0)*1000
    if isinstance(e, CacheRutas): res["cache"]["tasa_aciertos"] = e.aciertos/(e.aciertos+e.fallos)
# reruteo con Observer
g = ciudad_sintetica(224); t = ServicioTrafico(); nav = Navegador(g, AEstrella()); t.suscribir(nav)
random.seed(5); cambios = 0
for _ in range(20):
    o, d = random.randrange(N), random.randrange(N); nav.ejecutar(ComandoCalcularRuta(nav, o, d))
    if len(nav.camino) > 10:
        c0 = nav.ruta.tiempo(); i = len(nav.camino)//2; t.reportar_cierre(g, nav.camino[i], nav.camino[i+1])
        cambios += 1
lat = nav.latencias_reruteo
res["reruteo"] = {"eventos": cambios, "media_ms": st.mean(lat), "max_ms": max(lat), "comandos": len(nav.historial)}
print(json.dumps({k: v for k, v in res.items() if k != "escalabilidad"}, indent=1))
json.dump(res, open("resultados.json", "w"), indent=1)
