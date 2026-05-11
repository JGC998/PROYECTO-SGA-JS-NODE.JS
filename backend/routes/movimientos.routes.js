"use strict";

const { Router } = require('express');
const { sql, getPool } = require('../db');

const router = Router();
const q = (pool) => pool.request();

// ─── NÚCLEO CRÍTICO — STOCK CON TRANSACCIONES ─────────────────────────────────

router.post('/entrada', async (req, res) => {
    try {
        const { cod, ubi, lot, cant } = req.body || {};
        if (!cod || !ubi || !lot) return res.status(400).json({ error: 'Los campos cod, ubi y lot son obligatorios' });
        if (cant === undefined || cant === null) return res.status(400).json({ error: 'El campo cant es obligatorio' });
        const cantNum = Number(cant);
        if (!Number.isFinite(cantNum) || cantNum <= 0) return res.status(400).json({ error: 'La cantidad debe ser un número mayor que 0' });
        const pool = await getPool();
        const artCheck = await q(pool).input('cod', cod).query('SELECT ARTCOD FROM ARTICULO WHERE ARTCOD = @cod');
        if (!artCheck.recordset.length) {
            await q(pool).input('cod', cod).input('nom', 'ALTA AUTOMÁTICA - ' + cod)
                .query('INSERT INTO ARTICULO (ARTCOD, ARTNOM) VALUES (@cod, @nom)');
        }
        const result = await q(pool).input('cod', cod).input('ubi', ubi).input('lot', lot).input('cant', cantNum)
            .query('UPDATE STOCK SET STOCAN = STOCAN + @cant WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot');
        if (result.rowsAffected[0] === 0) {
            await q(pool).input('cod', cod).input('ubi', ubi).input('lot', lot).input('cant', cantNum)
                .query('INSERT INTO STOCK (STOARTCOD, STOUBI, STOLOT, STOCAN) VALUES (@cod, @ubi, @lot, @cant)');
        }
        res.json({ success: true, message: 'Entrada registrada' });
    } catch (err) { console.error("[ERROR]", err.message || err); res.status(500).json({ success: false, message: 'Error interno del servidor' }); }
});

router.post('/traspaso', async (req, res) => {
    try {
        const { cod, ubiOri, ubiDes, lot, cant } = req.body || {};
        if (!cod || !ubiOri || !ubiDes || !lot) return res.status(400).json({ error: 'Los campos cod, ubiOri, ubiDes y lot son obligatorios' });
        if (ubiOri === ubiDes) return res.status(400).json({ error: 'La ubicación destino debe ser diferente de la ubicación origen' });
        if (cant === undefined || cant === null) return res.status(400).json({ error: 'El campo cant es obligatorio' });
        const cantNum = Number(cant);
        if (!Number.isFinite(cantNum) || cantNum <= 0) return res.status(400).json({ error: 'La cantidad debe ser un número mayor que 0' });
        const pool = await getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            const origen = await transaction.request()
                .input('cod', cod)
                .input('ubi', ubiOri)
                .input('lot', lot)
                .query('SELECT STOCAN FROM STOCK WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot');

            if (!origen.recordset.length || origen.recordset[0].STOCAN < cantNum) {
                const e = new Error('Stock insuficiente para realizar el traspaso');
                e.isBusinessError = true;
                e.statusCode = 409;
                throw e;
            }

            await transaction.request().input('cod', cod).input('ubi', ubiOri).input('lot', lot).input('cant', cantNum)
                .query('UPDATE STOCK SET STOCAN = STOCAN - @cant WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot');

            const dest = await transaction.request().input('cod', cod).input('ubi', ubiDes).input('lot', lot)
                .query('SELECT STOCAN FROM STOCK WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot');

            if (dest.recordset.length > 0) {
                await transaction.request().input('cod', cod).input('ubi', ubiDes).input('lot', lot).input('cant', cantNum)
                    .query('UPDATE STOCK SET STOCAN = STOCAN + @cant WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot');
            } else {
                await transaction.request().input('cod', cod).input('ubi', ubiDes).input('lot', lot).input('cant', cantNum)
                    .query('INSERT INTO STOCK (STOARTCOD, STOUBI, STOLOT, STOCAN) VALUES (@cod, @ubi, @lot, @cant)');
            }
            await transaction.commit();
            res.json({ success: true, message: 'Traspaso completado' });
        } catch (err) { await transaction.rollback(); throw err; }
    } catch (err) {
        if (err.isBusinessError) return res.status(err.statusCode).json({ success: false, message: err.message });
        console.error("[ERROR]", err.message || err);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

router.post('/salida', async (req, res) => {
    try {
        const { cod, ubi, lot, cant } = req.body || {};
        if (!cod || !ubi || !lot) return res.status(400).json({ error: 'Los campos cod, ubi y lot son obligatorios' });
        if (cant === undefined || cant === null) return res.status(400).json({ error: 'El campo cant es obligatorio' });
        const cantNum = Number(cant);
        if (!Number.isFinite(cantNum) || cantNum <= 0) return res.status(400).json({ error: 'La cantidad debe ser un número mayor que 0' });
        const pool = await getPool();
        const check = await q(pool).input('cod', cod).input('ubi', ubi).input('lot', lot)
            .query('SELECT STOCAN FROM STOCK WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot');
        if (!check.recordset.length || check.recordset[0].STOCAN < cantNum)
            return res.status(400).json({ success: false, message: 'Stock insuficiente' });
        await q(pool).input('cod', cod).input('ubi', ubi).input('lot', lot).input('cant', cantNum)
            .query('UPDATE STOCK SET STOCAN = STOCAN - @cant WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot');
        res.json({ success: true, message: 'Salida confirmada' });
    } catch (err) { console.error("[ERROR]", err.message || err); res.status(500).json({ success: false, message: 'Error interno del servidor' }); }
});

module.exports = router;
