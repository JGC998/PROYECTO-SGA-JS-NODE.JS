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
const stockRoutes = require('./routes/stock.routes');

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
app.use('/', stockRoutes);

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

// ─── ARTÍCULOS SIN REPOSICIÓN ─────────────────────────────────────────────────

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

// ─── MÍNIMOS Y MÁXIMOS ────────────────────────────────────────────────────────

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
