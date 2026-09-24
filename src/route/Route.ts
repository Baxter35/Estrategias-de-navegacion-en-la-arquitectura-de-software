import { Graph, Edge } from "../domain/Graph.js";

/**
 * PATRÓN COMPOSITE — una ruta es un árbol:
 *   Route (compuesto) → StreetLeg (compuesto, tramos seguidos por la misma vía) → Segment (hoja).
 * El cliente pide distancia o duración a cualquier nivel con la misma interfaz.
 */
export interface RouteComponent {
  getDistance(): number;
  getDuration(): number;
  getSegments(): Segment[];
}

export class Segment implements RouteComponent {
  constructor(readonly edge: Edge, private readonly duration: number) {}
  getDistance(): number {
    return this.edge.length;
  }
  getDuration(): number {
    return this.duration;
  }
  getSegments(): Segment[] {
    return [this];
  }
}

abstract class CompositeComponent implements RouteComponent {
  protected readonly children: RouteComponent[] = [];
  add(child: RouteComponent): void {
    this.children.push(child);
  }
  getDistance(): number {
    return this.children.reduce((s, c) => s + c.getDistance(), 0);
  }
  getDuration(): number {
    return this.children.reduce((s, c) => s + c.getDuration(), 0);
  }
  getSegments(): Segment[] {
    return this.children.flatMap((c) => c.getSegments());
  }
}

export class StreetLeg extends CompositeComponent {
  constructor(readonly street: string) {
    super();
  }
}

export interface Instruction {
  step: number;
  text: string;
  street: string;
  distance: number; // metros
  duration: number; // segundos
  maneuver: "start" | "left" | "right" | "straight" | "arrive";
}

export class Route extends CompositeComponent implements Iterable<Instruction> {
  constructor(private readonly graph: Graph) {
    super();
  }

  get legs(): StreetLeg[] {
    return this.children as StreetLeg[];
  }

  /** Construye el árbol agrupando tramos consecutivos de la misma vía. */
  static fromEdges(graph: Graph, edges: Edge[]): Route {
    const route = new Route(graph);
    let leg: StreetLeg | undefined;
    for (const e of edges) {
      if (!leg || leg.street !== e.street) {
        leg = new StreetLeg(e.street);
        route.add(leg);
      }
      leg.add(new Segment(e, graph.cost(e)));
    }
    return route;
  }

  /** PATRÓN ITERATOR — recorre la ruta giro a giro sin exponer su estructura interna. */
  [Symbol.iterator](): Iterator<Instruction> {
    return new TurnByTurnIterator(this.graph, this.legs);
  }
}

class TurnByTurnIterator implements Iterator<Instruction> {
  private index = 0;
  private arrived = false;

  constructor(private readonly graph: Graph, private readonly legs: StreetLeg[]) {}

  next(): IteratorResult<Instruction> {
    if (this.index < this.legs.length) {
      const leg = this.legs[this.index];
      const maneuver = this.index === 0 ? "start" : this.turn(this.legs[this.index - 1], leg);
      const verb = { start: "Salga por", left: "Gire a la izquierda en", right: "Gire a la derecha en", straight: "Continúe por", arrive: "" }[maneuver];
      const meters = Math.round(leg.getDistance());
      this.index++;
      return {
        done: false,
        value: {
          step: this.index,
          text: `${verb} ${leg.street} durante ${meters} m`,
          street: leg.street,
          distance: leg.getDistance(),
          duration: leg.getDuration(),
          maneuver,
        },
      };
    }
    if (!this.arrived && this.legs.length) {
      this.arrived = true;
      return {
        done: false,
        value: { step: this.index + 1, text: "Llegada al destino", street: "", distance: 0, duration: 0, maneuver: "arrive" },
      };
    }
    return { done: true, value: undefined };
  }

  /** Producto cruz entre el último tramo de una vía y el primero de la siguiente.
   *  El eje y crece hacia abajo (como en pantalla), así que cruz > 0 es giro a la derecha. */
  private turn(a: StreetLeg, b: StreetLeg): Instruction["maneuver"] {
    const ea = a.getSegments().at(-1)!.edge;
    const eb = b.getSegments()[0].edge;
    const n = (id: number) => this.graph.nodes.get(id)!;
    const ax = n(ea.to).x - n(ea.from).x;
    const ay = n(ea.to).y - n(ea.from).y;
    const bx = n(eb.to).x - n(eb.from).x;
    const by = n(eb.to).y - n(eb.from).y;
    const cross = ax * by - ay * bx;
    const sin = cross / (Math.hypot(ax, ay) * Math.hypot(bx, by));
    if (Math.abs(sin) < 0.35) return "straight";
    return sin > 0 ? "right" : "left";
  }
}
