import { Graph } from "../domain/Graph.js";
import { RouteStrategy, SearchOptions, SearchResult } from "../strategies/RouteStrategy.js";

/**
 * PATRÓN DECORATOR — agrega caché LRU a CUALQUIER estrategia sin modificarla.
 * La clave incluye graph.version: cuando cambia el tráfico, las entradas viejas
 * dejan de coincidir y se invalidan solas (sin recorrer la caché).
 */
export class CachedRouteStrategy implements RouteStrategy {
  readonly name: string;
  private readonly cache = new Map<string, SearchResult>();
  hits = 0;
  misses = 0;

  constructor(private readonly inner: RouteStrategy, private readonly capacity = 500) {
    this.name = inner.name;
  }

  findRoute(graph: Graph, from: number, to: number, options: SearchOptions = {}): SearchResult {
    // Las búsquedas que piden la animación no se cachean (necesitan los nodos explorados).
    if (options.recordExploration) return this.inner.findRoute(graph, from, to, options);

    const key = `${from}>${to}@v${graph.version}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.hits++;
      this.cache.delete(key); // reinserta para mantener el orden LRU
      this.cache.set(key, cached);
      return { ...cached, fromCache: true, timeMs: 0 };
    }
    this.misses++;
    const result = this.inner.findRoute(graph, from, to, options);
    this.cache.set(key, result);
    if (this.cache.size > this.capacity) {
      this.cache.delete(this.cache.keys().next().value!); // expulsa la menos usada
    }
    return result;
  }

  get stats() {
    const total = this.hits + this.misses;
    return { hits: this.hits, misses: this.misses, size: this.cache.size, hitRate: total ? this.hits / total : 0 };
  }
}
