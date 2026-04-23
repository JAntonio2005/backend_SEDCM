# Feature Specification: Especificacion 001 - Inventario e Ingesta Base (RF-01 y RF-02)

**Feature Branch**: 001-speckit-git-feature  
**Created**: 2026-04-15  
**Status**: Draft  
**Input**: User description: "Generar Especificacion 001 (P1) enfocada solo en RF-01 y RF-02, usando solo el archivo de diagramas, con contratos minimos, alcance IN/OUT, criterios medibles, supuestos, riesgos y preguntas abiertas."

## Clarifications

### Session 2026-04-15

- Q: Que politica de deduplicacion debe usar P1 para evitar duplicados sin perder eventos reales? -> A: Dedupe por `topic + metadata(dc_zone, dc_rack, node_id si aplica) + timestamp + hash(payload)`.
- Q: Que hacer si un `node_id` aparece en una zona/rack distinta? -> A: Mantener historial, cerrar asignacion anterior y crear nueva asignacion activa.
- Q: Que rangos minimos deben validarse en P1 para evitar datos espurios? -> A: CPU `0..100`, RAM `>=0`, Net Rx/Tx `>=0`, Temperatura `-10..85`, Humedad `0..100`.
- Q: Que objetivo de rendimiento debe tener P1 para SC-004/NFR-002? -> A: `>= 10000 msg/min` con latencia p95 `<= 250 ms`.
- Q: Que formato/destino de observabilidad debe usar P1? -> A: Logs estructurados JSON a stdout y endpoint `/metrics` con contadores `processed/rejected/persisted`.
- Q: Que campos opcionales se permiten en payload sin rechazo? -> A: Solo `metadata.extra` como objeto JSON, maximo 10 claves y valores primitivos (`string/number/boolean`).
- Q: Cual debe ser el catalogo minimo de `source_type` en Nodo para P1? -> A: `edge_collector`, `simulator`, `unknown`.
- Q: Cual debe ser la tolerancia temporal de ingesta para timestamps? -> A: Ventana de `±120 s`; fuera de ventana se rechaza como `timestamp_out_of_window`.
- Q: Como tratar eventos fuera de orden temporal (dentro de la ventana valida)? -> A: Aceptarlos y marcarlos con `out_of_order=true`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registro dinamico del inventario (Priority: P1)

Como operador tecnico del sistema, quiero que el backend construya y mantenga automaticamente el inventario de zonas, racks y nodos a partir de la telemetria recibida, para tener una vista consistente de los activos sin alta manual.

**Why this priority**: Sin inventario dinamico no existe base confiable para relacionar telemetria con activos.

**Independent Test**: Publicar telemetria valida de nodos y ambiente en topicos definidos y verificar que el backend crea/actualiza Zona, Rack y Nodo en persistencia.

**Acceptance Scenarios**:

1. **Given** que el backend esta suscrito a topicos de telemetria, **When** llega un mensaje valido de nodo con metadata de zona/rack/nodo, **Then** el sistema crea o actualiza el inventario jerarquico correspondiente.
2. **Given** que una zona/rack ya existe en inventario, **When** llega telemetria de un nodo nuevo en ese rack, **Then** se registra el nodo nuevo sin duplicar zona ni rack.

---

### User Story 2 - Ingesta y normalizacion de telemetria (Priority: P1)

Como backend central, quiero ingerir telemetria de nodos y ambiente desde MQTT y normalizarla en un formato consistente, para almacenarla y dejarla disponible para procesos posteriores.

**Why this priority**: La ingesta normalizada habilita trazabilidad de datos operativos y base para automatizaciones futuras.

**Independent Test**: Publicar mensajes validos/invalidos de telemetria y comprobar persistencia correcta, rechazos controlados y trazabilidad de errores de validacion.

**Acceptance Scenarios**:

1. **Given** un mensaje valido en topico de telemetria de nodo, **When** el backend lo procesa, **Then** persiste los datos normalizados y los vincula al inventario dinamico.
2. **Given** un mensaje con campos obligatorios faltantes, **When** el backend intenta procesarlo, **Then** rechaza la ingesta, registra motivo y no altera la persistencia de telemetria.

---

### Edge Cases

- Mensaje en topico correcto con tipo de dato invalido (por ejemplo, string en metrica numerica).
- Mensaje con metadata inconsistente entre topico y payload (zona/rack/nodo no coinciden).
- Mensaje duplicado: se considera duplicado cuando coincide `topic + metadata(dc_zone, dc_rack, node_id si aplica) + timestamp + hash(payload)`.
- Telemetria de ambiente sin nodo asociado (debe asociarse al rack).
- Llegada fuera de orden temporal: [DECIDIDO: si `timestamp` esta dentro de `±120 s`, el evento se acepta y se marca `out_of_order=true`; fuera de ventana se rechaza como `timestamp_out_of_window`].

## Alcance

### IN (incluido en esta especificacion)

- RF-01: Registro y gestion de inventario dinamico (zona, rack, nodo) a partir de mensajes de telemetria.
- RF-02: Recoleccion e ingesta de telemetria emulada (nodo y ambiente) con normalizacion y persistencia.
- Contratos minimos de mensajeria para telemetria de nodo y ambiente.
- Validaciones minimas de ingesta.

### OUT (fuera de esta especificacion)

- Dashboard, WebSockets y visualizacion en tiempo real.
- Motor de reglas, cambio de estado critico y mitigacion.
- Publicacion de comandos de control (soft_reboot, hard_shutdown, HVAC, extractores).
- Flujo de ACK de ejecucion de comandos.
- Alertas y notificaciones avanzadas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST suscribirse a topicos MQTT de telemetria de nodo y ambiente definidos para P1.
- **FR-002**: El sistema MUST validar esquema minimo de mensajes entrantes antes de persistir.
- **FR-003**: El sistema MUST normalizar los mensajes validos a una estructura interna consistente para almacenamiento.
- **FR-004**: El sistema MUST crear o actualizar inventario dinamico de Zona, Rack y Nodo cuando la telemetria aporte identificadores nuevos.
- **FR-005**: El sistema MUST persistir telemetria de nodo y ambiente asociada a entidades de inventario.
- **FR-006**: El sistema MUST rechazar mensajes invalidos sin afectar registros validos ya persistidos.
- **FR-007**: El sistema MUST registrar trazas de validacion fallida con causa y metadatos minimos [DECIDIDO: logs estructurados JSON a stdout].

### Contratos Minimos

#### 1) Topicos MQTT (publish/subscribe)

- **Publisher**: Edge Collector
- **Subscriber**: Backend

Topicos habilitados en P1:

- `dc/telemetria/zona/{Z}/rack/{R}/nodo/{N}`
- `dc/telemetria/zona/{Z}/rack/{R}/ambiente`

Topicos existentes pero fuera de alcance P1:

- `dc/control/zona/{Z}/rack/{R}`
- `dc/ack/zona/{Z}/rack/{R}/nodo/{N}`
- `dc/eventos/alertas`

#### 2) Payload JSON por tipo de mensaje

**a) Telemetria de nodo (ingesta P1)**

```json
{
  "timestamp": "2026-04-15T10:15:00Z",
  "metadata": {
    "dc_zone": "A",
    "dc_rack": "A1",
    "node_id": "nodo_web_01"
  },
  "metrics": {
    "cpu_usage_pct": 55.2,
    "ram_usage_mb": 1024.0,
    "net_rx_bytes_sec": 1200,
    "net_tx_bytes_sec": 980
  }
}
```

**b) Telemetria ambiental de rack (ingesta P1)**

```json
{
  "timestamp": "2026-04-15T10:15:00Z",
  "metadata": {
    "dc_zone": "A",
    "dc_rack": "A1"
  },
  "environment": {
    "temperature_c": 30.5,
    "humidity_pct": 48.0
  }
}
```

Campos opcionales adicionales: [DECIDIDO: solo se permite `metadata.extra` (objeto JSON), maximo 10 claves y valores primitivos `string/number/boolean`; campos opcionales fuera de `metadata.extra` se rechazan].

#### 3) Validaciones minimas de ingesta

- `timestamp` MUST existir y ser parseable en formato fecha-hora valido.
- `timestamp` MUST estar en ventana valida de `±120 s` respecto al reloj del backend [DECIDIDO: tolerancia temporal P1 = `±120 s`]; fuera de ventana MUST rechazarse como `timestamp_out_of_window`.
- Si un evento llega fuera de orden temporal pero dentro de la ventana valida, MUST aceptarse con marca [DECIDIDO: `out_of_order=true`].
- `metadata.dc_zone` MUST existir y no ser vacio.
- `metadata.dc_rack` MUST existir y no ser vacio.
- Para telemetria de nodo: `metadata.node_id` MUST existir y no ser vacio.
- Para telemetria de nodo: `metrics` MUST existir con campos numericos.
- Para telemetria ambiente: `environment` MUST existir con campos numericos.
- Validacion de topico vs payload:
  - Zona y rack del topico MUST coincidir con metadata.
  - Nodo del topico MUST coincidir con `metadata.node_id` en mensajes de nodo.
- Numericos fuera de rango permitido MUST rechazarse con causa de validacion:
  - `cpu_usage_pct`: `0..100`
  - `ram_usage_mb`: `>=0`
  - `net_rx_bytes_sec`: `>=0`
  - `net_tx_bytes_sec`: `>=0`
  - `temperature_c`: `-10..85`
  - `humidity_pct`: `0..100`
- Politica ante mensaje duplicado: el sistema MUST marcar como duplicado cualquier mensaje con la misma combinacion de `topic + metadata(dc_zone, dc_rack, node_id si aplica) + timestamp + hash(payload)` y MUST evitar segunda persistencia.

#### 4) Modelo de inventario dinamico

Entidades minimas:

- **Zona**
  - `zone_code` (clave natural, unica)
  - `first_seen_at`
  - `last_seen_at`

- **Rack**
  - `rack_code` (clave natural dentro de zona)
  - `zone_code` (referencia a Zona)
  - `first_seen_at`
  - `last_seen_at`

- **Nodo**
  - `node_id` (clave natural dentro de rack)
  - `zone_code` (referencia a Zona)
  - `rack_code` (referencia a Rack)
  - `first_seen_at`
  - `last_seen_at`
  - `source_type` [DECIDIDO: catalogo minimo P1 = `edge_collector`, `simulator`, `unknown`]

- **TelemetryNode**
  - `event_time`
  - `zone_code`
  - `rack_code`
  - `node_id`
  - `cpu_usage_pct`
  - `ram_usage_mb`
  - `net_rx_bytes_sec`
  - `net_tx_bytes_sec`

- **TelemetryEnvironment**
  - `event_time`
  - `zone_code`
  - `rack_code`
  - `temperature_c`
  - `humidity_pct`

Reglas de inventario dinamico:

- Primera observacion de zona/rack/nodo MUST crear entidad.
- Nueva observacion de entidad existente MUST actualizar `last_seen_at`.
- Cambios de jerarquia de un mismo `node_id` (rack/zone distinta): el sistema MUST cerrar la asignacion anterior y MUST crear una nueva asignacion activa, preservando historial de ubicaciones.

### Non-Functional Requirements *(mandatory)*

- **NFR-001 Security**: La ingesta MQTT MUST operar sobre MQTTS/TLS (puerto 8883 segun diagrama de despliegue).
- **NFR-002 Performance**: El sistema MUST soportar `>= 10000 msg/min` con latencia p95 `<= 250 ms` en pruebas de carga P1.
- **NFR-003 Reliability**: Ante error de parseo/validacion en un mensaje, el sistema MUST continuar procesando mensajes siguientes.
- **NFR-004 Observability**: La ingesta MUST emitir logs estructurados JSON a stdout y MUST exponer endpoint `/metrics` con contadores minimos `processed/rejected/persisted`.
- **NFR-005 Deployability**: Backend y dependencias MUST poder desplegarse en topologia LAN on-premise del diagrama.

### Operational Safety Constraints *(mandatory when automation/control exists)*

No aplica para P1 porque esta especificacion excluye automatizacion de control y mitigacion.

### Key Entities *(include if feature involves data)*

- **Zona**: Unidad logica de agrupacion de racks en inventario.
- **Rack**: Unidad logica dentro de una zona donde se agregan nodos y telemetria ambiente.
- **Nodo**: Activo monitoreado asociado a un rack.
- **TelemetryNode**: Registro historico de metricas de nodo para un instante de tiempo.
- **TelemetryEnvironment**: Registro historico de condiciones ambientales del rack.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En pruebas de ingesta con mensajes validos, el sistema persiste el 100% de los mensajes aceptados sin perdida de relacion zona-rack-nodo.
- **SC-002**: En pruebas de mensajes invalidos, el 100% de mensajes rechazados queda con causa de rechazo registrada y sin insercion de telemetria.
- **SC-003**: La creacion dinamica de inventario agrega entidades nuevas en la primera observacion y actualiza `last_seen_at` en observaciones posteriores en el 100% de casos de prueba.
- **SC-004**: El sistema procesa `>= 10000 msg/min` con latencia p95 `<= 250 ms` y porcentaje de error de ingesta <= `1%` en pruebas P1.

## Assumptions

- Existe un broker MQTT accesible en red LAN y configurado con MQTTS/TLS.
- El Edge Collector publica telemetria en los topicos definidos para P1.
- Backend tiene conectividad con PostgreSQL en el host central.
- Se dispone de reloj sincronizado razonablemente entre emisores y backend [DECIDIDO: tolerancia aceptable de desfase = `±120 s`].

## Riesgos Tecnicos

- Inconsistencias topico/payload pueden inflar rechazos si los emisores no estandarizan formato.
- Falta de politica de deduplicacion puede generar duplicidad de telemetria.
- Ausencia de limites de rango por metrica puede permitir datos espurios en inventario y series.
- Deriva de tiempo entre edge y backend puede afectar orden cronologico de eventos.

## Preguntas abiertas

- Ninguna.
