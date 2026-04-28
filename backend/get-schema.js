const { getPool } = require('./db');

getPool().then(async pool => {
    const r = await pool.request().query(`
        SELECT t.name AS tabla, c.name AS columna, tp.name AS tipo, c.max_length
        FROM sys.tables t
        JOIN sys.columns c ON c.object_id = t.object_id
        JOIN sys.types tp ON tp.user_type_id = c.user_type_id
        ORDER BY t.name, c.column_id
    `);
    const schema = {};
    for (const row of r.recordset) {
        if (!schema[row.tabla]) schema[row.tabla] = [];
        schema[row.tabla].push(`${row.columna} (${row.tipo})`);
    }
    console.log(JSON.stringify(schema, null, 2));
    process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
