"use strict";

const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();
const q = (pool) => pool.request();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

// ─── ARTÍCULOS ────────────────────────────────────────────────────────────────

router.post('/articulos', async (req, res) => {
    try {
        const pool = await getPool();
        const { cod, nom, stomin = 0, stomax = 0, cos = 0, des1 = 0, col = '', medcod = '', mat = '', cod2 = '' } = req.body;
        if (!cod || !nom) return res.status(400).json({ error: 'Código y nombre son obligatorios' });
        await q(pool)
            .input('cod', cod).input('nom', nom).input('stomin', stomin)
            .input('stomax', stomax).input('cos', cos).input('des1', des1)
            .input('col', col).input('medcod', medcod).input('mat', mat).input('cod2', cod2)
            .query(`IF EXISTS (SELECT 1 FROM ARTICULO WHERE ARTCOD = @cod)
                UPDATE ARTICULO SET ARTNOM=@nom, ARTSTOMIN=@stomin, ARTSTOMAX=@stomax,
                    ARTCOS=@cos, ARTDES1=@des1, ARTCOL=@col, ARTMEDCOD=@medcod, ARTMAT=@mat, ARTCOD2=@cod2
                WHERE ARTCOD = @cod
            ELSE
                INSERT INTO ARTICULO (ARTCOD,ARTNOM,ARTSTOMIN,ARTSTOMAX,ARTCOS,ARTDES1,ARTCOL,ARTMEDCOD,ARTMAT,ARTCOD2)
                VALUES (@cod,@nom,@stomin,@stomax,@cos,@des1,@col,@medcod,@mat,@cod2)`);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── ARTÍCULOS SIN REPOSICIÓN ─────────────────────────────────────────────────

router.post('/articulos-sin-reposicion', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.articulo) continue;
            await q(pool).input('art', r.articulo)
                .query(`IF NOT EXISTS (SELECT 1 FROM ARTICULOSINREP WHERE HISARTCOD=@art)
                    INSERT INTO ARTICULOSINREP (HISARTCOD) VALUES (@art)`);
        }
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── MÍNIMOS Y MÁXIMOS ────────────────────────────────────────────────────────

router.post('/minimos-maximos', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.articulo) continue;
            await q(pool).input('art', r.articulo).input('min', r.stock_minimo || 0).input('max', r.stock_maximo || 0)
                .query(`IF EXISTS (SELECT 1 FROM ARTICULOSTOMIN WHERE MINARTCOD=@art)
                    UPDATE ARTICULOSTOMIN SET MINSTOMIN=@min, MINSTOMAX=@max WHERE MINARTCOD=@art
                ELSE INSERT INTO ARTICULOSTOMIN (MINARTCOD,MINSTOMIN,MINSTOMAX) VALUES (@art,@min,@max)`);
        }
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── MAESTRO ARTÍCULO ─────────────────────────────────────────────────────────

router.post('/maestro-articulo', async (req, res) => {
    try {
        const { cod, nom } = req.body;
        const pool = await getPool();
        await q(pool).input('cod', cod).input('nom', nom)
            .query('INSERT INTO ARTICULO (ARTCOD, ARTNOM) VALUES (@cod, @nom)');
        res.json({ success: true, message: 'Artículo creado' });
    } catch (err) { console.error("[ERROR]", err.message || err); res.status(500).json({ success: false, message: "Error interno del servidor" }); }
});

// ─── MAESTRO UBICACIÓN ────────────────────────────────────────────────────────

router.post('/maestro-ubicacion', async (req, res) => {
    try {
        const { ubi, alm } = req.body;
        const pool = await getPool();
        await q(pool).input('ubi', ubi).input('alm', alm)
            .query('INSERT INTO UBICACION (UBICODUBI, UBIALMCOD) VALUES (@ubi, @alm)');
        res.json({ success: true, message: 'Ubicación creada' });
    } catch (err) { console.error("[ERROR]", err.message || err); res.status(500).json({ success: false, message: "Error interno del servidor" }); }
});

// ─── GENERAR UBICACIONES ──────────────────────────────────────────────────────

router.post('/generar-ubicaciones', async (req, res) => {
    try {
        const { desde_pasillo = 1, hasta_pasillo = 1, desde_lateral = 11, hasta_lateral = 11,
                desde_x = 1, hasta_x = 1, desde_y = 1, hasta_y = 1,
                ancho = 0, alto = 0, palets = 0, multiple = 0, picking = 'Picking' } = req.body || {};
        const rangos = [desde_pasillo, hasta_pasillo, desde_lateral, hasta_lateral, desde_x, hasta_x, desde_y, hasta_y];
        if (rangos.some(v => !Number.isFinite(Number(v)))) {
            return res.status(400).json({ error: 'Todos los campos de rango deben ser números válidos' });
        }
        const totalIter = (Math.abs(+hasta_pasillo - +desde_pasillo) + 1) *
                          (Math.abs(+hasta_lateral - +desde_lateral) + 1) *
                          (Math.abs(+hasta_x - +desde_x) + 1) *
                          (Math.abs(+hasta_y - +desde_y) + 1);
        if (totalIter > 1000) {
            return res.status(400).json({ error: 'El rango genera demasiadas ubicaciones (máximo 1000 por operación)' });
        }
        const pool = await getPool();
        const lib = picking === 'Picking' ? 1 : 0;
        let creadas = 0;
        for (let p = +desde_pasillo; p <= +hasta_pasillo; p++) {
            for (let l = +desde_lateral; l <= +hasta_lateral; l++) {
                for (let x = +desde_x; x <= +hasta_x; x++) {
                    for (let y = +desde_y; y <= +hasta_y; y++) {
                        const cod = String(p).padStart(3,'0') + String(l).padStart(2,'0') + String(x).padStart(3,'0') + String(y).padStart(3,'0');
                        await q(pool)
                            .input('cod', cod).input('anc', ancho).input('alt', alto)
                            .input('pal', palets).input('mul', multiple ? 1 : 0).input('lib', lib)
                            .query(`IF NOT EXISTS (SELECT 1 FROM UBICACION WHERE UBICODUBI=@cod)
                                INSERT INTO UBICACION (UBICODUBI,UBIANC,UBIALT,UBINUMPAL,UBIMUL,UBILIB)
                                VALUES (@cod,@anc,@alt,@pal,@mul,@lib)`);
                        creadas++;
                    }
                }
            }
        }
        res.json({ ok: true, creadas });
    } catch (err) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

module.exports = router;
