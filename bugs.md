# Registro de bugs — SGA LIN

Detectados mediante revisiones exhaustivas de código (`/review-bugs`, `/review-backend`).  
Estado: abierto / corregido / descartado.

---

## 🔴 Confirmados

### BUG-01 — `validar()` puede duplicar una confirmación en la cola offline

- **Estado:** corregido 2026-05-25
- **Archivo:** `frontend/pages/almacen/movil.js` · líneas 443-461
- **Función:** `validar()`

**Descripción:**  
Si el usuario tiene conexión (`navigator.onLine = true`), el PATCH llega al servidor y tiene éxito,
pero el GET inmediato que sigue (línea 449) falla con `TypeError` (red intermitente, timeout).
El `catch` en línea 455 detecta `err instanceof TypeError` y llama `_validarOptimistic()`,
encolando un segundo PATCH para la misma parada. Al sincronizar, el servidor recibe la validación dos veces.

```js
// El GET puede fallar con TypeError aunque el PATCH ya tuvo éxito
const ruta = await (await fetch(`/api/almacen/picking/${RUTA_ID}`)).json(); // línea 449
```

**Condición:** Red con pérdida parcial de paquetes o throttle alto.

**Corrección:**  
Separar el fallo del PATCH del fallo del GET. Solo usar `_validarOptimistic()` si el PATCH en sí falla.
Si el PATCH tuvo éxito, mutar optimistamente `_ruta` sin encolar, y refrescar el GET en segundo plano:

```js
try {
    const resp = await fetch(`/api/almacen/picking/${RUTA_ID}/validar/${idx}`, { ... });
    if (!resp.ok) throw new Error('Error al validar. Inténtalo de nuevo.');
    // PATCH OK — mutar sin encolar
    if (_ruta) { _ruta.paradas[idx].completada = true; render(_ruta); }
    // GET en segundo plano, silencioso si falla
    fetch(`/api/almacen/picking/${RUTA_ID}`)
        .then(r => r.json())
        .then(ruta => { _ruta = ruta; _cacheRuta(ruta); render(ruta); })
        .catch(() => {});
} catch (err) {
    if (!navigator.onLine || err instanceof TypeError) {
        await _validarOptimistic(idx, body); // solo si el PATCH falló
    } else { ... }
}
```

---

### BUG-02 — `/lote-no-utilizado` consulta la tabla equivocada

- **Estado:** corregido parcialmente 2026-05-25
- **Archivo:** `backend/routes/lotes.routes.js` · líneas 116-130
- **Función:** `GET /lote-no-utilizado`

**Descripción:**  
El endpoint hace `SELECT … FROM ARTICULOEXCLOTCLI`, que es exactamente la misma tabla que usa
`/lote-exclusivo` definido justo arriba. Son dos endpoints conceptualmente distintos
(lotes excluidos por cliente vs. lotes sin usar), pero el copy-paste dejó la misma tabla.
Ambos endpoints devuelven los mismos datos.

**Condición:** Siempre — la función está completamente rota.

**Corrección aplicada:**  
Corregido el alias `lote` → `lote_exclusivo` para que coincida con lo que espera el frontend.
Añadido el handler `POST /lote-no-utilizado` que faltaba (el guardado daba 404 silencioso).
La tabla `ARTICULOEXCLOTCLI` se mantiene hasta que Paco confirme si hay una tabla específica
de lotes sin usar o si efectivamente son el mismo concepto que los lotes exclusivos.

---

### BUG-03 — `/stock/:cod` y `/consulta-de-stock` bypassean `serverError()`

- **Estado:** corregido 2026-05-25
- **Archivo:** `backend/routes/stock.routes.js` · líneas 26 y 59
- **Función:** `GET /stock/:cod`, `GET /consulta-de-stock`

**Descripción:**  
Ambos endpoints usan `res.status(500).json(...)` directamente en el `catch`, ignorando `serverError()`.
Cuando la BD está caída, estos dos endpoints siguen emitiendo el stack completo en consola aunque
`middleware/error.js` ya fue preparado para suprimir esos logs de conexión.

**Condición:** Siempre que SQL Server no esté disponible.

**Corrección:**

```js
// Línea 26 y línea 59 — reemplazar:
} catch (err) { res.status(500).json({ error: 'Error interno del servidor' }); }

// Por:
} catch (err) { serverError(res, err); }
```

---

## 🟠 Probables

### BUG-04 — `_syncPending()` puede ejecutarse en paralelo

- **Estado:** corregido 2026-05-25
- **Archivo:** `frontend/pages/almacen/movil.js` · líneas 535-540
- **Función:** `_syncPending()`

**Descripción:**  
`_syncPending()` se lanza sin mutex desde dos sitios: en el evento `online` (línea 535)
y al terminar `init()` (línea 539). Si el usuario reabre la pestaña justo cuando recupera conexión,
ambas instancias corren a la vez, leen la misma cola y pueden enviar los mismos PATCHes
antes de que ninguna llame a `_dequeue()`.

**Condición:** El usuario cierra y reabre la pestaña mientras recupera red.

**Corrección:**

```js
let _syncing = false;

async function _syncPending() {
    if (_syncing || !navigator.onLine) return;
    _syncing = true;
    try { /* lógica actual sin cambios */ } finally { _syncing = false; }
}
```

---

### BUG-05 — `poner-cero-carrusel` tiene race condition sin transacción

- **Estado:** corregido 2026-05-25
- **Archivo:** `backend/routes/admin.routes.js` · líneas 58-69
- **Función:** `POST /poner-cero-carrusel`

**Descripción:**  
El endpoint hace `SELECT COUNT` y luego decide entre `INSERT` o `UPDATE` en dos queries separadas.
Si dos peticiones llegan al mismo tiempo, ambas pueden ver `cnt = 0` y ambas ejecutarán el `INSERT`,
produciendo una clave duplicada o dos filas si no hay PRIMARY KEY.

**Condición:** Dos clicks rápidos simultáneos (poco probable pero posible).

**Corrección:**  
Reemplazar las dos queries por un `MERGE` atómico:

```sql
MERGE CONTADOR AS target
USING (SELECT 1 AS dummy) AS src ON 1=1
WHEN MATCHED     THEN UPDATE SET CONNUM=1, REGMOD=0
WHEN NOT MATCHED THEN INSERT (CONNUM, REGMOD) VALUES (1, 0);
```

---

### BUG-06 — `loadWorkers()` falla silenciosamente

- **Estado:** corregido 2026-05-25
- **Archivo:** `frontend/pages/almacen/supervisor.js` · líneas 25-36
- **Función:** `loadWorkers()`

**Descripción:**  
El `catch {}` vacío no informa al supervisor de ningún error. Si `/operarios` falla
(BD caída, 401, error de red), el selector de operarios queda vacío sin ninguna indicación.
El supervisor puede creer que no hay operarios asignados cuando en realidad es un error.

**Condición:** BD caída o cualquier error de red al cargar la página del supervisor.

**Corrección:**

```js
} catch (err) {
    console.warn('[supervisor] No se pudo cargar operarios:', err.message);
    const sel = document.getElementById('worker-sel');
    if (sel) sel.insertAdjacentHTML('beforeend',
        '<option disabled>⚠ Error al cargar operarios</option>');
}
```

---

## 🟡 Potenciales

### BUG-07 — Pool muerto no se detecta tras reinicio de SQL Server

- **Estado:** corregido 2026-05-25
- **Archivo:** `backend/db.js` · líneas 36-62
- **Función:** `getPool()`

**Descripción:**  
Una vez que `poolPromise` resuelve con éxito, el pool queda cacheado indefinidamente.
Si SQL Server se reinicia, el pool existente empieza a rechazar queries con `Connection closed`,
pero `getPool()` sigue devolviendo el pool muerto sin intentar reconectar.
Solo un reinicio manual del proceso Node lo resuelve.

**Condición:** Reinicio de SQL Server en producción sin reiniciar el proceso Node.

**Corrección:**  
Escuchar el evento `error` del pool para invalidarlo automáticamente:

```js
.then(pool => {
    pool.on('error', () => { poolPromise = null; }); // auto-reset
    _lastFailAt = 0;
    return pool;
})
```

> Nota para Paco: incorporar también en el `db.js` de Windows Authentication.

---

### BUG-08 — `validatePasillos()` no valida tipos numéricos

- **Estado:** corregido 2026-05-25
- **Archivo:** `backend/routes/almacen.routes.js` · líneas 47-51
- **Función:** `validatePasillos()`

**Descripción:**  
La validación comprueba que `columnas` y `niveles` sean truthy, pero no que sean números positivos.
Si llegan como `"abc"` o `0`, `pasillosToUbicaciones()` genera `NaN` o 0 ubicaciones
sin devolver ningún error visible al cliente.

**Condición:** Editor de planta con valores no numéricos en los campos de columnas/niveles.

**Corrección:**

```js
if (typeof p.columnas !== 'number' || p.columnas < 1 ||
    typeof p.niveles  !== 'number' || p.niveles  < 1)
    return `Pasillo ${p.numero}: columnas y niveles deben ser enteros ≥ 1`;
```

---

---

## Revisión de backend — 2026-05-25 (`/review-backend`)

---

### CRIT-01 — Race condition en operaciones de picking (archivo JSON)

- **Estado:** abierto
- **Archivo:** `backend/routes/almacen.routes.js` · líneas 225-266
- **Función:** `PATCH /api/almacen/picking/:id/validar/:idx`, `PATCH /api/almacen/picking/:id/incidencia/:idx`

**Descripción:**  
Ambos endpoints hacen: 1) leer `picking.json` en memoria, 2) mutar, 3) escribir el archivo.
Si dos peticiones llegan simultáneamente (dos operarios validando a la vez), la segunda lee
antes de que la primera escriba y machaca sus cambios. Pérdida de datos silenciosa.

**Condición:** Dos operarios validando paradas a la vez en la misma ruta.

**Corrección:** Serializar escrituras con una promesa-cola:
```js
let _writeLock = Promise.resolve();

async function savePickings(list) {
    _writeLock = _writeLock.then(() =>
        fs.promises.writeFile(PICKING_FILE, JSON.stringify(list, null, 2), 'utf8')
    );
    return _writeLock;
}
```

---

### CRIT-02 — `GET /datos/:tabla` accesible sin autenticación

- **Estado:** abierto
- **Archivo:** `backend/routes/system.routes.js` · línea 38
- **Función:** `GET /datos/:tabla`

**Descripción:**  
Permite leer hasta 100 filas de `ARTICULO`, `STOCK`, `UBICACION`, `CLIENTE`, `PROVEEDOR`,
`ALBARANCS` y `ALMACENES` sin ninguna API key. Los endpoints hermanos `GET /schema` y
`GET /tablas` sí tienen `requireAuth`, pero `/datos/:tabla` no.

**Condición:** Cualquier petición GET desde la red local sin credenciales.

**Corrección:**
```js
router.get('/datos/:tabla', requireAuth, async (req, res) => {
```

---

### ALTO-01 — `/entrada`, `/traspaso`, `/salida` bypassean `serverError()`

- **Estado:** abierto
- **Archivo:** `backend/routes/movimientos.routes.js` · líneas 43, 89, 109
- **Función:** `POST /entrada`, `POST /traspaso`, `POST /salida`

**Descripción:**  
Los tres endpoints de stock más críticos del sistema usan `console.error("[ERROR]", ...)` +
`res.status(500)` directamente, en vez de `serverError()`. Además `serverError` ni siquiera
está importado en este archivo.

**Corrección:** Añadir import y sustituir los tres catch:
```js
const { serverError } = require('../middleware/error'); // añadir al inicio

// Líneas 43, 89, 109 — reemplazar:
} catch (err) { console.error("[ERROR]", err.message || err); res.status(500).json(...); }
// Por:
} catch (err) { serverError(res, err); }
```

---

### ALTO-02 — `upsertConfiguracionEmpresa` tiene race condition (mismo patrón que BUG-05)

- **Estado:** abierto
- **Archivo:** `backend/services/config.service.js` · líneas 91-111
- **Función:** `upsertConfiguracionEmpresa()`

**Descripción:**  
`SELECT COUNT(*) AS cnt FROM EMPRESA` seguido de `INSERT` o `UPDATE` sin transacción.
Idéntico al bug de `poner-cero-carrusel` (BUG-05) ya corregido.

**Corrección:** Sustituir las dos queries por un `MERGE` atómico:
```js
await pool.request()
    .input('nom', data.nombre || '').input('cif', data.cif || '')
    .input('dir', data.direccion || '').input('pob', data.localidad || '')
    .input('tel', data.telefono || '').input('eml', data.email || '')
    .query(`MERGE EMPRESA AS target
            USING (SELECT 1 AS dummy) AS src ON 1=1
            WHEN MATCHED THEN
                UPDATE SET EMPNOM=@nom,EMPCIF=@cif,EMPDIR=@dir,EMPPOB=@pob,EMPTEL=@tel,EMPEML=@eml
            WHEN NOT MATCHED THEN
                INSERT (EMPCOD,EMPNOM,EMPALMCOD,EMPTIPEMP,EMPCIF,EMPDIR,EMPPOB,EMPTEL,EMPEML)
                VALUES ('LIN',@nom,'',0,@cif,@dir,@pob,@tel,@eml);`);
```

---

### ALTO-03 — Cinco rutas más bypassean `serverError()`

- **Estado:** abierto
- **Archivos:**
  - `backend/routes/articulos.routes.js` · línea 50 — `GET /articulos/:cod`
  - `backend/routes/escrituras.routes.js` · línea 110 — `POST /generar-ubicaciones`
  - `backend/routes/system.routes.js` · líneas 27, 35, 53 — `/schema`, `/tablas`, `/datos/:tabla`

**Descripción:**  
Todos usan `console.error("[ERROR]", ...)` + `res.status(500)` directamente.
Mismo patrón que BUG-03 ya corregido en stock.routes.js.

**Corrección:** En cada uno, sustituir el `catch` por `serverError(res, err)`.

---

### ALTO-04 — `POST /generar-ubicaciones` loop de hasta 1000 queries sin transacción

- **Estado:** abierto
- **Archivo:** `backend/routes/escrituras.routes.js` · líneas 93-108
- **Función:** `POST /generar-ubicaciones`

**Descripción:**  
Ejecuta hasta 1000 `INSERT` individuales en un bucle sin transacción. Si la conexión falla
a mitad, parte de las ubicaciones quedan creadas y el resto no — estado parcialmente
consistente sin posibilidad de rollback.

**Corrección:** Envolver en `sql.Transaction`:
```js
const { sql } = require('../db'); // añadir al import
const transaction = new sql.Transaction(pool);
await transaction.begin();
try {
    for (...) { await transaction.request()... }
    await transaction.commit();
} catch (err) { await transaction.rollback(); throw err; }
```

---

### MEDIO-01 — `POST /ubicaciones` sin validar `r.cod`

- **Estado:** abierto
- **Archivo:** `backend/routes/ubicaciones.routes.js` · línea 46
- **Función:** `POST /ubicaciones`

**Descripción:**  
El bucle no valida `r.cod` antes de usarlo. Si una fila llega con `cod` nulo o undefined,
la query falla con error de BD genérico en vez de devolver 400.
El resto de rutas similares sí hacen `if (!r.articulo) continue`.

**Corrección:** Añadir al inicio del bucle:
```js
for (const r of rows) {
    if (!r.cod) continue; // añadir
    await q(pool)...
```

---

### MEDIO-02 — `getTrabajadores` devuelve `terminal` y `nombre` con el mismo valor

- **Estado:** abierto
- **Archivo:** `backend/services/analytics.service.js` · líneas 552-553
- **Función:** `getTrabajadores()`

**Descripción:**  
```js
ISNULL(NULLIF(RTRIM(ACSTER),''),'Sin terminal') AS terminal,
ISNULL(NULLIF(RTRIM(ACSTER),''),'Sin terminal') AS nombre,  // idéntico a terminal
```
El frontend recibe dos campos iguales. `nombre` debería venir de `SGAUSUARIO.USUNOM`
o `terminalpda.repnom` cruzando por el código de terminal.

---

### MEDIO-03 — CONTADOR se consume aunque `pr_grabarCompraDirecta` falle

- **Estado:** abierto (limitación de diseño — requiere decisión con Qanet)
- **Archivo:** `backend/routes/entrada-mercancia.routes.js` · líneas 86-95
- **Función:** `POST /entrada-mercancia`

**Descripción:**  
Si el SP retorna `accion = 99`, el `CONTADOR` ya se incrementó en el paso anterior.
El número de albarán queda consumido permanentemente, creando huecos en la numeración.
Está documentado en comentarios pero puede generar problemas en auditorías contables.

**Corrección:** No hay corrección limpia sin modificar el SP. Documentar como limitación
conocida y monitorizar con Qanet si los huecos causan problemas en el ERP.

---

### MEDIO-04 — `require('../db')` dentro del handler en almacen.routes.js

- **Estado:** abierto
- **Archivo:** `backend/routes/almacen.routes.js` · línea 63
- **Función:** `GET /api/almacen/articulos`

**Descripción:**  
```js
const { getPool } = require('../db'); // dentro del handler, no al inicio del archivo
```
Node cachea módulos así que no hay overhead real, pero es confuso — parece que se
importa por primera vez en cada request. Mover al top del archivo.

---

### MEDIO-05 — `getAlertasStock` filtra `severidad` en JavaScript en vez de SQL

- **Estado:** abierto
- **Archivo:** `backend/services/analytics.service.js` · línea 541
- **Función:** `getAlertasStock()`

**Descripción:**  
```js
return severidad ? data.filter(r => r.severidad === severidad) : data;
```
Trae todas las alertas de BD y luego filtra en JS. Para el dataset actual es aceptable,
pero el patrón es inconsistente con el resto del servicio.

---

### CS-02 — `expediciones.routes.js` sin middleware de autenticación en el router

- **Estado:** abierto
- **Archivo:** `backend/routes/expediciones.routes.js`

**Descripción:**  
Es el único router con datos sensibles (clientes, albaranes, movimientos) que no tiene
el patrón `router.use(...)` habitual para proteger futuros endpoints de escritura.
Todos los demás routers sí lo tienen aunque sus GETs sean públicos.

---

## 🟢 Code Smells

### CS-01 — `/copia-seguridad` descarga sin autenticación

- **Estado:** pendiente (requiere decisión de diseño en auth.js)
- **Archivo:** `backend/routes/admin.routes.js`
- **Función:** `GET /copia-seguridad`

**Descripción:**  
El router de admin aplica `requireAuth` solo a métodos POST/PATCH/DELETE.
La descarga del backup es un GET, por lo que cualquier persona con acceso a la red
puede descargar todos los datos de la BD sin API key.  
Ver también: pendiente de seguridad `1.3` en el TODO de la sesión de revisión.

---

## Resumen

### Revisión `/review-bugs` (2026-05-25) — frontend + backend inicial

| Severidad | Total | Corregidos |
|-----------|-------|-----------|
| 🔴 Confirmado | 3 | 3 |
| 🟠 Probable | 3 | 3 |
| 🟡 Potencial | 2 | 2 |
| 🟢 Code Smell | 1 | 0 |
| **Subtotal** | **9** | **8** |

### Revisión `/review-backend` (2026-05-25) — auditoría completa de backend

| Severidad | Total | Corregidos |
|-----------|-------|-----------|
| 🔴 Crítico | 2 | 0 |
| 🟠 Alto | 4 | 0 |
| 🟡 Medio | 5 | 0 |
| 🟢 Code Smell | 1 | 0 |
| **Subtotal** | **12** | **0** |

### Global

| | Total | Corregidos | Pendientes |
|--|-------|-----------|-----------|
| **Todos** | **21** | **8** | **13** |

### Top 5 más urgentes (pendientes)

1. **CRIT-01** — Race condition en picking: dos operarios simultáneos pueden machacarse los datos
2. **CRIT-02** — `/datos/:tabla` sin auth: cualquiera en red lee clientes, stock y proveedores
3. **ALTO-01** — `/entrada`, `/traspaso`, `/salida` siguen logueando errores de BD duplicados
4. **ALTO-02** — `upsertConfiguracionEmpresa` race condition sin transacción
5. **ALTO-04** — `generar-ubicaciones` sin transacción: hasta 1000 INSERTs parcialmente atómicos
