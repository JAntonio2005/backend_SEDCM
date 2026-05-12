# Fase 14A - Actuadores simulados con efecto visible en telemetría

## Objetivo
Hacer que los comandos MQTT ya emitidos y ACKeados generen un efecto observable en la telemetría publicada por cada rack simulado.

## Problema que resolvió
Antes de esta fase, `edge-executor` publicaba ACK pero `edge-collector` seguía en su `SCENARIO` fijo. El frontend veía auditoría correcta, pero sin cambio operativo en CPU/temperatura/publicación de nodo.

## Archivos modificados
- `edge-executor/src/index.js`
- `edge-collector/src/index.js`

## Tópico interno nuevo
- `dc/actuator/zona/{Z}/rack/{R}`

## Payload de actuator effect
```json
{
  "command_id": "uuid",
  "action": "soft_reboot",
  "mode": "cooling",
  "target": {
    "dc_zone": "B",
    "dc_rack": "B1",
    "target_type": "nodo",
    "target_id": "N3"
  },
  "effect": "cpu_cooldown",
  "ttl_ms": 30000,
  "timestamp": "2026-05-12T22:00:00.000Z"
}
```

## Efectos implementados
- `soft_reboot` -> `cpu_cooldown` (30s): CPU baja a rango normal (35-55).
- `hard_shutdown` -> `node_shutdown` (45s): pausa publicación de telemetría de nodo.
- `set_hvac_mode` -> `environment_cooling` (45s): temperatura ambiental baja a 24-28.

Al expirar TTL, el collector vuelve a su escenario base.

## Logs esperados
Executor:
- `edge_actuator_effect_published`
- `edge_actuator_effect_failed`

Collector:
- `edge_actuator_effect_received`
- `edge_actuator_effect_applied`
- `edge_actuator_effect_expired`
- `edge_node_shutdown_active`
- `edge_cpu_cooldown_active`
- `edge_environment_cooling_active`

## Flujo técnico
1. Backend publica comando en `dc/control/zona/{Z}/rack/{R}`.
2. Executor del rack recibe comando, simula ejecución, publica:
   - ACK en `dc/ack/zona/{Z}/rack/{R}`
   - Effect en `dc/actuator/zona/{Z}/rack/{R}`
3. Collector del mismo rack recibe effect y ajusta temporalmente la telemetría.
4. Frontend ve el cambio en vivo por REST/WebSocket.

## Validación esperada
- `POST /api/v1/commands` devuelve `202`.
- `audit_command_log` termina en `ACKED`.
- Soft reboot: CPU temporalmente normal.
- Cooling: temperatura temporalmente normal.
- Hard shutdown: nodo pasa a `OFFLINE` tras timeout y luego recupera estado al expirar TTL.
