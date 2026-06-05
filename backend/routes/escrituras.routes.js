"use strict";

const { Router } = require('express');
const { getPool, sql } = require('../db');
const { serverError } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');

const router = Router();
router.use((req, res, next) => {
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) return requireAuth(req, res, next);
    next();
});
const q = (pool) => pool.request();


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
            const min = Number.isFinite(Number(r.stock_minimo)) ? Math.max(0, Number(r.stock_minimo)) : 0;
            const max = Number.isFinite(Number(r.stock_maximo)) ? Math.max(0, Number(r.stock_maximo)) : 0;
            await q(pool).input('art', r.articulo).input('min', min).input('max', max)
                .query(`IF EXISTS (SELECT 1 FROM ARTICULOSTOMIN WHERE MINARTCOD=@art)
                    UPDATE ARTICULOSTOMIN SET MINSTOMIN=@min, MINSTOMAX=@max WHERE MINARTCOD=@art
                ELSE INSERT INTO ARTICULOSTOMIN (MINARTCOD,MINSTOMIN,MINSTOMAX) VALUES (@art,@min,@max)`);
        }
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

router.delete('/minimos-maximos/:articulo', async (req, res) => {
    try {
        const pool = await getPool();
        await q(pool).input('art', req.params.articulo)
            .query(`DELETE FROM ARTICULOSTOMIN WHERE MINARTCOD=@art`);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});


// ─── RESUMEN ESTRUCTURA UBICACIONES ──────────────────────────────────────────

router.get('/generar-ubicaciones/estructura', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(
            `SELECT LTRIM(RTRIM(UBIETI)) AS etiqueta FROM UBICACION
             WHERE UBIETI IS NOT NULL AND LTRIM(RTRIM(UBIETI)) <> '' AND UBIETI LIKE 'P%'`);

        // Construir mapa de ocupadas: { pasillo: { lateral: Set de "X-Y" } }
        const ocupadas = {};
        r.recordset.forEach(({ etiqueta }) => {
            const m = etiqueta.match(/P(\d+)\s+([ID])\s+X(\d+)\s+Y(\d+)/);
            if (!m) return;
            const [, p, l, x, y] = m;
            if (!ocupadas[p]) ocupadas[p] = {};
            if (!ocupadas[p][l]) ocupadas[p][l] = new Set();
            ocupadas[p][l].add(`${+x}-${+y}`);
        });

        // Calcular rango máximo global de X e Y por pasillo+lateral
        const rangos = {};
        r.recordset.forEach(({ etiqueta }) => {
            const m = etiqueta.match(/P(\d+)\s+([ID])\s+X(\d+)\s+Y(\d+)/);
            if (!m) return;
            const [, p, l, x, y] = m;
            if (!rangos[p]) rangos[p] = {};
            if (!rangos[p][l]) rangos[p][l] = { x_max: 0, y_max: 0 };
            rangos[p][l].x_max = Math.max(rangos[p][l].x_max, +x);
            rangos[p][l].y_max = Math.max(rangos[p][l].y_max, +y);
        });

        const result = {};
        Object.keys(rangos).sort((a, b) => +a - +b).forEach(p => {
            result[p] = {};
            Object.keys(rangos[p]).sort().forEach(l => {
                const { x_max, y_max } = rangos[p][l];
                const ocup = ocupadas[p]?.[l] || new Set();

                // X disponible = al menos un Y de ese X no está ocupado
                const libres_x = [];
                for (let x = 1; x <= x_max + 5; x++) {
                    let alguno_libre = false;
                    for (let y = 1; y <= y_max + 3; y++) {
                        if (!ocup.has(`${x}-${y}`)) { alguno_libre = true; break; }
                    }
                    if (alguno_libre) libres_x.push(x);
                }

                // Y libre = para el X seleccionado esa Y no existe
                // Devolvemos todos los Y posibles; el frontend filtrará según X elegido
                const libres_y = [];
                for (let y = 1; y <= y_max + 3; y++) {
                    libres_y.push(y);
                }

                result[p][l] = {
                    xs: libres_x,
                    ys: libres_y,
                    ocup: [...ocup], // enviamos ocupadas para filtrar Y en frontend
                };
            });
        });
        res.json(result);
    } catch (err) { serverError(res, err); }
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
        // Obtener el MAX(UBICON) una sola vez antes del bucle
        const maxRes = await pool.request().query('SELECT ISNULL(MAX(UBICON),0) AS maxcon FROM UBICACION');
        let nextCon = maxRes.recordset[0].maxcon + 1;
        let creadas = 0;
        for (let p = +desde_pasillo; p <= +hasta_pasillo; p++) {
            for (let l = +desde_lateral; l <= +hasta_lateral; l++) {
                for (let x = +desde_x; x <= +hasta_x; x++) {
                    for (let y = +desde_y; y <= +hasta_y; y++) {
                        const cod = String(p).padStart(3,'0') + String(l).padStart(2,'0') + String(x).padStart(3,'0') + String(y).padStart(3,'0');
                        const r = await q(pool)
                            .input('cod', cod).input('con', sql.Float, nextCon).input('anc', ancho).input('alt', alto)
                            .input('pal', palets).input('mul', multiple ? 1 : 0).input('lib', lib)
                            .query(`IF NOT EXISTS (SELECT 1 FROM UBICACION WHERE UBICODUBI=@cod)
                                BEGIN
                                    INSERT INTO UBICACION (UBICON,UBICODUBI,UBIANC,UBIALT,UBINUMPAL,UBIMUL,UBILIB)
                                    VALUES (@con,@cod,@anc,@alt,@pal,@mul,@lib)
                                END`);
                        if (r.rowsAffected[0] > 0) { creadas++; nextCon++; }
                    }
                }
            }
        }
        res.json({ ok: true, creadas });
    } catch (err) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

module.exports = router;
