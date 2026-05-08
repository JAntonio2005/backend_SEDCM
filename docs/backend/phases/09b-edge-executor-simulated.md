# Fase 9B - Edge Executor minimo simulado

## Objetivo
Agregar un ejecutor de borde simulado que consuma comandos MQTT del backend y publique ACK al topico oficial de confirmaciones.

## Estructura
- `edge-executor/src/index.js`
- `edge-executor/package.json`
- `edge-executor/package-lock.json`
- `edge-executor/Dockerfile`

## Variables de entorno soportadas
- `MQTT_URL` (default `mqtt://127.0.0.1:1883`)
- `EDGE_ZONE` (default `A`)
- `EDGE_RACK` (default `A1`)
- `EXECUTOR_ID` (default `executor-A1`)
- `ACK_DELAY_MS` (default `500`)
- `ACK_MODE` (default `ACKED`, admite `ACKED` o `FAILED`)

## Topicos
- Comandos: `dc/control/zona/{Z}/rack/{R}`
- ACK: `dc/ack/zona/{Z}/rack/{R}`

## Comportamiento
1. Se conecta al broker MQTT.
2. Se suscribe a `dc/control/zona/{EDGE_ZONE}/rack/{EDGE_RACK}`.
3. Al recibir comando valida `command_id` y `action`.
4. Simula accion (`soft_reboot`, `hard_shutdown`, `set_hvac_mode`).
5. Espera `ACK_DELAY_MS`.
6. Publica ACK en `dc/ack/zona/{EDGE_ZONE}/rack/{EDGE_RACK}`.

## Logs del executor
- `edge_executor_started`
- `edge_executor_connected`
- `edge_executor_subscribed`
- `edge_command_received`
- `edge_command_simulated`
- `edge_ack_published`
- `edge_invalid_command`
- `edge_executor_error`

## Integracion Docker Compose
Se agrega servicio `edge-executor-a1` en `docker-compose.yml` con:
- `MQTT_URL=mqtt://mosquitto:1883`
- `EDGE_ZONE=A`
- `EDGE_RACK=A1`
- `EXECUTOR_ID=executor-A1`
- `ACK_DELAY_MS=500`
- `ACK_MODE=ACKED`

## Ejecutar con Docker Compose
```bash
docker compose up --build -d
```

Ver logs:
```bash
docker compose logs -f edge-executor-a1
docker compose logs -f backend
```

## Ejecutar local (sin Docker)
```bash
cd edge-executor
npm install
set MQTT_URL=mqtt://127.0.0.1:1883
set EDGE_ZONE=A
set EDGE_RACK=A1
set EXECUTOR_ID=executor-A1
set ACK_DELAY_MS=500
set ACK_MODE=ACKED
npm start
```

## Prueba E2E recomendada
1. Levantar stack con `docker compose up --build -d`.
2. Publicar telemetria critica (dispara `soft_reboot`):
```bash
node -e "const mqtt=require('mqtt');const c=mqtt.connect('mqtt://127.0.0.1:1883');c.on('connect',()=>{const p={timestamp:new Date().toISOString(),metadata:{dc_zone:'A',dc_rack:'A1',node_id:'N1'},metrics:{cpu_usage_pct:96,ram_usage_mb:13000,net_rx_bytes_sec:1000,net_tx_bytes_sec:900}};c.publish('dc/telemetria/zona/A/rack/A1/nodo/N1',JSON.stringify(p),{},()=>c.end(true));});"
```
3. Verificar backend:
- `command_published`
- `ack_received`
- `ack_record_updated`
4. Verificar executor:
- `edge_command_received`
- `edge_command_simulated`
- `edge_ack_published`

## SQL de verificacion
```sql
SELECT command_id, action, ack_status, ack_received_at, ack_payload
FROM audit_command_log
ORDER BY issued_at DESC
LIMIT 20;
```

Filtrar un comando puntual:
```sql
SELECT command_id, ack_status, ack_received_at IS NOT NULL AS ack_received
FROM audit_command_log
WHERE command_id = '<COMMAND_ID>';
```