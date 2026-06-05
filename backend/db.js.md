# backend/db.js — Plantilla de conexión a SQL Server


---


## Windows / SQL Server local con Windows Authentication

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
