"use strict";

const { Router } = require('express');
const { getPool, sql } = require('../db');

const router = Router();
const q = (pool) => pool.request();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

// ─── ENTRADA DE MERCANCÍA ─────────────────────────────────────────────────────
//
// Hallazgos FASE 9.3 — CONTADOR real en LIN:
//   - CONSER es char(5): serie SGA debe ser ≤ 5 chars → se usa 'ELIN' (4 chars)
//   - CONEJE='' porque ENTRADAS ERP usa ejercicio vacío (patrón ENTRADAS/''/'' con CONNUM=1674)
//   - Numeración: pr_sumaContador2 retorna N-anterior; numAsignado = retorno + 1
//   - Serie 'ELIN' pre-creada con CONNUM=0 antes del primer uso (evita branch ELSE buggy del SP)
//
// Confirmado con Qanet (2026-05-22, FASE K.1):
//   EMPALMCOD = '' → almacén de trabajo; LIN siempre usa el mismo valor vacío.
//   EMPTIPEMP = 0  → tipo de empresa; no se pasa al SP (pr_grabarCompraDirecta no lo recibe).
//                    Riesgo si se activa tipo 5: afecta ubicaciones 900*.
const EMPALMCOD  = '';      // Confirmado Qanet: almacén de trabajo LIN
const SGA_SERIE  = 'ELIN';  // Serie SGA entradas (≤5 chars, char(5) en CONTADOR.CONSER)
const SGA_CONEJE = '';      // Ejercicio vacío, igual que ENTRADAS ERP en LIN

function validarEntrada(body) {
    const { articulo, ubicacion, lote, cantidad, usuario } = body || {};
    if (!articulo || typeof articulo !== 'string' || articulo.trim().length === 0 || articulo.length > 50)
        return 'articulo inválido (máx 50 caracteres, obligatorio)';
    if (!ubicacion || typeof ubicacion !== 'string' || ubicacion.trim().length === 0 || ubicacion.length > 20)
        return 'ubicacion inválida (máx 20 caracteres, obligatoria)';
    if (!lote || typeof lote !== 'string' || lote.trim().length === 0 || lote.length > 10)
        return 'lote inválido (máx 10 caracteres, obligatorio)';
    const cant = Number(cantidad);
    if (!Number.isFinite(cant) || cant <= 0)
        return 'cantidad debe ser un número mayor que 0';
    if (usuario !== undefined && (typeof usuario !== 'string' || usuario.length > 50))
        return 'usuario inválido (máx 50 caracteres)';
    return null;
}

router.post('/entrada-mercancia', async (req, res) => {
    try {
        const err400 = validarEntrada(req.body);
        if (err400) return res.status(400).json({ error: err400 });

        const { articulo, ubicacion, lote, cantidad } = req.body;
        const artStr = String(articulo).trim();
        const ubiStr = String(ubicacion).trim();
        const lotStr = String(lote).trim();
        const cant   = Number(cantidad);

        const pool = await getPool();

        // Verificar que el artículo existe
        const artExiste = await q(pool).input('art', artStr)
            .query('SELECT COUNT(*) AS cnt FROM ARTICULO WHERE ARTCOD = @art');
        if (artExiste.recordset[0].cnt === 0)
            return res.status(404).json({ error: `Artículo ${artStr} no encontrado` });

        // Verificar que la ubicación existe
        const ubiExiste = await q(pool).input('ubi', ubiStr)
            .query('SELECT COUNT(*) AS cnt FROM UBICACION WHERE UBICODUBI = @ubi');
        if (ubiExiste.recordset[0].cnt === 0)
            return res.status(404).json({ error: `Ubicación ${ubiStr} no encontrada` });

        // Stock previo en STOCKLOTE para la verificación posterior
        const stockPrev = await q(pool)
            .input('art', artStr).input('ubi', ubiStr).input('lot', lotStr)
            .query(`SELECT ISNULL(SUM(STOCAN),0) AS stock
                    FROM STOCKLOTE
                    WHERE RTRIM(STOARTCOD)=@art AND RTRIM(STOUBI)=@ubi AND RTRIM(STOLOT)=@lot`);
        const stockAntes = stockPrev.recordset[0].stock;

        // Paso 1: numeración — leer CONNUM actual y actualizar directamente.
        // Se usa UPDATE en vez de EXEC pr_sumaContador2 porque:
        //   a) el SP tiene un bug en el branch ELSE cuando CONSER>5 chars o serie nueva
        //   b) la serie ELIN se pre-crea con CONNUM=0 en la primera instalación
        //   c) el patrón UPDATE+SELECT es equivalente y más seguro desde Node.js
        const numRes = await q(pool)
            .input('concod', 'ENTRADAS')
            .input('conser', SGA_SERIE)
            .input('coneje', SGA_CONEJE)
            .query(`UPDATE CONTADOR SET CONNUM = CONNUM + 1, REGMOD = 1
                    WHERE CONCOD=@concod AND CONSER=@conser AND CONEJE=@coneje;
                    SELECT CONNUM AS num FROM CONTADOR
                    WHERE CONCOD=@concod AND CONSER=@conser AND CONEJE=@coneje`);
        const numAsignado = numRes.recordset[0]?.num;
        if (!numAsignado) throw new Error('No se pudo generar número de albarán SGA (serie ELIN no inicializada)');

        // Paso 2: entrada ERP — pr_grabarCompraDirecta con @COMPRADIRECTA=1
        // @COMPRADIRECTA=1: salta lectura/escritura en ALBARANCL, usa @SCOD=1 directamente.
        // Esto es el path de entrada directa de stock (sin pedido de compra previo).
        // El SP tiene BEGIN TRAN real y OUTPUT @ACCION (99=error, resto=ok).
        const erpRes = await q(pool)
            .input('ser',      SGA_SERIE)
            .input('eje',      SGA_CONEJE)
            .input('num',      numAsignado)
            .input('mov',      'PP')
            .input('usr',      'SGA')
            .input('emp',      EMPALMCOD)
            .input('art',      artStr)
            .input('clicod',   '')
            .input('cencod',   '')
            .input('clinom',   '')
            .input('can',      cant)
            .input('lot',      lotStr)
            .input('ubi',      ubiStr)
            .input('obs',      'Entrada SGA')
            .input('scod',     1)
            .input('cod',      1)
            .input('directo',  1)
            .output('accion',  sql.Float)
            .output('mensaje', sql.NVarChar(sql.MAX))
            .query(`EXEC pr_grabarCompraDirecta
                        @SER=@ser, @EJE=@eje, @NUM=@num, @MOV=@mov,
                        @USUARIOQANET=@usr, @EMPRESA=@emp,
                        @ACSARTCOD=@art, @ACCCLICOD=@clicod, @ACCCENCOD=@cencod,
                        @ACCCLINOM=@clinom, @ACSCAN=@can, @ACSLOT=@lot, @ACSUBI=@ubi,
                        @ACSALBOBS=@obs, @SCOD=@scod, @COD=@cod,
                        @COMPRADIRECTA=@directo,
                        @ACCION=@accion OUTPUT, @MENSAJE=@mensaje OUTPUT`);

        const accion = Number(erpRes.output.accion);
        if (accion === 99) {
            const msg = erpRes.output.mensaje || 'Error en pr_grabarCompraDirecta';
            console.error('[entrada-mercancia] ERP error accion=99:', msg);
            return res.status(500).json({ error: `ERP rechazó la operación: ${msg}` });
        }

        // Verificación posterior
        const stockPost = await q(pool)
            .input('art', artStr).input('ubi', ubiStr).input('lot', lotStr)
            .query(`SELECT ISNULL(SUM(STOCAN),0) AS stock
                    FROM STOCKLOTE
                    WHERE RTRIM(STOARTCOD)=@art AND RTRIM(STOUBI)=@ubi AND RTRIM(STOLOT)=@lot`);
        const stockNuevo = stockPost.recordset[0].stock;

        res.json({
            ok:              true,
            albaran:         numAsignado,
            serie:           SGA_SERIE,
            articulo:        artStr,
            ubicacion:       ubiStr,
            lote:            lotStr,
            cantidad:        cant,
            stocklote_antes: stockAntes,
            stocklote_nuevo: stockNuevo
        });
    } catch (err) { serverError(res, err); }
});

module.exports = router;
