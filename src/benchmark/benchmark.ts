/**
 * Benchmark reproducible (semillas fijas). Genera results/benchmark.{md,json,csv}
 * para el informe:
 *   1. Escalabilidad: tiempo y nodos expandidos por algoritmo con 900, 10.000 y 90.000 nodos.
 *   2. Arquitectura base vs. optimizada con una carga realista (despachos a 5 hospitales).
 *   3. Latencia de re-enrutamiento ante cierres viales.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { createCity } from "../domain/CityFactory.js";
import { Graph } from "../domain/Graph.js";
import { AStarStrategy, DijkstraStrategy } from "../strategies/BestFirstStrategies.js";
import { BidirectionalStrategy } from "../strategies/BidirectionalStrategy.js";
import { AdaptiveStrategy } from "../strategies/AdaptiveStrategy.js";
import { CachedRouteStrategy } from "../cache/CachedRouteStrategy.js";
import { RouteStrategy } from "../strategies/RouteStrategy.js";
import { RouteEngine } from "../engine/RouteEngine.js";
import { seededRandom } from "../util/Random.js";

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
const f = (n: number, d = 2) => n.toFixed(d);

function randomPairs(g: Graph, n: number, seed: number): [number, number][] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, () => [Math.floor(rnd() * g.size), Math.floor(rnd() * g.size)]);
}

// ------------------------------------------------------------------ 1. Escalabilidad
const sizes: [number, number, number][] = [
  [30, 30, 100],
  [100, 100, 60],
  [300, 300, 20],
];
const strategies: RouteStrategy[] = [new DijkstraStrategy(), new AStarStrategy(), new BidirectionalStrategy(), new AdaptiveStrategy()];
const scalability: Record<string, unknown>[] = [];

console.log("\n1) Escalabilidad por algoritmo");
for (const [rows, cols, trips] of sizes) {
  const g = createCity({ rows, cols, seed: 7 });
  const pairs = randomPairs(g, trips, 123);
  for (const s of strategies) s.findRoute(g, pairs[0][0], pairs[0][1]); // calentamiento JIT
  for (const s of strategies) {
    const times: number[] = [];
    const exp: number[] = [];
    for (const [a, b] of pairs) {
      const r = s.findRoute(g, a, b);
      times.push(r.timeMs);
      exp.push(r.expanded);
    }
    const row = { nodes: g.size, algorithm: s.name, trips, avgMs: avg(times), p95Ms: pct(times, 95), avgExpanded: avg(exp) };
    scalability.push(row);
    console.log(`  ${String(g.size).padStart(6)} nodos  ${s.name.padEnd(13)} prom ${f(row.avgMs).padStart(8)} ms  p95 ${f(row.p95Ms).padStart(8)} ms  expandidos ${Math.round(row.avgExpanded)}`);
  }
}

// ------------------------------------------------------------------ 2. Base vs optimizada
console.log("\n2) Arquitectura base vs optimizada (1.000 despachos a 5 hospitales)");
const g2 = createCity({ rows: 100, cols: 100, seed: 7 });
const rnd = seededRandom(5);
const hospitals = Array.from({ length: 5 }, () => Math.floor(rnd() * g2.size));
const bases = Array.from({ length: 40 }, () => Math.floor(rnd() * g2.size)); // estaciones y puntos frecuentes
const workload: [number, number][] = Array.from({ length: 1000 }, () => [
  bases[Math.floor(rnd() * bases.length)],
  hospitals[Math.floor(rnd() * hospitals.length)],
]);

function runWorkload(s: RouteStrategy, trafficEvery = 100): number {
  const t0 = performance.now();
  workload.forEach(([a, b], i) => {
    if (i > 0 && i % trafficEvery === 0) g2.updateEdge(`${i}-${i + 1}`, { trafficFactor: 1 + (i % 3) }); // el tráfico cambia
    s.findRoute(g2, a, b);
  });
  return performance.now() - t0;
}
const baseline = new DijkstraStrategy();
const optimized = new CachedRouteStrategy(new AdaptiveStrategy());
runWorkload(new DijkstraStrategy(), 1e9); // calentamiento
const baseMs = runWorkload(baseline);
const optMs = runWorkload(optimized);
const archComparison = {
  requests: workload.length,
  baselineTotalMs: baseMs,
  optimizedTotalMs: optMs,
  speedup: baseMs / optMs,
  cache: optimized.stats,
};
console.log(`  Base (Dijkstra, sin caché):      ${f(baseMs)} ms  (${f(baseMs / workload.length, 3)} ms/solicitud)`);
console.log(`  Optimizada (Adaptativa + caché): ${f(optMs)} ms  (${f(optMs / workload.length, 3)} ms/solicitud)`);
console.log(`  Aceleración: ${f(archComparison.speedup, 1)}x   tasa de aciertos de caché: ${f(optimized.stats.hitRate * 100, 1)} %`);

// ------------------------------------------------------------------ 3. Re-enrutamiento
console.log("\n3) Latencia de re-enrutamiento (Observer) con 10.000 nodos");
const engine = new RouteEngine(createCity({ rows: 100, cols: 100, seed: 7 }));
const rr = seededRandom(77);
const latencies: number[] = [];
const extraSeconds: number[] = [];
for (let i = 0; i < 40; i++) {
  const s = engine.startNavigation(Math.floor(rr() * 500), 9999 - Math.floor(rr() * 500));
  const ids = s.remainingEdgeIds;
  if (ids.length < 6) continue;
  engine.blockRoad(ids[Math.floor(ids.length / 2)]);
  const info = s.reroutes.at(-1);
  if (info) {
    latencies.push(info.latencyMs);
    extraSeconds.push(info.newCost - info.previousCost);
  }
  engine.undo();
}
const reroute = { samples: latencies.length, avgMs: avg(latencies), p95Ms: pct(latencies, 95), maxMs: Math.max(...latencies), avgExtraSeconds: avg(extraSeconds) };
console.log(`  ${reroute.samples} cierres: prom ${f(reroute.avgMs)} ms, p95 ${f(reroute.p95Ms)} ms, máx ${f(reroute.maxMs)} ms`);
console.log(`  Tiempo extra promedio del desvío: ${f(reroute.avgExtraSeconds, 1)} s`);

// ------------------------------------------------------------------ Salida
mkdirSync("results", { recursive: true });
writeFileSync("results/benchmark.json", JSON.stringify({ date: new Date().toISOString(), node: process.version, scalability, archComparison, reroute }, null, 2));
writeFileSync(
  "results/benchmark.csv",
  ["nodos,algoritmo,viajes,prom_ms,p95_ms,nodos_expandidos", ...scalability.map((r: any) => `${r.nodes},${r.algorithm},${r.trips},${f(r.avgMs, 3)},${f(r.p95Ms, 3)},${Math.round(r.avgExpanded)}`)].join("\n"),
);
const md = `# Resultados del benchmark

Generado: ${new Date().toISOString()} · Node ${process.version}

## 1. Escalabilidad por algoritmo

| Nodos | Algoritmo | Viajes | Promedio (ms) | p95 (ms) | Nodos expandidos |
|---:|---|---:|---:|---:|---:|
${scalability.map((r: any) => `| ${r.nodes} | ${r.algorithm} | ${r.trips} | ${f(r.avgMs)} | ${f(r.p95Ms)} | ${Math.round(r.avgExpanded)} |`).join("\n")}

## 2. Arquitectura base vs. optimizada

${workload.length} solicitudes de despacho hacia 5 hospitales; el tráfico cambia cada 100 solicitudes.

| Arquitectura | Tiempo total (ms) | ms por solicitud |
|---|---:|---:|
| Base: Dijkstra sin caché | ${f(baseMs)} | ${f(baseMs / workload.length, 3)} |
| Optimizada: Adaptativa + caché LRU | ${f(optMs)} | ${f(optMs / workload.length, 3)} |

Aceleración: **${f(archComparison.speedup, 1)}x**. Tasa de aciertos de caché: **${f(optimized.stats.hitRate * 100, 1)} %**.

## 3. Re-enrutamiento ante cierres viales (10.000 nodos)

| Muestras | Promedio (ms) | p95 (ms) | Máximo (ms) | Tiempo extra del desvío (s) |
|---:|---:|---:|---:|---:|
| ${reroute.samples} | ${f(reroute.avgMs)} | ${f(reroute.p95Ms)} | ${f(reroute.maxMs)} | ${f(reroute.avgExtraSeconds, 1)} |
`;
writeFileSync("results/benchmark.md", md);
console.log("\nResultados guardados en results/benchmark.{md,json,csv}\n");
