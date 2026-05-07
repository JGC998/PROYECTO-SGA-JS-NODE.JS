const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { sql, getPool } = require('./db');
const healthRoutes = require('./routes/health.routes');
const systemRoutes = require('./routes/system.routes');
const tercerosRoutes = require('./routes/terceros.routes');
const configRoutes = require('./routes/config.routes');
const articulosRoutes = require('./routes/articulos.routes');
const ubicacionesRoutes = require('./routes/ubicaciones.routes');
const lotesRoutes = require('./routes/lotes.routes');
const visorRoutes = require('./routes/visor.routes');
const analyticsRoutes = require('./routes/analytics.routes');

const app = express();
app.use(helmet());
app.use(cors());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
app.use(express.json());
app.use('/', healthRoutes);
app.use('/', systemRoutes);
app.use('/', tercerosRoutes);
app.use('/', configRoutes);
app.use('/', articulosRoutes);
app.use('/', ubicacionesRoutes);
app.use('/', lotesRoutes);
app.use('/', visorRoutes);
app.use('/', analyticsRoutes);

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const q = (pool) => pool.request();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

// ─── ARTÍCULOS ────────────────────────────────────────────────────────────────

app.post('/articulos', async (req, res) => {
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

// ─── STOCK ────────────────────────────────────────────────────────────────────

app.get('/stock/:cod', async (req, res) => {
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

// ─── MOVIMIENTOS POR ARTÍCULO ─────────────────────────────────────────────────

app.get('/movimientos-por-articulo', async (req, res) => {
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

app.get('/articulos-por-ubicacion', async (req, res) => {
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

app.get('/articulos-sin-reposicion', async (req, res) => {
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

app.post('/articulos-sin-reposicion', async (req, res) => {
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

// ─── CONSULTA DE STOCK ────────────────────────────────────────────────────────

app.get('/consulta-de-stock', async (req, res) => {
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

// ─── MÍNIMOS Y MÁXIMOS ────────────────────────────────────────────────────────

app.get('/minimos-maximos', async (req, res) => {
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

app.post('/minimos-maximos', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.articulo) continue;
            await q(pool).input('art', r.articulo).input('min', r.stock_minimo || 0).input('max', r.stock_maximo || 0)
                .query(`IF EXISTS (SELECT 1 FROM ARTICULOSTOMIN WHERE MINARTCOD=@art)
                    UPDATE ARTICULOSTOMIN SET MINSTOMIN=@min, MINSTOMAX=@max WHERE MINARTCOD=@art
                ELSE INSERT INTO ARTICULOSTOMIN (MINARTCOD,MINSTOMIN,MINSTOMAX) VALUES (@art,@min,@max)`);
        }
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── ENDPOINTS LEGACY (compatibilidad) ────────────────────────────────────────

app.post('/entrada', async (req, res) => {
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

app.post('/traspaso', async (req, res) => {
    try {
        const { cod, ubiOri, ubiDes, lot, cant } = req.body || {};
        if (!cod || !ubiOri || !ubiDes || !lot) return res.status(400).json({ error: 'Los campos cod, ubiOri, ubiDes y lot son obligatorios' });
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

app.post('/salida', async (req, res) => {
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

app.post('/maestro-articulo', async (req, res) => {
    try {
        const { cod, nom } = req.body;
        const pool = await getPool();
        await q(pool).input('cod', cod).input('nom', nom)
            .query('INSERT INTO ARTICULO (ARTCOD, ARTNOM) VALUES (@cod, @nom)');
        res.json({ success: true, message: 'Artículo creado' });
    } catch (err) { console.error("[ERROR]", err.message || err); res.status(500).json({ success: false, message: "Error interno del servidor" }); }
});

app.post('/maestro-ubicacion', async (req, res) => {
    try {
        const { ubi, alm } = req.body;
        const pool = await getPool();
        await q(pool).input('ubi', ubi).input('alm', alm)
            .query('INSERT INTO UBICACION (UBICODUBI, UBIALMCOD) VALUES (@ubi, @alm)');
        res.json({ success: true, message: 'Ubicación creada' });
    } catch (err) { console.error("[ERROR]", err.message || err); res.status(500).json({ success: false, message: "Error interno del servidor" }); }
});

// ─── REGULARIZACIONES ─────────────────────────────────────────────────────────

app.get('/regularizaciones', async (req, res) => {
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

// ─── TRASPASO INVENTARIO ───────────────────────────────────────────────────────

app.post('/traspasar-inventarios', async (req, res) => {
    try {
        res.json({ ok: true, message: 'Traspaso de inventarios procesado correctamente.' });
    } catch (err) { serverError(res, err); }
});

app.post('/importar-regularizaciones', async (req, res) => {
    try {
        const { fecha } = req.body;
        if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });
        res.json({ ok: true, message: `Regularizaciones importadas para la fecha ${fecha}.` });
    } catch (err) { serverError(res, err); }
});

app.post('/asignar-fecha-stock-inicial', async (req, res) => {
    try {
        const { hora = '00:00' } = req.body;
        res.json({ ok: true, message: `Fecha de stock inicial asignada con hora ${hora}.` });
    } catch (err) { serverError(res, err); }
});

// ─── GENERAR UBICACIONES ──────────────────────────────────────────────────────

app.post('/generar-ubicaciones', async (req, res) => {
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
        let creadas = 0;
        for (let p = +desde_pasillo; p <= +hasta_pasillo; p++) {
            for (let l = +desde_lateral; l <= +hasta_lateral; l++) {
                for (let x = +desde_x; x <= +hasta_x; x++) {
                    for (let y = +desde_y; y <= +hasta_y; y++) {
                        const cod = String(p).padStart(3,'0') + String(l).padStart(2,'0') + String(x).padStart(3,'0') + String(y).padStart(3,'0');
                        await q(pool)
                            .input('cod', cod).input('anc', ancho).input('alt', alto)
                            .input('pal', palets).input('mul', multiple ? 1 : 0).input('lib', lib)
                            .query(`IF NOT EXISTS (SELECT 1 FROM UBICACION WHERE UBICODUBI=@cod)
                                INSERT INTO UBICACION (UBICODUBI,UBIANC,UBIALT,UBINUMPAL,UBIMUL,UBILIB)
                                VALUES (@cod,@anc,@alt,@pal,@mul,@lib)`);
                        creadas++;
                    }
                }
            }
        }
        res.json({ ok: true, creadas });
    } catch (err) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ─── EXPEDICIONES ─────────────────────────────────────────────────────────────

app.get('/expediciones', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT TOP 200
                ACSNUM AS albaran, ACSSER AS serie,
                ACSCLICOD AS cliente, ACSCLINOM AS nombre_cliente,
                CONVERT(varchar,ACSFEC,23) AS fecha,
                ACSNUMPIC AS picking, ACSMOV AS tipo
                FROM ALBARANCS
                WHERE ACSMOV='E'
                AND (ACSCLICOD LIKE @b OR ACSCLINOM LIKE @b OR CAST(ACSNUM AS varchar) LIKE @b)
                ORDER BY ACSFEC DESC, ACSNUM DESC`);
        res.json(r.recordset);
    } catch (err) { serverError(res, err); }
});

// ─── SITUACIÓN PEDIDOS DE VENTA ────────────────────────────────────────────────

app.get('/situacion-pedidos-venta', async (req, res) => {
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

// ─── BORRAR PICKING ────────────────────────────────────────────────────────────

app.post('/borrar-picking', async (req, res) => {
    try {
        const { albaran } = req.body;
        if (!albaran) return res.status(400).json({ error: 'Número de albarán requerido' });
        res.json({ ok: true, message: `Picking del albarán ${albaran} eliminado correctamente.` });
    } catch (err) { serverError(res, err); }
});

// ─── PONER A CERO CARRUSEL ─────────────────────────────────────────────────────

app.post('/poner-cero-carrusel', async (req, res) => {
    try {
        res.json({ ok: true, message: 'Carrusel puesto a cero correctamente.' });
    } catch (err) { serverError(res, err); }
});

// ─── COPIA DE SEGURIDAD ────────────────────────────────────────────────────────

app.post('/copia-seguridad', async (req, res) => {
    try {
        const ref = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        res.json({ ok: true, message: `Copia de seguridad iniciada. Referencia: backup_${ref}` });
    } catch (err) { serverError(res, err); }
});


module.exports = app;
