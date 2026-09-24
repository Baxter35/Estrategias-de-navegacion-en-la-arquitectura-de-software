import { Graph, Edge } from "../domain/Graph.js";

/**
 * PATRÓN OBSERVER — TrafficService es el sujeto. Cuando cambia el estado de una vía,
 * notifica a todos los suscriptores (sesiones de navegación, panel web, métricas)
 * sin conocer sus clases concretas: bajo acoplamiento y re-enrutamiento automático.
 */
export type TrafficEventType = "blocked" | "congestion" | "cleared";

export interface TrafficEvent {
  type: TrafficEventType;
  edges: Edge[];
  trafficFactor?: number;
  at: number;
}

export interface TrafficObserver {
  onTrafficUpdate(event: TrafficEvent): void;
}

export class TrafficService {
  private readonly observers = new Set<TrafficObserver>();

  constructor(private readonly graph: Graph) {}

  subscribe(observer: TrafficObserver): () => void {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }

  get observerCount(): number {
    return this.observers.size;
  }

  blockRoad(edgeId: string): TrafficEvent {
    return this.apply("blocked", this.graph.updateEdge(edgeId, { blocked: true }));
  }

  setCongestion(edgeId: string, trafficFactor: number): TrafficEvent {
    return this.apply("congestion", this.graph.updateEdge(edgeId, { trafficFactor }), trafficFactor);
  }

  /** Restaura un estado previo exacto (lo usa el Command para deshacer). */
  restore(edgeId: string, state: Pick<Edge, "blocked" | "trafficFactor">): TrafficEvent {
    return this.apply("cleared", this.graph.updateEdge(edgeId, state));
  }

  private apply(type: TrafficEventType, edges: Edge[], trafficFactor?: number): TrafficEvent {
    const event: TrafficEvent = { type, edges, trafficFactor, at: Date.now() };
    for (const o of this.observers) o.onTrafficUpdate(event);
    return event;
  }
}
