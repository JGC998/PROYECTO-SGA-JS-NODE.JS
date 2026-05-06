"use strict";

const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();
const q = (pool) => pool.request();

const TABLAS_PERMITIDAS = new Set(['ARTICULO', 'STOCK', 'UBICACION', 'PROVEEDOR', 'CLIENTE', 'ALBARANCS', 'ALMACENES']);

router.get('/schema', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query(`
            SELECT t.name AS tabla, c.name AS columna, tp.name AS tipo, c.max_length
            FROM sys.tables t
            JOIN sys.columns c ON c.object_id = t.object_id
            JOIN sys.types tp ON tp.user_type_id = c.user_type_id
            ORDER BY t.name, c.column_id`);
        const schema = {};
        for (const row of r.recordset) {
            if (!schema[row.tabla]) schema[row.tabla] = [];
            schema[row.tabla].push(`${row.columna} (${row.tipo})`);
        }
        res.json(schema);
    } catch (err) { console.error("[ERROR]", err.message || err); res.status(500).json({ error: 'Error interno del servidor' }); }
});

router.get('/tablas', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query('SELECT name FROM sys.tables ORDER BY name');
        res.json(r.recordset);
    } catch (err) { console.error("[ERROR]", err.message || err); res.status(500).send('Error interno del servidor'); }
});

router.get('/datos/:tabla', async (req, res) => {
    try {
        const tabla = (req.params.tabla || '').toUpperCase();

        if (!/^[a-zA-Z0-9_]+$/.test(tabla)) {
            return res.status(400).send('Nombre de tabla no válido');
        }

        if (!TABLAS_PERMITIDAS.has(tabla)) {
            return res.status(403).json({ error: 'Tabla no permitida' });
        }

        const pool = await getPool();
        const r = await q(pool).query(`SELECT TOP 100 * FROM [${tabla}]`);
        res.json(r.recordset);
    } catch (err) { console.error("[ERROR]", err.message || err); res.status(500).send('Error interno del servidor'); }
});

module.exports = router;
