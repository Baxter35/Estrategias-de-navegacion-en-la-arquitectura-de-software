# Resultados del benchmark

Generado: 2026-09-24T02:07:48.769Z · Node v24.18.0

## 1. Escalabilidad por algoritmo

| Nodos | Algoritmo | Viajes | Promedio (ms) | p95 (ms) | Nodos expandidos |
|---:|---|---:|---:|---:|---:|
| 900 | dijkstra | 100 | 0.19 | 0.48 | 464 |
| 900 | astar | 100 | 0.06 | 0.21 | 160 |
| 900 | bidirectional | 100 | 0.12 | 0.35 | 244 |
| 900 | adaptive | 100 | 0.08 | 0.23 | 164 |
| 10000 | dijkstra | 60 | 2.64 | 5.26 | 5400 |
| 10000 | astar | 60 | 1.16 | 3.88 | 1874 |
| 10000 | bidirectional | 60 | 1.95 | 4.72 | 3388 |
| 10000 | adaptive | 60 | 1.10 | 3.61 | 1874 |
| 90000 | dijkstra | 20 | 42.75 | 88.16 | 46916 |
| 90000 | astar | 20 | 14.58 | 48.12 | 13761 |
| 90000 | bidirectional | 20 | 28.47 | 65.05 | 30161 |
| 90000 | adaptive | 20 | 13.39 | 44.81 | 13761 |

## 2. Arquitectura base vs. optimizada

1000 solicitudes de despacho hacia 5 hospitales; el tráfico cambia cada 100 solicitudes.

| Arquitectura | Tiempo total (ms) | ms por solicitud |
|---|---:|---:|
| Base: Dijkstra sin caché | 2536.66 | 2.537 |
| Optimizada: Adaptativa + caché LRU | 816.56 | 0.817 |

Aceleración: **3.1x**. Tasa de aciertos de caché: **23.2 %**.

## 3. Re-enrutamiento ante cierres viales (10.000 nodos)

| Muestras | Promedio (ms) | p95 (ms) | Máximo (ms) | Tiempo extra del desvío (s) |
|---:|---:|---:|---:|---:|
| 40 | 3.04 | 7.55 | 8.22 | 4.5 |
