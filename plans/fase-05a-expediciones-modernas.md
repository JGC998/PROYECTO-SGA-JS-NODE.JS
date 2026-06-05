# FASE 5A — Expediciones Modernas
## Plan Técnico Completo

**Fecha:** 2026-05-11
**Rama objetivo:** paco-clean (continúa sobre FASE 4D)
**Objetivo:** Transformar la pantalla de expediciones en un tablero operativo moderno integrado con el sistema visual FASE 1.

---

## 1. Diagnóstico UX Completo

### 10 Problemas identificados

**P1 — Fuera del sistema visual FASE 1**
Usa `navegacion.css` y `navegacion.js` en lugar de `base.css` / `layout.css` / `sidebar.js`. Sin sidebar FASE 1, sin header estándar, sin CSS variables del sistema. La página es una isla visual desconectada del resto del SGA moderno.

**P2 — JS sin disciplina**
`expediciones.js` no usa IIFE, no usa `"use strict"`. Usa `innerHTML` con template literals directamente (riesgo XSS con datos de cliente/nombre). No tiene namespace de funciones. Variables potencialmente globales.

**P3 — Tabla sin agrupación por albarán**
El endpoint devuelve una fila por línea de ALBARANCS. Un albarán con 20 artículos aparece como 20 filas idénticas (mismo número de albarán, mismo cliente, misma fecha). El usuario ve datos duplicados y confusos.

**P4 — Sin estados visuales**
No hay ningún badge o indicador visual de estado. No se distingue entre "pendiente" y "con picking". Toda la lista se ve igual.

**P5 — 5 de 6 tabs completamente vacíos**
Solo "Pedidos de cliente" carga datos. Los tabs de proveedores, inventarios, órdenes de fabricación, reposición y cambios de destino muestran solo la fila de placeholder estática. Ruido visual, falsas expectativas.

**P6 — Filtros no conectados**
Los dos `<select>` ("Todos los pedidos", "Con picking/Sin picking") y los botones "Pedidos sin asignar", "Gestión de rutas", "Manifiesto de carga", "No agencia" existen en el HTML pero no tienen handlers. Son decorativos.

**P7 — Sin panel de detalle ni drill-down**
Hacer clic en una fila de la tabla no hace nada. No hay forma de ver qué artículos contiene un albarán, ni navegar a stock ni movimientos relacionados.

**P8 — Sin filtro de fechas**
El endpoint devuelve los últimos 200 registros sin ningún control temporal. El usuario no puede ver expediciones de un período concreto ni limitar la carga.

**P9 — Columnas vacías en tabla**
Las columnas "Gr", "Exped.", "Cen" y "Agencia" aparecen en la cabecera pero nunca tienen datos: los campos correspondientes no existen en el endpoint. Ocupan espacio y confunden.

**P10 — Sin responsive real**
El layout usa `max-width: 1400px` con `margin: auto` del CSS propio. No adapta a tablet ni móvil. Sin hamburger, sin sidebar adaptable, sin breakpoints operativos.

---

## 2. Análisis Técnico Actual

| Aspecto | Estado |
|---|---|
| HTML | `logistica-y-pedidos/expediciones/index.html` — usa `navegacion.css`, no FASE 1 |
| CSS | `expediciones/index.css` — sin variables FASE 1, clases genéricas sin namespace |
| JS | `expediciones.js` — sin IIFE, `innerHTML` template literals, sin estado |
| Backend | `GET /expediciones` en `stock.routes.js` — 7 campos, TOP 200, sin fechas |
| Namespace CSS | Ninguno — clases genéricas (`table`, `btn-sub`, `tab-btn`) |
| API call | `SGA.expediciones.list({buscar})` — funciona, acepta params genéricos |
| Sidebar | Usa `navegacion.js` (legacy) en lugar de `sidebar.js` (FASE 1) |
| Tabs activos | 1 de 6 |
| Panel de detalle | Ninguno |
| Estado visual | Ninguno |
| Agrupación por albarán | Ninguna — una fila por línea ALBARANCS |

---

## 3. Endpoint Real

```
GET /expediciones
```

**Archivo:** `backend/routes/stock.routes.js` (líneas 191–209)
**Montaje:** `app.use('/', stockRoutes)` en `backend/app.js`

**SQL actual:**
```sql
SELECT TOP 200
    ACSNUM AS albaran, ACSSER AS serie,
    ACSCLICOD AS cliente, ACSCLINOM AS nombre_cliente,
    CONVERT(varchar,ACSFEC,23) AS fecha,
    ACSNUMPIC AS picking, ACSMOV AS tipo
FROM ALBARANCS
WHERE ACSMOV='E'
AND (ACSCLICOD LIKE @b OR ACSCLINOM LIKE @b OR CAST(ACSNUM AS varchar) LIKE @b)
ORDER BY ACSFEC DESC, ACSNUM DESC
```

**Parámetro actual:** `buscar` — wildcard sobre cliente, nombre y nº albarán.

**Cambio necesario:** ver Sección 18.

---

## 4. Estructura de Datos Real

### Tabla ALBARANCS — campos relevantes para expediciones

| Campo ALBARANCS | Alias API actual | Añadir | Descripción |
|---|---|---|---|
| ACSNUM | albaran | — | Número de albarán (agrupa líneas) |
| ACSSER | serie | — | Serie del documento |
| ACSCLICOD | cliente | — | Código de cliente |
| ACSCLINOM | nombre_cliente | — | Nombre de cliente |
| ACSFEC | fecha | — | Fecha del movimiento |
| ACSNUMPIC | picking | — | Número de picking asignado a la línea |
| ACSMOV | tipo | — | Tipo movimiento (siempre 'E' = Expedición) |
| ACSARTCOD | articulo | **SÍ** | Código de artículo de la línea |
| ARTNOM (subquery) | nombre_articulo | **SÍ** | Nombre del artículo |
| ACSCAN | cantidad | **SÍ** | Cantidad en la línea |
| ACSUBI | ubicacion | **SÍ** | Ubicación de origen |
| ACSLOT | lote | **SÍ** | Lote de la línea |

### Estructura agrupada en memoria (frontend)

Una vez cargados los rows crudos, el frontend los agrupa por `albaran|serie`:

```
AlbaranObj {
  albaran: 12345,
  serie: 'A',
  cliente: 'CLI001',
  nombre_cliente: 'Empresa S.A.',
  fecha: '2026-05-11',
  status: 'pendiente' | 'parcial' | 'preparado',   // derivado
  numPicking: '42' | null,                           // del primer picking encontrado
  lineas: [
    { articulo, nombre_articulo, cantidad, ubicacion, lote, picking }
  ]
}
```

---

## 5. Estados Reales Detectados

No existe campo de estado real en ALBARANCS. El estado se deriva del campo `picking` de las líneas:

| Estado | Condición de derivación | Color | Badge |
|---|---|---|---|
| **Pendiente** | Ninguna línea tiene picking | Amber | `PENDIENTE` |
| **Parcial** | Algunas líneas tienen picking, otras no | Naranja | `PARCIAL` |
| **Preparado** | Todas las líneas tienen picking | Azul | `CON PICKING` |

**Limitación documentada:** Sin campo de estado real no es posible distinguir "expedido" de "preparado". El albarán puede estar físicamente salido del almacén pero seguir apareciendo igual que uno preparado. Esto es deuda técnica del sistema, no un problema de esta pantalla.

---

## 6. Flujo Operativo Recomendado

```
[Carga inicial — últimos 30 días]
         ↓
[Filtros: fecha, búsqueda, estado]
         ↓
[Lista de tarjetas — 1 card por albarán]
    │
    ├─ Badge estado (Pendiente / Parcial / Con picking)
    ├─ Nº albarán + serie
    ├─ Cliente
    ├─ Fecha
    ├─ Nº de líneas
    └─ Nº picking (si tiene)
         │
         └──[Clic tarjeta]──→ [Panel de detalle]
                                    │
                                    ├─ Cabecera: albarán, cliente, fecha, estado
                                    ├─ Lista de líneas:
                                    │    └─ artículo, nombre, cantidad, ubicación, lote
                                    └─ Accesos rápidos por artículo:
                                         ├─ [→ Movimientos]
                                         └─ [→ Stock]
```

---

## 7. Diseño Visual Completo

### Desktop (≥1024px) — Tablero 2 columnas

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SIDEBAR   │  ☰  Expediciones desde Pedido          [breadcrumb]         │
│  (FASE 1)  ├──────────────────────────────────────────────────────────────┤
│            │  ┌─ FILTROS ────────────────────────────────────────────┐    │
│            │  │ [Desde ________] [Hasta ________]                    │    │
│            │  │ [Buscar albarán / cliente…     ] [Hoy][7d][30d][90d] │    │
│            │  │ Estado: [Todos ▾]                      [Actualizar]  │    │
│            │  └──────────────────────────────────────────────────────┘    │
│            │                                                               │
│            │  ┌─ RESUMEN ───────────────────────────────────────────┐     │
│            │  │  [Total: 42]  [Pendientes: 18]  [Parcial: 7]  [Ok: 17]│   │
│            │  └─────────────────────────────────────────────────────┘     │
│            │                                                               │
│            │  ┌─ LISTA ──────────────────────┐ ┌─ DETALLE ─────────────┐  │
│            │  │                              │ │                       │  │
│            │  │ ┌────────────────────────┐   │ │ ALB 12345 · A  [PEND] │  │
│            │  │ │[PENDIENTE]   10/05/2026│   │ │ Empresa S.A. (CLI001) │  │
│            │  │ │ ALB 12345 · A          │   │ │ 10/05/2026            │  │
│            │  │ │ Empresa S.A.           │   │ │ ─────────────────     │  │
│            │  │ │ 3 líneas               │   │ │ ART001 · Tornillo M4  │  │
│            │  │ └────────────────────────┘   │ │   5 uds · LOT1 · A01  │  │
│            │  │                              │ │   [→ Movimientos]     │  │
│            │  │ ┌────────────────────────┐   │ │ ART002 · Tuerca M4    │  │
│            │  │ │[CON PICKING] 09/05/2026│   │ │   3 uds · LOT2 · A02  │  │
│            │  │ │ ALB 12344 · A          │   │ │   [→ Stock]           │  │
│            │  │ │ Otro Cliente S.L.      │   │ │                       │  │
│            │  │ │ 7 líneas  Pick.#42     │   │ │                       │  │
│            │  │ └────────────────────────┘   │ │                       │  │
│            │  │          ...                 │ └───────────────────────┘  │
│            │  └──────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### Tablet (641px–1023px) — Lista full + Panel overlay

```
┌──────────────────────────────────────────────┐
│ ☰  Expediciones                              │
├──────────────────────────────────────────────┤
│ [Buscar…              ] [Estado ▾] [30d ▾]   │
├──────────────────────────────────────────────┤
│ [Total: 42] [Pendientes: 18] [Parcial: 7]    │
├──────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐ │
│ │ [PENDIENTE]                  10/05/2026  │ │
│ │ ALB 12345 · A · Empresa S.A.             │ │
│ │ 3 líneas                                 │ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ [CON PICKING] #42            09/05/2026  │ │
│ │ ALB 12344 · A · Otro Cliente S.L.        │ │
│ │ 7 líneas                                 │ │
│ └──────────────────────────────────────────┘ │

Panel overlay (slide desde derecha al pulsar tarjeta):
┌──────────────────────────────────────────────┐
│ ALB 12345 · A                           [×]  │
│ Empresa S.A. (CLI001) · 10/05/2026           │
│ [PENDIENTE]                                  │
│ ────────────────────────────────────────     │
│ ART001 · Tornillo M4                         │
│ 5 uds · LOT1 · Ubi: A-01-01                 │
│ [→ Movimientos]  [→ Stock]                   │
│ ────────────────────────────────────────     │
│ ART002 · Tuerca M4                           │
│ 3 uds · LOT2 · Ubi: A-01-02                 │
│ [→ Movimientos]  [→ Stock]                   │
└──────────────────────────────────────────────┘
```

### Móvil (≤640px) — Cards + Panel bottom-sheet

```
┌────────────────────────┐
│ ☰  Expediciones   [F↓] │
├────────────────────────┤
│ [Buscar…             ] │
│ [Estado ▾]  [30d ▾]    │
├────────────────────────┤
│ [42] [18 pend] [7 par] │
├────────────────────────┤
│┌──────────────────────┐│
││[PENDIENTE] 10/05/2026││
││ALB 12345 · A         ││
││Empresa S.A.          ││
││3 líneas              ││
│└──────────────────────┘│
│┌──────────────────────┐│
││[PICK.#42] 09/05/2026 ││
││ALB 12344 · A         ││
│└──────────────────────┘│
└────────────────────────┘

Panel bottom-sheet (slide desde abajo):
┌────────────────────────┐
│ ALB 12345 · A     [×] │
│ Empresa S.A.           │
│ [PENDIENTE]            │
│ ──────────────────     │
│ ART001 · 5 uds         │
│ LOT1 · A-01-01         │
│ [→ Mov] [→ Stock]      │
│ ──────────────────     │
│ ART002 · 3 uds         │
└────────────────────────┘
```

---

## 8. Tablero — Estructura

### Barra de resumen (4 contadores)

| Contador | Lógica |
|---|---|
| **Total** | `Object.keys(_albaranes).length` después de filtro de fechas/búsqueda |
| **Pendientes** | Albaranes con `status === 'pendiente'` |
| **Parciales** | Albaranes con `status === 'parcial'` |
| **Con picking** | Albaranes con `status === 'preparado'` |

Los contadores reflejan el dataset actualmente cargado (respetan filtros de fecha y búsqueda, pero no el filtro de estado — así el usuario ve el total real antes de filtrar por estado).

### Tarjeta de albarán (`.ep-card`)

```
┌──────────────────────────────────────────────────┐
│  [BADGE estado]                    DD/MM/YYYY    │
│                                                   │
│  ALB NNNNN · SERIE                                │
│  NOMBRE CLIENTE (COD)                             │
│                                                   │
│  N líneas                 Pick.#NN (si tiene)    │
└──────────────────────────────────────────────────┘
```

La tarjeta activa (`.ep-card--active`) recibe borde izquierdo de color `--sga-accent` y fondo `#eff6ff`.

---

## 9. Panel Lateral de Detalle

### Estructura del panel

```
┌─ .ep-panel ─────────────────────────────────┐
│ .ep-panel-header                             │
│   .ep-panel-title  [ALB NNNNN · SERIE]       │
│   .ep-panel-close [×]                        │
│                                              │
│ .ep-panel-meta (cuando hay selección)        │
│   Nombre cliente · Fecha · [BADGE]           │
│                                              │
│ .ep-panel-empty (cuando no hay selección)    │
│   "Selecciona un albarán para ver detalle"   │
│                                              │
│ .ep-panel-body (cuando hay selección)        │
│   .ep-linea (×N)                             │
│     .ep-linea-art  ART001 · Tornillo M4      │
│     .ep-linea-data 5 uds · LOT1 · A-01-01   │
│     .ep-linea-actions                        │
│       [→ Movimientos]  [→ Stock]             │
└─────────────────────────────────────────────┘
```

### Links de acceso rápido

| Link | URL de destino |
|---|---|
| → Movimientos | `../../almacen-y-stock/movimientos-por-articulo/index.html?articulo=ARTCOD` |
| → Stock | `../../almacen-y-stock/consulta-de-stock/index.html?articulo=ARTCOD` |

Los paths relativos son desde `logistica-y-pedidos/expediciones/index.html` hacia `almacen-y-stock/`.

---

## 10. Badges y Colores

| Badge | Clase CSS | Fondo | Texto | Variable base |
|---|---|---|---|---|
| PENDIENTE | `.ep-badge--pendiente` | `#fef9c3` | `#854d0e` | `--sga-warning` |
| PARCIAL | `.ep-badge--parcial` | `#fff7ed` | `#9a3412` | amber-700 |
| CON PICKING | `.ep-badge--preparado` | `#eff6ff` | `#1e40af` | `--sga-accent` |

### Contadores — colores de acento

| Contador | Color nº | Color label |
|---|---|---|
| Total | `var(--sga-primary)` | `var(--sga-text-muted)` |
| Pendientes | `#854d0e` | `var(--sga-text-muted)` |
| Parciales | `#9a3412` | `var(--sga-text-muted)` |
| Con picking | `var(--sga-accent)` | `var(--sga-text-muted)` |

---

## 11. Filtros

### Filtros de primer nivel (siempre visibles)

| Control | Tipo | Acción |
|---|---|---|
| Desde | `<input type="date">` | Recarga servidor al cambiar |
| Hasta | `<input type="date">` | Recarga servidor al cambiar |
| Búsqueda texto | `<input type="text">` | Debounce 300ms → recarga servidor |
| Estado | `<select>` | Filtro en memoria (sin recarga) |
| Botones rápidos | `[Hoy][7d][30d][90d]` | Establecen desde/hasta + recargan |

### Comportamiento de filtros

- **Texto + fechas** → llaman a `cargar()` que hace la petición al servidor
- **Estado** → llama a `filterAndRender()` que filtra `_albaranes` en memoria y actualiza la lista sin petición
- **Por defecto**: últimos 30 días, todos los estados, sin búsqueda

### Filtros NO implementados en FASE 5A

Los botones del legacy (Pedidos sin asignar, Gestión de rutas, Manifiesto de carga, No agencia) requieren campos que no existen en el endpoint. Se eliminarán del HTML y **no** se incluirán como placeholders sin función.

---

## 12. Agrupación

### Algoritmo de agrupación (O(n), una pasada)

```javascript
function groupByAlbaran(rows) {
    var map = Object.create(null);
    rows.forEach(function (r) {
        var key = String(r.albaran) + '|' + (r.serie || '');
        if (!map[key]) {
            map[key] = {
                key: key,
                albaran: r.albaran,
                serie: r.serie || '',
                cliente: r.cliente || '',
                nombre_cliente: r.nombre_cliente || '',
                fecha: r.fecha || '',
                lineas: []
            };
        }
        if (r.articulo) {
            map[key].lineas.push({
                articulo: r.articulo,
                nombre_articulo: r.nombre_articulo || r.articulo,
                cantidad: r.cantidad,
                ubicacion: r.ubicacion || '',
                lote: r.lote || '',
                picking: r.picking || ''
            });
        }
    });
    // Derivar estado por albarán
    Object.keys(map).forEach(function (k) {
        var alb = map[k];
        var total = alb.lineas.length;
        var conPick = alb.lineas.filter(function (l) { return !!l.picking; }).length;
        alb.numPicking = conPick ? alb.lineas.find(function (l) { return !!l.picking; }).picking : null;
        if (total === 0 || conPick === 0) alb.status = 'pendiente';
        else if (conPick === total) alb.status = 'preparado';
        else alb.status = 'parcial';
    });
    return map;
}
```

### Filtro en memoria sobre albaranes agrupados

```javascript
function filterAlbaranes() {
    var status = _filters.status;
    return Object.values(_albaranes).filter(function (alb) {
        return status === 'todos' || alb.status === status;
    });
}
```

---

## 13. Responsive

| Breakpoint | Layout | Panel |
|---|---|---|
| ≥1024px | Grid 2 cols: lista (`1fr`) + panel sticky (`380px`) | Siempre visible como columna derecha |
| 641px–1023px | Lista full-width (1 col) | Overlay slide derecha (`translateX(110%)` → `translateX(0)`) |
| ≤640px | Cards en columna | Bottom-sheet (`translateY(110%)` → `translateY(0)`) |

### Detalles responsive

- **Desktop**: `.ep-panel` con `position: sticky; top: calc(var(--sga-header-h, 56px) + 16px)`
- **Tablet**: `.ep-panel` con `position: fixed; right: 0; top: 0; bottom: 0; width: min(380px, 90vw); transform: translateX(110%)`; clase `.ep-panel--open` → `transform: translateX(0)`
- **Móvil**: `.ep-panel` con `position: fixed; bottom: 0; left: 0; right: 0; max-height: 80vh; border-radius: 14px 14px 0 0; transform: translateY(110%)`; clase `.ep-panel--open` → `transform: translateY(0)`
- **Backdrop** (`.ep-panel-backdrop`): visible en tablet y móvil cuando el panel está abierto

---

## 14. Rendimiento

- **TOP 500** rows en backend (subida de 200) — con filtro de 30 días por defecto, este límite raramente se alcanza
- **Filtro de fechas por defecto** (últimos 30 días) — evita cargar todo el histórico
- **Agrupación O(n)** en frontend — una pasada sobre el array de rows
- **Filtro de estado en memoria** — sin petición al servidor; rerender solo del DOM
- **Búsqueda texto con debounce 300ms** — evita peticiones por cada tecla
- **Recarga del servidor** solo cuando cambia fecha o búsqueda (no cuando cambia filtro de estado)
- **Subquery ARTNOM** en SQL usa `TOP 1` con WHERE exacto — típicamente indexado en ARTCOD

---

## 15. Archivos Exactos

### Archivos a reemplazar completamente (ya existen, contenido caduco):

```
frontend/pages/opciones/logistica-y-pedidos/expediciones/index.html
frontend/css/opciones/logistica-y-pedidos/expediciones/index.css
frontend/js/opciones/logistica-y-pedidos/expediciones.js
```

### Archivo backend a modificar (cambio mínimo):

```
backend/routes/stock.routes.js   ← solo la función router.get('/expediciones', ...)
```

### Archivos a NO tocar:

```
frontend/js/api.js               ← SGA.expediciones.list ya acepta params genéricos
frontend/js/ui/sidebar.js        ← ruta ya correcta (FASE 4D la actualizó)
frontend/css/base.css            ← sistema visual FASE 1, no modificar
frontend/css/layout.css          ← ídem
frontend/css/sidebar.css         ← ídem
backend/app.js                   ← montaje de rutas ya correcto
backend/tests/nucleo.test.js     ← no hay tests de /expediciones, no afectar
```

---

## 16. CSS Necesarios

**Namespace:** `ep-` (e + p, expediciones)
**Archivo:** `frontend/css/opciones/logistica-y-pedidos/expediciones/index.css`
**Estructura FASE 1:** Usa variables `--sga-*` de `base.css`

### Clases a definir (34 selectores + media queries)

**Layout:**
- `.ep-inner` — contenedor principal dentro de `.sga-content`
- `.ep-header-row` — fila título + subtítulo
- `.ep-workspace` — `display: grid; grid-template-columns: 1fr 380px; gap: 24px` (desktop)

**Filtros:**
- `.ep-filters` — tarjeta de filtros
- `.ep-filters-row` — fila de controles
- `.ep-date-input` — input de fecha
- `.ep-search-input` — input de búsqueda (ancho mayor)
- `.ep-quick-btn` — botones [Hoy][7d][30d][90d]
- `.ep-quick-btn--active` — botón de rango activo
- `.ep-status-select` — select de estado
- `.ep-apply-btn` — botón actualizar

**Contadores:**
- `.ep-counters` — barra con 4 contadores
- `.ep-counter` — un contador individual
- `.ep-counter__val` — número grande
- `.ep-counter__label` — etiqueta pequeña

**Lista de tarjetas:**
- `.ep-list` — contenedor de tarjetas (flex column, gap)
- `.ep-placeholder` — estado vacío / cargando
- `.ep-card` — tarjeta de albarán; `border-left: 4px solid var(--sga-border); cursor: pointer`
- `.ep-card--active` — tarjeta seleccionada: `border-left-color: var(--sga-accent); background: #eff6ff`
- `.ep-card-top` — fila badge + fecha
- `.ep-card-albaran` — número albarán
- `.ep-card-cliente` — nombre cliente
- `.ep-card-footer` — nº líneas + picking

**Badge:**
- `.ep-badge` — base del badge
- `.ep-badge--pendiente` — amber
- `.ep-badge--parcial` — naranja
- `.ep-badge--preparado` — azul

**Panel:**
- `.ep-panel` — panel lateral / overlay
- `.ep-panel--open` — clase activadora en tablet/móvil
- `.ep-panel-header` — cabecera del panel
- `.ep-panel-title` — título del panel
- `.ep-panel-close` — botón ×
- `.ep-panel-empty` — estado vacío del panel
- `.ep-panel-meta` — meta del albarán seleccionado
- `.ep-panel-body` — contenedor de líneas
- `.ep-linea` — fila de artículo
- `.ep-linea-art` — código + nombre
- `.ep-linea-data` — cantidad, lote, ubicación
- `.ep-linea-actions` — links rápidos
- `.ep-panel-backdrop` — overlay semi-transparente (tablet/móvil)

**Media queries:**
```css
@media (max-width: 1023px) { /* tablet: panel overlay lateral */ }
@media (max-width: 640px)  { /* móvil: panel bottom-sheet, cards stack */ }
```

---

## 17. JS Necesarios

**Archivo:** `frontend/js/opciones/logistica-y-pedidos/expediciones.js`
**Patrón:** `"use strict"; (function(){ ... })();`
**DOM:** solo `document.createElement` + `.textContent`; `innerHTML = ''` solo para vaciar contenedores

### Estado del módulo

```javascript
var _rows      = [];              // rows crudos del API
var _albaranes = Object.create(null); // agrupados key='num|serie'
var _selected  = null;            // key del albarán seleccionado en panel
var _loading   = false;
var _filters   = {
    buscar: '',
    desde:  '',   // YYYY-MM-DD  (default: hace 30 días)
    hasta:  '',   // YYYY-MM-DD  (default: hoy)
    status: 'todos'   // 'todos' | 'pendiente' | 'parcial' | 'preparado'
};
```

### Funciones (24)

| Función | Descripción |
|---|---|
| `cargar()` | Llama `SGA.expediciones.list({buscar, desde, hasta})` → `groupByAlbaran` → `filterAndRender` |
| `groupByAlbaran(rows)` | Agrupa rows por clave `num\|serie`, deriva status por albarán |
| `deriveStatus(lineas)` | Devuelve `'pendiente' \| 'parcial' \| 'preparado'` |
| `filterAndRender()` | Filtra `_albaranes` por `_filters.status` → `renderList` → `updateCounters` |
| `renderList(albaranesArr)` | Vacía `.ep-list`, construye tarjetas con `createElement`, añade events |
| `buildCard(alb)` | Devuelve `div.ep-card` con todos los elementos internos |
| `buildBadge(status)` | Devuelve `span.ep-badge.ep-badge--X` con texto localizado |
| `selectAlbaran(key)` | Marca tarjeta activa, llama `renderDetalle`, abre panel en tablet/móvil |
| `renderDetalle(alb)` | Construye cabecera + líneas en `.ep-panel-body` |
| `buildLineaEl(linea)` | Devuelve `div.ep-linea` con art, datos y acciones |
| `buildAcciones(articulo)` | Devuelve `div.ep-linea-actions` con 2 links |
| `updateCounters()` | Actualiza los 4 contadores en `.ep-counters` con conteos del dataset actual |
| `openPanel()` | Añade `.ep-panel--open` + `.ep-panel-backdrop--active` |
| `closePanel()` | Elimina dichas clases, limpia `_selected`, reactiva tarjeta |
| `setQuickDate(days)` | Calcula desde/hasta, actualiza inputs, actualiza `.ep-quick-btn--active`, llama `cargar()` |
| `getDefaultDesde()` | Fecha de hace 30 días en YYYY-MM-DD |
| `getDefaultHasta()` | Fecha de hoy en YYYY-MM-DD |
| `formatFecha(isoStr)` | `'2026-05-11'` → `'11/05/2026'` para display |
| `setLoading(bool)` | Muestra spinner en `.ep-list` durante carga |
| `showError(msg)` | Muestra mensaje de error en `.ep-list` |
| `readUrlParams()` | Lee `?albaran=` y `?cliente=`; rellena filtros y llama `cargar()` |
| `resetFilters()` | Restablece `_filters` a defaults, actualiza inputs, llama `cargar()` |
| `initFiltros()` | Establece defaults de fecha en los inputs en DOMContentLoaded |
| `wireEvents()` | Conecta todos los handlers en DOMContentLoaded |

### Eventos conectados en DOMContentLoaded

```
buscar input       → debounce 300ms → cargar()
desde / hasta      → change → cargar()
status select      → change → filterAndRender()
[Hoy][7d][30d][90d]→ click → setQuickDate(N)
tarjeta card       → click → selectAlbaran(key)
ep-panel-close     → click → closePanel()
ep-panel-backdrop  → click → closePanel()
Escape             → keydown → closePanel()
readUrlParams()
initFiltros()
cargar()           (carga inicial)
```

---

## 18. Cambio Backend (Mínimo Imprescindible)

**Archivo:** `backend/routes/stock.routes.js`
**Sección:** `router.get('/expediciones', ...)` (líneas 191–209)

### Cambios exactos al SQL

```javascript
router.get('/expediciones', async (req, res) => {
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
                ACSNUM AS albaran, ACSSER AS serie,
                ACSCLICOD AS cliente, ACSCLINOM AS nombre_cliente,
                CONVERT(varchar,ACSFEC,23) AS fecha,
                ACSNUMPIC AS picking, ACSMOV AS tipo,
                ACSARTCOD AS articulo,
                (SELECT TOP 1 ARTNOM FROM ARTICULO WHERE ARTCOD=ACSARTCOD) AS nombre_articulo,
                ACSCAN AS cantidad,
                ACSUBI AS ubicacion,
                ACSLOT AS lote
                FROM ALBARANCS
                WHERE ACSMOV='E'
                AND (ACSCLICOD LIKE @b OR ACSCLINOM LIKE @b OR CAST(ACSNUM AS varchar) LIKE @b)
                AND CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
                ORDER BY ACSFEC DESC, ACSNUM DESC`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});
```

### Análisis de impacto

| Aspecto | Impacto |
|---|---|
| Breaking change | **Ninguno** — campos originales siguen presentes con mismo alias |
| api.js | **No tocar** — `SGA.expediciones.list(params)` ya pasa params genéricos como query string |
| Tests | **No afectados** — no hay tests para `/expediciones` en `nucleo.test.js` |
| Otros endpoints | **No tocados** — solo esta función |
| Rendimiento | TOP 500 con filtro de fecha de 30 días por defecto → carga razonable |
| Subquery ARTNOM | Usa `TOP 1` con igualdad exacta; rendimiento aceptable si ARTCOD está indexado |

---

## 19. Verificaciones Manuales (22)

### Backend (5)
1. `GET /expediciones` sin params devuelve array con campos: `albaran, serie, cliente, nombre_cliente, fecha, picking, tipo, articulo, nombre_articulo, cantidad, ubicacion, lote`
2. `GET /expediciones?buscar=CLI001` filtra correctamente por código de cliente
3. `GET /expediciones?desde=2026-01-01&hasta=2026-01-31` devuelve solo expediciones de enero
4. `GET /expediciones?buscar=ZZZZINEXISTENTE` devuelve `[]` sin error
5. `GET /expediciones?desde=2025-01-01&hasta=2025-01-01` devuelve `[]` o pocas filas (período cerrado)

### Frontend — Carga y filtros (7)
6. La página carga con sidebar FASE 1 visible y breadcrumb correcto
7. Por defecto se muestran expediciones de los últimos 30 días; el rango aparece en los inputs
8. El botón [30d] aparece activo al cargar; [Hoy] establece desde=hoy hasta=hoy
9. Input búsqueda con debounce 300ms recarga datos (se ve en Network tab del dev tools)
10. Inputs Desde/Hasta recargan al cambiar; el rango se refleja correctamente
11. Select de estado "Pendientes" filtra la lista sin hacer petición de red
12. Los 4 contadores muestran totales coherentes con los datos visibles

### Frontend — Tarjetas y estados (6)
13. Las tarjetas aparecen agrupadas: un albarán con 20 líneas genera UNA tarjeta (no 20 filas)
14. Badge `PENDIENTE` (amber) aparece en albaranes sin ningún picking
15. Badge `CON PICKING` (azul) aparece en albaranes con todas las líneas con picking
16. Badge `PARCIAL` (naranja) aparece cuando algunas líneas tienen picking y otras no
17. Tarjeta muestra correctamente: nº albarán, serie, nombre cliente, fecha formateada, nº líneas
18. Clic en tarjeta la marca como activa (borde azul izquierdo)

### Frontend — Panel de detalle (4)
19. Panel se abre al hacer clic en una tarjeta y muestra cabecera (albarán, cliente, fecha, badge)
20. Las líneas muestran: código artículo, nombre artículo, cantidad, lote, ubicación
21. Link "→ Movimientos" abre la página de movimientos con `?articulo=ARTCOD`
22. Link "→ Stock" abre consulta de stock con `?articulo=ARTCOD`

### Responsive (implicit en los anteriores)
- En tablet (≤1023px): panel aparece como overlay lateral con backdrop
- En móvil (≤640px): panel aparece como bottom-sheet
- Tecla Escape cierra el panel en todos los tamaños

---

## 20. Criterios de Éxito (12)

1. La página carga dentro del sistema visual FASE 1 (sidebar, header, breadcrumb, CSS variables)
2. Las expediciones se muestran agrupadas por albarán — una tarjeta por albarán
3. Los 3 estados (pendiente, parcial, con picking) son visualmente distinguibles y correctos
4. Los 4 contadores de resumen son coherentes con los datos cargados
5. El filtro de fecha por defecto muestra últimos 30 días sin intervención del usuario
6. La búsqueda funciona con debounce (sin petición por cada tecla)
7. El panel de detalle muestra las líneas de artículos del albarán seleccionado
8. Los links → Movimientos y → Stock navegan correctamente con el artículo de la línea
9. En tablet, el panel funciona como overlay lateral (no rompe el layout)
10. En móvil, el panel funciona como bottom-sheet (no rompe el layout)
11. `npm test` sigue en 80/80 — sin regresiones
12. No hay errores en consola de navegador al cargar la página

---

## 21. Riesgos Detectados

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| ALBARANCS sin datos con ACSMOV='E' | Media | Alto | Placeholder "No hay expediciones en el período seleccionado" |
| `nombre_articulo` null (artículo no en tabla ARTICULO) | Media | Bajo | Fallback: mostrar solo `articulo` (código) |
| Albaranes con 0 líneas de artículo (ACSARTCOD nulo) | Baja | Bajo | Filtrar `if (r.articulo)` al agregar a lineas; tarjeta muestra "0 líneas" |
| Subquery ARTNOM lenta con 500 rows | Media | Medio | `TOP 1` con igualdad exacta; si lento, añadir índice o quitar la subquery en fase posterior |
| `ACSMOV='E'` también podría significar 'Entrada' en otras tablas | Baja | Ninguno | Confirmado: en ALBARANCS el valor 'E' es usado para expediciones; /entrada y /salida no leen ALBARANCS |
| Paths relativos de los links → Movimientos/Stock incorrectos | Media | Medio | Verificar con navegación real en V22 antes de marcar completado |

---

## 22. Exclusiones (FASE 5A)

Las siguientes funcionalidades quedan fuera de esta fase:

- **Tabs 2–6** (pedidos proveedor, inventarios, órdenes fab, reposición, cambios destino) — requieren endpoints separados no existentes
- **Enviar a PDA** — requiere integración hardware/protocolo PDA
- **Impresión de etiquetas** (resumen, palet, Excel) — requiere generador de etiquetas o integración impresora
- **Imprimir picking** — requiere generador PDF
- **Gestión de rutas** y **Manifiesto de carga** — módulo separado (hojas-de-ruta)
- **"No agencia"** — campo ACSAGENCIA no existe en el endpoint actual
- **Selección múltiple + acciones masivas**
- **Exportación Excel/PDF**
- **WebSocket / actualización automática en tiempo real**
- **Integración PDA / terminal móvil**
- **Campo de estado real** — requeriría modificación del esquema ALBARANCS o tabla auxiliar

---

## 23. Recomendaciones Arquitectónicas

1. **Namespace `ep-` limpio y estricto**: No reutilizar ninguna clase del legacy CSS. Eliminar la dependencia de `navegacion.css` completamente.

2. **No usar innerHTML con datos del servidor**: `nombre_cliente` y `nombre_articulo` vienen de SQL y pueden contener caracteres especiales HTML. Usar siempre `.textContent = valor`.

3. **api.js no necesita cambio**: `SGA.expediciones.list(params)` ya construye query string con `URLSearchParams`. Solo hay que pasar `{buscar, desde, hasta}`.

4. **Panel sticky en desktop, no fixed**: Seguir el patrón de `traspasos.js` — `position: sticky` en desktop evita conflictos con el scroll y el sidebar FASE 1.

5. **Mantener tabs en HTML pero como "Próximamente"**: No eliminar los tabs 2–6 del HTML. Dejarlos visibles pero con un placeholder "Próximamente" y sin JS. Eliminarlos crearía confusión si el usuario los espera del legacy.

6. **Filtro de estado en memoria**: El filtro de estado no debe recargar el servidor. El dataset ya está cargado; filtrar en `_albaranes` es instantáneo. Solo texto + fechas requieren llamada al servidor.

7. **Consistencia de respuesta ante errores**: Si `cargar()` falla, mostrar placeholder de error en `.ep-list`. No romper el layout ni dejar pantalla en blanco.

---

## 24. Futuras Mejoras (Post-FASE 5A)

- **FASE 5B** — Picking visual: marcar líneas como recogidas desde la interfaz web
- **FASE 5C** — Estado real de expedición: añadir tabla auxiliar o campo de estado en ALBARANCS
- **FASE 5D** — Hojas de ruta integradas: agrupar albaranes por ruta de reparto
- **FASE 5E** — Expedición masiva: selección múltiple + confirmar expedición en bloque
- **FASE 5F** — Tabs 2–6: pedidos a proveedor, órdenes de fabricación, etc.
- Exportación Excel de líneas de un albarán
- Manifiesto de carga por agencia (requiere campo ACSAGENCIA)
- Timeline de expedición por albarán
- Notificaciones push cuando un albarán cambia de estado

---

## Orden de Implementación (5 tareas)

| Tarea | Descripción | Archivos afectados |
|---|---|---|
| **T1** | Backend: añadir campos y filtros de fecha a `/expediciones` | `backend/routes/stock.routes.js` |
| **T2** | CSS: reescribir desde cero con namespace `ep-` y variables FASE 1 | `frontend/css/opciones/logistica-y-pedidos/expediciones/index.css` |
| **T3** | HTML: reescribir con estructura FASE 1 (sidebar.js, layout.js, base.css) | `frontend/pages/opciones/logistica-y-pedidos/expediciones/index.html` |
| **T4** | JS: reescribir como IIFE con estado, agrupación y panel de detalle | `frontend/js/opciones/logistica-y-pedidos/expediciones.js` |
| **T5** | Verificación: 22 checks manuales + `npm test` 80/80 | — |

---

*Plan técnico FASE 5A — Expediciones Modernas*
*Fecha: 2026-05-11 · Rama: paco-clean*
