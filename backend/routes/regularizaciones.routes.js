"use strict";

const { Router } = require('express');
const { getPool } = require('../db');
const { serverError, parsePagination, sendCsv } = require('../middleware/error');

const router = Router();
const q = (pool) => pool.request();


// ─── REGULARIZACIONES ─────────────────────────────────────────────────────────

router.get('/regularizaciones', async (req, res) => {
    try {
        const pool = await getPool();
        const { articulo = '', desde, hasta } = req.query;
        const csv = req.query.format === 'csv';
        const { page, pageSize } = parsePagination(req.query);
        const fechaD = desde || '2000-01-01';
        const fechaH = hasta || new Date().toISOString().split('T')[0];
        const qb = q(pool)
            .input('art', `%${articulo}%`)
            .input('desde', fechaD).input('hasta', fechaH);
        if (!csv) { qb.input('page', page).input('pageSize', pageSize); }
        const r = await qb.query(`SELECT
                CONVERT(varchar,ACSFEC,23) AS fecha,
                al.ACSSER AS serie, al.ACSNUM AS numero,
                al.ACSMOV AS tipo,
                al.ACSARTCOD AS articulo,
                ISNULL(art.ARTNOM, al.ACSARTCOD) AS nombre,
                al.ACSUBI AS ubicacion, al.ACSLOT AS lote, al.ACSCAN AS cantidad,
                al.ACSCLICOD AS tercero, al.ACSCLINOM AS nombre_tercero
                FROM ALBARANCS al
                LEFT JOIN ARTICULO art ON art.ARTCOD = al.ACSARTCOD
                WHERE al.ACSARTCOD LIKE @art
                AND CAST(al.ACSFEC AS DATE) BETWEEN @desde AND @hasta
                ORDER BY al.ACSFEC DESC
                ${csv ? '' : 'OFFSET (@page * @pageSize) ROWS FETCH NEXT @pageSize ROWS ONLY'}`);
        if (csv) return sendCsv(res, 'regularizaciones.csv', r.recordset);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

module.exports = router;
