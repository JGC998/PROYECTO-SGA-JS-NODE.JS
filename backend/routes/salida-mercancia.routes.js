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

const SGA_SERIE  = 'ELIN';
const SGA_CONEJE = '';
const EMPALMCOD  = '';

router.post('/salida', async (req, res) => {
    try {
        const { cod, ubi, lot, cant } = req.body || {};
        const artStr = String(cod  || '').trim();
        const ubiStr = String(ubi  || '').trim();
        const lotStr = String(lot  || '').trim();
        const cantidad = Number(cant);

        if (!artStr) return res.status(400).json({ error: 'articulo obligatorio' });
        if (!ubiStr) return res.status(400).json({ error: 'ubicacion obligatoria' });
        if (!lotStr) return res.status(400).json({ error: 'lote obligatorio' });
        if (!Number.isFinite(cantidad) || cantidad <= 0)
            return res.status(400).json({ error: 'cantidad debe ser mayor que 0' });

        const pool = await getPool();

        // Verificar artículo
        const artExiste = await q(pool).input('art', artStr)
            .query('SELECT COUNT(*) AS cnt FROM ARTICULO WHERE ARTCOD = @art');
        if (artExiste.recordset[0].cnt === 0)
            return res.status(404).json({ error: `Artículo ${artStr} no encontrado` });

        // Obtener código exacto de ubicación (con padding de la BD)
        const ubiRow = await q(pool).input('ubi', ubiStr)
            .query('SELECT UBICODUBI FROM UBICACION WHERE RTRIM(UBICODUBI) = @ubi');
        if (!ubiRow.recordset.length)
            return res.status(404).json({ error: `Ubicación ${ubiStr} no encontrada` });
        const ubiExacta = ubiRow.recordset[0].UBICODUBI;

        // Verificar stock suficiente
        const stockActual = await q(pool)
            .input('art', artStr).input('ubi', ubiStr).input('lot', lotStr)
            .query(`SELECT ISNULL(SUM(STOCAN),0) AS stock FROM STOCK
                    WHERE RTRIM(STOARTCOD)=@art AND RTRIM(STOUBI)=@ubi AND RTRIM(STOLOT)=@lot`);
        const stockAntes = stockActual.recordset[0].stock;
        if (stockAntes < cantidad)
            return res.status(409).json({ error: `Stock insuficiente: disponible ${stockAntes}, solicitado ${cantidad}` });

        // Numeración del albarán
        const numRes = await q(pool)
            .input('concod', 'SALIDAS')
            .input('conser', SGA_SERIE)
            .input('coneje', SGA_CONEJE)
            .query(`UPDATE CONTADOR SET CONNUM = CONNUM + 1, REGMOD = 1
                    WHERE CONCOD=@concod AND CONSER=@conser AND CONEJE=@coneje;
                    SELECT CONNUM AS num FROM CONTADOR
                    WHERE CONCOD=@concod AND CONSER=@conser AND CONEJE=@coneje`);
        let numAsignado = numRes.recordset[0]?.num;

        // Si no hay serie SALIDAS, crear el registro y usar número 1
        if (!numAsignado) {
            await q(pool)
                .input('concod', 'SALIDAS').input('conser', SGA_SERIE).input('coneje', SGA_CONEJE)
                .query(`INSERT INTO CONTADOR (CONCOD, CONSER, CONEJE, CONNUM, REGMOD)
                        VALUES (@concod, @conser, @coneje, 1, 1)`);
            numAsignado = 1;
        }

        // Registrar movimiento en ALBARANCS via SP
        const erpRes = await q(pool)
            .input('ser',     SGA_SERIE)
            .input('eje',     SGA_CONEJE)
            .input('num',     numAsignado)
            .input('mov',     'SA')
            .input('usr',     'SGA')
            .input('emp',     EMPALMCOD)
            .input('art',     artStr)
            .input('can',     cantidad)
            .input('lot',     lotStr)
            .input('ubi',     ubiExacta)
            .input('obs',     'Salida SGA')
            .output('accion', sql.Float)
            .output('mensaje', sql.NVarChar(sql.MAX))
            .query(`EXEC pr_grabarCompraDirecta
                        @SER=@ser, @EJE=@eje, @NUM=@num, @MOV=@mov,
                        @USUARIOQANET=@usr, @EMPRESA=@emp,
                        @ACSARTCOD=@art, @ACCCLICOD='', @ACCCENCOD='', @ACCCLINOM='',
                        @ACSCAN=@can, @ACSLOT=@lot, @ACSUBI=@ubi,
                        @ACSALBOBS=@obs, @SCOD=1, @COD=1,
                        @COMPRADIRECTA=1,
                        @ACCION=@accion OUTPUT, @MENSAJE=@mensaje OUTPUT`);

        const accion = Number(erpRes.output.accion);
        if (accion === 99) {
            const msg = erpRes.output.mensaje || 'Error en pr_grabarCompraDirecta';
            console.error('[salida-mercancia] ERP error accion=99:', msg);
            return res.status(500).json({ error: `ERP rechazó la operación: ${msg}` });
        }

        // Actualizar STOCK y STOCKLOTE
        await q(pool)
            .input('art', artStr).input('ubi', ubiExacta).input('lot', lotStr).input('cant', cantidad)
            .query(`UPDATE STOCKLOTE SET STOCAN = STOCAN - @cant
                    WHERE RTRIM(STOARTCOD)=@art AND STOUBI=@ubi AND RTRIM(STOLOT)=@lot`);
        await q(pool)
            .input('art', artStr).input('ubi', ubiExacta).input('lot', lotStr).input('cant', cantidad)
            .query(`UPDATE STOCK SET STOCAN = STOCAN - @cant
                    WHERE RTRIM(STOARTCOD)=@art AND STOUBI=@ubi AND RTRIM(STOLOT)=@lot`);

        // Stock resultante
        const stockPost = await q(pool)
            .input('art', artStr).input('ubi', ubiStr).input('lot', lotStr)
            .query(`SELECT ISNULL(SUM(STOCAN),0) AS stock FROM STOCK
                    WHERE RTRIM(STOARTCOD)=@art AND RTRIM(STOUBI)=@ubi AND RTRIM(STOLOT)=@lot`);
        const stockNuevo = stockPost.recordset[0].stock;

        res.json({
            ok:           true,
            albaran:      numAsignado,
            serie:        SGA_SERIE,
            articulo:     artStr,
            ubicacion:    ubiStr,
            lote:         lotStr,
            cantidad:     cantidad,
            stock_antes:  stockAntes,
            stock_nuevo:  stockNuevo
        });
    } catch (err) { serverError(res, err); }
});

module.exports = router;
