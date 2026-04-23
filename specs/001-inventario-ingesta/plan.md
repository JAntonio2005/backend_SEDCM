# Plan de Implementacion - Especificacion 001 (RF-01 y RF-02)

Alcance estricto de este plan:
- RF-01: Inventario dinamico (Zona, Rack, Nodo).
- RF-02: Ingesta y normalizacion de telemetria (nodo y ambiente).

Fuera de alcance explicito:
- Dashboard y WebSockets.
- Motor de reglas, mitigacion y comandos de control.
- Refactor global del repositorio.

## MVP Path (camino minimo a valor)

Ordenado por dependencia y prioridad de riesgo.

### T001 - [RESUELTO] Cierre de datos faltantes de contrato
- objetivo:
  - Cerrar datos no definidos que impactan comportamiento funcional de ingesta/inventario y no deben asumirse.
- archivos/componentes a tocar:
  - specs/001-inventario-ingesta/spec.md
  - specs/001-inventario-ingesta/plan.md
- dependencias:
  - Ninguna.
- pruebas concretas:
  - Revision documental: validar que no queden marcadores [NECESITA_DATO] en secciones operativas de RF-01/RF-02.
  - Checklist: trazar cada regla de validacion y modelo de datos a un criterio verificable.
- criterio de terminado verificable:
  - Especificacion sin huecos en:
    - catalogo source_type de Nodo,
    - politica de llegada fuera de orden,
    - tolerancia de desfase de reloj.
- estado de cierre:
  - Resuelto en `specs/001-inventario-ingesta/spec.md` con etiquetas `[DECIDIDO: ...]` para los tres puntos.
  - [BLOQUEANTE] restante explicito: ninguno para T001.
- riesgo principal:
  - Implementacion inconsistente por decisiones pendientes.

### T002 - Bootstrap minimo del backend de ingesta
- objetivo:
  - Crear base minima ejecutable del servicio de ingesta sin tocar dominios fuera de RF-01/RF-02.
- archivos/componentes a tocar:
  - package.json
  - src/app.ts
  - src/config/env.ts
  - src/bootstrap/http.ts
  - src/bootstrap/mqtt.ts
- dependencias:
  - T001.
- pruebas concretas:
  - Arranque local del proceso con validacion de variables de entorno requeridas.
  - Healthcheck HTTP simple para confirmar proceso activo.
- criterio de terminado verificable:
  - Servicio inicia, carga configuracion y abre conexion MQTT/HTTP sin errores fatales.
- riesgo principal:
  - Configuracion incompleta de entorno (broker/DB/TLS).

### T003 - Modelo de persistencia para inventario y telemetria P1
- objetivo:
  - Definir y aplicar esquema relacional minimo para RF-01/RF-02 con historial de ubicacion de nodo.
- archivos/componentes a tocar:
  - db/migrations/001_inventory_telemetry.sql
  - db/schema.md
  - src/repositories/db.ts
- dependencias:
  - T002.
- pruebas concretas:
  - Ejecutar migracion en base vacia.
  - Validar constraints unicos y foraneos de Zona/Rack/Nodo.
  - Validar tabla de historial de ubicaciones activa/inactiva.
- criterio de terminado verificable:
  - Migracion aplicable de principio a fin y esquema consultable con todas las entidades de la spec.
- riesgo principal:
  - Diseño de claves naturales/foraneas incorrecto que rompa upserts.

### T004 - Suscripcion MQTT y ruteo por topico de telemetria
- objetivo:
  - Consumir solo topicos P1 y enrutar mensajes a pipelines nodo/ambiente.
- archivos/componentes a tocar:
  - src/mqtt/subscriptions.ts
  - src/mqtt/router.ts
  - src/mqtt/topic-parser.ts
- dependencias:
  - T002, T003.
- pruebas concretas:
  - Publicar mensaje valido en:
    - dc/telemetria/zona/Z/rack/R/nodo/N
    - dc/telemetria/zona/Z/rack/R/ambiente
  - Verificar ruteo al handler correcto.
  - Verificar rechazo de topicos fuera de alcance P1.
- criterio de terminado verificable:
  - Router discrimina correctamente topicos de nodo y ambiente y no procesa topicos OUT.
- riesgo principal:
  - Parseo de topico ambiguo que afecte validacion topico-payload.

### T005 - Validacion de ingesta y normalizacion de payload
- objetivo:
  - Implementar validaciones minimas, rangos, opcionales permitidos y deduplicacion definida.
- archivos/componentes a tocar:
  - src/ingest/validators/node-telemetry.validator.ts
  - src/ingest/validators/environment-telemetry.validator.ts
  - src/ingest/normalizers/node-telemetry.normalizer.ts
  - src/ingest/normalizers/environment-telemetry.normalizer.ts
  - src/ingest/dedupe/dedupe-key.ts
- dependencias:
  - T004.
- pruebas concretas:
  - Casos validos por tipo de payload.
  - Casos invalidos de tipos/rangos/campos faltantes.
  - Mismatch topico-payload.
  - Campos opcionales fuera de metadata.extra.
  - Duplicado exacto por clave de dedupe.
- criterio de terminado verificable:
  - Mensajes invalidos se rechazan con causa; validos se normalizan de forma consistente.
- riesgo principal:
  - Falsos positivos/negativos en deduplicacion.

### T006 - Servicio de inventario dinamico con historial de reubicacion
- objetivo:
  - Crear/actualizar Zona, Rack y Nodo y mantener historial al cambiar de ubicacion.
- archivos/componentes a tocar:
  - src/domain/inventory/inventory.service.ts
  - src/domain/inventory/inventory.repository.ts
  - src/domain/inventory/location-history.service.ts
- dependencias:
  - T003, T005.
- pruebas concretas:
  - Primera observacion crea Zona/Rack/Nodo.
  - Reobservacion actualiza last_seen_at sin duplicar.
  - Cambio de rack/zona para mismo node_id cierra asignacion previa y crea nueva activa.
- criterio de terminado verificable:
  - Inventario persistido consistente y trazable para los tres escenarios.
- riesgo principal:
  - Condiciones de carrera en upserts concurrentes.

### T007 - Persistencia de telemetria vinculada a inventario
- objetivo:
  - Guardar telemetria de nodo y ambiente asociada a entidades de inventario en transaccion segura.
- archivos/componentes a tocar:
  - src/domain/telemetry/telemetry.service.ts
  - src/domain/telemetry/telemetry.repository.ts
  - src/domain/ingest/ingest.pipeline.ts
- dependencias:
  - T006.
- pruebas concretas:
  - Insercion de telemetria de nodo y ambiente despues de inventario.
  - Garantia de no insercion al fallar validacion.
  - Garantia de no doble insercion en duplicados.
- criterio de terminado verificable:
  - Telemetria persistida con relaciones correctas y sin side effects en rechazos.
- riesgo principal:
  - Inconsistencia transaccional entre inventario y telemetria.

### T008 - Observabilidad minima de P1
- objetivo:
  - Exponer logs JSON a stdout y endpoint /metrics con contadores requeridos.
- archivos/componentes a tocar:
  - src/observability/logger.ts
  - src/observability/metrics.ts
  - src/http/metrics.route.ts
- dependencias:
  - T007.
- pruebas concretas:
  - Verificar estructura JSON de logs en eventos accepted/rejected/duplicated.
  - Consultar /metrics y validar processed/rejected/persisted.
- criterio de terminado verificable:
  - Observabilidad cumple NFR-004 con evidencia en ejecucion.
- riesgo principal:
  - Contadores no atomicos en alta concurrencia.

### T009 - Suite de pruebas de aceptacion P1
- objetivo:
  - Cubrir criterios SC-001 a SC-004 con pruebas repetibles.
- archivos/componentes a tocar:
  - tests/contract/mqtt-node.contract.test.ts
  - tests/contract/mqtt-environment.contract.test.ts
  - tests/integration/inventory-dynamic.integration.test.ts
  - tests/integration/ingest-validation.integration.test.ts
  - tests/load/p1-throughput.load.test.ts
- dependencias:
  - T008.
- pruebas concretas:
  - Contratos de payload/topico.
  - Integracion de inventario dinamico.
  - Integracion de rechazos por validacion.
  - Carga para >=10000 msg/min y p95 <=250ms.
- criterio de terminado verificable:
  - Todos los SC pasan con reporte reproducible.
- riesgo principal:
  - Entorno de prueba no representativo para objetivo de carga.

## Ruta de ejecucion sugerida (dependencias)

1. T001
2. T002
3. T003
4. T004
5. T005
6. T006
7. T007
8. T008
9. T009

## Notas de control de alcance

- Cualquier requerimiento de comando de control, ACK operativo, dashboard o reglas de mitigacion se rechaza en esta fase por estar fuera de RF-01/RF-02.
- No se incluye refactor de otras features o carpetas no implicadas en la ruta anterior.
