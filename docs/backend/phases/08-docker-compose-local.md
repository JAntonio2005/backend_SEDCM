# Fase 8 - Entorno local reproducible con Docker Compose

## Objetivo
Proveer un entorno local reproducible para ejecutar el backend SEDCM con sus dependencias principales en contenedores:
- PostgreSQL
- Broker MQTT Mosquitto
- Backend Node.js/TypeScript

## Archivos creados
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `infra/mosquitto/mosquitto.conf`

## Servicios y configuración

### 1) PostgreSQL (`postgres`)
- Imagen: `postgres:16-alpine`
- Puerto host: `5432`
- Variables:
  - `POSTGRES_DB=postgres`
  - `POSTGRES_USER=postgres`
  - `POSTGRES_PASSWORD=postgres`
- Migraciones:
  - Se monta `./db/migrations` en `/docker-entrypoint-initdb.d` (solo lectura).
  - En primer arranque de volumen nuevo, PostgreSQL ejecuta `001..004` automáticamente en orden.

### 2) Mosquitto (`mosquitto`)
- Imagen: `eclipse-mosquitto:2`
- Puerto host: `1883`
- Config local: `infra/mosquitto/mosquitto.conf`
  - `listener 1883`
  - `allow_anonymous true`
  - `log_dest stdout`

### 3) Backend (`backend`)
- Build local con `Dockerfile`
- Puerto host: `3000`
- Variables de entorno:
  - `HTTP_PORT=3000`
  - `MQTT_URL=mqtt://mosquitto:1883`
  - `MQTT_CLIENT_ID=backend-sedcm-docker`
  - `MQTT_CONNECT_TIMEOUT_MS=5000`
  - `MQTT_RECONNECT_PERIOD_MS=3000`
  - `PGHOST=postgres`
  - `PGPORT=5432`
  - `PGDATABASE=postgres`
  - `PGUSER=postgres`
  - `PGPASSWORD=postgres`
  - `PGSSLMODE=disable`
  - `NODE_ESCALATION_GRACE_MS=30000`
- `depends_on` con condición de healthcheck para esperar `postgres` y `mosquitto`.

## Healthchecks
- `postgres`: `pg_isready -U postgres -d postgres`
- `mosquitto`: suscripción a `$SYS/broker/version`
- `backend`: verificación HTTP `GET /health`

## Cómo levantar
```bash
docker compose up --build
```

## Cómo detener y limpiar
```bash
docker compose down
```

Para reinicializar DB y re-ejecutar migraciones desde cero:
```bash
docker compose down -v
```

## Pruebas rápidas E2E

### 1) Health del backend
```bash
curl http://127.0.0.1:3000/health
```
Esperado: `200` con JSON `{ "status": "ok", ... }`.

### 2) Publicar telemetría de nodo (MQTT)
```bash
mosquitto_pub -h 127.0.0.1 -p 1883 -t "dc/telemetria/zona/A/rack/A1/nodo/N1" -m "{\"timestamp\":\"2026-05-07T20:00:00Z\",\"metadata\":{\"dc_zone\":\"A\",\"dc_rack\":\"A1\",\"node_id\":\"N1\"},\"metrics\":{\"cpu_usage_pct\":96,\"ram_usage_mb\":13000,\"net_rx_bytes_sec\":1000,\"net_tx_bytes_sec\":900}}"
```

### 3) Consultar inventario por REST
```bash
curl http://127.0.0.1:3000/api/v1/inventory
```

### 4) Conectar WebSocket
```bash
node -e "const WebSocket=require('ws');const ws=new WebSocket('ws://127.0.0.1:3000/ws');ws.on('open',()=>console.log('WS_CONNECTED'));ws.on('message',(m)=>console.log(m.toString()));"
```

## Notas
- Esta fase no habilita TLS/MQTTS.
- Este entorno usa credenciales locales de desarrollo (`postgres/postgres`).
- Para MVP final en red local, se puede ajustar Mosquitto/DB sin cambiar la arquitectura base.