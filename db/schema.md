# Esquema P1 (RF-01 y RF-02)

Este documento describe el modelo relacional minimo para inventario dinamico y telemetria P1 en PostgreSQL.

## Tablas

### inventory_zone

- `zone_code` (PK)
- `first_seen_at` (TIMESTAMPTZ)
- `last_seen_at` (TIMESTAMPTZ)

Reglas:

- `zone_code` no vacio.
- `last_seen_at >= first_seen_at`.

### inventory_rack

- `zone_code` (FK -> `inventory_zone.zone_code`)
- `rack_code`
- `first_seen_at`
- `last_seen_at`
- PK compuesta: (`zone_code`, `rack_code`)

Reglas:

- `rack_code` no vacio.
- `last_seen_at >= first_seen_at`.

### inventory_node

- `node_id` (PK)
- `zone_code`, `rack_code` (FK compuesta -> `inventory_rack`)
- `source_type` (`edge_collector|simulator|unknown`)
- `first_seen_at`
- `last_seen_at`

Reglas:

- `node_id` no vacio.
- `source_type` restringido al catalogo P1.
- `last_seen_at >= first_seen_at`.

### inventory_node_location_history

- `id` (PK)
- `node_id` (FK -> `inventory_node.node_id`)
- `zone_code`, `rack_code` (FK compuesta -> `inventory_rack`)
- `valid_from`
- `valid_to` (NULL cuando esta activa)
- `is_active` (BOOLEAN)

Reglas:

- `valid_to` debe ser NULL o `>= valid_from`.
- Indice unico parcial para asegurar una sola ubicacion activa por nodo.

### telemetry_node

- `id` (PK)
- `event_time`
- `zone_code`, `rack_code` (FK compuesta -> `inventory_rack`)
- `node_id` (FK -> `inventory_node.node_id`)
- `cpu_usage_pct` (`0..100`)
- `ram_usage_mb` (`>=0`)
- `net_rx_bytes_sec` (`>=0`)
- `net_tx_bytes_sec` (`>=0`)
- `out_of_order` (BOOLEAN)
- `ingested_at` (default `now()`)

### telemetry_environment

- `id` (PK)
- `event_time`
- `zone_code`, `rack_code` (FK compuesta -> `inventory_rack`)
- `temperature_c` (`-10..85`)
- `humidity_pct` (`0..100`)
- `out_of_order` (BOOLEAN)
- `ingested_at` (default `now()`)

## Indices

- `ix_telemetry_node_event_time`
- `ix_telemetry_environment_event_time`
- `ix_telemetry_node_node_event_time`
- `ix_inventory_node_last_seen_at`
- `ux_inventory_node_location_history_single_active` (parcial)

## Verificacion esperada de T003

1. Migracion aplica en una DB vacia sin errores.
2. Existen PK/FK/check constraints en inventario y telemetria.
3. `inventory_node_location_history` permite estado activo/inactivo con una sola fila activa por `node_id`.

## Nota de diseno

Para soportar reubicacion de un mismo `node_id` entre racks/zonas (decision de T001), `node_id` se modela como identidad global del nodo y la ubicacion actual se refleja en `inventory_node` + historial en `inventory_node_location_history`.
