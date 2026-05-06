# SGA LIN — Sistema de Gestión de Almacén

Sistema web de gestión y control de inventario para el almacén de **LIN**, desarrollado con Node.js en el backend y Vanilla JS en el frontend. Digitaliza el flujo completo de mercancías: entradas, salidas, traspasos, trazabilidad por lotes y consulta de stock en tiempo real.

> **Estado:** En desarrollo activo — las funcionalidades se implementan de forma incremental.

---

## Arquitectura

```
SGA/
├── backend/
│   ├── api.js          # Servidor Express + todos los endpoints REST
│   ├── db.js           # Pool de conexión a SQL Server (no versionado)
│   └── package.json
└── frontend/
    ├── index.html      # Dashboard principal
    ├── css/            # Estilos CSS modulares (espejo de pages/)
    ├── js/             # Módulos JavaScript (api.js, navegacion.js, ...)
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

## API REST

Base URL: `http://localhost:3000`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/stats` | Estadísticas del dashboard |
| GET | `/datos/:tabla` | TOP 100 registros de cualquier tabla |
| GET | `/tablas` | Lista de tablas de la BD |
| POST | `/entrada` | Registrar entrada de mercancía |
| POST | `/salida` | Registrar salida de mercancía |
| POST | `/traspaso` | Mover stock entre ubicaciones |
| POST | `/maestro-articulo` | Crear nuevo artículo |
| POST | `/maestro-ubicacion` | Crear nueva ubicación |

---

## Base de datos

SQL Server local — base de datos `LIN` — autenticación Windows (sin usuario/contraseña).

**Requisito:** ODBC Driver 17 for SQL Server instalado en el equipo.

Tablas principales: `ARTICULO`, `STOCK`, `UBICACION`, `PROVEEDOR`, `CLIENTE`, `ALBARANCS`, `ALMACENES`.

La cadena de conexión se mantiene en `backend/db.js` (no versionado). Usar `backend/db.js.md` como plantilla.

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

---

## Convenciones del proyecto

- Cada pantalla tiene su propio CSS en `frontend/css/<módulo>/<pantalla>/index.css`.
- La navegación lateral se inyecta dinámicamente desde `frontend/js/navegacion.js`.
- Las llamadas a la API se centralizan en `frontend/js/api.js`.
- Los colores y tipografía base están definidos como variables CSS en `frontend/css/styles.css`.
