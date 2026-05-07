"use strict";

const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();
const q = (pool) => pool.request();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

router.get('/visor/articulos', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT TOP 300
                a.ARTCOD AS articulo, a.ARTNOM AS nombre,
                a.ARTGRUCOD AS familia,
                ISNULL((SELECT SUM(STOCAN) FROM STOCK WHERE STOARTCOD=a.ARTCOD),0) AS stock,
                ISNULL((SELECT TOP 1 STOUBI FROM STOCK WHERE STOARTCOD=a.ARTCOD AND STOCAN>0 ORDER BY STOUBI),'') AS ubicacion,
                ISNULL((SELECT TOP 1 CONVERT(varchar,ACSFEC,23) FROM ALBARANCS WHERE ACSARTCOD=a.ARTCOD ORDER BY ACSFEC DESC),'') AS ultimo_movimiento
                FROM ARTICULO a
                WHERE a.ARTCOD LIKE @b OR a.ARTNOM LIKE @b OR a.ARTCOD2 LIKE @b
                ORDER BY a.ARTCOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.get('/visor/proveedores', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT TOP 300
                CLICOD AS codigo, CLINOM AS nombre,
                CLINIF AS cif, CLITEL AS telefono, CLIPOSCIU AS localidad
                FROM PROVEEDOR
                WHERE CLICOD LIKE @b OR CLIRAZ LIKE @b OR CLINOM LIKE @b
                ORDER BY CLICOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.get('/visor/clientes', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT TOP 300
                CLICOD AS codigo, CLINOM AS nombre,
                CLINIF AS cif, CLITEL AS telefono, CLIPOSCIU AS localidad
                FROM CLIENTE
                WHERE CLICOD LIKE @b OR CLIRAZ LIKE @b OR CLINOM LIKE @b
                ORDER BY CLICOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

module.exports = router;
