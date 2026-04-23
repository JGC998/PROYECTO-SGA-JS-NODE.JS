Ejemplo del archivo db.js que debe ir en este mismo directorio, solamente sería necesario borrar la extensión .md,
y usar las credenciales correctas en la variable dbConfig.

const sql = require('mssql');

const dbConfig = {
    user: 'usuario',
    password: 'contraseña',
    server: 'servidor',
    port: 1433,
    database: 'base_de_datos',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
        console.log('✅ Conectado a SQL Server');
        return pool;
    })
    .catch(err => console.log('❌ Error de Conexión: ', err));

module.exports = { sql, poolPromise };