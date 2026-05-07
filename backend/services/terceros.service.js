"use strict";

const { getPool } = require('../db');

async function getProveedores(buscar) {
    const pool = await getPool();
    const r = await pool.request().input('b', `%${buscar}%`)
        .query(`SELECT TOP 300
            CLICOD AS codigo, CLIRAZ AS razon_social, CLINOM AS nombre,
            CLIDIR AS direccion, CLIPOSCIU AS localidad,
            CLINIF AS cif, CLITEL AS telefono,
            CLIPERCON AS contacto, CLIEMA AS email
            FROM PROVEEDOR
            WHERE CLICOD LIKE @b OR CLIRAZ LIKE @b OR CLINOM LIKE @b OR CLINIF LIKE @b
            ORDER BY CLICOD`);
    return r.recordset;
}

async function getProveedor(cod) {
    const pool = await getPool();
    const r = await pool.request().input('cod', cod)
        .query(`SELECT CLICOD AS codigo, CLINOM AS nombre, CLIRAZ AS razon_social,
            CLIDIR AS direccion, CLINIF AS cif, CLITEL AS telefono,
            CLIPERCON AS contacto, CLIEMA AS email, CLIPOSCIU AS localidad
            FROM PROVEEDOR WHERE CLICOD = @cod`);
    return r.recordset[0] || null;
}

async function getClientes(buscar) {
    const pool = await getPool();
    const r = await pool.request().input('b', `%${buscar}%`)
        .query(`SELECT TOP 300
            CLICOD AS codigo, CLICENCOD AS centro, CLIRAZ AS razon_social,
            CLINOM AS nombre, CLIDIR AS direccion, CLIPOSCIU AS localidad,
            CLINIF AS cif, CLITEL AS telefono, CLIEMA AS email
            FROM CLIENTE
            WHERE CLICOD LIKE @b OR CLIRAZ LIKE @b OR CLINOM LIKE @b
            ORDER BY CLICOD`);
    return r.recordset;
}

async function getCliente(cod) {
    const pool = await getPool();
    const r = await pool.request().input('cod', cod)
        .query(`SELECT CLICOD AS codigo, CLINOM AS nombre, CLIRAZ AS razon_social,
            CLIDIR AS direccion, CLINIF AS cif, CLITEL AS telefono,
            CLIEMA AS email, CLIPOSCIU AS localidad
            FROM CLIENTE WHERE CLICOD = @cod`);
    return r.recordset[0] || null;
}

async function getOperarios(buscar) {
    const pool = await getPool();
    const r = await pool.request().input('b', `%${buscar}%`)
        .query(`SELECT USUCOD AS codigo, USUNOM AS nombre,
            USUTIP AS tipo, USUNIV AS nivel
            FROM SGAUSUARIO
            WHERE USUCOD LIKE @b OR USUNOM LIKE @b
            ORDER BY USUCOD`);
    return r.recordset;
}

async function getOperario(cod) {
    const pool = await getPool();
    const r = await pool.request().input('cod', cod)
        .query('SELECT USUCOD AS codigo, USUNOM AS nombre, USUTIP AS tipo, USUNIV AS nivel FROM SGAUSUARIO WHERE USUCOD = @cod');
    return r.recordset[0] || null;
}

module.exports = { getProveedores, getProveedor, getClientes, getCliente, getOperarios, getOperario };
