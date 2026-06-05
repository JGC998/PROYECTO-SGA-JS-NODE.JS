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
│   ├── routes/             # Capa HTTP: extrae parámetros, valida, responde
│   │   ├── movimientos.routes.js
│   │   ├── almacen.routes.js       # Visor 3D, picking, SSE, QR, notificaciones
│   │   ├── analytics.routes.js
│   │   ├── config.routes.js
│   │   ├── terceros.routes.js
│   │   ├── visor.routes.js
│   │   ├── stock.routes.js
│   │   ├── articulos.routes.js
│   │   ├── ubicaciones.routes.js
│   │   ├── lotes.routes.js
│   │   ├── escrituras.routes.js
│   │   ├── picking.routes.js
│   │   ├── admin.routes.js
│   │   ├── health.routes.js
│   │   └── system.routes.js
│   ├── services/           # Capa de lógica: SQL + reglas de negocio
│   │   ├── analytics.service.js
│   │   ├── config.service.js
│   │   ├── terceros.service.js
│   │   └── visor.service.js
│   ├── sql/                # Scripts de base de datos
│   │   └── 01_schema.sql   # Creación de tablas (idempotente)
│   └── data/               # Datos persistentes del layout del almacén (JSON)
│       ├── distribucion.json
│       ├── picking.json
│       └── ubicaciones.json
└── frontend/
    ├── index.html          # Página de inicio con estadísticas
    ├── css/                # Estilos CSS modulares
    ├── js/                 # Módulos JavaScript (api.js, ui/, ferreteria/, opciones/, ...)
    └── pages/
        ├── ferreteria/             # Consultas de datos maestros
        ├── almacen/                # Visor 3D, mapa aéreo y supervisor de picking
        ├── visor/                  # Visor de clientes
        ├── graficas/               # Gráficas de stock y movimientos
        └── opciones/               # Configuración y operaciones
            ├── almacen-y-stock/
            ├── logistica-y-pedidos/
            ├── control-de-lotes-y-minimos/
            └── sistema/
```

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express 5 |
| Base de datos | SQL Server (mssql 12) |
| Driver BD | mssql 12 + msnodesqlv8 + ODBC Driver 17 |
| Autenticación BD | Windows Authentication (sin credenciales en código) |
| Frontend | HTML5 + CSS3 + Vanilla JS |
| Visor 3D | Three.js |
| Comunicación | REST API + Fetch + SSE (Server-Sent Events) |
| Puerto API | 3000 |

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

## Cómo ejecutar

```bash
# 1. Instalar dependencias del backend
cd backend
npm install

# 2. Arrancar el servidor API
node api.js
# → Escucha en http://localhost:3000
# → El frontend se sirve estáticamente desde /frontend

# 3. Abrir el frontend
# → http://localhost:3000
```

**Requisitos previos:**
- Node.js 18 o superior
- SQL Server con la base de datos `LIN` restaurada
- ODBC Driver 17 for SQL Server instalado en el equipo
- Autenticación Windows activa (sin usuario/contraseña en el código)

Para crear el esquema en una BD nueva:
```bash
sqlcmd -S localhost -d LIN -E -i backend/sql/01_schema.sql
```

---

## Flujo Git recomendado

```bash
git checkout main
git pull

git checkout -b feature/nombre-descriptivo

# trabajar...

git add backend/routes/x.routes.js
git commit -m "feat: descripción breve"
git push -u origin feature/nombre-descriptivo
# → abrir PR hacia main
```

---

## Módulos implementados

### Inicio y Gráficas
| Pantalla | Descripción |
|---|---|
| `index.html` | Inicio con estadísticas de stock en tiempo real |
| `graficas/` | Gráficas de movimientos y stock por artículo/ubicación |

### Ferretería (consultas de datos maestros)
| Pantalla | Descripción |
|---|---|
| `ferreteria/articulos.html` | Maestro de artículos con búsqueda |
| `ferreteria/proveedores.html` | Gestión de proveedores con historial de entradas |
| `ferreteria/operarios.html` | Gestión de operarios |

### Almacén
| Pantalla | Descripción |
|---|---|
| `almacen/mapa-3d.html` | Visor 3D interactivo del almacén (navegación en primera persona) |
| `almacen/supervisor.html` | Supervisor de picking con generación de rutas y QR para móvil |
| `almacen/movil.html` | Interfaz móvil para que el operario complete la ruta de picking |
| `almacen/editor.html` | Editor visual de la distribución física del almacén |

### Visor
| Pantalla | Descripción |
|---|---|
| `visor/clientes.html` | Consulta de clientes de solo lectura |

### Opciones — Almacén y Stock
| Pantalla | Descripción |
|---|---|
| `almacenes` | Maestro de almacenes |
| `ubicaciones` | Gestión de ubicaciones (ancho, alto, palets, exclusiva...) |
| `generar-ubicaciones` | Generación automática de ubicaciones por pasillo, lateral, columna y altura |
| `mapa-almacen` | Mapa aéreo del almacén con filtros y detalle de cada ubicación |
| `entrada-de-mercancia` | Registro de entrada de mercancía |
| `salida-de-mercancia` | Registro de salida con validación de stock disponible |
| `traspasos` | Movimiento de stock entre ubicaciones (transaccional) |
| `regularizaciones` | Regularizaciones de inventario |
| `movimientos-por-articulo` | Histórico de movimientos filtrado por artículo/lote/periodo |
| `consulta-de-stock` | Consulta avanzada de stock |
| `alertas-stock` | Alertas de stock bajo o negativo |

### Opciones — Logística y Pedidos
| Pantalla | Descripción |
|---|---|
| `expediciones` | Expediciones desde pedido de venta |
| `situacion-pedidos-venta` | Histórico de ventas y situación de pedidos |
| `hojas-de-ruta` | Albaranes de expedición y hojas de ruta |
| `picking` | Preparación y confirmación de picking |

### Opciones — Control de Lotes y Mínimos
| Pantalla | Descripción |
|---|---|
| `lote-minimo` | Días mínimos de lote por cliente |
| `lote-cuarentena` | Lotes en cuarentena por artículo |
| `lote-exclusivo` | Lotes exclusivos por cliente y artículo |
| `minimos-maximos` | Stock mínimo y máximo por artículo |
| `lote-no-utilizado` | Lotes no utilizados por cliente y artículo |
| `observaciones-por-articulo-lote` | Observaciones vinculadas a artículo y lote |
| `subfamilias` | Maestro de subfamilias de artículos |

### Opciones — Sistema
| Pantalla | Descripción |
|---|---|
| `usuarios` | Gestión de usuarios del sistema |
| `configuracion-empresa` | Datos de la empresa |
| `terminales-pda` | Configuración de terminales PDA |
| `contadores` | Contadores del sistema |
| `copia-seguridad` | Generación de copia de seguridad |

---

## Base de datos

SQL Server local — base de datos `LIN` — autenticación Windows (sin usuario/contraseña).

**Requisito:** ODBC Driver 17 for SQL Server instalado en el equipo.

Tablas principales: `ARTICULO`, `STOCK`, `UBICACION`, `ALBARANCS`, `PROVEEDOR`, `CLIENTE`, `SGAUSUARIO`, `ALMACENES`, `SUBFAMILIA`, `terminalpda`, `LOG`, `ARTICULOSTOMIN`, `ARTICULOLOTCLI`, `ARTICULOEXCLOTCLI`, `ARTICULOLOTOBS`, `SGANOTIFICACION`.

El esquema completo se encuentra en `backend/sql/01_schema.sql` y es idempotente (se puede ejecutar varias veces sin errores).

---

## Tiempo real

El módulo de supervisor de picking usa **SSE (Server-Sent Events)** para notificar al supervisor en tiempo real cuando un operario completa una parada o finaliza una ruta, sin necesidad de recargar la página.

El operario accede a su ruta escaneando un **código QR** generado dinámicamente con la IP local del servidor, lo que permite usar el móvil dentro de la red sin configuración adicional.
