"use strict";

const { Router } = require('express');
const { getPool } = require('../db');
const { serverError, parsePagination } = require('../middleware/error');

const router = Router();
const q = (pool) => pool.request();


// ─── SITUACIÓN PEDIDOS DE VENTA ───────────────────────────────────────────────

router.get('/situacion-pedidos-venta', async (req, res) => {
    try {
        const pool = await getPool();
        const { cliente = '', articulo = '', desde, hasta } = req.query;
        const { page, pageSize } = parsePagination(req.query);
        const fechaD = desde || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
        const fechaH = hasta || new Date().toISOString().split('T')[0];
        const r = await q(pool)
            .input('cli', `%${cliente}%`).input('art', `%${articulo}%`)
            .input('desde', fechaD).input('hasta', fechaH)
            .input('page', page).input('pageSize', pageSize)
            .query(`SELECT
                al.ACSNUM AS albaran, al.ACSSER AS serie,
                al.ACSCLICOD AS cliente, al.ACSCLINOM AS nombre_cliente,
                al.ACSARTCOD AS articulo,
                ISNULL(art.ARTNOM, al.ACSARTCOD) AS nombre_articulo,
                al.ACSCAN AS cantidad, al.ACSUBI AS ubicacion,
                CONVERT(varchar, al.ACSFEC, 23) AS fecha, al.ACSMOV AS tipo
                FROM ALBARANCS al
                LEFT JOIN ARTICULO art ON art.ARTCOD = al.ACSARTCOD
                WHERE al.ACSMOV IN ('PC','SA')
                AND al.ACSCLICOD LIKE @cli AND al.ACSARTCOD LIKE @art
                AND CAST(al.ACSFEC AS DATE) BETWEEN @desde AND @hasta
                ORDER BY al.ACSFEC DESC
                OFFSET (@page * @pageSize) ROWS FETCH NEXT @pageSize ROWS ONLY`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

module.exports = router;
