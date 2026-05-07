# Fase 2 - Motor de reglas basico Normal, Warning y Critico

## Objetivo de la fase
Evaluar telemetria ya persistida y actualizar estado operativo de nodo y rack con reglas iniciales de severidad.

## Problema que resolvio
Habia datos historicos, pero faltaba una evaluacion automatica para clasificar salud de nodo y condicion ambiental de rack.

## Archivos creados/modificados
- Creado: `src/rules/rules-engine.ts`
- Modificado: `src/mqtt/subscriptions.ts`
- Migracion agregada: `db/migrations/002_inventory_status_columns.sql`

## Columnas agregadas
- `inventory_node.health_status`
- `inventory_rack.environment_status`

## Flujo tecnico
`Telemetria persistida -> evaluacion de reglas -> actualizacion de estado`

1. Se persiste telemetria aceptada.
2. Se evalua severidad con motor de reglas.
3. Se actualiza estado de inventario si hay cambio.

## Reglas de nodo
- Normal: valores por debajo de umbral.
- Warning: `CPU >= 80` o `RAM >= 8192 MB`.
- Critico: `CPU >= 95` o `RAM >= 12288 MB`.

## Reglas ambientales
### Temperatura
- `<= 27` -> Normal
- `28 a 44` -> Warning
- `>= 45` -> Critico

### Humedad
- `40 a 60` -> Normal
- `< 40` o `> 60` -> Warning
- `< 20` o `> 80` -> Critico

El estado final de rack toma la peor severidad entre temperatura y humedad.

## Logs esperados
- `rules_evaluated`
- `node_status_changed`
- `rack_status_changed`
- `rules_evaluation_failed`

## Comandos de prueba (mosquitto_pub)
Nota: `timestamp` debe estar dentro de +/-120s.

### Nodo Normal
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/nodo/NODO-01" -m '{
  "timestamp": "<ISO_TIMESTAMP_ACTUAL>",
  "metadata": {"dc_zone":"A","dc_rack":"A1","node_id":"NODO-01"},
  "metrics": {"cpu_usage_pct": 50, "ram_usage_mb": 4096, "net_rx_bytes_sec": 1000, "net_tx_bytes_sec": 900}
}'
```

### Nodo Warning
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/nodo/NODO-01" -m '{
  "timestamp": "<ISO_TIMESTAMP_ACTUAL>",
  "metadata": {"dc_zone":"A","dc_rack":"A1","node_id":"NODO-01"},
  "metrics": {"cpu_usage_pct": 82, "ram_usage_mb": 7000, "net_rx_bytes_sec": 1000, "net_tx_bytes_sec": 900}
}'
```

### Nodo Critico
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/nodo/NODO-01" -m '{
  "timestamp": "<ISO_TIMESTAMP_ACTUAL>",
  "metadata": {"dc_zone":"A","dc_rack":"A1","node_id":"NODO-01"},
  "metrics": {"cpu_usage_pct": 96, "ram_usage_mb": 13000, "net_rx_bytes_sec": 1000, "net_tx_bytes_sec": 900}
}'
```

### Ambiente Normal
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/ambiente" -m '{
  "timestamp": "<ISO_TIMESTAMP_ACTUAL>",
  "metadata": {"dc_zone":"A","dc_rack":"A1"},
  "environment": {"temperature_c": 26, "humidity_pct": 50}
}'
```

### Ambiente Warning
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/ambiente" -m '{
  "timestamp": "<ISO_TIMESTAMP_ACTUAL>",
  "metadata": {"dc_zone":"A","dc_rack":"A1"},
  "environment": {"temperature_c": 30, "humidity_pct": 50}
}'
```

### Ambiente Critico
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/ambiente" -m '{
  "timestamp": "<ISO_TIMESTAMP_ACTUAL>",
  "metadata": {"dc_zone":"A","dc_rack":"A1"},
  "environment": {"temperature_c": 46, "humidity_pct": 50}
}'
```

## Consultas SQL de verificacion
```sql
SELECT node_id, zone_code, rack_code, health_status, last_seen_at
FROM inventory_node
ORDER BY last_seen_at DESC;

SELECT zone_code, rack_code, environment_status, last_seen_at
FROM inventory_rack
ORDER BY last_seen_at DESC;
```

## Resultado de validacion
- `npm run build` OK
- Estados de nodo y rack actualizados correctamente

## Nota tecnica
Esta fase implementa una version inicial del motor de reglas. La regla de Warning por 3 ciclos consecutivos queda pendiente para una fase posterior.

## Relacion con requerimientos
- RF-04 Motor de Reglas y Deteccion de Anomalias de Salud
- RF-06 Persistencia Historica
