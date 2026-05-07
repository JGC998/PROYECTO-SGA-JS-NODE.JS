"use strict";

const { getPool } = require('../db');

async function getArticulos(buscar) {
    const pool = await getPool();
    const r = await pool.request().input('b', `%${buscar}%`)
        .query(`SELECT TOP 300
            a.ARTCOD AS articulo, a.ARTNOM AS nombre,
            a.ARTGRUCOD AS familia,
            ISNULL((SELECT SUM(STOCAN) FROM STOCK WHERE STOARTCOD=a.ARTCOD),0) AS stock,
            ISNULL((SELECT TOP 1 STOUBI FROM STOCK WHERE STOARTCOD=a.ARTCOD AND STOCAN>0 ORDER BY STOUBI),'') AS ubicacion,
            ISNULL((SELECT TOP 1 CONVERT(varchar,ACSFEC,23) FROM ALBARANCS WHERE ACSARTCOD=a.ARTCOD ORDER BY ACSFEC DESC),'') AS ultimo_movimiento
            FROM ARTICULO a
            WHERE a.ARTCOD LIKE @b OR a.ARTNOM LIKE @b OR a.ARTCOD2 LIKE @b
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
