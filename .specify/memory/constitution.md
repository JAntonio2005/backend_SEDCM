<!--
Sync Impact Report
- Version change: N/A (template) -> 1.0.0
- Modified principles:
	- [PRINCIPLE_1_NAME] -> I. Edge-First y Desacoplamiento por Eventos
	- [PRINCIPLE_2_NAME] -> II. Automatizacion Deterministica de Mitigacion
	- [PRINCIPLE_3_NAME] -> III. Seguridad MQTTS Obligatoria en LAN
	- [PRINCIPLE_4_NAME] -> IV. Resiliencia y Auto-Recuperacion en Borde
	- [PRINCIPLE_5_NAME] -> V. Trazabilidad Inmutable y Visibilidad en Tiempo Real
- Added sections:
	- Estandares Tecnicos y Restricciones Operativas
	- Flujo de Desarrollo y Puertas de Calidad
- Removed sections:
	- Ninguna
- Templates requiring updates:
	- .specify/templates/plan-template.md ✅ updated
	- .specify/templates/spec-template.md ✅ updated
	- .specify/templates/tasks-template.md ✅ updated
	- .specify/templates/commands/*.md ✅ no files found (N/A)
	- .specify/extensions/git/README.md ✅ no constitution-specific references required
- Follow-up TODOs:
	- Ninguno
-->

# SEDCM Constitution

## Core Principles

### I. Edge-First y Desacoplamiento por Eventos
El backend y los agentes de borde MUST comunicarse unicamente por publicacion/
suscripcion MQTT bajo topicos versionados y jerarquicos por zona/rack/nodo.
Ningun servicio central MAY depender de IP fija de nodos de borde en la logica de
negocio. Todo nuevo componente MUST integrarse al bus de eventos sin acoplamiento
directo entre procesos.
Rationale: Este principio permite escalar por zonas y tolerar cambios de red sin
recompilar ni redisenar el plano de control.

### II. Automatizacion Deterministica de Mitigacion
El motor de reglas MUST implementar umbrales explicitos y estados verificables
(Normal, Advertencia, Critico, Fuera de Servicio). Toda mitigacion MUST seguir
escalacion deterministica: primera accion soft_reboot; segunda accion hard_shutdown
si no hay recuperacion en la ventana definida. El control manual MUST respetar
bloqueos de seguridad termica y ambiental antes de permitir recuperacion.
Rationale: La respuesta automatica reproducible reduce riesgo operativo y evita
acciones manuales inseguras durante incidentes.

### III. Seguridad MQTTS Obligatoria en LAN
Toda telemetria, comando y ACK MUST viajar por MQTTS con TLS/SSL activo. Los
certificados y credenciales MUST gestionarse fuera del codigo fuente (variables de
entorno o secretos de despliegue). Ningun topico de control MUST aceptar trafico no
cifrado en entornos de demostracion o produccion.
Rationale: Una LAN no elimina riesgo de intercepcion o inyeccion de comandos;
el cifrado y autenticacion son controles minimos no negociables.

### IV. Resiliencia y Auto-Recuperacion en Borde
Los agentes Edge Collector y Edge Executor MUST soportar desconexion temporal del
broker y MUST reintentar con backoff exponencial y re-suscripcion automatica. Las
operaciones criticas MUST ser idempotentes para evitar efectos duplicados ante
reintentos. El sistema MUST degradar con seguridad antes de perder control total.
Rationale: La red local y los nodos fisicos fallan de forma intermitente; la
continuidad operacional depende de recuperacion autonoma.

### V. Trazabilidad Inmutable y Visibilidad en Tiempo Real
Cada comando emitido MUST generar registro de auditoria inmutable con motivo,
objetivo, timestamp y estado de ACK. El backend MUST exponer eventos en tiempo
real para dashboard via WebSockets sin recarga de pagina. Los cambios de estado
MUST poder reconstruirse historicamente desde persistencia.
Rationale: Sin trazabilidad de decisiones no existe capacidad forense ni evidencia
de cumplimiento operativo.

## Estandares Tecnicos y Restricciones Operativas

- Stack base del backend: Node.js + TypeScript para control plane y reglas.
- Persistencia: PostgreSQL para inventario, series de telemetria y bitacora.
- Mensajeria: broker MQTT con namespace consistente y versionado de payloads JSON.
- Integracion de borde: agentes Python con control via API local de Docker.
- Rendimiento: el flujo evento-critico -> comando mitigacion SHOULD mantenerse en
	<= 2 segundos end-to-end para escenarios de demostracion.
- Despliegue: componentes MUST ser contenerizados y orquestables en red LAN local.
- Seguridad operacional: cualquier accion de recuperacion manual MUST validarse
	contra reglas de temperatura/humedad de recuperacion segura.

## Flujo de Desarrollo y Puertas de Calidad

1. Todo cambio funcional MUST iniciar con historia de usuario y criterios de
aceptacion medibles.
2. Cambios en topicos MQTT, payloads o contratos de comandos MUST incluir pruebas
de contrato e integracion entre backend y borde.
3. Cambios en motor de reglas MUST incluir pruebas de escalacion (soft_reboot /
hard_shutdown) y pruebas de bloqueo por seguridad ambiental.
4. Antes de merge, MUST validarse al menos: lint, pruebas unitarias relevantes,
pruebas de integracion de mensajeria y verificacion de migraciones SQL.
5. Toda incidencia critica MUST dejar evidencia en bitacora y en reporte tecnico
de post-mortem para ajustar reglas o umbrales.

## Governance
Esta constitucion prevalece sobre convenciones ad-hoc del repositorio para el
backend SEDCM.

- Proceso de enmienda: toda propuesta MUST incluir principio afectado,
justificacion tecnica, impacto de migracion y actualizacion de plantillas.
- Politica de versionado:
	- MAJOR cuando se elimina o redefine un principio de forma incompatible.
	- MINOR cuando se agrega un principio o se amplian obligaciones de cumplimiento.
	- PATCH para aclaraciones editoriales sin cambio normativo.
- Revisión de cumplimiento: toda planificacion y PR MUST pasar Constitution Check
explicito, con evidencia de pruebas y controles de seguridad aplicables.

**Version**: 1.0.0 | **Ratified**: 2026-04-15 | **Last Amended**: 2026-04-15
