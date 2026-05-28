"use strict";

const { Router } = require('express');
const { getPool } = require('../db');
const { serverError, parsePagination, sendCsv } = require('../middleware/error');

const router = Router();
const q = (pool) => pool.request();


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
    } catch (err) { serverError(res, err); }
});

// ─── CONSULTA DE STOCK ────────────────────────────────────────────────────────

router.get('/consulta-de-stock', async (req, res) => {
    try {
        const pool = await getPool();
        const { articulo = '', ubicacion = '', lote = '', solo_existencias = '1', sin_existencias = '0' } = req.query;
        const csv = req.query.format === 'csv';
        const { page, pageSize } = parsePagination(req.query);
        const cond = sin_existencias === '1' ? 'AND s.STOCAN = 0'
                   : solo_existencias === '1' ? 'AND s.STOCAN > 0'
                   : '';
        const qb = q(pool)
            .input('art', `%${articulo}%`).input('ubi', `%${ubicacion}%`).input('lot', `%${lote}%`);
        if (!csv) { qb.input('page', page).input('pageSize', pageSize); }
        const r = await qb.query(`SELECT
                s.STOARTCOD AS articulo, a.ARTNOM AS nombre,
                s.STOUBI AS ubicacion, u.UBINOM AS nom_ubicacion,
                s.STOLOT AS lote, s.STOCAN AS stock,
                ISNULL(u.UBINUMPAL,0) AS palets,
                ISNULL(u.UBIMUL,0) AS multiple,
                ISNULL(u.UBILIB,0) AS libre
                FROM STOCK s
                LEFT JOIN ARTICULO a ON a.ARTCOD = s.STOARTCOD
                LEFT JOIN UBICACION u ON u.UBICODUBI = s.STOUBI
                WHERE s.STOARTCOD LIKE @art AND s.STOUBI LIKE @ubi AND s.STOLOT LIKE @lot
                ${cond}
                ORDER BY s.STOUBI, s.STOARTCOD
                ${csv ? '' : 'OFFSET (@page * @pageSize) ROWS FETCH NEXT @pageSize ROWS ONLY'}`);
        if (csv) return sendCsv(res, 'consulta-stock.csv', r.recordset);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

// ─── MOVIMIENTOS POR ARTÍCULO ─────────────────────────────────────────────────

router.get('/movimientos-por-articulo', async (req, res) => {
    try {
        const pool = await getPool();
        const { articulo = '', lote = '', desde, hasta, movimiento = '', ubicacion = '', cliente = '', terminal = '' } = req.query;
        const csv = req.query.format === 'csv';
        const { page, pageSize } = parsePagination(req.query);
        const fechaD = desde || '2000-01-01';
        const fechaH = hasta || new Date().toISOString().split('T')[0];
        const qb = q(pool)
            .input('art', `%${articulo}%`).input('lot', `%${lote}%`)
            .input('desde', fechaD).input('hasta', fechaH)
            .input('mov', `%${movimiento}%`).input('ubi', `%${ubicacion}%`)
            .input('cli', `%${cliente}%`).input('ter', `%${terminal}%`);
        if (!csv) { qb.input('page', page).input('pageSize', pageSize); }
        const r = await qb.query(`SELECT
                s.ACSEMPCOD AS empresa,
                CONVERT(varchar,s.ACSFEC,23) AS fecha,
                CONVERT(varchar,s.ACSHOR,8) AS hora,
                s.ACSMOV AS tipo,
                s.ACSSER AS serie,
                s.ACSNUM AS numero,
                s.ACSARTCOD AS articulo,
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
                AND s.ACSREPCOD LIKE @ter
                AND RTRIM(s.ACSSER) <> 'PLIN'
                ORDER BY s.ACSFEC DESC, s.ACSHOR DESC
                ${csv ? '' : 'OFFSET (@page * @pageSize) ROWS FETCH NEXT @pageSize ROWS ONLY'}`);
        if (csv) return sendCsv(res, 'movimientos.csv', r.recordset);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

// ─── ARTÍCULOS POR UBICACIÓN ──────────────────────────────────────────────────

router.get('/articulos-por-ubicacion', async (req, res) => {
    try {
        const pool = await getPool();
        const { ubicacion = '', articulo = '' } = req.query;
        const csv = req.query.format === 'csv';
        const { page, pageSize } = parsePagination(req.query);
        const qb = q(pool)
            .input('ubi', `%${ubicacion}%`).input('art', `%${articulo}%`);
        if (!csv) { qb.input('page', page).input('pageSize', pageSize); }
        const r = await qb.query(`SELECT
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
                ORDER BY au.ARTUBICODUBI, au.ARTUBIARTCOD
                ${csv ? '' : 'OFFSET (@page * @pageSize) ROWS FETCH NEXT @pageSize ROWS ONLY'}`);
        if (csv) return sendCsv(res, 'articulos-por-ubicacion.csv', r.recordset);
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

module.exports = router;
