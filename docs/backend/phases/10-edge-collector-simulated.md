# Fase 10 - Edge Collector simulado

## Objetivo
Agregar un Edge Collector simulado que publique telemetria periodica de nodo y ambiente en MQTT usando el contrato oficial del backend.

## Archivos creados/modificados
- `edge-collector/src/index.js`
- `edge-collector/package.json`
- `edge-collector/package-lock.json`
- `edge-collector/Dockerfile`
- `edge-collector/.dockerignore`
- `docker-compose.yml`
- `docs/backend/phases/10-edge-collector-simulated.md`

## Variables de entorno soportadas
- `MQTT_URL` (default: `mqtt://127.0.0.1:1883`)
- `EDGE_ZONE` (default: `A`)
- `EDGE_RACK` (default: `A1`)
- `NODE_ID` (default: `N1`)
- `COLLECTOR_ID` (default: `collector-A1`)
- `NODE_INTERVAL_MS` (default: `5000`)
- `ENV_INTERVAL_MS` (default: `10000`)
- `SCENARIO` (default: `normal`)

## Topicos publicados
- Nodo: `dc/telemetria/zona/{Z}/rack/{R}/nodo/{N}`
- Ambiente: `dc/telemetria/zona/{Z}/rack/{R}/ambiente`

## Escenarios implementados
- `normal`
  - CPU 40-60
  - RAM 1000-2000
  - Temp 24-27
  - Hum 45-55

- `warning`
  - CPU 80-90
  - RAM 8192-10000
  - Temp 30-38
  - Hum 35 o 65

- `critical_node`
  - CPU 95-99
  - RAM 12288-14000
  - Temp normal
  - Hum normal

- `critical_environment`
  - CPU normal
  - RAM normal
  - Temp 45-50
  - Hum normal

## Logs del collector
- `edge_collector_started`
- `edge_collector_connected`
- `edge_node_telemetry_published`
- `edge_environment_telemetry_published`
- `edge_collector_error`

## Integracion en Docker Compose
Se agrega servicio `edge-collector-a1` con:
- `MQTT_URL=mqtt://mosquitto:1883`
- `EDGE_ZONE=A`
- `EDGE_RACK=A1`
- `NODE_ID=N1`
- `COLLECTOR_ID=collector-A1`
- `NODE_INTERVAL_MS=5000`
- `ENV_INTERVAL_MS=10000`
- `SCENARIO=critical_node`

## Correr con Docker Compose
```bash
docker compose up --build -d
```

Logs:
```bash
docker compose logs -f edge-collector-a1
docker compose logs -f backend
docker compose logs -f edge-executor-a1
```

## Correr localmente (opcional)
```bash
cd edge-collector
npm install
set MQTT_URL=mqtt://127.0.0.1:1883
set EDGE_ZONE=A
set EDGE_RACK=A1
set NODE_ID=N1
set COLLECTOR_ID=collector-A1
set NODE_INTERVAL_MS=5000
set ENV_INTERVAL_MS=10000
set SCENARIO=normal
npm start
```

## Verificacion REST
```bash
curl http://127.0.0.1:3000/api/v1/inventory
curl "http://127.0.0.1:3000/api/v1/telemetry/node?node_id=N1&limit=20"
curl "http://127.0.0.1:3000/api/v1/telemetry/environment?zone_code=A&rack_code=A1&limit=20"
curl "http://127.0.0.1:3000/api/v1/audit/commands?node_id=N1&limit=20"
```

## Verificacion SQL
```sql
SELECT COUNT(*) FROM telemetry_node;
SELECT COUNT(*) FROM telemetry_environment;
SELECT node_id, health_status, last_seen_at FROM inventory_node ORDER BY last_seen_at DESC;
SELECT zone_code, rack_code, environment_status, last_seen_at FROM inventory_rack ORDER BY last_seen_at DESC;
SELECT command_id, action, ack_status, issued_at, ack_received_at
FROM audit_command_log
ORDER BY issued_at DESC
LIMIT 20;
```

## Notas
- Esta fase no lee Docker real ni sensores reales.
- No implementa TLS/MQTTS.
- Es base para integrar collector real en fase posterior.