"use strict";

const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();
const q = (pool) => pool.request();

router.get('/health', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query('SELECT @@VERSION AS version, DB_NAME() AS db');
        res.json({ ok: true, db: r.recordset[0].db, version: r.recordset[0].version });
    } catch {
        // App sana, BD no disponible — no devolver 500 para no disparar alertas de salud del proceso
        res.json({ ok: true, db: null, dbStatus: 'unavailable' });
    }
});

module.exports = router;
