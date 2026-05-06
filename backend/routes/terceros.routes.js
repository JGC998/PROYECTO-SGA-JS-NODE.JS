"use strict";

const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();
const q = (pool) => pool.request();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

// ─── PROVEEDORES ──────────────────────────────────────────────────────────────

router.get('/proveedores', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT TOP 300
                CLICOD AS codigo, CLIRAZ AS razon_social, CLINOM AS nombre,
                CLIDIR AS direccion, CLIPOSCIU AS localidad,
                CLINIF AS cif, CLITEL AS telefono,
                CLIPERCON AS contacto, CLIEMA AS email
                FROM PROVEEDOR
                WHERE CLICOD LIKE @b OR CLIRAZ LIKE @b OR CLINOM LIKE @b OR CLINIF LIKE @b
                ORDER BY CLICOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.get('/proveedores/:cod', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).input('cod', req.params.cod)
            .query(`SELECT CLICOD AS codigo, CLINOM AS nombre, CLIRAZ AS razon_social,
                CLIDIR AS direccion, CLINIF AS cif, CLITEL AS telefono,
                CLIPERCON AS contacto, CLIEMA AS email, CLIPOSCIU AS localidad
                FROM PROVEEDOR WHERE CLICOD = @cod`);
        if (!r.recordset.length) return res.status(404).json({ error: 'No encontrado' });
        res.json(r.recordset[0]);
    } catch (err) { serverError(res, err); }
});

// ─── CLIENTES ─────────────────────────────────────────────────────────────────

router.get('/clientes', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT TOP 300
                CLICOD AS codigo, CLICENCOD AS centro, CLIRAZ AS razon_social,
                CLINOM AS nombre, CLIDIR AS direccion, CLIPOSCIU AS localidad,
                CLINIF AS cif, CLITEL AS telefono, CLIEMA AS email
                FROM CLIENTE
                WHERE CLICOD LIKE @b OR CLIRAZ LIKE @b OR CLINOM LIKE @b
                ORDER BY CLICOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.get('/clientes/:cod', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).input('cod', req.params.cod)
            .query(`SELECT CLICOD AS codigo, CLINOM AS nombre, CLIRAZ AS razon_social,
                CLIDIR AS direccion, CLINIF AS cif, CLITEL AS telefono,
                CLIEMA AS email, CLIPOSCIU AS localidad
                FROM CLIENTE WHERE CLICOD = @cod`);
        if (!r.recordset.length) return res.status(404).json({ error: 'No encontrado' });
        res.json(r.recordset[0]);
    } catch (err) { serverError(res, err); }
});

// ─── OPERARIOS ────────────────────────────────────────────────────────────────

router.get('/operarios', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT USUCOD AS codigo, USUNOM AS nombre,
                USUTIP AS tipo, USUNIV AS nivel
                FROM SGAUSUARIO
                WHERE USUCOD LIKE @b OR USUNOM LIKE @b
                ORDER BY USUCOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.get('/operarios/:cod', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).input('cod', req.params.cod)
            .query('SELECT USUCOD AS codigo, USUNOM AS nombre, USUTIP AS tipo, USUNIV AS nivel FROM SGAUSUARIO WHERE USUCOD = @cod');
        if (!r.recordset.length) return res.status(404).json({ error: 'No encontrado' });
        res.json(r.recordset[0]);
    } catch (err) { serverError(res, err); }
});

module.exports = router;
