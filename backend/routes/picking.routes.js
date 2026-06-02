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


// ─── PICKING / PREPARACIÓN ────────────────────────────────────────────────────

router.get('/picking', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '', desde, hasta } = req.query;
        const csv = req.query.format === 'csv';
        const { page, pageSize } = parsePagination(req.query);
        const fechaD = desde || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
        const fechaH = hasta || new Date().toISOString().split('T')[0];
        const qb = q(pool)
            .input('b', `%${buscar}%`)
            .input('desde', fechaD)
            .input('hasta', fechaH);
        if (!csv) { qb.input('page', page).input('pageSize', pageSize); }
        else { qb.input('csvLimit', Math.min(parseInt(req.query.limit || '50000', 10), 50000)); }
        const r = await qb.query(`SELECT
                e.ACSNUM    AS albaran,
                e.ACSSER    AS serie,
                e.ACSCLICOD AS cliente,
                e.ACSCLINOM AS nombre_cliente,
                CONVERT(varchar, e.ACSFEC, 23) AS fecha,
                e.ACSNUMPIC AS picking,
                e.ACSARTCOD AS articulo,
                ISNULL(art.ARTNOM, e.ACSARTCOD) AS nombre_articulo,
                e.ACSCAN    AS cantidad_pedida,
                e.ACSUBI    AS ubicacion,
                u.UBINOM    AS nom_ubicacion,
                u.UBIALMCOD AS almacen,
                u.UBIETI    AS ubi_etiqueta,
                e.ACSLOT    AS lote,
                ISNULL((SELECT SUM(STOCAN) FROM STOCK
                    WHERE STOARTCOD = e.ACSARTCOD
                      AND STOUBI    = e.ACSUBI
                      AND (ISNULL(e.ACSLOT,'') = '' OR STOLOT = e.ACSLOT)), 0) AS stock_ubi,
                ISNULL((SELECT SUM(STOCAN) FROM STOCK
                    WHERE STOARTCOD = e.ACSARTCOD), 0) AS stock_total,
                CASE WHEN c.ID IS NOT NULL THEN 1 ELSE 0 END AS confirmado_sga,
                c.FECHA_CONF AS fecha_conf_sga,
                c.OPERARIO   AS operario_sga
                FROM ALBARANCS e
                LEFT JOIN ARTICULO art ON art.ARTCOD = e.ACSARTCOD
                LEFT JOIN UBICACION u ON u.UBICODUBI = e.ACSUBI
                LEFT JOIN SGA_PICKING_CONFIRMACION c
                    ON  c.ALBARAN   = e.ACSNUM
                    AND c.SERIE     = e.ACSSER
                    AND c.ARTICULO  = e.ACSARTCOD
                    AND c.UBICACION = e.ACSUBI
                    AND ISNULL(c.LOTE,'') = ISNULL(e.ACSLOT,'')
                WHERE e.ACSMOV IN ('E','PC')
                AND (e.ACSCLICOD LIKE @b OR e.ACSCLINOM LIKE @b
                     OR CAST(e.ACSNUM AS varchar) LIKE @b OR e.ACSSER LIKE @b)
                AND CAST(e.ACSFEC AS DATE) BETWEEN @desde AND @hasta
                ORDER BY
                    CASE WHEN e.ACSNUMPIC IS NULL THEN 0 ELSE 1 END ASC,
                    e.ACSFEC DESC,
                    e.ACSNUM DESC,
                    e.ACSUBI ASC
                ${csv ? 'OFFSET 0 ROWS FETCH NEXT @csvLimit ROWS ONLY' : 'OFFSET (@page * @pageSize) ROWS FETCH NEXT @pageSize ROWS ONLY'}`);
        if (csv) return sendCsv(res, 'picking.csv', r.recordset);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

// ─── PICKING — CONFIRMACIÓN SGA ──────────────────────────────────────────────

function validarCamposPicking(albaran, serie, articulo, ubicacion, lote, operario) {
    const albNum = Number(albaran);
    if (!Number.isInteger(albNum) || albNum <= 0)
        return 'albaran debe ser un entero positivo';
    if (!serie || String(serie).length > 10)
        return 'serie inválida (máx 10 caracteres)';
    if (!articulo || String(articulo).length > 30)
        return 'articulo inválido (máx 30 caracteres)';
    if (!ubicacion || String(ubicacion).length > 20)
        return 'ubicacion inválida (máx 20 caracteres)';
    if (lote && String(lote).length > 30)
        return 'lote inválido (máx 30 caracteres)';
    if (operario && String(operario).length > 50)
        return 'operario inválido (máx 50 caracteres)';
    return null;
}

router.post('/picking/confirmar', async (req, res) => {
    try {
        const { albaran, serie, articulo, ubicacion, lote, operario } = req.body || {};
        const err400 = validarCamposPicking(albaran, serie, articulo, ubicacion, lote, operario);
        if (err400) return res.status(400).json({ error: err400 });

        const pool    = await getPool();
        const albNum  = Number(albaran);
        const loteVal = lote ? String(lote) : '';

        const existe = await q(pool)
            .input('alb', albNum)
            .input('ser', String(serie))
            .input('art', String(articulo))
            .input('lot', loteVal)
            .query(`SELECT COUNT(*) AS cnt FROM ALBARANCS
                WHERE ACSNUM    = @alb
                  AND ACSSER    = @ser
                  AND ACSARTCOD = @art
                  AND ACSMOV    IN ('E','PC')
                  AND ISNULL(ACSLOT,'') = @lot`);
        if (existe.recordset[0].cnt === 0) {
            return res.status(404).json({ error: 'Línea no encontrada en ALBARANCS' });
        }

        await q(pool)
            .input('alb', albNum)
            .input('ser', String(serie))
            .input('art', String(articulo))
            .input('ubi', String(ubicacion))
            .input('lot', loteVal)
            .input('ope', operario ? String(operario) : '')
            .query(`IF NOT EXISTS (
                        SELECT 1 FROM SGA_PICKING_CONFIRMACION
                        WHERE ALBARAN   = @alb AND SERIE     = @ser
                          AND ARTICULO  = @art AND UBICACION = @ubi
                          AND ISNULL(LOTE,'') = @lot
                    )
                    INSERT INTO SGA_PICKING_CONFIRMACION
                        (ALBARAN, SERIE, ARTICULO, UBICACION, LOTE, OPERARIO)
                    VALUES (@alb, @ser, @art, @ubi, @lot, @ope)`);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

router.post('/picking/desconfirmar', async (req, res) => {
    try {
        const { albaran, serie, articulo, ubicacion, lote } = req.body || {};
        const err400 = validarCamposPicking(albaran, serie, articulo, ubicacion, lote);
        if (err400) return res.status(400).json({ error: err400 });

        const pool    = await getPool();
        const albNum  = Number(albaran);
        const loteVal = lote ? String(lote) : '';

        await q(pool)
            .input('alb', albNum)
            .input('ser', String(serie))
            .input('art', String(articulo))
            .input('ubi', String(ubicacion))
            .input('lot', loteVal)
            .query(`DELETE FROM SGA_PICKING_CONFIRMACION
                WHERE ALBARAN   = @alb AND SERIE     = @ser
                  AND ARTICULO  = @art AND UBICACION = @ubi
                  AND ISNULL(LOTE,'') = @lot`);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

module.exports = router;
