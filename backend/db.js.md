# backend/db.js — Plantilla de conexión a SQL Server

Este archivo NO se versiona (ver .gitignore). Crear manualmente según entorno.

---

## Opción A — Linux / Docker Compose (desarrollo local)

Usa el driver `mssql` (tedious, sin ODBC nativo). Funciona en Linux sin instalar nada extra.
El archivo `backend/db.js` ya está creado con esta configuración apuntando al contenedor Docker.

Variables de entorno (todas opcionales, con defaults para Docker local):

| Variable    | Default      | Descripción                |
|-------------|-------------|----------------------------|
| DB_SERVER   | localhost    | Host del SQL Server        |
| DB_PORT     | 1433         | Puerto TCP                 |
| DB_NAME     | SGALIN       | Nombre de la base de datos |
| DB_USER     | sa           | Usuario                    |
| DB_PASSWORD | SgaLocal2024!| Contraseña                 |

Ver `DOCKER-DEV.md` para instrucciones de arranque completas.

---

## Opción B — Windows / SQL Server local con Windows Authentication

Requiere ODBC Driver 17 instalado y SQL Server en la misma máquina.

```js
"use strict";
const sql = require('mssql/msnodesqlv8');

const dbConfig = {
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=LIN;Trusted_Connection=Yes;'
};

let poolPromise = null;

async function getPool() {
    if (!poolPromise) {
        poolPromise = new sql.ConnectionPool(dbConfig)
            .connect()
            .then(pool => {
                console.log('✅ Conectado a SQL Server (Windows Auth)');
                return pool;
            })
            .catch(err => {
                console.error('❌ Error de conexión:', err.message);
                poolPromise = null;
                throw err;
            });
    }
    return poolPromise;
}

module.exports = { sql, getPool };
```
