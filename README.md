# RutaViva

Prototipo de navegación adaptativa para vehículos de emergencia. Calcula la ruta más rápida de una ambulancia a un hospital, detecta cambios de tráfico en tiempo real (cierres, congestión) y recalcula la ruta automáticamente desde la posición actual del vehículo.

Proyecto de la Unidad 3 del curso Arquitectura de Software: *Navegando mareas, estrategias de navegación en la arquitectura de software*.

## Cómo ejecutarlo

Requisitos: Node.js 20 o superior.

```bash
npm install
npm start          # abre http://localhost:3000
npm test           # 13 pruebas automatizadas
npm run benchmark  # genera results/benchmark.md, .json y .csv
```

Variables opcionales: `ROWS` y `COLS` cambian el tamaño de la ciudad (por defecto 40 × 60 = 2.400 intersecciones), `PORT` cambia el puerto.

```bash
ROWS=100 COLS=100 npm start   # ciudad de 10.000 intersecciones
```

## Qué demuestra el prototipo

1. Clic en el mapa para marcar la base (B) y el hospital (H).
2. **Calcular ruta** anima los nodos que explora el algoritmo elegido y dibuja la ruta.
3. **Comparar algoritmos** ejecuta los cuatro sobre el mismo viaje: todos encuentran la misma ruta óptima, pero con distinto trabajo.
4. **Iniciar despacho** mueve la ambulancia y muestra instrucciones giro a giro.
5. **Cerrar vía adelante** o **Mayús + clic** sobre cualquier calle: el servicio de tráfico notifica a la sesión, que recalcula en milisegundos. El aviso muestra la latencia y el tiempo extra del desvío.
6. **Deshacer** revierte la última acción (patrón Command).

## Arquitectura y patrones

| Patrón | Dónde | Qué resuelve |
|---|---|---|
| Strategy | `src/strategies/` | Cambiar el algoritmo de búsqueda sin tocar el motor |
| Strategy adaptativa | `AdaptiveStrategy.ts` | Elegir el algoritmo en tiempo de ejecución según el viaje |
| Template Method | `BestFirstStrategies.ts` | Dijkstra y A* comparten el algoritmo; solo cambia la heurística |
| Decorator | `src/cache/CachedRouteStrategy.ts` | Caché LRU para cualquier estrategia, con invalidación por versión del grafo |
| Observer | `src/traffic/TrafficService.ts`, `NavigationSession.ts`, SSE en `server.ts` | Re-enrutamiento automático y actualización del navegador en vivo |
| Command | `src/commands/Commands.ts` | Deshacer, bitácora auditable y reproducción de incidentes |
| Composite | `src/route/Route.ts` | Ruta → tramo por vía → segmento, con la misma interfaz en todos los niveles |
| Iterator | `TurnByTurnIterator` en `Route.ts` | Instrucciones giro a giro sin exponer la estructura interna |
| Facade | `src/engine/RouteEngine.ts` | Punto único de entrada para la API y las pruebas |

Los diagramas UML están como código en `docs/uml/*.puml` (PlantUML) y renderizados en `docs/uml/png/`: componentes, secuencia, clases, actividad, estados y despliegue.

## Estructura

```
src/
  domain/        Grafo vial y generador de ciudades sintéticas reproducibles
  strategies/    Dijkstra, A*, bidireccional y adaptativa
  cache/         Decorator de caché LRU
  traffic/       Servicio de tráfico (sujeto del Observer)
  navigation/    Sesión de navegación (observador + máquina de estados)
  commands/      Comandos y su invocador
  route/         Composite de rutas e iterador giro a giro
  engine/        Fachada del sistema
  benchmark/     Experimentos de rendimiento y escalabilidad
  server.ts      API REST + Server-Sent Events
public/          Consola web de despacho
tests/           Pruebas con node:test
docs/uml/        Diagramas PlantUML
results/         Resultados del benchmark
```

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/graph` | Nodos y vías de la ciudad |
| POST | `/api/route` | `{from, to, algorithm, animate}` ruta con instrucciones |
| POST | `/api/compare` | `{from, to}` los cuatro algoritmos sobre el mismo viaje |
| POST | `/api/navigation` | `{from, to, algorithm}` inicia un despacho |
| POST | `/api/navigation/:id/advance` | Avanza una intersección |
| POST | `/api/traffic/block` | `{edgeId}` cierra una vía |
| POST | `/api/traffic/congestion` | `{edgeId, factor}` congestiona una vía |
| POST | `/api/commands/undo` | Deshace la última acción |
| GET | `/api/metrics` | Caché, latencias de re-enrutamiento y bitácora |
| GET | `/api/events` | Flujo SSE con eventos `traffic` y `reroute` |

## Resultados de referencia

Medidos con `npm run benchmark` (los tiempos varían según el equipo; los nodos expandidos son deterministas):

- Con 90.000 nodos, A* expande en promedio 13.761 nodos frente a 46.916 de Dijkstra (3,4 veces menos trabajo).
- La arquitectura optimizada (estrategia adaptativa + caché) atiende 1.000 despachos unas 3 veces más rápido que la base (Dijkstra sin caché), aun con el tráfico cambiando cada 100 solicitudes.
- El re-enrutamiento ante un cierre vial en una ciudad de 10.000 nodos toma en promedio menos de 10 ms.

Detalle completo en `results/benchmark.md`.

## Limitaciones y trabajo futuro

- La ciudad es sintética para garantizar experimentos reproducibles. Cargar un mapa real de OpenStreetMap solo requiere construir el `Graph` desde esos datos; el resto de la arquitectura no cambia.
- La heurística de A* usa la velocidad máxima de la red; en ciudades con avenidas muy rápidas se vuelve poco informada. Técnicas como ALT (landmarks) o Contraction Hierarchies la mejorarían.
- Un solo proceso en memoria. El diagrama de despliegue muestra cómo escalar con caché compartida (Redis) y un broker de eventos.
