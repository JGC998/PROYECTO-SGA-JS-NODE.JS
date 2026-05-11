# FASE 4D — Traspasos Modernos

**Plan Técnico Completo · SGA LIN**

| Campo       | Valor                     |
|-------------|---------------------------|
| Versión     | 1.0                       |
| Fecha       | 2026-05-08                |
| Estado      | LISTO PARA IMPLEMENTAR    |
| Rama        | paco-clean                |
| Dependencias| FASE 1, FASE 3, FASE 4C   |

---

## 1. Diagnóstico UX — Pantalla Legacy

### Localización
```
frontend/pages/ferreteria/traspasos.html       ← HTML legacy
frontend/css/ferreteria/traspasos.css          ← CSS legacy
frontend/js/ferreteria/traspasos.js            ← JS legacy
```
> ⚠️ La pantalla legacy NO está en `opciones/almacen-y-stock/` sino en
> `ferreteria/`. El sidebar la enlaza desde `pages/ferreteria/traspasos.html`.

### Problemas UX detectados

| # | Problema | Impacto |
|---|----------|---------|
| 1 | **Sin selector de stock real**: el operario escribe código y ubicación sin ver qué stock existe. Puede traspasar stock inexistente. | CRÍTICO |
| 2 | **Sin campo de lote en origen**: el formulario no captura lote, pero el backend lo EXIGE como obligatorio. | CRÍTICO |
| 3 | **Lookup de stock incorrecto**: `SGA.stock.get(cod)` devuelve stock total del artículo (sin desglose por ubicación/lote). El operario ve "200 ud" pero no sabe en qué ubicación están. | ALTO |
| 4 | **Sin validación destino ≠ origen**: traspasar a la misma ubicación es un no-op silencioso. | ALTO |
| 5 | **Feedback con `alert()` nativo**: UX de 2005. Sin estados de carga, sin mensajes inline. | MEDIO |
| 6 | **Sin confirmación visual**: el operario no ve resumen antes de confirmar. | MEDIO |
| 7 | **Operario y motivo se capturan pero nunca llegan al backend**: campos fantasma. | BAJO |

---

## 2. Análisis Técnico — Estado Actual

### Endpoint backend: `POST /traspaso`

**Ruta**: `backend/routes/movimientos.routes.js` (líneas ~34–79)

**Payload esperado** (lo que el backend realmente consume):
```json
{
  "cod":    "ART001",
  "ubiOri": "A-01-01",
  "ubiDes": "B-02-03",
  "lot":    "LOT001",
  "cant":   50
}
```

**Lógica SQL (transacción ACID)**:
1. `BEGIN TRANSACTION`
2. `SELECT STOCAN FROM STOCK WHERE STOARTCOD=@cod AND STOUBI=@ubiOri AND STOLOT=@lot`
3. Si STOCAN < cant → `ROLLBACK` + 409 `"Stock insuficiente para realizar el traspaso"`
4. `UPDATE STOCK SET STOCAN = STOCAN - @cant` (debit origen)
5. `SELECT STOCAN FROM STOCK WHERE STOARTCOD=@cod AND STOUBI=@ubiDes AND STOLOT=@lot`
6. Si existe → `UPDATE STOCAN = STOCAN + @cant` / si no existe → `INSERT` nuevo registro
7. `COMMIT`

**Respuestas**:
- `200 { success: true, message: 'Traspaso completado' }`
- `400 { success: false, message: '...' }` — campos faltantes o `cant` inválido
- `409 { success: false, message: 'Stock insuficiente para realizar el traspaso' }`
- `500 { success: false, message: 'Error interno del servidor' }`

### Payload legacy (lo que el frontend envía realmente — ROTO)
```json
{
  "fecha":    "2024-05-08",
  "operario": "OP01",
  "motivo":   "Reubicación",
  "lineas": [
    { "idx": 0, "articulo": "ART001", "nombre": "...", "cantidad": 50, "ori": "A-01", "des": "B-02" }
  ]
}
```
- `ori`/`des` ≠ `ubiOri`/`ubiDes` → campos ignorados por el backend
- `lot` ausente → backend rechaza con 400
- El backend espera campos planos, no un array `lineas`
- **Conclusión: la pantalla legacy de traspasos lleva años rota.**

### API disponible en `api.js`

```javascript
SGA.consultaStock.list(params)  // GET /consulta-de-stock?articulo=&...
// params soportados: articulo, ubicacion, lote, solo_existencias
// Devuelve array de { articulo, nombre, ubicacion, lote, cantidad, ... }
// Esta es la llamada correcta para el selector de stock origen.

SGA.traspasos.save(data)        // POST /traspaso
// data = { cod, ubiOri, ubiDes, lot, cant }
```

---

## 3. Problemas Críticos Detectados

### CRÍTICO #1 — Trazabilidad completamente rota

`POST /traspaso` solo modifica la tabla `STOCK`. **No inserta ningún registro en `ALBARANCS`.**

Consecuencias:
- Los traspasos realizados **NO aparecen en el timeline de Movimientos por Artículo** (FASE 4C).
- El tipo `T` (Traspaso) en ALBARANCS nunca se genera desde esta pantalla.
- Imposible auditar quién movió qué, cuándo, desde dónde y hacia dónde.
- **La trazabilidad del almacén está rota para todos los traspasos realizados.**

**Solución: añadir dos INSERTs en ALBARANCS dentro de la transacción existente.**
Esto es el único cambio backend imprescindible para que FASE 4D tenga sentido.

### CRÍTICO #2 — Payload frontend-backend no coincide

La pantalla legacy nunca ha funcionado correctamente porque el payload que
construye el JS no coincide con lo que espera el backend (ver sección 2).

### MODERADO #3 — Mismo lote en origen y destino

El backend usa `lot` tanto para buscar el origen como para crear/actualizar el
destino. No se puede cambiar de lote en el traspaso. Esto se acepta en FASE 4D.
La gestión de lotes avanzada queda para una fase futura.

### MENOR #4 — Sin validación destino ≠ origen en backend

Si `ubiOri == ubiDes`, el stock se descuenta y se vuelve a sumar en la misma
ubicación. El stock no cambia pero sí consume un ciclo de escritura. Añadir
esta validación en frontend es trivial y suficiente.

---

## 4. Bug Pre-existente — FASE 4C CSS (corregir en T1)

La `index.html` de movimientos-por-articulo carga el CSS con:
```html
<link rel="stylesheet" href="mv.css">
```
Pero `mv.css` está en `frontend/css/opciones/almacen-y-stock/movimientos-por-articulo/mv.css`.
El path relativo correcto desde el HTML debería ser:
```html
<link rel="stylesheet" href="../../../../css/opciones/almacen-y-stock/movimientos-por-articulo/mv.css">
```
**Este bug hace que el CSS de la pantalla de movimientos no cargue.**
Corregirlo en T1 junto con el cambio de sidebar no añade riesgo.

---

## 5. Flujo Operativo Recomendado

```
PASO 1 — BUSCAR ARTÍCULO
  ┌──────────────────────────────────────────────────────────────┐
  │ Input: código artículo → SGA.consultaStock.list({            │
  │     articulo: cod, solo_existencias: '1'                     │
  │ })                                                           │
  └──────────────────────────────────────────────────────────────┘

PASO 2 — MOSTRAR STOCK REAL (selector de origen)
  ┌─ CARD ─────────────────────────────────────────────────────┐
  │  UBI-A01        Lote: LOT001                               │
  │  200 unidades disponibles            [SELECCIONAR]         │
  └────────────────────────────────────────────────────────────┘
  ┌─ CARD ─────────────────────────────────────────────────────┐
  │  UBI-A02        Lote: LOT001                               │
  │   50 unidades disponibles            [SELECCIONAR]         │
  └────────────────────────────────────────────────────────────┘

PASO 3 — SELECCIONAR ORIGEN (click en card)
  → Card se marca con borde azul + checkmark
  → Se registra: { cod, articulo_nombre, ubiOri, lot, disponible }

PASO 4 — SELECCIONAR DESTINO
  → Input texto para código de ubicación destino
  → Validación inline: destino ≠ origen

PASO 5 — INTRODUCIR CANTIDAD
  → Input numérico con hint "/ 200 disponibles"
  → Validar: > 0, ≤ disponible, Number.isFinite

PASO 6 — AÑADIR AL CARRITO
  → Validación completa (ver §8 Validaciones)
  → Push a _lineas[]
  → Actualizar resumen lateral
  → Reset formulario de detalle (mantiene búsqueda activa)

PASO 7 — CONFIRMAR TRASPASO
  → Revisar resumen lateral
  → Click "Confirmar traspaso"
  → Modal de confirmación (no alert nativo)
  → Envío secuencial: una llamada por línea
  → Resultado por línea: ✓ / ✗ con mensaje

PASO 8 — RESULTADO
  → Éxito total: limpiar carrito, feedback visual claro
  → Error parcial: mostrar qué líneas fallaron, cuáles se ejecutaron
  → No se limpia el carrito si hay errores (el operario puede reintentar)
```

---

## 6. Diseño Visual

### Desktop ≥ 1024px — Layout 2 columnas

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Inicio › Traspasos entre ubicaciones           [Vaciar todo]  │
├────────────────────────────────────┬─────────────────────────────┤
│ ZONA PRINCIPAL (izquierda)         │ RESUMEN LATERAL (derecha)   │
│                                    │                             │
│  🔍 Buscar artículo                │  Carrito — 2 líneas         │
│  [ART001______________________]    │  ─────────────────────────  │
│  [Buscar]                          │                             │
│                                    │  ART001 · Lote: LOT001      │
│  STOCK DISPONIBLE — ART001         │  UBI-A01 → UBI-B02          │
│  ┌──────────────────────────────┐  │  50 unidades        [×]     │
│  │● UBI-A01  Lote:LOT001 200ud │  │                             │
│  │  ← SELECCIONADO             │  │  ART001 · Lote: LOT001      │
│  ├──────────────────────────────┤  │  UBI-A02 → UBI-B02          │
│  │  UBI-A02  Lote:LOT001  50ud │  │  25 unidades        [×]     │
│  └──────────────────────────────┘  │                             │
│                                    │  ─────────────────────────  │
│  MOVER HACIA                       │  [CONFIRMAR TRASPASO]       │
│  Destino:  [UBI-B02____________]   │                             │
│  Cantidad: [50__] / 200 disp.      │                             │
│                                    │                             │
│  [+ AÑADIR AL CARRITO]             │                             │
└────────────────────────────────────┴─────────────────────────────┘
```

### Tablet 640–1023px — Panel como overlay

```
┌──────────────────────────────────────────┐
│ Traspasos        [🛒 Carrito (2)] [✕]   │
├──────────────────────────────────────────┤
│  [ART001________________________] [Bus]  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │● UBI-A01  Lote:LOT001  200ud      │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  UBI-A02  Lote:LOT001   50ud      │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Destino:  [UBI-B02__________________]   │
│  Cantidad: [50___] / 200 disponibles     │
│                                          │
│  [+ AÑADIR AL CARRITO]                  │
└──────────────────────────────────────────┘
         [overlay cuando se abre carrito]
```

### Móvil < 640px — Flujo vertical, modal inferior

```
┌───────────────────────────┐
│ Traspasos  [🛒(2)]        │
├───────────────────────────┤
│ [ART001____________][Bus] │
│                           │
│ ┌───────────────────────┐ │
│ │● UBI-A01             │ │
│ │  Lote: LOT001        │ │
│ │  200 unidades        │ │
│ └───────────────────────┘ │
│ ┌───────────────────────┐ │
│ │  UBI-A02             │ │
│ │  Lote: LOT001        │ │
│ │  50 unidades         │ │
│ └───────────────────────┘ │
│                           │
│ Destino:                  │
│ [UBI-B02________________] │
│ Cantidad:                 │
│ [50___] / 200 disponibles │
│                           │
│ [+ AÑADIR AL CARRITO]    │
└───────────────────────────┘
  ↑ panel carrito sube desde abajo
```

---

## 7. Selector de Origen

### Llamada API
```javascript
SGA.consultaStock.list({ articulo: cod, solo_existencias: '1' })
```
Devuelve array de rows. Campos usados: `articulo`, `nombre`, `ubicacion`, `lote`, `cantidad`.

### Comportamiento
- Se muestra tras pulsar "Buscar" con artículo no vacío.
- Cada row = un `<button class="tp-stock-card">` con:
  - Columna izquierda: `ubicacion`
  - Columna centro: `Lote: lote` (o `—` si vacío)
  - Columna derecha: `cantidad` + `unidades`
- Cards con `cantidad = 0` deshabilitadas visualmente (`.tp-stock-card--zero`).
- Click en card:
  - Marca esa card con `.tp-stock-card--active`
  - Desactiva el resto
  - Actualiza `_selectedOrigen`
- Sin resultado → estado vacío con mensaje.
- Error de red → estado error con mensaje.

### Estado interno tras selección
```javascript
_selectedOrigen = {
    cod:         row.articulo,   // para el payload del backend
    nombre:      row.nombre,
    ubiOri:      row.ubicacion,
    lot:         row.lote,
    disponible:  row.cantidad
}
```

---

## 8. Selector de Destino

Para FASE 4D: **input de texto libre** con validación inline.

Justificación: no existe aún un endpoint de lista de ubicaciones que sea
adecuado para un selector (habría que cargar todas las ubicaciones del almacén).
Un selector completo de ubicaciones es mejora futura. El backend crea la línea
de stock en destino si no existe, lo que es el comportamiento actual.

### Validaciones inline en el input
- `ubiDes !== ubiOri` → mostrar error bajo el input (no bloquear hasta "Añadir")
- Trim automático al escribir
- No vacío

### Nota UX
Un mensaje descriptivo bajo el input:
> "Si la ubicación destino no existe, se creará automáticamente con este lote."

---

## 9. Validaciones Completas

Ejecutadas en `validateLinea()` antes de cada "Añadir al carrito":

| Validación | Acción si falla |
|-----------|-----------------|
| `_selectedOrigen !== null` | Mensaje: "Selecciona primero una línea de stock origen." |
| `ubiDes.trim() !== ''` | Mensaje: "Introduce la ubicación destino." |
| `ubiDes.trim() !== ubiOri` | Mensaje: "La ubicación destino debe ser diferente de la origen." |
| `cant > 0` | Mensaje: "La cantidad debe ser mayor que 0." |
| `Number.isFinite(cant)` | Mensaje: "Introduce una cantidad válida." |
| `cant <= disponible` | Mensaje: `"Cantidad máxima disponible: ${fmt(disponible)} ud."` |

Los mensajes aparecen inline bajo el campo problemático, no en `alert()`.

---

## 10. Control de Stock y Lotes

### Stock origen
Fuente de verdad: `SGA.consultaStock.list()` con `solo_existencias: '1'`.
Muestra únicamente líneas con stock > 0. El operario solo puede seleccionar
líneas que realmente existen.

### Lote
El lote viaja con el stock. El traspaso mantiene el mismo lote en destino.
No se puede cambiar lote en el traspaso (comportamiento actual del backend).
Si el destino ya tiene stock de ese artículo con ese lote, se suma.
Si no tiene, se crea nueva línea.

**Campo `lot` en el payload** = `_selectedOrigen.lot` (del row seleccionado).

### Validación de disponible vs. carrito
Si el operario añade la misma ubicación/lote al carrito dos veces, no se
valida la cantidad acumulada contra el disponible (esto requeriría recalcular
el disponible restante). Se acepta para FASE 4D. Riesgo bajo: el backend
rechazará con 409 si no hay suficiente stock en el segundo movimiento.

---

## 11. Carrito / Resumen

### Estructura interna
```javascript
_lineas = [
    {
        cod:    'ART001',
        nombre: 'Nombre artículo',
        ubiOri: 'UBI-A01',
        ubiDes: 'UBI-B02',
        lot:    'LOT001',
        cant:   50
    },
    ...
]
```

### Render del resumen lateral
Una tarjeta `<div class="tp-linea">` por línea con:
- Artículo + nombre (truncado si largo)
- `ubiOri → ubiDes` con flecha visual
- `Lote: lot · cant unidades`
- Botón `[×]` para eliminar

### Contador en botón
En tablet/móvil el botón "Carrito" muestra el número de líneas: `🛒 (2)`.

---

## 12. Confirmación

### Flujo
1. Click "Confirmar traspaso" → si `_lineas.length === 0`: error inline.
2. Mostrar modal/zona de confirmación con resumen completo.
3. El operario confirma o cancela.
4. Al confirmar: deshabilitar botón, mostrar spinner.
5. Envío secuencial (una llamada por línea):
   ```javascript
   for (var i = 0; i < _lineas.length; i++) {
       var r = _lineas[i];
       await SGA.traspasos.save({
           cod: r.cod, ubiOri: r.ubiOri,
           ubiDes: r.ubiDes, lot: r.lot, cant: r.cant
       });
   }
   ```
6. Resultado: modal de resultado (no `alert()`).

### Resultado por línea
Cada línea muestra: `✓ ART001: UBI-A01 → UBI-B02 · 50 ud` o
`✗ ART001: Error — Stock insuficiente`.

---

## 13. Mensajes de Error / Éxito

Todos los mensajes se renderizan con `createElement`, nunca con `innerHTML` + datos de usuario.

| Situación | Mensaje |
|-----------|---------|
| Búsqueda sin artículo | "Introduce un código de artículo para buscar." |
| Artículo sin stock | "Sin stock disponible para este artículo." |
| Error de red en búsqueda | "No se pudo cargar el stock. Comprueba la conexión." |
| Validación fallida | Mensaje inline bajo el campo problemático (ver §9) |
| Carrito vacío al confirmar | "Añade al menos una línea antes de confirmar." |
| Traspaso completado (todos OK) | "Traspaso completado — X líneas procesadas." |
| Traspaso con errores parciales | "X de Y líneas procesadas. Ver detalle." |
| Stock insuficiente en servidor | "Stock insuficiente. No se realizó el movimiento." |
| Error de servidor (500) | "Error del servidor. Contacta con el administrador." |

---

## 14. Responsive

### Desktop ≥ 1024px
- Grid 2 columnas: zona principal (stock + destino) + panel resumen sticky.
- Panel siempre visible a la derecha.
- Stock cards en lista vertical.

### Tablet 640–1023px
- 1 columna.
- Panel resumen como overlay slide-in desde la derecha (`translateX`).
- Activado por botón "Carrito (N)" en header.
- Botones táctiles de min. 44px height.
- Backdrop semitransparente.

### Móvil < 640px
- 1 columna, flujo vertical.
- Panel resumen como bottom sheet (`translateY`).
- Cards de stock compactas.
- Inputs de destino y cantidad full-width.

---

## 15. Panel Lateral

### Desktop
```css
.tp-panel {
    position: sticky;
    top: calc(var(--sga-header-h) + 16px);
    max-height: calc(100vh - var(--sga-header-h) - 48px);
    overflow-y: auto;
}
```

### Tablet (≤ 1023px)
```css
.tp-panel {
    position: fixed;
    right: 0; top: 0; bottom: 0;
    width: min(360px, 90vw);
    transform: translateX(110%);
    transition: transform .25s ease;
    z-index: 300;
}
.tp-panel.tp-panel--open { transform: translateX(0); }
```

### Móvil (≤ 639px)
```css
.tp-panel {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    max-height: 75vh;
    border-radius: 14px 14px 0 0;
    transform: translateY(110%);
    transition: transform .25s ease;
}
.tp-panel.tp-panel--open { transform: translateY(0); }
```

---

## 16. Backend — Cambio Mínimo Imprescindible

**Archivo**: `backend/routes/movimientos.routes.js`
**Sección**: `POST /traspaso` — dentro de la transacción, tras los UPDATE/INSERT de STOCK.

**Objetivo**: generar registros de trazabilidad en ALBARANCS para que los
traspasos aparezcan en el timeline de Movimientos (FASE 4C).

**Patrón**: copiar exactamente los campos y nombres usados en los INSERTs de
`POST /entrada` y `POST /salida` para mantener consistencia. Los nombres exactos
de columnas de ALBARANCS deben verificarse leyendo esos endpoints antes de
implementar T1.

**Estructura conceptual** (adaptada al patrón real del proyecto):
```javascript
// Movimiento origen: tipo T, cantidad negativa (salida del origen)
await request
    .input('albTipT', sql.Char(1), 'T')
    .input('albUbiOri', sql.VarChar, ubiOri)
    .query(`INSERT INTO ALBARANCS (ALBARTCOD, ALBTIP, ALBUBI, ALBLOT, ALBCAN, ALBFEC, ...)
            VALUES (@cod, @albTipT, @albUbiOri, @lot, -@cant, ...)`);

// Movimiento destino: tipo T, cantidad positiva (entrada al destino)
await request
    .input('albUbiDes', sql.VarChar, ubiDes)
    .query(`INSERT INTO ALBARANCS (ALBARTCOD, ALBTIP, ALBUBI, ALBLOT, ALBCAN, ALBFEC, ...)
            VALUES (@cod, @albTipT, @albUbiDes, @lot, @cant, ...)`);
```

**Resultado**: los traspasos generarán dos movimientos tipo `T` en ALBARANCS
(uno de salida del origen, uno de entrada al destino), visibles en el timeline
de Movimientos por Artículo.

**Tests**: añadir casos de test para verificar los INSERTs en ALBARANCS.
Meta: ≥ 80 tests pasando (actualmente 80/80).

---

## 17. Archivos Exactos

### Archivos nuevos a crear

| Tipo | Ruta | Notas |
|------|------|-------|
| HTML | `frontend/pages/opciones/almacen-y-stock/traspasos/index.html` | Shell FASE 1, 4 niveles arriba |
| CSS  | `frontend/css/opciones/almacen-y-stock/traspasos/index.css` | Namespace `tp-` |
| JS   | `frontend/js/opciones/almacen-y-stock/traspasos.js` | IIFE, createElement |

### Archivos a modificar

| Archivo | Ruta | Cambio |
|---------|------|--------|
| Sidebar | `frontend/js/ui/sidebar.js` | Actualizar href: `pages/ferreteria/traspasos.html` → `pages/opciones/almacen-y-stock/traspasos/index.html` |
| Backend | `backend/routes/movimientos.routes.js` | Añadir INSERTs ALBARANCS en POST /traspaso |
| FASE 4C HTML | `frontend/pages/opciones/almacen-y-stock/movimientos-por-articulo/index.html` | Corregir path del CSS: `mv.css` → `../../../../css/opciones/almacen-y-stock/movimientos-por-articulo/mv.css` |

### Archivos legacy (NO tocar)

| Archivo | Ruta |
|---------|------|
| HTML legacy | `frontend/pages/ferreteria/traspasos.html` |
| CSS legacy | `frontend/css/ferreteria/traspasos.css` |
| JS legacy | `frontend/js/ferreteria/traspasos.js` |

---

## 18. CSS — Especificación Completa (namespace `tp-`)

**Ruta**: `frontend/css/opciones/almacen-y-stock/traspasos/index.css`
**Variables**: todas de `--sga-*` (FASE 1). Sin colores hardcoded excepto los
específicos del flujo de traspaso (origen rojo, destino verde).

### Secciones

```css
/* Layout principal */
.tp-inner               /* max-width: 1280px, padding: 28px 32px 48px */
.tp-header-row          /* flex, justify-content: space-between, align-items: flex-start */
.tp-workspace           /* display: grid; grid-template-columns: 1fr 300px; gap: 24px */

/* Barra de búsqueda */
.tp-search-bar          /* flex, gap, align-items: flex-end */
.tp-search-group        /* flex-column, label + input */
.tp-search-input        /* input artículo */
.tp-search-btn          /* sga-btn primary sm */

/* Lista de stock origen */
.tp-stock-section       /* sección con título */
.tp-stock-list          /* display: flex; flex-direction: column; gap: 8px */
.tp-stock-card          /* button, grid 3 col, border-left: 4px solid, cursor: pointer */
.tp-stock-card--active  /* border-left-color: var(--sga-accent); background: #eff6ff */
.tp-stock-card--zero    /* opacity: 0.5; cursor: not-allowed; pointer-events: none */
.tp-stock-card-ubi      /* font-weight: 700; color: var(--sga-primary) */
.tp-stock-card-lot      /* color: var(--sga-text-muted); font-size: .8125rem */
.tp-stock-card-qty      /* text-align: right; font-weight: 600; color: var(--sga-success) */

/* Zona destino */
.tp-dest-zone           /* sección destino + cantidad + botón añadir */
.tp-dest-group          /* label + input + hint */
.tp-dest-input          /* input ubicación destino */
.tp-dest-error          /* mensaje de error inline, color: var(--sga-danger) */
.tp-qty-group           /* label + input + hint */
.tp-qty-input           /* input cantidad, text-align: right, max-width: 100px */
.tp-qty-hint            /* "/ 200 disponibles", color: var(--sga-text-muted) */
.tp-add-btn             /* sga-btn primary, full-width en móvil */

/* Panel resumen */
.tp-panel               /* sticky desktop / overlay tablet / bottom-sheet móvil */
.tp-panel--open         /* panel visible (tablet + móvil) */
.tp-panel-header        /* header del panel con título y botón cerrar */
.tp-panel-empty         /* estado vacío */
.tp-panel-body          /* contenedor de líneas */
.tp-panel-footer        /* botón confirmar */
.tp-linea               /* tarjeta de una línea en el carrito */
.tp-linea-art           /* código + nombre artículo */
.tp-linea-route         /* "UBI-A01 → UBI-B02" */
.tp-linea-lot           /* "Lote: LOT001 · 50 ud" */
.tp-linea-remove        /* botón × */
.tp-confirm-btn         /* sga-btn primary, full-width */
.tp-panel-backdrop      /* fixed overlay semitransparente */

/* Estados */
.tp-placeholder         /* estado inicial / sin búsqueda */
.tp-placeholder-icon    /* icono grande */
.tp-loading             /* estado cargando */
.tp-error               /* estado error de red */
.tp-empty               /* estado sin resultados */

/* Modal de resultado */
.tp-result-overlay      /* fixed, z-index alto, fondo semitransparente */
.tp-result-modal        /* tarjeta centrada, max-width: 500px */
.tp-result-line         /* una línea de resultado */
.tp-result-line--ok     /* color: var(--sga-success) */
.tp-result-line--err    /* color: var(--sga-danger) */
.tp-result-close        /* botón cerrar modal */
```

---

## 19. JS — Especificación Completa

**Ruta**: `frontend/js/opciones/almacen-y-stock/traspasos.js`
**Patrón**: IIFE `(function(){ "use strict"; ... })()`, `createElement` only.

### Estado

```javascript
var _articulo      = '';    // código artículo buscado
var _stockRows     = [];    // filas de stock devueltas por consultaStock.list
var _selectedOrigen = null; // { cod, nombre, ubiOri, lot, disponible }
var _lineas        = [];    // líneas añadidas al carrito
var _loading       = false; // flag búsqueda en curso
var _sending       = false; // flag envío en curso
```

### Helpers

```javascript
function fmt(n)        // Number(n??0).toLocaleString('es-ES')
function dash(v)       // v != null ? String(v) : '—'
function val(id)       // getElementById(id).value.trim()
function setEl(id, fn) // getElementById(id) && fn(el)
```

### Funciones principales

```javascript
// BÚSQUEDA
function buscarStock()
// Lee val('tp-f-articulo'), llama SGA.consultaStock.list({articulo, solo_existencias:'1'})
// onSuccess → renderStockList(rows)
// onError → renderStockError()

function renderStockList(rows)
// _stockRows = rows
// Si vacío → renderStockEmpty()
// Construye cards con createElement, evita innerHTML con datos

// SELECCIÓN ORIGEN
function selectOrigen(idx)
// _selectedOrigen = { cod, nombre, ubiOri, lot, disponible } from _stockRows[idx]
// Marca .tp-stock-card--active, quita de las demás

// VALIDACIÓN Y CARRITO
function validateLinea()
// Retorna { ok: bool, errors: { campo: mensaje } }

function addLinea()
// validateLinea() → mostrar errores inline o push a _lineas
// renderLineas(), updatePanelBadge(), resetDestForm()

function removeLinea(idx)
// _lineas.splice(idx, 1), renderLineas(), updatePanelBadge()

function renderLineas()
// Reconstruye .tp-panel-body con createElement

// PANEL
function openPanel()   // add tp-panel--open, add backdrop activo
function closePanel()  // remove tp-panel--open

// CONFIRMACIÓN
function confirmarTraspaso()
// Valida _lineas.length > 0
// Deshabilita botón, muestra spinner
// Loop secuencial: for await SGA.traspasos.save(linea)
// Acumula resultados: okList[], errList[]
// renderResultModal(okList, errList)

// RESULTADO
function renderResultModal(okList, errList)
// Construye modal con createElement
// Si todo OK → añade callback de limpieza al cerrar

// LIMPIEZA
function resetDestForm()  // limpia destino + cantidad + errores inline
function resetAll()       // reset completo, muestra placeholder

// PANEL BADGE
function updatePanelBadge() // actualiza contador en botón tablet/móvil
```

### Init

```javascript
document.addEventListener('DOMContentLoaded', function () {
    // URL param: ?articulo=XXX → rellena input + busca automáticamente
    // Listeners:
    //   #tp-btn-buscar click → buscarStock()
    //   #tp-f-articulo Enter → buscarStock()
    //   #tp-btn-add click → addLinea()
    //   #tp-btn-confirmar click → confirmarTraspaso()
    //   #tp-btn-vaciar click → resetAll()
    //   #btn-tp-panel-open click → openPanel() [tablet/móvil]
    //   #btn-tp-panel-close click → closePanel()
    //   #tp-panel-backdrop click → closePanel()
    //   Escape → closePanel()
});
```

---

## 20. HTML — Estructura de `index.html`

**Ruta**: `frontend/pages/opciones/almacen-y-stock/traspasos/index.html`

### CSS cargados (patrón FASE 4A/4B)
```html
<link rel="stylesheet" href="../../../../css/base.css">
<link rel="stylesheet" href="../../../../css/layout.css">
<link rel="stylesheet" href="../../../../css/sidebar.css">
<link rel="stylesheet" href="../../../../css/header.css">
<link rel="stylesheet" href="../../../../css/buttons.css">
<link rel="stylesheet" href="../../../../css/forms.css">
<link rel="stylesheet" href="../../../../css/badges.css">
<link rel="stylesheet" href="../../../../css/responsive.css">
<link rel="stylesheet" href="../../../../css/opciones/almacen-y-stock/traspasos/index.css">
```

### Scripts
```html
<script src="../../../../js/api.js"></script>
<script src="../../../../js/ui/sidebar.js"></script>
<script src="../../../../js/ui/layout.js"></script>
<script src="../../../../js/opciones/almacen-y-stock/traspasos.js"></script>
```

### IDs necesarios para JS

```
tp-f-articulo         input búsqueda artículo
tp-btn-buscar         botón buscar
tp-stock-list         contenedor de cards stock origen
tp-dest-input         input ubicación destino
tp-dest-error         span error inline destino
tp-qty-input          input cantidad
tp-qty-hint           span "/ N disponibles"
tp-qty-error          span error inline cantidad
tp-btn-add            botón añadir línea
tp-panel              aside panel resumen
tp-panel--open        clase activadora (no ID)
tp-panel-body         contenedor de líneas en panel
tp-panel-empty        estado vacío del panel
tp-panel-backdrop     div backdrop
btn-tp-panel-open     botón abrir panel (tablet/móvil)
btn-tp-panel-close    botón cerrar panel
tp-btn-confirmar      botón confirmar traspaso (en panel)
tp-btn-vaciar         botón vaciar todo (en header)
tp-result-overlay     overlay modal resultado
```

### Enlace legacy
```html
<a href="../../../../pages/ferreteria/traspasos.html" class="tp-link-legacy">
    Ver versión clásica
</a>
```

---

## 21. Tareas de Implementación

### T1 — Preparación (20 min)
- [ ] Leer `backend/routes/movimientos.routes.js` completo para obtener los nombres
      exactos de columnas de ALBARANCS usados en entrada/salida.
- [ ] Añadir INSERTs en ALBARANCS dentro de la transacción de `POST /traspaso`
      (movimiento origen tipo T negativo + movimiento destino tipo T positivo).
- [ ] Actualizar/añadir tests para los nuevos INSERTs. Verificar ≥ 80 tests pasando.
- [ ] Corregir bug FASE 4C: en `movimientos-por-articulo/index.html` cambiar
      `href="mv.css"` por `href="../../../../css/opciones/almacen-y-stock/movimientos-por-articulo/mv.css"`.
- [ ] Actualizar `sidebar.js` línea ~26: cambiar href a nueva ruta de traspasos.

### T2 — CSS (45 min)
- [ ] Crear directorio `frontend/css/opciones/almacen-y-stock/traspasos/`.
- [ ] Crear `index.css` con todas las clases especificadas en §18.
- [ ] Layout 2 col desktop, overlay tablet, bottom-sheet móvil.
- [ ] Stock cards con estados: normal, activo, zero.
- [ ] Panel resumen con scroll interno.
- [ ] Modal de resultado.
- [ ] Verificar que no hay colores hardcoded salvo los justificados
      (origen = `--sga-danger`, destino = `--sga-success`).

### T3 — HTML (15 min)
- [ ] Crear directorio `frontend/pages/opciones/almacen-y-stock/traspasos/`.
- [ ] Crear `index.html` con shell FASE 1.
- [ ] Breadcrumb: `Inicio › Traspasos entre ubicaciones`.
- [ ] Zona principal: búsqueda, lista stock, destino, cantidad, botón añadir.
- [ ] Panel lateral: header, body (vacío inicial), footer (botón confirmar).
- [ ] Backdrop, overlay resultado.
- [ ] Enlace "Ver versión clásica".
- [ ] Verificar que todos los IDs del §20 están presentes.

### T4 — JS (90 min)
- [ ] Crear `frontend/js/opciones/almacen-y-stock/traspasos.js` como IIFE.
- [ ] Implementar todas las funciones del §19.
- [ ] URL param `?articulo=`: rellenar input + auto-buscar en DOMContentLoaded.
- [ ] Validaciones inline: sin `alert()`, sin `confirm()`, sin `prompt()`.
- [ ] Modal de resultado con `createElement`.
- [ ] Verificar que cero usos de `innerHTML` con datos de usuario.
- [ ] Verificar que el payload enviado al backend coincide exactamente con
      `{ cod, ubiOri, ubiDes, lot, cant }`.

### T5 — Verificación Final (15 min)
- [ ] Ejecutar `npx jest --no-coverage` desde `backend/` → ≥ 80/80 pasando.
- [ ] Verificar que los 4 archivos nuevos existen.
- [ ] Verificar que legacy en `ferreteria/traspasos.html` sigue intacto.
- [ ] Verificar en browser: buscar artículo → cards de stock → seleccionar →
      añadir → resumen → confirmar → movimientos aparecen en FASE 4C.

---

## 22. Verificaciones Manuales

1. Buscar artículo con stock → cards de stock aparecen con ubicacion, lote, cantidad.
2. Buscar artículo sin stock → mensaje "Sin stock disponible".
3. Buscar artículo inexistente → mensaje apropiado (sin stock o error).
4. Click en card → se marca con borde azul; las otras se desmarcan.
5. Click en segunda card → la primera se desmarca.
6. Destino = origen → error inline "debe ser diferente".
7. Cantidad > disponible → error inline con cantidad máxima.
8. Cantidad = 0 → error inline.
9. Cantidad vacía → error inline.
10. Añadir línea válida → aparece en panel resumen.
11. Eliminar línea del resumen → desaparece; badge actualizado.
12. Confirmar con carrito vacío → error inline.
13. Confirmar 1 línea válida → backend responde 200 → modal de éxito.
14. Confirmar 3 líneas → todas procesadas → modal con 3 líneas ✓.
15. Stock insuficiente en servidor (409) → modal muestra la línea fallida con ✗.
16. Después del traspaso → abrir Movimientos por Artículo → tipo T aparece en timeline.
17. URL `?articulo=ART001` → input relleno + búsqueda automática al cargar.
18. Botón "Ver versión clásica" → carga `ferreteria/traspasos.html`.
19. Sidebar → enlace apunta a nueva pantalla moderna.
20. Panel overlay abre/cierra en tablet correctamente.
21. Bottom sheet abre/cierra en móvil correctamente.
22. Backdrop click → cierra panel.
23. Tecla Escape → cierra panel.
24. "Vaciar todo" → limpia búsqueda, stock, carrito, formulario.
25. Tests backend: ≥ 80 pasando tras cambios en movimientos.routes.js.
26. CSS FASE 4C (movimientos): verificar que la pantalla de movimientos carga
    con estilos correctos tras el fix del path.

---

## 23. Criterios de Éxito

- [ ] Operador puede ver stock real por ubicación/lote antes de traspasar.
- [ ] El sistema valida cantidad ≤ disponible antes de confirmar.
- [ ] El sistema valida destino ≠ origen.
- [ ] El traspaso genera registros en ALBARANCS (tipo T — entrada y salida).
- [ ] El traspaso aparece en el timeline de Movimientos por Artículo (FASE 4C).
- [ ] La pantalla legacy `ferreteria/traspasos.html` sigue accesible.
- [ ] No hay `alert()`, `confirm()`, `prompt()` en el nuevo JS.
- [ ] No hay `innerHTML` con datos de usuario en el nuevo JS.
- [ ] Tests: ≥ 80 pasando.
- [ ] La pantalla funciona correctamente en desktop, tablet y móvil.
- [ ] Sin regresiones en dashboard, consulta stock, entradas, salidas, movimientos.

---

## 24. Riesgos Detectados

### R1 — Nombres de columnas ALBARANCS desconocidos ★★★
**Nivel**: ALTO  
**Descripción**: El plan usa nombres conceptuales para los INSERTs en ALBARANCS.
Los nombres reales deben verificarse leyendo los endpoints de entrada/salida.  
**Mitigación**: En T1, leer `movimientos.routes.js` completo y copiar exactamente
el patrón de INSERT usado en `POST /entrada` y `POST /salida`.

### R2 — Stock puede cambiar entre búsqueda y confirmación ★★
**Nivel**: MEDIO  
**Descripción**: El operario selecciona un origen con 200 ud, pero en el momento
de confirmar otro proceso puede haber reducido el stock. El frontend mostraría
200 disponibles pero el backend rechazaría con 409.  
**Mitigación**: El backend ya maneja este caso con 409. El frontend mostrará
el mensaje de error claramente. No requiere solución adicional en FASE 4D.

### R3 — Ubicación destino inexistente crea stock "fantasma" ★★
**Nivel**: MEDIO  
**Descripción**: Si el operario escribe una ubicación destino que no existe en
la tabla UBICACIONES, el INSERT en STOCK creará stock en una ubicación no
registrada. El sistema lo permite (comportamiento actual del backend).  
**Mitigación**: Advertencia visible en UI. Para FASE 4D se acepta. Un selector
de ubicaciones validas es mejora futura.

### R4 — Traspasos parcialmente fallidos en lote multi-línea ★★
**Nivel**: MEDIO  
**Descripción**: Al confirmar 3 líneas, si la 2ª falla (409), las líneas 1 y 3
pueden ejecutarse sin rollback global.  
**Mitigación**: El modal de resultado muestra exactamente qué líneas se
ejecutaron (✓) y cuáles fallaron (✗). El operario tiene información completa
para actuar. Para rollback global se necesitaría un endpoint `/traspasos` batch
con transacción multi-línea (mejora futura).

### R5 — Sin cambio de lote en traspaso ★
**Nivel**: BAJO  
**Descripción**: El backend usa el mismo `lot` para origen y destino.  
**Mitigación**: Comportamiento documentado en UI con nota informativa.

---

## 25. Exclusiones Futuras

- Selector visual/autocompletado de ubicaciones destino.
- Cambio de lote en traspaso (lote destino ≠ lote origen).
- Endpoint `/traspasos` (plural) con transacción multi-línea y rollback global.
- Operario y motivo persistidos en ALBARANCS o tabla de auditoría.
- Picking visual con zonas de almacén.
- Traspasos entre almacenes (multi-almacén).
- Traspaso a zona de cuarentena con bloqueo de artículo.
- Confirmación de recepción en destino (traspaso bidireccional con ACK).
- PDF de albarán de traspaso.
- Bloqueo de ubicación concurrente (mutex distribuido).
- Historial de traspasos del operario.

---

## 26. Recomendaciones Arquitectónicas

1. **Endpoint `/traspasos` (plural)**: crear un endpoint que acepte un array de
   líneas y las ejecute en una única transacción SQL. Esto elimina el riesgo R4
   (traspasos parciales) y simplifica el frontend a una sola llamada. Candidato
   para FASE 5.

2. **Selector de ubicaciones como componente compartido**: cuando se implemente,
   reutilizable en traspasos, entradas y salidas. Requiere un endpoint
   `GET /ubicaciones` eficiente (ya existe en `api.js`).

3. **Campos operario y motivo en ALBARANCS**: la auditoría completa requeriría
   extender ALBARANCS o crear una tabla auxiliar. La identidad del operario
   debería venir de sesión/cabecera HTTP, no de un campo manual (facilita
   suplantación). Candidato para FASE de seguridad/usuarios.

4. **Unificación del patrón de payload**: el endpoint `/traspaso` debería
   seguir el mismo patrón que `/entrada` y `/salida` (incluyendo campos de
   auditoría). Refactorizar al crear el endpoint plural en FASE 5.

5. **URL param `?articulo=`**: igual que Movimientos por Artículo, la pantalla
   de Consulta de Stock puede enlazar directamente a Traspasos con el artículo
   prefiltrado. Añadir este enlace en la pantalla de consulta stock en una fase
   posterior.

---

## Apéndice — Relación con Otras FASES

| FASE | Relación |
|------|----------|
| FASE 1 | CSS base (`--sga-*`), layout, sidebar |
| FASE 2 | Dashboard: los traspasos afectarán los KPIs de movimientos del día |
| FASE 3 | Consulta de stock: `SGA.consultaStock.list()` reutilizado para el selector de origen |
| FASE 4A/4B | Patrón visual y técnico de referencia (carrito, confirmación, responsive) |
| FASE 4C | Los traspasos aparecerán en el timeline tras añadir INSERTs en ALBARANCS |
| FASE 5+ | Endpoint plural, selector de ubicaciones, auditoría de operarios |
