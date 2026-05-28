# Instrucciones de integración — rama `feat/almacen-3d` → `paco-clean`

Esta rama fue desarrollada en **Linux** con SQL Server corriendo en Docker.
Toda la lógica de negocio es compatible con Windows, pero hay cuatro archivos
relacionados con la BD y el entorno que debes sustituir por los equivalentes
de tu rama.

---

## 1. Contexto: qué es diferente en esta rama

| Elemento | Esta rama (Linux) | Tu rama `paco-clean` (Windows) |
|---|---|---|
| Driver de BD | `mssql` (tedious, puro JS) | `mssql/msnodesqlv8` (necesita ODBC 17) |
| Autenticación | Usuario `sa` + contraseña | Windows Authentication (`Trusted_Connection`) |
| BD | SQL Server en Docker | SQL Server instalado en Windows |
| Arranque | `start.sh` + `docker compose` | Abrir SQL Server directamente |
| `backend/db.js` | Versionado en el repo | **NO versionado** (está en `.gitignore`) |

---

## 2. Archivos que debes IGNORAR o reemplazar

Estos archivos son exclusivos del entorno Linux y no sirven en Windows:

- `docker-compose.yml` — lanza SQL Server en un contenedor Docker; no lo uses
- `DOCKER-DEV.md` — instrucciones del entorno Docker; no aplica
- `start.sh` — script de arranque Linux; no aplica
- **`backend/db.js`** — este es el crítico; ver sección 3

---

## 3. Cómo adaptar `backend/db.js`

### El problema

En esta rama `backend/db.js` está versionado y usa el driver `mssql` (tedious):

```js
// Lo que hay en esta rama — NO usar en Windows
const sql = require('mssql');
const config = {
    server:   process.env.DB_SERVER || 'localhost',
    user:     process.env.DB_USER   || 'sa',
    password: process.env.DB_PASSWORD,      // necesita variable de entorno
    // ...
};
```

Esto fallará en Windows porque:
1. No usa Windows Authentication
2. No tiene ODBC Driver 17 (el que ya tienes instalado)
3. Necesita `DB_PASSWORD` como variable de entorno

### La solución

Crea (o restaura) tu `backend/db.js` con el driver de Windows. Aquí tienes
la versión mejorada que incorpora el **cooldown de reconexión** que añadí
en esta rama (evita spam de errores en consola cuando SQL Server no responde):

```js
"use strict";

/**
 * Conexión a SQL Server via msnodesqlv8 (Windows Authentication + ODBC Driver 17).
 * Este archivo NO se versiona — crearlo manualmente en cada máquina Windows.
 */

const sql = require('mssql/msnodesqlv8');

const dbConfig = {
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=LIN;Trusted_Connection=Yes;'
};

let poolPromise  = null;
let _lastFailAt  = 0;
const _RETRY_MS  = 30_000; // esperar 30s entre intentos de reconexión

async function getPool() {
    if (!poolPromise) {
        const timeSinceFail = Date.now() - _lastFailAt;
        if (_lastFailAt > 0 && timeSinceFail < _RETRY_MS) {
            throw new Error('SQL Server no disponible (BD no accesible)');
        }
        poolPromise = new sql.ConnectionPool(dbConfig)
            .connect()
            .then(pool => {
                console.log('✅ Conectado a SQL Server (Windows Auth)');
                _lastFailAt = 0;
                pool.on('error', () => { poolPromise = null; }); // auto-reset si el pool muere
                return pool;
            })
            .catch(err => {
                console.error('❌ SQL Server no disponible:', err.message);
                _lastFailAt = Date.now();
                poolPromise = null;
                throw err;
            });
    }
    return poolPromise;
}

module.exports = { sql, getPool };
```

> Si tu base de datos no se llama `LIN`, cambia `Database=LIN` por el nombre correcto.

---

## 4. Arrancar el proyecto en Windows

Con tu `backend/db.js` de Windows Authentication ya en su sitio:

```bash
# En la raíz del proyecto
cd backend
node api.js
```

No hace falta ningún paso de Docker. SQL Server ya corre como servicio de Windows.

---

## 5. Qué hay de nuevo en esta rama (resumen funcional)

Estas son las funcionalidades añadidas que sí son compatibles con Windows
sin ningún cambio adicional:

### Trazabilidad de movimientos (`/opciones/almacen-y-stock/movimientos-por-articulo`)
- Nuevo filtro **Operario / Terminal** que filtra por `ACSREPCOD` en la tabla `ALBARANCS`
- El campo en la query es: `AND s.ACSREPCOD LIKE @ter`

### Modo offline en móvil (`/movil`)
- Cola en **IndexedDB** para validaciones e incidencias cuando no hay red
- Barra de estado inferior que indica conexión / pendientes / sincronizando
- Sync automático al recuperar conexión

### Mejora de logs de conexión
- `backend/middleware/error.js` ya no duplica en consola los errores de BD
  (se loguea solo una vez en `db.js`)
- El pool de conexión tiene cooldown de 30 s entre reintentos

---

## 6. Archivos que puedes incorporar directamente (sin cambios)

Estos archivos son neutrales respecto al SO y mejoran el proyecto:

| Archivo | Qué aporta |
|---|---|
| `backend/middleware/error.js` | Supresión de logs de BD duplicados |
| `backend/routes/stock.routes.js` | Filtro de terminal en movimientos por artículo |
| `frontend/pages/almacen/movil.js` | Modo offline completo |
| `frontend/pages/almacen/movil.css` | Estilos de la barra offline |
| `frontend/pages/opciones/almacen-y-stock/movimientos-por-articulo/index.html` | Campo de filtro terminal |
| `frontend/js/opciones/almacen-y-stock/movimientos-por-articulo-mv.js` | Lógica del filtro terminal |
| `backend/.gitignore` | Excluye `.env`, `node_modules/`, `*.log` del backend |

---

## 7. Archivos a ignorar completamente

No copies ni mezcles estos en tu rama:

- `docker-compose.yml`
- `DOCKER-DEV.md`
- `start.sh`
- `backend/db.js` (usar tu propio `db.js` de Windows; ver sección 3)
- `backend/db.js.md` (ya tienes la plantilla en `paco-clean`)
