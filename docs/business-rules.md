# Reglas de Negocio SGA — Conocimiento Descubierto

> Documento vivo. Basado exclusivamente en comportamiento confirmado por código real (rutas, servicios, scripts de auditoría).
> Si algo no está demostrado se marca **[NO CONFIRMADO]**.
> Estados posibles: **CONFIRMADO** | **NO CONFIRMADO** | **PENDIENTE QANET** | **PENDIENTE DEFINICIÓN**

---

## Índice

1. [Stock — Físico vs Virtual](#1-stock--físico-vs-virtual)
2. [Tablas principales de stock](#2-tablas-principales-de-stock)
3. [Operaciones de almacén](#3-operaciones-de-almacén)
4. [Módulo Picking](#4-módulo-picking)
5. [Módulo Expediciones](#5-módulo-expediciones)
6. [Módulo Regularizaciones](#6-módulo-regularizaciones)
7. [Módulo Entrada de Mercancía](#7-módulo-entrada-de-mercancía)
8. [Funciones Admin — Stubs 501](#8-funciones-admin--stubs-501)
9. [Campos pendientes de confirmar con Qanet](#9-campos-pendientes-de-confirmar-con-qanet)
10. [Arquitectura técnica](#10-arquitectura-técnica)
11. [CI y tests](#11-ci-y-tests)
12. [Restricciones absolutas](#12-restricciones-absolutas)

---

## 1. Stock — Físico vs Virtual

### Regla canónica de separación

| Criterio | Valor |
|---|---|
| Stock **físico** | `STOUBI NOT LIKE '789%' AND STOUBI NOT LIKE '799%'` |
| Stock **virtual** | `STOUBI LIKE '789%' OR STOUBI LIKE '799%'` |

**Estado:** CONFIRMADO — definido así en `scripts/auditoria_stock_virtual.js` (paso4_suma_global) y `scripts/auditoria_stock_virtual2.js`.

### Prefijos de ubicación detectados

| PREFIJO | SIGNIFICADO | ESTADO |
|---|---|---|
| `001*`, `002*`, `003*` | Ubicaciones físicas de almacén (pasillos reales) | CONFIRMADO |
| `789*` | Ubicaciones virtuales (origen desconocido) | CONFIRMADO — aparece en scripts de auditoría |
| `799*` | Ubicaciones virtuales (origen desconocido) | CONFIRMADO — aparece en scripts de auditoría |
| `900*` | Posible zona especial (EMPTIPEMP afecta esta zona) | NO CONFIRMADO |
| `D1*` | Posibles devoluciones | NO CONFIRMADO |
| `O1*` | Posibles salidas | NO CONFIRMADO |

### Lotes especiales

| LOTE | SIGNIFICADO | ESTADO |
|---|---|---|
| `999999` | Lote virtual, asociado mayoritariamente a 789*/799* | CONFIRMADO — auditado en scripts paso3 |
| Lotes reales | Formato alfanumérico, asociados a ubicaciones físicas | CONFIRMADO |

> **Riesgo confirmado:** todas las queries de producción hacen `SUM(STOCAN) FROM STOCK` **sin** filtrar por prefijo. El stock virtual se mezcla con el físico en todos los KPIs del dashboard, alertas, mínimos/máximos y contadores. Ver sección [10 — Arquitectura](#10-arquitectura-técnica) para detalle de afectación por endpoint.

### Semántica de STOCK en LIN (confirmada FASE 8.0)

- Granularidad real: `(STOARTCOD, STOUBI, STOLOT) → STOCAN`
- `UBIALMCOD`: vacío en 100% de filas → campo `almacen` siempre `''`
- `UBINOM`: vacío en 100% de filas salvo 2 ("Producto mal estado", "Devoluciones")
- `UBILIB`: siempre 0 en LIN → badge LIBRE nunca aparece en producción
- Multilote activo: 111 artículos con >1 lote, 91 combos art+ubi con múltiples lotes
- `ARTICULOUBI`: `stock_min=0` y `stock_max=0` en 100% de filas LIN

---

## 2. Tablas principales de stock

| TABLA | USO | RESTRICCIÓN |
|---|---|---|
| `STOCK` | Stock actual por `(artículo, ubicación, lote)` | Nunca modificar directamente; usar SPs ERP |
| `STOCKLOTE` | Tabla auxiliar de stock por lote | **NO tocar** — referenciada en entrada-mercancía para verificación pre/post. No auditar todavía |
| `ARTICULOUBI` | Asignación artículo ↔ ubicación, con min/max | `ARTUBIMIN`=0 y `ARTUBIMAX`=0 en 100% filas LIN |
| `ARTICULOSINREP` | Artículos sin reposición | Solo INSERT IF NOT EXISTS |
| `ARTICULOSTOMIN` | Mínimos y máximos de stock por artículo | MERGE (INSERT/UPDATE) |
| `ALBARANCS` | Registro de todos los movimientos (entradas, salidas, picking, regularizaciones) | Solo lectura desde SGA (escritura solo vía SPs ERP) |
| `CONTADOR` | Numeración de albaranes | UPDATE directo serie `ELIN`; nunca usar `pr_sumaContador2` directamente |
| `SGA_PICKING_CONFIRMACION` | Tabla propia SGA para confirmación de picking | Creada por SGA. DDL en `backend/db/SGA_PICKING_CONFIRMACION.sql` |
| `SGAUSUARIO` | Usuarios del sistema | Gestionados por `config.service.js` |
| `LOG` | Log de actividad del ERP | Solo lectura |
| `ALMACENES` | Catálogo de almacenes | Solo lectura |
| `UBICACION` | Catálogo de ubicaciones físicas y virtuales | INSERT solo vía `POST /generar-ubicaciones` |
| `ARTICULO` | Catálogo de artículos | UPSERT vía `POST /articulos` |

---

## 3. Operaciones de almacén

### Tipos de movimiento en ALBARANCS (`ACSMOV`)

| CÓDIGO | ETIQUETA | ESTADO |
|---|---|---|
| `PC` | Picking cliente | CONFIRMADO — 97% de filas en LIN (oct-dic 2025) |
| `RG` | Regularización | CONFIRMADO — ~1.6% filas; series ZLIN (traspasos simétricos), RLIN (mermas negativas) |
| `PP` | Preparación interna / Entrada SGA | CONFIRMADO — ~1% filas; también usado como `@MOV` en `pr_grabarCompraDirecta` |
| `E` | Entrada (ERP legacy) | CONFIRMADO — aceptado en `WHERE ACSMOV IN ('E','PC')` en Picking; 0 filas activas en LIN 2025 |
| `R` | Regularización ERP | CONFIRMADO — filtro `WHERE ACSMOV='R'` en `/regularizaciones` |
| `S` | Salida | NO CONFIRMADO — aparece en código analytics como `ACSMOV='S'` pero no auditado en LIN |
| `T` | Traspaso | NO CONFIRMADO — aparece en analytics `getTrabajadores` |

### Series especiales en ALBARANCS (`ACSSER`)

| SERIE | SIGNIFICADO | ESTADO |
|---|---|---|
| `PLIN` | Picking conjunto (albarán de picking interno) | CONFIRMADO — `RTRIM(ACSSER) <> 'PLIN'` excluido en Expediciones y Movimientos |
| `02025` | Picking individual España | CONFIRMADO — aparece en 97% datos oct-dic 2025 |
| `POR` | Picking Portugal | CONFIRMADO — mencionado en FASE 6.x |
| `ZLIN` | Traspasos simétricos (regularización) | CONFIRMADO — visto en tipo RG |
| `RLIN` | Mermas (siempre negativas) | CONFIRMADO — visto en tipo RG |
| `DEV` | Devoluciones | CONFIRMADO — tipo PP |
| `CLIN` | Desconocida | NO CONFIRMADO |
| `ELIN` | Entradas SGA (creada por SGA) | CONFIRMADO — constante `SGA_SERIE = 'ELIN'` en `entrada-mercancia.routes.js` |

---

## 4. Módulo Picking

**Estado:** ESTABLE EN PRODUCCIÓN (FASE 5B.6, 2026-05-14)

### Endpoints

| MÉTODO | URL | TABLA(S) | DESCRIPCIÓN |
|---|---|---|---|
| `GET` | `/picking` | `ALBARANCS`, `UBICACION`, `STOCK`, `SGA_PICKING_CONFIRMACION`, `ARTICULO` | Lista de líneas de picking con estado de confirmación SGA |
| `POST` | `/picking/confirmar` | `ALBARANCS`, `SGA_PICKING_CONFIRMACION` | Marca una línea como confirmada |
| `POST` | `/picking/desconfirmar` | `SGA_PICKING_CONFIRMACION` | Elimina la confirmación de una línea |

### Reglas de negocio

- Búsqueda por: `ACSCLICOD`, `ACSCLINOM`, `ACSNUM` (nº albarán), `ACSSER` (serie)
- Filtro activo: `ACSMOV IN ('E', 'PC')` — incluye entradas legacy y picking cliente
- Sin `ACSSER <> 'PLIN'` — Picking SÍ muestra albaranes PLIN (a diferencia de Expediciones)
- Orden: sin número de picking primero (`ACSNUMPIC IS NULL`), luego por fecha DESC
- TOP 500 filas; aviso visual si se alcanza
- Confirmación es idempotente: `IF NOT EXISTS ... INSERT` — doble confirmación no duplica
- Clave de confirmación: `(ALBARAN, SERIE, ARTICULO, UBICACION, LOTE)` — índice `IX_SGA_PICKING_CONF_LINEA`
- `ACSNUMPIC` = número de pase de picking (campo ERP, ≠ confirmación SGA)
- `ACSSER='PLIN'` = albaran de picking conjunto (muchas líneas, una sola acción en ERP)

### Datos en LIN

- `ACSMOV='PC'`: 361.561 filas, desde 2025-01-02 hasta 2025-12-12
- Sin datos desde 2026 → filtro 30d por defecto devuelve vacío en producción actual
- Para ver datos: usar filtro manual `hasta=2025-12-31` o anterior

---

## 5. Módulo Expediciones

**Estado:** ESTABLE EN PRODUCCIÓN (FASE 6.2, 2026-05-14)

### Endpoints

| MÉTODO | URL | TABLA(S) | DESCRIPCIÓN |
|---|---|---|---|
| `GET` | `/expediciones` | `ALBARANCS`, `ARTICULO` | Lista de expediciones a clientes |

### Reglas de negocio

- Filtro activo: `ACSMOV='PC' AND RTRIM(ACSSER) <> 'PLIN'`
- A diferencia de Picking, Expediciones **excluye** albaranes PLIN (son internos)
- Series: `02025` (España), `POR` (Portugal)
- TOP 500; aviso visual si se alcanza
- Búsqueda por: `ACSCLICOD`, `ACSCLINOM`, `ACSNUM`, `ACSSER`

---

## 6. Módulo Regularizaciones

**Estado:** OPERATIVO

### Endpoints

| MÉTODO | URL | TABLA(S) | DESCRIPCIÓN |
|---|---|---|---|
| `GET` | `/regularizaciones` | `ALBARANCS`, `ARTICULO` | Lista de movimientos de regularización |

### Reglas de negocio

- Filtro: `WHERE ACSMOV='R'`
- TOP 500, con filtro de fechas y artículo
- Solo lectura — SGA no genera regularizaciones directamente

---

## 7. Módulo Entrada de Mercancía

**Estado:** OPERATIVO (FASE 9.x)

### Endpoints

| MÉTODO | URL | TABLA(S) / SPs | DESCRIPCIÓN |
|---|---|---|---|
| `POST` | `/entrada-mercancia` | `ARTICULO`, `UBICACION`, `STOCKLOTE`, `CONTADOR`, SP `pr_grabarCompraDirecta` | Entrada directa de stock sin pedido previo |

### Flujo de operación

1. Validación de campos (`articulo`, `ubicacion`, `lote`, `cantidad`, `usuario`) — responde 400 si falla
2. Verifica existencia del artículo en `ARTICULO` — 404 si no existe
3. Verifica existencia de la ubicación en `UBICACION` — 404 si no existe
4. Lee stock previo en `STOCKLOTE` (para verificación posterior)
5. Incrementa `CONTADOR` con `UPDATE ... SET CONNUM = CONNUM + 1` (no usa `pr_sumaContador2`)
6. Ejecuta `EXEC pr_grabarCompraDirecta` con `@COMPRADIRECTA=1`, `@MOV='PP'`
7. Si `@ACCION=99` → error ERP, responde 500
8. Lee stock nuevo en `STOCKLOTE` y devuelve comparativa `stocklote_antes / stocklote_nuevo`

### Constantes fijas

| CONSTANTE | VALOR | ESTADO |
|---|---|---|
| `SGA_SERIE` | `'ELIN'` | CONFIRMADO — pre-creada en LIN con `CONNUM=0` |
| `SGA_CONEJE` | `''` | CONFIRMADO — ejercicio vacío (igual que ENTRADAS ERP en LIN) |
| `EMPALMCOD` | `''` | **PENDIENTE QANET** — asumido vacío porque `ARTUBIALMCOD` es vacío en 100% filas LIN |
| `EMPTIPEMP` | `0` | **PENDIENTE QANET** — no hay evidencia de tipo 5 en LIN; afecta solo ubi 900* |

### Por qué no se usa `pr_sumaContador2`

- El SP tiene un bug en el branch `ELSE` cuando la serie no existe o tiene >5 chars
- La serie `ELIN` (≤5 chars) se pre-crea con `CONNUM=0` antes del primer uso
- El patrón `UPDATE+SELECT` en Node.js es equivalente y más seguro

### Restricciones

- `STOCKLOTE`: no auditar ni modificar estructura — solo lectura de verificación en este módulo
- No leer ni usar `pr_sumaContador2` directamente

---

## 8. Funciones Admin — Stubs 501

Estas funciones existen en `backend/routes/admin.routes.js` y devuelven `501 Not Implemented`. Su lógica real está pendiente de definición por parte de Qanet.

| ENDPOINT | ESTADO | DESCRIPCIÓN |
|---|---|---|
| `POST /traspasar-inventarios` | **PENDIENTE QANET** | Traspaso masivo de inventarios entre ubicaciones/almacenes |
| `POST /importar-regularizaciones` | **PENDIENTE QANET** | Importación masiva de regularizaciones desde fichero externo |
| `POST /asignar-fecha-stock-inicial` | **PENDIENTE QANET** | Asignación de fecha base para cálculo de stock inicial |
| `POST /borrar-picking` | **PENDIENTE QANET** | Borrado de pases de picking del ERP |
| `POST /poner-cero-carrusel` | **PENDIENTE QANET** | Puesta a cero del stock del carrusel |

> Hay además `POST /copia-seguridad` que sí está implementado (genera referencia de backup con timestamp).
> Hay `POST /configuracion-empresa` en `config.routes.js` que también es stub 501 — **PENDIENTE DEFINICIÓN**.

### Invariante CI

El test `tests/arch.test.js` congela esta lista. Si se añade o elimina un stub sin actualizar el test, CI falla. Actualizar `arch.test.js` al implementar cualquiera de estos endpoints.

---

## 9. Campos pendientes de confirmar con Qanet

| CAMPO | UBICACIÓN EN CÓDIGO | VALOR ASUMIDO | RIESGO | ESTADO |
|---|---|---|---|---|
| `EMPALMCOD` | `entrada-mercancia.routes.js:25` | `''` (vacío) | Si el valor real es distinto, `pr_grabarCompraDirecta` puede fallar o registrar empresa incorrecta | **PENDIENTE QANET** |
| `EMPTIPEMP` | `entrada-mercancia.routes.js:26` | `0` | Afecta gestión de ubicaciones 900* (tipo empresa 5); si hay ubis 900* activas, se podría registrar stock en zona incorrecta | **PENDIENTE QANET** |

> Mientras no se confirmen, la entrada de mercancía funciona en LIN porque `ARTUBIALMCOD` es vacío en el 100% de filas. Si esto cambia, hay que revisar.

---

## 10. Arquitectura técnica

### Stack

| CAPA | TECNOLOGÍA |
|---|---|
| Runtime | Node.js + Express 5 |
| BD | SQL Server (DB `LIN`) via `mssql` 12 + `msnodesqlv8`, Windows Auth, ODBC Driver 17 |
| Frontend | HTML/CSS/JS vanilla, `createElement` only, CSS separado, sin frameworks |
| Tests | Jest 30 + Supertest, `--runInBand --forceExit` |

### Conexión a BD

- Archivo: `backend/db.js`
- Pool singleton: `getPool()` crea la conexión una sola vez y la reutiliza
- Connection string: `Server=localhost;Database=LIN;Trusted_Connection=Yes;`
- Si el pool falla, `poolPromise` se resetea a `null` para permitir reintento

### Estructura de módulos backend

```
backend/
  api.js                  — punto de entrada del servidor
  app.js                  — Express app (middleware + routes)
  db.js                   — pool singleton SQL Server
  routes/                 — 18 archivos, uno por módulo
  services/               — 4 servicios (terceros, visor, config, analytics)
  tests/                  — 21 suites de tests
  db/                     — DDL scripts (SGA_PICKING_CONFIRMACION.sql)
```

### Middleware de seguridad (confirmado en `app.js`)

| MIDDLEWARE | CONFIGURACIÓN |
|---|---|
| `helmet` | Cabeceras de seguridad por defecto |
| `cors` | Todos los orígenes (sin restricción por ahora) |
| `express-rate-limit` | 200 req / 15 min por IP |
| `express.json()` | Body parsing |

### KPIs de stock contaminados con stock virtual

Los siguientes endpoints calculan stock **sin filtrar** ubicaciones virtuales (789*/799*):

| ENDPOINT | QUERY AFECTADA | IMPACTO |
|---|---|---|
| `GET /estadisticas/dashboard` | `SUM(CASE WHEN STOCAN > 0 THEN STOCAN ELSE 0 END) FROM STOCK` | `unidades_stock` inflado |
| `GET /estadisticas/dashboard` | `COUNT(DISTINCT STOUBI) FROM STOCK WHERE STOCAN > 0` | `ubicaciones_ocupadas` inflado |
| `GET /estadisticas/dashboard` | `SUM(STOCAN) FROM STOCK GROUP BY STOARTCOD` (sinMovimiento) | Falsos positivos en "sin movimiento 90d" |
| `GET /estadisticas/alertas` | `SUM(STOCAN) GROUP BY STOARTCOD` | Alertas de stock bajo incorrectas |
| `GET /analitica/stock-ubicacion` | `SUM(STOCAN) FROM STOCK GROUP BY STOUBI` (TOP 30) | Top ubicaciones incluye las virtuales |
| `GET /stats` | `SUM(STOCAN) FROM STOCK` | KPI `stock` total incorrecto |
| `GET /contadores` | `COUNT(*) FROM STOCK WHERE STOCAN > 0` | `stock_activo` inflado |
| `GET /stock/:cod` | `SUM(STOCAN) WHERE STOARTCOD=@cod` (subquery en picking) | Stock total en picking incluye virtual |
| `GET /articulos-sin-reposicion` | `SUM(STOCAN) WHERE STOARTCOD=ar.HISARTCOD` | Stock en listado de no-reposición incorrecto |
| `GET /minimos-maximos` | `SUM(STOCAN) WHERE STOARTCOD=m.MINARTCOD` | Stock actual vs mínimo usa stock mezclado |

> **Decisión actual:** NO filtrar todavía. La separación física/virtual queda como deuda técnica hasta que Qanet confirme la semántica completa de los prefijos 789*/799*/900*/D1*/O1*.

---

## 11. CI y tests

### Scripts npm (desde `backend/`)

| SCRIPT | DESCRIPCIÓN |
|---|---|
| `npm start` | Arranca `api.js` en puerto 3000 |
| `npm test` | Todos los tests (requiere BD LIN local) — 254 tests / 21 suites |
| `npm run test:ci` | Solo tests sin BD — 63 tests / 4 suites (CI-safe) |
| `npm run lint` | ESLint — 0 errores (1 warning en `EMPTIPEMP`, preexistente, no tocar) |

### Suites CI-safe (sin BD)

| SUITE | TESTS | QUÉ VERIFICA |
|---|---|---|
| `tests/dynamic-sql.test.js` | ~15 | SQL dinámico no contiene inyección |
| `tests/services.test.js` | ~10 | Servicios exportan funciones esperadas |
| `tests/stubs.test.js` | ~7 | Stubs 501 responden correctamente |
| `tests/arch.test.js` | 31 | Integridad estructural del proyecto |

### Qué verifica `arch.test.js`

1. Todos los archivos en `routes/` y `services/` cargan sin errores de imports
2. Ningún método+path está duplicado entre route files
3. Todos los route files están registrados en `app.js` con `require()`
4. Todos los service files están referenciados en algún route o `app.js`
5. Los stubs 501 en `admin.routes.js` son exactamente 5 (lista congelada)
6. `config.routes.js` tiene exactamente 1 stub 501 (`/configuracion-empresa`)
7. `app.js` referencia `helmet`, `cors` y `rateLimit`

### CI GitHub Actions (`.github/workflows/ci.yml`)

- Se ejecuta en push/PR a `main` y `paco-dev`
- Runner: `windows-latest`
- Pasos: checkout → Node.js 22 → `npm ci` → `npm audit --omit=dev` → lint → `npm run test:ci`

---

## 12. Restricciones absolutas

Estas restricciones no deben romperse nunca sin autorización explícita:

| RESTRICCIÓN | MOTIVO |
|---|---|
| NO tocar `ALBARANCS` (escritura directa) | Tabla de movimientos ERP — solo via SPs |
| NO tocar `ACSNUMPIC` | Campo ERP de pase de picking — no es la confirmación SGA |
| NO tocar `STOCKLOTE` (estructura) | No auditado aún; Entrada de Mercancía depende de ella |
| NO modificar stored procedures legacy | `pr_grabarCompraDirecta` y similares son propiedad de Qanet |
| NO añadir WebSockets ni frameworks | Decisión arquitectónica firme |
| NO mover endpoints de Picking a `picking.routes.js` todavía | Ya están en ese archivo — acción completada |
| NO tocar `EMPALMCOD` ni `EMPTIPEMP` | Pendiente confirmación Qanet |
| NO filtrar stock virtual en producción todavía | Semántica 789*/799* no completamente definida |
| Mantener `createElement` only en frontend | Sin React, Vue ni similares |
| Mantener CSS separado del HTML | Convención establecida |

---

*Última actualización: 2026-05-18 — FASE I.5*
