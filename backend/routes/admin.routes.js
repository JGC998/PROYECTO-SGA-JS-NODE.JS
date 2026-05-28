"use strict";

const { Router } = require('express');
const path = require('path');
const fs   = require('fs');
const { getPool } = require('../db');
const { serverError } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');

const router = Router();
router.use((req, res, next) => {
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) return requireAuth(req, res, next);
    next();
});
const BACKUP_DIR = path.join(__dirname, '../backups');


// ─── TRASPASO INVENTARIO ───────────────────────────────────────────────────────

router.post('/traspasar-inventarios', async (req, res) => {
    res.status(501).json({ ok: false, pendiente: true, message: 'Funcionalidad pendiente de implementación.' });
});

router.post('/importar-regularizaciones', async (req, res) => {
    res.status(501).json({ ok: false, pendiente: true, message: 'Funcionalidad pendiente de implementación.' });
});

router.post('/asignar-fecha-stock-inicial', async (req, res) => {
    res.status(501).json({ ok: false, pendiente: true, message: 'Funcionalidad pendiente de implementación.' });
});

// ─── BORRAR PICKING ────────────────────────────────────────────────────────────

router.post('/borrar-picking', async (req, res) => {
    try {
        const albaran = Number(req.body?.albaran);
        if (!Number.isInteger(albaran) || albaran <= 0)
            return res.status(400).json({ error: 'Número de albarán inválido' });

        const pool = await getPool();
        const check = await pool.request()
            .input('alb', albaran)
            .query(`SELECT COUNT(*) AS cnt FROM SGA_PICKING_CONFIRMACION WHERE ALBARAN = @alb`);
        const cnt = check.recordset[0].cnt;
        if (cnt === 0)
            return res.status(404).json({ error: `No hay confirmaciones de picking registradas para el albarán ${albaran}` });

        await pool.request()
            .input('alb', albaran)
            .query(`DELETE FROM SGA_PICKING_CONFIRMACION WHERE ALBARAN = @alb`);

        res.json({ ok: true, message: `Picking del albarán ${albaran} eliminado (${cnt} línea${cnt !== 1 ? 's' : ''} borrada${cnt !== 1 ? 's' : ''}).` });
    } catch (err) { serverError(res, err); }
});

// ─── PONER A CERO CARRUSEL ─────────────────────────────────────────────────────

router.post('/poner-cero-carrusel', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request().query(`
            MERGE CONTADOR AS target
            USING (SELECT 1 AS dummy) AS src ON 1=1
            WHEN MATCHED     THEN UPDATE SET CONNUM=1, REGMOD=0
            WHEN NOT MATCHED THEN INSERT (CONNUM, REGMOD) VALUES (1, 0);`);
        res.json({ ok: true, message: 'Carrusel puesto a cero correctamente.' });
    } catch (err) { serverError(res, err); }
});

// ─── COPIA DE SEGURIDAD ────────────────────────────────────────────────────────

const BACKUP_TABLES = [
    { name: 'ALMACENES',   sql: 'SELECT * FROM ALMACENES' },
    { name: 'EMPRESA',     sql: 'SELECT * FROM EMPRESA' },
    { name: 'ARTICULO',    sql: 'SELECT * FROM ARTICULO' },
    { name: 'UBICACION',   sql: 'SELECT * FROM UBICACION' },
    { name: 'STOCK',       sql: 'SELECT * FROM STOCK' },
    { name: 'STOCKLOTE',   sql: 'SELECT * FROM STOCKLOTE' },
    { name: 'ARTICULOUBI', sql: 'SELECT * FROM ARTICULOUBI' },
    { name: 'ARTICULOSTOMIN', sql: 'SELECT * FROM ARTICULOSTOMIN' },
    { name: 'CLIENTE',     sql: 'SELECT * FROM CLIENTE' },
    { name: 'PROVEEDOR',   sql: 'SELECT * FROM PROVEEDOR' },
    { name: 'SUBFAMILIA',  sql: 'SELECT * FROM SUBFAMILIA' },
    { name: 'SGAUSUARIO',  sql: 'SELECT * FROM SGAUSUARIO' },
    { name: 'CONTADOR',    sql: 'SELECT * FROM CONTADOR' },
];

router.post('/copia-seguridad', async (req, res) => {
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const pool = await getPool();
        const backup = { fecha: new Date().toISOString(), tablas: {} };
        for (const t of BACKUP_TABLES) {
            try {
                const r = await pool.request().query(t.sql);
                backup.tablas[t.name] = r.recordset;
            } catch { backup.tablas[t.name] = []; }
        }
        const fecha = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `backup_${fecha}.json`;
        await fs.promises.writeFile(path.join(BACKUP_DIR, filename), JSON.stringify(backup, null, 2), 'utf8');
        res.json({ ok: true, message: `Copia creada: ${filename}`, archivo: filename });
    } catch (err) { serverError(res, err); }
});

router.get('/copia-seguridad/descargar', requireAuth, (req, res) => {
    const file = path.basename(req.query.file || '');
    if (!file || !file.startsWith('backup_') || !file.endsWith('.json'))
        return res.status(400).json({ error: 'Archivo inválido' });
    const resolvedDir  = path.resolve(BACKUP_DIR);
    const filePath     = path.resolve(BACKUP_DIR, file);
    if (!filePath.startsWith(resolvedDir + path.sep))
        return res.status(400).json({ error: 'Archivo inválido' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
    res.download(filePath);
});

module.exports = router;
