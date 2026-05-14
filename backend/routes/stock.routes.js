"use strict";

const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();
const q = (pool) => pool.request();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

// ─── STOCK ────────────────────────────────────────────────────────────────────

router.get('/stock/:cod', async (req, res) => {
    try {
        const cod = req.params.cod;
        if (!cod || cod.length > 50) return res.status(400).json({ error: 'Código no válido' });
        const pool = await getPool();
        const r = await q(pool).input('cod', cod)
            .query(`SELECT s.STOUBI, s.STOLOT, s.STOCAN,
                u.UBINOM, u.UBIALMCOD
                FROM STOCK s
                LEFT JOIN UBICACION u ON u.UBICODUBI = s.STOUBI
                WHERE s.STOARTCOD = @cod AND s.STOCAN > 0
                ORDER BY s.STOUBI`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ─── CONSULTA DE STOCK ────────────────────────────────────────────────────────

router.get('/consulta-de-stock', async (req, res) => {
    try {
        const pool = await getPool();
        const { articulo = '', ubicacion = '', lote = '', solo_existencias = '1' } = req.query;
        const cond = solo_existencias === '1' ? 'AND s.STOCAN > 0' : '';
        const r = await q(pool)
            .input('art', `%${articulo}%`).input('ubi', `%${ubicacion}%`).input('lot', `%${lote}%`)
            .query(`SELECT TOP 500
                s.STOARTCOD AS articulo, a.ARTNOM AS nombre,
                s.STOUBI AS ubicacion, u.UBINOM AS nom_ubicacion,
                u.UBIALMCOD AS almacen,
                s.STOLOT AS lote, s.STOCAN AS stock,
                ISNULL(u.UBINUMPAL,0) AS palets,
                ISNULL(u.UBIMUL,0) AS multiple,
                ISNULL(u.UBILIB,0) AS exclusiva
                FROM STOCK s
                LEFT JOIN ARTICULO a ON a.ARTCOD = s.STOARTCOD
                LEFT JOIN UBICACION u ON u.UBICODUBI = s.STOUBI
                WHERE s.STOARTCOD LIKE @art AND s.STOUBI LIKE @ubi AND s.STOLOT LIKE @lot
                ${cond}
                ORDER BY s.STOUBI, s.STOARTCOD`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ─── MOVIMIENTOS POR ARTÍCULO ─────────────────────────────────────────────────

router.get('/movimientos-por-articulo', async (req, res) => {
    try {
        const pool = await getPool();
        const { articulo = '', lote = '', desde, hasta, movimiento = '', ubicacion = '', cliente = '' } = req.query;
        const fechaD = desde || '2000-01-01';
        const fechaH = hasta || new Date().toISOString().split('T')[0];
        const r = await q(pool)
            .input('art', `%${articulo}%`).input('lot', `%${lote}%`)
            .input('desde', fechaD).input('hasta', fechaH)
            .input('mov', `%${movimiento}%`).input('ubi', `%${ubicacion}%`)
            .input('cli', `%${cliente}%`)
            .query(`SELECT TOP 500
                s.ACSEMPCOD AS empresa,
                CONVERT(varchar,s.ACSFEC,23) AS fecha,
                CONVERT(varchar,s.ACSHOR,8) AS hora,
                s.ACSMOV AS tipo,
                s.ACSSER AS serie,
                s.ACSNUM AS numero,
                s.ACSNUMPIC AS picking,
                s.ACSUBI AS ubicacion,
                s.ACSLOT AS lote,
                s.ACSCAN AS cantidad,
                (SELECT SUM(STOCAN) FROM STOCK WHERE STOARTCOD=s.ACSARTCOD) AS stock,
                s.ACSREPCOD AS terminal,
                s.ACSNUMCAJ AS caja,
                s.ACSNUMPAL AS palet,
                s.ACSCLICOD AS tercero,
                s.ACSCENCOD AS centro,
                s.ACSCLINOM AS nombre_tercero
                FROM ALBARANCS s
                WHERE s.ACSARTCOD LIKE @art
                AND s.ACSLOT LIKE @lot
                AND CAST(s.ACSFEC AS DATE) BETWEEN @desde AND @hasta
                AND s.ACSMOV LIKE @mov
                AND s.ACSUBI LIKE @ubi
                AND s.ACSCLICOD LIKE @cli
                ORDER BY s.ACSFEC DESC, s.ACSHOR DESC`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

// ─── ARTÍCULOS POR UBICACIÓN ──────────────────────────────────────────────────

router.get('/articulos-por-ubicacion', async (req, res) => {
    try {
        const pool = await getPool();
        const { ubicacion = '', articulo = '' } = req.query;
        const r = await q(pool)
            .input('ubi', `%${ubicacion}%`).input('art', `%${articulo}%`)
            .query(`SELECT TOP 500
                au.ARTUBICODUBI AS ubicacion,
                u.UBIETI AS etiqueta,
                au.ARTUBIARTCOD AS articulo,
                a.ARTNOM AS nombre,
                au.ARTUBIMIN AS stock_minimo,
                au.ARTUBIMAX AS stock_maximo,
                au.ARTUBIEXC AS exclusiva,
                au.ARTUBIALMCOD AS almacen,
                ISNULL((SELECT SUM(STOCAN) FROM STOCK WHERE STOARTCOD=au.ARTUBIARTCOD AND STOUBI=au.ARTUBICODUBI),0) AS stock
                FROM ARTICULOUBI au
                LEFT JOIN ARTICULO a ON a.ARTCOD = au.ARTUBIARTCOD
                LEFT JOIN UBICACION u ON u.UBICODUBI = au.ARTUBICODUBI
                WHERE au.ARTUBICODUBI LIKE @ubi AND au.ARTUBIARTCOD LIKE @art
                ORDER BY au.ARTUBICODUBI, au.ARTUBIARTCOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

// ─── ARTÍCULOS SIN REPOSICIÓN ─────────────────────────────────────────────────

router.get('/articulos-sin-reposicion', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT ar.HISARTCOD AS articulo, a.ARTNOM AS nombre,
                ISNULL((SELECT SUM(STOCAN) FROM STOCK WHERE STOARTCOD=ar.HISARTCOD),0) AS stock
                FROM ARTICULOSINREP ar
                LEFT JOIN ARTICULO a ON a.ARTCOD = ar.HISARTCOD
                WHERE ar.HISARTCOD LIKE @b OR a.ARTNOM LIKE @b
                ORDER BY ar.HISARTCOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

// ─── MÍNIMOS Y MÁXIMOS ────────────────────────────────────────────────────────

router.get('/minimos-maximos', async (req, res) => {
    try {
        const pool = await getPool();
        const { articulo = '' } = req.query;
        const r = await q(pool).input('art', `%${articulo}%`)
            .query(`SELECT m.MINARTCOD AS articulo, a.ARTNOM AS nombre,
                m.MINSTOMIN AS stock_minimo, m.MINSTOMAX AS stock_maximo,
                ISNULL((SELECT SUM(STOCAN) FROM STOCK WHERE STOARTCOD=m.MINARTCOD),0) AS stock_actual
                FROM ARTICULOSTOMIN m
                LEFT JOIN ARTICULO a ON a.ARTCOD = m.MINARTCOD
                WHERE m.MINARTCOD LIKE @art OR a.ARTNOM LIKE @art
                ORDER BY m.MINARTCOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

// ─── REGULARIZACIONES ─────────────────────────────────────────────────────────

router.get('/regularizaciones', async (req, res) => {
    try {
        const pool = await getPool();
        const { articulo = '', desde, hasta } = req.query;
        const fechaD = desde || '2000-01-01';
        const fechaH = hasta || new Date().toISOString().split('T')[0];
        const r = await q(pool)
            .input('art', `%${articulo}%`)
            .input('desde', fechaD).input('hasta', fechaH)
            .query(`SELECT TOP 500
                CONVERT(varchar,ACSFEC,23) AS fecha,
                ACSSER AS serie, ACSNUM AS numero,
                ACSARTCOD AS articulo,
                (SELECT TOP 1 ARTNOM FROM ARTICULO WHERE ARTCOD=ACSARTCOD) AS nombre,
                ACSUBI AS ubicacion, ACSLOT AS lote, ACSCAN AS cantidad,
                ACSCLICOD AS tercero, ACSCLINOM AS nombre_tercero
                FROM ALBARANCS
                WHERE ACSMOV='R'
                AND ACSARTCOD LIKE @art
                AND CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
                ORDER BY ACSFEC DESC`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

// ─── EXPEDICIONES ─────────────────────────────────────────────────────────────

router.get('/expediciones', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '', desde, hasta } = req.query;
        const fechaD = desde || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
        const fechaH = hasta || new Date().toISOString().split('T')[0];
        const r = await q(pool)
            .input('b', `%${buscar}%`)
            .input('desde', fechaD)
            .input('hasta', fechaH)
            .query(`SELECT TOP 500
                ACSNUM AS albaran, ACSSER AS serie,
                ACSCLICOD AS cliente, ACSCLINOM AS nombre_cliente,
                CONVERT(varchar,ACSFEC,23) AS fecha,
                ACSNUMPIC AS picking, ACSMOV AS tipo,
                ACSARTCOD AS articulo,
                (SELECT TOP 1 ARTNOM FROM ARTICULO WHERE ARTCOD=ACSARTCOD) AS nombre_articulo,
                ACSCAN AS cantidad,
                ACSUBI AS ubicacion,
                ACSLOT AS lote
                FROM ALBARANCS
                WHERE ACSMOV='PC' AND RTRIM(ACSSER) <> 'PLIN'
                AND (ACSCLICOD LIKE @b OR ACSCLINOM LIKE @b
                     OR CAST(ACSNUM AS varchar) LIKE @b OR ACSSER LIKE @b)
                AND CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
                ORDER BY ACSFEC DESC, ACSNUM DESC`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

// ─── PICKING / PREPARACIÓN ────────────────────────────────────────────────────

router.get('/picking', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '', desde, hasta } = req.query;
        const fechaD = desde || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
        const fechaH = hasta || new Date().toISOString().split('T')[0];
        const r = await q(pool)
            .input('b', `%${buscar}%`)
            .input('desde', fechaD)
            .input('hasta', fechaH)
            .query(`SELECT TOP 500
                e.ACSNUM    AS albaran,
                e.ACSSER    AS serie,
                e.ACSCLICOD AS cliente,
                e.ACSCLINOM AS nombre_cliente,
                CONVERT(varchar, e.ACSFEC, 23) AS fecha,
                e.ACSNUMPIC AS picking,
                e.ACSARTCOD AS articulo,
                (SELECT TOP 1 ARTNOM FROM ARTICULO WHERE ARTCOD = e.ACSARTCOD) AS nombre_articulo,
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
                    e.ACSUBI ASC`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

// ─── SITUACIÓN PEDIDOS DE VENTA ────────────────────────────────────────────────

router.get('/situacion-pedidos-venta', async (req, res) => {
    try {
        const pool = await getPool();
        const { cliente = '', articulo = '', desde, hasta } = req.query;
        const fechaD = desde || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
        const fechaH = hasta || new Date().toISOString().split('T')[0];
        const r = await q(pool)
            .input('cli', `%${cliente}%`).input('art', `%${articulo}%`)
            .input('desde', fechaD).input('hasta', fechaH)
            .query(`SELECT TOP 300
                ACSNUM AS albaran, ACSSER AS serie,
                ACSCLICOD AS cliente, ACSCLINOM AS nombre_cliente,
                ACSARTCOD AS articulo,
                (SELECT TOP 1 ARTNOM FROM ARTICULO WHERE ARTCOD=ACSARTCOD) AS nombre_articulo,
                ACSCAN AS cantidad, ACSUBI AS ubicacion,
                CONVERT(varchar,ACSFEC,23) AS fecha, ACSMOV AS tipo
                FROM ALBARANCS
                WHERE ACSMOV IN ('E','P')
                AND ACSCLICOD LIKE @cli AND ACSARTCOD LIKE @art
                AND CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
                ORDER BY ACSFEC DESC`);
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
            .input('ubi', String(ubicacion))
            .input('lot', loteVal)
            .query(`SELECT COUNT(*) AS cnt FROM ALBARANCS
                WHERE ACSNUM    = @alb
                  AND ACSSER    = @ser
                  AND ACSARTCOD = @art
                  AND ACSUBI    = @ubi
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
