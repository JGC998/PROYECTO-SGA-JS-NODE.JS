# FASE 4C — Movimientos por Artículo Moderna
## Plan técnico completo

---

## 1. DIAGNÓSTICO UX — PANTALLA LEGACY

### 1.1 Problemas críticos de UX

| Problema | Impacto | Prioridad |
|----------|---------|-----------|
| Tabla de 19 columnas visible sin agrupación | Ilegible · scroll horizontal obligatorio | Alta |
| Sin agrupación temporal | 500 filas planas sin contexto de cuándo ocurrió qué | Alta |
| Sin panel de detalle lateral | Toda la info en celdas minúsculas, nada ampliable | Alta |
| Stock actual en columna "Stock" | Muestra el stock HOY, no en el momento del movimiento → dato engañoso | Alta |
| Columna "Etiqueta" siempre vacía | El backend no la devuelve (no hay JOIN con UBICACION) | Media |
| Sin indicadores visuales de magnitud | Cantidad 1 y 10.000 son idénticas visualmente | Media |
| Responsivo inexistente | 19 columnas en móvil: inutilizable | Alta |
| CSS sin variables --sga-* | Desconectado del sistema visual FASE 1 | Media |

### 1.2 Filtros rotos o inútiles (confirmados en análisis de código)

| Control HTML | Param enviado | Backend lo usa | Estado |
|--------------|--------------|----------------|--------|
| `f-ubicacion` | `ubicacion` | SÍ (LIKE) | Funciona |
| `f-articulo` | `articulo` | SÍ (LIKE) | Funciona |
| `f-lote` | `lote` | SÍ (LIKE) | Funciona |
| `f-movimiento` | `movimiento` | SÍ (LIKE) | Funciona |
| `f-fecha-desde/hasta` | `desde`/`hasta` | SÍ (BETWEEN) | Funciona |
| `f-cliente` | `cliente` | SÍ (LIKE) | Funciona pero oculto |
| `f-subfamilia` | `subfamilia` | **NO** | Roto — eliminar |
| `f-agrupado` | `agrupado` | **NO** | Roto — eliminar |
| `f-historico` | `historico` | **NO** | Roto — eliminar |
| `f-p`, `f-l`, `f-x`, `f-y` | Nunca enviados | **NO** | Muertos — eliminar |
| Browse buttons (`...`) | — | — | Sin handler — eliminar |

### 1.3 Problemas de rendimiento

- **N+1 subquery**: cada fila ejecuta `SELECT SUM(STOCAN) FROM STOCK WHERE STOARTCOD=s.ACSARTCOD`.
  Con TOP 500 son **500 subqueries** síncronas por cada carga de pantalla.
- **TOP 500 sin paginación**: no hay forma de acceder a movimientos anteriores al registro 500.
  Con filtros amplios (sin artículo, fechas largas) la consulta silencia datos reales.

### 1.4 Problemas de trazabilidad

- No hay relación visual entre movimientos del mismo lote o documento.
- `tercero` y `nombre_tercero` no están relacionados visualmente (dos columnas separadas lejos entre sí).
- `serie` + `numero` son el documento generador pero aparecen como columnas sueltas sin contexto.
- `picking` aparece mezclado con `numero` en la cabecera ("Picking / Nº palet") — confuso.

---

## 2. ANÁLISIS TÉCNICO ACTUAL

### 2.1 Endpoint

```
GET /movimientos-por-articulo
```

### 2.2 Parámetros realmente funcionales en el backend

| Param enviado | Campo SQL | Tipo de filtro |
|---------------|-----------|----------------|
| `articulo` | `ACSARTCOD` | `LIKE %val%` |
| `lote` | `ACSLOT` | `LIKE %val%` |
| `desde` | `ACSFEC` | `>= @desde` (DATE) |
| `hasta` | `ACSFEC` | `<= @hasta` (DATE) |
| `movimiento` | `ACSMOV` | `LIKE %val%` |
| `ubicacion` | `ACSUBI` | `LIKE %val%` |
| `cliente` | `ACSCLICOD` | `LIKE %val%` |

### 2.3 Tabla SQL principal

`ALBARANCS` — líneas de movimiento de almacén (tabla auditora central de LIN).

### 2.4 Campos devueltos por el endpoint (nombres exactos del JSON)

```
empresa       → ACSEMPCOD
fecha         → CONVERT(varchar, ACSFEC, 23)      e.g. "2024-05-08"
hora          → CONVERT(varchar, ACSHOR, 8)       e.g. "10:30:00"
tipo          → ACSMOV                            "E"|"S"|"T"|"R"|"P"
serie         → ACSSER
numero        → ACSNUM
picking       → ACSNUMPIC
ubicacion     → ACSUBI
lote          → ACSLOT
cantidad      → ACSCAN                            (numérico, puede ser negativo)
stock         → subquery SUM(STOCAN) actual       (N+1 — valor HOY, no histórico)
terminal      → ACSREPCOD
caja          → ACSNUMCAJ
palet         → ACSNUMPAL
tercero       → ACSCLICOD
centro        → ACSCENCOD
nombre_tercero → ACSCLINOM
```

**Campo ausente:** `etiqueta` aparece como columna en el HTML legacy pero la SQL no la devuelve.
No añadir JOIN en FASE 4C. Nota como deuda técnica futura.

### 2.5 Tipos de movimiento y su significado

| Código | Etiqueta | Color semántico |
|--------|----------|-----------------|
| `E` | Entrada | Verde — `#16a34a` |
| `S` | Salida | Rojo — `#dc2626` |
| `T` | Traspaso | Azul — `#2563eb` |
| `R` | Regularización | Ámbar — `#d97706` |
| `P` | Picking | Morado — `#7c3aed` |

### 2.6 API.js (sin cambios)

```js
SGA.movimientos.list(params) → GET /movimientos-por-articulo?[URLSearchParams]
```
No se modifica `api.js`.

### 2.7 Límite de resultados

`TOP 500` en la SQL. Sin paginación. Se mantiene en FASE 4C.
Recomendación para fase futura: añadir `OFFSET/FETCH` con paginación cursor-based.

---

## 3. ESTRATEGIA DE FICHEROS

### 3.1 Regla: preservar legacy

El HTML legacy se renombra (no se elimina). Sus CSS y JS propios no se tocan.

### 3.2 Mapa de ficheros

**Ficheros legacy — conservar intactos:**
```
frontend/pages/opciones/almacen-y-stock/movimientos-por-articulo/legacy.html
    ← renombrado desde index.html; scripts: navegacion.js + api.js + movimientos-por-articulo.js
frontend/css/opciones/almacen-y-stock/movimientos-por-articulo/index.css
    ← CSS legacy; no tocar
frontend/js/opciones/almacen-y-stock/movimientos-por-articulo.js
    ← JS legacy; no tocar
```

**Ficheros nuevos — crear:**
```
frontend/pages/opciones/almacen-y-stock/movimientos-por-articulo/index.html
    ← nuevo shell moderno
frontend/css/opciones/almacen-y-stock/movimientos-por-articulo/mv.css
    ← nuevo CSS; namespace mv-; usa --sga-* variables
frontend/js/opciones/almacen-y-stock/movimientos-por-articulo-mv.js
    ← nuevo JS; IIFE; solo createElement; Promise-based
```

**Ficheros que NO se tocan:**
```
frontend/js/api.js                     ← SGA.movimientos.list() ya existe
frontend/js/ui/sidebar.js              ← link ya apunta a index.html ✓
frontend/index.html                    ← acceso rápido ya apunta a index.html ✓
backend/routes/stock.routes.js         ← endpoint no se modifica
```

---

## 4. DISEÑO VISUAL — ESTRUCTURA COMPLETA

### 4.1 Layout desktop (≥ 1024px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ HEADER: "Movimientos por Artículo"  [Exportar CSV]  [Ver clásico]  │
├─────────────────────────────────────────────────────────────────────┤
│ FILTROS: [Artículo] [Lote] [Ubicación] [Tipo▼] [Desde] [Hasta]    │
│          [Cliente]                             [Buscar] [Limpiar]  │
├────────────────────────────────────┬────────────────────────────────┤
│ TIMELINE (flex-grow, scroll)       │ PANEL DETALLE (320px, sticky) │
│                                    │                                │
│  08/05/2024 · Hoy · 12 movim.     │ (selecciona un movimiento)    │
│  ┌──────────────────────────────┐  │                                │
│  │ [E] 10:30  ART001·SL·UBI-A │  │                                │
│  │          +150 ud · Alb.12345│  │                                │
│  └──────────────────────────────┘  │                                │
│  ┌──────────────────────────────┐  │                                │
│  │ [S] 09:15  ART001·SL·UBI-A │  │                                │
│  │           −50 ud · Alb.12340│  │                                │
│  └──────────────────────────────┘  │                                │
│                                    │                                │
│  07/05/2024 · Ayer · 3 movim.     │                                │
│  ...                               │                                │
├────────────────────────────────────┴────────────────────────────────┤
│ BARRA RESUMEN: 15 movimientos · Stock actual: 2.340 uds            │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Layout tablet (700–1023px)

- Timeline a ancho completo.
- Panel detalle como **overlay lateral** deslizante (`.mv-panel--overlay`).
- Botón "×" para cerrar el panel.
- Filtros en 2 filas wrap.

### 4.3 Layout móvil (< 700px)

- Filtros en **sección colapsable** (toggle con ícono).
- Cards compactas en columna única.
- Panel detalle como **modal inferior** (`position: fixed; bottom: 0`).
- Botón táctil "×" visible.

### 4.4 Anatomía de una tarjeta de movimiento

```
┌──────────────────────────────────────────────────────────┐
│ [BADGE] HORA    ARTÍCULO  ·  (lote si hay)              │
│         UBI-XXX · NOMBRE TERCERO           [± CANTIDAD] │
│         Serie XXXX / Nº XXXX · (picking si hay)        │
└──────────────────────────────────────────────────────────┘
```

- Borde izquierdo 4px coloreado por tipo.
- `BADGE` = círculo con inicial (E/S/T/R/P) + color de fondo.
- `CANTIDAD` en verde (positiva) o rojo (negativa).
- Card completa es un `<button>` (accesibilidad + teclado).
- Card seleccionada: borde izquierdo accent + fondo tintado.

### 4.5 Panel de detalle — campos

| Sección | Campos mostrados |
|---------|-----------------|
| Encabezado | Badge tipo grande · Fecha · Hora |
| Artículo | `empresa` · código artículo (de filtro o parámetro URL) |
| Movimiento | `ubicacion` · `lote` · `cantidad` (grande, coloreada) |
| Documento | `serie` + `numero` · `picking` (si tiene valor) |
| Tercero | `tercero` + `nombre_tercero` · `centro` |
| Trazabilidad | `terminal` · `caja` · `palet` |
| Nota stock | "Stock actual del artículo: X uds" (con aviso: valor actual, no histórico) |

### 4.6 Agrupación por fecha

```
.mv-day-group
  .mv-day-header   → "08/05/2024 · Hoy · 12 movimientos"
  .mv-cards-list
    button.mv-card × N
```

Lógica JS: `Map<fecha_iso, row[]>` construido sobre `_rows` ordenados por fecha DESC.
Etiquetas relativas: "Hoy", "Ayer", para las últimas dos fechas; resto en formato `DD/MM/YYYY`.

### 4.7 Barra de resumen (footer)

```
.mv-summary
  "N movimientos · [si artículo filtrado: Stock actual: X uds]"
```

`stock` procede del primer row devuelto (todos los rows del mismo artículo comparten el mismo valor de stock actual, dado que la subquery usa el artículo del filtro).

---

## 5. FILTROS — DISEÑO DEFINITIVO

### 5.1 Filtros incluidos (backend los soporta)

| ID | Label | Tipo | Param API |
|----|-------|------|-----------|
| `mv-f-articulo` | Artículo | text | `articulo` |
| `mv-f-lote` | Lote | text | `lote` |
| `mv-f-ubicacion` | Ubicación | text | `ubicacion` |
| `mv-f-tipo` | Tipo | select | `movimiento` |
| `mv-f-desde` | Desde | date | `desde` |
| `mv-f-hasta` | Hasta | date | `hasta` |
| `mv-f-cliente` | Tercero | text (secundario) | `cliente` |

### 5.2 Filtros eliminados (backend no los soporta)

- `subfamilia` — nunca implementado en SQL.
- `agrupado` — nunca implementado en SQL.
- `historico` — nunca implementado en SQL.
- `P`, `L`, `X`, `Y` — coordenadas nunca enviadas al API.
- Browse buttons `...` — sin handler en legacy; no implementar en FASE 4C.

### 5.3 Select de tipo (opciones)

```html
<option value="">Todos</option>
<option value="E">Entrada</option>
<option value="S">Salida</option>
<option value="T">Traspaso</option>
<option value="R">Regularización</option>
<option value="P">Picking</option>
```

### 5.4 Botones de acción

- `btn-mv-buscar` → dispara `cargarMovimientos()`.
- `btn-mv-limpiar` → resetea todos los filtros + limpia timeline.
- `btn-mv-exportar` → exporta CSV desde `_rows` (no desde DOM).
- `link-mv-legacy` → enlace a `legacy.html` (texto: "Ver versión clásica").

---

## 6. NAVEGACIÓN — FLUJO COMPLETO

### 6.1 Apertura desde sidebar / acceso rápido

1. Usuario pulsa "Movimientos" en sidebar.
2. Se carga `index.html` con fechas por defecto (hoy − 30 días).
3. Sin filtro de artículo → carga todos los movimientos del período (hasta TOP 500).
4. Timeline vacío si no hay resultados → mensaje de ayuda "Introduce un artículo para acotar la búsqueda".

### 6.2 Apertura desde otra pantalla con URL param

Soporte para `?articulo=ART001` en la URL (para "Ver movimientos" desde stock, entradas, salidas).

```js
// En DOMContentLoaded:
var params = new URLSearchParams(window.location.search);
var artParam = params.get('articulo');
if (artParam) {
    document.getElementById('mv-f-articulo').value = artParam;
    cargarMovimientos();
}
```

No requiere cambios en las otras pantallas en FASE 4C — se pueden añadir los enlaces en FASE 5.

### 6.3 Interacción con tarjeta

1. Click / Enter en `.mv-card` → selecciona card (`mv-card--selected`).
2. Rellena `.mv-panel-body` con todos los campos del movimiento.
3. En desktop: panel derecho visible.
4. En tablet: panel se desliza como overlay lateral.
5. En móvil: panel aparece como modal inferior.
6. Click en "×" o fuera del panel → cierra panel; deselecciona card.

### 6.4 Keyboard navigation

- `Tab` navega entre tarjetas (son `<button>`).
- `Enter` / `Space` sobre tarjeta → selecciona.
- `Escape` → cierra panel de detalle.
- `F5` → refresca (llama `cargarMovimientos()` con `preventDefault`).

---

## 7. ESTRUCTURA HTML — ESQUELETO

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SGA LIN — Movimientos por Artículo</title>
    <!-- CSS compartido FASE 1 -->
    <link rel="stylesheet" href="../../../../css/base.css">
    <link rel="stylesheet" href="../../../../css/layout.css">
    <link rel="stylesheet" href="../../../../css/sidebar.css">
    <link rel="stylesheet" href="../../../../css/header.css">
    <link rel="stylesheet" href="../../../../css/buttons.css">
    <link rel="stylesheet" href="../../../../css/forms.css">
    <link rel="stylesheet" href="../../../../css/badges.css">
    <link rel="stylesheet" href="../../../../css/responsive.css">
    <!-- CSS específico -->
    <link rel="stylesheet" href="mv.css">
</head>
<body class="sga-layout">
    <!-- sidebar.js inyecta <aside> aquí -->
    <div class="sga-main">
        <header class="sga-header">...</header>
        <div class="sga-content">
            <div class="mv-inner">

                <!-- Cabecera con acciones -->
                <div class="mv-header-row">
                    <div>
                        <h1 class="sga-page-title">Movimientos por Artículo</h1>
                        <p class="sga-page-description">Timeline de trazabilidad operativa</p>
                    </div>
                    <div class="mv-header-actions">
                        <button id="btn-mv-exportar" class="sga-btn sga-btn-secondary sga-btn-sm">
                            Exportar CSV
                        </button>
                        <a href="legacy.html" class="mv-link-legacy">Ver versión clásica</a>
                    </div>
                </div>

                <!-- Barra de filtros -->
                <div class="mv-filter-bar" id="mv-filters">
                    <div class="mv-filter-primary">
                        <!-- Artículo, Lote, Ubicación, Tipo, Desde, Hasta -->
                    </div>
                    <div class="mv-filter-secondary" id="mv-filter-extra">
                        <!-- Tercero (cliente) — secundario, colapsable en móvil -->
                    </div>
                    <div class="mv-filter-actions">
                        <button id="btn-mv-buscar" class="sga-btn sga-btn-primary sga-btn-sm">
                            Buscar
                        </button>
                        <button id="btn-mv-limpiar" class="sga-btn sga-btn-secondary sga-btn-sm">
                            Limpiar
                        </button>
                    </div>
                </div>

                <!-- Workspace: timeline + panel -->
                <div class="mv-workspace">
                    <div class="mv-timeline-col">
                        <div id="mv-timeline">
                            <!-- .mv-day-group × N generados por JS -->
                            <div class="mv-placeholder">
                                Introduce filtros y pulsa Buscar
                            </div>
                        </div>
                    </div>
                    <aside class="mv-panel" id="mv-panel" aria-label="Detalle del movimiento">
                        <div class="mv-panel-empty" id="mv-panel-empty">
                            Selecciona un movimiento para ver el detalle
                        </div>
                        <div class="mv-panel-body" id="mv-panel-body" hidden>
                            <!-- Rellenado por JS -->
                        </div>
                        <button class="mv-panel-close" id="btn-mv-panel-close"
                                aria-label="Cerrar panel">×</button>
                    </aside>
                </div>

                <!-- Barra de resumen -->
                <div class="mv-summary" id="mv-summary" hidden>
                    <span id="mv-summary-text"></span>
                </div>

            </div><!-- /.mv-inner -->
        </div>
    </div>

    <script src="../../../../js/api.js"></script>
    <script src="../../../../js/ui/sidebar.js"></script>
    <script src="../../../../js/ui/layout.js"></script>
    <script src="../../../../js/opciones/almacen-y-stock/movimientos-por-articulo-mv.js"></script>
</body>
</html>
```

---

## 8. ESTRUCTURA CSS — CLASES COMPLETAS (namespace `mv-`)

### 8.1 Layout

```css
.mv-inner                  /* max-width 1280px, padding, flex column */
.mv-header-row             /* flex space-between */
.mv-header-actions         /* flex gap botones cabecera */
.mv-link-legacy            /* enlace discreto, font-size .75rem */
```

### 8.2 Filtros

```css
.mv-filter-bar             /* surface card, padding */
.mv-filter-primary         /* flex wrap gap, fila principal de filtros */
.mv-filter-secondary       /* fila secundaria colapsable en móvil */
.mv-filter-group           /* label + input pair */
.mv-filter-actions         /* botones Buscar/Limpiar */
```

### 8.3 Workspace

```css
.mv-workspace              /* display grid; desktop: 1fr 320px */
.mv-timeline-col           /* overflow-y auto; altura flexible */
.mv-panel                  /* sticky; background surface; border-left */
.mv-panel--hidden          /* panel no visible (sin selección, móvil/tablet) */
.mv-panel--overlay         /* tablet: position fixed, slide desde derecha */
```

### 8.4 Timeline y agrupación

```css
.mv-day-group              /* sección por fecha */
.mv-day-header             /* "DD/MM/YYYY · Hoy · N movimientos" */
.mv-day-header-date        /* span fecha */
.mv-day-header-label       /* span "Hoy"/"Ayer" */
.mv-day-header-count       /* span "N mov." */
.mv-cards-list             /* flex column gap */
```

### 8.5 Tarjetas de movimiento

```css
.mv-card                   /* button; display grid; border-left 4px; transition */
.mv-card:hover             /* shadow + bg tint */
.mv-card--selected         /* border-left-color accent + bg-tint */
.mv-card--e                /* border-left-color #16a34a */
.mv-card--s                /* border-left-color #dc2626 */
.mv-card--t                /* border-left-color #2563eb */
.mv-card--r                /* border-left-color #d97706 */
.mv-card--p                /* border-left-color #7c3aed */
.mv-card-badge             /* círculo con inicial; background por tipo */
.mv-card-badge--e/s/t/r/p  /* backgrounds correspondientes */
.mv-card-time              /* HH:MM; font tabular-nums */
.mv-card-main              /* artículo · lote · ubicación */
.mv-card-art               /* código artículo; font-weight 700 */
.mv-card-meta              /* lote + ubicación; font-size .75rem; muted */
.mv-card-right             /* columna derecha: cantidad + documento */
.mv-card-qty               /* cantidad; tabular-nums; font-weight 700 */
.mv-card-qty--pos          /* color #16a34a */
.mv-card-qty--neg          /* color #dc2626 */
.mv-card-qty--zero         /* color muted */
.mv-card-doc               /* serie/número documento; font-size .72rem; muted */
```

### 8.6 Panel de detalle

```css
.mv-panel-close            /* botón × absoluto top-right */
.mv-panel-empty            /* placeholder centered */
.mv-panel-body             /* padding; flex column */
.mv-panel-badge-row        /* badge grande + tipo en texto + fecha/hora */
.mv-panel-badge-lg         /* badge grande (32px) */
.mv-panel-section          /* sección con border-top */
.mv-panel-section-title    /* label sección; uppercase; muted */
.mv-detail-row             /* label + valor en fila */
.mv-detail-label           /* .68rem uppercase muted */
.mv-detail-value           /* .82rem text */
.mv-detail-qty             /* cantidad grande; 1.8rem; negrita; coloreada */
.mv-detail-stock-note      /* nota sobre stock actual; font italic; muted */
```

### 8.7 Estados

```css
.mv-loading                /* spinner text + padding */
.mv-empty                  /* "Sin resultados" centrado */
.mv-error                  /* error bar roja */
.mv-placeholder            /* estado inicial "Introduce filtros..." */
```

### 8.8 Resumen

```css
.mv-summary                /* border-top; padding; flex; font .8rem; muted */
```

### 8.9 Responsive

```css
@media (max-width: 1023px)  → .mv-workspace: 1fr (panel como overlay)
@media (max-width: 700px)   → filtros colapsables; cards compactas; panel modal inferior
@media (max-width: 480px)   → padding reducido; badge eliminado en cards (solo borde izquierdo)
```

---

## 9. ESTRUCTURA JS — MÓDULO IIFE

### 9.1 Estado interno

```js
var _rows        = [];    // todos los rows devueltos por el API
var _selectedIdx = -1;    // índice del row seleccionado
var _loading     = false; // bloqueo durante carga
```

### 9.2 Helpers

```js
function fmt(n)           // toLocaleString('es-ES')
function fmtFecha(iso)    // "2024-05-08" → "08/05/2024"
function fmtHora(s)       // "10:30:00" → "10:30"
function dash(v)          // v != null ? String(v) : '—'
function labelTipo(t)     // {E:'Entrada',S:'Salida',...}[t] || t
function classTipo(t)     // 'mv-card--' + t.toLowerCase()
function signo(n)         // n > 0 ? '+' : ''
function isHoy(iso)       // compara iso con fecha local de hoy
function isAyer(iso)      // compara iso con fecha local de ayer
function labelFecha(iso)  // "Hoy" | "Ayer" | fmtFecha(iso)
```

### 9.3 Agrupación

```js
function groupByDate(rows) {
    // Devuelve Map<string_fecha_iso, row[]>
    // Itera en el orden ya ordenado (fecha DESC del backend)
    var map = new Map();
    rows.forEach(function(r) {
        var d = (r.fecha || '').slice(0, 10);
        if (!map.has(d)) map.set(d, []);
        map.get(d).push(r);
    });
    return map;
}
```

### 9.4 Renderizado del timeline

```js
function renderTimeline(rows) {
    // Limpia #mv-timeline
    // Si rows vacío → renderEmpty()
    // Si rows → groupByDate() → forEach(date, group) → buildDayGroup()
    // Añade todos los grupos al DOM
    // Actualiza #mv-summary
}

function buildDayGroup(date, rows, globalOffset) {
    // Crea .mv-day-group
    // .mv-day-header con fecha, etiqueta relativa y count
    // .mv-cards-list con buildCard() para cada row
    // Retorna el elemento
}

function buildCard(row, idx) {
    // Crea button.mv-card + classTipo(row.tipo) + mv-card--selected si idx === _selectedIdx
    // Rellena badge, hora, artículo, meta (lote · ubicación), cantidad, documento
    // addEventListener click → selectCard(idx)
    // addEventListener keydown → Enter/Space → selectCard(idx)
    // Retorna el elemento
}
```

### 9.5 Panel de detalle

```js
function selectCard(idx) {
    // Actualiza _selectedIdx
    // Quita mv-card--selected de todas las cards
    // Añade mv-card--selected a la card idx
    // Llama renderPanel(_rows[idx])
    // En tablet/móvil: abre panel overlay/modal
}

function renderPanel(row) {
    // Oculta #mv-panel-empty
    // Muestra #mv-panel-body
    // Construye secciones con createElement:
    //   — Badge grande + tipo + fecha/hora
    //   — Movimiento: ubicación + lote + cantidad grande
    //   — Documento: serie + número + picking
    //   — Tercero: código + nombre + centro
    //   — Trazabilidad: terminal + caja + palet
    //   — Nota stock: "Stock actual: X uds (valor actual)"
}

function closePanel() {
    // _selectedIdx = -1
    // Quita mv-card--selected de todas
    // Oculta #mv-panel-body, muestra #mv-panel-empty
    // En tablet/móvil: cierra overlay/modal
}
```

### 9.6 Carga de datos

```js
function getParams() {
    // Lee todos los inputs de filtro
    // Retorna objeto con los 7 parámetros válidos
}

function cargarMovimientos() {
    // Si _loading → return
    // _loading = true; deshabilita btn-mv-buscar
    // renderLoading() en #mv-timeline
    // closePanel() (limpia selección previa)
    // SGA.movimientos.list(getParams())
    //   .then(function(data) {
    //       _rows = Array.isArray(data) ? data : [];
    //       renderTimeline(_rows);
    //   })
    //   .catch(function(err) {
    //       renderError(err);
    //   })
    //   .finally(function() {
    //       _loading = false;
    //       btn habilitado;
    //   });
}

function limpiarFiltros() {
    // Resetea todos los inputs al valor por defecto
    // _rows = []; _selectedIdx = -1;
    // Limpia #mv-timeline con renderPlaceholder()
    // Oculta #mv-summary
    // closePanel()
}
```

### 9.7 Exportación CSV

```js
function exportarCSV() {
    // Si _rows vacío → return (botón deshabilitado visualmente)
    // Cabeceras: empresa, fecha, hora, tipo, serie, numero, picking,
    //            ubicacion, lote, cantidad, stock, terminal, caja,
    //            palet, tercero, centro, nombre_tercero
    // Separador: ";"
    // Nombre fichero: movimientos_YYYY-MM-DD.csv
    // Usa Blob + URL.createObjectURL (mismo patrón que legacy)
}
```

### 9.8 Init (DOMContentLoaded)

```js
document.addEventListener('DOMContentLoaded', function() {
    // 1. Fechas por defecto: hoy − 30 días
    var hoy    = new Date();
    var hace30 = new Date(hoy); hace30.setDate(hace30.getDate() - 30);
    // Asignar valores a mv-f-desde y mv-f-hasta

    // 2. URL param ?articulo=
    var artParam = new URLSearchParams(window.location.search).get('articulo');
    if (artParam) {
        document.getElementById('mv-f-articulo').value = artParam;
    }

    // 3. Eventos
    document.getElementById('btn-mv-buscar').addEventListener('click', cargarMovimientos);
    document.getElementById('btn-mv-limpiar').addEventListener('click', limpiarFiltros);
    document.getElementById('btn-mv-exportar').addEventListener('click', exportarCSV);
    document.getElementById('btn-mv-panel-close').addEventListener('click', closePanel);

    // F5
    document.addEventListener('keydown', function(e) {
        if (e.key === 'F5') { e.preventDefault(); cargarMovimientos(); }
        if (e.key === 'Escape') { closePanel(); }
    });

    // 4. Carga inicial (si hay parámetro URL o simplemente carga por defecto)
    if (artParam) {
        cargarMovimientos();
    }
    // Sin artParam: mostrar placeholder (no auto-cargar — podría ser 500 filas sin contexto)
});
```

---

## 10. EXPORTACIÓN CSV

La exportación se hace desde `_rows` (array en memoria), no del DOM.

Mantiene compatibilidad con la funcionalidad legacy: mismo separador `;`, mismo nombre de fichero.

**Campos exportados** (en este orden):
`empresa; fecha; hora; tipo; serie; numero; picking; ubicacion; lote; cantidad; stock; terminal; caja; palet; tercero; centro; nombre_tercero`

**Diferencia vs legacy:** El legacy extraía datos del DOM (frágil, captura solo las celdas visibles). La nueva versión exporta `_rows` completo, incluidos campos que el timeline no muestra prominentemente.

---

## 11. RENDIMIENTO

### 11.1 Limitaciones que se aceptan en FASE 4C (sin tocar backend)

- TOP 500 sin paginación: aceptado. Nota en UI: "Mostrando hasta 500 movimientos".
- Subquery N+1 para stock: aceptado. El campo `stock` se muestra solo en panel detalle con nota aclaratoria.

### 11.2 Optimizaciones de frontend

- **No rerender total al seleccionar card**: solo actualiza el panel, no reconstruye el timeline.
- **Agrupación en JS**: un solo loop sobre `_rows` para construir el `Map<fecha, rows[]>`.
- **Fragmentos de documento**: usar `DocumentFragment` para insertar grupos en el timeline en una sola operación DOM.
- **CSV desde array**: no recorrer el DOM para exportar.

### 11.3 Deuda técnica documentada (para fase futura)

- Añadir parámetro `etiqueta` al backend (LEFT JOIN UBICACION).
- Implementar `subfamilia` en backend (JOIN con tabla familias).
- Reemplazar subquery N+1 de stock por JOIN o subquery única.
- Añadir paginación cursor-based (OFFSET/FETCH).
- Añadir snapshot de stock en el momento del movimiento (requiere cambio de modelo de datos).

---

## 12. BADGES Y COLORES — ESPECIFICACIÓN COMPLETA

### 12.1 Por tipo de movimiento

| Tipo | Label | Borde card | Bg badge | Color cantidad |
|------|-------|-----------|---------|----------------|
| `E` | Entrada | `#16a34a` | `#dcfce7` + texto `#16a34a` | Verde `#16a34a` |
| `S` | Salida | `#dc2626` | `#fee2e2` + texto `#dc2626` | Rojo `#dc2626` |
| `T` | Traspaso | `#2563eb` | `#dbeafe` + texto `#2563eb` | Azul `#2563eb` |
| `R` | Regularización | `#d97706` | `#fef3c7` + texto `#d97706` | Ámbar `#d97706` |
| `P` | Picking | `#7c3aed` | `#ede9fe` + texto `#7c3aed` | Morado `#7c3aed` |

### 12.2 Por signo de cantidad (independiente del tipo)

- `cantidad > 0` → `.mv-card-qty--pos` → verde `#16a34a` (con prefijo `+`)
- `cantidad < 0` → `.mv-card-qty--neg` → rojo `#dc2626`
- `cantidad = 0` → `.mv-card-qty--zero` → muted

### 12.3 Nota

En una Regularización, la cantidad puede ser positiva o negativa. El color del badge es ámbar (por tipo), pero el color de la cantidad sigue las reglas del signo. Ambos coexisten sin conflicto.

---

## 13. RESPONSIVE — ESPECIFICACIÓN DETALLADA

### 13.1 Desktop ≥ 1024px

```css
.mv-workspace { display: grid; grid-template-columns: 1fr 320px; gap: 20px; }
.mv-panel     { position: sticky; top: 72px; max-height: calc(100vh - 100px); overflow-y: auto; }
```

### 13.2 Tablet 700–1023px

```css
.mv-workspace { display: block; }
.mv-panel {
    position: fixed;
    top: 0; right: 0; bottom: 0;
    width: min(360px, 90vw);
    transform: translateX(100%);
    transition: transform .25s;
    z-index: 200;
}
.mv-panel.mv-panel--open { transform: translateX(0); }
/* Overlay oscuro detrás del panel */
.mv-panel-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 199; }
```

### 13.3 Móvil < 700px

```css
.mv-filter-bar      { flex-direction: column; }
.mv-filter-primary  { flex-direction: column; }
.mv-panel {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    max-height: 75vh;
    border-radius: 12px 12px 0 0;
    transform: translateY(100%);
    transition: transform .25s;
    z-index: 200;
    overflow-y: auto;
}
.mv-panel.mv-panel--open { transform: translateY(0); }
/* Cards compactas */
.mv-card { grid-template-columns: 32px 1fr auto; }
.mv-card-badge { width: 28px; height: 28px; font-size: .72rem; }
```

---

## 14. TAREAS DE IMPLEMENTACIÓN

### T1 — Renombrar legacy

```
frontend/pages/opciones/almacen-y-stock/movimientos-por-articulo/index.html
→ legacy.html
```

Verificación: `legacy.html` existe y `index.html` no existe antes de crear el nuevo.

### T2 — Crear `mv.css`

Ruta: `frontend/css/opciones/almacen-y-stock/movimientos-por-articulo/mv.css`

Implementar todas las clases de la sección 8 en orden:
layout → filtros → workspace → day-groups → cards → panel → estados → resumen → responsive.

Verificación: ninguna clase usa valores hardcoded de color sin variable `--sga-*` disponible
(excepto los colores semánticos de tipo E/S/T/R/P que no tienen variable en el sistema FASE 1).

### T3 — Crear `index.html`

Ruta: `frontend/pages/opciones/almacen-y-stock/movimientos-por-articulo/index.html`

Implementar la estructura de la sección 7.
Scripts al final del body: `api.js`, `sidebar.js`, `layout.js`, `movimientos-por-articulo-mv.js`.

Verificación: profundidad de ruta = 4 niveles → prefijo `../../../../`.

### T4 — Crear `movimientos-por-articulo-mv.js`

Ruta: `frontend/js/opciones/almacen-y-stock/movimientos-por-articulo-mv.js`

Implementar el IIFE completo de la sección 9:
estado → helpers → groupByDate → renderTimeline → buildDayGroup → buildCard →
selectCard → renderPanel → closePanel → cargarMovimientos → limpiarFiltros →
exportarCSV → DOMContentLoaded init.

Reglas obligatorias:
- `"use strict"` al inicio del IIFE.
- Solo `createElement` / `appendChild` / `append` — **cero `innerHTML`** excepto en `setLoading`.
- Solo `textContent` para valores de usuario — **cero `innerHTML` con datos del API**.
- `Promise`-based (no `async/await` — misma convención que FASE 4A/4B).

Verificación: `grep innerHTML movimientos-por-articulo-mv.js` no debe aparecer salvo en los 3 helpers de estado (loading/empty/error).

---

## 15. VERIFICACIONES MANUALES

### 15.1 Carga y filtros

- [ ] Pantalla carga sin errores de consola.
- [ ] Fechas por defecto (hoy − 30 días) están pre-rellenas.
- [ ] Buscar sin filtros devuelve movimientos y los muestra como timeline.
- [ ] Filtrar por artículo → solo aparecen filas de ese artículo.
- [ ] Filtrar por tipo "Entrada" → todas las cards son verdes (tipo E).
- [ ] Filtrar por tipo "Salida" → todas las cards son rojas (tipo S).
- [ ] Filtrar por fecha corta (un solo día) → muestra solo ese grupo de día.
- [ ] Limpiar filtros → timeline se vacía, placeholder aparece.

### 15.2 Timeline y agrupación

- [ ] Movimientos aparecen agrupados por fecha, orden DESC (más reciente primero).
- [ ] Cabecera de día muestra "Hoy" para la fecha actual.
- [ ] Cabecera de día muestra "Ayer" para la fecha de ayer.
- [ ] Count de movimientos en cabecera de día es correcto.
- [ ] Con 0 resultados aparece estado "Sin resultados".
- [ ] Con 500 resultados (límite) aparece nota "Mostrando hasta 500 movimientos".

### 15.3 Tarjetas

- [ ] Cada card muestra badge con inicial del tipo (E/S/T/R/P).
- [ ] Borde izquierdo de card coincide con el color del tipo.
- [ ] Cantidad positiva: color verde con prefijo `+`.
- [ ] Cantidad negativa: color rojo.
- [ ] Artículo, lote y ubicación visibles en la card.
- [ ] Referencia de documento (serie + número) visible.

### 15.4 Panel de detalle

- [ ] Click en una card → panel se rellena con todos los campos.
- [ ] Click en otra card → panel se actualiza.
- [ ] Card seleccionada tiene indicador visual (borde accent + bg tintado).
- [ ] Cantidad en panel aparece grande y coloreada.
- [ ] Nota de stock incluye texto "(valor actual, no histórico)".
- [ ] Botón "×" cierra el panel y deselecciona la card.
- [ ] Escape cierra el panel.

### 15.5 Responsive

- [ ] En 1280px: panel detalle visible a la derecha.
- [ ] En 900px: panel desaparece del layout → se abre como slide overlay lateral.
- [ ] En 480px: panel se abre como modal inferior.
- [ ] Filtros son usables en 480px (no se solapan).
- [ ] Cards son legibles en 480px.

### 15.6 CSV

- [ ] Botón "Exportar CSV" descarga archivo con nombre `movimientos_YYYY-MM-DD.csv`.
- [ ] CSV contiene cabeceras correctas y datos de todas las filas de `_rows`.
- [ ] CSV usa separador `;`.
- [ ] Con `_rows` vacío: botón no descarga ni lanza error.

### 15.7 Navegación

- [ ] Link "Ver versión clásica" abre `legacy.html` (en la misma pestaña).
- [ ] `legacy.html` carga correctamente con sus scripts originales.
- [ ] Sidebar "Movimientos por artículo" apunta a `index.html` (nueva pantalla) ✓.
- [ ] Acceso rápido del dashboard apunta a `index.html` (nueva pantalla) ✓.
- [ ] URL `?articulo=ART001` pre-rellena el filtro y dispara la búsqueda automática.

### 15.8 Tests

- [ ] `npx jest --no-coverage` → 80/80 passing (no se tocan archivos de backend).

---

## 16. CRITERIOS DE ÉXITO

1. El timeline agrupa por fecha y es legible sin scroll horizontal.
2. El tipo de movimiento es inmediatamente identificable (badge + color).
3. Un operario puede responder "¿qué pasó con este artículo?" en < 10 segundos.
4. El panel de detalle muestra todos los campos del movimiento sin abrir otra pantalla.
5. La pantalla es usable en móvil (cards compactas, panel modal).
6. Los filtros rotos del legacy han desaparecido.
7. La exportación CSV funciona desde `_rows` (no desde DOM).
8. La pantalla legacy está accesible en `legacy.html`.
9. Tests: 80/80 passing.
10. Cero errores de consola en carga normal.

---

## 17. RIESGOS DETECTADOS

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|----|--------|-------------|---------|-----------|
| R1 | Stock columna muestra valor actual (confuso para trazabilidad) | Alta (siempre) | Medio | Nota aclaratoria en panel: "valor actual, no histórico" |
| R2 | TOP 500 sin paginación silencia movimientos antiguos | Media | Alto | Mostrar aviso en UI; recomendado como FASE 5 backend |
| R3 | N+1 subquery stock degrada rendimiento con >100 filas | Alta | Medio | Aceptado en FASE 4C; deuda técnica documentada |
| R4 | Tipos de movimiento fuera de E/S/T/R/P (datos históricos sucios) | Baja | Bajo | Fallback: badge sin color + label = código original |
| R5 | `nombre_tercero` puede ser NULL en algunos movimientos | Media | Bajo | `dash()` helper muestra `—` si null |
| R6 | Overlay/modal en tablet/móvil puede chocar con el sidebar | Media | Bajo | Z-index del panel (200) > z-index del sidebar; verificar |

---

## 18. EXCLUSIONES PARA FUTURAS FASES

Las siguientes funcionalidades **NO se implementan en FASE 4C**:

| Funcionalidad | Motivo de exclusión | Fase sugerida |
|--------------|--------------------|-|
| Snapshot de stock en el momento del movimiento | Requiere cambio de modelo de datos en backend | FASE 6+ |
| Paginación cursor-based | Requiere modificar el endpoint | FASE 5 |
| Subquery stock → JOIN | Requiere modificar el endpoint | FASE 5 |
| Filtro por subfamilia | Backend no implementado | FASE 5 |
| Modo agrupado (GROUP BY artículo/lote) | Backend no implementado | FASE 5 |
| Etiqueta de ubicación (JOIN UBICACION) | Requiere modificar el endpoint | FASE 5 |
| Timeline gráfico (Chart.js u otro) | Librería externa prohibida en FASE 4C | FASE 5+ |
| Mapa visual de ubicaciones | Excluido explícitamente por las reglas | — |
| WebSocket / tiempo real | Excluido explícitamente | — |
| BI / analytics avanzado | Excluido explícitamente | — |
| Auditoría multiusuario | Excluido explícitamente | — |

---

## 19. RECOMENDACIONES ARQUITECTÓNICAS

1. **URL params como contrato de navegación**: implementar `?articulo=X` ahora crea un contrato que las demás pantallas (stock, entradas, salidas) pueden consumir simplemente añadiendo un enlace `<a href="movimientos/?articulo=...">`. Cero cambios en el JS de movimientos.

2. **El panel de detalle como patrón reutilizable**: el patrón `timeline + panel lateral + overlay en tablet + modal en móvil` debería convertirse en el estándar para futuras pantallas de auditoría (traspasos, regularizaciones).

3. **Exportación desde array, no desde DOM**: establecido en FASE 4B (salidas). FASE 4C consolida este patrón. Todas las exportaciones futuras deben seguirlo.

4. **Agrupación temporal como UX estándar**: el patrón `day-group → day-header → cards-list` es genérico y reutilizable para cualquier entidad con fecha (picking, expediciones, hojas de ruta).

5. **CSS namespace estricto**: `mv-` no colisiona con `em-` (entradas), `sm-` (salidas), `db-` (dashboard). Continuar esta convención en FASE 4D+.

---

## 20. FLUJO OPERATIVO RECOMENDADO

```
Operario investiga incidencia en almacén:

1. Abre "Movimientos por Artículo" desde sidebar o dashboard
2. Escribe el código del artículo sospechoso en [Artículo]
3. Opcionalmente: filtra por tipo (p.ej. "Salida") o fecha concreta
4. Pulsa Buscar → ve timeline agrupado por fechas
5. Identifica el día de la incidencia → ve las cards de ese grupo
6. Click en la card sospechosa → panel de detalle se abre
7. Panel muestra: ubicación · lote · cantidad · documento · tercero · terminal
8. El operario tiene toda la trazabilidad en < 30 segundos
9. Si necesita más contexto: pulsa "Exportar CSV" para llevar datos a otro sistema
10. Si quiere los filtros avanzados legacy: enlace "Ver versión clásica"
```

---

## 21. ORDEN DE IMPLEMENTACIÓN

```
T1  Renombrar index.html → legacy.html
T2  Crear mv.css (layout → filtros → workspace → cards → panel → estados → responsive)
T3  Crear index.html (shell completo con todos los IDs correctos)
T4  Crear movimientos-por-articulo-mv.js (IIFE completo)
    T4a  Helpers + estado
    T4b  groupByDate + renderTimeline + buildDayGroup + buildCard
    T4c  selectCard + renderPanel + closePanel
    T4d  cargarMovimientos + limpiarFiltros
    T4e  exportarCSV
    T4f  DOMContentLoaded init + URL params
V   Verificaciones manuales (sección 15)
    Ejecutar: npx jest --no-coverage → confirmar 80/80
```

---

*Plan generado: 2026-05-08*
*Estado: PENDIENTE DE IMPLEMENTACIÓN*
*Siguiente comando: `/executing-plans FASE 4C`*
