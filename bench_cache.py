import json, random, time
from rutaviva import *
g = ciudad_sintetica(224); N = 224*224; random.seed(3)
bases = [random.randrange(N) for _ in range(5)]; focos = [random.randrange(N) for _ in range(15)]
consultas = [(random.choice(bases), random.choice(focos)) for _ in range(200)]
r = json.load(open("resultados.json")); r["cache"] = {}
for nombre, e in (("Sin caché", AEstrella()), ("Con caché", CacheRutas(AEstrella()))):
    t0 = time.perf_counter()
    for o, d in consultas: e.calcular(g, o, d)
    r["cache"][nombre] = (time.perf_counter()-t0)*1000
    if isinstance(e, CacheRutas): r["cache"]["tasa_aciertos"] = e.aciertos/200
print(r["cache"]); json.dump(r, open("resultados.json","w"), indent=1)
