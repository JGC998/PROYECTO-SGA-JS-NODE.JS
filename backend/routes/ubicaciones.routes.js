"use strict";

const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();
const q = (pool) => pool.request();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

router.get('/ubicaciones', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '', almacen = '' } = req.query;
        const r = await q(pool)
            .input('b', `%${buscar}%`).input('alm', `%${almacen}%`)
            .query(`SELECT TOP 500
                UBICODUBI AS ubicacion, UBIETI AS etiqueta, UBINOM AS descripcion,
                UBIANC AS ancho, UBIALT AS alto, UBINUMPAL AS palets,
                ISNULL(UBILIB,0) AS picking, ISNULL(UBIMUL,0) AS multiple,
                UBIALMCOD AS ubicacion_tipo, ISNULL(UBINOROT,0) AS exclusiva,
                ISNULL(UBINOAVIINV,0) AS no_av_inv, UBICON AS articulo
                FROM UBICACION
                WHERE (UBICODUBI LIKE @b OR UBINOM LIKE @b OR UBIETI LIKE @b)
                AND UBIALMCOD LIKE @alm
                ORDER BY UBICODUBI`);
        res.json(r.recordset);
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
