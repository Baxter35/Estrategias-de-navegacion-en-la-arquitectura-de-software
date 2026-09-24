import express, { Request, Response, NextFunction } from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createCity } from "./domain/CityFactory.js";
import { RouteEngine } from "./engine/RouteEngine.js";
import { NavigationSession } from "./navigation/NavigationSession.js";

const ROWS = Number(process.env.ROWS ?? 40);
const COLS = Number(process.env.COLS ?? 60);
const PORT = Number(process.env.PORT ?? 3000);

// ---- Eventos en tiempo real (Server-Sent Events): el navegador es otro observador ----
const clients = new Set<Response>();
function broadcast(type: string, data: unknown): void {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
}

function serializeSession(s: NavigationSession) {
  return {
    id: s.id,
    state: s.state,
    current: s.current,
    origin: s.origin,
    destination: s.destination,
    traveled: s.traveled,
    remainingPath: s.remainingPath,
    remainingCost: s.remainingCost,
    algorithm: s.result?.algorithm,
    instructions: s.instructions(),
    reroutes: s.reroutes,
  };
}

const graph = createCity({ rows: ROWS, cols: COLS, seed: 7 });
const engine = new RouteEngine(graph, {
  onReroute: (s, info) => broadcast("reroute", { info, session: serializeSession(s) }),
});
engine.traffic.subscribe({
  onTrafficUpdate: (e) =>
    broadcast("traffic", { type: e.type, edges: e.edges.map((x) => ({ id: x.id, blocked: x.blocked, trafficFactor: x.trafficFactor })) }),
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "../public")));

app.get("/api/graph", (_req, res) => {
  const nodes = [...graph.nodes.values()].map((n) => [n.id, Math.round(n.x), Math.round(n.y)]);
  const edges = [...graph.edges()]
    .filter((e) => e.from < e.to) // una entrada por vía de doble sentido
    .map((e) => ({ id: e.id, from: e.from, to: e.to, street: e.street, speed: e.speedKmh, traffic: e.trafficFactor, blocked: e.blocked }));
  res.json({ rows: ROWS, cols: COLS, nodes, edges, algorithms: engine.algorithms });
});

app.post("/api/route", (req, res) => {
  const { from, to, algorithm = "adaptive", animate = false } = req.body;
  const r = engine.findRoute(Number(from), Number(to), algorithm, Boolean(animate));
  res.json({ ...r, edges: undefined });
});

app.post("/api/compare", (req, res) => {
  res.json(engine.compare(Number(req.body.from), Number(req.body.to)));
});

app.post("/api/navigation", (req, res) => {
  const s = engine.startNavigation(Number(req.body.from), Number(req.body.to), req.body.algorithm ?? "adaptive");
  res.json(serializeSession(s));
});

app.post("/api/navigation/:id/advance", (req, res) => {
  res.json(serializeSession(engine.advance(req.params.id)));
});

app.get("/api/navigation/:id", (req, res) => {
  res.json(serializeSession(engine.session(req.params.id)));
});

app.post("/api/traffic/block", (req, res) => {
  engine.blockRoad(String(req.body.edgeId));
  res.json({ ok: true });
});

app.post("/api/traffic/congestion", (req, res) => {
  engine.setCongestion(String(req.body.edgeId), Number(req.body.factor ?? 3));
  res.json({ ok: true });
});

app.post("/api/commands/undo", (_req, res) => {
  res.json({ undone: engine.undo() ?? null });
});

app.get("/api/metrics", (_req, res) => res.json(engine.metrics()));

app.get("/api/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write("event: hello\ndata: {}\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`RutaViva en http://localhost:${PORT}  (${graph.size} intersecciones, ${graph.edgeCount} tramos)`);
});
