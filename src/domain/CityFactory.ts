import { Graph } from "./Graph.js";
import { seededRandom } from "../util/Random.js";

export interface CityOptions {
  rows: number;
  cols: number;
  blockSize?: number; // metros entre intersecciones
  seed?: number;
  removedStreetRatio?: number; // tramos eliminados para que la malla no sea perfecta
}

/**
 * Genera una ciudad sintética reproducible: malla de calles y carreras con
 * avenidas rápidas cada 5 cuadras, tramos faltantes y congestión base aleatoria.
 * Permite escalar el grafo (900, 10.000, 90.000 nodos) para las pruebas de escalabilidad.
 */
export function createCity(opts: CityOptions): Graph {
  const { rows, cols, blockSize = 100, seed = 42, removedStreetRatio = 0.06 } = opts;
  const rnd = seededRandom(seed);
  const g = new Graph();
  const id = (r: number, c: number) => r * cols + c;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jitter = blockSize * 0.18;
      g.addNode({
        id: id(r, c),
        x: c * blockSize + (rnd() - 0.5) * jitter,
        y: r * blockSize + (rnd() - 0.5) * jitter,
      });
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) {
        const avenue = r % 5 === 0;
        if (avenue || rnd() > removedStreetRatio) {
          g.addTwoWay(id(r, c), id(r, c + 1), avenue ? 60 : 30, avenue ? `Avenida ${r / 5 + 1}` : `Calle ${r + 1}`);
        }
      }
      if (r + 1 < rows) {
        const avenue = c % 5 === 0;
        if (avenue || rnd() > removedStreetRatio) {
          g.addTwoWay(id(r, c), id(r + 1, c), avenue ? 60 : 30, avenue ? `Autopista ${c / 5 + 1}` : `Carrera ${c + 1}`);
        }
      }
    }
  }

  // Congestión base: el 20 % de las vías es más lenta (factor 1.0 – 2.0)
  for (const e of [...g.edges()]) {
    if (e.from < e.to && rnd() < 0.2) {
      g.updateEdge(e.id, { trafficFactor: Number((1 + rnd()).toFixed(2)) });
    }
  }
  return g;
}
