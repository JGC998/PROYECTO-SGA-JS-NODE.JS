"use strict";

const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();
const q = (pool) => pool.request();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

// ─── OBSERVACIONES POR ARTÍCULO Y LOTE ────────────────────────────────────────

router.get('/observaciones-articulo-lote', async (req, res) => {
    try {
        const pool = await getPool();
        const { articulo = '' } = req.query;
        const r = await q(pool).input('art', `%${articulo}%`)
            .query(`SELECT o.HISCON AS id, o.HISARTCOD AS articulo,
                a.ARTNOM AS nombre, o.HISLOT AS lote, o.HISOBS AS observaciones
                FROM ARTICULOLOTOBS o
                LEFT JOIN ARTICULO a ON a.ARTCOD = o.HISARTCOD
                WHERE o.HISARTCOD LIKE @art
                ORDER BY o.HISARTCOD, o.HISLOT`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.post('/observaciones-articulo-lote', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.articulo) continue;
            await q(pool).input('art', r.articulo).input('lot', r.lote || '').input('obs', r.observaciones || '')
                .query(`IF EXISTS (SELECT 1 FROM ARTICULOLOTOBS WHERE HISARTCOD=@art AND HISLOT=@lot)
                    UPDATE ARTICULOLOTOBS SET HISOBS=@obs WHERE HISARTCOD=@art AND HISLOT=@lot
                ELSE INSERT INTO ARTICULOLOTOBS (HISARTCOD,HISLOT,HISOBS) VALUES (@art,@lot,@obs)`);
        }
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── LOTE EXCLUSIVO ───────────────────────────────────────────────────────────

router.get('/lote-exclusivo', async (req, res) => {
    try {
        const pool = await getPool();
        const { cliente = '', articulo = '' } = req.query;
        const r = await q(pool).input('cli', `%${cliente}%`).input('art', `%${articulo}%`)
            .query(`SELECT e.HISCON AS id, e.HISCLICOD AS cliente,
                c.CLINOM AS nombre_cliente, e.HISARTCOD AS articulo,
                a.ARTNOM AS nombre_articulo, e.HISLOT AS lote_exclusivo
                FROM ARTICULOEXCLOTCLI e
                LEFT JOIN CLIENTE c ON c.CLICOD = e.HISCLICOD
                LEFT JOIN ARTICULO a ON a.ARTCOD = e.HISARTCOD
                WHERE e.HISCLICOD LIKE @cli AND e.HISARTCOD LIKE @art
                ORDER BY e.HISCLICOD, e.HISARTCOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.post('/lote-exclusivo', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.cliente || !r.articulo) continue;
            await q(pool).input('cli', r.cliente).input('art', r.articulo).input('lot', r.lote || '')
                .query(`IF NOT EXISTS (SELECT 1 FROM ARTICULOEXCLOTCLI WHERE HISCLICOD=@cli AND HISARTCOD=@art AND HISLOT=@lot)
                    INSERT INTO ARTICULOEXCLOTCLI (HISCLICOD,HISARTCOD,HISLOT) VALUES (@cli,@art,@lot)`);
        }
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── LOTE MÍNIMO POR CLIENTE ──────────────────────────────────────────────────

router.get('/lote-minimo', async (req, res) => {
    try {
        const pool = await getPool();
        const { cliente = '' } = req.query;
        const r = await q(pool).input('cli', `%${cliente}%`)
            .query(`SELECT h.HISCON AS id, h.HISCLICOD AS cliente,
                c.CLINOM AS nombre_cliente, h.HISDIA AS dias
                FROM ARTICULOLOTCLI h
                LEFT JOIN CLIENTE c ON c.CLICOD = h.HISCLICOD
                WHERE h.HISCLICOD LIKE @cli
                ORDER BY h.HISCLICOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.post('/lote-minimo', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.cliente) continue;
            await q(pool).input('cli', r.cliente).input('dias', r.dias || 0)
                .query(`IF EXISTS (SELECT 1 FROM ARTICULOLOTCLI WHERE HISCLICOD=@cli)
                    UPDATE ARTICULOLOTCLI SET HISDIA=@dias WHERE HISCLICOD=@cli
                ELSE INSERT INTO ARTICULOLOTCLI (HISCLICOD,HISDIA) VALUES (@cli,@dias)`);
        }
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── LOTE NO UTILIZADO ────────────────────────────────────────────────────────

router.get('/lote-no-utilizado', async (req, res) => {
    try {
        const pool = await getPool();
        const { cliente = '', articulo = '' } = req.query;
        const r = await q(pool).input('cli', `%${cliente}%`).input('art', `%${articulo}%`)
            .query(`SELECT e.HISCON AS id, e.HISCLICOD AS cliente,
                c.CLINOM AS nombre_cliente, e.HISARTCOD AS articulo,
                a.ARTNOM AS nombre_articulo, e.HISLOT AS lote
                FROM ARTICULOEXCLOTCLI e
                LEFT JOIN CLIENTE c ON c.CLICOD = e.HISCLICOD
                LEFT JOIN ARTICULO a ON a.ARTCOD = e.HISARTCOD
                WHERE e.HISCLICOD LIKE @cli AND e.HISARTCOD LIKE @art
                ORDER BY e.HISCLICOD, e.HISARTCOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

// ─── LOTE CUARENTENA ──────────────────────────────────────────────────────────

router.get('/lote-cuarentena', async (req, res) => {
    try {
        const pool = await getPool();
        const { articulo = '' } = req.query;
        const r = await q(pool).input('art', `%${articulo}%`)
            .query(`SELECT o.HISCON AS id, o.HISARTCOD AS articulo,
                a.ARTNOM AS nombre, o.HISLOT AS lote,
                CASE WHEN o.HISOBS LIKE '%CUARENTENA%' THEN 1 ELSE 0 END AS en_cuarentena,
                o.HISOBS AS observaciones
                FROM ARTICULOLOTOBS o
                LEFT JOIN ARTICULO a ON a.ARTCOD = o.HISARTCOD
                WHERE o.HISARTCOD LIKE @art
                ORDER BY o.HISARTCOD, o.HISLOT`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

module.exports = router;
