"use strict";

const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();
const q = (pool) => pool.request();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

router.get('/articulos', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '', limite = 200 } = req.query;
        const safeLimit = Math.min(Math.max(parseInt(limite, 10) || 200, 1), 1000);

        const r = await q(pool)
            .input('b', `%${buscar}%`)
            .query(`SELECT TOP ${safeLimit}
                ARTCOD AS articulo, ARTNOM AS nombre,
                ARTSTOMIN AS stock_minimo, ARTSTOMAX AS stock_maximo,
                ARTCOS AS precio_costo, ARTDES1 AS dto,
                ARTCOL AS color, ARTMEDCOD AS medida,
                ARTMAT AS material, ARTCOD2 AS codigo,
                ARTBARCOD AS barcode, ARTGRUCOD AS familia
                FROM ARTICULO
                WHERE ARTCOD LIKE @b OR ARTNOM LIKE @b OR ARTCOD2 LIKE @b
                ORDER BY ARTCOD`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

router.get('/articulos/:cod', async (req, res) => {
    try {
        const cod = req.params.cod;
        if (!cod || cod.length > 50) return res.status(400).json({ error: 'Código no válido' });
        const pool = await getPool();
        const [art, stock] = await Promise.all([
            q(pool).input('cod', cod)
                .query(`SELECT ARTCOD AS articulo, ARTNOM AS nombre,
                    ARTSTOMIN AS stock_minimo, ARTSTOMAX AS stock_maximo,
                    ARTCOS AS precio_costo, ARTDES1 AS dto, ARTCOL AS color,
                    ARTMEDCOD AS medida, ARTMAT AS material, ARTCOD2 AS codigo
                    FROM ARTICULO WHERE ARTCOD = @cod`),
            q(pool).input('cod', cod)
                .query('SELECT STOUBI, STOLOT, STOCAN FROM STOCK WHERE STOARTCOD = @cod AND STOCAN > 0 ORDER BY STOUBI')
        ]);
        if (!art.recordset.length) return res.status(404).json({ error: 'Artículo no encontrado' });
        res.json({ ...art.recordset[0], stock: stock.recordset });
    } catch (err) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

module.exports = router;
