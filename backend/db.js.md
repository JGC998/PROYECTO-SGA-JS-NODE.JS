Plantilla del archivo db.js que debe colocarse en backend/db.js (sin extensión .md).
Este archivo NO se versiona. Requiere Windows Authentication y ODBC Driver 17 instalado.

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
                console.log('✅ Conectado a SQL Server (ODBC Driver 17 for SQL Server)');
                return pool;
            })
            .catch(err => {
                console.log('❌ Error de Conexión:', err);
                poolPromise = null;
                throw err;
            });
    }
    return poolPromise;
}

module.exports = { sql, getPool };
