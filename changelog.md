# Changelog — SGA LIN Almacén 3D

> Formato: `[tipo] Módulo — Descripción`
> Tipos: **feat** · **fix** · **refactor** · **perf** · **style** · **chore**

---

## [Unreleased] — Mayo 2026

### Sprint S1 — TSP 2-opt
- **feat** `src/core/picking-logic.js` — Algoritmo TSP 2-opt (`twoOpt`): optimiza rutas abiertas invirtiendo segmentos, máx. 80 iteraciones
- **feat** `src/ui/picking-ui.js` — `startRoute()` aplica `twoOpt(serpentineRoute(stops))`; `_loadHistoryRoute()` también re-optimiza al repetir

### Sprint S2 — SSE sincronización en tiempo real
- **feat** `server.js` — `GET /events` (SSE): emite `data-changed` al modificar `datos/`; heartbeat 25 s; `fs.watch` con debounce 300 ms
- **feat** `src/core/sync.js` — `initSync()` abre `EventSource('/events')`, llama `refresh()` al recibir `data-changed`; toast informativo

### Sprint S3 — Modo escáner
- **feat** `src/ui/scanner.js` — Panel de escáner HID: captura teclado, busca en `artMap`, llama `addPickItem`; log últimas 6 lecturas
- **feat** `mapa-3d.html` + `mapa-3d.css` — Panel `#scanner-panel`; tecla `B` abre/cierra
- **feat** `src/3d/escena.js` — `Escape` cierra escáner antes que cualquier otro panel

### Sprint Móvil — App Picker
- **feat** `server.js` — `POST /picking`, `GET /picking/:id`, `POST /picking/:id/validar/:idx`, `POST /picking/:id/incidencia/:idx`, `DELETE /picking/:id`; SSE `ruta-progreso` e `incidencia`; IP local vía `os.networkInterfaces()`; `GET /server-info`
- **feat** `movil.html` + `movil.css` + `movil.js` — Interfaz mobile-first; parada activa con código grande, lista de artículos, botón Validar, barra de progreso, modo oscuro, etiquetas legibles de ubicación (`locLabel`), modal de incidencias, historial del operario, pantalla de fin con resumen
- **feat** `src/ui/picking-ui.js` — QR generado con IP real del servidor; pre-fetch QR como data:URL para evitar bloqueo PNA de Chrome en PDF; `POST /picking` al generar ruta
- **feat** `supervisor.html` + `supervisor.css` + `supervisor.js` — Panel completo de creación de rutas y monitoreo: catálogo de artículos, qty editable, avisos de stock, stats bar, filtros, eliminar/duplicar ruta, exportar CSV, badge de diferencias de cantidad recogida, SSE en tiempo real
- **feat** `index.html` — Hub de entrada con links a Visor 3D, Editor y Supervisor; dot de estado del servidor

### Fixes
- **fix** `src/3d/inventory-sprite.js` — `depthTest: false`: chip de stock ya no queda tapado por la estantería
- **fix** `src/ui/trabajadores-ui.js` — `spawnWorker` parte desde `ctrlRoomPos()` en lugar de la primera parada
- **fix** `src/ui/picking-ui.js` — PDF restaurado: plantilla HTML+CSS completa con tabla, cabecera, sumario, alertas de stock y auto-print
- **fix** `src/core/datos.js` — `refresh()` ya no llama `buildInteractableGrid()` internamente
- **fix** `src/ui/picking-ui.js` — `showSessionSummary()` solo guarda historial si `!_historySaved` (evita duplicado)
- **fix** `src/core/grafo.js` + `astar-worker.js` — `ENTRY_DIST` enviado en mensaje `setGraph`; ya no hardcoded en worker
- **fix** `src/core/picking-logic.js` — Imports muertos `AW`, `UD`, `PICK_ARRIVE_R` eliminados

### Refactoring / Arquitectura
- **refactor ARQ** — Árbol `src/` con dominios: `state/`, `core/`, `3d/`, `ui/`
- **refactor ARQ** — Store reactivo Proxy+Pub/Sub (`src/state/store.js`) reemplaza objeto `S` mutable
- **refactor ARQ** — Capa `core/` pura (sin Three.js/DOM): `grafo.js`, `datos.js`, `picking-logic.js`
- **refactor ARQ** — Web Worker para A* (`src/core/astar-worker.js`)
- **refactor ARQ** — Entry point unificado `src/3d/escena.js`
- **chore** `js/shared/constantes.json` — `UW`/`CG` centralizados; `server.js` los lee con `require()`
- **chore** `start.sh` — Auto-detecta Node vía nvm, ejecuta `npm install` si falta `node_modules`

---

## Bugs conocidos (pendientes)

> Estado: ⬜ pendiente · ✅ corregido

### 🔴 Confirmados

| ID | Estado | Archivo | Función | Descripción |
|----|--------|---------|---------|-------------|
| R1 | ✅ | `src/ui/picking-ui.js:148` | `saveRoute()` | POST a `/rutas` (endpoint eliminado) en vez de `/picking`; además pasa `nombre` en vez de `docNum`. Tecla G siempre falla silenciosamente. |
| R2 | ✅ | `supervisor.js:66-68` | `renderStats()` | `qtyCounted` aplicado dentro del reduce por ítem → se multiplica por el nº de ítems de la parada. Unidades del día incorrectas. |
| R3 | ✅ | `movil.js:282` | `reportarIncidencia()` | `textContent` no interpreta entidades HTML; el toast muestra `&#9888;` en texto plano en vez de ⚠. |
| R4 | ✅ | `src/core/picking-logic.js:87` | `serpentineRoute()` | Paradas cuyo pasillo no está en `pNums` (o sin match `/^P(\d+)/`) se insertan en `byAisle[-1]` y nunca se procesan → descartadas silenciosamente de la ruta. |

### 🟠 Probables

| ID | Estado | Archivo | Función | Descripción |
|----|--------|---------|---------|-------------|
| P1 | ✅ | `server.js:132-139` | `_readPickings` / `_writePicking` | Race condition: dos validaciones simultáneas leen el array, modifican entradas distintas y escriben; la segunda sobreescribe la primera. |
| P2 | ✅ | `server.js:188` | Handler OPTIONS | `Access-Control-Allow-Methods` no incluye `DELETE`; preflight fallará si supervisor se accede desde IP real en vez de localhost. |
| P3 | ✅ | `supervisor.js:583` | Handler SSE `ruta-progreso` | El estado local no actualiza `qtyCounted` al recibir el evento; el badge de diferencia no aparece hasta recargar. Requiere también que el servidor incluya `qtyCounted` en el broadcast. |

### 🟡 Potenciales

| ID | Estado | Archivo | Función | Descripción |
|----|--------|---------|---------|-------------|
| Q1 | ✅ | `server.js:440` | Static file handler | `startsWith(ROOT)` vulnerable si existe directorio con nombre prefijo de ROOT. Usar `startsWith(ROOT + path.sep)`. |
| Q2 | ✅ | `server.js:408` | Endpoint `/movil` | `movil.html` se sirve sin cabecera `Content-Security-Policy`; el resto de HTML sí la incluye. |
| Q3 | ✅ | `src/ui/picking-ui.js:479` | `_doExportPDF()` | `docNum` del PDF se regenera en el momento de exportar; si cruza el minuto, difiere del guardado en servidor. |
| Q4 | ✅ | `src/core/grafo.js:197` | `astarRouteWaypointsAsync()` | Si el Worker muere, la Promesa queda colgada indefinidamente; `onerror` logea pero no resuelve los pendientes. |

### 🟢 Code smells

| ID | Estado | Archivo | Descripción |
|----|--------|---------|-------------|
| CS1 | ✅ | `server.js:323,336` | Regex `pickGet`/`pickDel` idéntica evaluada dos veces; refactorizar con una sola variable + switch por method. |
| CS2 | ✅ | `server.js:163` | `readBody()` concatena con `+=` (O(N²) para muchos chunks); usar `Buffer.concat(chunks)`. |
| CS3 | ✅ | `supervisor.js:535` | `renderCard()`: paradas completadas nunca muestran badge de incidencias (el ternario salta a timestamp/diffBadge). |
| CS4 | ✅ | `src/3d/almacen.js` | Colisionadores incorrectos para rotaciones no ortogonales — añadido `console.warn` para detectar el caso. |
| CS5 | ⬜ | `src/3d/raycast.js` | `three-mesh-bvh` para raycasting O(log N); requiere CDN en importmap. |
| CS6 | ✅ | `src/ui/trabajadores-ui.js` | Mezcla lógica 3D y DOM; separado en `src/3d/trabajadores-3d.js` (meshes/animación) + `src/ui/trabajadores-ui.js` (modal). |

---

## Revisión Frontend — Mayo 2026

> Revisión exhaustiva de HTML, CSS y JS cliente. Estado: ⬜ pendiente · ✅ corregido

### 🔴 Críticos (seguridad / UX completamente rota)

| ID | Estado | Archivo | Descripción |
|----|--------|---------|-------------|
| F-C1 | ✅ | `supervisor.js:602,622` | **XSS en `showToast()`**: `el.innerHTML = msg` con datos del servidor SSE (`msg.locKey`, `msg.operario`). Un operario malicioso puede inyectar HTML arbitrario en el panel del supervisor. Fix: `textContent` para datos externos, `innerHTML` solo para literales propios. |
| F-C2 | ✅ | `mapa-3d.html:298-305` | **Doble `<importmap>`**: segundo bloque duplicado en el `<body>`. Solo puede existir uno por documento; el segundo se ignora silenciosamente en Chrome/Firefox pero puede romper Safari. Eliminar el bloque duplicado. |

### 🟠 Altos (frustran al usuario o impiden completar tareas)

| ID | Estado | Archivo | Descripción |
|----|--------|---------|-------------|
| F-A1 | ✅ | `mapa-3d.css:2317` | **Toast monocolor rojo** para todos los mensajes (éxito, aviso, error). Mensajes como "✓ Ruta guardada" se muestran con fondo de error. Añadir variantes `.toast-success` / `.toast-info` / `.toast-warn`. |
| F-A2 | ✅ | `src/ui/picking-ui.js:643` | **"Limpiar historial" sin confirmación**: `localStorage.removeItem(HISTORY_KEY)` directo, sin `confirm()`. Pérdida irreversible con un clic accidental. |
| F-A3 | ✅ | `supervisor.css:47` | **Layout supervisor no responsive**: `grid-template-columns: 420px 1fr` fijo — se rompe por debajo de ~900px. Cambiar a `minmax(340px, 420px) 1fr` + `@media` que apile en móvil/tablet. |
| F-A4 | ✅ | `movil.js:20` | **Sin botón "Reintentar" en error inicial**: `showError()` muestra un mensaje estático sin opción de recargar. El operario móvil queda bloqueado si falla la carga por red inestable. |

### 🟡 Medios (inconsistencias visuales o de UX importantes)

| ID | Estado | Archivo | Descripción |
|----|--------|---------|-------------|
| F-M1 | ✅ | `mapa-3d.html` (múltiples) | **Botones de cierre `×` sin `aria-label`**: `.pp-cls`, `.tp-cls`, `.det-cls`, `.hp-cls`, `.wm-cls`, `.sc-cls`, `.qrm-cls` contienen solo `&times;`. Un lector de pantalla anuncia "multiplicar". Añadir `aria-label="Cerrar"`. |
| F-M2 | ✅ | `mapa-3d.html:132`, `supervisor.html:28` | **Inputs de búsqueda sin `<label>` accesible**: `#pp-search` y `#art-search` solo tienen `placeholder`. Añadir `<label class="sr-only" for="pp-search">Buscar artículos</label>`. |
| F-M3 | ✅ | `mapa-3d.css:444,642,721,2258` | **`outline: none` sin sustituto de foco**: `#tp-input`, `#pp-search`, `.pp-qty` quitan el ring de foco sin reemplazarlo. Solo `.sc-input` tiene `:focus` alternativo. Añadir `:focus-visible` ring a todos los inputs. |
| F-M4 | ✅ | `mapa-3d.html`, `editor.html` | **Sin `<meta viewport>`**: visor 3D y editor carecen de viewport meta. En tablet el contenido se escala incorrectamente. `movil.html` y `supervisor.html` sí lo tienen. |
| F-M5 | ✅ | `supervisor.html:55-60`, `src/3d/trabajadores-3d.js:13` | **Lista de operarios desincronizada**: `<select id="worker-sel">` hardcodeado con 4 nombres; `WORKERS_ROSTER` tiene 5. Añadir un operario requiere editar dos ficheros. Mover la lista a `js/shared/` y cargarla dinámicamente. |

### 🟢 Bajos (accesibilidad, buenas prácticas)

| ID | Estado | Archivo | Descripción |
|----|--------|---------|-------------|
| F-B1 | ✅ | `editor.html:113` | Botón `🔄` en catálogo ERP sin `aria-label`; emojis como único contenido no tienen texto alternativo para lectores de pantalla. |
| F-B2 | ✅ | `mapa-3d.html:53-54` | Dos botones con `onclick=` inline en el menú pausa (navegar a `editor.html`, abrir `supervisor.html`). Inconsistente con el resto del proyecto; incompatible con CSP estricta sin `unsafe-inline`. |
| F-B3 | ✅ | `src/ui/picking-ui.js:117` | `startRoute()` ejecuta TSP 2-opt sincrónicamente sin indicación de carga. En rutas grandes puede congelar la UI 100-300ms sin feedback visual en el botón. |
| F-B4 | ✅ | `movil.js:157` | Al cerrar el modal de incidencia el foco vuelve al `<body>` en lugar de al botón que lo abrió. El foco se pierde para usuarios de teclado. |

---

## Roadmap

### Visor 3D
| ID | Feature | Módulo |
|----|---------|--------|
| V1 | Modo rayos X — estanterías semitransparentes (tecla X) | `almacen.js` |
| V2 | Autopilot a parada — cámara navega por A* (botón HUD) | `escena.js` + `grafo.js` |
| V3 | Minimapa interactivo — clic para teletransportarse | `minimap.js` |
| V4 | Etiquetas flotantes de stock exacto al apuntar | `peek.js` + `sprites.js` |

### Editor
| ID | Feature | Módulo |
|----|---------|--------|
| E1 | Snapping al eje del pasillo más cercano | `editor-pasillos.js` |
| E2 | Duplicar pasillo completo (ambas estanterías + meta ERP) | `editor-objetos.js` |
| E3 | Plantillas predefinidas de layout | `editor-io.js` |
| E4 | Deshacer/Rehacer visible — botones + Ctrl+Z/Y, límite 40 pasos | `editor-state.js` |

### App móvil (post-MVP)
| ID | Feature | Módulo |
|----|---------|--------|
| M5.3 | PWA básica: `manifest.json` + icono | `movil.html` |
| M5.4 | Escanear código de barras con cámara (BarcodeDetector API) | `movil.js` |
| M4.2 | Panel de rutas activas en el visor 3D (operario + % completado) | `src/ui/rutas-activas.js` |
| M4.4 | Al asignar ruta a trabajador 3D, hacer `POST /picking` automáticamente | `trabajadores-ui.js` |

### Backend / Datos
| ID | Feature | Módulo |
|----|---------|--------|
| B1 | Multi-almacén — selector en hub; cada uno con su `datos/` | `server.js` |
| B2 | API de stock externa — endpoint configurable para ERP real | `server.js` + `datos.js` |
| B3 | Usuarios y permisos — auth básica (operadores vs supervisores) | `server.js` |
