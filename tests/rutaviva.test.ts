import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createCity } from "../src/domain/CityFactory.js";
import { Graph } from "../src/domain/Graph.js";
import { AStarStrategy, DijkstraStrategy } from "../src/strategies/BestFirstStrategies.js";
import { BidirectionalStrategy } from "../src/strategies/BidirectionalStrategy.js";
import { AdaptiveStrategy } from "../src/strategies/AdaptiveStrategy.js";
import { CachedRouteStrategy } from "../src/cache/CachedRouteStrategy.js";
import { RouteEngine } from "../src/engine/RouteEngine.js";
import { Route } from "../src/route/Route.js";
import { seededRandom } from "../src/util/Random.js";

const city = () => createCity({ rows: 30, cols: 30, seed: 1 });

describe("Strategy: los tres algoritmos encuentran la ruta óptima", () => {
  test("mismo costo en 50 viajes aleatorios", () => {
    const g = city();
    const rnd = seededRandom(99);
    const [d, a, b] = [new DijkstraStrategy(), new AStarStrategy(), new BidirectionalStrategy()];
    for (let i = 0; i < 50; i++) {
      const from = Math.floor(rnd() * g.size);
      const to = Math.floor(rnd() * g.size);
      const rd = d.findRoute(g, from, to);
      assert.ok(Math.abs(rd.cost - a.findRoute(g, from, to).cost) < 1e-6, "A* difiere de Dijkstra");
      assert.ok(Math.abs(rd.cost - b.findRoute(g, from, to).cost) < 1e-6, "Bidireccional difiere de Dijkstra");
    }
  });

  test("A* expande menos nodos que Dijkstra en viajes largos", () => {
    const g = city();
    const d = new DijkstraStrategy().findRoute(g, 0, g.size - 1);
    const a = new AStarStrategy().findRoute(g, 0, g.size - 1);
    assert.ok(a.expanded < d.expanded, `A* ${a.expanded} vs Dijkstra ${d.expanded}`);
  });

  test("la ruta es continua y va de origen a destino", () => {
    const g = city();
    const r = new AStarStrategy().findRoute(g, 5, 800);
    assert.equal(r.path[0], 5);
    assert.equal(r.path.at(-1), 800);
    r.edges.forEach((e, i) => assert.equal(e.from, r.path[i]));
  });

  test("devuelve found=false si el destino es inalcanzable", () => {
    const g = new Graph();
    g.addNode({ id: 0, x: 0, y: 0 });
    g.addNode({ id: 1, x: 100, y: 0 });
    assert.equal(new BidirectionalStrategy().findRoute(g, 0, 1).found, false);
    assert.equal(new AStarStrategy().findRoute(g, 0, 1).found, false);
  });

  test("la estrategia adaptativa elige según la distancia", () => {
    const g = city();
    const s = new AdaptiveStrategy();
    assert.equal(s.select(g, 0, 1).name, "dijkstra");
    assert.equal(s.select(g, 0, g.size - 1).name, "astar");
  });
});

describe("Decorator: caché de rutas", () => {
  test("segunda consulta sale de la caché y se invalida al cambiar el tráfico", () => {
    const g = city();
    const cached = new CachedRouteStrategy(new AStarStrategy());
    cached.findRoute(g, 0, 899);
    assert.equal(cached.findRoute(g, 0, 899).fromCache, true);
    g.updateEdge([...g.edges()][0].id, { trafficFactor: 2 });
    assert.equal(cached.findRoute(g, 0, 899).fromCache, undefined);
    assert.equal(cached.stats.hits, 1);
    assert.equal(cached.stats.misses, 2);
  });
});

describe("Observer + Command: re-enrutamiento y deshacer", () => {
  test("cerrar una vía de la ruta dispara el re-enrutamiento y la evita", () => {
    const engine = new RouteEngine(city());
    const s = engine.startNavigation(0, 899);
    const blocked = s.remainingEdgeIds[3];
    const before = s.remainingCost;
    engine.blockRoad(blocked);
    assert.equal(s.reroutes.length, 1);
    assert.ok(!s.remainingEdgeIds.includes(blocked));
    assert.ok(s.remainingCost >= before - 1e-6, "la ruta alternativa no puede ser más rápida");
  });

  test("deshacer el cierre restaura la vía y la ruta óptima", () => {
    const engine = new RouteEngine(city());
    const s = engine.startNavigation(0, 899);
    const original = s.remainingCost;
    const edgeId = s.remainingEdgeIds[3];
    engine.blockRoad(edgeId);
    engine.undo();
    assert.equal(engine.graph.getEdge(edgeId)!.blocked, false);
    assert.ok(Math.abs(s.remainingCost - original) < 1e-6);
  });

  test("avanzar y deshacer mueve la ambulancia", () => {
    const engine = new RouteEngine(city());
    const s = engine.startNavigation(0, 899);
    const next = s.remainingPath[1];
    engine.advance(s.id);
    assert.equal(s.current, next);
    engine.undo();
    assert.equal(s.current, 0);
  });

  test("la sesión llega al destino y cambia a ARRIVED", () => {
    const engine = new RouteEngine(city());
    const s = engine.startNavigation(0, 65);
    while (s.state === "NAVIGATING") engine.advance(s.id);
    assert.equal(s.state, "ARRIVED");
    assert.equal(s.current, 65);
  });

  test("la bitácora registra los comandos", () => {
    const engine = new RouteEngine(city());
    const s = engine.startNavigation(0, 899);
    engine.setCongestion(s.remainingEdgeIds[0], 3);
    engine.undo();
    assert.deepEqual(engine.invoker.log.map((l) => l.action), ["execute", "undo"]);
  });
});

describe("Composite + Iterator: instrucciones giro a giro", () => {
  test("la duración del árbol coincide con el costo de la búsqueda", () => {
    const g = city();
    const r = new AStarStrategy().findRoute(g, 0, 899);
    const route = Route.fromEdges(g, r.edges);
    assert.ok(Math.abs(route.getDuration() - r.cost) < 1e-6);
    assert.ok(Math.abs(route.getDistance() - r.distance) < 1e-6);
    assert.equal(route.getSegments().length, r.edges.length);
  });

  test("el iterador empieza con 'Salga por' y termina en llegada", () => {
    const g = city();
    const steps = [...Route.fromEdges(g, new AStarStrategy().findRoute(g, 0, 899).edges)];
    assert.equal(steps[0].maneuver, "start");
    assert.equal(steps.at(-1)!.maneuver, "arrive");
    assert.ok(steps.slice(1, -1).every((s) => ["left", "right", "straight"].includes(s.maneuver)));
  });
});
