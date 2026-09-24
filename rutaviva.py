"""RutaViva - prototipo de navegación adaptativa para vehículos de emergencia.
Patrones: Strategy, Observer, Command, Composite, Iterator, Decorator."""
import heapq, math, random, time
from abc import ABC, abstractmethod

# ---------- Modelo: grafo vial ----------
class Grafo:
    def __init__(self):
        self.adj, self.pos = {}, {}
    def agregar_nodo(self, n, x, y):
        self.adj.setdefault(n, {}); self.pos[n] = (x, y)
    def agregar_via(self, a, b, t):
        self.adj[a][b] = t; self.adj[b][a] = t
    def bloquear(self, a, b):
        self.adj[a].pop(b, None); self.adj[b].pop(a, None)
    def h(self, a, b, vmax):
        (x1, y1), (x2, y2) = self.pos[a], self.pos[b]
        return math.hypot(x1 - x2, y1 - y2) / vmax

def ciudad_sintetica(lado, seed=7):
    """Cuadrícula lado x lado; distancia 100 m entre cruces, velocidad 20-60 km/h."""
    random.seed(seed); g = Grafo()
    for i in range(lado):
        for j in range(lado):
            g.agregar_nodo(i * lado + j, j * 100, i * 100)
    for i in range(lado):
        for j in range(lado):
            n = i * lado + j
            for m in ([n + 1] if j < lado - 1 else []) + ([n + lado] if i < lado - 1 else []):
                v = random.uniform(20, 60) / 3.6     # m/s
                g.agregar_via(n, m, 100 / v)         # segundos
    g.vmax = 60 / 3.6
    return g

# ---------- Strategy ----------
class EstrategiaRuta(ABC):
    nombre = ""
    @abstractmethod
    def calcular(self, g, o, d): """Devuelve (camino, costo, nodos_expandidos)"""

def _reconstruir(prev, o, d):
    if d not in prev and d != o: return []
    c = [d]
    while c[-1] != o: c.append(prev[c[-1]])
    return c[::-1]

class Dijkstra(EstrategiaRuta):
    nombre = "Dijkstra"
    def calcular(self, g, o, d):
        dist, prev, pq, exp = {o: 0}, {}, [(0, o)], 0
        vis = set()
        while pq:
            du, u = heapq.heappop(pq)
            if u in vis: continue
            vis.add(u); exp += 1
            if u == d: break
            for v, w in g.adj[u].items():
                nd = du + w
                if nd < dist.get(v, math.inf):
                    dist[v], prev[v] = nd, u; heapq.heappush(pq, (nd, v))
        return _reconstruir(prev, o, d), dist.get(d, math.inf), exp

class AEstrella(EstrategiaRuta):
    nombre = "A*"
    def calcular(self, g, o, d):
        dist, prev, exp = {o: 0}, {}, 0
        pq, vis = [(g.h(o, d, g.vmax), o)], set()
        while pq:
            _, u = heapq.heappop(pq)
            if u in vis: continue
            vis.add(u); exp += 1
            if u == d: break
            for v, w in g.adj[u].items():
                nd = dist[u] + w
                if nd < dist.get(v, math.inf):
                    dist[v], prev[v] = nd, u
                    heapq.heappush(pq, (nd + g.h(v, d, g.vmax), v))
        return _reconstruir(prev, o, d), dist.get(d, math.inf), exp

class DijkstraBidireccional(EstrategiaRuta):
    nombre = "Bidireccional"
    def calcular(self, g, o, d):
        if o == d: return [o], 0, 1
        D = [{o: 0}, {d: 0}]; P = [{}, {}]; Q = [[(0, o)], [(0, d)]]; V = [set(), set()]
        mejor, punto, exp = math.inf, None, 0
        while Q[0] and Q[1]:
            if Q[0][0][0] + Q[1][0][0] >= mejor: break
            k = 0 if Q[0][0][0] <= Q[1][0][0] else 1
            du, u = heapq.heappop(Q[k])
            if u in V[k]: continue
            V[k].add(u); exp += 1
            for v, w in g.adj[u].items():
                nd = du + w
                if nd < D[k].get(v, math.inf):
                    D[k][v], P[k][v] = nd, u; heapq.heappush(Q[k], (nd, v))
                if v in D[1 - k] and nd + D[1 - k][v] < mejor:
                    mejor, punto = nd + D[1 - k][v], v
        if punto is None: return [], math.inf, exp
        ida = _reconstruir(P[0], o, punto)
        vuelta = _reconstruir(P[1], d, punto)[::-1][1:]
        return ida + vuelta, mejor, exp

class SelectorAdaptativo(EstrategiaRuta):
    """Innovación: elige la estrategia según el tamaño del grafo."""
    nombre = "Adaptativo"
    def __init__(self, umbral=2000): self.umbral = umbral
    def calcular(self, g, o, d):
        est = Dijkstra() if len(g.adj) < self.umbral else AEstrella()
        return est.calcular(g, o, d)

# ---------- Decorator (caché LRU) ----------
class CacheRutas(EstrategiaRuta):
    def __init__(self, interna, capacidad=256):
        self.interna, self.cap, self.cache = interna, capacidad, {}
        self.nombre = f"{interna.nombre}+Caché"; self.aciertos = self.fallos = 0
    def invalidar(self): self.cache.clear()
    def calcular(self, g, o, d):
        k = (o, d)
        if k in self.cache:
            self.aciertos += 1; r = self.cache.pop(k); self.cache[k] = r; return r
        self.fallos += 1; r = self.interna.calcular(g, o, d); self.cache[k] = r
        if len(self.cache) > self.cap: self.cache.pop(next(iter(self.cache)))
        return r

# ---------- Composite + Iterator ----------
class ComponenteRuta(ABC):
    @abstractmethod
    def tiempo(self): ...
class Tramo(ComponenteRuta):
    def __init__(self, a, b, t): self.a, self.b, self.t = a, b, t
    def tiempo(self): return self.t
class RutaCompuesta(ComponenteRuta):
    def __init__(self): self.hijos = []
    def agregar(self, c): self.hijos.append(c)
    def tiempo(self): return sum(h.tiempo() for h in self.hijos)
    def __iter__(self):                       # Iterator: recorrido giro a giro
        for h in self.hijos:
            yield from (h if isinstance(h, RutaCompuesta) else [h])

def construir_ruta(g, camino):
    r = RutaCompuesta()
    for a, b in zip(camino, camino[1:]): r.agregar(Tramo(a, b, g.adj[a][b]))
    return r

# ---------- Observer ----------
class ServicioTrafico:
    def __init__(self): self.obs = []
    def suscribir(self, o): self.obs.append(o)
    def reportar_cierre(self, g, a, b):
        g.bloquear(a, b)
        for o in self.obs: o.actualizar(("cierre", a, b))

# ---------- Command ----------
class Comando(ABC):
    @abstractmethod
    def ejecutar(self): ...
class ComandoCalcularRuta(Comando):
    def __init__(self, nav, o, d): self.nav, self.o, self.d = nav, o, d
    def ejecutar(self): return self.nav.calcular(self.o, self.d)
class ComandoRecalcular(Comando):
    def __init__(self, nav): self.nav = nav
    def ejecutar(self): return self.nav.calcular(self.nav.posicion, self.nav.destino)

class Navegador:
    """Contexto de Strategy, observador del tráfico e invocador de comandos."""
    def __init__(self, g, estrategia):
        self.g, self.estrategia = g, estrategia
        self.ruta = self.camino = None; self.historial = []; self.posicion = self.destino = None
        self.latencias_reruteo = []
    def set_estrategia(self, e): self.estrategia = e
    def ejecutar(self, cmd): self.historial.append(cmd); return cmd.ejecutar()
    def calcular(self, o, d):
        self.posicion, self.destino = o, d
        self.camino, costo, exp = self.estrategia.calcular(self.g, o, d)
        self.ruta = construir_ruta(self.g, self.camino) if self.camino else None
        return self.camino, costo, exp
    def actualizar(self, evento):
        _, a, b = evento
        if isinstance(self.estrategia, CacheRutas): self.estrategia.invalidar()
        if self.camino and any({a, b} == {x, y} for x, y in zip(self.camino, self.camino[1:])):
            t0 = time.perf_counter(); self.ejecutar(ComandoRecalcular(self))
            self.latencias_reruteo.append((time.perf_counter() - t0) * 1000)
