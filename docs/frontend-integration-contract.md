# Frontend Integration Contract

## Base URL
`http://127.0.0.1:3000`

## Endpoints REST

### 1) GET `/api/v1/inventory`
Devuelve jerarquia de zonas -> racks -> nodos.

Ejemplo:
```json
{
  "zones": [
    {
      "zone_code": "A",
      "first_seen_at": "2026-05-08T00:11:34.699Z",
      "last_seen_at": "2026-05-08T00:12:20.432Z",
      "racks": [
        {
          "rack_code": "A1",
          "environment_status": "Normal",
          "first_seen_at": "2026-05-08T00:11:34.699Z",
          "last_seen_at": "2026-05-08T00:12:20.432Z",
          "nodes": [
            {
              "node_id": "N1",
              "health_status": "Critico",
              "source_type": "edge_collector",
              "first_seen_at": "2026-05-08T00:11:34.699Z",
              "last_seen_at": "2026-05-08T00:12:20.432Z"
            }
          ]
        }
      ]
    }
  ]
}
```

### 2) GET `/api/v1/nodes`
Lista plana de nodos.

Ejemplo:
```json
{
  "items": [
    {
      "node_id": "N1",
      "zone_code": "A",
      "rack_code": "A1",
      "source_type": "edge_collector",
      "health_status": "Critico",
      "first_seen_at": "2026-05-08T00:11:34.699Z",
      "last_seen_at": "2026-05-08T00:12:20.432Z"
    }
  ],
  "limit": 50
}
```

### 3) GET `/api/v1/racks`
Lista plana de racks.

Ejemplo:
```json
{
  "items": [
    {
      "zone_code": "A",
      "rack_code": "A1",
      "environment_status": "Normal",
      "first_seen_at": "2026-05-08T00:11:34.699Z",
      "last_seen_at": "2026-05-08T00:12:20.432Z"
    }
  ],
  "limit": 50
}
```

### 4) GET `/api/v1/telemetry/node`
Query params: `node_id`, `zone_code`, `rack_code`, `limit`.

Ejemplo:
```json
{
  "items": [
    {
      "id": "11",
      "event_time": "2026-05-08T00:12:20.432Z",
      "zone_code": "A",
      "rack_code": "A1",
      "node_id": "N1",
      "cpu_usage_pct": 99,
      "ram_usage_mb": 13911,
      "net_rx_bytes_sec": 1387,
      "net_tx_bytes_sec": 2564,
      "out_of_order": false,
      "ingested_at": "2026-05-08T00:12:20.435Z"
    }
  ],
  "limit": 20
}
```

### 5) GET `/api/v1/telemetry/environment`
Query params: `zone_code`, `rack_code`, `limit`.

Ejemplo:
```json
{
  "items": [
    {
      "id": "5",
      "event_time": "2026-05-08T00:12:17.566Z",
      "zone_code": "A",
      "rack_code": "A1",
      "temperature_c": 27,
      "humidity_pct": 47,
      "out_of_order": false,
      "ingested_at": "2026-05-08T00:12:17.569Z"
    }
  ],
  "limit": 20
}
```

### 6) GET `/api/v1/audit/commands`
Query params: `zone_code`, `rack_code`, `node_id`, `ack_status`, `action`, `limit`.

Ejemplo:
```json
{
  "items": [
    {
      "id": "2",
      "command_id": "bcada259-d194-4423-84ac-c48acd02bb70",
      "zone_code": "A",
      "rack_code": "A1",
      "node_id": "N1",
      "target_type": "nodo",
      "action": "hard_shutdown",
      "reason": "node_critical_persistent_hard_shutdown",
      "mqtt_topic": "dc/control/zona/A/rack/A1",
      "payload": {
        "command_id": "bcada259-d194-4423-84ac-c48acd02bb70",
        "action": "hard_shutdown"
      },
      "issued_at": "2026-05-08T00:12:07.699Z",
      "ack_status": "ACKED",
      "ack_received_at": "2026-05-08T00:12:08.206Z",
      "ack_payload": {
        "status": "ACKED",
        "executor_id": "executor-A1"
      }
    }
  ],
  "limit": 20
}
```

## WebSocket
`ws://127.0.0.1:3000/ws`

Formato comun:
```json
{
  "type": "node_status_changed",
  "timestamp": "2026-05-08T00:12:53.777Z",
  "data": { }
}
```

## Eventos WebSocket
- `telemetry_node_received`
- `telemetry_environment_received`
- `node_status_changed`
- `rack_status_changed`
- `command_published`
- `command_ack_received`
- `escalation_event`

### Ejemplo `telemetry_node_received`
```json
{
  "type": "telemetry_node_received",
  "timestamp": "2026-05-08T00:12:53.772Z",
  "data": {
    "topic": "dc/telemetria/zona/A/rack/A1/nodo/N2",
    "timestamp": "2026-05-08T00:12:54.587Z",
    "metadata": { "dc_zone": "A", "dc_rack": "A1", "node_id": "N2" },
    "metrics": {
      "cpu_usage_pct": 98,
      "ram_usage_mb": 13050,
      "net_rx_bytes_sec": 1500,
      "net_tx_bytes_sec": 1100
    }
  }
}
```

### Ejemplo `telemetry_environment_received`
```json
{
  "type": "telemetry_environment_received",
  "timestamp": "2026-05-08T00:13:03.176Z",
  "data": {
    "topic": "dc/telemetria/zona/A/rack/A1/ambiente",
    "timestamp": "2026-05-08T00:13:03.160Z",
    "metadata": { "dc_zone": "A", "dc_rack": "A1" },
    "environment": { "temperature_c": 27, "humidity_pct": 50 }
  }
}
```

### Ejemplo `node_status_changed`
```json
{
  "type": "node_status_changed",
  "timestamp": "2026-05-08T00:12:53.777Z",
  "data": {
    "node_id": "N2",
    "zone_code": "A",
    "rack_code": "A1",
    "previous_status": "Normal",
    "new_status": "Critico"
  }
}
```

### Ejemplo `rack_status_changed`
```json
{
  "type": "rack_status_changed",
  "timestamp": "2026-05-08T00:20:00.000Z",
  "data": {
    "zone_code": "A",
    "rack_code": "A1",
    "previous_status": "Normal",
    "new_status": "Critico"
  }
}
```

### Ejemplo `command_published`
```json
{
  "type": "command_published",
  "timestamp": "2026-05-08T00:12:53.784Z",
  "data": {
    "command_id": "f7b80fbf-a4c3-482d-b06d-58890b1e8ae2",
    "mqtt_topic": "dc/control/zona/A/rack/A1",
    "action": "soft_reboot",
    "reason": "node_critical_soft_reboot",
    "target_type": "nodo",
    "target_id": "N2",
    "zone_code": "A",
    "rack_code": "A1",
    "node_id": "N2"
  }
}
```

### Ejemplo `command_ack_received`
```json
{
  "type": "command_ack_received",
  "timestamp": "2026-05-08T00:12:54.305Z",
  "data": {
    "topic": "dc/ack/zona/A/rack/A1",
    "zone_code": "A",
    "rack_code": "A1",
    "command_id": "f7b80fbf-a4c3-482d-b06d-58890b1e8ae2",
    "status": "ACKED",
    "timestamp_ack": "2026-05-08T00:12:54.303Z"
  }
}
```

### Ejemplo `escalation_event`
```json
{
  "type": "escalation_event",
  "timestamp": "2026-05-08T00:12:53.781Z",
  "data": {
    "stage": "soft_reboot_selected",
    "node_id": "N2",
    "zone_code": "A",
    "rack_code": "A1",
    "reason": "no_recent_soft_reboot"
  }
}
```

## Recomendacion de integracion frontend
1. Cargar estado inicial con REST (`inventory`, `nodes`, `racks`, `telemetry`, `audit`).
2. Mantener conexion WebSocket en `/ws` para actualizacion en vivo.
3. Actualizar UI por tipo de evento:
   - Cards de estado: `node_status_changed`, `rack_status_changed`
   - Graficas: `telemetry_node_received`, `telemetry_environment_received`
   - Consola de auditoria/comandos: `command_published`, `command_ack_received`, `escalation_event`