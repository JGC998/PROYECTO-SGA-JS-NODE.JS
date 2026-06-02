"use strict";

const { Router } = require('express');
const { getPool } = require('../db');
const { serverError } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');

const router = Router();
router.use((req, res, next) => {
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) return requireAuth(req, res, next);
    next();
});
const q = (pool) => pool.request();


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
            if (!r.articulo || typeof r.articulo !== 'string') continue;
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
            .query(`WITH dedup AS (
                SELECT MIN(e.HISCON) AS id, e.HISCLICOD AS cliente, e.HISARTCOD AS articulo, e.HISLOT AS lote_exclusivo
                FROM ARTICULOEXCLOTCLI e
                WHERE e.HISCLICOD LIKE @cli AND e.HISARTCOD LIKE @art
                GROUP BY e.HISCLICOD, e.HISARTCOD, e.HISLOT
            )
            SELECT d.id, d.cliente, c.CLINOM AS nombre_cliente,
                d.articulo, a.ARTNOM AS nombre_articulo, d.lote_exclusivo
            FROM dedup d
            LEFT JOIN CLIENTE c ON c.CLICOD = d.cliente
            LEFT JOIN ARTICULO a ON a.ARTCOD = d.articulo
            ORDER BY d.cliente, d.articulo`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.post('/lote-exclusivo', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.cliente || !r.articulo || !r.lote_exclusivo) continue;
            // Eliminar duplicados y dejar solo el registro canónico
            await q(pool).input('cli', r.cliente).input('art', r.articulo).input('lot', r.lote_exclusivo)
                .query(`DELETE FROM ARTICULOEXCLOTCLI
                    WHERE HISCLICOD=@cli AND HISARTCOD=@art AND HISLOT=@lot
                    AND HISCON NOT IN (
                        SELECT MIN(HISCON) FROM ARTICULOEXCLOTCLI
                        WHERE HISCLICOD=@cli AND HISARTCOD=@art AND HISLOT=@lot
                    );
                    IF NOT EXISTS (SELECT 1 FROM ARTICULOEXCLOTCLI WHERE HISCLICOD=@cli AND HISARTCOD=@art AND HISLOT=@lot)
                        INSERT INTO ARTICULOEXCLOTCLI (HISCLICOD,HISARTCOD,HISLOT) VALUES (@cli,@art,@lot)`);
        }
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

router.delete('/lote-exclusivo/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await q(pool).input('id', Number(req.params.id))
            .query(`DELETE FROM ARTICULOEXCLOTCLI WHERE HISCON=@id`);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── LOTE MÍNIMO POR CLIENTE ──────────────────────────────────────────────────

router.get('/lote-minimo', async (req, res) => {
    try {
        const pool = await getPool();
        const { cliente = '' } = req.query;
        const r = await q(pool).input('cli', `%${cliente}%`)
            .query(`SELECT h.HISCON AS id, c.CLICOD AS cliente,
                c.CLINOM AS nombre_cliente, ISNULL(h.HISDIA, 0) AS dias
                FROM CLIENTE c
                LEFT JOIN ARTICULOLOTCLI h ON h.HISCLICOD = c.CLICOD
                WHERE (c.CLICOD LIKE @cli OR c.CLINOM LIKE @cli)
                AND c.CLICOD IS NOT NULL AND LTRIM(RTRIM(c.CLICOD)) <> ''
                ORDER BY c.CLICOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.post('/lote-minimo', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.cliente || typeof r.cliente !== 'string') continue;
            const dias = Number.isFinite(Number(r.dias)) ? Math.max(0, Number(r.dias)) : 0;
            await q(pool).input('cli', r.cliente).input('dias', dias)
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
                a.ARTNOM AS nombre_articulo, e.HISLOT AS lote_exclusivo
                FROM ARTICULOEXCLOTCLI e
                LEFT JOIN CLIENTE c ON c.CLICOD = e.HISCLICOD
                LEFT JOIN ARTICULO a ON a.ARTCOD = e.HISARTCOD
                WHERE e.HISCLICOD LIKE @cli AND e.HISARTCOD LIKE @art
                ORDER BY e.HISCLICOD, e.HISARTCOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.post('/lote-no-utilizado', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.cliente || !r.articulo) continue;
            await q(pool).input('cli', r.cliente).input('art', r.articulo).input('lot', r.lote_exclusivo || '')
                .query(`IF NOT EXISTS (SELECT 1 FROM ARTICULOEXCLOTCLI WHERE HISCLICOD=@cli AND HISARTCOD=@art AND HISLOT=@lot)
                    INSERT INTO ARTICULOEXCLOTCLI (HISCLICOD,HISARTCOD,HISLOT) VALUES (@cli,@art,@lot)`);
        }
        res.json({ ok: true });
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
                o.HISOBS AS observaciones
                FROM ARTICULOLOTOBS o
                LEFT JOIN ARTICULO a ON a.ARTCOD = o.HISARTCOD
                WHERE o.HISARTCOD LIKE @art
                ORDER BY o.HISARTCOD, o.HISLOT`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.post('/lote-cuarentena', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.articulo || typeof r.articulo !== 'string') continue;
            if (!r.lote || typeof r.lote !== 'string') continue;
            const obs = typeof r.observaciones === 'string' ? r.observaciones : '';
            if (r.id && !String(r.id).startsWith('new-')) {
                await q(pool).input('id', Number(r.id)).input('obs', obs)
                    .query(`UPDATE ARTICULOLOTOBS SET HISOBS=@obs WHERE HISCON=@id`);
            } else {
                await q(pool).input('art', r.articulo).input('lot', r.lote).input('obs', obs)
                    .query(`INSERT INTO ARTICULOLOTOBS (HISARTCOD, HISLOT, HISOBS) VALUES (@art, @lot, @obs)`);
            }
        }
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

router.delete('/lote-cuarentena/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await q(pool).input('id', Number(req.params.id))
            .query(`DELETE FROM ARTICULOLOTOBS WHERE HISCON=@id`);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

module.exports = router;
