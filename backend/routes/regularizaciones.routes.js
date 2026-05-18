"use strict";

const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();
const q = (pool) => pool.request();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

// ─── REGULARIZACIONES ─────────────────────────────────────────────────────────

router.get('/regularizaciones', async (req, res) => {
    try {
        const pool = await getPool();
        const { articulo = '', desde, hasta } = req.query;
        const fechaD = desde || '2000-01-01';
        const fechaH = hasta || new Date().toISOString().split('T')[0];
        const r = await q(pool)
            .input('art', `%${articulo}%`)
            .input('desde', fechaD).input('hasta', fechaH)
            .query(`SELECT TOP 500
                CONVERT(varchar,ACSFEC,23) AS fecha,
                ACSSER AS serie, ACSNUM AS numero,
                ACSARTCOD AS articulo,
                (SELECT TOP 1 ARTNOM FROM ARTICULO WHERE ARTCOD=ACSARTCOD) AS nombre,
                ACSUBI AS ubicacion, ACSLOT AS lote, ACSCAN AS cantidad,
                ACSCLICOD AS tercero, ACSCLINOM AS nombre_tercero
                FROM ALBARANCS
                WHERE ACSMOV='R'
                AND ACSARTCOD LIKE @art
                AND CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
                ORDER BY ACSFEC DESC`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

module.exports = router;
