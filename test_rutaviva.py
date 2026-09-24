from rutaviva import *
def test_estrategias_coinciden():
    g = ciudad_sintetica(30)
    costos = [e.calcular(g, 0, 899)[1] for e in (Dijkstra(), AEstrella(), DijkstraBidireccional())]
    assert max(costos) - min(costos) < 1e-6
def test_astar_expande_menos():
    g = ciudad_sintetica(50)
    assert AEstrella().calcular(g, 0, 2499)[2] < Dijkstra().calcular(g, 0, 2499)[2]
def test_composite_suma_tiempos():
    g = ciudad_sintetica(20); c, costo, _ = Dijkstra().calcular(g, 0, 399)
    assert abs(construir_ruta(g, c).tiempo() - costo) < 1e-6
def test_iterator_recorre_todos_los_tramos():
    g = ciudad_sintetica(20); c, _, _ = Dijkstra().calcular(g, 0, 399)
    assert len(list(construir_ruta(g, c))) == len(c) - 1
def test_observer_reruteo_evita_cierre():
    g = ciudad_sintetica(30); t = ServicioTrafico(); nav = Navegador(g, AEstrella()); t.suscribir(nav)
    nav.ejecutar(ComandoCalcularRuta(nav, 0, 899)); a, b = nav.camino[5], nav.camino[6]
    t.reportar_cierre(g, a, b)
    assert not any({a, b} == {x, y} for x, y in zip(nav.camino, nav.camino[1:]))
    assert len(nav.historial) == 2
def test_cache_acierta():
    g = ciudad_sintetica(20); c = CacheRutas(Dijkstra())
    c.calcular(g, 0, 399); c.calcular(g, 0, 399); assert c.aciertos == 1
