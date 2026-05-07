# SGA LIN — Sistema de Gestión de Almacén

Sistema web de gestión y control de inventario para el almacén de **LIN**, desarrollado con Node.js en el backend y Vanilla JS en el frontend. Digitaliza el flujo completo de mercancías: entradas, salidas, traspasos, trazabilidad por lotes y consulta de stock en tiempo real.

---

## Arquitectura

```
SGA/
├── backend/
│   ├── api.js              # Punto de entrada — arranca el servidor en el puerto 3000
│   ├── app.js              # Factory Express — middleware + montaje de todas las rutas
│   ├── db.js               # Pool de conexión a SQL Server (no versionado)
│   ├── routes/             # Capa HTTP: extrae parámetros, valida, responde, llama al servicio
│   │   ├── movimientos.routes.js   # ⚠ NÚCLEO CRÍTICO — ver sección dedicada
│   │   ├── analytics.routes.js
│   │   ├── config.routes.js
│   │   ├── terceros.routes.js
│   │   ├── visor.routes.js
│   │   ├── stock.routes.js
│   │   ├── articulos.routes.js
│   │   ├── ubicaciones.routes.js
│   │   ├── lotes.routes.js
│   │   ├── escrituras.routes.js
│   │   ├── admin.routes.js
│   │   ├── health.routes.js
│   │   └── system.routes.js
│   ├── services/           # Capa de lógica: SQL + reglas de negocio
│   │   ├── analytics.service.js
│   │   ├── config.service.js
│   │   ├── terceros.service.js
│   │   └── visor.service.js
│   └── tests/              # Tests automatizados (Jest + Supertest)
│       ├── dynamic-sql.test.js   # ← único test que corre en CI (sin BD)
│       ├── health.test.js
│       ├── movimientos.test.js
│       ├── nucleo.test.js
│       ├── security.test.js
│       ├── services.test.js
│       └── stock.test.js
└── frontend/
    ├── index.html          # Dashboard principal
    ├── css/                # Estilos CSS modulares (espejo de pages/)
    ├── js/                 # Módulos JavaScript (api.js, navegacion.js, ...)
    └── pages/
        ├── ferreteria/             # Módulo principal de operaciones
        ├── visor/                  # Visor de datos maestros
        ├── acerca_de/              # Información del sistema
        └── opciones/               # Configuración y ajustes avanzados
            ├── almacen-y-stock/
            ├── logistica-y-pedidos/
            ├── control-de-lotes-y-minimos/
            └── sistema/
```

### Separación routes / services

| Capa | Responsabilidad | Lo que NO debe hacer |
|---|---|---|
| `routes/` | Extraer params de req, validar input, responder HTTP, decidir 404 | Contener SQL, lógica de negocio |
| `services/` | SQL queries, lógica de negocio, cálculos | Conocer req/res, lanzar errores HTTP |

> Los routes de `stock`, `articulos`, `ubicaciones`, `lotes`, `escrituras` y `admin` todavía contienen su SQL directamente (no se han extraído a servicios). El núcleo `movimientos.routes.js` permanece intencionadamente sin tocar.

---

## ⚠ Núcleo crítico — movimientos.routes.js

`/entrada`, `/salida` y `/traspaso` son los tres endpoints que modifican stock real.

- Contienen las transacciones SQL más complejas del sistema
- Un error aquí afecta el inventario físico de forma irreversible
- **Regla:** No modificar sin tests de regresión verificados antes y después

Los tests de cobertura del núcleo están en `tests/movimientos.test.js` y `tests/nucleo.test.js`.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express 5 |
| Base de datos | SQL Server (mssql 12) |
| Driver BD | mssql 12 + msnodesqlv8 + ODBC Driver 17 |
| Autenticación BD | Windows Authentication (sin credenciales en código) |
| Frontend | HTML5 + CSS3 + Vanilla JS |
| Comunicación | REST API + Fetch |
| Puerto API | 3000 |
| Puerto frontend | 5500 (Live Server) |

---

## Seguridad aplicada

| Medida | Implementación |
|---|---|
| Cabeceras HTTP seguras | `helmet` activo en `app.js` |
| Rate limiting | 200 req / 15 min por IP (`express-rate-limit`) |
| SQL dinámico controlado | Whitelist en `GET /datos/:tabla`; regex bloquea inyecciones |
| Sanitización de errores | Los handlers capturan excepciones y devuelven `"Error interno del servidor"` — nunca stack traces ni mensajes SQL internos |
| Parámetros SQL | `mssql` parametrized queries en todos los endpoints — no concatenación de strings |

---

## Testing

```bash
# Todos los tests (requiere BD LIN local activa)
cd backend
npm test          # 80 tests

# Solo tests sin BD (los que corre CI)
npm run test:ci   # tests/dynamic-sql.test.js

# Lint
npm run lint
```

### Qué cubren los tests

| Fichero | Qué cubre |
|---|---|
| `dynamic-sql.test.js` | Whitelist SQL, SQL injection, sanitización de errores, validación de rango |
| `security.test.js` | Cabeceras helmet, rate limit headers |
| `health.test.js` | `/health` responde 200 |
| `stock.test.js` | Consultas de stock contra BD real |
| `movimientos.test.js` | Flujo entrada/salida/traspaso con BD real |
| `nucleo.test.js` | Validaciones del núcleo crítico |
| `services.test.js` | Funciones puras de `analytics.service` (`normalizeDate`, `daysAgo`) |

### Qué NO cubren todavía

- Los endpoints de `config`, `terceros`, `visor`, `articulos`, `ubicaciones`, `lotes` no tienen tests de integración propios.
- Los tests de BD dependen de datos reales en la instancia local — no hay fixtures ni BD de test aislada.

---

## CI — GitHub Actions

Fichero: `.github/workflows/ci.yml`

Se ejecuta en push y PR a `main` y `paco-dev`.

```
1. checkout
2. npm ci
3. npm run lint
4. npm run test:ci   ← solo dynamic-sql.test.js, no requiere BD
```

Los tests de integración (health, stock, movimientos) se ejecutan únicamente en local con `npm test`, ya que requieren la BD LIN.

---

## Cómo ejecutar

```bash
# 1. Instalar dependencias del backend
cd backend
npm install

# 2. Arrancar el servidor API
node api.js
# → Escucha en http://localhost:3000

# 3. Abrir el frontend
# Usar Live Server de VS Code o cualquier servidor estático
# → http://127.0.0.1:5500/frontend/index.html
```

**Requisito previo:** La BD LIN debe estar accesible con autenticación Windows. Configurar `backend/db.js` usando `backend/db.js.md` como plantilla.

---

## Flujo Git recomendado

```bash
git checkout main
git pull

git checkout -b feature/nombre-descriptivo

# trabajar...
npm test
npm run lint

git add backend/routes/x.routes.js backend/services/x.service.js
git commit -m "feat: descripción breve"
git push -u origin feature/nombre-descriptivo
# → abrir PR hacia main
```

- No hacer commit directamente a `main`.
- No saltarse `npm run lint` antes de hacer push.
- Los tests de BD se ejecutan en local antes del PR.

---

## Riesgos conocidos

| Riesgo | Endpoint | Descripción |
|---|---|---|
| ⚠ TOCTOU | `POST /salida` | Se comprueba stock disponible y luego se descuenta en dos operaciones separadas. Bajo carga concurrente, dos salidas simultáneas pueden pasar la comprobación y dejar stock negativo. |
| ⚠ Race condition | `POST /entrada` | La comprobación de existencia del artículo y la inserción no están dentro de una transacción. Dos entradas simultáneas del mismo artículo nuevo pueden intentar INSERT al mismo tiempo. |
| ✔ Rollback correcto | `POST /traspaso` | El traspaso usa transacción SQL explícita — si falla el segundo movimiento se revierte el primero. |

Estos riesgos están documentados y conocidos. No afectan en el uso normal de un único usuario. Requieren solución antes de despliegue multiusuario.

---

## Reglas de desarrollo

1. **No meter SQL en routes nuevas.** El SQL va en `services/`.
2. **Routes finas.** Un route handler no debe superar ~10 líneas. Si crece, algo de lógica pertenece al servicio.
3. **La validación HTTP (400, 404) se queda en el route.** Los services devuelven `null` para "no encontrado" — la decisión de responder 404 la toma el route.
4. **No tocar `movimientos.routes.js` sin ejecutar `npm test` antes y después** y verificar que los tests de núcleo siguen en verde.
5. **No añadir features sin tests.** Al menos un test de validación de input por endpoint nuevo.

---

## Módulos implementados

### Ferretería (operaciones diarias)
| Pantalla | Descripción |
|---|---|
| `ferreteria/index.html` | Dashboard con estadísticas de stock en tiempo real |
| `ferreteria/entradas.html` | Registro de entrada de mercancía (crea artículo si no existe) |
| `ferreteria/salidas.html` | Registro de salida con validación de stock disponible |
| `ferreteria/traspasos.html` | Movimiento de stock entre ubicaciones (transaccional) |
| `ferreteria/articulos.html` | Maestro de artículos con búsqueda |
| `ferreteria/proveedores.html` | Gestión de proveedores |
| `ferreteria/operarios.html` | Gestión de operarios |

### Opciones — Almacén y Stock
| Pantalla | Descripción |
|---|---|
| `almacenes` | Maestro de almacenes |
| `ubicaciones` | Gestión de ubicaciones (ancho, alto, palets, exclusiva...) |
| `generar-ubicaciones` | Generación automática de ubicaciones por rango |
| `articulos-por-ubicacion` | Consulta de artículos agrupados por ubicación |
| `articulos-sin-reposicion` | Artículos sin reposición automática configurada |
| `movimientos-por-articulo` | Histórico de movimientos filtrado por artículo/lote/periodo |
| `traspaso-inventario-regularizacion` | Importación de inventarios desde Excel y regularizaciones |
| `consulta-de-stock` | Consulta avanzada de stock con pestañas (tabla, gráfico, informe) |

### Opciones — Logística y Pedidos
| Pantalla | Descripción |
|---|---|
| `expediciones` | Expediciones desde pedido de venta |
| `hojas-de-ruta` | Gestión de hojas de ruta para reparto |

### Opciones — Control de Lotes y Mínimos
| Pantalla | Descripción |
|---|---|
| `lote-cuarentena` | Lotes en cuarentena por artículo |
| `lote-exclusivo` | Lotes exclusivos por cliente y artículo |
| `lote-minimo` | Control de stock mínimo |
| `lote-no-utilizado` | Artículos sin movimiento |
| `observaciones-por-articulo-lote` | Observaciones vinculadas a artículo y lote |
| `subfamilias` | Maestro de subfamilias de artículos |

### Opciones — Sistema
| Pantalla | Descripción |
|---|---|
| `terminales-pda` | Configuración de terminales PDA (serie, rutas de sincronización) |

### Visor
Consulta de datos maestros de solo lectura: artículos, proveedores, clientes.

---

## Base de datos

SQL Server local — base de datos `LIN` — autenticación Windows (sin usuario/contraseña).

**Requisito:** ODBC Driver 17 for SQL Server instalado en el equipo.

Tablas principales: `ARTICULO`, `STOCK`, `UBICACION`, `PROVEEDOR`, `CLIENTE`, `SGAUSUARIO`, `ALMACENES`, `SUBFAMILIA`, `terminalpda`, `LOG`.

La cadena de conexión se mantiene en `backend/db.js` (no versionado). Usar `backend/db.js.md` como plantilla.
