"use strict";

const { getPool } = require('../db');

async function getArticulos(buscar) {
    const pool = await getPool();
    const r = await pool.request().input('b', `%${buscar}%`)
        .query(`SELECT TOP 300
            a.ARTCOD AS articulo, a.ARTNOM AS nombre,
            a.ARTGRUCOD AS familia,
            ISNULL(SUM(s.STOCAN), 0) AS stock,
            ISNULL(MIN(CASE WHEN s.STOCAN > 0 THEN s.STOUBI END), '') AS ubicacion,
            ISNULL(MAX(CONVERT(varchar, alb.ACSFEC, 23)), '') AS ultimo_movimiento
            FROM ARTICULO a
            LEFT JOIN STOCK s ON s.STOARTCOD = a.ARTCOD
            LEFT JOIN ALBARANCS alb ON alb.ACSARTCOD = a.ARTCOD
            WHERE a.ARTCOD LIKE @b OR a.ARTNOM LIKE @b OR a.ARTCOD2 LIKE @b
            GROUP BY a.ARTCOD, a.ARTNOM, a.ARTGRUCOD
            ORDER BY a.ARTCOD`);
    return r.recordset;
}

async function getProveedores(buscar) {
    const pool = await getPool();
    const r = await pool.request().input('b', `%${buscar}%`)
        .query(`SELECT TOP 300
            CLICOD AS codigo, CLINOM AS nombre,
            CLINIF AS cif, CLITEL AS telefono, CLIPOSCIU AS localidad
            FROM PROVEEDOR
            WHERE CLICOD LIKE @b OR CLIRAZ LIKE @b OR CLINOM LIKE @b
            ORDER BY CLICOD`);
    return r.recordset;
}

async function getClientes(buscar) {
    const pool = await getPool();
    const r = await pool.request().input('b', `%${buscar}%`)
        .query(`SELECT TOP 300
            CLICOD AS codigo, CLINOM AS nombre,
            CLINIF AS cif, CLITEL AS telefono, CLIPOSCIU AS localidad
            FROM CLIENTE
            WHERE CLICOD LIKE @b OR CLIRAZ LIKE @b OR CLINOM LIKE @b
            ORDER BY CLICOD`);
    return r.recordset;
}

module.exports = { getArticulos, getProveedores, getClientes };
