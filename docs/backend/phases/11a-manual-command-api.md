# Fase 11A - API REST de comandos manuales

## 1. Objetivo de la fase
Habilitar una API REST para intervención manual desde frontend/operación, permitiendo emitir comandos MQTT de mitigación de forma segura y auditada.

## 2. Problema que resolvió
Antes de esta fase, los comandos se emitían únicamente por reglas automáticas. No existía un endpoint controlado para que un operador enviara acciones manuales y quedaran registradas en auditoría.

## 3. Archivos modificados
- `src/app.ts`
- `src/bootstrap/http.ts`
- `src/commands/command-dispatcher.ts`

## 4. Endpoint implementado
- `POST /api/v1/commands`

## 5. Payloads soportados
- `soft_reboot` para nodo
- `hard_shutdown` para nodo
- `set_hvac_mode` para rack

## 6. Reglas de validación
- `zone_code` requerido
- `rack_code` requerido
- `target_type` requerido: `nodo | rack`
- `target_id` requerido
- `action` requerida: `soft_reboot | hard_shutdown | set_hvac_mode`
- `reason` requerida
- `soft_reboot` solo para `nodo`
- `set_hvac_mode` solo para `rack` y requiere `mode`
- JSON inválido responde `400`
- MQTT no disponible responde `503`

## 7. Flujo técnico
Frontend -> `POST /api/v1/commands` -> backend valida -> dispatcher publica MQTT -> `audit_command_log` registra -> edge executor responde ACK -> backend actualiza auditoría -> WebSocket emite `command_published` y `command_ack_received`.

## 8. Ejemplos curl
### soft_reboot manual para N1
```bash
curl -X POST http://127.0.0.1:3000/api/v1/commands \
  -H "Content-Type: application/json" \
  -d '{
    "zone_code": "A",
    "rack_code": "A1",
    "target_type": "nodo",
    "target_id": "N1",
    "action": "soft_reboot",
    "reason": "manual_recovery_test"
  }'
```

### hard_shutdown manual para N1
```bash
curl -X POST http://127.0.0.1:3000/api/v1/commands \
  -H "Content-Type: application/json" \
  -d '{
    "zone_code": "A",
    "rack_code": "A1",
    "target_type": "nodo",
    "target_id": "N1",
    "action": "hard_shutdown",
    "reason": "manual_emergency_shutdown"
  }'
```

### set_hvac_mode cooling para A1
```bash
curl -X POST http://127.0.0.1:3000/api/v1/commands \
  -H "Content-Type: application/json" \
  -d '{
    "zone_code": "A",
    "rack_code": "A1",
    "target_type": "rack",
    "target_id": "A1",
    "action": "set_hvac_mode",
    "mode": "cooling",
    "reason": "manual_temperature_control"
  }'
```

### payload inválido
```bash
curl -X POST http://127.0.0.1:3000/api/v1/commands \
  -H "Content-Type: application/json" \
  -d '{"action":"set_hvac_mode"}'
```

## 9. Ejemplos de respuesta JSON
### 202 Accepted
```json
{
  "status": "accepted",
  "command_id": "f7b80fbf-a4c3-482d-b06d-58890b1e8ae2",
  "action": "soft_reboot",
  "mqtt_topic": "dc/control/zona/A/rack/A1",
  "ack_status": "PENDING"
}
```

### 400 invalid_command_payload
```json
{
  "error": "invalid_command_payload",
  "detail": "set_hvac_mode requires mode"
}
```

### 400 invalid_request_body
```json
{
  "error": "invalid_request_body",
  "detail": "body must be valid JSON object"
}
```

### 503 mqtt_unavailable
```json
{
  "error": "mqtt_unavailable",
  "detail": "mqtt client is not connected"
}
```

## 10. Logs esperados
- `manual_command_requested`
- `manual_command_validated`
- `manual_command_rejected`
- `manual_command_published`
- `manual_command_failed`

## 11. Validación realizada
- `npm run build` OK
- comandos manuales publicados OK
- edge-executor recibió comando OK
- ACK publicado OK
- `audit_command_log` terminó en `ACKED` OK
- WebSocket `command_published` y `command_ack_received` OK

## 12. Relación con requerimientos
- RF-08 Intervención Manual y Control de Recuperación Segura
- RF-05 Protocolo de Mitigación
- RF-06 Bitácora de Auditoría