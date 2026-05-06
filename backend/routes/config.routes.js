"use strict";

const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();
const q = (pool) => pool.request();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

// ─── ALMACENES ────────────────────────────────────────────────────────────────

router.get('/almacenes', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query('SELECT ALMCOD AS codigo, ALMNOM AS nombre FROM ALMACENES ORDER BY ALMCOD');
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.post('/almacenes', async (req, res) => {
    try {
        const pool = await getPool();
        const { cod, nom } = req.body;
        await q(pool).input('cod', cod).input('nom', nom)
            .query(`IF EXISTS (SELECT 1 FROM ALMACENES WHERE ALMCOD=@cod)
                UPDATE ALMACENES SET ALMNOM=@nom WHERE ALMCOD=@cod
            ELSE INSERT INTO ALMACENES (ALMCOD,ALMNOM) VALUES (@cod,@nom)`);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── SUBFAMILIAS ──────────────────────────────────────────────────────────────

router.get('/subfamilias', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query('SELECT SFACOD AS codigo, SFANOM AS nombre, SFANOLOT AS sin_control_lote FROM SUBFAMILIA ORDER BY SFACOD');
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.post('/subfamilias', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.codigo) continue;
            await q(pool).input('cod', r.codigo).input('nom', r.nombre || '').input('nol', r.sin_control_lote ? 1 : 0)
                .query(`IF EXISTS (SELECT 1 FROM SUBFAMILIA WHERE SFACOD=@cod)
                    UPDATE SUBFAMILIA SET SFANOM=@nom, SFANOLOT=@nol WHERE SFACOD=@cod
                ELSE INSERT INTO SUBFAMILIA (SFACOD,SFANOM,SFANOLOT) VALUES (@cod,@nom,@nol)`);
        }
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── TERMINALES PDA ───────────────────────────────────────────────────────────

router.get('/terminales-pda', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query('SELECT repcod AS codigo, repnom AS nombre, repser AS serie, repdat AS tipo_doc, reprutsin AS ruta_sinc, reprutwifi AS ruta_wifi FROM terminalpda ORDER BY repcod');
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.post('/terminales-pda', async (req, res) => {
    try {
        const pool = await getPool();
        const { codigo, nombre, serie = '', tipo_doc = '', ruta_sinc = '', ruta_wifi = '' } = req.body;
        await q(pool)
            .input('cod', codigo).input('nom', nombre).input('ser', serie)
            .input('dat', tipo_doc).input('rsin', ruta_sinc).input('rwifi', ruta_wifi)
            .query(`IF EXISTS (SELECT 1 FROM terminalpda WHERE repcod=@cod)
                UPDATE terminalpda SET repnom=@nom, repser=@ser, repdat=@dat, reprutsin=@rsin, reprutwifi=@rwifi
                WHERE repcod=@cod
            ELSE INSERT INTO terminalpda (repcod,repnom,repser,repdat,reprutsin,reprutwifi)
                VALUES (@cod,@nom,@ser,@dat,@rsin,@rwifi)`);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── USUARIOS ─────────────────────────────────────────────────────────────────

router.get('/usuarios', async (req, res) => {
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

router.post('/usuarios', async (req, res) => {
    try {
        const pool = await getPool();
        const { codigo, nombre, tipo = '', nivel = '' } = req.body;
        if (!codigo || !nombre) return res.status(400).json({ error: 'Código y nombre requeridos' });
        await q(pool).input('cod', codigo).input('nom', nombre).input('tip', tipo).input('niv', nivel)
            .query(`IF EXISTS (SELECT 1 FROM SGAUSUARIO WHERE USUCOD=@cod)
                UPDATE SGAUSUARIO SET USUNOM=@nom, USUTIP=@tip, USUNIV=@niv WHERE USUCOD=@cod
            ELSE INSERT INTO SGAUSUARIO (USUCOD,USUNOM,USUTIP,USUNIV) VALUES (@cod,@nom,@tip,@niv)`);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── CONFIGURACIÓN DE EMPRESA ─────────────────────────────────────────────────

router.get('/configuracion-empresa', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query('SELECT TOP 1 * FROM EMPRESA');
        res.json(r.recordset[0] || {});
    } catch (err) { serverError(res, err); }
});

router.post('/configuracion-empresa', async (req, res) => {
    try {
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

module.exports = router;
