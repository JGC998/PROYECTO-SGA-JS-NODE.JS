# FASE 5B — Picking / Preparación Moderna

## Metadata

| Campo           | Valor                                         |
|-----------------|-----------------------------------------------|
| Fase            | 5B                                            |
| Nombre          | Picking / Preparación Moderna                 |
| Depende de      | FASE 5A (Expediciones modernas)               |
| Archivos nuevos | 3 frontend + 1 backend                        |
| Archivos modificados | 2 (api.js, sidebar.js, stock.routes.js)  |
| Rama            | paco-clean (o nueva desde paco-clean)         |
| Estado          | PLANIFICADO — no implementar todavía          |

---

## Visión general

FASE 5B convierte la pantalla de picking en una **herramienta operativa de almacén**,
no en una tabla administrativa. El operario ve las tareas de preparación agrupadas
por expedición, navega por ellas línea a línea, detecta faltantes y confirma
preparación desde tablet o desktop.

El flujo se construye sobre los datos ya existentes en LIN (tabla ALBARANCS, campo
ACSNUMPIC) y los endpoints modernizados de FASE 5A. No se altera el modelo de datos
ni la lógica de negocio de LIN.

---

## Diagnóstico legacy

### Páginas legacy relacionadas con picking

| Ruta                                                           | Propósito detectado            |
|----------------------------------------------------------------|--------------------------------|
| `pages/opciones/logistica-y-pedidos/borrar-picking/`          | Admin — eliminar picking       |
| `pages/opciones/logistica-y-pedidos/poner-cero-carrusel/`     | Admin — resetear carrusel      |
| `pages/opciones/logistica-y-pedidos/situacion-pedidos-venta/` | Vista de estado de pedidos     |
| `pages/opciones/logistica-y-pedidos/hojas-de-ruta/`           | Hojas de ruta legacy           |

### Problemas detectados en legacy

1. **Sin UX operativa**: tablas planas sin contexto de flujo.
2. **Sin estados visuales**: estado de picking no diferenciado visualmente.
3. **Sin progreso**: no hay indicador de cuántas líneas están preparadas.
4. **Sin faltantes**: no hay detección ni aviso de artículos sin stock.
5. **Sin responsive**: diseño no usable en tablet.
6. **Sin filtros por estado**: no se puede ver "solo pendientes".
7. **Errores silenciados**: `.catch(() => {})` sin parámetro (como en FASE 5A).
8. **Acción peligrosa sin confirmación**: borrar-picking sin dialog.
9. **Sin trazabilidad de operario**: no se registra quién preparó qué.

---

## Análisis técnico

### Modelo de datos (ALBARANCS)

La tabla **ALBARANCS** es el diario de movimientos de almacén. Cada fila es una
línea de movimiento con su tipo.

| Columna        | Tipo     | Descripción                                              |
|----------------|----------|----------------------------------------------------------|
| ACSNUM         | int      | Número de albarán (clave operativa)                     |
| ACSSER         | varchar  | Serie del albarán                                        |
| ACSMOV         | char(1)  | **Tipo de movimiento** (ver tabla abajo)                |
| ACSNUMPIC      | varchar  | **Número de picking asignado** — null = sin picking     |
| ACSARTCOD      | varchar  | Código de artículo                                       |
| ACSCAN         | decimal  | Cantidad                                                 |
| ACSUBI         | varchar  | Ubicación de origen/destino                              |
| ACSLOT         | varchar  | Lote                                                     |
| ACSFEC         | datetime | Fecha del movimiento                                     |
| ACSHOR         | datetime | Hora del movimiento                                      |
| ACSCLICOD      | varchar  | Código de cliente                                        |
| ACSCLINOM      | varchar  | Nombre de cliente                                        |
| ACSREPCOD      | varchar  | Terminal/operario que ejecutó                            |
| ACSNUMCAJ      | int      | Número de caja                                           |
| ACSNUMPAL      | int      | Número de palet                                          |
| ACSEMPCOD      | varchar  | Empresa                                                  |
| ACSCENCOD      | varchar  | Centro                                                   |

### Tipos de movimiento (ACSMOV)

| Valor | Nombre         | Descripción                                           |
|-------|----------------|-------------------------------------------------------|
| `E`   | Expedición     | Línea de salida / albarán de cliente — **lo que hay que preparar** |
| `P`   | Picking        | Movimiento de recogida — creado por LIN al asignar picking |
| `R`   | Regularización | Ajuste de inventario                                  |
| _(otros)_ | Entradas/Salidas/Traspasos | Manejados por otros módulos      |

### Estado de picking — cómo lo representa LIN

LIN **no tiene tabla PICKING separada**. El estado se deriva del campo ACSNUMPIC
en la fila ACSMOV='E':

```
ACSNUMPIC IS NULL     → línea sin picking asignado (PENDIENTE)
ACSNUMPIC IS NOT NULL → línea con picking asignado (RECOGIDA)
```

El estado por albarán se calcula en frontend agregando las líneas:

```
total_lineas = count(lineas)
con_picking  = count(lineas WHERE picking IS NOT NULL)

total === 0 || con_picking === 0   → pendiente
con_picking === total              → preparado
otherwise                          → parcial
```

### Faltante (detección frontend)

Una línea es **faltante** cuando:
- `picking IS NULL` (pendiente de recoger)
- `stock_ubi === 0` (sin stock en la ubicación asignada)
- `stock_total > 0` puede haber stock en otras ubicaciones (indicar reubicación)
- `stock_total === 0` es un faltante real (sin stock en todo el almacén)

### Tabla UBICACION — zonas de picking

| Columna   | Relevancia para picking                             |
|-----------|-----------------------------------------------------|
| UBICODUBI | Código de ubicación                                  |
| UBINOM    | Nombre legible (ej. "Pasillo A Nivel 1")            |
| UBILIB    | **Flag picking** — 1 = ubicación de picking zone    |
| UBIMUL    | Flag múltiple — admite varios artículos             |
| UBIALMCOD | Almacén al que pertenece                             |

### Endpoints actuales aprovechables

| Endpoint                   | Aprovechable para picking              |
|----------------------------|----------------------------------------|
| `GET /expediciones`        | ✅ Base de datos de líneas a preparar  |
| `GET /consulta-de-stock`   | ✅ Verificar stock antes de preparar   |
| `GET /stock/:cod`          | ✅ Stock por artículo+ubicación        |
| `GET /movimientos-por-articulo` | ✅ Trazabilidad de línea          |
| `GET /situacion-pedidos-venta`  | ✅ Vista ACSMOV IN ('E','P')     |
| `POST /borrar-picking`     | ✅ Admin — eliminar picking            |

### Endpoint nuevo necesario

`GET /picking` — versión enriquecida de `/expediciones` con:
- Stock en la ubicación asignada (`stock_ubi`)
- Stock total del artículo (`stock_total`)
- Nombre de ubicación (`nom_ubicacion`)
- Almacén (`almacen`)
- Etiqueta de ubicación (`ubi_etiqueta`)

---

## Flujo operativo recomendado

```
1. OPERARIO abre pantalla Picking
        ↓
2. Ve lista de albaranes con estado (Pendiente / Parcial / Preparado)
   Filtros: fechas · búsqueda · estado
        ↓
3. Selecciona un albarán pendiente
        ↓
4. Panel detalle abre → muestra LÍNEAS del albarán:
   · Artículo + nombre
   · Cantidad pedida
   · Ubicación origen + nombre
   · Lote
   · Stock en esa ubicación
   · Estado: pendiente / recogida / faltante
        ↓
5. Operario recorre ubicaciones físicamente
   (las líneas están ordenadas por ubicación para optimizar recorrido)
        ↓
6. [Acción futura FASE 5B.2] Confirma recogida de cada línea
        ↓
7. Progreso del albarán actualiza (3/5 líneas → 5/5)
        ↓
8. Albarán queda en estado PREPARADO → pasa a Expediciones
```

---

## Diseño visual

### Layout desktop (≥ 1024px)

```
┌────────────────────────────────────────────────────────┐
│  [Desde] [Hasta] [Buscar] [Estado ▾] [Hoy][7d][30d][90d] │
├────────────────────────────────────────────────────────┤
│  TOTAL: 24   PENDIENTES: 8   PARCIALES: 5   PREPARADOS: 11 │
├──────────────────────────────┬─────────────────────────┤
│ LISTA DE TAREAS              │ PANEL DETALLE           │
│                              │                         │
│ ┌────────────────────────┐   │ Albarán 12345 · Serie E │
│ │ ████░░░░ 3/5 líneas    │   │ EMPRESA ABC S.L.        │
│ │ Alb. 12345 · PARCIAL   │   │ 11/05/2026              │
│ │ EMPRESA ABC S.L.       │   │ Picking #456            │
│ │ 11/05/2026             │   │ ─────────────────────   │
│ └────────────────────────┘   │ ████████████ 3/5 (60%)  │
│                              │ ─────────────────────   │
│ ┌────────────────────────┐   │ ✓ ART001 Tuerca M8      │
│ │ ░░░░░░░░ 0/3 líneas    │   │   x50 · A-01-01 · #2024 │
│ │ Alb. 12346 · PENDIENTE │   │                         │
│ │ TALLERES NORTE         │   │ ✓ ART002 Perno 6mm      │
│ │ 10/05/2026             │   │   x20 · B-02-03 · #2024 │
│ └────────────────────────┘   │                         │
│                              │ ○ ART003 Tornillo 4mm   │
│ ┌────────────────────────┐   │   x100 · C-01-01        │
│ │ ████████ 4/4 líneas    │   │   ⚠ Stock: 0 FALTANTE   │
│ │ Alb. 12344 · PREPARADO │   │                         │
│ └────────────────────────┘   │ ○ ART004 Arandela       │
│                              │   x30 · A-02-01 · #2024 │
└──────────────────────────────┴─────────────────────────┘
```

### Layout tablet (641px – 1023px)

- Lista a pantalla completa
- Panel detalle: drawer lateral fijo (transform translateX) — igual que expediciones
- Botones táctiles: mínimo 44px altura
- Cards grandes con progreso visual prominente
- Close button visible en panel

### Layout móvil (≤ 640px)

- Lista vertical full-width
- Panel detalle: bottom sheet (translateY desde abajo)
- Filtros colapsables (acordeón)
- Progreso bar grande, legible de un vistazo
- Acciones en tarjeta: botones grandes táctiles

---

## Componentes visuales nuevos

### pk-task (card operativa de albarán)

```
┌────────────────────────────────────────────────────┐
│ [████████░░░░] 3 / 5 líneas preparadas             │
│ Alb. 12345 · Serie E          [BADGE: PARCIAL]     │
│ EMPRESA ABC S.L.                                   │
│ 11 may 2026 · Picking #456                         │
│ 3 artículos · ⚠ 1 faltante                        │
└────────────────────────────────────────────────────┘
```

### pk-progress (barra de progreso)

Barra visual proporcional: verde (preparado) / naranja (parcial) / rojo (faltante).

### pk-linea (línea de artículo en panel)

```
 [icono estado]  ART001 — Tuerca M8 Inox
                 Cantidad: 50 ud  ·  Ubicación: A-01-01  ·  Lote: 2024001
                 Stock en ubicación: 200 ud   Stock total: 580 ud
                 [Ver movimientos]  [Ver stock]
```

Estados de icono:
- `✓` verde = picking asignado (recogida)
- `○` gris  = pendiente de recoger
- `⚠` naranja = pendiente + stock bajo (< cantidad pedida)
- `✗` rojo = faltante (stock_ubi = 0)

### pk-badge (estados de albarán)

| Estado    | Color fondo  | Color texto  |
|-----------|-------------|-------------|
| PENDIENTE | `#fef9c3`   | `#854d0e`   |
| PARCIAL   | `#fff7ed`   | `#9a3412`   |
| PREPARADO | `#eff6ff`   | `#1e40af`   |

---

## Archivos exactos

### Archivos nuevos

| Archivo                                                                        | Contenido                  |
|--------------------------------------------------------------------------------|----------------------------|
| `frontend/pages/opciones/logistica-y-pedidos/picking/index.html`               | HTML skeleton              |
| `frontend/css/opciones/logistica-y-pedidos/picking/index.css`                  | Estilos (namespace `pk-`)  |
| `frontend/js/opciones/logistica-y-pedidos/picking.js`                          | Lógica de la pantalla      |

### Archivos modificados

| Archivo                             | Cambio                                    |
|-------------------------------------|-------------------------------------------|
| `backend/routes/stock.routes.js`    | Añadir `GET /picking` endpoint            |
| `frontend/js/api.js`                | Añadir `SGA.picking.list(params)`         |
| `frontend/js/ui/sidebar.js`         | Añadir entrada "Preparación/Picking"      |

---

## Endpoint — GET /picking

Añadir en `backend/routes/stock.routes.js` después del endpoint `/expediciones`:

```javascript
// ─── PICKING / PREPARACIÓN ────────────────────────────────────────────────────

router.get('/picking', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '', desde, hasta } = req.query;
        const fechaD = desde || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
        const fechaH = hasta || new Date().toISOString().split('T')[0];
        const r = await q(pool)
            .input('b', `%${buscar}%`)
            .input('desde', fechaD)
            .input('hasta', fechaH)
            .query(`SELECT TOP 500
                e.ACSNUM    AS albaran,
                e.ACSSER    AS serie,
                e.ACSCLICOD AS cliente,
                e.ACSCLINOM AS nombre_cliente,
                CONVERT(varchar, e.ACSFEC, 23) AS fecha,
                e.ACSNUMPIC AS picking,
                e.ACSARTCOD AS articulo,
                (SELECT TOP 1 ARTNOM FROM ARTICULO WHERE ARTCOD = e.ACSARTCOD) AS nombre_articulo,
                e.ACSCAN    AS cantidad_pedida,
                e.ACSUBI    AS ubicacion,
                u.UBINOM    AS nom_ubicacion,
                u.UBIALMCOD AS almacen,
                u.UBIETI    AS ubi_etiqueta,
                e.ACSLOT    AS lote,
                ISNULL((SELECT SUM(STOCAN) FROM STOCK
                    WHERE STOARTCOD = e.ACSARTCOD
                      AND STOUBI    = e.ACSUBI
                      AND (e.ACSLOT = '' OR STOLOT = e.ACSLOT)), 0) AS stock_ubi,
                ISNULL((SELECT SUM(STOCAN) FROM STOCK
                    WHERE STOARTCOD = e.ACSARTCOD), 0) AS stock_total
                FROM ALBARANCS e
                LEFT JOIN UBICACION u ON u.UBICODUBI = e.ACSUBI
                WHERE e.ACSMOV = 'E'
                AND (e.ACSCLICOD LIKE @b OR e.ACSCLINOM LIKE @b
                     OR CAST(e.ACSNUM AS varchar) LIKE @b)
                AND CAST(e.ACSFEC AS DATE) BETWEEN @desde AND @hasta
                ORDER BY
                    CASE WHEN e.ACSNUMPIC IS NULL THEN 0 ELSE 1 END ASC,
                    e.ACSFEC DESC,
                    e.ACSNUM DESC,
                    e.ACSUBI ASC`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});
```

**Notas sobre el query**:
- `ORDER BY ... CASE WHEN e.ACSNUMPIC IS NULL THEN 0 ELSE 1 END ASC` → pendientes primero
- `AND e.ACSUBI ASC` → dentro de cada albarán, líneas ordenadas por ubicación (optimiza recorrido físico)
- El filtro de lote usa condición `(e.ACSLOT = '' OR STOLOT = e.ACSLOT)` para manejar
  líneas sin lote asignado (ACSLOT vacío = coger cualquier lote)
- No hay endpoint de escritura en FASE 5B — las confirmaciones quedan para FASE 5B.2

---

## Cambios en api.js

Añadir en `const SGA = { ... }` junto a `expediciones`:

```javascript
picking: {
    list: (params = {}) => _get('/picking?' + new URLSearchParams(params)),
},
```

---

## Cambios en sidebar.js

En el grupo `Expediciones`, añadir enlace tras "Expediciones desde pedido":

```javascript
{ icon: '📋', text: 'Preparación / Picking', href: 'pages/opciones/logistica-y-pedidos/picking/index.html' },
```

---

## Estructura JS — picking.js

El módulo sigue el mismo patrón IIFE que expediciones.js:

```
"use strict"
IIFE:
  ─ STATE: _rows, _albaranes, _filters, _loading, _activeKey
  ─ DOM REFS: elementos por getElementById
  ─ cargar()     → SGA.picking.list(params).then(render).catch(showError)
  ─ groupByAlbaran(rows)  → { key: { meta, lineas, estado, progreso } }
  ─ calcEstado(lineas)    → 'pendiente' | 'parcial' | 'preparado'
  ─ calcProgreso(lineas)  → { total, conPicking, faltantes }
  ─ filterAndRender()     → aplica filtros y llama renderList
  ─ renderList(albaranes) → genera HTML de pk-task cards
  ─ renderCard(key, alb)  → genera HTML de una card
  ─ renderPanel(key)      → rellena panel detalle con líneas
  ─ renderLinea(linea)    → genera HTML de pk-linea
  ─ setActive(key)        → marca card activa, abre panel
  ─ setLoading(bool)      → spinner en lista
  ─ showError(msg)        → mensaje de error en lista
  ─ updateCounters()      → actualiza ep-cnt-* IDs
  ─ initFilters()         → registra eventos en filtros + quick-btns
  ─ DOMContentLoaded      → initFilters(), cargar()
```

### Función groupByAlbaran — estructura esperada

```javascript
{
  "12345|E": {
    albaran: 12345,
    serie: "E",
    cliente: "CLI001",
    nombre_cliente: "EMPRESA ABC S.L.",
    fecha: "2026-05-11",
    picking: "456",          // null si alguna sin picking
    lineas: [
      {
        articulo: "ART001",
        nombre_articulo: "Tuerca M8",
        cantidad_pedida: 50,
        ubicacion: "A-01-01",
        nom_ubicacion: "Pasillo A Nivel 1",
        almacen: "ALM1",
        ubi_etiqueta: "A0101",
        lote: "2024001",
        picking: "456",      // null = pendiente
        stock_ubi: 200,
        stock_total: 580
      },
      ...
    ],
    estado: "parcial",       // pendiente | parcial | preparado
    progreso: { total: 5, conPicking: 3, faltantes: 1 }
  }
}
```

### Detección de estado de línea (frontend)

```javascript
function estadoLinea(linea) {
    if (linea.picking) return 'recogida';
    if (linea.stock_ubi === 0 && linea.stock_total === 0) return 'faltante';
    if (linea.stock_ubi < linea.cantidad_pedida) return 'stock-bajo';
    return 'pendiente';
}
```

### Filtro por estado de albarán

El select `#pk-f-status` filtra sobre `_albaranes`:
- `todos`: muestra todos
- `pendiente`: solo albaranes sin ningún picking
- `parcial`: solo albaranes con picking incompleto
- `preparado`: solo albaranes con todos los pickings

---

## HTML — estructura de IDs

```html
<!-- Filtros -->
<input id="pk-f-desde">
<input id="pk-f-hasta">
<input id="pk-f-buscar">
<select id="pk-f-status">
<div class="pk-quick-btns"> [data-days="0|7|30|90"] </div>

<!-- Contadores -->
<span id="pk-cnt-total">
<span id="pk-cnt-pend">
<span id="pk-cnt-parcial">
<span id="pk-cnt-prep">

<!-- Lista -->
<div id="pk-list">
  <div id="pk-placeholder">

<!-- Panel -->
<aside id="pk-panel">
  <span id="pk-panel-title">
  <button id="pk-panel-close">
  <div id="pk-panel-empty">
  <div id="pk-panel-meta">
  <div id="pk-panel-body">

<!-- Backdrop tablet/móvil -->
<div id="pk-panel-backdrop">
```

---

## CSS — clases principales (namespace `pk-`)

```
pk-inner            → contenedor principal
pk-header-row       → título + cabecera
pk-filters          → zona de filtros
pk-filters-row      → fila de controles
pk-date-label / pk-date-input / pk-search-input / pk-status-select
pk-quick-btns / pk-quick-btn / pk-quick-btn--active
pk-counters (grid 4 cols) / pk-counter / pk-counter--{total|pend|parcial|prep}
pk-counter__val / pk-counter__label
pk-workspace (grid: lista | 380px panel)
pk-list-col / pk-list / pk-placeholder / pk-placeholder-icon

pk-task             → card operativa de albarán
pk-task:hover
pk-task--active     → card seleccionada
pk-task-progress    → barra de progreso (con pk-task-progress__fill)
pk-task-progress__fill--{verde|naranja|rojo}
pk-task-top         → fila: estado badge + fecha
pk-task-albaran     → número albarán
pk-task-cliente     → nombre cliente
pk-task-footer      → artículos · faltantes · picking#

pk-badge / pk-badge--{pendiente|parcial|preparado}

pk-panel            → panel lateral sticky
pk-panel-header / pk-panel-title / pk-panel-close
pk-panel-empty / pk-panel-empty-icon
pk-panel-meta / pk-panel-meta-albaran / pk-panel-meta-cliente
pk-panel-meta-fecha / pk-panel-meta-progress
pk-panel-body       → scroll area

pk-linea            → fila de artículo
pk-linea--{recogida|pendiente|stock-bajo|faltante}
pk-linea-icon       → ✓ / ○ / ⚠ / ✗
pk-linea-art        → nombre artículo
pk-linea-data       → cantidad · ubicación · lote · stock
pk-linea-ubi        → "A-01-01 — Pasillo A Nivel 1"
pk-linea-stock      → "Stock en ubi: 200 ud · Total: 580 ud"
pk-linea-stock--bajo / pk-linea-stock--cero
pk-linea-actions    → links rápidos (ver movimientos, ver stock)
pk-linea-link

pk-panel-backdrop   → overlay móvil/tablet
pk-panel-backdrop--active
```

---

## Tasks de implementación

### TASK 1 — Backend: endpoint GET /picking
**Archivo**: `backend/routes/stock.routes.js`

**Pasos**:
1. Leer `backend/routes/stock.routes.js`
2. Añadir endpoint `GET /picking` después del bloque `// ─── EXPEDICIONES ───`
   - SQL: ver sección "Endpoint — GET /picking" de este plan
3. Guardar y verificar: `node -e "require('./backend/routes/stock.routes.js')"` sin errores

**Verificación**:
```
GET http://localhost:3000/picking?buscar=&desde=2026-05-01&hasta=2026-05-11
→ respuesta JSON, array de objetos con campos: albaran, serie, cliente, fecha, picking,
  articulo, nombre_articulo, cantidad_pedida, ubicacion, nom_ubicacion, stock_ubi, stock_total, lote
```

---

### TASK 2 — API.js: añadir SGA.picking
**Archivo**: `frontend/js/api.js`

**Pasos**:
1. Leer `frontend/js/api.js`
2. Añadir en `const SGA = { ... }` justo después del objeto `expediciones`:
   ```javascript
   picking: {
       list: (params = {}) => _get('/picking?' + new URLSearchParams(params)),
   },
   ```
3. Verificar en consola: `typeof SGA.picking.list === 'function'`

---

### TASK 3 — HTML: crear picking/index.html
**Archivo**: `frontend/pages/opciones/logistica-y-pedidos/picking/index.html`

**Pasos**:
1. Verificar que existe directorio `frontend/pages/opciones/logistica-y-pedidos/picking/`
   (crear si no existe)
2. Crear archivo HTML siguiendo estructura de [expediciones/index.html] como referencia:
   - Mismas 8 hojas CSS base: `base.css`, `layout.css`, `sidebar.css`, `header.css`,
     `buttons.css`, `forms.css`, `badges.css`, `responsive.css`
   - CSS propio: `../../../../css/opciones/logistica-y-pedidos/picking/index.css`
   - Scripts al final del body (mismo orden que expediciones):
     - `api.js`, `ui/sidebar.js`, `ui/layout.js`, `opciones/logistica-y-pedidos/picking.js`
   - IDs: todos los `pk-*` listados en sección HTML de este plan
   - Breadcrumb: Inicio > Preparación / Picking
   - Título h1: "Preparación / Picking"
   - Descripción: "Tablero operativo de preparación · SGA LIN"
   - Select estados: Todos / Pendiente / Parcial / Preparado
   - Quick buttons: Hoy / 7d / 30d (activo) / 90d
   - Contadores: Total / Pendientes / Parciales / Preparados
   - Placeholder inicial: icono 📋 + texto "Cargando tareas de picking…"
   - Panel: header + empty state + meta + body
   - Backdrop: `<div class="pk-panel-backdrop" id="pk-panel-backdrop"></div>`

---

### TASK 4 — CSS: crear picking/index.css
**Archivo**: `frontend/css/opciones/logistica-y-pedidos/picking/index.css`

**Pasos**:
1. Verificar que existe directorio `frontend/css/opciones/logistica-y-pedidos/picking/`
2. Crear archivo CSS con namespace `pk-` siguiendo [expediciones/index.css] como referencia:
   - Usar mismas variables CSS: `--sga-surface`, `--sga-border`, `--sga-accent`,
     `--sga-primary`, `--sga-text`, `--sga-text-muted`, `--sga-danger`
   - Componente nuevo: `pk-task` con progress bar interna
   - Componente nuevo: `pk-task-progress` + `pk-task-progress__fill` (barra de progreso)
   - Componente nuevo: `pk-linea-icon` (icono de estado: ✓/○/⚠/✗)
   - Colores de estado de línea:
     - recogida: `#16a34a` (verde)
     - pendiente: `--sga-text-muted` (gris)
     - stock-bajo: `#d97706` (naranja)
     - faltante: `#dc2626` (rojo)
   - Responsive tablet (≤ 1023px): panel como drawer lateral
   - Responsive móvil (≤ 640px): panel como bottom sheet
   - Colores de progress fill:
     - verde (preparado): `#16a34a`
     - naranja (parcial): `#d97706`
     - gris (pendiente): `--sga-border`

---

### TASK 5 — JS: crear picking.js
**Archivo**: `frontend/js/opciones/logistica-y-pedidos/picking.js`

**Pasos**:
1. Crear archivo JS con IIFE + `"use strict"`
2. Declarar STATE: `_rows`, `_albaranes`, `_filters` (buscar, desde, hasta, status),
   `_loading`, `_activeKey`
3. Implementar `groupByAlbaran(rows)`:
   - Clave: `albaran + '|' + serie`
   - Calcula `estado`: pendiente/parcial/preparado
   - Calcula `progreso`: { total, conPicking, faltantes }
4. Implementar `estadoLinea(linea)`:
   - Retorna: 'recogida' | 'faltante' | 'stock-bajo' | 'pendiente'
5. Implementar `cargar()`:
   - Guard `_loading`
   - Llama `SGA.picking.list({buscar, desde, hasta})`
   - `.then(data)` → `_rows = data; _albaranes = groupByAlbaran(_rows); filterAndRender();`
   - `.catch(err)` → `showError(...)` con mensaje legible
6. Implementar `filterAndRender()`:
   - Aplica filtro de texto sobre cliente/albaran
   - Aplica filtro de estado
   - Llama `renderList(filtered)`
   - Llama `updateCounters()`
7. Implementar `renderList(albaranes)`:
   - Si vacío → placeholder
   - Por cada albarán → `renderCard(key, alb)`
   - Insertar HTML en `#pk-list`
   - Añadir event listeners de click en tarjetas
8. Implementar `renderCard(key, alb)`:
   - Genera HTML de `pk-task`
   - Incluye progress bar proporcional
   - Incluye badge de estado
   - Incluye contador de faltantes si los hay
9. Implementar `renderPanel(key)`:
   - Rellena `#pk-panel-meta` con cabecera del albarán
   - Rellena `#pk-panel-body` con lista de `pk-linea`
   - Ordena líneas: faltantes primero, luego pendientes, luego recogidas
   - Muestra barra de progreso global del albarán
10. Implementar `renderLinea(linea)`:
    - Icono de estado según `estadoLinea(linea)`
    - Datos: artículo, cantidad, ubicación+nombre, lote, stock_ubi, stock_total
    - Links rápidos: "Ver movimientos" → movimientos-por-articulo, "Ver stock" → consulta-de-stock
11. Implementar `setActive(key)`:
    - Quita clase `pk-task--active` de todas las cards
    - Añade a la seleccionada
    - Llama `renderPanel(key)`
    - En tablet/móvil: añade clase `pk-panel--open` + backdrop activo
12. Implementar `initFilters()`:
    - Quick-btns (Hoy/7d/30d/90d) → actualiza fechas y llama `cargar()`
    - Input buscar → debounce 350ms → `filterAndRender()`
    - Select estado → `filterAndRender()`
    - Fecha desde/hasta → `cargar()`
    - Panel close + backdrop → cierra panel
13. Implementar `updateCounters()`:
    - Cuenta albaranes por estado
    - Actualiza `#pk-cnt-total`, `#pk-cnt-pend`, `#pk-cnt-parcial`, `#pk-cnt-prep`
14. DOMContentLoaded: inicializar fechas (30d), `initFilters()`, `cargar()`
15. Verificar: no hay `console.debug` ni `console.log` en el código final

---

### TASK 6 — Sidebar: añadir entrada picking
**Archivo**: `frontend/js/ui/sidebar.js`

**Pasos**:
1. Leer `frontend/js/ui/sidebar.js`
2. En el grupo `label: 'Expediciones'`, añadir después de "Expediciones desde pedido":
   ```javascript
   { icon: '📋', text: 'Preparación / Picking', href: 'pages/opciones/logistica-y-pedidos/picking/index.html' },
   ```
3. Verificar: el link aparece en sidebar al cargar cualquier página

---

### TASK 7 — Verificaciones manuales

Realizar en navegador con servidor backend corriendo (`node backend/app.js`):

**A. Backend**:
- [ ] `GET /picking` sin parámetros retorna array JSON (puede ser vacío)
- [ ] `GET /picking?buscar=TEST` retorna array filtrado (puede ser vacío)
- [ ] `GET /picking?desde=2026-01-01&hasta=2026-05-11` retorna datos del periodo
- [ ] Campos presentes: albaran, nombre_cliente, fecha, picking, articulo, nombre_articulo,
      cantidad_pedida, ubicacion, nom_ubicacion, stock_ubi, stock_total, lote
- [ ] `GET /expediciones` sigue funcionando (no regresión)

**B. Frontend — pantalla picking**:
- [ ] La página carga sin errores en Console
- [ ] Sidebar muestra "Preparación / Picking" como enlace activo
- [ ] Breadcrumb muestra: Inicio > Preparación / Picking
- [ ] Contadores muestran números (no "—" indefinidamente)
- [ ] Cards de albaranes aparecen con: nombre cliente, fecha, badge de estado, barra de progreso
- [ ] Quick-buttons cambian el rango de fechas y recargan
- [ ] Filtro de búsqueda filtra en tiempo real
- [ ] Select de estado filtra correctamente
- [ ] Click en card → abre panel detalle
- [ ] Panel muestra líneas del albarán con: artículo, cantidad, ubicación, lote, stock
- [ ] Líneas con picking asignado muestran icono ✓ verde
- [ ] Líneas sin picking muestran icono ○ gris
- [ ] Líneas con stock_ubi = 0 muestran icono ✗ rojo y badge FALTANTE

**C. Responsive**:
- [ ] Desktop (≥ 1024px): lista + panel lateral visibles simultáneamente
- [ ] Tablet (768px): lista full-width, panel como drawer lateral con botón cerrar
- [ ] Móvil (375px): lista full-width, panel como bottom sheet
- [ ] Botones táctiles ≥ 44px en tablet/móvil

**D. Integración**:
- [ ] Link "Ver movimientos" en panel abre movimientos-por-articulo filtrado
- [ ] Link "Ver stock" en panel abre consulta-de-stock filtrado
- [ ] FASE 5A (Expediciones) sigue funcionando sin cambios (no regresión)
- [ ] Sidebar funciona en todas las páginas modernizadas

**E. Tests backend**:
- [ ] Ejecutar `npm test` en directorio backend
- [ ] Todos los tests pasan (≥ 80/80 sin nuevas roturas)

---

## Criterios de éxito

1. Pantalla carga datos reales desde backend
2. Cards muestran estado de picking con progreso visual
3. Faltantes detectados y señalizados visualmente
4. Panel detalle muestra líneas ordenadas por ubicación (optimiza recorrido físico)
5. Funciona en tablet (breakpoint 768px) sin overflow ni elementos rotos
6. No hay errores en Console
7. Quick-buttons actualizan fechas correctamente
8. Filtro de estado filtra en tiempo real
9. No hay regresión en FASE 5A (Expediciones)
10. Todos los tests backend siguen pasando

---

## Riesgos detectados

### RIESGO ALTO

| Riesgo | Detalle | Mitigación |
|--------|---------|------------|
| Ambigüedad en clave de ALBARANCS | No se conoce la PK real de la tabla. El query asume que ACSNUM+ACSSER+ACSARTCOD+ACSUBI identifica una línea; podría no ser único | En FASE 5B no se escribe; si en 5B.2 se necesita update, investigar PK primero con `SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ALBARANCS'` |
| ACSNUMPIC puede ser integer | Si el campo es numérico y LIN lo usa para otra lógica, filtrarlo como "tiene picking o no" puede ser impreciso | Verificar con DBA el significado exacto del campo en LIN |
| Lote vacío en ALBARANCS | El query asume ACSLOT = '' cuando no hay lote. Si es NULL la condición falla | Cambiar condición a `(ISNULL(e.ACSLOT,'') = '' OR STOLOT = e.ACSLOT)` si se detecta |
| Stock durante picking es una foto | No hay actualización en tiempo real; el operario puede ver stock desactualizado | Añadir botón "Actualizar" visible en la UI; documento el limitation en la UI con tooltip |

### RIESGO MEDIO

| Riesgo | Detalle |
|--------|---------|
| Albaranes sin ACSMOV='E' | Si LIN usa otros tipos de movimiento para pedidos no estándar, no aparecerán |
| nom_ubicacion puede ser NULL | Si UBICACION no tiene registro para ACSUBI, LEFT JOIN retornará NULL. El JS debe manejar `nom_ubicacion || ubicacion` |
| Cantidad de datos | TOP 500 podría no ser suficiente para almacenes de alto volumen |
| Fechas con horas en ACSFEC | Si ACSFEC almacena datetime con horas, el filtro `CAST AS DATE BETWEEN` funciona bien; verificar |

### RIESGO BAJO

| Riesgo | Detalle |
|--------|---------|
| CSS conflict con `ep-*` namespace | El namespace `pk-` evita conflictos; verificar que no haya global resets en base.css |
| Sidebar scroll | Al añadir entrada, verificar que sidebar sigue siendo scrollable en pantallas pequeñas |

---

## Exclusiones de FASE 5B

No implementar en esta fase:

- Crear picking desde web app (`ACSMOV='P'` insert)
- Confirmar / marcar líneas como preparadas (write operation sobre ALBARANCS)
- Asignar picking a operario/terminal
- Imprimir hoja de picking
- Optimización automática de rutas de recogida
- Escáner / PDA real
- Mapa visual de almacén
- Picking por oleadas
- Reservas de artículos
- Picking por lotes de cliente (ARTICULOEXCLOTCLI)
- WebSocket / actualización en tiempo real
- Notificaciones push
- BI / analytics de productividad
- Voice picking
- Integración con agencias de transporte

---

## FASE 5B.2 — Extensiones futuras (planning)

Una vez estable FASE 5B, considerar:

1. **Confirmar línea preparada**: botón por línea → `PUT /picking/linea` → actualiza ACSNUMPIC
2. **Registrar incidencia**: formulario de incidencia por línea faltante
3. **Asignar operario**: campo de terminal/operario al confirmar
4. **Barra de progreso en tiempo real**: polling cada 30s con `setInterval`
5. **Integración con Expediciones 5A**: desde expedición, enlace directo a picking del albarán

---

## Recomendaciones arquitectónicas

1. **Reusar patrones de FASE 5A**: `groupByAlbaran`, `filterAndRender`, `renderPanel`,
   `initFilters` son prácticamente idénticos. Si en futuro se crean más módulos similares,
   considerar extraer helpers a `frontend/js/ui/list-panel.js` (futura FASE).

2. **Orden de líneas por ubicación**: Las líneas en el panel deben ordenarse por `ubicacion`
   ASC para que el operario recorra el almacén en orden físico (pasillo A → B → C).
   Esto ya está en el `ORDER BY` del SQL.

3. **CSS variables**: Toda la UI usa `--sga-*` variables de `base.css`. No usar valores
   hardcoded de color en `picking/index.css`.

4. **Manejo de NULL en JS**: `linea.nom_ubicacion || linea.ubicacion` — siempre
   mostrar la ubicación aunque no haya nombre descriptivo.

5. **Stock check al abrir panel**: Cuando el operario selecciona un albarán, llamar
   `SGA.stock.get(articulo)` para obtener stock fresco. Esto añade latencia pero evita
   que el operario vaya a una ubicación sin stock. Evaluar si merece la pena vs. el dato
   ya en la respuesta de `/picking`.

---

## Orden de implementación recomendado

```
1. TASK 1 — Backend GET /picking          (5 min)
2. TASK 2 — API.js SGA.picking           (2 min)
3. TASK 3 — HTML skeleton                (10 min)
4. TASK 4 — CSS picking/index.css        (25 min)
5. TASK 5 — JS picking.js                (45 min)
6. TASK 6 — Sidebar                      (2 min)
7. TASK 7 — Verificaciones manuales      (15 min)
```

**Estimación total**: ~1h 45min de implementación + verificaciones.
