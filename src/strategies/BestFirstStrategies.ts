import { Graph, Edge } from "../domain/Graph.js";
import { MinHeap } from "../util/MinHeap.js";
import { RouteStrategy, SearchOptions, SearchResult, buildResult } from "./RouteStrategy.js";

/**
 * Búsqueda de primero el mejor. Usa TEMPLATE METHOD: el algoritmo es fijo y
 * cada subclase solo define su heurística h(n).
 *  - Dijkstra: h(n) = 0  → explora en todas las direcciones.
 *  - A*:       h(n) = distancia en línea recta / velocidad máxima → se dirige al destino.
 */
abstract class BestFirstStrategy implements RouteStrategy {
  abstract readonly name: string;
  protected abstract heuristic(graph: Graph, node: number, target: number): number;

  findRoute(graph: Graph, from: number, to: number, options: SearchOptions = {}): SearchResult {
    const start = performance.now();
    const dist = new Map<number, number>([[from, 0]]);
    const prev = new Map<number, Edge>();
    const closed = new Set<number>();
    const explored: number[] | undefined = options.recordExploration ? [] : undefined;
    const heap = new MinHeap<number>();
    heap.push(from, this.heuristic(graph, from, to));
    let expanded = 0;

    while (heap.size) {
      const { value: u } = heap.pop()!;
      if (closed.has(u)) continue;
      closed.add(u);
      expanded++;
      explored?.push(u);
      if (u === to) break;

      const du = dist.get(u)!;
      for (const e of graph.outgoing(u)) {
        const c = graph.cost(e);
        if (c === Infinity || closed.has(e.to)) continue;
        const nd = du + c;
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd);
          prev.set(e.to, e);
          heap.push(e.to, nd + this.heuristic(graph, e.to, to));
        }
      }
    }
    return buildResult(this.name, prev, from, to, dist.get(to) ?? Infinity, expanded, start, explored);
  }
}

export class DijkstraStrategy extends BestFirstStrategy {
  readonly name = "dijkstra";
  protected heuristic(): number {
    return 0;
  }
}

export class AStarStrategy extends BestFirstStrategy {
  readonly name = "astar";
  /** Admisible: nadie puede ir más rápido que la vía más rápida sin tráfico. */
  protected heuristic(graph: Graph, node: number, target: number): number {
    return graph.distance(node, target) / graph.maxSpeedMs;
  }
}
