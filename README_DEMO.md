# README_DEMO

## Demo completa del backend SEDCM con Docker Compose

## 1) Requisitos
- Docker Desktop
- Node.js (solo si se quiere probar fuera de Docker)
- Puertos requeridos libres: `3000`, `1883`, `5432`

## 2) Levantar la demo
```bash
docker compose up --build
```

## 3) Servicios levantados
- `postgres`
- `mosquitto`
- `backend`
- `edge-executor-a1`
- `edge-collector-a1`

## 4) Endpoints y URL principales
- `GET http://127.0.0.1:3000/health`
- `GET http://127.0.0.1:3000/api/v1/inventory`
- `GET http://127.0.0.1:3000/api/v1/nodes`
- `GET http://127.0.0.1:3000/api/v1/racks`
- `GET http://127.0.0.1:3000/api/v1/telemetry/node`
- `GET http://127.0.0.1:3000/api/v1/telemetry/environment`
- `GET http://127.0.0.1:3000/api/v1/audit/commands`
- WebSocket: `ws://127.0.0.1:3000/ws`

## 5) Comandos curl basicos para validar
```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/v1/inventory
curl http://127.0.0.1:3000/api/v1/nodes
curl http://127.0.0.1:3000/api/v1/racks
curl "http://127.0.0.1:3000/api/v1/telemetry/node?node_id=N1&limit=20"
curl "http://127.0.0.1:3000/api/v1/telemetry/environment?zone_code=A&rack_code=A1&limit=20"
curl "http://127.0.0.1:3000/api/v1/audit/commands?node_id=N1&limit=20"
```

## 6) Ver logs en tiempo real
```bash
docker compose logs -f backend
docker compose logs -f edge-collector-a1
docker compose logs -f edge-executor-a1
```

## 7) Flujo esperado en la demo
1. El `edge-collector-a1` publica telemetria periodica de nodo y ambiente en MQTT.
2. El `backend` valida, normaliza, deduplica y persiste en PostgreSQL.
3. El backend evalua reglas de estado (`Normal`, `Warning`, `Critico`).
4. Cuando aplica mitigacion, el backend publica comando MQTT a `dc/control/...`.
5. El `edge-executor-a1` recibe el comando, simula ejecucion y publica ACK en `dc/ack/...`.
6. El backend recibe ACK y actualiza `audit_command_log` a `ACKED` (o `FAILED` segun configuracion).

## 8) Apagar la demo
```bash
docker compose down
```