"use strict";

const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();
const q = (pool) => pool.request();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

// ─── EXPEDICIONES ─────────────────────────────────────────────────────────────

router.get('/expediciones', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '', desde, hasta } = req.query;
        const fechaD = desde || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
        const fechaH = hasta || new Date().toISOString().split('T')[0];
        const r = await q(pool)
            .input('b', `%${buscar}%`)
            .input('desde', fechaD)
            .input('hasta', fechaH)
            .query(`SELECT TOP 500
                ACSNUM AS albaran, ACSSER AS serie,
                ACSCLICOD AS cliente, ACSCLINOM AS nombre_cliente,
                CONVERT(varchar,ACSFEC,23) AS fecha,
                ACSNUMPIC AS picking, ACSMOV AS tipo,
                ACSARTCOD AS articulo,
                (SELECT TOP 1 ARTNOM FROM ARTICULO WHERE ARTCOD=ACSARTCOD) AS nombre_articulo,
                ACSCAN AS cantidad,
                ACSUBI AS ubicacion,
                ACSLOT AS lote
                FROM ALBARANCS
                WHERE ACSMOV='PC' AND RTRIM(ACSSER) <> 'PLIN'
                AND (ACSCLICOD LIKE @b OR ACSCLINOM LIKE @b
                     OR CAST(ACSNUM AS varchar) LIKE @b OR ACSSER LIKE @b)
                AND CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
                ORDER BY ACSFEC DESC, ACSNUM DESC`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

module.exports = router;
