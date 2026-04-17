const express = require('express');
const cors = require('cors');
const { poolPromise } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 1. RUTAS DE LECTURA (GET)
// ==========================================

// Listar tablas
app.get('/tablas', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT name FROM sys.tables");
        res.json(result.recordset);
    } catch (err) { res.status(500).send(err.message); }
});

// Estadísticas del Dashboard (SOLO UNA VEZ)
app.get('/stats', async (req, res) => {
    try {
        const pool = await poolPromise;
        const art = await pool.request().query("SELECT COUNT(*) as total FROM ARTICULO");
        const stock = await pool.request().query("SELECT SUM(STOCAN) as total FROM STOCK");
        const ubi = await pool.request().query("SELECT COUNT(DISTINCT STOUBI) as total FROM STOCK WHERE STOCAN > 0");

        res.json({
            articulos: art.recordset[0].total || 0,
            stock: stock.recordset[0].total || 0,
            ubicaciones: ubi.recordset[0].total || 0
        });
    } catch (err) { res.status(500).send(err.message); }
});

// Ver datos de una tabla (IMPORTANTE: Después de /stats)
app.get('/datos/:tabla', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`SELECT TOP 100 * FROM ${req.params.tabla}`);
        res.json(result.recordset);
    } catch (err) { res.status(500).send(err.message); }
});

// ==========================================
// 2. RUTAS DE ESCRITURA (POST)
// ==========================================

// Entrada de Mercancía
app.post('/entrada', async (req, res) => {
    try {
        const { cod, ubi, lot, cant } = req.body;
        const pool = await poolPromise;

        // 1. Verificamos si existe en ARTICULO. Si no, lo creamos al vuelo.
        const artCheck = await pool.request()
            .input('cod', cod)
            .query("SELECT ARTCOD FROM ARTICULO WHERE ARTCOD = @cod");

        if (artCheck.recordset.length === 0) {
            await pool.request()
                .input('cod', cod)
                .input('nom', 'ALTA AUTOMÁTICA - ' + cod)
                .query("INSERT INTO ARTICULO (ARTCOD, ARTNOM) VALUES (@cod, @nom)");
            console.log(`✨ Artículo ${cod} creado automáticamente.`);
        }

        // 2. Intentamos actualizar el STOCK (si ya existe esa combinación)
        const result = await pool.request()
            .input('cod', cod).input('ubi', ubi).input('lot', lot).input('cant', cant)
            .query(`UPDATE STOCK SET STOCAN = STOCAN + @cant 
                    WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot`);

        // 3. Si no se actualizó nada en STOCK, creamos el registro de ubicación
        if (result.rowsAffected[0] === 0) {
            await pool.request()
                .input('cod', cod).input('ubi', ubi).input('lot', lot).input('cant', cant)
                .query(`INSERT INTO STOCK (STOARTCOD, STOUBI, STOLOT, STOCAN) VALUES (@cod, @ubi, @lot, @cant)`);
        }

        res.json({ success: true, message: "Entrada registrada (Artículo auto-creado si era nuevo)" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Traspaso entre ubicaciones
app.post('/traspaso', async (req, res) => {
    try {
        const { cod, ubiOri, ubiDes, lot, cant } = req.body;
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            await transaction.request()
                .input('cod', cod).input('ubi', ubiOri).input('lot', lot).input('cant', cant)
                .query(`UPDATE STOCK SET STOCAN = STOCAN - @cant WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot`);

            let checkDest = await transaction.request()
                .input('cod', cod).input('ubi', ubiDes).input('lot', lot)
                .query(`SELECT STOCAN FROM STOCK WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot`);

            if (checkDest.recordset.length > 0) {
                await transaction.request().input('cod', cod).input('ubi', ubiDes).input('lot', lot).input('cant', cant)
                    .query(`UPDATE STOCK SET STOCAN = STOCAN + @cant WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot`);
            } else {
                await transaction.request().input('cod', cod).input('ubi', ubiDes).input('lot', lot).input('cant', cant)
                    .query(`INSERT INTO STOCK (STOARTCOD, STOUBI, STOLOT, STOCAN) VALUES (@cod, @ubi, @lot, @cant)`);
            }
            await transaction.commit();
            res.json({ success: true, message: "Traspaso completado" });
        } catch (err) { await transaction.rollback(); throw err; }
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Salida de Mercancía
app.post('/salida', async (req, res) => {
    try {
        const { cod, ubi, lot, cant } = req.body;
        const pool = await poolPromise;
        const check = await pool.request()
            .input('cod', cod).input('ubi', ubi).input('lot', lot)
            .query(`SELECT STOCAN FROM STOCK WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot`);

        if (check.recordset.length === 0 || check.recordset[0].STOCAN < cant) {
            return res.status(400).json({ success: false, message: "Stock insuficiente" });
        }
        await pool.request().input('cod', cod).input('ubi', ubi).input('lot', lot).input('cant', cant)
            .query(`UPDATE STOCK SET STOCAN = STOCAN - @cant WHERE STOARTCOD = @cod AND STOUBI = @ubi AND STOLOT = @lot`);
        res.json({ success: true, message: "Salida confirmada" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Maestros: Artículos
app.post('/maestro-articulo', async (req, res) => {
    try {
        const { cod, nom } = req.body;
        const pool = await poolPromise;
        await pool.request().input('cod', cod).input('nom', nom)
            .query(`INSERT INTO ARTICULO (ARTCOD, ARTNOM) VALUES (@cod, @nom)`);
        res.json({ success: true, message: "Artículo creado" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Maestros: Ubicaciones
app.post('/maestro-ubicacion', async (req, res) => {
    try {
        const { ubi, alm } = req.body;
        const pool = await poolPromise;
        await pool.request().input('ubi', ubi).input('alm', alm)
            .query(`INSERT INTO UBICACION (UBICODUBI, UBIALMCOD) VALUES (@ubi, @alm)`);
        res.json({ success: true, message: "Ubicación creada" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==========================================
// 3. ARRANQUE DEL SERVIDOR (SIEMPRE AL FINAL)
// ==========================================
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 SGA API funcionando en http://localhost:3000`));