# Fase 6 - API REST de consulta para dashboard

## 1. Objetivo de la fase
Agregar endpoints REST de lectura para que el dashboard/frontend consuma datos reales del backend y deje de depender de mocks.

## 2. Problema que resolvió
El backend solo exponía `GET /health`, por lo que no había una interfaz HTTP para consultar inventario, telemetría histórica y bitácora de comandos. Esta fase habilita una API mínima de consulta con filtros y paginación por `limit`.

## 3. Archivos creados/modificados
- `src/bootstrap/http.ts`
- `src/repositories/query.repository.ts`

## 4. Endpoints implementados
- `GET /api/v1/inventory`
- `GET /api/v1/nodes`
- `GET /api/v1/racks`
- `GET /api/v1/telemetry/node`
- `GET /api/v1/telemetry/environment`
- `GET /api/v1/audit/commands`

## 5. Explicacion breve de cada endpoint
- `inventory`: devuelve jerarquia `zonas -> racks -> nodos`.
- `nodes`: devuelve lista plana de nodos.
- `racks`: devuelve lista plana de racks.
- `telemetry/node`: devuelve telemetria historica de nodos.
- `telemetry/environment`: devuelve telemetria historica ambiental.
- `audit/commands`: devuelve bitacora de comandos emitidos y estado de ACK.

## 6. Query params soportados
- `telemetry/node`:
  - `node_id`, `zone_code`, `rack_code`, `limit`
- `telemetry/environment`:
  - `zone_code`, `rack_code`, `limit`
- `audit/commands`:
  - `zone_code`, `rack_code`, `node_id`, `ack_status`, `action`, `limit`
- `nodes`:
  - `limit`
- `racks`:
  - `limit`

## 7. Estrategia global de limit
- default: `50`
- maximo: `500`
- invalido/no numerico/`<=0`: usa `50`
- `nodes` y `racks` tambien devuelven `{ items, limit }`

## 8. Ejemplos curl
```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/v1/inventory
curl "http://127.0.0.1:3000/api/v1/nodes?limit=20"
curl "http://127.0.0.1:3000/api/v1/racks?limit=20"
curl "http://127.0.0.1:3000/api/v1/telemetry/node?node_id=N1&zone_code=A&rack_code=A1&limit=20"
curl "http://127.0.0.1:3000/api/v1/telemetry/environment?zone_code=A&rack_code=A1&limit=20"
curl "http://127.0.0.1:3000/api/v1/audit/commands?zone_code=A&rack_code=A1&node_id=N1&limit=20"
```

## 9. Ejemplos resumidos de respuesta JSON
- Inventory (`zones/racks/nodes`):
```json
{
  "zones": [
    {
      "zone_code": "A",
      "first_seen_at": "2026-05-07T03:37:53.228Z",
      "last_seen_at": "2026-05-07T22:55:24.761Z",
      "racks": [
        {
          "rack_code": "A1",
          "environment_status": "Warning",
          "nodes": [
            {
              "node_id": "N1",
              "health_status": "Critico",
              "source_type": "edge_collector"
            }
          ]
        }
      ]
    }
  ]
}
```

- Nodes (`items` + `limit`):
```json
{
  "items": [
    {
      "node_id": "N1",
      "zone_code": "A",
      "rack_code": "A1",
      "source_type": "edge_collector",
      "health_status": "Critico"
    }
  ],
  "limit": 50
}
```

- Racks (`items` + `limit`):
```json
{
  "items": [
    {
      "zone_code": "A",
      "rack_code": "A1",
      "environment_status": "Warning"
    }
  ],
  "limit": 50
}
```

- Telemetry node (`items` + `limit`):
```json
{
  "items": [
    {
      "event_time": "2026-05-07T19:15:46.907Z",
      "zone_code": "A",
      "rack_code": "A1",
      "node_id": "N1",
      "cpu_usage_pct": 99
    }
  ],
  "limit": 20
}
```

- Audit commands (`items` + `limit`):
```json
{
  "items": [
    {
      "command_id": "b200e565-d36e-4929-b7c1-8410fd4cf108",
      "zone_code": "A",
      "rack_code": "A1",
      "node_id": "N1",
      "action": "hard_shutdown",
      "ack_status": "PENDING",
      "issued_at": "2026-05-07T19:15:36.114Z"
    }
  ],
  "limit": 20
}
```

## 10. Validaciones realizadas
- `npm run build` OK.
- `GET /health` HTTP 200.
- `GET /api/v1/inventory` HTTP 200.
- `GET /api/v1/nodes` HTTP 200.
- `GET /api/v1/racks` HTTP 200.
- `GET /api/v1/telemetry/node` HTTP 200.
- `GET /api/v1/telemetry/environment` HTTP 200.
- `GET /api/v1/audit/commands` HTTP 200.
- `GET /api/v1/no-existe` HTTP 404.
- `limit` invalido usa `50`.
- `limit` mayor a `500` se limita a `500`.
- `limit` negativo usa `50`.

## 11. Smoke de regresion
- persistencia MQTT sigue funcionando.
- motor de reglas sigue funcionando.
- publicacion de comandos sigue funcionando.
- ACK sigue funcionando.
- escalacion sigue funcionando.

## 12. Relacion con requerimientos
- RF-07 Visualizacion y Alertas en Tiempo Real, como base REST para dashboard.
- RF-06 Persistencia Historica.
- RF-04 Motor de Reglas, porque expone estados calculados.

## 13. Nota tecnica
Esta fase no implementa WebSocket todavia. La API REST permite al frontend reemplazar mocks con datos reales; el tiempo real se implementara en una fase posterior.
