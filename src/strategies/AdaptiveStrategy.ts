import { Graph } from "../domain/Graph.js";
import { RouteStrategy, SearchOptions, SearchResult } from "./RouteStrategy.js";
import { AStarStrategy, DijkstraStrategy } from "./BestFirstStrategies.js";
import { BidirectionalStrategy } from "./BidirectionalStrategy.js";

/**
 * APORTE INNOVADOR — Strategy que elige otra Strategy en tiempo de ejecución.
 * Las reglas salen de los resultados del benchmark (ver results/benchmark.md):
 *  1. Viaje corto (< 600 m en línea recta): Dijkstra; la heurística no compensa su costo.
 *  2. Existe heurística geométrica confiable: A*, que expande muchos menos nodos.
 *  3. Si no (p. ej. se optimiza por consumo y no por tiempo): Dijkstra bidireccional.
 */
export class AdaptiveStrategy implements RouteStrategy {
  readonly name = "adaptive";
  lastDecision = "";

  constructor(
    private readonly strategies = {
      dijkstra: new DijkstraStrategy(),
      astar: new AStarStrategy(),
      bidirectional: new BidirectionalStrategy(),
    },
    private readonly shortTripMeters = 600,
    private readonly geometricHeuristic = true,
  ) {}

  select(graph: Graph, from: number, to: number): RouteStrategy {
    const straight = graph.distance(from, to);
    if (straight < this.shortTripMeters) {
      this.lastDecision = `Viaje corto (${Math.round(straight)} m): Dijkstra`;
      return this.strategies.dijkstra;
    }
    if (this.geometricHeuristic) {
      this.lastDecision = `Viaje de ${Math.round(straight)} m con heurística geométrica: A*`;
      return this.strategies.astar;
    }
    this.lastDecision = "Sin heurística disponible: Dijkstra bidireccional";
    return this.strategies.bidirectional;
  }

  findRoute(graph: Graph, from: number, to: number, options?: SearchOptions): SearchResult {
    const chosen = this.select(graph, from, to);
    const result = chosen.findRoute(graph, from, to, options);
    return { ...result, algorithm: `adaptive→${chosen.name}` };
  }
}

/** Registro de estrategias disponibles (el cliente las pide por nombre). */
export function createStrategyRegistry(): Map<string, RouteStrategy> {
  const dijkstra = new DijkstraStrategy();
  const astar = new AStarStrategy();
  const bidirectional = new BidirectionalStrategy();
  return new Map<string, RouteStrategy>([
    ["dijkstra", dijkstra],
    ["astar", astar],
    ["bidirectional", bidirectional],
    ["adaptive", new AdaptiveStrategy({ dijkstra, astar, bidirectional })],
  ]);
}
