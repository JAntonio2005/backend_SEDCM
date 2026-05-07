# Fase 4 - Recepcion de ACK MQTT y cierre de bitacora

## 1. Objetivo de la fase
Implementar la recepcion de ACK de comandos MQTT para cerrar el ciclo de auditoria de mitigacion y reflejar en base de datos el resultado de ejecucion en edge.

## 2. Problema que resolvio
En Fase 3 los comandos quedaban registrados en `audit_command_log` con `ack_status='PENDING'`, pero no existia un flujo para recibir confirmaciones (`ACKED`/`FAILED`) y cerrar la bitacora de forma trazable.

## 3. Archivos creados/modificados
- `src/mqtt/ack-handler.ts`
- `src/mqtt/subscriptions.ts`
- `src/repositories/command-audit.repository.ts`
- `db/migrations/004_ack_status_acked.sql`

## 4. Topico ACK oficial
`dc/ack/zona/{Z}/rack/{R}`

## 5. Payload ACK esperado
```json
{
  "command_id": "...",
  "timestamp_ack": "2026-05-07T05:10:00Z",
  "status": "ACKED",
  "executor_id": "executor-A1",
  "message": "Command executed successfully"
}
```

Tambien se acepta ACK fallido:
```json
{
  "command_id": "...",
  "status": "FAILED",
  "executor_id": "executor-A1",
  "message": "Command failed"
}
```

## 6. Estados permitidos
- `PENDING`
- `ACKED`
- `FAILED`

## 7. Flujo tecnico
`Comando emitido -> audit_command_log PENDING -> ACK recibido -> validacion -> actualizacion audit_command_log -> ACKED o FAILED`

## 8. Validaciones realizadas
- `command_id` requerido.
- `status` requerido.
- `status` permitido: `ACKED` o `FAILED`.
- `timestamp_ack` opcional.
- `executor_id` opcional.
- `message` opcional.
- Payload completo guardado en `ack_payload`.

## 9. SQL usado para actualizar ACK
```sql
UPDATE audit_command_log
SET
  ack_status = $2,
  ack_received_at = COALESCE($3::timestamptz, now()),
  ack_payload = $4::jsonb
WHERE command_id = $1;
```

## 10. Logs esperados
- `ack_received`
- `ack_record_updated`
- `ack_command_not_found`
- `ack_invalid_payload`
- `ack_update_failed`

## 11. Comandos de prueba (mosquitto_pub)
### ACK exitoso
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/ack/zona/A/rack/A1" -m '{
  "command_id": "<COMMAND_ID_REAL>",
  "timestamp_ack": "2026-05-07T05:10:00Z",
  "status": "ACKED",
  "executor_id": "executor-A1",
  "message": "Command executed successfully"
}'
```

### ACK fallido
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/ack/zona/A/rack/A1" -m '{
  "command_id": "<COMMAND_ID_REAL>",
  "status": "FAILED",
  "executor_id": "executor-A1",
  "message": "Command failed"
}'
```

## 12. Consultas SQL para verificar
### command_id especifico
```sql
SELECT command_id, node_id, ack_status, ack_received_at, ack_payload
FROM audit_command_log
WHERE command_id = '<COMMAND_ID_REAL>';
```

### conteo por ack_status
```sql
SELECT ack_status, COUNT(*) AS total
FROM audit_command_log
GROUP BY ack_status
ORDER BY ack_status;
```

### ultimos ACK recibidos
```sql
SELECT command_id, ack_status, ack_received_at, ack_payload
FROM audit_command_log
WHERE ack_received_at IS NOT NULL
ORDER BY ack_received_at DESC
LIMIT 20;
```

## 13. Resultado de validacion
- `npm run build` OK.
- `npm run dev` OK.
- `ACKED` validado OK.
- `FAILED` validado OK.
- Payload invalido validado OK.

## 14. Nota tecnica
Durante la validacion no habia broker MQTT local en `127.0.0.1:1883`, por lo que se utilizo temporalmente `mqtt://broker.hivemq.com:1883`.
Para el MVP final, el broker debera ejecutarse en LAN con Mosquitto/EMQX y posteriormente MQTTS/TLS.

## 15. Relacion con requerimientos
- RF-05 Protocolo de mitigacion por escalacion.
- RF-06 Persistencia historica y bitacora de auditoria.
- RNF-06 Integridad de la bitacora de auditoria.
