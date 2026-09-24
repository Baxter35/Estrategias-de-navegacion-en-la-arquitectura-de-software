import { Graph } from "../domain/Graph.js";
import { createStrategyRegistry } from "../strategies/AdaptiveStrategy.js";
import { RouteStrategy, SearchResult } from "../strategies/RouteStrategy.js";
import { CachedRouteStrategy } from "../cache/CachedRouteStrategy.js";
import { TrafficService } from "../traffic/TrafficService.js";
import { NavigationSession, SessionListener } from "../navigation/NavigationSession.js";
import { AdvanceCommand, BlockRoadCommand, CommandInvoker, CongestionCommand } from "../commands/Commands.js";
import { Route } from "../route/Route.js";

/**
 * FACHADA del sistema: punto único de entrada para la API HTTP y las pruebas.
 * Ensambla las piezas: estrategias (Strategy) envueltas en caché (Decorator),
 * servicio de tráfico (Observer), sesiones y el invocador de comandos (Command).
 */
export class RouteEngine {
  readonly traffic: TrafficService;
  readonly invoker = new CommandInvoker();
  readonly sessions = new Map<string, NavigationSession>();
  private readonly strategies = new Map<string, CachedRouteStrategy>();
  private readonly raw: Map<string, RouteStrategy>;
  private seq = 0;

  constructor(readonly graph: Graph, private readonly sessionListener?: SessionListener) {
    this.traffic = new TrafficService(graph);
    this.raw = createStrategyRegistry();
    for (const [name, s] of this.raw) this.strategies.set(name, new CachedRouteStrategy(s));
  }

  get algorithms(): string[] {
    return [...this.raw.keys()];
  }

  private strategy(name: string): CachedRouteStrategy {
    const s = this.strategies.get(name);
    if (!s) throw new Error(`Algoritmo desconocido: ${name}. Use: ${this.algorithms.join(", ")}`);
    return s;
  }

  findRoute(from: number, to: number, algorithm = "adaptive", animate = false) {
    this.assertNode(from);
    this.assertNode(to);
    const result = this.strategy(algorithm).findRoute(this.graph, from, to, { recordExploration: animate });
    return { ...result, instructions: this.instructionsFor(result) };
  }

  /** Ejecuta todos los algoritmos sin caché sobre el mismo viaje: base del análisis comparativo. */
  compare(from: number, to: number): SearchResult[] {
    this.assertNode(from);
    this.assertNode(to);
    return [...this.raw.values()].map((s) => {
      const r = s.findRoute(this.graph, from, to);
      return { ...r, edges: [], path: [] };
    });
  }

  startNavigation(from: number, to: number, algorithm = "adaptive"): NavigationSession {
    this.assertNode(from);
    this.assertNode(to);
    const session = new NavigationSession(`amb-${++this.seq}`, this.graph, this.strategy(algorithm), from, to);
    if (this.sessionListener) session.addListener(this.sessionListener);
    this.traffic.subscribe(session);
    this.sessions.set(session.id, session);
    session.start();
    return session;
  }

  advance(sessionId: string): NavigationSession {
    const s = this.session(sessionId);
    this.invoker.run(new AdvanceCommand(s));
    return s;
  }

  blockRoad(edgeId: string): void {
    this.assertEdge(edgeId);
    this.invoker.run(new BlockRoadCommand(this.graph, this.traffic, edgeId));
  }

  setCongestion(edgeId: string, factor: number): void {
    this.assertEdge(edgeId);
    this.invoker.run(new CongestionCommand(this.graph, this.traffic, edgeId, factor));
  }

  undo(): string | undefined {
    return this.invoker.undo()?.label;
  }

  session(id: string): NavigationSession {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`No existe la sesión ${id}`);
    return s;
  }

  instructionsFor(result: SearchResult) {
    return result.found ? [...Route.fromEdges(this.graph, result.edges)] : [];
  }

  metrics() {
    const cache = Object.fromEntries([...this.strategies].map(([n, s]) => [n, s.stats]));
    const reroutes = [...this.sessions.values()].flatMap((s) => s.reroutes);
    const lat = reroutes.map((r) => r.latencyMs);
    return {
      graph: { nodes: this.graph.size, edges: this.graph.edgeCount, version: this.graph.version },
      cache,
      reroutes: {
        count: reroutes.length,
        avgLatencyMs: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0,
        maxLatencyMs: lat.length ? Math.max(...lat) : 0,
      },
      observers: this.traffic.observerCount,
      commandLog: this.invoker.log.slice(-20),
    };
  }

  private assertNode(id: number): void {
    if (!this.graph.nodes.has(id)) throw new Error(`El nodo ${id} no existe`);
  }
  private assertEdge(id: string): void {
    if (!this.graph.getEdge(id)) throw new Error(`La vía ${id} no existe`);
  }
}
