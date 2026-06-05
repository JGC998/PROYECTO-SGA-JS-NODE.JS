# FASE 4B — Salida de Mercancía Moderna

> **Estado:** PLANIFICADO — NO implementar hasta instrucción explícita
> **Objetivo:** Transformar la salida de mercancía en un flujo operativo moderno, guiado y seguro
> **Archivos permitidos (legacy a conservar):** `frontend/pages/ferreteria/salidas.html`, `frontend/js/ferreteria/salidas.js`, `frontend/css/ferreteria/salidas.css`
> **Backend:** No tocar salvo que el plan demuestre imprescindibilidad (ver Sección 9 y Sección 22)

---

## 1. Diagnóstico UX de la pantalla actual

Pantalla analizada: `frontend/pages/ferreteria/salidas.html` + `frontend/js/ferreteria/salidas.js`

### Problemas críticos (rompen la operación completamente)

| # | Problema | Detalle técnico |
|---|----------|-----------------|
| C1 | **Payload incorrecto** | `registrarSalida()` envía `{fecha, operario, destino, ot, lineas[]}` al endpoint `POST /salida`. El backend ignora todo y solo lee `{cod, ubi, lot, cant}` → **todas las salidas fallan silenciosamente**. La operación nunca llega a registrarse en la base de datos. |
| C2 | **Sin campo ubicación origen** | `agregarLinea()` añade `ubicacion: ''` (siempre vacío). El backend requiere `ubi` no vacío → toda salida devuelve 400. El campo nunca fue implementado en el form. |
| C3 | **Sin campo lote** | No existe selector de lote. El backend requiere `lot` no vacío. La operación siempre falla. |
| C4 | **Validación de stock errónea** | `buscarArticulo()` calcula stock total sumando todas las ubicaciones y lotes. El backend valida stock en la combinación exacta `(cod, ubi, lot)`. Una validación frontend de "disponible: 200" puede pasar pero el backend devuelve 400 si la ubi/lot concreta tiene solo 5 unidades. |

### Problemas graves (UX rota o riesgo de errores)

| # | Problema | Detalle técnico |
|---|----------|-----------------|
| G1 | **Sin sistema de diseño FASE 1** | La página usa `css/navegacion.css` (legacy pre-FASE 1). Sin variables `--sga-*`, sin layout `sga-layout`, sin sidebar dinámico. Visualmente desconectada del resto del sistema. |
| G2 | **XSS en renderLineas()** | `tbody.innerHTML = lineas.map(l => \`...\${l.articulo}...\${l.nombre}...\`)` — datos de usuario inyectados en `innerHTML` sin escape. |
| G3 | **Variables globales** | `lineas` y `lineaIdx` son `const`/`let` en scope global. Polución del objeto `window`. |
| G4 | **Errores silenciosos** | `catch { alert('Error al registrar la salida.') }` — sin distinción entre 400 (stock insuficiente), 500 (error servidor), o fallo de red. El usuario no sabe qué corregir. |
| G5 | **Sin gestión de foco/teclado** | Ningún campo tiene Enter→siguiente. No hay atajos de teclado. Inutilizable en terminal logística con teclado físico. |
| G6 | **"Registrar Salida" en cabecera** | Botón de confirmación en la toolbar superior, lejos visualmente de las líneas acumuladas. UX antiintuitiva. |
| G7 | **Sin validación de cantidad** | `agregarLinea()` no impide `cant <= 0` ni `cant = NaN`. Solo comprueba `cant > stock` pero con el stock total incorrecto. |
| G8 | **Flujo incompleto: operario/destino inútiles** | El backend no almacena ni usa `operario`, `destino`, ni `ot`. Los campos del formulario no tienen efecto real. |

### Problemas menores

| # | Problema |
|---|----------|
| M1 | Sin breadcrumb |
| M2 | Sin botón "Limpiar" con confirmación |
| M3 | Sin estado de carga durante operaciones async |
| M4 | `sal-op-cod` usa `change` (requiere perder foco), no `blur`+`Enter` |
| M5 | Tabla de líneas sin columna lote |
| M6 | Sin zona de resultados post-confirmación |
| M7 | Sin responsive mobile |

### Veredicto

La pantalla legacy de salidas es **completamente no funcional**. Ninguna salida real puede registrarse con ella debido a los problemas C1, C2 y C3. La nueva pantalla debe construirse desde cero siguiendo el patrón FASE 4A.

---

## 2. Causas de los fallos actuales

**Causa raíz:** Desconexión total entre el contrato de la API backend y la implementación frontend.

- El backend (`movimientos.routes.js:81-97`) espera una operación atómica simple: una línea, cuatro campos.
- El frontend legacy asumió un modelo "cabecera + líneas" estilo ERP (un albaran con múltiples artículos enviado en un solo POST), que el backend nunca implementó.
- La UI fue diseñada antes de que existiera el endpoint real, o el endpoint cambió sin actualizar el frontend.
- El campo `ubi` es **estructuralmente imprescindible** porque el stock se almacena por `(cod, ubi, lot)`, pero el formulario legacy nunca lo incluyó.
- El lote es igualmente imprescindible por la misma razón, y tampoco se incluyó.

---

## 3. Endpoint real usado

```
POST /salida
Host: http://localhost:3000
Content-Type: application/json
```

Implementación en: `backend/routes/movimientos.routes.js` líneas 81-97.

Wrapper frontend disponible en `api.js`:
```javascript
SGA.salidas.save(data)  // → _post('/salida', data)
```

---

## 4. Payload esperado

```json
{
  "cod":  "ART001",     // string, requerido, no vacío — código de artículo
  "ubi":  "EST-A1-01",  // string, requerido, no vacío — código de ubicación origen
  "lot":  "LOT-2024",   // string, requerido, no vacío — código de lote ("SL" para sin lote)
  "cant": 5             // number, requerido, > 0 — cantidad a retirar
}
```

**Respuestas:**

| HTTP | Body | Condición |
|------|------|-----------|
| 200 OK | `{"success":true,"message":"Salida confirmada"}` | Operación correcta |
| 400 Bad Request | `{"error":"Los campos cod, ubi y lot son obligatorios"}` | Campos vacíos |
| 400 Bad Request | `{"error":"La cantidad debe ser un número mayor que 0"}` | Cantidad inválida |
| 400 Bad Request | `{"success":false,"message":"Stock insuficiente"}` | Stock < cant en esa ubi/lot |
| 500 Internal | `{"success":false,"message":"Error interno del servidor"}` | Error SQL |

**Nota sobre inconsistencia de HTTP:** `/salida` devuelve **400** para stock insuficiente, mientras que `/traspaso` devuelve **409 Conflict** (semánticamente más correcto). Esto afecta al mapeo de errores en el frontend. Ver Sección 9 y Sección 22.

**Comportamiento de la operación SQL:**
```sql
-- 1. Comprueba stock disponible en la combinación exacta (cod, ubi, lot)
SELECT STOCAN FROM STOCK 
WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot

-- Si no existe registro o STOCAN < @cant → 400

-- 2. Descuenta stock
UPDATE STOCK SET STOCAN = STOCAN - @cant 
WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot
```

**Implicación crítica:** La salida no crea registros, solo modifica existentes. Si la combinación `(cod, ubi, lot)` no existe en STOCK, la operación falla con "Stock insuficiente".

---

## 5. Flujo operativo recomendado

La **diferencia fundamental** respecto a entrada: en salida no se puede escribir ubicación+lote libremente. El stock existe en combinaciones específicas `(ubi, lot)`. El usuario debe **seleccionar** de lo que existe, no inventar.

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUJO SALIDA FASE 4B                     │
└─────────────────────────────────────────────────────────────┘

Paso 1: ARTÍCULO
  → Usuario escribe código en #sm-art-cod
  → Enter o blur → SGA.articulos.get(cod)
  → Éxito: pill verde "✓ Nombre del artículo"
  → No encontrado: pill naranja "⚠ Artículo no encontrado"
    (bloquea avance — no se puede crear artículo en salida)

Paso 2: SELECTOR DE STOCK (clave diferencial FASE 4B)
  → Al resolver artículo → llamar SGA.stock.get(cod)
  → Muestra tabla de líneas de stock disponibles:
      [UBI001 · LOT-A · 150 ud]  ← clickable / seleccionable
      [UBI002 · SL    ·  30 ud]  ← clickable / seleccionable
  → Si no hay stock → mensaje "Sin stock disponible" + bloqueo
  → Usuario hace clic en una línea → se selecciona (highlight)
  → ubi, lot y disponible se fijan automáticamente

Paso 3: CANTIDAD
  → Input numérico activado con el valor máximo (disponible) visible
  → Stepper −/+ (mín 0.001, máx = disponible)
  → Validación en tiempo real: si cant > disponible → color rojo + aviso
  → Enter → validarYAñadir()

Paso 4: AÑADIR AL CARRITO
  → Validaciones superadas → línea va al carrito
  → Limpiar artículo → foco vuelve a #sm-art-cod
  → Lista de stock se vacía (hasta nuevo artículo)

Paso 5: CONFIRMAR SALIDA
  → Botón "Confirmar salida ▶" (activo si carrito > 0 líneas)
  → Promise.allSettled(lineas.map(saveLinea))
  → Una llamada POST /salida por línea del carrito
  → Mostrar zona de resultados (éxito/error por línea)
  → Líneas con error permanecen en carrito para reintentar
```

---

## 6. Estructura visual completa

```
sga-layout
└── sga-main
    ├── sga-header
    │   ├── [hamburger] [breadcrumb: Inicio › Opciones › Salida de Mercancía]
    │   └── [Limpiar (F5)]
    │
    └── sga-content
        └── sm-inner (max-width: 1200px)
            │
            ├── sm-page-header
            │   └── h1 "Salida de Mercancía" + p "Retirada de stock · SGA LIN"
            │
            ├── sm-workspace  (grid: form | carrito — igual que FASE 4A)
            │   │
            │   ├── sm-form  (izquierda)
            │   │   ├── "Salida rápida"
            │   │   │
            │   │   ├── fg-articulo
            │   │   │   ├── #sm-art-cod (input texto grande)
            │   │   │   ├── #btn-art-clear (×, hidden)
            │   │   │   └── #sm-art-pill (hidden)
            │   │   │
            │   │   ├── fg-stock-selector  ← NUEVO / clave
            │   │   │   ├── "Stock disponible"
            │   │   │   ├── #sm-stock-lista (div con líneas clickables)
            │   │   │   │   └── .sm-stock-item [UBI · LOT · CANT ud] (×N)
            │   │   │   └── #sm-stock-empty (hidden, "Sin stock disponible")
            │   │   │
            │   │   ├── fg-cantidad  (visible solo tras selección de línea)
            │   │   │   ├── .sm-disponible-tag "Disponible: X ud"
            │   │   │   ├── [−] #sm-cant [+]
            │   │   │   └── #sm-cant-warn (hidden, "Supera el stock disponible")
            │   │   │
            │   │   ├── #sm-form-status (hidden)
            │   │   │
            │   │   └── sm-form-actions
            │   │       └── #btn-anadir "+ Añadir línea" (disabled hasta selección válida)
            │   │
            │   └── sm-carrito  (derecha, sticky desktop)
            │       ├── "Carrito de salida" + #sm-carrito-count "0 líneas"
            │       ├── #sm-carrito-body
            │       │   └── #sm-carrito-empty "Añada artículos..."
            │       ├── #sm-carrito-totales
            │       └── #btn-confirmar "Confirmar salida ▶" (disabled)
            │
            └── sm-results  (hidden, aparece tras confirmación)
                ├── #sm-results-header
                ├── #sm-results-lines
                └── sm-results-footer
                    ├── #btn-nueva-salida "Nueva salida"
                    └── #link-ver-stock "Ver stock ↗"
```

---

## 7. Campos obligatorios

| Campo | ID | Tipo | Requerido | Fuente |
|-------|-----|------|-----------|--------|
| Artículo | `#sm-art-cod` | text input | Sí | Usuario escribe |
| Ubicación origen | automático | interno | Sí | Selección de stock |
| Lote | automático | interno | Sí | Selección de stock |
| Cantidad | `#sm-cant` | number input | Sí | Usuario escribe/stepper |

Los campos `ubi` y `lot` **no los escribe el usuario**: se obtienen automáticamente al seleccionar una línea del stock selector. Esto elimina errores de tipeo y garantiza que la combinación (cod, ubi, lot) existe en la BD.

---

## 8. Validaciones frontend

### Paso artículo
- `cod` no vacío antes de lanzar búsqueda
- Si artículo no encontrado → pill naranja → `#btn-anadir` deshabilitado
- Si `SGA.stock.get(cod)` devuelve array vacío o todos con `STOCAN <= 0` → mensaje "Sin stock disponible" → bloqueo

### Paso selector de stock
- Solo se puede seleccionar una línea a la vez (highlight exclusivo)
- Al seleccionar, se captura: `_selectedUbi`, `_selectedLot`, `_disponible`
- Campo `#sm-cant` se activa y fija `max = _disponible`

### Paso cantidad
- `cant` debe ser número finito
- `cant > 0` (mínimo 0.001)
- `cant <= _disponible` → si no, aviso visual inmediato (borde rojo + texto "Supera disponible")
- Botón `#btn-anadir` se deshabilita si `cant > _disponible` o cant no válido

### Paso añadir
- `validarLinea()` verifica: art no vacío, ubi no vacío, lot no vacío, cant > 0, cant ≤ disponible
- Si pasa → `agregarLinea()` → limpiar formulario → foco a `#sm-art-cod`

### Lógica "SIN LOTE"
- Si `_selectedLot` viene como `"SL"` del stock selector, el campo no se muestra al usuario pero se pasa correctamente al backend
- La etiqueta de la línea de stock mostrará "Sin lote" en lugar de "SL"

---

## 9. Validaciones backend deseables

El backend actual (`POST /salida`) ya tiene validaciones suficientes para operar correctamente:
- Campos `cod`, `ubi`, `lot` no vacíos → 400
- `cant > 0` → 400
- `STOCAN >= cant` en la combinación exacta → 400

**Mejora deseable pero no obligatoria para FASE 4B:**

La inconsistencia semántica donde `/salida` devuelve **400** para "Stock insuficiente" mientras `/traspaso` devuelve **409** no es un bloqueo. El frontend puede mapear ambos códigos de error en su función `saveLinea()`. Si en el futuro se normaliza a 409, solo hay que actualizar el mapeo frontend.

**El backend no necesita cambios para que FASE 4B funcione.** El único riesgo real (ausencia de transacción en /salida) afecta a concurrencia extrema, no a la operativa normal mono-usuario. Se documenta en Sección 22.

---

## 10. Control de stock disponible

### Fuente de datos
```javascript
SGA.stock.get(cod)
// GET /stock/{cod}
// Devuelve: [{STOUBI, STOLOT, STOCAN, UBINOM, UBIALMCOD}, ...]
```

### Reglas de presentación
1. Filtrar: solo mostrar líneas donde `STOCAN > 0`
2. Ordenar: por `STOCAN` descendente (primero las más llenas)
3. Mostrar: `STOUBI · STOLOT · STOCAN ud` (si STOLOT==="SL" → "Sin lote")
4. Si el array filtrado es vacío → "Sin stock disponible" + bloqueo

### Sincronización con backend
- El stock mostrado es una foto en el momento de la búsqueda del artículo
- El backend re-valida en el momento del POST (protección definitiva)
- Si entre foto y confirmación alguien sacó stock → backend devuelve 400 → frontend lo muestra como error de línea sin bloquear las demás

### No calcular stock total
- La pantalla legacy calculaba un stock total (suma) que era engañoso
- FASE 4B no mostrará un "total disponible" global — solo las líneas individuales
- Esto fuerza al usuario a seleccionar la ubicación concreta, que es la operativa correcta

---

## 11. Tratamiento de lote

| Caso | Comportamiento |
|------|---------------|
| Artículo con lotes reales | El selector muestra cada lote como línea separada. El usuario selecciona el lote concreto. |
| Artículo sin lote (`"SL"`) | El selector muestra "Sin lote" como texto visible pero internamente usa `"SL"`. El campo no se edita. |
| Varios lotes en misma ubicación | Aparecen como líneas separadas en el selector (una por cada combinación ubi+lot). |
| Lote en cuarentena | FASE 4B no aplica restricción de cuarentena (se delega a FASE futura si el backend implementa el flag). |

El lote **nunca se escribe manualmente** en FASE 4B. Siempre proviene de la selección del stock.

---

## 12. Selección de ubicación origen

La ubicación origen tampoco se escribe manualmente. Proviene de la línea de stock seleccionada.

**Diseño del selector de stock:**

```
┌──────────────────────────────────────────────────────┐
│ Stock disponible                                     │
├──────────────────────────────────────────────────────┤
│ ○ EST-A1-01 · LOT-2024-A    150 ud  [Estantería A1] │  ← .sm-stock-item
│ ○ EST-B2-03 · Sin lote       30 ud  [Estantería B2] │  ← .sm-stock-item
│ ○ CAMION-01 · LOT-2023-X      5 ud  [Camión 1]      │  ← .sm-stock-item
└──────────────────────────────────────────────────────┘
```

- Cada `.sm-stock-item` es un `<button>` para accesibilidad nativa (Enter/Space para seleccionar)
- Al seleccionar → añade clase `.sm-stock-item--selected` → highlight con `--sga-accent`
- Solo una línea puede estar seleccionada a la vez
- Click en otra línea → deselecciona la anterior + actualiza `_disponible` + resetea `#sm-cant`
- Selección implementada con `createElement`, no `innerHTML`

---

## 13. Carrito/resumen de salida

Mismo patrón que FASE 4A (`.em-carrito` → `.sm-carrito`).

**Estructura de cada línea en carrito:**
```
[Código artículo]  [Nombre truncado]
[EST-A1-01 · LOT-2024-A]           [×5 ud]   [🗑]
```

**Datos internos por línea:**
```javascript
{
  id:         1,            // índice interno para delete
  cod:        'ART001',     // código artículo
  nombre:     'Tornillo M8', // nombre artículo
  ubi:        'EST-A1-01',  // ubicación origen
  ubiNombre:  'Estantería A1', // nombre ubicación (display)
  lot:        'LOT-2024-A', // lote
  cant:       5,            // cantidad
  disponible: 150           // stock en el momento de añadir (referencia)
}
```

**Comportamiento del carrito:**
- `#sm-carrito-count` actualiza en tiempo real ("0 líneas", "1 línea", "3 líneas")
- `#btn-confirmar` habilitado si `_lineas.length > 0` y `!_sending`
- `#sm-carrito-totales` muestra: "Total: N artículos · M líneas"
- Botón 🗑 en cada línea → eliminar + re-render
- Carrito vacío → mostrar `#sm-carrito-empty`

---

## 14. Confirmación final

```javascript
async function confirmarSalida() {
    _sending = true;
    // deshabilitar btn-confirmar, mostrar spinner/estado
    
    const snap = [..._lineas]; // snapshot para no mutar durante envío
    const results = await Promise.allSettled(snap.map(saveLinea));
    
    // Separar éxitos y fallos
    const exitosos = snap.filter((_, i) => results[i].status === 'fulfilled');
    const fallidos = snap.filter((_, i) => results[i].status === 'rejected');
    
    // Eliminar exitosos del carrito (mantener fallidos)
    _lineas = _lineas.filter(l => fallidos.some(f => f.id === l.id));
    
    renderCarrito();
    renderResultados(snap, results);
    
    // Si quedan fallidos → habilitar "Reintentar fallidas ▶"
    // Si todo OK → mostrar zona sm-results completa
    _sending = false;
}

async function saveLinea(l) {
    try {
        await SGA.salidas.save({ cod: l.cod, ubi: l.ubi, lot: l.lot, cant: l.cant });
        return { ok: true };
    } catch (err) {
        // Mapear códigos de error a mensajes legibles
        const msg = err.message || '';
        if (msg.includes('400')) return Promise.reject('Stock insuficiente');
        if (msg.includes('409')) return Promise.reject('Stock insuficiente');
        if (msg.includes('500')) return Promise.reject('Error del servidor');
        return Promise.reject('Error de conexión');
    }
}
```

**Zona de resultados (`#sm-results`):**
- Aparece, `#sm-workspace` se oculta
- Cabecera: "Salida registrada — N de M líneas confirmadas"
- Lista por línea: ✓ verde (éxito) o ✗ rojo (fallo + motivo)
- Botón "Nueva salida" → `limpiarTodo()` → vuelve al formulario vacío
- Enlace "Ver stock ↗" → `../consulta-de-stock/index.html`

---

## 15. Mensajes de error/success

| Situación | Dónde | Estilo | Texto |
|-----------|-------|--------|-------|
| Artículo no encontrado | pill artículo | `--sm-pill--warn` | "⚠ Artículo no encontrado" |
| Sin stock disponible | `#sm-stock-empty` | badge rojo | "Sin stock disponible para este artículo" |
| Error al cargar stock | `#sm-stock-empty` | badge rojo | "Error al consultar stock. Reintente." |
| Cantidad > disponible | junto al input | texto rojo small | "Supera el stock disponible (X ud)" |
| Línea añadida OK | `#sm-form-status` | badge verde, 2s | "Línea añadida ✓" |
| Error línea en confirmación | resultado | ✗ rojo | Mensaje del backend mapeado |
| Éxito confirmación | cabecera resultados | banner verde | "X líneas confirmadas correctamente" |
| Error de red | resultado | ✗ rojo | "Error de conexión — compruebe la red" |
| Backend 400 stock insuficiente | resultado línea | ✗ rojo | "Stock insuficiente en la ubicación" |
| Backend 500 | resultado línea | ✗ rojo | "Error interno del servidor" |

---

## 16. Comportamiento responsive

```
≥ 1024px (desktop/tablet landscape)
  .sm-workspace → grid: 1fr 340px
  .sm-carrito → position: sticky, top: calc(var(--sga-header-h) + 16px)
  .sm-stock-lista → max-height: 280px, overflow-y: auto
  .sm-stock-item → padding 10px 14px

768px – 1023px (tablet portrait)
  .sm-workspace → grid: 1fr (stacked)
  .sm-carrito → max-height: 300px, overflow-y: auto
  .sm-stock-item → padding 12px 14px (táctil)

< 768px (móvil)
  .sm-inner → padding: 12px
  .sm-stock-item → min-height: 48px (objetivo táctil)
  .sm-stepper → 48×48px
  .sm-btn-add → height: 54px
  .sm-btn-confirm → height: 56px
```

**Navegación por teclado:**
- `Enter` en `#sm-art-cod` → buscar artículo
- `Arrow Down/Up` en la lista de stock → navegar entre `.sm-stock-item`
- `Enter` / `Space` en `.sm-stock-item` → seleccionar línea → foco a `#sm-cant`
- `Enter` en `#sm-cant` → `validarYAnadir()`
- `F5` → `limpiarTodo()` (con confirmación si hay líneas)
- `Escape` en `#sm-art-cod` → limpiar artículo y stock selector

---

## 17. Archivos exactos a crear/modificar

### CREAR (3 archivos nuevos)

```
frontend/pages/opciones/almacen-y-stock/salida-de-mercancia/index.html
frontend/css/opciones/almacen-y-stock/salida-de-mercancia/index.css
frontend/js/opciones/almacen-y-stock/salida-de-mercancia.js
```

La ruta sigue el patrón FASE 3 y FASE 4A:
```
frontend/pages/opciones/almacen-y-stock/[nombre-operacion]/index.html
```
Confirmado correcto. No hay conflicto con rutas existentes.

### MODIFICAR (2 archivos existentes)

```
frontend/js/ui/sidebar.js
  → Actualizar href "Salida de mercancía": 
    'pages/ferreteria/salidas.html'
    → 'pages/opciones/almacen-y-stock/salida-de-mercancia/index.html'

frontend/index.html
  → Actualizar href del acceso rápido "Salidas":
    'pages/ferreteria/salidas.html'
    → 'pages/opciones/almacen-y-stock/salida-de-mercancia/index.html'
```

### NO TOCAR (conservar legacy)
```
frontend/pages/ferreteria/salidas.html   ← conservar
frontend/js/ferreteria/salidas.js        ← conservar
frontend/css/ferreteria/salidas.css      ← conservar
backend/routes/movimientos.routes.js     ← NO TOCAR
```

---

## 18. CSS necesario

**Namespace:** `sm-` (salida mercancía). Sin colisión con `em-` (entrada mercancía).

**Archivo:** `frontend/css/opciones/almacen-y-stock/salida-de-mercancia/index.css`

**Colores: 100% variables `--sga-*` del sistema FASE 1. Cero valores hardcoded.**

### Secciones CSS

```css
/* Layout base */
.sm-inner           /* max-width: 1200px, flex column, gap 16px */
.sm-page-header     /* igual que .em-page-header */
.sm-workspace       /* grid, igual que FASE 4A */

/* Formulario */
.sm-form            /* panel izquierdo */
.sm-form-title      /* "Salida rápida" */
.sm-field-group     /* wrapper campo */
.sm-label           /* etiqueta */
.sm-input           /* input base */
.sm-input--lg       /* input ancho */
.sm-input--cant     /* input cantidad centrado, ancho fijo */
.sm-input--valid    /* borde: --sga-success */
.sm-input--invalid  /* borde: --sga-danger */
.sm-input--loading  /* texto muted */

/* Pill de artículo */
.sm-pill            /* badge resolución artículo */
.sm-pill--ok        /* verde: artículo encontrado */
.sm-pill--warn      /* naranja: artículo no encontrado */
.sm-pill--err       /* rojo */
.sm-pill--loading   /* muted: cargando */

/* Stock selector — elemento clave FASE 4B */
.sm-stock-selector         /* wrapper del selector */
.sm-stock-selector-label   /* "Stock disponible" */
.sm-stock-lista            /* contenedor scrollable de items */
.sm-stock-item             /* botón clickable por línea de stock */
.sm-stock-item--selected   /* estado seleccionado (highlight) */
.sm-stock-item:hover       /* hover */
.sm-stock-item-ubi         /* texto: código ubicación */
.sm-stock-item-lot         /* texto: lote */
.sm-stock-item-cant        /* texto: cantidad + "ud", negrita */
.sm-stock-item-ubiNom      /* texto: nombre ubicación, muted */
.sm-stock-empty            /* mensaje sin stock */

/* Campo cantidad */
.sm-cant-row        /* flex: [−] input [+] */
.sm-stepper         /* botones − y +, 40×40px (48 en mobile) */
.sm-disponible-tag  /* "Disponible: X ud", small, color accent */
.sm-cant-warn       /* "Supera disponible", small, rojo, hidden */

/* Estado form */
.sm-form-status     /* notificación inline */
.sm-form-status--ok    /* verde */
.sm-form-status--err   /* rojo */

/* Acciones */
.sm-form-actions    /* wrapper botón añadir */
.sm-btn-add         /* width 100%, 46px, --sga-primary */
.sm-btn-add:disabled

/* Carrito — igual estructura que FASE 4A */
.sm-carrito
.sm-carrito-header
.sm-carrito-title
.sm-carrito-badge
.sm-carrito-body
.sm-carrito-empty
.sm-carrito-line       /* línea en el carrito */
.sm-carrito-line-top   /* artículo + cantidad */
.sm-carrito-line-sub   /* ubi · lote, muted */
.sm-carrito-line-cant  /* cantidad, negrita */
.sm-btn-del            /* botón 🗑 eliminar línea */
.sm-carrito-footer
.sm-carrito-totales
.sm-btn-confirm        /* width 100%, 50px, --sga-success */
.sm-btn-confirm:disabled

/* Zona resultados */
.sm-results
.sm-results-header
.sm-results-lines
.sm-result-line        /* resultado por línea */
.sm-result-line--ok    /* verde */
.sm-result-line--err   /* rojo */
.sm-results-footer

/* Responsive (breakpoints) */
@media (min-width: 1024px)   /* desktop: grid 2 col, carrito sticky */
@media (max-width: 1023px)   /* tablet: columna única */
@media (max-width: 640px)    /* mobile: tactile targets */
```

**Estimación:** ~380-420 líneas CSS.

---

## 19. JS necesario

**Archivo:** `frontend/js/opciones/almacen-y-stock/salida-de-mercancia.js`

**Patrón:** IIFE `(function(){ "use strict"; ... })()` idéntico a FASE 4A.

### Estado interno (privado, no global)

```javascript
var _lineas      = [];    // líneas en el carrito
var _lineaIdx    = 0;     // contador para IDs internos
var _artState    = null;  // 'found' | 'notfound' | null
var _artNombre   = '';    // nombre artículo resuelto
var _stockLines  = [];    // array de líneas de stock disponibles
var _selectedIdx = -1;    // índice de línea de stock seleccionada
var _selectedUbi = '';    // ubi de la línea seleccionada
var _ubiNombre   = '';    // nombre de la ubicación seleccionada
var _selectedLot = '';    // lot de la línea seleccionada
var _disponible  = 0;     // stock disponible en línea seleccionada
var _sending     = false; // enviando confirmación
```

### Funciones principales

```javascript
// Helpers
function $(id) { return document.getElementById(id); }
function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
function txt(s) { return document.createTextNode(String(s == null ? '' : s)); }
function fmt(n) { return Number(n || 0).toLocaleString('es-ES'); }

// buscarArticulo()
//   blur/Enter en #sm-art-cod
//   → SGA.articulos.get(cod)
//   → éxito: pill--ok "✓ nombre", llamar cargarStock(cod)
//   → notfound: pill--warn "⚠ Artículo no encontrado"
//   → bloquear añadir si notfound

// cargarStock(cod)
//   → SGA.stock.get(cod)
//   → filtrar STOCAN > 0, ordenar desc
//   → si vacío: mostrar sm-stock-empty
//   → si items: renderStockSelector(lines)

// renderStockSelector(lines)
//   → limpiar #sm-stock-lista
//   → por cada línea: createElement button.sm-stock-item
//   → NUNCA innerHTML con datos de API (XSS)
//   → click handler: seleccionarLinea(idx)

// seleccionarLinea(idx)
//   → highlight .sm-stock-item--selected
//   → fijar _selectedUbi, _selectedLot, _disponible, _ubiNombre
//   → actualizar .sm-disponible-tag "Disponible: X ud"
//   → fijar #sm-cant.max = _disponible
//   → activar #sm-cant + foco
//   → resetear _artState a null para la cantidad
//   → llamar validarCantidad()

// validarCantidad()
//   → leer #sm-cant.value
//   → si cant <= 0 o NaN: deshabilitar #btn-anadir, ocultar warn
//   → si cant > _disponible: mostrar #sm-cant-warn, deshabilitar #btn-anadir
//   → si ok: habilitar #btn-anadir, ocultar warn

// validarLinea()
//   → checks: cod no vacío, _artState !== 'notfound', _selectedUbi no vacío,
//             _selectedLot no vacío, cant > 0, cant <= _disponible
//   → devuelve array de errores

// agregarLinea()
//   → validarLinea() → si errores: mostrar en #sm-form-status
//   → push a _lineas: {id, cod, nombre, ubi, ubiNombre, lot, cant, disponible}
//   → renderCarrito()
//   → limpiarFormRapido() → foco a #sm-art-cod

// limpiarFormRapido()
//   → vaciar #sm-art-cod, ocultar pill, vaciar stock lista
//   → resetear _artState, _stockLines, _selectedIdx, _selectedUbi, _selectedLot, _disponible
//   → vaciar #sm-cant
//   → deshabilitar #btn-anadir

// renderCarrito()
//   → reconstruir #sm-carrito-body con createElement (no innerHTML)
//   → actualizar #sm-carrito-count
//   → actualizar #sm-carrito-totales
//   → habilitar/deshabilitar #btn-confirmar

// buildLineaCarritoEl(l)
//   → createElement, closure para botón delete
//   → sin innerHTML con datos de usuario

// confirmarSalida()
//   → _sending = true → deshabilitar btn-confirmar
//   → Promise.allSettled(snap.map(saveLinea))
//   → renderResultados(snap, results)
//   → mantener líneas fallidas en _lineas
//   → _sending = false

// saveLinea(l)
//   → SGA.salidas.save({cod, ubi, lot, cant})
//   → catch: mapear 400→"Stock insuficiente", 409→"Stock insuficiente",
//            500→"Error del servidor", resto→"Error de conexión"

// renderResultados(snap, results)
//   → ocultar #sm-workspace → mostrar #sm-results
//   → cabecera con N/M confirmadas
//   → lista líneas con ✓/✗ por resultado

// limpiarTodo()
//   → si _lineas.length > 0: window.confirm()
//   → reset completo: _lineas=[], _lineaIdx=0, todos los estados
//   → ocultar #sm-results, mostrar #sm-workspace
//   → renderCarrito()
//   → foco #sm-art-cod

// stepCant(delta)
//   → incrementar/decrementar #sm-cant en delta
//   → clamp: min=0.001, max=_disponible
//   → llamar validarCantidad()

// DOMContentLoaded: wiring de eventos
//   sm-art-cod: blur→buscarArticulo, Enter→buscarArticulo
//   sm-art-cod: input→limpiarArticulo si vacío
//   btn-art-clear: click→limpiarArticulo
//   sm-cant: input→validarCantidad
//   sm-cant: Enter→agregarLinea
//   btn-menos: click→stepCant(-1)
//   btn-mas: click→stepCant(+1)
//   btn-anadir: click→agregarLinea
//   btn-confirmar: click→confirmarSalida
//   btn-nueva-salida: click→limpiarTodo
//   btn-limpiar (header): click→limpiarTodo
//   keydown F5: preventDefault→limpiarTodo
//   keydown ArrowDown/Up en sm-stock-lista: navegación entre items
```

**Estimación:** ~320-360 líneas JS.

---

## 20. Verificaciones manuales

Tras implementar, verificar manualmente:

| # | Verificación |
|---|--------------|
| V01 | Página carga sin errores JS en consola |
| V02 | Sidebar aparece con enlace activo en "Salida de mercancía" |
| V03 | Breadcrumb "Inicio › Opciones › Salida de Mercancía" correcto |
| V04 | Escribir código de artículo válido → Enter → aparece pill verde con nombre |
| V05 | Artículo válido con stock → aparece lista de líneas de stock (ubi · lote · cant) |
| V06 | Artículo válido sin stock → aparece "Sin stock disponible" + btn-anadir disabled |
| V07 | Artículo no encontrado → pill naranja → sin lista de stock → btn-anadir disabled |
| V08 | Clic en línea de stock → se selecciona (highlight) → campo cantidad se activa con max correcto |
| V09 | Clic en otra línea → deselecciona la anterior + actualiza disponible |
| V10 | Escribir cantidad = 0 → btn-anadir disabled |
| V11 | Escribir cantidad > disponible → aviso rojo + btn-anadir disabled |
| V12 | Escribir cantidad válida ≤ disponible → btn-anadir habilitado |
| V13 | Clic "+ Añadir línea" → línea aparece en carrito → formulario se limpia → foco a artículo |
| V14 | Carrito muestra cod, nombre, ubi, lote, cantidad correctos |
| V15 | Botón 🗑 elimina la línea correcta del carrito |
| V16 | btn-confirmar disabled si carrito vacío, enabled si hay líneas |
| V17 | Confirmar con salida válida → POST /salida enviado → zona resultados aparece con ✓ |
| V18 | Verificar en SQL Server que STOCAN se decrementó correctamente |
| V19 | Confirmar con stock insuficiente (modificar BD antes) → resultado ✗ "Stock insuficiente" |
| V20 | Líneas fallidas permanecen en carrito, exitosas desaparecen |
| V21 | "Nueva salida" → todo limpio → foco a artículo |
| V22 | F5 con carrito no vacío → pide confirmación |
| V23 | F5 con carrito vacío → limpia sin confirmación |
| V24 | ArrowDown/Up navegan entre líneas de stock; Enter selecciona |
| V25 | Responsive: en móvil < 640px todos los targets táctiles ≥ 48px |
| V26 | Dashboard "Salidas" → enlace lleva a nueva pantalla |
| V27 | `npx jest --no-coverage` en backend → todos los tests pasan (no regresiones) |
| V28 | Pantalla legacy `pages/ferreteria/salidas.html` sigue accesible por URL directa |

---

## 21. Criterios de éxito

1. Una salida de stock real se registra correctamente: STOCAN decrementado en BD, respuesta 200 OK.
2. El stock insuficiente es detectado tanto en frontend (al añadir) como en backend (al confirmar).
3. Ninguna salida puede quedar sin ubicación origen o sin lote — campos son automáticos e imposibles de omitir.
4. Las 28 verificaciones manuales pasan.
5. `npx jest --no-coverage` → 80/80 tests (sin regresiones backend).
6. Sin errores JS en consola del navegador.
7. Sin variables globales contaminando `window` (verificar en consola: `window._lineas` → undefined).
8. La pantalla se muestra correctamente en Chrome, Firefox y Edge en desktop y móvil.

---

## 22. Riesgos detectados

| # | Riesgo | Severidad | Mitigación |
|---|--------|-----------|------------|
| R1 | **Race condition en /salida**: sin transacción SQL, dos peticiones simultáneas sobre la misma (cod, ubi, lot) pueden pasar ambas la validación y dejar stock negativo | Media | El backend ya tiene validación previa que mitiga el caso más común. Para uso mono-usuario no es un problema práctico. Para uso multi-usuario concurrente, se recomienda añadir transacción en FASE futura (igual que en /traspaso). No bloquea FASE 4B. |
| R2 | **HTTP 400 para stock insuficiente**: `POST /salida` devuelve 400 (Bad Request) para "Stock insuficiente", no 409 (Conflict) como debería semánticamente y como hace `/traspaso`. Puede confundir futuros consumidores de la API. | Baja | El frontend mapea ambos (400 y 409) al mismo mensaje. No afecta a FASE 4B. Anotar para futura normalización de la API. |
| R3 | **SGA.stock.get(cod) puede devolver muchas líneas**: artículos con stock en decenas de ubicaciones generarán una lista larga en el selector | Baja | Limitar a 50 líneas en la visualización. El selector es scrollable. En la práctica, un artículo raramente tiene más de 5-10 ubicaciones activas. |
| R4 | **Stock "foto" vs realidad**: entre buscarArticulo() y confirmarSalida() otro usuario puede vaciar el stock. | Baja | El backend valida en el momento del POST. El error se muestra por línea fallida. El usuario puede reintentar tras refrescar el stock. |
| R5 | **Artículo con STOCAN = 0 en BD pero no negativo**: la query filtra STOCAN > 0, pero si hay registros en cero podrían aparecer. | Baja | Filtro `STOCAN > 0` en el renderizado. Sin riesgo operativo. |
| R6 | **Compatibilidad con lote "SL"**: si la BD tiene lotes con código real, la etiqueta "Sin lote" debe mapearse solo cuando `STOLOT === "SL"`. Otro código de lote no debe confundirse. | Media | Implementar mapeo explícito: `lot === 'SL' ? 'Sin lote' : lot`. El campo `lot` siempre se envía al backend con su valor real. |

---

## 23. Qué dejar fuera para futuras fases

| Feature | Fase sugerida |
|---------|---------------|
| Registro de operario (quién sacó el material) | FASE 4C o campo opcional en header de albarán |
| Destino / Obra / Orden de Trabajo | FASE 4C (requiere tabla MOVIMIENTO_CABECERA en backend) |
| Impresión de albarán de salida (PDF) | FASE 5 |
| Salida desde pedido de cliente / expedición | FASE 6 (requiere integraciones) |
| Picking avanzado (multi-ubicación automático) | FASE futura |
| Integración PDA / escáner Bluetooth | FASE futura |
| Transacción SQL en /salida | Mejora backend, FASE futura opcional |
| Normalizar HTTP 400→409 en /salida | Mejora backend, FASE futura opcional |
| Modo "salida masiva" (CSV import) | FASE futura |
| Restricción de lotes en cuarentena | Depende de implementación backend (flag en BD) |
| Mapa visual de ubicaciones | Fuera de alcance (regla global) |
| BI / informes de salidas | Módulo informes (ya existe parcialmente) |

---

## Orden de implementación

```
1. Crear directorio: frontend/pages/opciones/almacen-y-stock/salida-de-mercancia/
2. Crear index.html (estructura HTML completa con todos los IDs)
3. Crear directorio: frontend/css/opciones/almacen-y-stock/salida-de-mercancia/
4. Crear index.css (namespace sm-, variables --sga-*, responsive)
5. Crear frontend/js/opciones/almacen-y-stock/salida-de-mercancia.js (IIFE, createElement)
6. Modificar frontend/js/ui/sidebar.js (actualizar href salida)
7. Modificar frontend/index.html (actualizar href acceso rápido salidas)
8. Ejecutar verificaciones V01-V28
9. Ejecutar npx jest --no-coverage (sin regresiones)
```

---

*Plan técnico — FASE 4B — Salida de Mercancía Moderna*
*Generado: 2026-05-08*
*Dependencias: FASE 1 (CSS base), FASE 4A (patrón referencia)*
*Backend: sin cambios requeridos*
