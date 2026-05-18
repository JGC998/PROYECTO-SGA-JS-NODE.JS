# SGA — Auditoría y Consolidación del Proyecto

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conocer el estado real y exacto del proyecto SGA antes de continuar desarrollando — sin asumir nada de documentación previa.

**Architecture:** Auditoría basada únicamente en código real encontrado. Backend Node.js/Express + SQL Server. Frontend HTML5 + Vanilla JS puro (sin bundler). CI/CD via GitHub Actions.

**Tech Stack:** Node.js 22, Express 5, mssql 12, msnodesqlv8, Jest 30, Supertest, ESLint 10, GitHub Actions.

---

## RESUMEN EJECUTIVO

El proyecto SGA es un sistema de gestión de almacén (Warehouse Management System) para una ferretería/distribuidora. El código está en buen estado general: arquitectura limpia, seguridad implementada, tests presentes. Sin embargo hay **brechas críticas** entre lo que el frontend declara y lo que el backend implementa realmente.

**Estado global:** ~70% implementado. El núcleo de operaciones (entradas, salidas, traspasos, stock, picking, expediciones, lotes) está funcional. Las brechas están en: admin endpoints que son stubs, analytics granulares inexistentes, y páginas legacy sin migrar.

---

## INVENTARIO REAL DEL PROYECTO

### Números clave

| Categoría | Cantidad |
|-----------|----------|
| Archivos de rutas backend | 13 |
| Archivos de servicios backend | 4 |
| Archivos de tests | 12 (~80+ casos) |
| Páginas HTML frontend | 53 |
| Módulos JS frontend | 54 |
| Archivos CSS frontend | 59 (~9.800 líneas) |
| Endpoints API backend reales | ~60 |
| Métodos en api.js frontend | 79 |
| Dependencias producción | 6 |
| Dependencias desarrollo | 3 |

---

## BACKEND — INVENTARIO COMPLETO

### Estructura de archivos

```
backend/
├── api.js               ← Entry point. Arranca Express en puerto 3000.
├── app.js               ← Factory Express: configura middleware + monta rutas.
├── db.js                ← [NO VERSIONADO] Pool SQL Server (Windows Auth, ODBC 17).
├── get-schema.js        ← Utilidad de introspección de esquema BD.
├── package.json
├── routes/
│   ├── movimientos.routes.js    ← POST /entrada, /salida, /traspaso
│   ├── stock.routes.js          ← GET/POST stock + picking + expediciones (544 líneas)
│   ├── analytics.routes.js      ← GET /estadisticas/dashboard, /alertas, /contadores, etc.
│   ├── health.routes.js         ← GET /health
│   ├── system.routes.js         ← GET /schema, /tablas, /datos/:tabla
│   ├── config.routes.js         ← GET/POST /almacenes, /subfamilias, /terminales-pda, /usuarios, /configuracion-empresa
│   ├── articulos.routes.js      ← GET /articulos, /articulos/:cod
│   ├── ubicaciones.routes.js    ← GET/POST /ubicaciones
│   ├── lotes.routes.js          ← GET/POST /observaciones-articulo-lote, /lote-exclusivo, /lote-minimo, /lote-no-utilizado, /lote-cuarentena
│   ├── terceros.routes.js       ← GET /proveedores, /clientes, /operarios
│   ├── visor.routes.js          ← GET /visor/articulos, /visor/proveedores, /visor/clientes
│   ├── escrituras.routes.js     ← POST /articulos, /articulos-sin-reposicion, /minimos-maximos, /generar-ubicaciones
│   └── admin.routes.js          ← POST /traspasar-inventarios, /importar-regularizaciones, /asignar-fecha-stock-inicial, /borrar-picking, /poner-cero-carrusel, /copia-seguridad
├── services/
│   ├── analytics.service.js     ← getDashboard(), getAlertas(), getLog(), getStats(), getContadores(), getStockUbicacion()
│   ├── config.service.js        ← getAlmacenes(), upsertAlmacen(), getSubfamilias(), upsertSubfamilias(), getTerminalesPda(), upsertTerminalPda(), getUsuarios(), upsertUsuario(), getConfiguracionEmpresa()
│   ├── terceros.service.js      ← getProveedores(), getProveedor(), getClientes(), getCliente(), getOperarios(), getOperario()
│   └── visor.service.js         ← getArticulos(), getProveedores(), getClientes()
└── tests/
    ├── dynamic-sql.test.js      ← 15 casos. SQL injection + whitelist. CORRE EN CI.
    ├── security.test.js         ← Headers Helmet + rate-limit
    ├── health.test.js           ← /health endpoint
    ├── stock.test.js            ← Consultas stock
    ├── movimientos.test.js      ← 10 casos. /entrada, /salida, /traspaso
    ├── nucleo.test.js           ← Validaciones core
    ├── services.test.js         ← Funciones puras (normalizeDate, daysAgo)
    ├── picking.test.js          ← 19 casos. /picking, /confirmar, /desconfirmar
    ├── expediciones.test.js     ← 9 casos. /expediciones
    ├── consulta-de-stock.test.js
    ├── movimientos-por-articulo.test.js
    └── entrada-mercancia.test.js
```

### Todos los endpoints backend reales

| Método | Ruta | Archivo | Estado |
|--------|------|---------|--------|
| GET | /health | health.routes.js | HECHO |
| GET | /schema | system.routes.js | HECHO |
| GET | /tablas | system.routes.js | HECHO |
| GET | /datos/:tabla | system.routes.js | HECHO (whitelist) |
| GET | /articulos | articulos.routes.js | HECHO |
| GET | /articulos/:cod | articulos.routes.js | HECHO |
| GET | /proveedores | terceros.routes.js | HECHO |
| GET | /proveedores/:cod | terceros.routes.js | HECHO |
| GET | /clientes | terceros.routes.js | HECHO |
| GET | /clientes/:cod | terceros.routes.js | HECHO |
| GET | /operarios | terceros.routes.js | HECHO |
| GET | /operarios/:cod | terceros.routes.js | HECHO |
| GET | /visor/articulos | visor.routes.js | HECHO |
| GET | /visor/proveedores | visor.routes.js | HECHO |
| GET | /visor/clientes | visor.routes.js | HECHO |
| GET | /almacenes | config.routes.js | HECHO |
| POST | /almacenes | config.routes.js | HECHO |
| GET | /subfamilias | config.routes.js | HECHO |
| POST | /subfamilias | config.routes.js | HECHO |
| GET | /terminales-pda | config.routes.js | HECHO |
| POST | /terminales-pda | config.routes.js | HECHO |
| GET | /usuarios | config.routes.js | HECHO |
| POST | /usuarios | config.routes.js | HECHO |
| GET | /configuracion-empresa | config.routes.js | HECHO |
| POST | /configuracion-empresa | config.routes.js | **STUB** (retorna ok:true, no persiste) |
| GET | /ubicaciones | ubicaciones.routes.js | HECHO |
| POST | /ubicaciones | ubicaciones.routes.js | HECHO |
| GET | /observaciones-articulo-lote | lotes.routes.js | HECHO |
| POST | /observaciones-articulo-lote | lotes.routes.js | HECHO |
| GET | /lote-exclusivo | lotes.routes.js | HECHO |
| POST | /lote-exclusivo | lotes.routes.js | HECHO |
| GET | /lote-minimo | lotes.routes.js | HECHO |
| POST | /lote-minimo | lotes.routes.js | HECHO |
| GET | /lote-no-utilizado | lotes.routes.js | HECHO |
| GET | /lote-cuarentena | lotes.routes.js | HECHO |
| GET | /stock/:cod | stock.routes.js | HECHO |
| GET | /consulta-de-stock | stock.routes.js | HECHO |
| GET | /movimientos-por-articulo | stock.routes.js | HECHO |
| GET | /articulos-por-ubicacion | stock.routes.js | HECHO |
| GET | /articulos-sin-reposicion | stock.routes.js | HECHO |
| POST | /articulos-sin-reposicion | escrituras.routes.js | HECHO |
| GET | /minimos-maximos | stock.routes.js | HECHO |
| POST | /minimos-maximos | escrituras.routes.js | HECHO |
| GET | /regularizaciones | stock.routes.js | HECHO |
| GET | /expediciones | stock.routes.js | HECHO |
| GET | /picking | stock.routes.js | HECHO |
| POST | /picking/confirmar | stock.routes.js | HECHO |
| POST | /picking/desconfirmar | stock.routes.js | HECHO |
| GET | /situacion-pedidos-venta | stock.routes.js | HECHO |
| POST | /entrada-mercancia | stock.routes.js | HECHO (integración ERP) |
| POST | /articulos | escrituras.routes.js | HECHO |
| POST | /generar-ubicaciones | escrituras.routes.js | HECHO |
| GET | /estadisticas/dashboard | analytics.routes.js | HECHO |
| GET | /estadisticas/alertas | analytics.routes.js | HECHO |
| GET | /analitica/log | analytics.routes.js | HECHO |
| GET | /analitica/stock-ubicacion | analytics.routes.js | HECHO |
| GET | /stats | analytics.routes.js | HECHO (legacy) |
| GET | /contadores | analytics.routes.js | HECHO |
| POST | /traspasar-inventarios | admin.routes.js | **STUB** |
| POST | /importar-regularizaciones | admin.routes.js | **STUB** |
| POST | /asignar-fecha-stock-inicial | admin.routes.js | **STUB** |
| POST | /borrar-picking | admin.routes.js | **STUB** |
| POST | /poner-cero-carrusel | admin.routes.js | **STUB** |
| POST | /copia-seguridad | admin.routes.js | HECHO (genera referencia timestamp) |
| POST | /entrada | movimientos.routes.js | HECHO |
| POST | /salida | movimientos.routes.js | HECHO |
| POST | /traspaso | movimientos.routes.js | HECHO |

### Middleware stack (app.js)

1. `helmet` — Cabeceras de seguridad HTTP
2. `cors` — CORS sin restricción de origen (aceptable LAN)
3. `express-rate-limit` — 200 req/15min por IP
4. `express.json()` — Body parser JSON

### Deuda técnica backend

| Problema | Severidad | Ubicación |
|----------|-----------|-----------|
| stock.routes.js tiene 544 líneas con SQL directo (picking, expediciones, entrada-mercancia, regularizaciones, etc.) sin extraer a servicios | MEDIA | stock.routes.js |
| POST /configuracion-empresa no persiste nada en BD | ALTA | admin.routes.js, config.routes.js |
| POST /traspasar-inventarios, /importar-regularizaciones, /borrar-picking, /poner-cero-carrusel son stubs sin lógica real | ALTA | admin.routes.js |
| TOCTOU en POST /salida (check-then-act sin lock) | ALTA | movimientos.routes.js |
| Race condition en POST /entrada (creación artículo sin lock) | ALTA | movimientos.routes.js |
| analytics.service.js exporta normalizeDate() y daysAgo() — helpers que deberían estar en un módulo utils/ | BAJA | analytics.service.js |

---

## FRONTEND — INVENTARIO COMPLETO

### Arquitectura

- Sin bundler (Webpack, Vite, etc.). Todo ES6+ modules nativos o scripts clásicos.
- Sin framework (React, Vue, etc.). Vanilla JS puro.
- Sin TypeScript.
- Dos sistemas CSS coexistiendo:
  - **Nuevo (moderno):** base.css + layout.css + sidebar.css + components.css + page-specific index.css
  - **Legado:** navegacion.css (solo páginas ferreteria y visor)

### Estructura de archivos

```
frontend/
├── index.html                        ← Dashboard principal
├── js/
│   ├── api.js                        ← Wrapper REST. 35 módulos, 79 métodos.
│   ├── main.js                       ← 1 línea (minimal)
│   ├── ui/
│   │   ├── layout.js                 ← Sistema de layout de páginas
│   │   └── sidebar.js                ← Sidebar/navegación (150+ líneas)
│   ├── pages/
│   │   └── dashboard.js              ← Dashboard lógica (KPIs, alertas, movimientos recientes)
│   ├── ferreteria/
│   │   ├── articulos.js              ← Buscador artículos legado
│   │   ├── entradas.js               ← Formulario entradas legado (123 líneas, REAL)
│   │   ├── salidas.js                ← Formulario salidas legado (102 líneas, REAL)
│   │   ├── traspasos.js              ← Formulario traspasos legado (REAL)
│   │   ├── proveedores.js            ← Vista proveedores legado (REAL)
│   │   └── operarios.js              ← Vista operarios legado (REAL)
│   └── opciones/
│       ├── almacen-y-stock/
│       │   ├── almacenes.js
│       │   ├── articulos-por-ubicacion.js
│       │   ├── articulos-sin-reposicion.js
│       │   ├── consulta-de-stock.js
│       │   ├── entrada-de-mercancia.js
│       │   ├── generar-ubicaciones.js
│       │   ├── movimientos-por-articulo.js
│       │   ├── movimientos-por-articulo-mv.js  ← Variante JS (sin página dedicada)
│       │   ├── regularizaciones.js
│       │   ├── salida-de-mercancia.js
│       │   ├── traspasos.js
│       │   ├── traspaso-inventario-regularizacion.js
│       │   └── ubicaciones.js
│       ├── control-de-lotes-y-minimos/
│       │   ├── lote-cuarentena.js
│       │   ├── lote-exclusivo.js
│       │   ├── lote-minimo.js
│       │   ├── lote-no-utilizado.js
│       │   ├── minimos-maximos.js
│       │   ├── observaciones-por-articulo-lote.js
│       │   └── subfamilias.js
│       ├── logistica-y-pedidos/
│       │   ├── borrar-picking.js
│       │   ├── entrada-mercancia.js
│       │   ├── expediciones.js
│       │   ├── hojas-de-ruta.js      ← MUESTRA EXPEDICIONES (naming confuso)
│       │   ├── picking.js
│       │   ├── poner-cero-carrusel.js
│       │   └── situacion-pedidos-venta.js
│       └── sistema/
│           ├── configuracion-empresa.js
│           ├── contadores.js
│           ├── copia-seguridad.js
│           ├── terminales-pda.js
│           └── usuarios.js
├── css/
│   ├── base.css (106l)
│   ├── layout.css (41l)
│   ├── sidebar.css (100l)
│   ├── header.css (77l)
│   ├── buttons.css (47l)
│   ├── forms.css (54l)
│   ├── tables.css (49l)
│   ├── cards.css (51l)
│   ├── badges.css (17l)
│   ├── animations.css (72l)
│   ├── components.css (537l)   ← GRANDE — componentes UI complejos
│   ├── responsive.css (68l)
│   ├── navegacion.css (66l)    ← LEGADO
│   ├── styles.css (178l)       ← DEPRECATED/MISC
│   └── pages/dashboard.css (426l)
└── pages/
    ├── index.html (dashboard)
    ├── ferreteria/ (6 páginas + index)
    ├── visor/ (3 páginas + index)
    ├── util/index.html
    ├── informes/index.html      ← Sin JS
    ├── acerca_de/index.html
    └── opciones/
        ├── almacen-y-stock/ (13 páginas)
        ├── control-de-lotes-y-minimos/ (7 páginas)
        ├── logistica-y-pedidos/ (7 páginas)
        └── sistema/ (5 páginas)
```

### Navegación sidebar (8 grupos)

| Grupo | Links | Estado |
|-------|-------|--------|
| Dashboard | Inicio | HECHO |
| Stock | Consulta, Movimientos/artículo, Artículos/ubicación, Sin reposición | HECHO |
| Operaciones | Entrada mercancía, Salida mercancía, Traspasos | HECHO |
| Expediciones | Entrada mercancía (logística), Expediciones, Picking, Situación pedidos, Hojas ruta, Borrar picking, Poner cero carrusel | HECHO (funcional, hojas-de-ruta muestra expediciones) |
| Almacén | Almacenes, Ubicaciones, Generar ubicaciones, Regularizaciones, Traspaso/Regularización | HECHO |
| Lotes | Lote mínimo, Cuarentena, Exclusivo, No utilizado, Observaciones, Mínimos/máximos | HECHO |
| Maestros | Artículos, Proveedores, Clientes, Operarios, Subfamilias | HECHO (legado) |
| Sistema | Usuarios, Configuración empresa, Terminales PDA, Contadores, Copia seguridad | HECHO |

---

## TABLA DE ESTADO POR MÓDULO

| FASE | MÓDULO | ESTADO | ARCHIVOS IMPLICADOS | PROBLEMAS | RECOMENDACIÓN |
|------|--------|--------|---------------------|-----------|---------------|
| Core | POST /entrada | HECHO | movimientos.routes.js | Race condition (art. nuevo) | Documentado, bajo riesgo monousuario |
| Core | POST /salida | HECHO | movimientos.routes.js | TOCTOU (stock check) | Documentado, bajo riesgo monousuario |
| Core | POST /traspaso | HECHO | movimientos.routes.js | Ninguno — transacción explícita | OK |
| Core | GET /stock/:cod | HECHO | stock.routes.js | - | OK |
| Dashboard | GET /estadisticas/dashboard | HECHO | analytics.routes.js + analytics.service.js | - | OK |
| Dashboard | frontend/index.html + dashboard.js | HECHO | js/pages/dashboard.js + css/pages/dashboard.css | - | OK |
| Stock | GET /consulta-de-stock | HECHO | stock.routes.js | - | OK |
| Stock | consulta-de-stock/index.html | HECHO | js/opciones/almacen-y-stock/consulta-de-stock.js | - | OK |
| Stock | movimientos-por-articulo/index.html | HECHO | js/opciones/almacen-y-stock/movimientos-por-articulo.js | Archivo legacy.html huérfano | Eliminar legacy.html |
| Stock | articulos-por-ubicacion/index.html | HECHO | js/opciones/almacen-y-stock/articulos-por-ubicacion.js | - | OK |
| Stock | regularizaciones/index.html | HECHO | js/opciones/almacen-y-stock/regularizaciones.js | - | OK |
| Entradas | entrada-de-mercancia/index.html | HECHO | js/opciones/almacen-y-stock/entrada-de-mercancia.js | - | OK |
| Entradas | entrada-mercancia (logística)/index.html | HECHO | js/opciones/logistica-y-pedidos/entrada-mercancia.js | POST /entrada-mercancia con integración ERP compleja | OK |
| Salidas | salida-de-mercancia/index.html | HECHO | js/opciones/almacen-y-stock/salida-de-mercancia.js | - | OK |
| Traspasos | traspasos/index.html | HECHO | js/opciones/almacen-y-stock/traspasos.js | - | OK |
| Picking | picking/index.html | HECHO | js/opciones/logistica-y-pedidos/picking.js + css picking/index.css (858l) | - | OK |
| Picking | GET /picking, POST /confirmar, /desconfirmar | HECHO | stock.routes.js líneas 228-398 | Código mezclado en stock.routes.js (deuda técnica) | Extraer a picking.routes.js |
| Expediciones | expediciones/index.html | HECHO | js/opciones/logistica-y-pedidos/expediciones.js | - | OK |
| Expediciones | GET /expediciones | HECHO | stock.routes.js líneas 196-224 | Código mezclado en stock.routes.js | Extraer a expediciones.routes.js |
| Hojas ruta | hojas-de-ruta/index.html | A MEDIAS | js/opciones/logistica-y-pedidos/hojas-de-ruta.js | Módulo muestra expediciones, NO hojas de ruta reales. Naming confuso. Sin endpoint propio en backend. | Renombrar o implementar hojas de ruta reales |
| Situación pedidos | situacion-pedidos-venta/index.html | HECHO | js/opciones/logistica-y-pedidos/situacion-pedidos-venta.js | - | OK |
| Admin | borrar-picking/index.html | A MEDIAS | js/opciones/logistica-y-pedidos/borrar-picking.js | POST /borrar-picking es stub sin lógica BD | Implementar backend |
| Admin | poner-cero-carrusel/index.html | A MEDIAS | js/opciones/logistica-y-pedidos/poner-cero-carrusel.js | POST /poner-cero-carrusel es stub | Implementar backend |
| Admin | traspaso-inventario-regularizacion | A MEDIAS | js/opciones/almacen-y-stock/traspaso-inventario-regularizacion.js | POST /traspasar-inventarios y /importar-regularizaciones son stubs | Implementar backend |
| Ubicaciones | ubicaciones/index.html | HECHO | js/opciones/almacen-y-stock/ubicaciones.js | - | OK |
| Ubicaciones | generar-ubicaciones/index.html | HECHO | js/opciones/almacen-y-stock/generar-ubicaciones.js | - | OK |
| Lotes | lote-minimo/index.html | HECHO | js/opciones/control-de-lotes-y-minimos/lote-minimo.js | - | OK |
| Lotes | lote-cuarentena/index.html | HECHO | js/opciones/control-de-lotes-y-minimos/lote-cuarentena.js | - | OK |
| Lotes | lote-exclusivo/index.html | HECHO | js/opciones/control-de-lotes-y-minimos/lote-exclusivo.js | - | OK |
| Lotes | lote-no-utilizado/index.html | HECHO | js/opciones/control-de-lotes-y-minimos/lote-no-utilizado.js | - | OK |
| Lotes | minimos-maximos/index.html | HECHO | js/opciones/control-de-lotes-y-minimos/minimos-maximos.js | - | OK |
| Lotes | observaciones-por-articulo-lote | HECHO | js/opciones/control-de-lotes-y-minimos/observaciones-por-articulo-lote.js | - | OK |
| Lotes | subfamilias/index.html | HECHO | js/opciones/control-de-lotes-y-minimos/subfamilias.js | CSS mínimo (7 líneas) | Verificar si styling es suficiente |
| Maestros | ferreteria/articulos.html | HECHO (legado) | js/ferreteria/articulos.js + css/ferreteria/articulos.css | Sistema CSS legado (navegacion.css) | Migrar al nuevo sistema o marcar como permanentemente legado |
| Maestros | ferreteria/proveedores.html | HECHO (legado) | js/ferreteria/proveedores.js | Sistema CSS legado | Ídem |
| Maestros | ferreteria/clientes.html (visor) | HECHO (legado) | js/visor/ | Sistema CSS legado | Ídem |
| Maestros | ferreteria/operarios.html | HECHO (legado) | js/ferreteria/operarios.js | Sistema CSS legado | Ídem |
| Sistema | usuarios/index.html | HECHO | js/opciones/sistema/usuarios.js | - | OK |
| Sistema | configuracion-empresa/index.html | A MEDIAS | js/opciones/sistema/configuracion-empresa.js | POST /configuracion-empresa no persiste en BD (stub) | Implementar backend |
| Sistema | terminales-pda/index.html | HECHO | js/opciones/sistema/terminales-pda.js | - | OK |
| Sistema | contadores/index.html | HECHO | js/opciones/sistema/contadores.js (27l, minimal) | - | OK |
| Sistema | copia-seguridad/index.html | HECHO | js/opciones/sistema/copia-seguridad.js (18l) | Solo genera referencia timestamp, sin backup BD real | Verificar si es suficiente |
| Informes | informes/index.html | ROTO | Sin JS | Sin módulo JS, sin endpoint, sin contenido | Implementar o eliminar del menú |
| Analytics | api.js SGA.estadisticas.* (9 métodos) | ROTO | js/api.js | Llama a endpoints que NO existen en backend (/estadisticas/resumen, /movimientos-por-dia, /top-articulos, etc.) | Ver sección crítica |
| Artículos sin reposición | articulos-sin-reposicion/index.html | HECHO | js/opciones/almacen-y-stock/articulos-sin-reposicion.js | - | OK |
| Almacenes | almacenes/index.html | HECHO | js/opciones/almacen-y-stock/almacenes.js | - | OK |

---

## PROBLEMAS CRÍTICOS ENCONTRADOS

### 🔴 CRÍTICO 1: Mismatch analytics frontend vs backend

**Descripción:** `frontend/js/api.js` declara el módulo `SGA.estadisticas` con 9 métodos que llaman a endpoints que NO EXISTEN en el backend:

```
GET /estadisticas/resumen           → NO EXISTE
GET /estadisticas/movimientos-por-dia → NO EXISTE  
GET /estadisticas/top-articulos     → NO EXISTE
GET /estadisticas/entradas-vs-salidas → NO EXISTE
GET /estadisticas/alertas-stock     → NO EXISTE
GET /estadisticas/trabajadores      → NO EXISTE
GET /estadisticas/almacen           → NO EXISTE
GET /estadisticas/por-tipo          → NO EXISTE
GET /estadisticas/proveedores-actividad → NO EXISTE
GET /estadisticas/articulos-analisis → NO EXISTE
```

El backend solo tiene `GET /estadisticas/dashboard` que devuelve un objeto anidado con `{ kpis, graficos, movimientos_recientes }`. Los datos están ahí pero bajo otra estructura.

**Impacto:** Si alguna página llama a `SGA.estadisticas.*`, fallará con 404. La página `informes/index.html` muy probablemente depende de esto.

**Recomendación:** O bien crear los endpoints granulares en backend, o bien adaptar el frontend para usar `/estadisticas/dashboard` y extraer los datos del objeto anidado. La opción más limpia es lo segundo (no crear 10 endpoints para datos que ya están en uno).

---

### 🔴 CRÍTICO 2: 5 admin endpoints son stubs

Los siguientes POST devuelven `{ ok: true }` o un mensaje hardcoded sin hacer NADA en la base de datos:

| Endpoint | Stub desde | Impacto |
|----------|-----------|---------|
| POST /traspasar-inventarios | admin.routes.js | Frontend muestra "éxito" pero nada se mueve en BD |
| POST /importar-regularizaciones | admin.routes.js | Ídem |
| POST /asignar-fecha-stock-inicial | admin.routes.js | Ídem |
| POST /borrar-picking | admin.routes.js | Ídem — botón "Borrar picking" no hace nada real |
| POST /poner-cero-carrusel | admin.routes.js | Ídem — botón "Poner a cero carrusel" no hace nada |
| POST /configuracion-empresa | config.routes.js | La configuración de empresa no se puede guardar |

---

### 🟡 IMPORTANTE 3: informes/index.html está huérfana

La página `frontend/pages/informes/index.html` existe y aparece en el menú de navegación (grupo "Utilidades avanzadas"), pero:
- Sin módulo JS
- Sin CSS específico
- Sin integración con ningún endpoint

Es básicamente una página vacía que aparece como enlace roto.

---

### 🟡 IMPORTANTE 4: hojas-de-ruta muestra expediciones

`js/opciones/logistica-y-pedidos/hojas-de-ruta.js` carga datos de `SGA.expediciones.list()`. El módulo etiquetado como "Hojas de ruta" no implementa hojas de ruta — es un alias visual de expediciones.

No es técnicamente roto (funciona), pero es conceptualmente incorrecto y puede confundir a usuarios.

---

### 🟡 IMPORTANTE 5: Archivo legacy.html huérfano

`frontend/pages/opciones/almacen-y-stock/movimientos-por-articulo/legacy.html`

- No está enlazado desde ningún sitio del sidebar ni dashboard
- Usa el sistema CSS viejo (navegacion.css)
- Está marcado como "legacy"
- Ocupa espacio sin propósito

---

### 🟠 DEUDA TÉCNICA 6: stock.routes.js (544 líneas) mezcla responsabilidades

El archivo `backend/routes/stock.routes.js` contiene endpoints de:
- Stock queries
- Picking (GET + POST confirmar/desconfirmar)
- Expediciones
- Entrada mercancía (flujo ERP complejo)
- Regularizaciones
- Situación pedidos de venta

Esto viola la separación de responsabilidades documentada en el README. Picking y expediciones deberían tener sus propios archivos de rutas.

---

### 🟠 DEUDA TÉCNICA 7: Sistema CSS dual sin plan de migración

Existen dos sistemas CSS en paralelo:
- **Nuevo:** base.css + layout.css + sidebar.css + components.css
- **Legado:** navegacion.css (usado por páginas ferreteria y visor)

No hay plan documentado de cuándo/si migrar las páginas legado. El CSS legado puede divergir silenciosamente.

---

### 🟠 DEUDA TÉCNICA 8: Extracción incompleta a servicios

Solo 4 archivos de servicios existen. La mayoría de la lógica SQL está directamente en los archivos de rutas (stock.routes.js, lotes.routes.js, escrituras.routes.js, ubicaciones.routes.js, articulos.routes.js). El patrón de separación routes/services está implementado solo para analytics, config, terceros y visor.

---

## TESTING — ESTADO REAL

### Tests existentes

| Archivo | Casos | Corre en CI | Requiere BD | Estado |
|---------|-------|------------|-------------|--------|
| dynamic-sql.test.js | 15 | SÍ | NO (mocks) | HECHO |
| security.test.js | ~6 | NO | NO | HECHO |
| health.test.js | ~3 | NO | SÍ | HECHO |
| stock.test.js | ~8 | NO | SÍ | HECHO |
| movimientos.test.js | 10 | NO | SÍ | HECHO |
| nucleo.test.js | ~5 | NO | NO | HECHO |
| services.test.js | ~4 | NO | NO | HECHO |
| picking.test.js | 19 | NO | SÍ | HECHO |
| expediciones.test.js | 9 | NO | SÍ | HECHO |
| consulta-de-stock.test.js | ~6 | NO | SÍ | HECHO |
| movimientos-por-articulo.test.js | ~5 | NO | SÍ | HECHO |
| entrada-mercancia.test.js | ~5 | NO | SÍ | HECHO |

**Total:** ~95 casos de test. **0 tests rotos detectados** (imports correctos, rutas correctas).

### Carencias de testing

| Área sin tests | Riesgo |
|----------------|--------|
| Endpoints de admin.routes.js (stubs) | BAJO (stubs) |
| Lotes (lote-exclusivo, lote-minimo, etc.) | MEDIO |
| Config (usuarios, almacenes, terminales-pda) | MEDIO |
| Visor endpoints | BAJO |
| Frontend (ningún test de UI) | ALTO — sin pruebas de integración UI |
| Analytics endpoints | BAJO (solo dashboard probado implícitamente) |

### Estrategia CI/CD real

- **CI corre:** solo `dynamic-sql.test.js` (15 tests, no requiere BD)
- **Tests de integración:** corren solo en local con BD SQL Server disponible
- **npm test:** lanza los 12 archivos en banda (--runInBand --forceExit)

Esto significa que un cambio que rompa `movimientos.routes.js` pasaría CI sin problema. El CI solo verifica inyección SQL y whitelist.

---

## CI/CD — ESTADO REAL

**Archivo:** `.github/workflows/ci.yml`

**Triggers:** Push/PR a `main` o `paco-dev`

**Pipeline:**
1. Checkout
2. Node.js 22 + npm cache
3. `npm ci`
4. `npm run lint` (ESLint todos los archivos)
5. `npm run test:ci` (solo dynamic-sql.test.js)

**Carencias:**
- Sin smoke test de que el servidor arranca
- Sin test que la BD responde (health check)
- Solo 15 de ~95 tests corren en CI
- Sin builds de frontend (no aplica, sin bundler)
- Sin deploy automatizado

---

## CÓDIGO MUERTO / ARCHIVOS SIN USO

| Archivo | Razón | Acción |
|---------|-------|--------|
| `frontend/pages/opciones/almacen-y-stock/movimientos-por-articulo/legacy.html` | Huérfano, no enlazado, sistema CSS viejo | Eliminar |
| `frontend/css/styles.css` | Marcado como DEPRECATED/misc | Auditar y eliminar o absorber en components.css |
| `frontend/css/navegacion.css` | Solo lo usan páginas legado ferreteria/visor. Si no se migran, es permanente. | Mantener o migrar páginas |
| `frontend/js/main.js` | 1 línea, no hace nada | Eliminar o implementar |
| `SGA.estadisticas.*` en api.js (9 métodos) | Llaman a endpoints que no existen | Eliminar métodos o crear endpoints |
| `frontend/pages/informes/index.html` | Sin JS, sin CSS, sin funcionalidad | Implementar o eliminar del menú |
| `backend/routes/admin.routes.js` (5 endpoints) | Son stubs que retornan ok:true | Implementar o marcar como TODO explícito |

---

## PROPUESTA DE PRÓXIMOS PASOS (PRIORIDAD)

### Prioridad 1 — Errores silenciosos que engañan al usuario (1-2 días)

Estos items hacen que el usuario crea que algo funciona cuando no es así:

1. **Implementar POST /configuracion-empresa** — Actualmente no guarda nada en BD. El usuario presiona Guardar y ve "OK" pero nada cambia.
2. **Implementar POST /borrar-picking** — El botón existe, el usuario lo pulsa, no pasa nada real.
3. **Eliminar o deshabilitar botones de stubs** — Si los 5 admin endpoints son intencionales stubs pendientes de implementar, deshabilitar o marcar el UI con "Próximamente" para no engañar al usuario.

### Prioridad 2 — Broken links y páginas rotas (1 día)

4. **Eliminar legacy.html** — Archivo huérfano en movimientos-por-articulo.
5. **Implementar o eliminar informes/index.html** — Aparece en menú, no hace nada.
6. **Limpiar SGA.estadisticas.* en api.js** — 9 métodos que llaman a endpoints inexistentes. O crear los endpoints o eliminar los métodos del cliente.

### Prioridad 3 — Deuda técnica que dificulta mantenimiento (2-3 días)

7. **Partir stock.routes.js** — Extraer picking.routes.js y expediciones.routes.js con sus tests correspondientes.
8. **Extraer SQL directo a servicios** — stock.routes.js, lotes.routes.js, escrituras.routes.js. Seguir el patrón que ya existe en analytics.service.js.
9. **Clarificar hojas-de-ruta** — Renombrar el módulo o implementar hojas de ruta reales.

### Prioridad 4 — Tests y CI (1-2 días)

10. **Ampliar test:ci** — Añadir tests que no requieren BD (security.test.js, services.test.js, nucleo.test.js) al workflow CI.
11. **Tests de lotes** — Cubrir lote-exclusivo, lote-minimo, lote-cuarentena, lote-no-utilizado.
12. **Test de config** — Cubrir usuarios, almacenes, subfamilias, terminales-pda.

### Prioridad 5 — Implementación real de admin (variable según requerimiento)

13. **POST /traspasar-inventarios** — Lógica real de traspaso de inventarios entre periodos.
14. **POST /importar-regularizaciones** — Lógica real de importación.
15. **POST /asignar-fecha-stock-inicial** — Lógica real.
16. **POST /poner-cero-carrusel** — Lógica real (si aplica al negocio).

### Prioridad 6 — CSS y UX (backlog)

17. **Migrar páginas ferreteria legado al sistema CSS nuevo** — O definir explícitamente que se mantienen como legado permanente.
18. **Auditar components.css (537 líneas)** — Verificar qué clases se usan realmente y limpiar código muerto.

---

## RESUMEN CLASIFICACIÓN DE MÓDULOS

### HECHO (funciona correctamente)

- Dashboard + KPIs + alertas
- POST /entrada, /salida, /traspaso (con caveats de race condition documentados)
- Consulta de stock
- Movimientos por artículo
- Artículos por ubicación
- Artículos sin reposición
- Entrada de mercancía (almacén y logística)
- Salida de mercancía
- Traspasos
- **Picking** (GET + confirmar + desconfirmar)
- **Expediciones**
- Situación pedidos de venta
- Regularizaciones
- Ubicaciones + generar ubicaciones
- Lote mínimo, cuarentena, exclusivo, no utilizado
- Mínimos/máximos
- Observaciones artículo-lote
- Subfamilias
- Almacenes
- Usuarios
- Terminales PDA
- Contadores
- Copia de seguridad (parcial — genera referencia, no backup real)

### A MEDIAS (UI existe, backend stub o naming incorrecto)

- Hojas de ruta (muestra expediciones, no hojas de ruta reales)
- Borrar picking (UI OK, backend stub)
- Poner a cero carrusel (UI OK, backend stub)
- Traspaso inventario/regularización (UI OK, backend stubs)
- Configuración empresa (GET OK, POST stub)

### ROTO (existe en código pero no funciona)

- Informes (página sin implementar)
- SGA.estadisticas.* en api.js — 9 métodos sin endpoints correspondientes

### PENDIENTE (no existe)

- Tests de UI/integración frontend
- Hojas de ruta reales (si son diferentes de expediciones)
- Backup de BD real (actualmente solo genera una referencia string)
- Tests de lotes, config en CI

---

*Auditoría realizada el 2026-05-18. Basada exclusivamente en el código real encontrado en la rama `paco-clean`.*
*No se modificó ningún archivo. No se refactorizó nada.*
