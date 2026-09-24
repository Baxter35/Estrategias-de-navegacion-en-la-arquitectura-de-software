import { Graph, Edge } from "../domain/Graph.js";
import { MinHeap } from "../util/MinHeap.js";
import { RouteStrategy, SearchOptions, SearchResult } from "./RouteStrategy.js";

/**
 * Dijkstra bidireccional: dos búsquedas simultáneas (desde el origen y desde el destino
 * sobre las aristas inversas) que se encuentran a mitad de camino.
 * No necesita heurística geométrica, útil cuando el costo no es proporcional a la distancia.
 */
export class BidirectionalStrategy implements RouteStrategy {
  readonly name = "bidirectional";

  findRoute(graph: Graph, from: number, to: number, options: SearchOptions = {}): SearchResult {
    const start = performance.now();
    const explored: number[] | undefined = options.recordExploration ? [] : undefined;
    if (from === to) {
      return { algorithm: this.name, found: true, path: [from], edges: [], cost: 0, distance: 0, expanded: 0, timeMs: 0, explored };
    }

    const distF = new Map<number, number>([[from, 0]]);
    const distB = new Map<number, number>([[to, 0]]);
    const prevF = new Map<number, Edge>();
    const nextB = new Map<number, Edge>();
    const closedF = new Set<number>();
    const closedB = new Set<number>();
    const heapF = new MinHeap<number>();
    const heapB = new MinHeap<number>();
    heapF.push(from, 0);
    heapB.push(to, 0);

    let best = Infinity;
    let meet = -1;
    let expanded = 0;

    while (heapF.size && heapB.size) {
      if (heapF.peekKey() + heapB.peekKey() >= best) break; // criterio de parada óptimo

      const forward = heapF.size <= heapB.size;
      const heap = forward ? heapF : heapB;
      const dist = forward ? distF : distB;
      const other = forward ? distB : distF;
      const closed = forward ? closedF : closedB;

      const { value: u } = heap.pop()!;
      if (closed.has(u)) continue;
      closed.add(u);
      expanded++;
      explored?.push(u);

      const du = dist.get(u)!;
      const edges = forward ? graph.outgoing(u) : graph.incoming(u);
      for (const e of edges) {
        const c = graph.cost(e);
        if (c === Infinity) continue;
        const v = forward ? e.to : e.from;
        const nd = du + c;
        if (nd < (dist.get(v) ?? Infinity)) {
          dist.set(v, nd);
          (forward ? prevF : nextB).set(v, e);
          heap.push(v, nd);
        }
        const ov = other.get(v);
        if (ov !== undefined && dist.get(v)! + ov < best) {
          best = dist.get(v)! + ov;
          meet = v;
        }
      }
    }

    const timeMs = () => performance.now() - start;
    if (meet < 0) {
      return { algorithm: this.name, found: false, path: [], edges: [], cost: Infinity, distance: 0, expanded, timeMs: timeMs(), explored };
    }

    const edges: Edge[] = [];
    for (let cur = meet; cur !== from; ) {
      const e = prevF.get(cur)!;
      edges.unshift(e);
      cur = e.from;
    }
    for (let cur = meet; cur !== to; ) {
      const e = nextB.get(cur)!;
      edges.push(e);
      cur = e.to;
    }
    const path = [from, ...edges.map((e) => e.to)];
    const distance = edges.reduce((s, e) => s + e.length, 0);
    return { algorithm: this.name, found: true, path, edges, cost: best, distance, expanded, timeMs: timeMs(), explored };
  }
}
