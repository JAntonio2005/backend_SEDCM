# Fase 5 - Escalación de nodos críticos soft_reboot a hard_shutdown

## 1. Objetivo de la fase
Implementar escalación automática para nodos en estado Critico, pasando de una acción inicial `soft_reboot` a `hard_shutdown` cuando la condición crítica persiste más allá de una ventana de gracia configurable.

## 2. Problema que resolvió
En fases previas, un nodo crítico disparaba `soft_reboot`, pero no existía una escalación temporal controlada para casos persistentes. Esta fase agrega decisión progresiva y protección anti-duplicado para evitar spam de comandos y mejorar la mitigación.

## 3. Archivos modificados
- `src/commands/command-dispatcher.ts`
- `src/repositories/command-audit.repository.ts`
- `src/config/env.ts`
- `src/mqtt/subscriptions.ts`
- `src/app.ts`

## 4. Variable de entorno agregada
- `NODE_ESCALATION_GRACE_MS`
- Default: `30000`

## 5. Flujo técnico
1. Nodo Critico por primera vez -> `soft_reboot`.
2. Nodo sigue Critico antes de la ventana de gracia -> espera.
3. Nodo sigue Critico después de la ventana de gracia -> `hard_shutdown`.
4. Nodo sigue Critico con `hard_shutdown` reciente -> no duplica comando.

## 6. Reglas implementadas
- Si no existe `soft_reboot` reciente para el nodo, publicar `soft_reboot`.
- Si existe `soft_reboot` reciente y no pasó la gracia, no escalar.
- Si existe `soft_reboot` reciente y ya pasó la gracia, publicar `hard_shutdown`.
- Si existe `hard_shutdown` reciente `PENDING` o `ACKED` dentro de 5 minutos, no repetir.

## 7. SQL usado para detectar soft_reboot reciente
```sql
SELECT
  command_id,
  ack_status,
  issued_at,
  EXTRACT(EPOCH FROM (now() - issued_at)) * 1000 AS age_ms
FROM audit_command_log
WHERE node_id = $1
  AND target_type = 'nodo'
  AND action = $2
  AND issued_at >= now() - make_interval(secs => $3)
ORDER BY issued_at DESC
LIMIT 1;
```

## 8. SQL usado para detectar hard_shutdown reciente
```sql
SELECT EXISTS (
  SELECT 1
  FROM audit_command_log
  WHERE node_id = $1
    AND target_type = 'nodo'
    AND action = $2
    AND ack_status = ANY($3::text[])
    AND issued_at >= now() - make_interval(secs => $4)
) AS exists;
```

## 9. Logs esperados
- `escalation_evaluated`
- `escalation_soft_reboot_selected`
- `escalation_waiting_grace_period`
- `escalation_hard_shutdown_selected`
- `escalation_skipped_existing_hard_shutdown`
- `escalation_failed`

## 10. Payload oficial de telemetría de nodo usado en pruebas
```json
{
  "timestamp": "2026-05-07T19:14:59.253Z",
  "metadata": {
    "dc_zone": "A",
    "dc_rack": "A1",
    "node_id": "N1"
  },
  "metrics": {
    "cpu_usage_pct": 96,
    "ram_usage_mb": 13000,
    "net_rx_bytes_sec": 1200,
    "net_tx_bytes_sec": 900
  }
}
```

## 11. Comandos mosquitto_pub corregidos con estructura oficial
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/nodo/N1" -m "{\"timestamp\":\"2026-05-07T19:14:59.253Z\",\"metadata\":{\"dc_zone\":\"A\",\"dc_rack\":\"A1\",\"node_id\":\"N1\"},\"metrics\":{\"cpu_usage_pct\":96,\"ram_usage_mb\":13000,\"net_rx_bytes_sec\":1200,\"net_tx_bytes_sec\":900}}"
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/nodo/N1" -m "{\"timestamp\":\"2026-05-07T19:15:10.149Z\",\"metadata\":{\"dc_zone\":\"A\",\"dc_rack\":\"A1\",\"node_id\":\"N1\"},\"metrics\":{\"cpu_usage_pct\":97,\"ram_usage_mb\":13100,\"net_rx_bytes_sec\":1200,\"net_tx_bytes_sec\":900}}"
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/nodo/N1" -m "{\"timestamp\":\"2026-05-07T19:15:36.028Z\",\"metadata\":{\"dc_zone\":\"A\",\"dc_rack\":\"A1\",\"node_id\":\"N1\"},\"metrics\":{\"cpu_usage_pct\":98,\"ram_usage_mb\":13200,\"net_rx_bytes_sec\":1200,\"net_tx_bytes_sec\":900}}"
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/nodo/N1" -m "{\"timestamp\":\"2026-05-07T19:15:46.907Z\",\"metadata\":{\"dc_zone\":\"A\",\"dc_rack\":\"A1\",\"node_id\":\"N1\"},\"metrics\":{\"cpu_usage_pct\":99,\"ram_usage_mb\":13300,\"net_rx_bytes_sec\":1200,\"net_tx_bytes_sec\":900}}"
```

## 12. Consultas SQL de validación
- Ver comandos del nodo:
```sql
SELECT command_id, node_id, action, reason, ack_status, issued_at
FROM audit_command_log
WHERE node_id='N1'
ORDER BY issued_at ASC;
```

- Confirmar secuencia `soft_reboot -> hard_shutdown`:
```sql
SELECT action, ack_status, issued_at
FROM audit_command_log
WHERE node_id='N1'
  AND action IN ('soft_reboot','hard_shutdown')
ORDER BY issued_at ASC;
```

- Verificar que no se duplicó `hard_shutdown` en 5 minutos:
```sql
SELECT node_id, action, COUNT(*) AS hard_count_5m
FROM audit_command_log
WHERE node_id='N1'
  AND action='hard_shutdown'
  AND issued_at >= now() - interval '5 minutes'
GROUP BY node_id, action;
```

## 13. Resultado de validación
- `npm run build` OK.
- `soft_reboot` inicial OK.
- espera de gracia OK.
- `hard_shutdown` después de 30s OK.
- anti-duplicado de `hard_shutdown` OK.
- no `escalation_failed`.

## 14. Nota técnica
Esta fase completa la escalación automática básica para nodos críticos persistentes. La ventana de gracia queda configurable para pruebas y despliegue mediante `NODE_ESCALATION_GRACE_MS`.

## 15. Relación con requerimientos
- RF-04 Motor de Reglas y Detección de Anomalías de Salud.
- RF-05 Protocolo de Mitigación por Escalación.
- RF-06 Bitácora de Auditoría.
