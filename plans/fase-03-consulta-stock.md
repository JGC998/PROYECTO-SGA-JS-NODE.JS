# FASE 3 — Consulta de Stock Moderna

## Diagnóstico UX — Estado Actual

### Problemas críticos detectados

**Filtros:**
- 4 filas de filtros con ~20 inputs visibles simultáneamente
- Solo 3 conectados al JS (`f-ubicacion`, `f-articulo`, `f-lote`); el resto es decorativo
- Panel "Etiquetas" (impresión) mezclado con filtros de consulta — objetivos distintos
- Parámetro `solo_existencias` existe en backend pero NO expuesto en frontend
- Botón "Cambiar tipo ubicación" sin conectar
- Inputs P, L, X, Y, Subfamilia, checkboxes de stock Y1 — todos sin función

**Tabla:**
- 14 columnas, columna "Ubicación" DUPLICADA (posición 4 y 13)
- Columnas vacías en la mayoría de registros: `*`, Empresa, Etiqueta
- Sin badges visuales para estados (exclusiva, cuarentena, picking)
- Sin indicador de stock negativo o bajo mínimo
- Sin enlace a movimientos del artículo
- Sin ordenación por columna
- Sin paginación real (TOP 500 silencioso, sin aviso al usuario)
- `renderTabla` usa template literals con innerHTML — mantenimiento difícil

**CSS:**
- Colores hardcoded (#1e3a8a, #3b82f6) — no usa variables `--sga-*` de FASE 1
- Clases propias (`.btn-tool`, `.container`) fuera del namespace `sga-`
- Sin responsive real (solo `overflow-x: auto`)
- Sin panel lateral de detalle

**Datos del backend:**
- `/consulta-de-stock` devuelve 10 campos:
  `articulo, nombre, ubicacion, nom_ubicacion, almacen, lote, stock, palets, multiple, exclusiva`
- `exclusiva` mapea `UBICACION.UBILIB` (flag picking de la ubicación) — naming confuso
- Cuarentena, stock_minimo, stock_reservado: NO disponibles sin tocar backend
- Límite TOP 500 sin comunicar al usuario
- Parámetro `solo_existencias` disponible en backend, no en frontend

---

## Arquitectura Nueva

### Layout de pantalla

```
┌─────────────────────────────────────────────────────────────────────┐
│ HEADER: breadcrumb + [Actualizar F5] [Exportar CSV]                 │
├─────────────────────────────────────────────────────────────────────┤
│ FILTROS PRIMARIOS (1 fila siempre visible)                          │
│ Artículo [_________] Ubicación [_________] Lote [_____]            │
│ [Solo con stock ▼]  [▸ Más filtros]  [Buscar]                      │
│                                                                     │
│ FILTROS SECUNDARIOS (colapsable, oculto por defecto)                │
│ Almacén [_________]  Exclusiva [Todas ▼]                           │
├─────────────────────────────────────────────────────────────────────┤
│ BARRA DE ESTADO: "247 registros · 14:32 · ⚠ Límite 500 alcanzado" │
├─────────────────────────────────────────┬───────────────────────────┤
│ TABLA                                   │ PANEL LATERAL (on click)  │
│ Ubicación | Artículo | Nombre | Lote    │ Artículo: ARTXYZ          │
│ Stock | Palets | Múlt. | ↗              │ Nombre: Tornillo M6       │
│                                         │ Ubicación: 010110001001   │
│ [fila seleccionada en azul tenue]       │ Stock: 150                │
│                                         │ Lote: LOT001              │
│                                         │ Palets: 2 / Múlt.: 10    │
│                                         │ [EXCL]                    │
│                                         │ [Ver movimientos ↗]       │
│                                         │ [✕ Cerrar]                │
├─────────────────────────────────────────┴───────────────────────────┤
│ FOOTER: Total stock: 12.450 | [Seleccionar todo] [Anular selección] │
└─────────────────────────────────────────────────────────────────────┘
```

### Namespace CSS: `cs-`

Todas las clases nuevas con prefijo `cs-` para evitar conflictos con FASE 1 (`sga-`) y FASE 2 (`db-`).

---

## Archivos — Exactos

### Modificar (reescribir completamente):
1. `frontend/pages/opciones/almacen-y-stock/consulta-de-stock/index.html`
2. `frontend/css/opciones/almacen-y-stock/consulta-de-stock/index.css`
3. `frontend/js/opciones/almacen-y-stock/consulta-de-stock.js`

### No tocar:
- Todo el backend
- `frontend/js/api.js` — `SGA.consultaStock.list` ya funciona correctamente
- Archivos FASE 1 (`css/base.css`, `css/layout.css`, etc.)
- Archivos FASE 2 (`css/pages/dashboard.css`, etc.)

---

## Tarea 1 — HTML

### Estructura completa nueva

```html
<body class="sga-layout">
  <!-- sidebar.js inyecta aside aquí -->
  <div class="sga-main">
    <header class="sga-header">
      <!-- breadcrumb: Inicio › Opciones › Consulta de Stock -->
      <!-- acciones: [Actualizar F5] [Exportar CSV] -->
    </header>

    <div class="sga-content">
      <div class="cs-inner">

        <!-- CABECERA DE PÁGINA -->
        <div class="cs-page-header">
          <h1 class="sga-page-title">Consulta de Stock</h1>
          <p class="sga-page-description">Almacén · SGA LIN</p>
        </div>

        <!-- PANEL DE FILTROS -->
        <div class="cs-filters">
          <!-- Fila primaria -->
          <div class="cs-filters-primary">
            <div class="cs-filter-field">
              <label for="f-articulo">Artículo</label>
              <input type="text" id="f-articulo" class="cs-input" placeholder="Código...">
            </div>
            <div class="cs-filter-field">
              <label for="f-ubicacion">Ubicación</label>
              <input type="text" id="f-ubicacion" class="cs-input" placeholder="Código...">
            </div>
            <div class="cs-filter-field">
              <label for="f-lote">Lote</label>
              <input type="text" id="f-lote" class="cs-input cs-input--sm" placeholder="Lote...">
            </div>
            <div class="cs-filter-field">
              <label for="f-existencias">Mostrar</label>
              <select id="f-existencias" class="cs-select">
                <option value="1">Solo con existencias</option>
                <option value="0">Todas las ubicaciones</option>
                <option value="-1">Sin existencias</option>
              </select>
            </div>
            <button class="sga-btn sga-btn-primary" id="btn-buscar">Buscar</button>
            <button class="cs-toggle-secondary" id="btn-toggle-filtros" aria-expanded="false">
              ▸ Más filtros
            </button>
          </div>

          <!-- Fila secundaria (colapsable) -->
          <div class="cs-filters-secondary" id="filtros-secundarios" hidden>
            <div class="cs-filter-field">
              <label for="f-almacen">Almacén</label>
              <input type="text" id="f-almacen" class="cs-input cs-input--sm"
                     placeholder="Filtrar por almacén..." title="Filtro local sobre resultados cargados">
            </div>
            <div class="cs-filter-field">
              <label for="f-exclusiva">Exclusiva</label>
              <select id="f-exclusiva" class="cs-select cs-select--sm">
                <option value="">Todas</option>
                <option value="1">Solo exclusivas</option>
                <option value="0">Solo no exclusivas</option>
              </select>
            </div>
          </div>
        </div>

        <!-- BARRA DE ESTADO -->
        <div class="cs-statusbar">
          <span id="cs-count" class="cs-count">—</span>
          <span id="cs-timestamp" class="cs-timestamp"></span>
          <span id="cs-limit-warn" class="cs-limit-warn" hidden>
            ⚠ Límite de 500 registros alcanzado — refine los filtros
          </span>
        </div>

        <!-- ZONA TABLA + PANEL LATERAL -->
        <div class="cs-workspace" id="cs-workspace">

          <!-- TABLA -->
          <div class="cs-table-wrapper" id="cs-table-wrapper">
            <div class="cs-table-scroll">
              <table class="cs-table" id="tabla-stock">
                <thead>
                  <tr>
                    <th class="cs-th cs-th--check">
                      <input type="checkbox" id="chk-all" title="Seleccionar todo">
                    </th>
                    <th class="cs-th cs-th--ubicacion" data-sort="ubicacion">Ubicación</th>
                    <th class="cs-th cs-th--articulo" data-sort="articulo">Artículo</th>
                    <th class="cs-th cs-th--nombre">Nombre</th>
                    <th class="cs-th cs-th--lote" data-sort="lote">Lote</th>
                    <th class="cs-th cs-th--stock cs-th--num" data-sort="stock">Stock</th>
                    <th class="cs-th cs-th--palets cs-th--num" data-sort="palets">Palets</th>
                    <th class="cs-th cs-th--multiple cs-th--num" data-sort="multiple">Múlt.</th>
                    <th class="cs-th cs-th--actions"></th>
                  </tr>
                </thead>
                <tbody id="tbody-stock">
                  <tr class="cs-placeholder">
                    <td colspan="9">Introduzca los filtros y pulse Buscar para cargar el stock.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- PANEL LATERAL DE DETALLE -->
          <aside class="cs-detail" id="cs-detail" hidden>
            <div class="cs-detail-header">
              <span class="cs-detail-title">Detalle</span>
              <button class="cs-detail-close" id="cs-detail-close" aria-label="Cerrar">✕</button>
            </div>
            <div class="cs-detail-body" id="cs-detail-body">
              <!-- Inyectado por JS -->
            </div>
            <div class="cs-detail-actions">
              <a class="sga-btn sga-btn-secondary sga-btn-sm" id="cs-btn-movimientos" href="#">
                Ver movimientos ↗
              </a>
            </div>
          </aside>

        </div><!-- /.cs-workspace -->

        <!-- FOOTER DE TOTALES -->
        <footer class="cs-footer">
          <div class="cs-footer-actions">
            <button class="sga-btn sga-btn-secondary sga-btn-sm" id="btn-sel-todo">
              Seleccionar todo
            </button>
            <button class="sga-btn sga-btn-secondary sga-btn-sm" id="btn-anular-sel">
              Anular selección
            </button>
          </div>
          <div class="cs-footer-totals">
            <span class="cs-total-label">Total stock:</span>
            <span class="cs-total-value" id="total-stock">—</span>
          </div>
        </footer>

      </div><!-- /.cs-inner -->
    </div><!-- /.sga-content -->
  </div><!-- /.sga-main -->

  <script src="../../../../js/api.js"></script>
  <script src="../../../../js/ui/sidebar.js"></script>
  <script src="../../../../js/ui/layout.js"></script>
  <script src="../../../../js/opciones/almacen-y-stock/consulta-de-stock.js"></script>
</body>
```

### Reglas HTML:
- Usar clases `sga-btn sga-btn-primary/secondary sga-btn-sm` de FASE 1
- Usar `sga-page-title` y `sga-page-description` de FASE 1
- Mantener breadcrumb con `sga-breadcrumb` y `sga-breadcrumb-sep`
- Botón hamburger: `sga-hamburger`
- `hidden` attribute en panel lateral — controlado por JS

---

## Tarea 2 — CSS

### Variables: usar exclusivamente `--sga-*` de FASE 1

```css
/* No hardcodear colores. Siempre: */
color: var(--sga-primary);
background: var(--sga-surface);
border-color: var(--sga-border);
```

### Clases principales a definir:

```css
/* Layout */
.cs-inner            /* contenedor máx. 1400px, flex column, gap 20px */
.cs-page-header      /* fila con título + descripción */

/* Filtros */
.cs-filters          /* contenedor blanco, rounded, shadow */
.cs-filters-primary  /* flex row, flex-wrap, gap 12px, align center */
.cs-filters-secondary/* flex row, flex-wrap, gap 12px — colapsable */
.cs-filter-field     /* flex column, gap 4px */
.cs-input            /* input estilo FASE 1 con --sga-border */
.cs-input--sm        /* ancho 120px */
.cs-select           /* select estilo FASE 1 */
.cs-select--sm       /* ancho 140px */
.cs-toggle-secondary /* botón texto pequeño, color muted */

/* Barra de estado */
.cs-statusbar        /* flex row, gap 16px, font-size .78rem, color muted */
.cs-count            /* font-weight 600, color text */
.cs-timestamp        /* color muted */
.cs-limit-warn       /* color #d97706, fondo #fffbeb, padding 2px 8px, rounded */

/* Workspace (tabla + panel) */
.cs-workspace        /* display grid, grid-template-columns: 1fr; default */
.cs-workspace.cs-detail-open { grid-template-columns: 1fr 320px; gap: 16px; }

/* Tabla */
.cs-table-wrapper    /* bg surface, rounded, shadow, overflow hidden */
.cs-table-scroll     /* overflow-x auto */
.cs-table            /* width 100%, border-collapse collapse, font-size .83rem */
.cs-th               /* bg #f0f5ff, padding 9px 12px, color primary, uppercase .68rem */
.cs-th--num          /* text-align right */
.cs-th--check        /* width 36px, text-align center */
.cs-th--ubicacion    /* min-width 130px */
.cs-th--nombre       /* min-width 200px, max-width 280px */
.cs-th--actions      /* width 40px, text-align center */
.cs-td               /* padding 9px 12px, border-bottom sga-border */
.cs-td--num          /* text-align right, font-variant-numeric tabular-nums */
.cs-td--nombre       /* overflow hidden, text-overflow ellipsis, white-space nowrap, max-width 280px */
.cs-row:hover td     /* background #f8fafc */
.cs-row--selected td /* background #eff6ff, */
.cs-placeholder td   /* text-align center, color muted, font-style italic, padding 40px */
.cs-loading td       /* igual que placeholder */
.cs-error td         /* color #dc2626, bg #fef2f2 */

/* Badges */
.cs-badge            /* display inline-flex, align center, font-size .65rem, font-weight 700 */
.cs-badge--excl      /* bg #fef3c7, color #92400e, border #fde68a */
.cs-badge--zero      /* bg #f3f4f6, color #6b7280 */

/* Stock values */
.cs-stock--neg       /* color #dc2626, font-weight 700 */
.cs-stock--zero      /* color var(--sga-text-muted) */

/* Botón de acción en tabla */
.cs-btn-action       /* 28x28, border rounded, bg transparent, cursor pointer */
.cs-btn-action:hover /* bg #eff6ff, border --sga-accent */

/* Panel lateral */
.cs-detail           /* bg surface, rounded, shadow, overflow hidden, display flex col */
.cs-detail-header    /* flex row, justify-between, padding 12px 16px, border-bottom */
.cs-detail-title     /* font-size .72rem, font-weight 700, uppercase, color primary */
.cs-detail-close     /* button texto, cursor pointer, color muted */
.cs-detail-body      /* padding 16px, flex col, gap 12px, flex 1 */
.cs-detail-row       /* flex col, gap 2px */
.cs-detail-lbl       /* font-size .65rem, uppercase, font-weight 700, color muted */
.cs-detail-val       /* font-size .88rem, color text */
.cs-detail-stock     /* font-size 1.8rem, font-weight 800, color primary */
.cs-detail-actions   /* padding 12px 16px, border-top, display flex, gap 8px */

/* Footer */
.cs-footer           /* bg surface, rounded, shadow, padding 12px 18px, flex row, justify-between */
.cs-footer-actions   /* flex row, gap 8px */
.cs-footer-totals    /* flex row, align center, gap 10px */
.cs-total-label      /* font-size .82rem, font-weight 700, color primary */
.cs-total-value      /* font-size 1.1rem, font-weight 800, color text, font-variant-numeric tabular-nums */
```

### Responsive:

```css
/* Desktop: tabla + panel lateral en grid */
@media (min-width: 1024px) {
  .cs-workspace.cs-detail-open {
    grid-template-columns: 1fr 300px;
  }
}

/* Tablet: panel como overlay */
@media (max-width: 1023px) {
  .cs-workspace.cs-detail-open {
    grid-template-columns: 1fr; /* no cambia grid */
  }
  .cs-detail {
    position: fixed;
    top: 0; right: 0; bottom: 0;
    width: 300px;
    z-index: 200;
    box-shadow: -4px 0 20px rgba(0,0,0,0.15);
    transform: translateX(100%);
    transition: transform .2s;
  }
  .cs-detail-open .cs-detail {
    transform: translateX(0);
  }
  /* backdrop */
  .cs-detail-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.35);
    z-index: 199;
    display: none;
  }
  .cs-detail-open .cs-detail-backdrop {
    display: block;
  }
}

/* Móvil: cards en lugar de tabla */
@media (max-width: 640px) {
  .cs-table-scroll     { display: none; }
  .cs-cards            { display: flex; flex-direction: column; gap: 10px; }
  .cs-card             { bg surface, rounded, shadow, padding 14px 16px, flex col, gap 8px }
  .cs-card-header      { flex row, justify-between }
  .cs-card-ubi         { font-size .72rem, font-weight 700, color primary }
  .cs-card-articulo    { font-size .88rem, font-weight 600 }
  .cs-card-nombre      { font-size .78rem, color muted }
  .cs-card-stock       { font-size 1.4rem, font-weight 800 }
}
```

---

## Tarea 3 — JavaScript

### Estructura del módulo (IIFE, "use strict")

```
(function() {
  "use strict";

  // ── ESTADO INTERNO ────────────────────────────────────────────────
  var _rows = [];         // array completo de filas cargadas
  var _filtered = [];     // array filtrado (filtros client-side)
  var _selected = null;   // fila actualmente seleccionada

  // ── HELPERS ───────────────────────────────────────────────────────
  fmt(n)           // Number → toLocaleString('es-ES')
  fmtTime(d)       // Date → "HH:MM"
  escHtml(s)       // escape HTML básico para textos externos

  // ── FILTROS ───────────────────────────────────────────────────────
  getServerParams()      // lee f-articulo, f-ubicacion, f-lote, f-existencias
  getClientFilters()     // lee f-almacen, f-exclusiva
  applyClientFilters()   // filtra _rows → _filtered, llama renderTabla + renderTotales

  // ── CARGA ─────────────────────────────────────────────────────────
  cargarDatos()          // SGA.consultaStock.list(params) → _rows, llama render

  // ── RENDER ────────────────────────────────────────────────────────
  renderTabla(rows)      // limpia tbody, rellena con createElement
  buildRow(r, idx)       // crea <tr class="cs-row"> con 9 celdas
  buildBadgeExcl()       // crea <span class="cs-badge cs-badge--excl">EXCL</span>
  buildActionBtn(r)      // crea botón ↗ acciones
  renderCards(rows)      // render móvil con cards (alternativa a tabla)
  renderStatusbar(n, ts) // actualiza cs-count, cs-timestamp, cs-limit-warn
  renderTotales(rows)    // suma stock → total-stock

  // ── PANEL LATERAL ─────────────────────────────────────────────────
  openDetail(r)          // rellena cs-detail-body, muestra panel, añade cs-detail-open
  closeDetail()          // oculta panel, quita cs-detail-open
  buildDetailBody(r)     // crea nodos DOM del detalle
  buildDetailRow(lbl, val) // helper: crea .cs-detail-row

  // ── SELECCIÓN ─────────────────────────────────────────────────────
  seleccionarTodo()
  anularSeleccion()
  calcularTotalSeleccionados()

  // ── EXPORTAR CSV ──────────────────────────────────────────────────
  exportarCSV()          // exporta _filtered a CSV (mantener lógica existente)

  // ── INIT ──────────────────────────────────────────────────────────
  DOMContentLoaded → wire eventos, [no carga automática — espera Buscar]
})();
```

### Reglas JS:
- `createElement` / `createTextNode` para filas de tabla y panel lateral
- Sin innerHTML excepto para estados vacíos estáticos (loading, error, empty)
- Filtros client-side (almacén, exclusiva) actúan sobre `_rows` sin nueva petición
- Al recibir 500 resultados exactos → mostrar aviso `cs-limit-warn`
- Botón ↗ en tabla → `href` generado hacia `../movimientos-por-articulo/index.html?articulo=XXX`
- Panel lateral: cerrar con botón ✕, clic en backdrop, o tecla Escape
- F5 ejecuta `cargarDatos()`

### Detalle del panel lateral (buildDetailBody):
```
Artículo:     [código]  [nombre]
Ubicación:    [código]  [nom_ubicacion]
Almacén:      [almacen]
Lote:         [lote] o "Sin lote"
Stock:        [número grande con color]
Palets:       [palets]
Múltiple:     [multiple]
Exclusiva:    [badge EXCL] o "No"
```

### Enlace a movimientos:
```js
var url = '../movimientos-por-articulo/index.html?articulo='
        + encodeURIComponent(r.articulo);
document.getElementById('cs-btn-movimientos').href = url;
```

---

## Tarea 4 — Verificaciones Manuales

1. [ ] Filtro por artículo: introducir código parcial → tabla muestra resultados correctos
2. [ ] Filtro por ubicación: introducir ubicación parcial → resultados correctos
3. [ ] Filtro por lote: funciona
4. [ ] "Solo con existencias" vs "Todas" → diferente número de resultados
5. [ ] Badge EXCL aparece en filas con `exclusiva = 1`
6. [ ] Click en fila → panel lateral se abre con datos correctos
7. [ ] Botón "Ver movimientos ↗" lleva a la URL correcta con el artículo
8. [ ] Botón ✕ del panel → cierra
9. [ ] Tecla Escape → cierra panel
10. [ ] "Más filtros" toggle → muestra/oculta fila secundaria
11. [ ] Filtro almacén (client-side) → filtra resultados ya cargados sin petición nueva
12. [ ] Total stock se actualiza con cada carga y cada filtro client-side
13. [ ] Exportar CSV genera archivo con datos correctos (sin columnas checkbox)
14. [ ] Al recibir exactamente 500 resultados → aparece aviso de límite
15. [ ] Tablet (< 1024px): panel lateral aparece como overlay
16. [ ] Móvil (< 640px): cards en lugar de tabla
17. [ ] F5 ejecuta búsqueda
18. [ ] Botón Actualizar en header ejecuta búsqueda
19. [ ] Error de red → mensaje de error visible
20. [ ] Sin resultados → mensaje "No se encontraron registros"

---

## Criterios de Éxito

1. Filtros primarios en 1 fila compacta, secundarios colapsables
2. Tabla con exactamente 8-9 columnas útiles (sin duplicados, sin vacíos)
3. Badge EXCL visible en ubicaciones exclusivas
4. Panel lateral funciona con datos correctos
5. Enlace a movimientos funcional
6. Stock negativo marcado en rojo (preparado para cuando backend lo devuelva)
7. Barra de estado con contador y timestamp
8. Aviso cuando se alcanza límite de 500
9. Exportar CSV conserva funcionalidad
10. Total stock actualizado
11. Responsive: tablet con panel overlay, móvil con cards
12. Todas las clases usan variables `--sga-*` (no colores hardcoded)
13. JS en IIFE, sin globals, sin innerHTML en filas de tabla
14. F5 funciona
15. Sin romper ninguna ruta ni archivo de FASE 1 o FASE 2

---

## Riesgos Detectados

1. **Naming confuso de `exclusiva`**: El campo `exclusiva` del backend es `UBICACION.UBILIB`, que en `ubicaciones.routes.js` se llama `picking`. Tratar como "ubicación exclusiva" (no exclusividad de artículo). En FASE 3B se clarificará con el backend.

2. **TOP 500 silencioso**: Usuarios pueden creer que ven todo el stock cuando hay más. El aviso de límite es crítico.

3. **Campos ausentes en backend**: Cuarentena, stock_mínimo, picking de stock NO están en `/consulta-de-stock`. La UI puede reservar espacio visual para ellos (preparada para FASE 3B) pero NO mostrar datos falsos.

4. **Panel lateral en tablet**: El overlay necesita backdrop y gestión del scroll body. Implementar con `position: fixed` y clase en `body`.

5. **Tabs vacíos**: "Stock en modo gráfico" e "Informe de stock" seguirán como stubs. No eliminarlos — el usuario puede necesitarlos en el futuro.

---

## Fases Futuras Relacionadas

- **FASE 3B** — Backend: añadir campos `cuarentena`, `picking`, `stock_minimo` al endpoint `/consulta-de-stock` y renderizarlos con badges
- **FASE 3C** — Tab "Stock en modo gráfico": integración con mapa visual de almacén
- **FASE 3D** — Tab "Informe de stock": agrupaciones por artículo/almacén, totales avanzados
- **FASE 3E** — Exportación avanzada: Excel (XLSX via SheetJS cuando se autorice librería externa), PDF
- **FASE 3F** — Acción "Asignar ubicación" desde selección múltiple

---

## Orden de Implementación

```
1. HTML    → estructura completa, sin ningún CSS nuevo
2. CSS     → layout, filtros, tabla, panel lateral, responsive
3. JS      → cargarDatos, renderTabla, renderStatusbar, renderTotales, exportarCSV
4. JS      → panel lateral (openDetail, closeDetail, buildDetailBody)
5. JS      → filtros client-side (applyClientFilters) y toggle secundarios
6. JS      → selección múltiple y checkboxes
7. Verificaciones manuales completas
```

---

## Resumen Visual del Cambio

| Aspecto | Antes | Después |
|---------|-------|---------|
| Filtros | 4 filas, ~20 inputs, 3 funcionales | 1 fila primaria + toggle secundario |
| Tabla | 14 columnas, 2 duplicadas, sin badges | 8-9 columnas limpias, badges EXCL |
| Detalle | Ninguno | Panel lateral inline / overlay |
| Estado | Sin contador ni timestamp | Barra estado completa |
| Límite 500 | Silencioso | Aviso visible |
| Colores | Hardcoded (#1e3a8a) | Variables --sga-* FASE 1 |
| Responsive | Solo overflow-x | 3 breakpoints: desktop/tablet/móvil |
| Movimientos | Sin enlace | Botón ↗ en panel lateral |
