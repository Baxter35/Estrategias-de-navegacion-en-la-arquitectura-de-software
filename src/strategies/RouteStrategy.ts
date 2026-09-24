import { Graph, Edge } from "../domain/Graph.js";

/**
 * PATRÓN STRATEGY — interfaz común para todos los algoritmos de búsqueda de rutas.
 * El motor de rutas depende de esta abstracción, no de un algoritmo concreto (DIP),
 * lo que permite agregar o cambiar algoritmos sin modificar al cliente (OCP).
 */
export interface SearchOptions {
  /** Guarda el orden en que se exploran los nodos (para la animación del prototipo). */
  recordExploration?: boolean;
}

export interface SearchResult {
  algorithm: string;
  found: boolean;
  path: number[]; // secuencia de nodos
  edges: Edge[]; // secuencia de tramos
  cost: number; // tiempo estimado en segundos
  distance: number; // metros
  expanded: number; // nodos expandidos (métrica de eficiencia)
  timeMs: number;
  explored?: number[];
  fromCache?: boolean;
}

export interface RouteStrategy {
  readonly name: string;
  findRoute(graph: Graph, from: number, to: number, options?: SearchOptions): SearchResult;
}

/** Reconstruye el camino a partir del mapa de predecesores. */
export function buildResult(
  algorithm: string,
  prev: Map<number, Edge>,
  from: number,
  to: number,
  cost: number,
  expanded: number,
  start: number,
  explored?: number[],
): SearchResult {
  const timeMs = performance.now() - start;
  if (!Number.isFinite(cost)) {
    return { algorithm, found: false, path: [], edges: [], cost: Infinity, distance: 0, expanded, timeMs, explored };
  }
  const edges: Edge[] = [];
  let cur = to;
  while (cur !== from) {
    const e = prev.get(cur)!;
    edges.push(e);
    cur = e.from;
  }
  edges.reverse();
  const path = [from, ...edges.map((e) => e.to)];
  const distance = edges.reduce((s, e) => s + e.length, 0);
  return { algorithm, found: true, path, edges, cost, distance, expanded, timeMs, explored };
}
