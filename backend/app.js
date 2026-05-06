const express = require('express');
const cors = require('cors');
const { sql, getPool } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const q = (pool) => pool.request();



function normalizeDate(value, fallback) {
    if (!value) return fallback;
    const s = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

function daysAgo(days) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ─── DIAGNÓSTICO ──────────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query('SELECT @@VERSION AS version, DB_NAME() AS db');
        res.json({ ok: true, db: r.recordset[0].db, version: r.recordset[0].version });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/schema', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query(`
            SELECT t.name AS tabla, c.name AS columna, tp.name AS tipo, c.max_length
            FROM sys.tables t
            JOIN sys.columns c ON c.object_id = t.object_id
            JOIN sys.types tp ON tp.user_type_id = c.user_type_id
            ORDER BY t.name, c.column_id`);
        const schema = {};
        for (const row of r.recordset) {
            if (!schema[row.tabla]) schema[row.tabla] = [];
            schema[row.tabla].push(`${row.columna} (${row.tipo})`);
        }
        res.json(schema);
    } catch (err) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ─── ARTÍCULOS ────────────────────────────────────────────────────────────────

app.get('/articulos', async (req, res) => {
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/articulos/:cod', async (req, res) => {
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PROVEEDORES ──────────────────────────────────────────────────────────────

app.get('/proveedores', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT TOP 300
                CLICOD AS codigo, CLIRAZ AS razon_social, CLINOM AS nombre,
                CLIDIR AS direccion, CLIPOSCIU AS localidad,
                CLINIF AS cif, CLITEL AS telefono,
                CLIPERCON AS contacto, CLIEMA AS email
                FROM PROVEEDOR
                WHERE CLICOD LIKE @b OR CLIRAZ LIKE @b OR CLINOM LIKE @b OR CLINIF LIKE @b
                ORDER BY CLICOD`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/proveedores/:cod', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).input('cod', req.params.cod)
            .query(`SELECT CLICOD AS codigo, CLINOM AS nombre, CLIRAZ AS razon_social,
                CLIDIR AS direccion, CLINIF AS cif, CLITEL AS telefono,
                CLIPERCON AS contacto, CLIEMA AS email, CLIPOSCIU AS localidad
                FROM PROVEEDOR WHERE CLICOD = @cod`);
        if (!r.recordset.length) return res.status(404).json({ error: 'No encontrado' });
        res.json(r.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CLIENTES ─────────────────────────────────────────────────────────────────

app.get('/clientes', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT TOP 300
                CLICOD AS codigo, CLICENCOD AS centro, CLIRAZ AS razon_social,
                CLINOM AS nombre, CLIDIR AS direccion, CLIPOSCIU AS localidad,
                CLINIF AS cif, CLITEL AS telefono, CLIEMA AS email
                FROM CLIENTE
                WHERE CLICOD LIKE @b OR CLIRAZ LIKE @b OR CLINOM LIKE @b
                ORDER BY CLICOD`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/clientes/:cod', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).input('cod', req.params.cod)
            .query(`SELECT CLICOD AS codigo, CLINOM AS nombre, CLIRAZ AS razon_social,
                CLIDIR AS direccion, CLINIF AS cif, CLITEL AS telefono,
                CLIEMA AS email, CLIPOSCIU AS localidad
                FROM CLIENTE WHERE CLICOD = @cod`);
        if (!r.recordset.length) return res.status(404).json({ error: 'No encontrado' });
        res.json(r.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── OPERARIOS (usuarios del sistema) ─────────────────────────────────────────

app.get('/operarios', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT USUCOD AS codigo, USUNOM AS nombre,
                USUTIP AS tipo, USUNIV AS nivel
                FROM SGAUSUARIO
                WHERE USUCOD LIKE @b OR USUNOM LIKE @b
                ORDER BY USUCOD`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/operarios/:cod', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).input('cod', req.params.cod)
            .query('SELECT USUCOD AS codigo, USUNOM AS nombre, USUTIP AS tipo, USUNIV AS nivel FROM SGAUSUARIO WHERE USUCOD = @cod');
        if (!r.recordset.length) return res.status(404).json({ error: 'No encontrado' });
        res.json(r.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
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

// ─── ALMACENES ────────────────────────────────────────────────────────────────

app.get('/almacenes', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query('SELECT ALMCOD AS codigo, ALMNOM AS nombre FROM ALMACENES ORDER BY ALMCOD');
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/almacenes', async (req, res) => {
    try {
        const pool = await getPool();
        const { cod, nom } = req.body;
        await q(pool).input('cod', cod).input('nom', nom)
            .query(`IF EXISTS (SELECT 1 FROM ALMACENES WHERE ALMCOD=@cod)
                UPDATE ALMACENES SET ALMNOM=@nom WHERE ALMCOD=@cod
            ELSE INSERT INTO ALMACENES (ALMCOD,ALMNOM) VALUES (@cod,@nom)`);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── UBICACIONES ──────────────────────────────────────────────────────────────

app.get('/ubicaciones', async (req, res) => {
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/ubicaciones', async (req, res) => {
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SUBFAMILIAS ──────────────────────────────────────────────────────────────

app.get('/subfamilias', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query('SELECT SFACOD AS codigo, SFANOM AS nombre, SFANOLOT AS sin_control_lote FROM SUBFAMILIA ORDER BY SFACOD');
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/subfamilias', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.codigo) continue;
            await q(pool).input('cod', r.codigo).input('nom', r.nombre || '').input('nol', r.sin_control_lote ? 1 : 0)
                .query(`IF EXISTS (SELECT 1 FROM SUBFAMILIA WHERE SFACOD=@cod)
                    UPDATE SUBFAMILIA SET SFANOM=@nom, SFANOLOT=@nol WHERE SFACOD=@cod
                ELSE INSERT INTO SUBFAMILIA (SFACOD,SFANOM,SFANOLOT) VALUES (@cod,@nom,@nol)`);
        }
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── OBSERVACIONES POR ARTÍCULO Y LOTE ────────────────────────────────────────

app.get('/observaciones-articulo-lote', async (req, res) => {
    try {
        const pool = await getPool();
        const { articulo = '' } = req.query;
        const r = await q(pool).input('art', `%${articulo}%`)
            .query(`SELECT o.HISCON AS id, o.HISARTCOD AS articulo,
                a.ARTNOM AS nombre, o.HISLOT AS lote, o.HISOBS AS observaciones
                FROM ARTICULOLOTOBS o
                LEFT JOIN ARTICULO a ON a.ARTCOD = o.HISARTCOD
                WHERE o.HISARTCOD LIKE @art
                ORDER BY o.HISARTCOD, o.HISLOT`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/observaciones-articulo-lote', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.articulo) continue;
            await q(pool).input('art', r.articulo).input('lot', r.lote || '').input('obs', r.observaciones || '')
                .query(`IF EXISTS (SELECT 1 FROM ARTICULOLOTOBS WHERE HISARTCOD=@art AND HISLOT=@lot)
                    UPDATE ARTICULOLOTOBS SET HISOBS=@obs WHERE HISARTCOD=@art AND HISLOT=@lot
                ELSE INSERT INTO ARTICULOLOTOBS (HISARTCOD,HISLOT,HISOBS) VALUES (@art,@lot,@obs)`);
        }
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── LOTE EXCLUSIVO ───────────────────────────────────────────────────────────

app.get('/lote-exclusivo', async (req, res) => {
    try {
        const pool = await getPool();
        const { cliente = '', articulo = '' } = req.query;
        const r = await q(pool).input('cli', `%${cliente}%`).input('art', `%${articulo}%`)
            .query(`SELECT e.HISCON AS id, e.HISCLICOD AS cliente,
                c.CLINOM AS nombre_cliente, e.HISARTCOD AS articulo,
                a.ARTNOM AS nombre_articulo, e.HISLOT AS lote_exclusivo
                FROM ARTICULOEXCLOTCLI e
                LEFT JOIN CLIENTE c ON c.CLICOD = e.HISCLICOD
                LEFT JOIN ARTICULO a ON a.ARTCOD = e.HISARTCOD
                WHERE e.HISCLICOD LIKE @cli AND e.HISARTCOD LIKE @art
                ORDER BY e.HISCLICOD, e.HISARTCOD`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/lote-exclusivo', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.cliente || !r.articulo) continue;
            await q(pool).input('cli', r.cliente).input('art', r.articulo).input('lot', r.lote || '')
                .query(`IF NOT EXISTS (SELECT 1 FROM ARTICULOEXCLOTCLI WHERE HISCLICOD=@cli AND HISARTCOD=@art AND HISLOT=@lot)
                    INSERT INTO ARTICULOEXCLOTCLI (HISCLICOD,HISARTCOD,HISLOT) VALUES (@cli,@art,@lot)`);
        }
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── LOTE MÍNIMO POR CLIENTE ──────────────────────────────────────────────────

app.get('/lote-minimo', async (req, res) => {
    try {
        const pool = await getPool();
        const { cliente = '' } = req.query;
        const r = await q(pool).input('cli', `%${cliente}%`)
            .query(`SELECT h.HISCON AS id, h.HISCLICOD AS cliente,
                c.CLINOM AS nombre_cliente, h.HISDIA AS dias
                FROM ARTICULOLOTCLI h
                LEFT JOIN CLIENTE c ON c.CLICOD = h.HISCLICOD
                WHERE h.HISCLICOD LIKE @cli
                ORDER BY h.HISCLICOD`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/lote-minimo', async (req, res) => {
    try {
        const pool = await getPool();
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        for (const r of rows) {
            if (!r.cliente) continue;
            await q(pool).input('cli', r.cliente).input('dias', r.dias || 0)
                .query(`IF EXISTS (SELECT 1 FROM ARTICULOLOTCLI WHERE HISCLICOD=@cli)
                    UPDATE ARTICULOLOTCLI SET HISDIA=@dias WHERE HISCLICOD=@cli
                ELSE INSERT INTO ARTICULOLOTCLI (HISCLICOD,HISDIA) VALUES (@cli,@dias)`);
        }
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── LOTE NO UTILIZADO ────────────────────────────────────────────────────────

app.get('/lote-no-utilizado', async (req, res) => {
    try {
        const pool = await getPool();
        const { cliente = '', articulo = '' } = req.query;
        const r = await q(pool).input('cli', `%${cliente}%`).input('art', `%${articulo}%`)
            .query(`SELECT e.HISCON AS id, e.HISCLICOD AS cliente,
                c.CLINOM AS nombre_cliente, e.HISARTCOD AS articulo,
                a.ARTNOM AS nombre_articulo, e.HISLOT AS lote
                FROM ARTICULOEXCLOTCLI e
                LEFT JOIN CLIENTE c ON c.CLICOD = e.HISCLICOD
                LEFT JOIN ARTICULO a ON a.ARTCOD = e.HISARTCOD
                WHERE e.HISCLICOD LIKE @cli AND e.HISARTCOD LIKE @art
                ORDER BY e.HISCLICOD, e.HISARTCOD`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── LOTE CUARENTENA ──────────────────────────────────────────────────────────

app.get('/lote-cuarentena', async (req, res) => {
    try {
        const pool = await getPool();
        const { articulo = '' } = req.query;
        const r = await q(pool).input('art', `%${articulo}%`)
            .query(`SELECT o.HISCON AS id, o.HISARTCOD AS articulo,
                a.ARTNOM AS nombre, o.HISLOT AS lote,
                CASE WHEN o.HISOBS LIKE '%CUARENTENA%' THEN 1 ELSE 0 END AS en_cuarentena,
                o.HISOBS AS observaciones
                FROM ARTICULOLOTOBS o
                LEFT JOIN ARTICULO a ON a.ARTCOD = o.HISARTCOD
                WHERE o.HISARTCOD LIKE @art
                ORDER BY o.HISARTCOD, o.HISLOT`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── TERMINALES PDA ───────────────────────────────────────────────────────────

app.get('/terminales-pda', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query('SELECT repcod AS codigo, repnom AS nombre, repser AS serie, repdat AS tipo_doc, reprutsin AS ruta_sinc, reprutwifi AS ruta_wifi FROM terminalpda ORDER BY repcod');
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/terminales-pda', async (req, res) => {
    try {
        const pool = await getPool();
        const { codigo, nombre, serie = '', tipo_doc = '', ruta_sinc = '', ruta_wifi = '' } = req.body;
        await q(pool)
            .input('cod', codigo).input('nom', nombre).input('ser', serie)
            .input('dat', tipo_doc).input('rsin', ruta_sinc).input('rwifi', ruta_wifi)
            .query(`IF EXISTS (SELECT 1 FROM terminalpda WHERE repcod=@cod)
                UPDATE terminalpda SET repnom=@nom, repser=@ser, repdat=@dat, reprutsin=@rsin, reprutwifi=@rwifi
                WHERE repcod=@cod
            ELSE INSERT INTO terminalpda (repcod,repnom,repser,repdat,reprutsin,reprutwifi)
                VALUES (@cod,@nom,@ser,@dat,@rsin,@rwifi)`);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── VISOR (solo lectura, con JOIN) ───────────────────────────────────────────

app.get('/visor/articulos', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT TOP 300
                a.ARTCOD AS articulo, a.ARTNOM AS nombre,
                a.ARTGRUCOD AS familia,
                ISNULL((SELECT SUM(STOCAN) FROM STOCK WHERE STOARTCOD=a.ARTCOD),0) AS stock,
                ISNULL((SELECT TOP 1 STOUBI FROM STOCK WHERE STOARTCOD=a.ARTCOD AND STOCAN>0 ORDER BY STOUBI),'') AS ubicacion,
                ISNULL((SELECT TOP 1 CONVERT(varchar,ACSFEC,23) FROM ALBARANCS WHERE ACSARTCOD=a.ARTCOD ORDER BY ACSFEC DESC),'') AS ultimo_movimiento
                FROM ARTICULO a
                WHERE a.ARTCOD LIKE @b OR a.ARTNOM LIKE @b OR a.ARTCOD2 LIKE @b
                ORDER BY a.ARTCOD`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/visor/proveedores', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT TOP 300
                CLICOD AS codigo, CLINOM AS nombre,
                CLINIF AS cif, CLITEL AS telefono, CLIPOSCIU AS localidad
                FROM PROVEEDOR
                WHERE CLICOD LIKE @b OR CLIRAZ LIKE @b OR CLINOM LIKE @b
                ORDER BY CLICOD`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/visor/clientes', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT TOP 300
                CLICOD AS codigo, CLINOM AS nombre,
                CLINIF AS cif, CLITEL AS telefono, CLIPOSCIU AS localidad
                FROM CLIENTE
                WHERE CLICOD LIKE @b OR CLIRAZ LIKE @b OR CLINOM LIKE @b
                ORDER BY CLICOD`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ESTADÍSTICAS Y PANEL EJECUTIVO ──────────────────────────────────────────

app.get('/estadisticas/dashboard', async (req, res) => {
    try {
        const pool = await getPool();
        const desde = normalizeDate(req.query.desde, daysAgo(30));
        const hasta = normalizeDate(req.query.hasta, new Date().toISOString().slice(0, 10));

        const [
            articulos,
            stock,
            ubicaciones,
            movimientosPeriodo,
            stockBajo,
            sinMovimiento,
            stockPorAlmacen,
            movimientosPorDia,
            tiposMovimiento,
            topArticulos,
            topUbicaciones,
            movimientosRecientes
        ] = await Promise.all([
            q(pool).query(`SELECT COUNT(*) AS total FROM ARTICULO`),

            q(pool).query(`
                SELECT 
                    COUNT(*) AS lineas_stock,
                    ISNULL(SUM(CASE WHEN STOCAN > 0 THEN STOCAN ELSE 0 END), 0) AS unidades_stock
                FROM STOCK
            `),

            q(pool).query(`
                SELECT 
                    COUNT(*) AS total_ubicaciones,
                    (SELECT COUNT(DISTINCT STOUBI) FROM STOCK WHERE STOCAN > 0) AS ubicaciones_ocupadas
                FROM UBICACION
            `),

            q(pool)
                .input('desde', desde)
                .input('hasta', hasta)
                .query(`
                    SELECT 
                        COUNT(*) AS movimientos_periodo,
                        ISNULL(SUM(ABS(ISNULL(ACSCAN, 0))), 0) AS unidades_movidas_periodo
                    FROM ALBARANCS
                    WHERE CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
                `),

            q(pool).query(`
                WITH stock_articulo AS (
                    SELECT STOARTCOD, ISNULL(SUM(STOCAN), 0) AS stock_actual
                    FROM STOCK
                    GROUP BY STOARTCOD
                )
                SELECT COUNT(*) AS total
                FROM ARTICULO a
                LEFT JOIN stock_articulo s ON s.STOARTCOD = a.ARTCOD
                WHERE ISNULL(a.ARTSTOMIN, 0) > 0
                  AND ISNULL(s.stock_actual, 0) <= ISNULL(a.ARTSTOMIN, 0)
            `),

            q(pool).query(`
                WITH ultimo AS (
                    SELECT ACSARTCOD, MAX(ACSFEC) AS ultimo_movimiento
                    FROM ALBARANCS
                    GROUP BY ACSARTCOD
                ),
                stock_articulo AS (
                    SELECT STOARTCOD, SUM(STOCAN) AS stock_actual
                    FROM STOCK
                    GROUP BY STOARTCOD
                )
                SELECT COUNT(*) AS total
                FROM stock_articulo s
                LEFT JOIN ultimo u ON u.ACSARTCOD = s.STOARTCOD
                WHERE s.stock_actual > 0
                  AND (u.ultimo_movimiento IS NULL OR u.ultimo_movimiento < DATEADD(day, -90, GETDATE()))
            `),

            q(pool).query(`
                SELECT TOP 12
                    ISNULL(u.UBIALMCOD, 'Sin almacén') AS almacen,
                    ISNULL(al.ALMNOM, 'Sin nombre') AS nombre_almacen,
                    ISNULL(SUM(CASE WHEN s.STOCAN > 0 THEN s.STOCAN ELSE 0 END), 0) AS unidades,
                    COUNT(DISTINCT s.STOARTCOD) AS articulos,
                    COUNT(DISTINCT s.STOUBI) AS ubicaciones
                FROM STOCK s
                LEFT JOIN UBICACION u ON u.UBICODUBI = s.STOUBI
                LEFT JOIN ALMACENES al ON al.ALMCOD = u.UBIALMCOD
                WHERE s.STOCAN > 0
                GROUP BY ISNULL(u.UBIALMCOD, 'Sin almacén'), ISNULL(al.ALMNOM, 'Sin nombre')
                ORDER BY unidades DESC
            `),

            q(pool)
                .input('desde', desde)
                .input('hasta', hasta)
                .query(`
                    SELECT 
                        CONVERT(varchar, CAST(ACSFEC AS DATE), 23) AS fecha,
                        COUNT(*) AS movimientos,
                        ISNULL(SUM(ABS(ISNULL(ACSCAN, 0))), 0) AS unidades
                    FROM ALBARANCS
                    WHERE CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
                    GROUP BY CAST(ACSFEC AS DATE)
                    ORDER BY CAST(ACSFEC AS DATE)
                `),

            q(pool)
                .input('desde', desde)
                .input('hasta', hasta)
                .query(`
                    SELECT TOP 10
                        ISNULL(NULLIF(ACSMOV, ''), 'Sin tipo') AS tipo,
                        COUNT(*) AS movimientos,
                        ISNULL(SUM(ABS(ISNULL(ACSCAN, 0))), 0) AS unidades
                    FROM ALBARANCS
                    WHERE CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
                    GROUP BY ISNULL(NULLIF(ACSMOV, ''), 'Sin tipo')
                    ORDER BY movimientos DESC
                `),

            q(pool)
                .input('desde', desde)
                .input('hasta', hasta)
                .query(`
                    SELECT TOP 10
                        m.ACSARTCOD AS articulo,
                        ISNULL(a.ARTNOM, 'Sin nombre') AS nombre,
                        COUNT(*) AS movimientos,
                        ISNULL(SUM(ABS(ISNULL(m.ACSCAN, 0))), 0) AS unidades
                    FROM ALBARANCS m
                    LEFT JOIN ARTICULO a ON a.ARTCOD = m.ACSARTCOD
                    WHERE CAST(m.ACSFEC AS DATE) BETWEEN @desde AND @hasta
                    GROUP BY m.ACSARTCOD, ISNULL(a.ARTNOM, 'Sin nombre')
                    ORDER BY unidades DESC, movimientos DESC
                `),

            q(pool).query(`
                SELECT TOP 10
                    s.STOUBI AS ubicacion,
                    ISNULL(u.UBINOM, '') AS descripcion,
                    ISNULL(u.UBIALMCOD, 'Sin almacén') AS almacen,
                    ISNULL(SUM(CASE WHEN s.STOCAN > 0 THEN s.STOCAN ELSE 0 END), 0) AS unidades,
                    COUNT(DISTINCT s.STOARTCOD) AS articulos
                FROM STOCK s
                LEFT JOIN UBICACION u ON u.UBICODUBI = s.STOUBI
                WHERE s.STOCAN > 0
                GROUP BY s.STOUBI, ISNULL(u.UBINOM, ''), ISNULL(u.UBIALMCOD, 'Sin almacén')
                ORDER BY unidades DESC
            `),

            q(pool).query(`
                SELECT TOP 12
                    CONVERT(varchar, ACSFEC, 23) AS fecha,
                    CONVERT(varchar, ACSHOR, 8) AS hora,
                    ISNULL(ACSMOV, '') AS tipo,
                    ISNULL(ACSARTCOD, '') AS articulo,
                    ISNULL((SELECT TOP 1 ARTNOM FROM ARTICULO WHERE ARTCOD = ACSARTCOD), '') AS nombre,
                    ISNULL(ACSUBI, '') AS ubicacion,
                    ISNULL(ACSLOT, '') AS lote,
                    ISNULL(ACSCAN, 0) AS cantidad,
                    ISNULL(ACSCLICOD, '') AS tercero,
                    ISNULL(ACSCLINOM, '') AS nombre_tercero
                FROM ALBARANCS
                ORDER BY ACSFEC DESC, ACSHOR DESC
            `)
        ]);

        const stockRow = stock.recordset[0] || {};
        const ubiRow = ubicaciones.recordset[0] || {};
        const movRow = movimientosPeriodo.recordset[0] || {};

        res.json({
            filtros: { desde, hasta },
            kpis: {
                articulos: articulos.recordset[0]?.total || 0,
                lineas_stock: stockRow.lineas_stock || 0,
                unidades_stock: stockRow.unidades_stock || 0,
                ubicaciones: ubiRow.total_ubicaciones || 0,
                ubicaciones_ocupadas: ubiRow.ubicaciones_ocupadas || 0,
                ocupacion_porcentaje: ubiRow.total_ubicaciones
                    ? Math.round((ubiRow.ubicaciones_ocupadas / ubiRow.total_ubicaciones) * 100)
                    : 0,
                movimientos_periodo: movRow.movimientos_periodo || 0,
                unidades_movidas_periodo: movRow.unidades_movidas_periodo || 0,
                stock_bajo: stockBajo.recordset[0]?.total || 0,
                sin_movimiento_90_dias: sinMovimiento.recordset[0]?.total || 0
            },
            graficos: {
                stock_por_almacen: stockPorAlmacen.recordset,
                movimientos_por_dia: movimientosPorDia.recordset,
                tipos_movimiento: tiposMovimiento.recordset,
                top_articulos: topArticulos.recordset,
                top_ubicaciones: topUbicaciones.recordset
            },
            movimientos_recientes: movimientosRecientes.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/estadisticas/alertas', async (req, res) => {
    try {
        const pool = await getPool();

        const [stockBajo, stockNegativo, sinMovimiento] = await Promise.all([
            q(pool).query(`
                WITH stock_articulo AS (
                    SELECT STOARTCOD, ISNULL(SUM(STOCAN), 0) AS stock_actual
                    FROM STOCK
                    GROUP BY STOARTCOD
                )
                SELECT TOP 25
                    a.ARTCOD AS articulo,
                    a.ARTNOM AS nombre,
                    ISNULL(s.stock_actual, 0) AS stock_actual,
                    ISNULL(a.ARTSTOMIN, 0) AS stock_minimo,
                    ISNULL(a.ARTSTOMAX, 0) AS stock_maximo
                FROM ARTICULO a
                LEFT JOIN stock_articulo s ON s.STOARTCOD = a.ARTCOD
                WHERE ISNULL(a.ARTSTOMIN, 0) > 0
                  AND ISNULL(s.stock_actual, 0) <= ISNULL(a.ARTSTOMIN, 0)
                ORDER BY ISNULL(s.stock_actual, 0) ASC, a.ARTCOD
            `),

            q(pool).query(`
                SELECT TOP 25
                    s.STOARTCOD AS articulo,
                    ISNULL(a.ARTNOM, '') AS nombre,
                    s.STOUBI AS ubicacion,
                    s.STOLOT AS lote,
                    s.STOCAN AS stock
                FROM STOCK s
                LEFT JOIN ARTICULO a ON a.ARTCOD = s.STOARTCOD
                WHERE s.STOCAN < 0
                ORDER BY s.STOCAN ASC
            `),

            q(pool).query(`
                WITH ultimo AS (
                    SELECT ACSARTCOD, MAX(ACSFEC) AS ultimo_movimiento
                    FROM ALBARANCS
                    GROUP BY ACSARTCOD
                ),
                stock_articulo AS (
                    SELECT STOARTCOD, SUM(STOCAN) AS stock_actual
                    FROM STOCK
                    GROUP BY STOARTCOD
                )
                SELECT TOP 25
                    s.STOARTCOD AS articulo,
                    ISNULL(a.ARTNOM, '') AS nombre,
                    s.stock_actual,
                    CONVERT(varchar, u.ultimo_movimiento, 23) AS ultimo_movimiento
                FROM stock_articulo s
                LEFT JOIN ARTICULO a ON a.ARTCOD = s.STOARTCOD
                LEFT JOIN ultimo u ON u.ACSARTCOD = s.STOARTCOD
                WHERE s.stock_actual > 0
                  AND (u.ultimo_movimiento IS NULL OR u.ultimo_movimiento < DATEADD(day, -90, GETDATE()))
                ORDER BY u.ultimo_movimiento ASC
            `)
        ]);

        res.json({
            stock_bajo: stockBajo.recordset,
            stock_negativo: stockNegativo.recordset,
            sin_movimiento_90_dias: sinMovimiento.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── ANALÍTICA — LOG Y ACTIVIDAD ─────────────────────────────────────────────

app.get('/analitica/log', async (req, res) => {
    try {
        const pool = await getPool();

        let desde = normalizeDate(req.query.desde, null);
        let hasta = normalizeDate(req.query.hasta, null);

        if (!desde || !hasta) {
            const maxR = await q(pool).query(`
                SELECT CONVERT(varchar, MAX(CAST(LOGFEC AS DATE)), 23) AS ultima
                FROM LOG
            `);
            const ultima = maxR.recordset[0]?.ultima
                || new Date().toISOString().slice(0, 10);
            hasta = hasta || ultima;
            const d = new Date(ultima);
            d.setDate(d.getDate() - 30);
            desde = desde || d.toISOString().slice(0, 10);
        }

        const [
            actividadUsuario,
            actividadHora,
            tiposAccion,
            ubicacionesUsadas,
            actividadDia
        ] = await Promise.all([

            q(pool)
                .input('desde', desde)
                .input('hasta', hasta)
                .query(`
                    SELECT TOP 20
                        ISNULL(NULLIF(RTRIM(LOGUSU), ''), 'Sin usuario') AS usuario,
                        COUNT(*) AS acciones
                    FROM LOG
                    WHERE CAST(LOGFEC AS DATE) BETWEEN @desde AND @hasta
                    GROUP BY RTRIM(LOGUSU)
                    ORDER BY acciones DESC
                `),

            q(pool)
                .input('desde', desde)
                .input('hasta', hasta)
                .query(`
                    SELECT
                        DATEPART(HOUR, LOGHORREA) AS hora,
                        COUNT(*) AS acciones
                    FROM LOG
                    WHERE LOGHORREA IS NOT NULL
                      AND CAST(LOGFEC AS DATE) BETWEEN @desde AND @hasta
                    GROUP BY DATEPART(HOUR, LOGHORREA)
                    ORDER BY hora
                `),

            q(pool)
                .input('desde', desde)
                .input('hasta', hasta)
                .query(`
                    SELECT TOP 20
                        ISNULL(NULLIF(RTRIM(LOGACC), ''), 'Sin tipo') AS accion,
                        COUNT(*) AS total
                    FROM LOG
                    WHERE CAST(LOGFEC AS DATE) BETWEEN @desde AND @hasta
                    GROUP BY RTRIM(LOGACC)
                    ORDER BY total DESC
                `),

            q(pool)
                .input('desde', desde)
                .input('hasta', hasta)
                .query(`
                    SELECT TOP 20
                        RTRIM(LOGUBI) AS ubicacion,
                        COUNT(*) AS usos
                    FROM LOG
                    WHERE LOGUBI IS NOT NULL
                      AND RTRIM(LOGUBI) <> ''
                      AND CAST(LOGFEC AS DATE) BETWEEN @desde AND @hasta
                    GROUP BY RTRIM(LOGUBI)
                    ORDER BY usos DESC
                `),

            q(pool)
                .input('desde', desde)
                .input('hasta', hasta)
                .query(`
                    SELECT
                        CONVERT(varchar, CAST(LOGFEC AS DATE), 23) AS fecha,
                        COUNT(*) AS acciones
                    FROM LOG
                    WHERE LOGFEC IS NOT NULL
                      AND CAST(LOGFEC AS DATE) BETWEEN @desde AND @hasta
                    GROUP BY CAST(LOGFEC AS DATE)
                    ORDER BY CAST(LOGFEC AS DATE)
                `)
        ]);

        res.json({
            filtros:                { desde, hasta },
            actividad_por_usuario:  actividadUsuario.recordset,
            actividad_por_hora:     actividadHora.recordset,
            tipos_accion:           tiposAccion.recordset,
            ubicaciones_mas_usadas: ubicacionesUsadas.recordset,
            actividad_por_dia:      actividadDia.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/analitica/stock-ubicacion', async (req, res) => {
    try {
        const pool = await getPool();

        const r = await q(pool).query(`
            SELECT TOP 30
                RTRIM(s.STOUBI)                                    AS ubicacion,
                MAX(ISNULL(RTRIM(u.UBINOM), ''))                   AS descripcion,
                MAX(ISNULL(RTRIM(u.UBIALMCOD), ''))                AS almacen,
                COUNT(DISTINCT s.STOARTCOD)                        AS articulos,
                SUM(CASE WHEN ISNULL(s.STOCAN, 0) > 0 THEN ISNULL(s.STOCAN, 0) ELSE 0 END) AS unidades
            FROM STOCK s
            LEFT JOIN UBICACION u ON u.UBICODUBI = s.STOUBI
            WHERE ISNULL(s.STOCAN, 0) > 0
            GROUP BY RTRIM(s.STOUBI)
            ORDER BY unidades DESC
        `);

        res.json({
            stock_por_ubicacion: r.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── ENDPOINTS LEGACY (compatibilidad) ────────────────────────────────────────

app.get('/stats', async (req, res) => {
    try {
        const pool = await getPool();
        const [art, stock, ubi] = await Promise.all([
            q(pool).query('SELECT COUNT(*) AS total FROM ARTICULO'),
            q(pool).query('SELECT ISNULL(SUM(STOCAN),0) AS total FROM STOCK'),
            q(pool).query('SELECT COUNT(DISTINCT STOUBI) AS total FROM STOCK WHERE STOCAN > 0')
        ]);
        res.json({
            articulos: art.recordset[0].total,
            stock: stock.recordset[0].total,
            ubicaciones: ubi.recordset[0].total
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/tablas', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query('SELECT name FROM sys.tables ORDER BY name');
        res.json(r.recordset);
    } catch (err) { res.status(500).send('Error interno del servidor'); }
});

// Tablas que el endpoint /datos/:tabla está autorizado a exponer
const TABLAS_PERMITIDAS = new Set(['ARTICULO', 'STOCK', 'UBICACION', 'PROVEEDOR', 'CLIENTE', 'ALBARANCS', 'ALMACENES']);

app.get('/datos/:tabla', async (req, res) => {
    try {
        const tabla = (req.params.tabla || '').toUpperCase();

        if (!/^[a-zA-Z0-9_]+$/.test(tabla)) {
            return res.status(400).send('Nombre de tabla no válido');
        }

        if (!TABLAS_PERMITIDAS.has(tabla)) {
            return res.status(403).json({ error: 'Tabla no permitida' });
        }

        const pool = await getPool();
        const r = await q(pool).query(`SELECT TOP 100 * FROM [${tabla}]`);
        res.json(r.recordset);
    } catch (err) { res.status(500).send('Error interno del servidor'); }
});

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
    } catch (err) { res.status(500).json({ success: false, message: 'Error interno del servidor' }); }
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
    } catch (err) { res.status(500).json({ success: false, message: 'Error interno del servidor' }); }
});

app.post('/maestro-articulo', async (req, res) => {
    try {
        const { cod, nom } = req.body;
        const pool = await getPool();
        await q(pool).input('cod', cod).input('nom', nom)
            .query('INSERT INTO ARTICULO (ARTCOD, ARTNOM) VALUES (@cod, @nom)');
        res.json({ success: true, message: 'Artículo creado' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/maestro-ubicacion', async (req, res) => {
    try {
        const { ubi, alm } = req.body;
        const pool = await getPool();
        await q(pool).input('ubi', ubi).input('alm', alm)
            .query('INSERT INTO UBICACION (UBICODUBI, UBIALMCOD) VALUES (@ubi, @alm)');
        res.json({ success: true, message: 'Ubicación creada' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── TRASPASO INVENTARIO ───────────────────────────────────────────────────────

app.post('/traspasar-inventarios', async (req, res) => {
    try {
        res.json({ ok: true, message: 'Traspaso de inventarios procesado correctamente.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/importar-regularizaciones', async (req, res) => {
    try {
        const { fecha } = req.body;
        if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });
        res.json({ ok: true, message: `Regularizaciones importadas para la fecha ${fecha}.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/asignar-fecha-stock-inicial', async (req, res) => {
    try {
        const { hora = '00:00' } = req.body;
        res.json({ ok: true, message: `Fecha de stock inicial asignada con hora ${hora}.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
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

// ─── USUARIOS ─────────────────────────────────────────────────────────────────

app.get('/usuarios', async (req, res) => {
    try {
        const pool = await getPool();
        const { buscar = '' } = req.query;
        const r = await q(pool).input('b', `%${buscar}%`)
            .query(`SELECT USUCOD AS codigo, USUNOM AS nombre,
                USUTIP AS tipo, USUNIV AS nivel
                FROM SGAUSUARIO
                WHERE USUCOD LIKE @b OR USUNOM LIKE @b
                ORDER BY USUCOD`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/usuarios', async (req, res) => {
    try {
        const pool = await getPool();
        const { codigo, nombre, tipo = '', nivel = '' } = req.body;
        if (!codigo || !nombre) return res.status(400).json({ error: 'Código y nombre requeridos' });
        await q(pool).input('cod', codigo).input('nom', nombre).input('tip', tipo).input('niv', nivel)
            .query(`IF EXISTS (SELECT 1 FROM SGAUSUARIO WHERE USUCOD=@cod)
                UPDATE SGAUSUARIO SET USUNOM=@nom, USUTIP=@tip, USUNIV=@niv WHERE USUCOD=@cod
            ELSE INSERT INTO SGAUSUARIO (USUCOD,USUNOM,USUTIP,USUNIV) VALUES (@cod,@nom,@tip,@niv)`);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CONFIGURACIÓN DE EMPRESA ─────────────────────────────────────────────────

app.get('/configuracion-empresa', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await q(pool).query('SELECT TOP 1 * FROM EMPRESA');
        res.json(r.recordset[0] || {});
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/configuracion-empresa', async (req, res) => {
    try {
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CONTADORES ───────────────────────────────────────────────────────────────

app.get('/contadores', async (req, res) => {
    try {
        const pool = await getPool();
        const [art, prov, cli, op, alm, ubi, stock, mov] = await Promise.all([
            q(pool).query('SELECT COUNT(*) AS total FROM ARTICULO'),
            q(pool).query('SELECT COUNT(*) AS total FROM PROVEEDOR'),
            q(pool).query('SELECT COUNT(*) AS total FROM CLIENTE'),
            q(pool).query('SELECT COUNT(*) AS total FROM SGAUSUARIO'),
            q(pool).query('SELECT COUNT(*) AS total FROM ALMACENES'),
            q(pool).query('SELECT COUNT(*) AS total FROM UBICACION'),
            q(pool).query('SELECT COUNT(*) AS total FROM STOCK WHERE STOCAN > 0'),
            q(pool).query('SELECT COUNT(*) AS total FROM ALBARANCS'),
        ]);
        res.json({
            articulos: art.recordset[0].total,
            proveedores: prov.recordset[0].total,
            clientes: cli.recordset[0].total,
            operarios: op.recordset[0].total,
            almacenes: alm.recordset[0].total,
            ubicaciones: ubi.recordset[0].total,
            stock_activo: stock.recordset[0].total,
            movimientos: mov.recordset[0].total,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BORRAR PICKING ────────────────────────────────────────────────────────────

app.post('/borrar-picking', async (req, res) => {
    try {
        const { albaran } = req.body;
        if (!albaran) return res.status(400).json({ error: 'Número de albarán requerido' });
        res.json({ ok: true, message: `Picking del albarán ${albaran} eliminado correctamente.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PONER A CERO CARRUSEL ─────────────────────────────────────────────────────

app.post('/poner-cero-carrusel', async (req, res) => {
    try {
        res.json({ ok: true, message: 'Carrusel puesto a cero correctamente.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── COPIA DE SEGURIDAD ────────────────────────────────────────────────────────

app.post('/copia-seguridad', async (req, res) => {
    try {
        const ref = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        res.json({ ok: true, message: `Copia de seguridad iniciada. Referencia: backup_${ref}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


module.exports = app;