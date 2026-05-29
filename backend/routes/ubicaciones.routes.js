"use strict";

const { Router } = require('express');
const { getPool } = require('../db');
const { serverError, parsePagination, sendCsv } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');

const router = Router();
router.use((req, res, next) => {
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) return requireAuth(req, res, next);
    next();
});
const q = (pool) => pool.request();


// Valores únicos de Pasillo (P) y Lado (L) extraídos de la etiqueta
router.get('/ubicaciones/filtros-pyl', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query(`
            SELECT DISTINCT
                RTRIM(SUBSTRING(UBIETI, 2, 3)) AS pasillo,
                RTRIM(SUBSTRING(UBIETI, 6, 1)) AS lado
            FROM UBICACION
            WHERE UBIETI IS NOT NULL AND LTRIM(RTRIM(UBIETI)) <> ''
            ORDER BY pasillo, lado
        `);
        const todos    = [...new Set(r.recordset.map(x => x.pasillo).filter(Boolean))].sort();
        const pasillos = todos.filter(p => parseInt(p, 10) < 100);
        const lados    = [...new Set(r.recordset.map(x => x.lado).filter(Boolean))].sort();
        res.json({ pasillos, lados });
    } catch (err) { serverError(res, err); }
});

router.get('/ubicaciones/todas', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query(`
            SELECT UBICODUBI, UBIETI, UBINOM,
                   UBIANC AS ancho, UBIALT AS alto, UBINUMPAL AS palets,
                   ISNULL(UBILIB,0) AS picking, ISNULL(UBIMUL,0) AS multiple,
                   UBIALMCOD AS ubicacion_tipo, ISNULL(UBINOROT,0) AS exclusiva,
                   ISNULL(UBINOAVIINV,0) AS no_av_inv, UBICON AS articulo
            FROM UBICACION
            WHERE UBIETI IS NOT NULL AND LTRIM(RTRIM(UBIETI)) <> ''
            ORDER BY UBICODUBI
        `);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.get('/ubicaciones', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '', almacen = '', pasillo = '' } = req.query;
        const csv = req.query.format === 'csv';
        const { page, pageSize } = parsePagination(req.query);
        const pasilloFilter = pasillo ? `AND SUBSTRING(UBIETI, 2, 3) = @pasillo` : '';
        const qb = q(pool)
            .input('b', `%${buscar}%`)
            .input('alm', `%${almacen}%`);
        if (pasillo) qb.input('pasillo', pasillo);
        if (!csv) { qb.input('page', page).input('pageSize', pageSize); }
        const r = await qb.query(`SELECT
                UBICODUBI AS ubicacion, UBIETI AS etiqueta, UBINOM AS descripcion,
                UBIANC AS ancho, UBIALT AS alto, UBINUMPAL AS palets,
                ISNULL(UBILIB,0) AS picking, ISNULL(UBIMUL,0) AS multiple,
                UBIALMCOD AS ubicacion_tipo, ISNULL(UBINOROT,0) AS exclusiva,
                ISNULL(UBINOAVIINV,0) AS no_av_inv, UBICON AS articulo
                FROM UBICACION
                WHERE (UBICODUBI LIKE @b OR UBINOM LIKE @b OR UBIETI LIKE @b)
                AND UBIALMCOD LIKE @alm
                ${pasilloFilter}
                ORDER BY UBICODUBI
                ${csv ? '' : 'OFFSET (@page * @pageSize) ROWS FETCH NEXT @pageSize ROWS ONLY'}`);
        if (csv) return sendCsv(res, 'ubicaciones.csv', r.recordset);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.post('/generar-ubicaciones', async (req, res) => {
    try {
        const pool = await getPool();
        const {
            desde_pasillo = 1, hasta_pasillo = 1,
            desde_lateral = 11, hasta_lateral = 21,
            desde_x = 1, hasta_x = 1,
            desde_y = 1, hasta_y = 1,
            ancho = 0, alto = 0, palets = 0,
            multiple = 0, picking = 'Picking'
        } = req.body;

        const lados = [];
        if (Number(desde_lateral) <= 11 && 11 <= Number(hasta_lateral)) lados.push('I');
        if (Number(desde_lateral) <= 21 && 21 <= Number(hasta_lateral)) lados.push('D');
        if (!lados.length) lados.push('I', 'D');

        const lib = picking === 'Picking' ? 1 : 0;
        const mul = Number(multiple) ? 1 : 0;
        let creadas = 0;
        const listaExistentes = [];

        for (let p = Number(desde_pasillo); p <= Number(hasta_pasillo); p++) {
            const ps = String(p).padStart(3, '0');
            for (const lado of lados) {
                for (let x = Number(desde_x); x <= Number(hasta_x); x++) {
                    const xs = String(x).padStart(3, '0');
                    for (let y = Number(desde_y); y <= Number(hasta_y); y++) {
                        const ys = String(y).padStart(3, '0');
                        const lat = lado === 'I' ? '11' : '21';
                        const cod = '001' + ps + lat + xs + ys;
                        const eti = 'P' + ps + ' ' + lado + ' X' + xs + ' Y' + ys;
                        const r = await pool.request()
                            .input('cod', cod).input('eti', eti).input('nom', eti)
                            .input('anc', Number(ancho)).input('alt', Number(alto))
                            .input('pal', Number(palets)).input('mul', mul)
                            .input('alm', '').input('lib', lib)
                            .query(`IF NOT EXISTS (SELECT 1 FROM UBICACION WHERE UBICODUBI=@cod)
                                BEGIN
                                    INSERT INTO UBICACION (UBICODUBI,UBIETI,UBINOM,UBIANC,UBIALT,UBINUMPAL,UBIMUL,UBIALMCOD,UBILIB)
                                    VALUES (@cod,@eti,@nom,@anc,@alt,@pal,@mul,@alm,@lib)
                                    SELECT 1 AS insertada
                                END
                                ELSE SELECT 0 AS insertada`);
                        if (r.recordset[0]?.insertada) creadas++;
                        else listaExistentes.push(eti);
                    }
                }
            }
        }

        res.json({ ok: true, creadas, existentes: listaExistentes.length, listaExistentes });
    } catch (err) { serverError(res, err); }
});

router.post('/ubicaciones', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            await q(pool)
                .input('cod', r.cod).input('eti', r.eti || '').input('nom', r.nom || '')
                .input('anc', r.anc || 0).input('alt', r.alt || 0)
                .input('pal', r.pal || 0).input('mul', r.mul ? 1 : 0)
                .input('alm', r.alm || '').input('lib', r.lib ? 1 : 0)
                .query(`IF EXISTS (SELECT 1 FROM UBICACION WHERE UBICODUBI=@cod)
                    UPDATE UBICACION SET UBIETI=@eti, UBINOM=@nom, UBIANC=@anc,
                        UBIALT=@alt, UBINUMPAL=@pal, UBIMUL=@mul, UBIALMCOD=@alm, UBILIB=@lib
                    WHERE UBICODUBI=@cod
                ELSE
                    INSERT INTO UBICACION (UBICODUBI,UBIETI,UBINOM,UBIANC,UBIALT,UBINUMPAL,UBIMUL,UBIALMCOD,UBILIB)
                    VALUES (@cod,@eti,@nom,@anc,@alt,@pal,@mul,@alm,@lib)`);
        }
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

module.exports = router;
