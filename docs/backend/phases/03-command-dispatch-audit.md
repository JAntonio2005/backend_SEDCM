# Fase 3 - Publicacion de comandos MQTT y bitacora inicial

## Objetivo de la fase
Despachar comandos MQTT de mitigacion cuando las reglas lo indiquen, y registrar cada emision en bitacora de auditoria.

## Problema que resolvio
El sistema detectaba estados de riesgo, pero no ejecutaba acciones de mitigacion ni dejaba trazabilidad de comandos emitidos.

## Archivos creados/modificados
- Creado: `src/commands/command-dispatcher.ts`
- Creado: `src/repositories/command-audit.repository.ts`
- Modificado: `src/mqtt/subscriptions.ts`
- Migracion agregada: `db/migrations/003_command_audit_log.sql`

## Tabla agregada
- `audit_command_log`

## Campos principales
- `command_id`
- `zone_code`
- `rack_code`
- `node_id`
- `target_type`
- `action`
- `reason`
- `mqtt_topic`
- `payload`
- `issued_at`
- `ack_status`
- `ack_received_at`
- `ack_payload`

## Flujo tecnico
`Telemetria -> reglas -> decision de accion -> publicacion MQTT -> registro en audit_command_log`

## Topico de comandos
`dc/control/zona/{Z}/rack/{R}`

## Payload de comando esperado
```json
{
  "command_id": "...",
  "timestamp_issued": "...",
  "target": {
    "dc_zone": "A",
    "dc_rack": "A1",
    "target_type": "nodo",
    "target_id": "NODO-01"
  },
  "action": "soft_reboot",
  "reason": "node_critical_soft_reboot"
}
```

## Reglas de despacho implementadas
- Nodo Critico -> `soft_reboot`.
- Ambiente Warning por temperatura -> `set_hvac_mode` (cooling).
- Humedad `< 40` -> `set_hvac_mode` (humidify).
- Humedad `> 60` -> `set_hvac_mode` (dehumidify).
- Ambiente Critico -> `hard_shutdown` con `target_type=rack`.

## Proteccion anti-duplicado
Si ya existe un comando `PENDING` reciente (ventana de 5 minutos) para el mismo `scope + action + reason`, se omite nueva publicacion.

## Logs esperados
- `command_dispatch_requested`
- `command_published`
- `command_audit_recorded`
- `command_dispatch_skipped`
- `command_dispatch_failed`

## Comandos de prueba (mosquitto_pub)
Nota: `timestamp` debe estar dentro de +/-120s.

### Nodo Critico (debe emitir soft_reboot)
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/nodo/NODO-01" -m '{
  "timestamp": "<ISO_TIMESTAMP_ACTUAL>",
  "metadata": {"dc_zone":"A","dc_rack":"A1","node_id":"NODO-01"},
  "metrics": {"cpu_usage_pct": 96, "ram_usage_mb": 13000, "net_rx_bytes_sec": 2000, "net_tx_bytes_sec": 1800}
}'
```

### Ambiente Warning por temperatura (debe emitir set_hvac_mode cooling)
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/ambiente" -m '{
  "timestamp": "<ISO_TIMESTAMP_ACTUAL>",
  "metadata": {"dc_zone":"A","dc_rack":"A1"},
  "environment": {"temperature_c": 30, "humidity_pct": 50}
}'
```

### Ambiente Critico (debe emitir hard_shutdown)
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/ambiente" -m '{
  "timestamp": "<ISO_TIMESTAMP_ACTUAL>",
  "metadata": {"dc_zone":"A","dc_rack":"A1"},
  "environment": {"temperature_c": 46, "humidity_pct": 50}
}'
```

## Escucha de comandos publicados
```bash
mosquitto_sub -h 127.0.0.1 -t "dc/control/#" -v
```

## Consultas SQL de verificacion
```sql
SELECT command_id, zone_code, rack_code, node_id, target_type, action, reason, mqtt_topic, issued_at, ack_status
FROM audit_command_log
ORDER BY issued_at DESC;

SELECT *
FROM audit_command_log
WHERE ack_status = 'PENDING'
ORDER BY issued_at DESC;

SELECT zone_code, rack_code, node_id, target_type, action, reason, COUNT(*) AS total,
       MIN(issued_at) AS first_issued_at,
       MAX(issued_at) AS last_issued_at
FROM audit_command_log
GROUP BY zone_code, rack_code, node_id, target_type, action, reason
ORDER BY last_issued_at DESC;
```

## Resultado de validacion
- `npm run build` OK
- Comandos publicados OK
- `audit_command_log` con `ack_status=PENDING` OK
- Anti-duplicado validado OK

## Nota tecnica
ACK todavia no esta implementado. Queda pendiente para Fase 4.

## Relacion con requerimientos
- RF-05 Protocolo de Mitigacion por Escalacion
- RF-06 Bitacora de Auditoria
- RF-03 Simulacion Ambiental y Actuadores Fisicos
