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
    } catch (err) { console.error("[ERROR]", err.message || err); res.status(500).json({ ok: false, error: "Error interno del servidor" }); }
});

module.exports = router;
