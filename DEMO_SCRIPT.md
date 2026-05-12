# SEDCM Demo Script

## 1. Objetivo de la demo

Mostrar, de punta a punta, como SEDCM:

- recibe telemetria desde edge devices
- persiste datos y estados en backend
- visualiza operacion en tiempo real en el dashboard
- ejecuta mitigacion automatica
- permite control manual
- detecta activos OFFLINE por silencio de telemetria

## 2. Arquitectura resumida

`Edge Collector -> MQTT -> Backend -> PostgreSQL -> WebSocket/REST -> Frontend -> Edge Executor -> ACK`

Frase sugerida para la exposicion:

> SEDCM integra monitoreo, reglas, auditoria y accion remota sobre infraestructura edge en un flujo unico y observable.

## 3. Requisitos previos

- Docker Desktop en ejecucion
- Node.js instalado
- repositorio `Backend SEDCM`
- repositorio `SEDCMFront`
- puertos libres: `3000`, `5173`, `1883`, `5432`

## 4. Preparacion

Abrir dos terminales:

1. una en `Backend SEDCM`
2. otra en `SEDCMFront`

Verificar puertos si hace falta:

```powershell
netstat -ano | findstr :3000
netstat -ano | findstr :5173
netstat -ano | findstr :1883
netstat -ano | findstr :5432
```

## 5. Levantar backend

Desde `Backend SEDCM`:

```bash
docker compose up --build
```

Que debe quedar disponible:

- REST y WebSocket en `http://127.0.0.1:3000`
- broker MQTT en `1883`
- PostgreSQL en `5432`
- `edge-collector-a1`
- `edge-executor-a1`

Opcional para revisar logs:

```bash
docker compose logs -f backend edge-collector-a1 edge-executor-a1
```

## 6. Levantar frontend

Desde `SEDCMFront`:

```bash
npm install
npm run dev
```

Abrir:

```text
http://127.0.0.1:5173
```

## 7. Validacion inicial

Confirmar en la barra superior:

- `Backend: conectado`
- `Datos: backend`
- `Tiempo real: conectado`

Confirmar inventario visible:

- `Zona A`
- `Rack A1`
- `N1`

Frase sugerida:

> Aqui comprobamos que el frontend no esta en mock: esta leyendo inventario real por REST y eventos en vivo por WebSocket.

## 8. Demo 1: telemetria automatica

### Operativo

Revisar en backend:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/v1/inventory
```

Si se quiere mostrar actividad reciente:

```bash
docker compose logs --tail=30 backend
docker compose logs --tail=30 edge-collector-a1
```

### Que debe verse en frontend

- metricas de CPU, RAM, red, temperatura y humedad
- historial reciente
- estados de rack y nodo actualizandose

### Que decir

> El Edge Collector publica telemetria por MQTT, el backend la persiste en PostgreSQL y la expone al dashboard por REST y WebSocket sin recargar la pagina.

## 9. Demo 2: mitigacion automatica

### Operativo

Mostrar logs recientes:

```bash
docker compose logs --tail=50 backend
docker compose logs --tail=50 edge-executor-a1
```

Tambien se puede consultar auditoria:

```bash
curl "http://127.0.0.1:3000/api/v1/audit/commands?limit=10"
```

### Que debe ocurrir

- el nodo entra en estado critico
- backend publica `soft_reboot`
- executor recibe el comando
- executor responde ACK
- si el problema persiste, backend escala a `hard_shutdown`

### Que debe verse en frontend

- logs con `command_published`
- logs con `ACKED`
- continuidad del historial y estado del nodo

### Que decir

> Aqui el sistema no solo observa: tambien actua. Primero intenta una mitigacion suave y, si el problema persiste, escala automaticamente a una accion mas fuerte.

## 10. Demo 3: control manual

### Operativo

En frontend, seleccionar:

- `Zona A`
- `Rack A1`

Usar:

- `Reiniciar`
- `Apagar`
- `Aplicar cooling`

Si hace falta verificar backend:

```bash
curl "http://127.0.0.1:3000/api/v1/audit/commands?limit=10"
docker compose logs --tail=30 backend
docker compose logs --tail=30 edge-executor-a1
```

### Que debe verse en frontend

- log local de comando enviado
- respuesta operativa reflejada en logs
- ACK por WebSocket

### Que decir

> Ademas de la automatizacion, el operador puede intervenir desde el dashboard. El comando entra por API REST, se audita, se publica por MQTT y el ACK regresa en tiempo real.

## 11. Demo 4: deteccion OFFLINE

### Operativo

Detener el collector:

```bash
docker compose stop edge-collector-a1
```

Esperar mas de `OFFLINE_TIMEOUT_MS`.

Verificar inventario:

```bash
curl http://127.0.0.1:3000/api/v1/inventory
```

Reiniciar collector:

```bash
docker compose start edge-collector-a1
```

### Que debe verse en frontend

Con collector detenido:

- `N1` cambia a `OFFLINE`
- `Rack A1` cambia a `OFFLINE`
- labels tipo `Sin telemetria reciente`
- estilo visual distinto de `Critico`

Al reiniciar collector:

- `N1` vuelve a `Critico` o `Normal`
- `Rack A1` vuelve a `Normal` o al estado ambiental correspondiente

### Que decir

> Si un activo deja de reportar, no se queda con un ultimo estado engañoso. El sistema detecta silencio de telemetria y lo marca como OFFLINE hasta que vuelve a recibir datos.

## 12. Consultas REST utiles

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/v1/inventory
curl "http://127.0.0.1:3000/api/v1/audit/commands?limit=10"
curl "http://127.0.0.1:3000/api/v1/telemetry/node?node_id=N1&zone_code=A&rack_code=A1&limit=10"
curl "http://127.0.0.1:3000/api/v1/telemetry/environment?zone_code=A&rack_code=A1&limit=10"
```

## 13. Consultas SQL utiles

```sql
SELECT node_id, health_status, last_seen_at
FROM inventory_node;
```

```sql
SELECT zone_code, rack_code, environment_status, last_seen_at
FROM inventory_rack;
```

```sql
SELECT command_id, action, ack_status, ack_received_at
FROM audit_command_log
ORDER BY issued_at DESC
LIMIT 10;
```

## 14. Problemas comunes y solucion

### Docker no abre

- iniciar Docker Desktop
- esperar a que el motor quede listo
- volver a correr:

```bash
docker compose up --build
```

### Puerto 3000 ocupado

- revisar:

```powershell
netstat -ano | findstr :3000
```

- cerrar el proceso que este usando ese puerto

### Frontend muestra mock

- confirmar que backend responde `GET /health`
- confirmar `.env` del frontend:

```env
VITE_API_BASE_URL=http://127.0.0.1:3000
VITE_WS_URL=ws://127.0.0.1:3000/ws
```

- reiniciar `npm run dev`
- recargar navegador

### WebSocket desconectado

- confirmar que backend esta arriba
- confirmar `VITE_WS_URL`
- revisar consola del navegador y logs del backend

### Migracion 005 no aplicada por volumen viejo

- si PostgreSQL ya tenia volumen previo, la inicializacion automatica puede no reaplicar migraciones
- verificar constraints y datos
- si hace falta, recrear volumen o aplicar la migracion manualmente

## 15. Cierre de demo

Desde `Backend SEDCM`:

```bash
docker compose down
```

Para cerrar frontend:

```text
Ctrl + C
```
