"use strict";

const { Router } = require('express');
const { getPool } = require('../db');
const { serverError, parsePagination, sendCsv } = require('../middleware/error');

const router = Router();
const q = (pool) => pool.request();


// ─── EXPEDICIONES ─────────────────────────────────────────────────────────────

router.get('/expediciones', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '', desde, hasta } = req.query;
        const csv = req.query.format === 'csv';
        const { page, pageSize } = parsePagination(req.query);
        const fechaD = desde || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
        const fechaH = hasta || new Date().toISOString().split('T')[0];
        const qb = q(pool)
            .input('b', `%${buscar}%`)
            .input('desde', fechaD)
            .input('hasta', fechaH);
        if (!csv) { qb.input('page', page).input('pageSize', pageSize); }
        const r = await qb.query(`SELECT
                e.ACSNUM AS albaran, e.ACSSER AS serie,
                e.ACSCLICOD AS cliente, e.ACSCLINOM AS nombre_cliente,
                CONVERT(varchar, e.ACSFEC, 23) AS fecha,
                e.ACSNUMPIC AS picking, e.ACSMOV AS tipo,
                e.ACSARTCOD AS articulo,
                ISNULL(art.ARTNOM, e.ACSARTCOD) AS nombre_articulo,
                e.ACSCAN AS cantidad,
                e.ACSUBI AS ubicacion,
                e.ACSLOT AS lote
                FROM ALBARANCS e
                LEFT JOIN ARTICULO art ON art.ARTCOD = e.ACSARTCOD
                WHERE e.ACSMOV='PC' AND RTRIM(e.ACSSER) <> 'PLIN'
                AND (e.ACSCLICOD LIKE @b OR e.ACSCLINOM LIKE @b
                     OR CAST(e.ACSNUM AS varchar) LIKE @b OR e.ACSSER LIKE @b)
                AND CAST(e.ACSFEC AS DATE) BETWEEN @desde AND @hasta
                ORDER BY e.ACSFEC DESC, e.ACSNUM DESC
                ${csv ? '' : 'OFFSET (@page * @pageSize) ROWS FETCH NEXT @pageSize ROWS ONLY'}`);
        if (csv) return sendCsv(res, 'expediciones.csv', r.recordset);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

module.exports = router;
