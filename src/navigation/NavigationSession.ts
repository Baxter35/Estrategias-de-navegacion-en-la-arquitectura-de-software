import { Graph } from "../domain/Graph.js";
import { RouteStrategy, SearchResult } from "../strategies/RouteStrategy.js";
import { TrafficEvent, TrafficObserver } from "../traffic/TrafficService.js";
import { Route, Instruction } from "../route/Route.js";

/** Estados de la navegación (ver docs/uml/state.puml). */
export type NavigationState = "IDLE" | "CALCULATING" | "NAVIGATING" | "REROUTING" | "ARRIVED" | "NO_ROUTE";

export interface RerouteInfo {
  sessionId: string;
  reason: string;
  latencyMs: number;
  previousCost: number;
  newCost: number;
  expanded: number;
  algorithm: string;
}

export interface SessionListener {
  onStateChange?(session: NavigationSession): void;
  onReroute?(session: NavigationSession, info: RerouteInfo): void;
}

/**
 * Observador concreto del tráfico. Cada ambulancia en ruta es una sesión:
 * si un evento afecta un tramo que aún no recorre, recalcula desde su posición actual.
 */
export class NavigationSession implements TrafficObserver {
  state: NavigationState = "IDLE";
  current: number;
  traveled: number[] = [];
  result?: SearchResult;
  readonly reroutes: RerouteInfo[] = [];
  private readonly listeners = new Set<SessionListener>();

  constructor(
    readonly id: string,
    private readonly graph: Graph,
    private readonly strategy: RouteStrategy,
    readonly origin: number,
    readonly destination: number,
  ) {
    this.current = origin;
  }

  addListener(l: SessionListener): void {
    this.listeners.add(l);
  }

  start(): SearchResult | undefined {
    this.setState("CALCULATING");
    this.traveled = [this.origin];
    this.result = this.strategy.findRoute(this.graph, this.origin, this.destination);
    this.setState(this.result.found ? "NAVIGATING" : "NO_ROUTE");
    return this.result;
  }

  /** Nodos que faltan por recorrer (incluye la posición actual). */
  get remainingPath(): number[] {
    if (!this.result?.found) return [];
    const i = this.result.path.indexOf(this.current);
    return i >= 0 ? this.result.path.slice(i) : [];
  }

  get remainingEdgeIds(): string[] {
    const p = this.remainingPath;
    return p.slice(1).map((to, i) => `${p[i]}-${to}`);
  }

  get remainingCost(): number {
    return this.remainingEdgeIds.reduce((s, id) => s + this.graph.cost(this.graph.getEdge(id)!), 0);
  }

  instructions(): Instruction[] {
    const ids = this.remainingEdgeIds;
    return [...Route.fromEdges(this.graph, ids.map((id) => this.graph.getEdge(id)!))];
  }

  /** Avanza una intersección. Devuelve false si no hay a dónde avanzar. */
  advance(): boolean {
    if (this.state !== "NAVIGATING") return false;
    const next = this.remainingPath[1];
    if (next === undefined) return false;
    this.current = next;
    this.traveled.push(next);
    if (this.current === this.destination) this.setState("ARRIVED");
    else this.notifyState();
    return true;
  }

  /** Retrocede una intersección (usado por el Command para deshacer). */
  retreat(): void {
    if (this.traveled.length < 2) return;
    this.traveled.pop();
    this.current = this.traveled.at(-1)!;
    this.recalculate("Deshacer avance");
  }

  onTrafficUpdate(event: TrafficEvent): void {
    if (this.state !== "NAVIGATING") return;
    const remaining = new Set(this.remainingEdgeIds);
    const hitsRoute = event.edges.some((e) => remaining.has(e.id));

    if (event.type === "blocked" && hitsRoute) {
      this.recalculate(`Vía cerrada en ${event.edges[0].street}`);
    } else if (event.type === "congestion" && hitsRoute) {
      this.recalculate(`Congestión x${event.trafficFactor} en ${event.edges[0].street}`, true);
    } else if (event.type === "cleared") {
      this.recalculate(`Vía habilitada en ${event.edges[0].street}`, true);
    }
  }

  /** Recalcula desde la posición actual. Si onlyIfBetter, conserva la ruta si la nueva no mejora. */
  private recalculate(reason: string, onlyIfBetter = false): void {
    const t0 = performance.now();
    // Costo que tenía la ruta vigente sin contar cierres: permite medir cuánto cuesta el desvío
    const previousCost = this.remainingEdgeIds.reduce((s, id) => s + this.graph.nominalCost(this.graph.getEdge(id)!), 0);
    this.setState("REROUTING");
    const candidate = this.strategy.findRoute(this.graph, this.current, this.destination);
    const latencyMs = performance.now() - t0;

    if (!candidate.found) {
      this.setState("NO_ROUTE");
      return;
    }
    if (onlyIfBetter && candidate.cost >= previousCost - 1e-6) {
      this.setState("NAVIGATING");
      return;
    }
    // Conserva el tramo ya recorrido y reemplaza el resto por la nueva ruta
    const t = this.traveled;
    const traveledEdges = t.slice(1).map((to, i) => this.graph.getEdge(`${t[i]}-${to}`)!);
    const edges = [...traveledEdges, ...candidate.edges];
    this.result = { ...candidate, path: [...this.traveled.slice(0, -1), ...candidate.path], edges };
    const info: RerouteInfo = {
      sessionId: this.id,
      reason,
      latencyMs,
      previousCost,
      newCost: candidate.cost,
      expanded: candidate.expanded,
      algorithm: candidate.algorithm,
    };
    this.reroutes.push(info);
    this.setState("NAVIGATING");
    for (const l of this.listeners) l.onReroute?.(this, info);
  }

  private setState(s: NavigationState): void {
    this.state = s;
    this.notifyState();
  }

  private notifyState(): void {
    for (const l of this.listeners) l.onStateChange?.(this);
  }
}
