# Fase 1 - Persistencia de telemetria MQTT en PostgreSQL

## Objetivo de la fase
Implementar persistencia minima para toda telemetria MQTT aceptada (nodo y ambiente) despues de validacion, normalizacion y dedupe.

## Problema que resolvio
El backend aceptaba mensajes MQTT, pero no existia persistencia transaccional consolidada para:
- Inventario dinamico (zona, rack, nodo).
- Historico de telemetria de nodo y ambiental.

## Archivos creados/modificados
- Creado: `src/repositories/telemetry.repository.ts`
- Modificado: `src/mqtt/subscriptions.ts`
- Modificado: `src/app.ts` (verificacion de DB al arranque y cierre de pool)
- Base de esquema usada: `db/migrations/001_inventory_telemetry.sql`

## Flujo tecnico
`MQTT -> validacion -> normalizacion -> dedupe -> PostgreSQL`

1. Se recibe mensaje en `dc/telemetria/#`.
2. Se valida payload y coherencia topico/payload.
3. Se normaliza estructura de nodo o ambiente.
4. Se aplica dedupe por stream/evento.
5. Si el mensaje es aceptado, se persiste en PostgreSQL.

## Tablas involucradas
- `inventory_zone`
- `inventory_rack`
- `inventory_node`
- `telemetry_node`
- `telemetry_environment`

## UPSERT de inventario (resumen)
Para cada telemetria aceptada se hace `INSERT ... ON CONFLICT DO UPDATE` sobre `inventory_zone`, `inventory_rack` y, para nodo, `inventory_node`.
Se mantiene `first_seen_at` inicial y se actualiza `last_seen_at` con el valor mas reciente.

## Transacciones BEGIN/COMMIT/ROLLBACK (resumen)
Cada persistencia corre en una transaccion explicita:
- `BEGIN` al iniciar.
- `COMMIT` si todas las operaciones terminan correctamente.
- `ROLLBACK` ante cualquier error para evitar datos parciales.

## Logs esperados
- `mqtt_ingest_accepted`
- `mqtt_ingest_persisted`
- `mqtt_ingest_persistence_failed`

## Comandos de prueba (mosquitto_pub)
Nota: `timestamp` debe estar dentro de +/-120s respecto al reloj del backend.

### Telemetria de nodo
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/nodo/NODO-01" -m '{
  "timestamp": "<ISO_TIMESTAMP_ACTUAL>",
  "metadata": {
    "dc_zone": "A",
    "dc_rack": "A1",
    "node_id": "NODO-01"
  },
  "metrics": {
    "cpu_usage_pct": 52,
    "ram_usage_mb": 4096,
    "net_rx_bytes_sec": 1500,
    "net_tx_bytes_sec": 1200
  }
}'
```

### Telemetria ambiental
```bash
mosquitto_pub -h 127.0.0.1 -t "dc/telemetria/zona/A/rack/A1/ambiente" -m '{
  "timestamp": "<ISO_TIMESTAMP_ACTUAL>",
  "metadata": {
    "dc_zone": "A",
    "dc_rack": "A1"
  },
  "environment": {
    "temperature_c": 26,
    "humidity_pct": 50
  }
}'
```

## Consultas SQL de verificacion
```sql
SELECT * FROM inventory_zone ORDER BY last_seen_at DESC;
SELECT * FROM inventory_rack ORDER BY last_seen_at DESC;
SELECT * FROM inventory_node ORDER BY last_seen_at DESC;

SELECT * FROM telemetry_node ORDER BY event_time DESC LIMIT 20;
SELECT * FROM telemetry_environment ORDER BY event_time DESC LIMIT 20;
```

## Resultado de validacion
- `npm run build` OK
- `npm run dev` OK
- Persistencia validada OK

## Relacion con requerimientos
- RF-02 Recoleccion y Normalizacion de Telemetria Emulada
- RF-06 Persistencia Historica
