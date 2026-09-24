import { Graph } from "../domain/Graph.js";
import { TrafficService } from "../traffic/TrafficService.js";
import { NavigationSession } from "../navigation/NavigationSession.js";

/**
 * PATRÓN COMMAND — cada acción sobre el sistema es un objeto con execute/undo.
 * Beneficios: deshacer, bitácora auditable (quién cerró qué vía y cuándo) y
 * posibilidad de reproducir un incidente completo para análisis.
 */
export interface Command {
  readonly label: string;
  execute(): void;
  undo(): void;
}

export class BlockRoadCommand implements Command {
  readonly label: string;
  private previous?: { blocked: boolean; trafficFactor: number };

  constructor(private readonly graph: Graph, private readonly traffic: TrafficService, private readonly edgeId: string) {
    const e = graph.getEdge(edgeId);
    this.label = `Cerrar vía ${e?.street ?? edgeId}`;
  }
  execute(): void {
    const e = this.graph.getEdge(this.edgeId)!;
    this.previous = { blocked: e.blocked, trafficFactor: e.trafficFactor };
    this.traffic.blockRoad(this.edgeId);
  }
  undo(): void {
    if (this.previous) this.traffic.restore(this.edgeId, this.previous);
  }
}

export class CongestionCommand implements Command {
  readonly label: string;
  private previous?: { blocked: boolean; trafficFactor: number };

  constructor(private readonly graph: Graph, private readonly traffic: TrafficService, private readonly edgeId: string, private readonly factor: number) {
    const e = graph.getEdge(edgeId);
    this.label = `Congestión x${factor} en ${e?.street ?? edgeId}`;
  }
  execute(): void {
    const e = this.graph.getEdge(this.edgeId)!;
    this.previous = { blocked: e.blocked, trafficFactor: e.trafficFactor };
    this.traffic.setCongestion(this.edgeId, this.factor);
  }
  undo(): void {
    if (this.previous) this.traffic.restore(this.edgeId, this.previous);
  }
}

export class AdvanceCommand implements Command {
  readonly label = "Avanzar una intersección";
  private moved = false;

  constructor(private readonly session: NavigationSession) {}
  execute(): void {
    this.moved = this.session.advance();
  }
  undo(): void {
    if (this.moved) this.session.retreat();
  }
}

export interface LogEntry {
  label: string;
  action: "execute" | "undo";
  at: string;
}

/** Invocador: ejecuta comandos, guarda historial y bitácora. */
export class CommandInvoker {
  private readonly history: Command[] = [];
  readonly log: LogEntry[] = [];

  run(cmd: Command): void {
    cmd.execute();
    this.history.push(cmd);
    this.log.push({ label: cmd.label, action: "execute", at: new Date().toISOString() });
  }

  undo(): Command | undefined {
    const cmd = this.history.pop();
    if (cmd) {
      cmd.undo();
      this.log.push({ label: cmd.label, action: "undo", at: new Date().toISOString() });
    }
    return cmd;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }
}
