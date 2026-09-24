/**
 * Modelo de la red vial como grafo dirigido y ponderado.
 * El costo de cada arista es el TIEMPO de recorrido en segundos, afectado por el tráfico.
 */
export interface GraphNode {
  id: number;
  x: number; // metros
  y: number; // metros
}

export interface Edge {
  id: string; // "desde-hasta"
  from: number;
  to: number;
  length: number; // metros
  speedKmh: number; // velocidad máxima de la vía
  street: string;
  trafficFactor: number; // 1 = libre, 3 = muy congestionada
  blocked: boolean; // cierre vial / accidente
}

export type EdgeInput = Pick<Edge, "from" | "to" | "length" | "speedKmh" | "street"> &
  Partial<Pick<Edge, "trafficFactor" | "blocked">>;

export class Graph {
  readonly nodes = new Map<number, GraphNode>();
  private readonly out = new Map<number, Edge[]>();
  private readonly inc = new Map<number, Edge[]>();
  private readonly edgesById = new Map<string, Edge>();
  /** Se incrementa con cada cambio de tráfico: permite invalidar cachés sin recorrerlas. */
  private _version = 0;
  private _maxSpeedMs = 0;

  get version(): number {
    return this._version;
  }
  get size(): number {
    return this.nodes.size;
  }
  get edgeCount(): number {
    return this.edgesById.size;
  }
  /** Velocidad máxima de la red (m/s), usada por la heurística admisible de A*. */
  get maxSpeedMs(): number {
    return this._maxSpeedMs;
  }

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    this.out.set(node.id, []);
    this.inc.set(node.id, []);
  }

  addEdge(e: EdgeInput): Edge {
    const edge: Edge = { trafficFactor: 1, blocked: false, ...e, id: `${e.from}-${e.to}` };
    this.out.get(edge.from)!.push(edge);
    this.inc.get(edge.to)!.push(edge);
    this.edgesById.set(edge.id, edge);
    this._maxSpeedMs = Math.max(this._maxSpeedMs, edge.speedKmh / 3.6);
    return edge;
  }

  addTwoWay(a: number, b: number, speedKmh: number, street: string): void {
    const length = this.distance(a, b);
    this.addEdge({ from: a, to: b, length, speedKmh, street });
    this.addEdge({ from: b, to: a, length, speedKmh, street });
  }

  outgoing(id: number): Edge[] {
    return this.out.get(id) ?? [];
  }
  incoming(id: number): Edge[] {
    return this.inc.get(id) ?? [];
  }
  getEdge(id: string): Edge | undefined {
    return this.edgesById.get(id);
  }
  edges(): IterableIterator<Edge> {
    return this.edgesById.values();
  }

  /** Tiempo de recorrido en segundos. Infinity si la vía está cerrada. */
  cost(e: Edge): number {
    if (e.blocked) return Infinity;
    return (e.length / (e.speedKmh / 3.6)) * e.trafficFactor;
  }

  /** Tiempo de recorrido ignorando cierres (qué habría costado la vía sin el incidente). */
  nominalCost(e: Edge): number {
    return (e.length / (e.speedKmh / 3.6)) * e.trafficFactor;
  }

  distance(a: number, b: number): number {
    const p = this.nodes.get(a)!;
    const q = this.nodes.get(b)!;
    return Math.hypot(p.x - q.x, p.y - q.y);
  }

  /** Cambia el estado de una vía (y de su sentido contrario). Devuelve las aristas afectadas. */
  updateEdge(edgeId: string, patch: Partial<Pick<Edge, "blocked" | "trafficFactor">>, bothWays = true): Edge[] {
    const affected: Edge[] = [];
    const e = this.edgesById.get(edgeId);
    if (!e) return affected;
    Object.assign(e, patch);
    affected.push(e);
    if (bothWays) {
      const rev = this.edgesById.get(`${e.to}-${e.from}`);
      if (rev) {
        Object.assign(rev, patch);
        affected.push(rev);
      }
    }
    this._version++;
    return affected;
  }
}
