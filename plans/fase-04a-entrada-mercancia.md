# FASE 4A — ENTRADA DE MERCANCÍA MODERNA
## Plan técnico completo

---

## 0. ESTADO DEL REPOSITORIO AL INICIAR

- Rama activa: `paco-clean`
- Tests: 80/80 pasando (backend)
- FASE 1 (base visual), FASE 2 (dashboard), FASE 3 (consulta de stock) completadas.
- Fichero legacy existente: `frontend/pages/ferreteria/entradas.html`

---

## 1. DIAGNÓSTICO UX COMPLETO

### 1.1 Problemas estructurales graves

| # | Problema | Impacto | Evidencia |
|---|----------|---------|-----------|
| P1 | Sin integración FASE 1 — no hay `sga-layout`, sidebar, header ni breadcrumb | Alta | `entradas.html` solo carga `navegacion.css` y `entradas.css` |
| P2 | **Ubicación destino ausente** — el campo más crítico de toda entrada logística | Crítica | Ni en HTML ni en JS. Backend lo exige como obligatorio |
| P3 | **Lote ausente** — también obligatorio en backend | Crítica | Ni en HTML ni en JS |
| P4 | **Botón "Añadir línea" muerto** — event listener busca `.btn-add` pero ese elemento no existe en el HTML | Crítica | `entradas.js:121` vs `entradas.html` — no hay `.btn-add` |
| P5 | **`limpiarDetalle()` rota** — template literal `$('$id')` en vez de `$(id)` | Alta | `entradas.js:82` — 4 de 6 campos nunca se limpian |
| P6 | **Mismatch API** — JS envía `{fecha, proveedor, albaran, lineas[]}` pero backend espera `{cod, ubi, lot, cant}` por línea | Crítica | `entradas.js:93-98` vs `movimientos.routes.js:13` |
| P7 | **`alert()` como único feedback** — bloquea UI, no da contexto | Alta | `entradas.js:92,101,106` |
| P8 | **XSS con `innerHTML`** — `renderLineas()` construye HTML con datos del usuario sin escapar | Alta | `entradas.js:64-72` |
| P9 | **Globals sin IIFE** — `lineas`, `lineaIdx`, `$` contaminan el namespace global | Media | `entradas.js:1-4` |
| P10 | **CSS global invasivo** — selectores `label`, `input`, `table`, `th`, `td` sin namespace afectan a todos los descendientes | Media | `entradas.css:134,141,165,172,181` |
| P11 | **Colores hardcoded** — `#1e3a8a`, `#3b82f6`, `#374151`… sin variables `--sga-*` | Media | `entradas.css` — 15+ valores hardcoded |
| P12 | **Sin responsive** — solo `max-width: 1100px`, se rompe en tablet y móvil | Alta | `entradas.css:48` |
| P13 | **Ruta legacy** — en `pages/ferreteria/` no sigue el patrón `pages/opciones/...` | Media | Comparar con FASE 3 |
| P14 | **Enlace sidebar desactualizado** — apunta a `pages/ferreteria/entradas.html` | Media | `sidebar.js:24` |
| P15 | **Enlace dashboard desactualizado** — acceso rápido apunta a ruta legacy | Baja | `index.html:144` |
| P16 | **Precio/Dto/Total son ficticios** — el backend no los almacena ni los usa | Media | `movimientos.routes.js:13` — solo usa `cod, ubi, lot, cant` |
| P17 | **Trabajador Destino desconectado** — campo en HTML pero sin event listener ni integración en guardar | Baja | `entradas.html:77-79`, `entradas.js` — no hay referencia |

### 1.2 Flujo actual (cómo funciona HOY)

```
Abrir entradas.html
  ↓
Formulario sin sidebar/header (pantalla huérfana)
  ↓
Rellena fecha / proveedor / albarán (cabecera)
  ↓
Rellena artículo → busca nombre (funciona)
Rellena cantidad / precio / dto → calcula total (funciona)
  ↓
Pulsa "Agregar" → NADA (botón .btn-add no existe)
  ↓
Pulsa "Guardar" → envía datos sin ubi/lot al backend
  → Backend devuelve 400 "Los campos cod, ubi y lot son obligatorios"
  → alert("Error al registrar la entrada.")
```

**Conclusión: la pantalla actual está rota. No puede registrar ninguna entrada.**

---

## 2. ANÁLISIS DEL FLUJO ACTUAL

### 2.1 Endpoint backend utilizado

```
POST /entrada
Body: { cod, ubi, lot, cant }
Respuesta: { success: true, message: 'Entrada registrada' }
```

- Recibe **una línea** por llamada (no batch)
- Valida: `cod`, `ubi`, `lot` obligatorios; `cant > 0` y finito
- Auto-crea artículo si no existe: `INSERT INTO ARTICULO (ARTCOD, ARTNOM)` con nombre `"ALTA AUTOMÁTICA - {cod}"`
- Upsert stock: `UPDATE STOCK … SET STOCAN = STOCAN + @cant` → si 0 filas → `INSERT INTO STOCK`
- **NO guarda**: proveedor, albarán, fecha, precio, dto
- Sin transacción global (no hay rollback de múltiples líneas)

### 2.2 API disponible en `api.js`

```js
SGA.entradas.save(data)       → POST /entrada  { cod, ubi, lot, cant }
SGA.articulos.get(cod)        → GET  /articulos/:cod  → { nombre, ... }
SGA.proveedores.get(cod)      → GET  /proveedores/:cod → { nombre, ... }
SGA.ubicaciones.list(params)  → GET  /ubicaciones?...
```

### 2.3 Campos que el backend ACEPTA vs los que el legacy JS enviaba

| Campo | Backend acepta | Legacy JS enviaba |
|-------|---------------|------------------|
| `cod` | ✓ obligatorio | ✓ (como `articulo`) |
| `ubi` | ✓ obligatorio | ✗ ausente |
| `lot` | ✓ obligatorio | ✗ ausente |
| `cant` | ✓ obligatorio | ✓ (como `cantidad`) |
| `fecha` | ✗ ignorado | ✓ enviado pero ignorado |
| `proveedor` | ✗ ignorado | ✓ enviado pero ignorado |
| `albaran` | ✗ ignorado | ✓ enviado pero ignorado |
| `precio` | ✗ ignorado | ✓ enviado pero ignorado |
| `dto` | ✗ ignorado | ✓ enviado pero ignorado |

---

## 3. NUEVO FLUJO OPERATIVO RECOMENDADO

### 3.1 Principio de diseño

> **"Escanear → Confirmar → Siguiente"**
> El operario de almacén debe poder registrar una línea de entrada en menos de 10 segundos.

### 3.2 Flujo paso a paso

```
┌─────────────────────────────────────────────────────────────┐
│  ZONA CABECERA (colapsable en tablet/móvil)                 │
│  Fecha · Proveedor · Nº Albarán                             │
│  (metadata de contexto — no afecta al backend todavía)      │
└─────────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────────┐
│  ZONA ENTRADA RÁPIDA (foco operativo)                       │
│                                                             │
│  1. ARTÍCULO: [input código] → Enter → muestra nombre       │
│  2. LOTE:     [input lote]   o  [btn SIN LOTE]             │
│  3. UBICACIÓN: [input ubi]  → Enter → muestra nombre ubi   │
│  4. CANTIDAD:  [input num]  con botones − / +               │
│                                                             │
│  [+ AÑADIR LÍNEA]  ← acción principal                       │
└─────────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────────┐
│  CARRITO DE ENTRADA (panel lateral desktop / sección móvil) │
│  Lista de líneas añadidas                                   │
│  Cada línea: [artículo] [nombre] [lote] [ubi] [cant] [🗑]   │
│  ─────────────────────────────────────────────────────────  │
│  Total: N líneas · M unidades                               │
│  [CONFIRMAR ENTRADA ▶]                                      │
└─────────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────────┐
│  ZONA RESULTADOS (inline, sin modal)                        │
│  Línea 1: ✓ Registrada                                      │
│  Línea 2: ✓ Registrada                                      │
│  Línea 3: ✗ Error — mensaje descriptivo                     │
│  ─────────────────────────────────────────────────────────  │
│  "3/3 líneas registradas" · [Nueva entrada] [Ver en stock]  │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Estados de los campos en entrada rápida

- **Artículo vacío**: placeholder `"Código artículo..."`, borde normal
- **Artículo buscando**: spinner inline, input deshabilitado
- **Artículo encontrado**: nombre aparece bajo el input como pill verde `✓ NOMBRE_ARTICULO`
- **Artículo no encontrado**: pill naranja `⚠ Artículo no encontrado — se creará automáticamente`
- **Ubicación vacía**: placeholder `"Código ubicación..."`
- **Ubicación buscando**: spinner inline
- **Ubicación encontrada**: nombre + almacén bajo el input como pill azul
- **Ubicación no encontrada**: pill rojo `✗ Ubicación no encontrada`

---

## 4. ESTRUCTURA VISUAL NUEVA

### 4.1 Layout desktop (≥ 1024px)

```
┌─────────────────────────────────────────────────────────────┐
│ SGA HEADER                                                  │
│ ☰  Inicio › Almacén › Entrada de Mercancía    [Limpiar F5]  │
├──────────────────────────────┬──────────────────────────────┤
│  ZONA IZQUIERDA (2/3)        │  CARRITO (1/3)               │
│                              │  sticky top                  │
│  ┌─ CABECERA ALBARÁN ──────┐ │  ┌──────────────────────┐   │
│  │ Fecha Proveedor Albarán │ │  │ Carrito de entrada   │   │
│  │ [toggle ▸]              │ │  │                      │   │
│  └─────────────────────────┘ │  │ línea 1              │   │
│                              │  │ línea 2              │   │
│  ┌─ ENTRADA RÁPIDA ────────┐ │  │ ...                  │   │
│  │ ARTÍCULO                │ │  │ ────────────────────  │   │
│  │ [______________] [✕]    │ │  │ 2 líneas · 15 uds    │   │
│  │ ✓ TORNILLO M8 DIN933    │ │  │ [CONFIRMAR ENTRADA]  │   │
│  │                         │ │  └──────────────────────┘   │
│  │ LOTE          [SIN LOTE]│ │                              │
│  │ [____________]          │ │                              │
│  │                         │ │                              │
│  │ UBICACIÓN DESTINO       │ │                              │
│  │ [______________]        │ │                              │
│  │ 📍 A-01-01 · Almacén   │ │                              │
│  │                         │ │                              │
│  │ CANTIDAD                │ │                              │
│  │ [−] [ 10.00 ] [+]       │ │                              │
│  │                         │ │                              │
│  │ [+ AÑADIR LÍNEA]        │ │                              │
│  └─────────────────────────┘ │                              │
└──────────────────────────────┴──────────────────────────────┘
```

### 4.2 Layout tablet (641–1023px)

```
┌─────────────────────────────────────────────────┐
│ SGA HEADER                                      │
├─────────────────────────────────────────────────┤
│ ┌─ CABECERA [▸ mostrar] ─────────────────────┐  │
│ └────────────────────────────────────────────┘  │
│ ┌─ ENTRADA RÁPIDA ───────────────────────────┐  │
│ │ Artículo [___________] ✓ nombre            │  │
│ │ Lote [___________] [SIN LOTE]              │  │
│ │ Ubicación [___________] 📍 nombre          │  │
│ │ Cantidad [−][____][+]                      │  │
│ │ [+ AÑADIR LÍNEA] (botón grande, 48px tall) │  │
│ └────────────────────────────────────────────┘  │
│ ┌─ CARRITO (N líneas) [▸ ver] ───────────────┐  │
│ │ línea 1 / línea 2 / ...                    │  │
│ │ [CONFIRMAR ENTRADA]                        │  │
│ └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 4.3 Layout móvil (≤ 640px)

```
┌─────────────────────────────┐
│ SGA HEADER                  │
├─────────────────────────────┤
│ Entrada rápida              │
│ Artículo [___________]      │
│ ✓ nombre artículo           │
│ Lote [___]  [SIN LOTE]      │
│ Ubicación [___________]     │
│ 📍 nombre ubicación         │
│ Cantidad                    │
│ [−]  [ 10.00 ]  [+]         │
│ [+ AÑADIR LÍNEA]            │
├─────────────────────────────┤
│ Carrito (2) [ver ▸]         │
│ [CONFIRMAR ENTRADA]         │
└─────────────────────────────┘
```

---

## 5. ARCHIVOS EXACTOS A MODIFICAR / CREAR

### 5.1 Ficheros NUEVOS (crear desde cero)

| Fichero | Descripción |
|---------|-------------|
| `frontend/pages/opciones/almacen-y-stock/entrada-de-mercancia/index.html` | HTML completo con FASE 1 layout |
| `frontend/css/opciones/almacen-y-stock/entrada-de-mercancia/index.css` | CSS namespace `em-`, todas variables `--sga-*` |
| `frontend/js/opciones/almacen-y-stock/entrada-de-mercancia.js` | IIFE, estado interno, createElement |

### 5.2 Ficheros MODIFICADOS

| Fichero | Cambio | Línea aprox. |
|---------|--------|-------------|
| `frontend/js/ui/sidebar.js` | Link "Entrada de mercancía" de `pages/ferreteria/entradas.html` a nueva ruta | L24 |
| `frontend/index.html` | Quick access "Entradas" actualiza href a nueva ruta | L144 |

### 5.3 Ficheros NO TOCAR

| Fichero | Razón |
|---------|-------|
| `frontend/pages/ferreteria/entradas.html` | Mantener legacy sin eliminar (posible uso externo) |
| `frontend/js/ferreteria/entradas.js` | Ídem |
| `frontend/css/ferreteria/entradas.css` | Ídem |
| `backend/routes/movimientos.routes.js` | Sin cambios de backend en FASE 4A |
| `frontend/js/api.js` | `SGA.entradas.save` ya existe y es compatible |
| Tests backend | Sin cambios |

---

## 6. ESTRUCTURA HTML DETALLADA

```
body.sga-layout
  <!-- sidebar.js inyecta aside.sga-sidebar -->
  div.sga-main
    header.sga-header
      div.sga-header-left
        button.sga-hamburger
        nav.sga-breadcrumb
          Inicio › Almacén › Entrada de Mercancía
      div.sga-header-right
        button#btn-limpiar  [Limpiar (F5)]
    div.sga-content
      div.em-inner
        div.em-page-header   [h1 + descripción]
        
        <!-- CABECERA ALBARÁN (colapsable) -->
        div.em-cabecera
          div.em-cabecera-header  [toggle ▸/▾]
          div.em-cabecera-body#em-cabecera-body
            field: ent-fecha (date, auto-hoy)
            field: ent-prov-cod (text) + ent-prov-nombre (readonly)
            field: ent-albaran (text)
        
        <!-- ZONA PRINCIPAL -->
        div.em-workspace
        
          <!-- ENTRADA RÁPIDA (izquierda / top) -->
          section.em-form
            div.em-form-title  "Entrada rápida"
            
            div.em-field-group  (artículo)
              label "Artículo"
              div.em-input-wrap
                input#ent-art-cod.em-input.em-input--lg
                button.em-btn-clear#btn-art-clear [✕]
              div.em-art-pill#em-art-pill  [nombre / estado]
            
            div.em-field-group  (lote)
              label "Lote"
              div.em-lote-row
                input#ent-lot.em-input
                button.em-btn-tag#btn-sin-lote [SIN LOTE]
            
            div.em-field-group  (ubicación)
              label "Ubicación destino"
              div.em-input-wrap
                input#ent-ubi.em-input.em-input--lg
              div.em-ubi-pill#em-ubi-pill  [nombre/almacén / estado]
            
            div.em-field-group.em-field-group--cant  (cantidad)
              label "Cantidad"
              div.em-cant-row
                button.em-stepper#btn-menos [−]
                input#ent-cant.em-input.em-input--cant (type=number)
                button.em-stepper#btn-mas   [+]
            
            div.em-form-actions
              button.em-btn-add#btn-anadir [+ AÑADIR LÍNEA]
          
          <!-- CARRITO (derecha / abajo) -->
          aside.em-carrito#em-carrito
            div.em-carrito-header
              span.em-carrito-title "Carrito de entrada"
              span.em-carrito-badge#em-carrito-count  "0 líneas"
            div.em-carrito-body#em-carrito-body
              <!-- líneas inyectadas por JS -->
              div.em-carrito-empty "Añada artículos para comenzar la entrada."
            div.em-carrito-footer
              div.em-carrito-totales
                span "N líneas · M unidades"
              button.em-btn-confirm#btn-confirmar [CONFIRMAR ENTRADA ▶]
        
        <!-- ZONA RESULTADOS (oculta hasta confirmar) -->
        div.em-results#em-results [hidden]
          div.em-results-header
          div.em-results-lines#em-results-lines
          div.em-results-footer
            button#btn-nueva-entrada [Nueva entrada]
            a#link-ver-stock [Ver en stock ↗]
```

---

## 7. CSS — ESPECIFICACIÓN DE NAMESPACE `em-`

### 7.1 Variables reutilizadas (FASE 1)
Todas las propiedades de color, sombra, radio y tipografía usan `--sga-*`.
Cero valores hardcoded.

### 7.2 Clases principales

| Clase | Descripción |
|-------|-------------|
| `.em-inner` | max-width 1200px, flex column, gap 16px |
| `.em-workspace` | grid: `1fr 340px` en desktop, `1fr` en tablet/móvil |
| `.em-form` | surface bg, rounded, shadow, padding 20px 24px |
| `.em-form-title` | uppercase, .68rem, letter-spacing, primary color |
| `.em-field-group` | flex column, gap 8px, margin-bottom 20px |
| `.em-input` | height 40px, border, radius-sm, font .88rem |
| `.em-input--lg` | width 100% |
| `.em-input--cant` | width 120px, text-align center, font-size 1.1rem, font-weight 700 |
| `.em-art-pill` | inline-flex, rounded, padding 6px 12px, font .78rem |
| `.em-art-pill--ok` | bg #f0fdf4, color var(--sga-success), border #bbf7d0 |
| `.em-art-pill--warn` | bg #fffbeb, color var(--sga-warning), border #fde68a |
| `.em-art-pill--err` | bg #fef2f2, color var(--sga-danger), border #fecaca |
| `.em-art-pill--loading` | color var(--sga-text-muted) |
| `.em-ubi-pill--ok` | bg #eff6ff, color var(--sga-primary), border #bfdbfe |
| `.em-ubi-pill--err` | como art-pill--err |
| `.em-stepper` | 40×40px, border, font-size 1.2rem, centered |
| `.em-btn-add` | bg var(--sga-primary), color white, height 44px, radius, font .9rem, font-weight 700, width 100% |
| `.em-btn-confirm` | bg var(--sga-success), color white, height 48px, font-size .95rem, font-weight 700, width 100% |
| `.em-btn-clear` | bare button, 28px, X, fade hover to red |
| `.em-btn-tag` | small, border, bg surface, font .75rem, grey, hover accent |
| `.em-carrito` | surface bg, rounded, shadow, flex column, sticky top |
| `.em-carrito-header` | flex space-between, padding 12px 16px, border-bottom |
| `.em-carrito-badge` | rounded pill, bg accent-light, color primary, font .72rem, font-weight 700 |
| `.em-carrito-body` | flex column, gap 8px, padding 12px 16px, overflow-y auto, max-height 420px |
| `.em-line` | flex, gap 8px, align center, padding 8px 10px, bg #fafbfc, rounded, border |
| `.em-line--sent` | bg #f0fdf4, border #bbf7d0 |
| `.em-line--error` | bg #fef2f2, border #fecaca |
| `.em-line-art` | font-weight 700, .83rem |
| `.em-line-lote` | badge: bg #f5f3ff, color #7c3aed, border #ddd6fe, font .68rem, font-weight 700 |
| `.em-line-ubi` | badge: bg #eff6ff, color primary, border bfdbfe, font .68rem |
| `.em-line-cant` | tabular-nums, font-weight 700, color primary |
| `.em-line-del` | bare button, 24px, hover red |
| `.em-results` | surface bg, rounded, shadow, padding 20px 24px |
| `.em-result-line--ok` | color var(--sga-success), ✓ prefix |
| `.em-result-line--err` | color var(--sga-danger), ✗ prefix |

### 7.3 Responsive

```css
/* Desktop: grid 2 columnas */
@media (min-width: 1024px) {
    .em-workspace { grid-template-columns: 1fr 340px; }
    .em-carrito { position: sticky; top: calc(var(--sga-header-h) + 16px); }
}

/* Tablet: carrito colapsable abajo */
@media (max-width: 1023px) {
    .em-workspace { grid-template-columns: 1fr; }
    .em-carrito-body { max-height: 280px; }
}

/* Móvil: inputs full width, botones grandes */
@media (max-width: 640px) {
    .em-inner { padding: 12px 12px 32px; }
    .em-input--lg { width: 100%; }
    .em-cant-row { justify-content: center; }
    .em-btn-add { height: 52px; font-size: 1rem; }
    .em-btn-confirm { height: 56px; }
}
```

---

## 8. JS — ESPECIFICACIÓN DE LÓGICA

### 8.1 Estructura del módulo

```js
"use strict";
(function () {

    /* ── ESTADO INTERNO ─────────────────────────── */
    var _lineas = [];          // array de { id, cod, nombre, lot, ubi, ubiNombre, cant }
    var _lineaIdx = 0;
    var _artEncontrado = false;
    var _ubiEncontrada = false;

    /* ── HELPERS ────────────────────────────────── */
    function $(id) { ... }
    function el(tag, cls) { ... }
    function txt(s) { ... }
    function fmt(n) { ... }    // toLocaleString 'es-ES'

    /* ── BÚSQUEDA DE ARTÍCULO ───────────────────── */
    function buscarArticulo()  // blur/Enter en #ent-art-cod
    function clearArticulo()   // botón ✕

    /* ── BÚSQUEDA DE UBICACIÓN ──────────────────── */
    function buscarUbicacion() // blur/Enter en #ent-ubi
    function setSinLote()      // botón SIN LOTE → $('ent-lot').value = 'SL'

    /* ── VALIDACIÓN ANTES DE AÑADIR ─────────────── */
    function validarLinea()
    // Reglas:
    // - cod: no vacío
    // - artEncontrado: true (o permitir si usuario acepta auto-alta)
    // - lot: no vacío
    // - ubi: no vacío
    // - ubiEncontrada: true (la ubi DEBE existir — no auto-creación)
    // - cant: > 0, finito

    /* ── AÑADIR LÍNEA AL CARRITO ────────────────── */
    function agregarLinea()    // valida → push a _lineas → renderCarrito → limpiarForm → foco art-cod

    /* ── RENDER CARRITO ─────────────────────────── */
    function renderCarrito()
    // createElement para cada línea .em-line
    // badge lote .em-line-lote
    // badge ubi .em-line-ubi
    // cantidad .em-line-cant
    // botón delete

    /* ── ELIMINAR LÍNEA ─────────────────────────── */
    function eliminarLinea(id) // filtra _lineas, re-render

    /* ── CONFIRMAR ENTRADA ──────────────────────── */
    async function confirmarEntrada()
    // 1. Deshabilitar btn-confirmar, mostrar "Enviando..."
    // 2. Promise.allSettled(_lineas.map(l => SGA.entradas.save({cod: l.cod, ubi: l.ubi, lot: l.lot, cant: l.cant})))
    // 3. Renderizar zona resultados (#em-results): por cada línea ✓/✗
    // 4. Mostrar resumen global
    // 5. Si todo OK → mostrar btn-nueva-entrada, btn-ver-stock

    /* ── LIMPIAR FORMULARIO ─────────────────────── */
    function limpiarFormRapido()   // solo campos artículo/lote/ubi/cant, mantiene carrito
    function limpiarTodo()         // cabecera + carrito + estado completo

    /* ── RENDERIZAR RESULTADOS ──────────────────── */
    function renderResultados(results)

    /* ── STEPPER CANTIDAD ───────────────────────── */
    function stepCant(delta)       // ±1 o ±0.01 según step

    /* ── TOGGLE CABECERA ────────────────────────── */
    function toggleCabecera()

    /* ── INIT ───────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        setFechaHoy();
        // Wiring:
        // ent-art-cod: blur → buscarArticulo, keydown Enter → buscarArticulo
        // btn-art-clear: click → clearArticulo
        // ent-ubi: blur → buscarUbicacion, Enter → buscarUbicacion
        // btn-sin-lote: click → setSinLote
        // btn-menos / btn-mas: click → stepCant(-1/+1)
        // btn-anadir: click → agregarLinea
        // btn-confirmar: click → confirmarEntrada
        // btn-limpiar (header): click → confirm → limpiarTodo
        // btn-nueva-entrada: click → limpiarTodo, ocultar resultados
        // Escape: cancelar búsqueda si en progreso
        // F5: limpiarTodo
        // ent-prov-cod: blur → buscarProveedor
        // toggle cabecera
    });

})();
```

### 8.2 Manejo de auto-alta de artículo

El backend crea el artículo automáticamente con nombre `"ALTA AUTOMÁTICA - {cod}"`.
El frontend debe:
- Mostrar pill **naranja** `⚠ Artículo no encontrado — se dará de alta automáticamente`
- Permitir continuar (no bloquear)
- Al confirmar: el artículo se crea en el momento de la llamada `POST /entrada`

### 8.3 Manejo de errores por línea

```js
Promise.allSettled([...])
// result.status === 'fulfilled' → ✓ verde
// result.status === 'rejected'  → ✗ rojo, mostrar reason.message
```

Las líneas fallidas quedan en el carrito para reintento.
Las líneas exitosas se marcan con clase `.em-line--sent`.

### 8.4 Focus management

- Al abrir la pantalla: focus en `#ent-art-cod`
- Al añadir línea con éxito: focus vuelve a `#ent-art-cod`
- Al pulsar Enter en artículo: si artículo ya resuelto → salta a lote
- Al pulsar Enter en lote: salta a ubicación
- Al pulsar Enter en ubicación: si ubi resuelta → salta a cantidad
- Al pulsar Enter en cantidad: equivale a "Añadir línea"
- Tab flow natural entre campos

---

## 9. VALIDACIONES VISUALES

| Campo | Condición | Estado visual |
|-------|-----------|---------------|
| Artículo | vacío | borde normal |
| Artículo | buscando | spinner, input disabled |
| Artículo | encontrado | borde verde, pill verde |
| Artículo | no encontrado | borde naranja, pill naranja (auto-alta) |
| Lote | vacío | borde rojo al intentar añadir |
| Lote | relleno | borde normal |
| Ubicación | vacía | borde normal |
| Ubicación | buscando | spinner, input disabled |
| Ubicación | encontrada | borde azul, pill azul |
| Ubicación | no encontrada | borde rojo, pill rojo, BLOQUEA añadir |
| Cantidad | ≤ 0 | borde rojo, botón "Añadir" bloqueado |
| Cantidad | > 0 | borde normal |

### Clases de validación reutilizadas de FASE 1
```css
.em-input--valid   { border-color: var(--sga-success); }
.em-input--invalid { border-color: var(--sga-danger); }
.em-input--warn    { border-color: var(--sga-warning); }
```

---

## 10. ESTADOS DE ERROR

| Error | Origen | Mostrar |
|-------|--------|---------|
| 400 cod/ubi/lot obligatorio | Backend | En zona resultados: "Datos incompletos: …" |
| 400 cant ≤ 0 | Backend | En zona resultados: "Cantidad inválida" |
| 500 Error interno | Backend | "Error del servidor. Inténtelo de nuevo." |
| Network error | fetch | "Sin conexión con el servidor" |
| Ubicación no encontrada | `SGA.ubicaciones.list` / 404 | Pill rojo en campo, bloqueo |
| Sin líneas en carrito | Frontend | Botón CONFIRMAR deshabilitado |
| Carrito vacío al limpiar | Frontend | No pedir confirmación |
| Carrito con líneas al limpiar | Frontend | Pedir confirmación: "¿Descartar N líneas?" |

---

## 11. CONFIRMACIÓN FINAL

Al pulsar **CONFIRMAR ENTRADA**:

1. Deshabilitar todos los botones de la zona
2. Mostrar en carrito: spinner por línea `"Enviando..."`
3. `Promise.allSettled(...)` con todas las líneas
4. Per línea:
   - `fulfilled`: clase `.em-line--sent` en carrito, estado ✓ en resultados
   - `rejected`: clase `.em-line--error` en carrito, estado ✗ en resultados
5. Mostrar `#em-results` con tabla de resultados
6. Resumen final: `"X de N líneas registradas correctamente."`
7. Si todas OK: botón `"Nueva entrada"` prominente + link a consulta de stock
8. Si alguna falla: botón `"Reintentar fallidas"` (re-envía solo las líneas en error)

---

## 12. RESPONSIVE DETALLADO

### Desktop (≥ 1024px)
- Grid 2 columnas: `1fr 340px`
- Carrito fijo lateral, sticky
- Cabecera albarán siempre visible

### Tablet (641–1023px)
- Grid 1 columna
- Cabecera albarán colapsable (oculta por defecto, toggle visible)
- Carrito colapsable abajo
- `em-btn-add` mínimo 48px alto
- `em-btn-confirm` mínimo 52px alto
- Inputs al menos 44px alto

### Móvil (≤ 640px)
- Grid 1 columna
- Inputs full-width
- Stepper de cantidad grande (48×48px por botón)
- Carrito colapsable con badge de count `Carrito (3)`
- `em-btn-add` 56px alto
- `em-btn-confirm` 56px alto, full-width, texto completo

---

## 13. INTEGRACIÓN FUTURA — ETIQUETAS

El plan está diseñado para que en FASE 4B se añada:

```
// En confirmarEntrada(), tras éxito por línea:
// → botón "Imprimir etiqueta" por línea en zona resultados
// → endpoint futuro: POST /etiqueta { cod, ubi, lot, cant }
```

La zona de resultados ya reserva espacio para acciones post-confirmación.

---

## 14. INTEGRACIÓN FUTURA — PDA / SCANNER

- El campo `#ent-art-cod` acepta input por teclado y por scanner USB (mismo evento `blur`/`keydown Enter`)
- El campo `#ent-ubi` ídem
- Los campos de texto son compatibles con scanners que emiten `\n` o `\r` como terminador
- En FASE 4C: eventualmente WebSocket PDA o BLE scanner

---

## 15. PANEL LATERAL DE DETALLE

El panel lateral de FASE 4A es el **carrito de entrada**. No hay un "detalle de artículo" separado.

En desktop: columna derecha fija.
En tablet/móvil: sección colapsable bajo el formulario.

Contenido del carrito:
- Lista de líneas (scroll interno si > 5 líneas)
- Línea: `[ARTÍCULO] nombre · [LOTE] · [UBI] · cant ×1.000 · [🗑]`
- Totales: `N líneas · M.MMM unidades totales`
- Botón CONFIRMAR

---

## 16. ACCESOS RÁPIDOS POST-ENTRADA

Tras confirmar con éxito:

```html
<a href="../consulta-de-stock/index.html?articulo=...">Ver en stock ↗</a>
<button>Nueva entrada</button>
```

El link a "Ver en stock" filtra por el artículo de la primera línea confirmada (si es una entrada homogénea) o va a stock sin filtros si hay múltiples artículos.

---

## 17. REUTILIZACIÓN DE FASE 1

| Elemento | Clase FASE 1 | Uso en FASE 4A |
|----------|-------------|----------------|
| Layout shell | `sga-layout`, `sga-main`, `sga-content` | ✓ idéntico |
| Header | `sga-header`, `sga-header-left`, `sga-header-right` | ✓ |
| Breadcrumb | `sga-breadcrumb`, `sga-breadcrumb-sep`, `sga-breadcrumb-current` | ✓ |
| Botones | `sga-btn`, `sga-btn-primary`, `sga-btn-secondary`, `sga-btn-sm` | ✓ header |
| Hamburger | `sga-hamburger` | ✓ |
| Títulos | `sga-page-title`, `sga-page-description` | ✓ |
| Variables | `--sga-surface`, `--sga-border`, `--sga-accent`, `--sga-primary`, `--sga-danger`, `--sga-success`, `--sga-warning`, `--sga-text`, `--sga-text-muted`, `--sga-radius`, `--sga-radius-sm`, `--sga-shadow`, `--sga-header-h` | ✓ todo el CSS `em-` |

---

## 18. ORDEN DE IMPLEMENTACIÓN

### Tarea 1 — Crear HTML completo
Fichero: `frontend/pages/opciones/almacen-y-stock/entrada-de-mercancia/index.html`
- Estructura FASE 1 completa
- Todos los IDs especificados en §6
- Scripts: `api.js`, `sidebar.js`, `layout.js`, `entrada-de-mercancia.js`

### Tarea 2 — Crear CSS completo
Fichero: `frontend/css/opciones/almacen-y-stock/entrada-de-mercancia/index.css`
- Namespace `em-`, cero hardcoded
- Incluir todos los estados de pills y líneas
- Los 3 breakpoints responsive

### Tarea 3 — Crear JS completo
Fichero: `frontend/js/opciones/almacen-y-stock/entrada-de-mercancia.js`
- IIFE strict
- Estado `_lineas`, `_artEncontrado`, `_ubiEncontrada`
- Todas las funciones de §8
- Focus management completo
- `Promise.allSettled` en confirmar

### Tarea 4 — Actualizar sidebar
Fichero: `frontend/js/ui/sidebar.js` línea 24
- Cambiar href de `pages/ferreteria/entradas.html`
  a `pages/opciones/almacen-y-stock/entrada-de-mercancia/index.html`

### Tarea 5 — Actualizar dashboard
Fichero: `frontend/index.html` línea 144
- Actualizar href del acceso rápido "Entradas"

---

## 19. VERIFICACIONES MANUALES

Tras implementar, verificar manualmente:

1. [ ] La página carga con sidebar + breadcrumb correctos
2. [ ] La fecha se auto-rellena a hoy al abrir
3. [ ] Al tabular por Artículo → Lote → Ubicación → Cantidad → Enter = "Añadir"
4. [ ] Artículo existente: pill verde con nombre correcto
5. [ ] Artículo inexistente: pill naranja con aviso de auto-alta
6. [ ] Ubicación existente: pill azul con nombre y almacén
7. [ ] Ubicación inexistente: pill rojo, botón "Añadir" deshabilitado
8. [ ] Lote vacío: al intentar añadir, borde rojo en campo lote
9. [ ] Cantidad ≤ 0: botón "Añadir" deshabilitado
10. [ ] "SIN LOTE" rellena el campo lote con valor predeterminado
11. [ ] Añadir línea → aparece en carrito → foco vuelve a artículo
12. [ ] Eliminar línea del carrito → desaparece
13. [ ] Carrito vacío → CONFIRMAR deshabilitado
14. [ ] Confirmar con líneas válidas → `POST /entrada` llamado por línea → ✓ en resultados
15. [ ] Error de backend → ✗ en resultados con mensaje legible
16. [ ] "Nueva entrada" limpia todo y devuelve foco a artículo
17. [ ] F5 limpia (con confirmación si hay líneas)
18. [ ] Responsive desktop: carrito en columna derecha sticky
19. [ ] Responsive tablet: carrito colapsable bajo formulario
20. [ ] Responsive móvil: todo en columna, botones grandes
21. [ ] Sidebar marca "Entrada de mercancía" como activo
22. [ ] Desde dashboard → quick access "Entradas" lleva a la nueva página
23. [ ] Tests backend: 80/80 siguen pasando (no se toca backend)
24. [ ] FASE 3 (consulta de stock) sigue funcionando sin regresiones
25. [ ] Sin `innerHTML` con datos de usuario (todo via `createElement`)

---

## 20. CRITERIOS DE ÉXITO

| Criterio | Métrica |
|----------|---------|
| Flujo básico (artículo + lote + ubi + cant → confirmar) funcionando | End-to-end manual |
| Sin roturas de FASE 1, 2, 3 | Verificación manual de dashboard y stock |
| Tests backend inalterados | `npm test` → 80/80 |
| Feedback visual en cada estado (buscando, ok, error) | Visual manual |
| Responsive en 3 breakpoints | Resize manual del navegador |
| Cero `innerHTML` con datos de usuario | Code review |
| Cero globals (IIFE correcto) | Dev tools → window.* |
| Sidebar actualizado y activo en nueva ruta | Visual manual |

---

## 21. RIESGOS DETECTADOS

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| R1: Backend `/entrada` no acepta lote "SL" o cadena vacía | Media | Alta | Verificar validación; valor por defecto `SL` o `0` |
| R2: `SGA.ubicaciones.list` no permite buscar por código exacto | Media | Media | Verificar parámetros; fallback a buscar en la lista completa |
| R3: Auto-alta de artículo indeseable en producción | Media | Alta | Pill de aviso clara; en FASE 4B añadir flag `--no-autoalta` al backend |
| R4: Backend multi-línea sin transacción global | Alta | Media | Documentar: N líneas = N requests independientes; retry por línea |
| R5: `SGA.entradas.save` lanza excepción si backend devuelve 4xx | Baja | Media | `Promise.allSettled` ya maneja rechazos; el `.catch` en `_post` lanza Error |
| R6: Focus management en tablet virtual keyboard | Media | Baja | Verificar con DevTools mobile emulation |

---

## 22. NOTAS DE ARQUITECTURA

1. **Backend sin transacción de entrada completa**: Cada `POST /entrada` es atómico a nivel de una línea. Si el usuario confirma 5 líneas y la 3ª falla, las 2 primeras ya están aplicadas en stock. Esto es aceptable para FASE 4A. FASE 4B debería introducir un endpoint `POST /entrada-batch` con transacción.

2. **Proveedor/albarán como metadata visual**: El backend actual no guarda estos campos. Se muestran en la cabecera albarán para que el operario tenga contexto, pero no afectan al stock. En FASE 4B se añadirían a una tabla `ENTRADA_CABECERA`.

3. **Precio/Dto eliminados**: Se eliminan los campos de precio y descuento del formulario. No tienen sentido en una herramienta de stock puro. Si se necesitan en el futuro, irán en la tabla de cabecera.

4. **Ruta nueva vs legacy**: La página legacy `pages/ferreteria/entradas.html` queda intacta pero desenlazada del sidebar. Se accede solo con URL directa.

5. **CSS `em-` independiente**: El CSS de FASE 4A no afecta a ninguna clase de FASE 1, 2 o 3 gracias al namespace. La única excepción son los botones del header que usan `sga-btn`.

---

## 23. MEJORAS FUTURAS RELACIONADAS

| FASE futura | Descripción |
|-------------|-------------|
| FASE 4B | Endpoint `POST /entrada-batch` con transacción; tabla `ENTRADA_CABECERA` (fecha, proveedor, albarán); historial de recepciones |
| FASE 4C | Impresión de etiqueta por línea; integración con impresora térmica |
| FASE 4D | Recepción desde pedido de compra (PO); matching albarán con pedido |
| FASE 4E | Soporte PDA / scanner Bluetooth; modo "escaneo continuo" |
| FASE 4F | Foto de albarán adjunta (File API) |
| FASE 4G | Validación de lote cuarentena antes de permitir entrada |

---

## 24. RESUMEN EJECUTIVO

**Problema central**: La pantalla actual de entrada de mercancía está rota (el botón "Añadir línea" no existe en el DOM, faltan los campos `ubi` y `lot`, hay un bug en `limpiarDetalle()`, y hay un mismatch total entre lo que el JS envía y lo que el backend espera). Ninguna entrada puede registrarse con la pantalla actual.

**Solución**: Nueva pantalla moderna en `pages/opciones/almacen-y-stock/entrada-de-mercancia/` con flujo operativo guiado (artículo → lote → ubicación → cantidad → añadir), carrito de entrada visual, confirmación con feedback por línea, y responsive completo para uso táctil en almacén.

**Archivos**: 3 nuevos + 2 modificaciones menores (sidebar + dashboard link).

**Backend**: Sin cambios. `POST /entrada` con `{cod, ubi, lot, cant}` es suficiente para FASE 4A.

---

*Plan generado: 2026-05-08 — Rama: paco-clean*
