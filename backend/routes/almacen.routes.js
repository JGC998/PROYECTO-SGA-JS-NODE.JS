"use strict";

/**
 * Rutas /api/almacen — visor 3D, editor de planta, supervisor de picking.
 * Los datos de layout/picking se almacenan como JSON en disco
 * (independientes de SQL Server) ya que describen la distribución física.
 */

const { Router } = require('express');
const path  = require('path');
const fs    = require('fs');
const { serverError } = require('../middleware/error');
const { requireAuth, requireAuthSse } = require('../middleware/auth');

const router = Router();
router.use((req, res, next) => {
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) return requireAuth(req, res, next);
    next();
});

// Datos persistentes en backend/data/ (independiente del frontend)
const DATA_DIR   = path.join(__dirname, '../data');
const DATOS_DIR  = path.join(__dirname, '../../frontend/pages/almacen/datos'); // fallback estático
const PICKING_FILE = path.join(DATA_DIR, 'picking.json');

// ── HELPERS ──────────────────────────────────────────────────────────────────

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch { return null; }
}

async function writeJson(filePath, data) {
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}


// ── VALIDACIONES ─────────────────────────────────────────────────────────────

function validateConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return 'Se requiere un objeto JSON de configuración';
    if (!Array.isArray(cfg.objetos))     return 'cfg.objetos debe ser un array';
    return null;
}

function validatePasillos(pasillos) {
    if (!Array.isArray(pasillos)) return 'pasillos debe ser un array';
    for (const p of pasillos) {
        if (!p.numero) return `Pasillo inválido: ${JSON.stringify(p)}`;
        if (typeof p.columnas !== 'number' || p.columnas < 1 ||
            typeof p.niveles  !== 'number' || p.niveles  < 1)
            return `Pasillo ${p.numero}: columnas y niveles deben ser enteros ≥ 1`;
    }
    return null;
}

// ── ARTICULO — stock por ubicación desde SQL Server ──────────────────────────
// Devuelve el mismo formato que datos/articulos.json para que el visor 3D y
// el supervisor funcionen tanto con datos reales (SQL) como con el JSON estático.
router.get('/api/almacen/articulos', async (req, res) => {
    try {
        const { getPool } = require('../db');
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT
                s.STOUBI       AS ubicacion,
                s.STOARTCOD    AS articulo,
                ISNULL(a.ARTNOM, s.STOARTCOD) AS nombre,
                SUM(s.STOCAN)  AS stock
            FROM STOCK s
            LEFT JOIN ARTICULO a ON a.ARTCOD = s.STOARTCOD
            WHERE s.STOCAN > 0
            GROUP BY s.STOUBI, s.STOARTCOD, a.ARTNOM
            ORDER BY s.STOUBI, s.STOARTCOD
        `);
        res.json(result.recordset);
    } catch (sqlErr) {
        // SQL Server no disponible → devuelve el JSON estático como fallback
        console.warn('[almacen/articulos] SQL no disponible, usando articulos.json estático:', sqlErr.message);
        try {
            const staticData = JSON.parse(
                fs.readFileSync(path.join(DATOS_DIR, 'articulos.json'), 'utf8')
            );
            res.json(staticData);
        } catch {
            res.json([]);
        }
    }
});

// ── SERVER-INFO ───────────────────────────────────────────────────────────────
// El supervisor lo usa para construir la URL móvil con la IP local
router.get('/api/almacen/server-info', (req, res) => {
    const os   = require('os');
    const nets = os.networkInterfaces();
    const candidates = [];
    for (const ifaces of Object.values(nets)) {
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) candidates.push(iface.address);
        }
    }
    // Preferir IPs de red real (WiFi/Ethernet) descartando rangos virtuales y link-local
    const VIRTUAL = [
        /^192\.168\.56\./,   // VirtualBox
        /^192\.168\.126\./,  // Hyper-V
        /^10\.0\.2\./,       // VirtualBox NAT
        /^169\.254\./,       // link-local (APIPA)
        /^172\.1[6-9]\./,    /^172\.2\d\./, /^172\.3[01]\./  // Docker
    ];
    const real = candidates.find(a => !VIRTUAL.some(rx => rx.test(a)));
    const ip   = real || candidates[0] || 'localhost';
    const port = req.socket.localPort ?? process.env.PORT ?? 3000;
    res.json({ ip, port });
});

// ── SAVE-CONFIG (guardar distribucion.json) ───────────────────────────────────
router.post('/api/almacen/save-config', async (req, res) => {
    const err = validateConfig(req.body);
    if (err) return res.status(400).json({ error: err });
    try {
        await writeJson(path.join(DATA_DIR, 'distribucion.json'), req.body);
        // Mantener copia en frontend/datos para compatibilidad con el visor estático
        await writeJson(path.join(DATOS_DIR, 'distribucion.json'), req.body);
        res.json({ ok: true, objetos: req.body.objetos?.length ?? 0 });
    } catch (e) { serverError(res, e); }
});

// ── SYNC-UBICACIONES ──────────────────────────────────────────────────────────
function pasillosToUbicaciones(pasillos) {
    const ubis = [];
    for (const p of pasillos) {
        for (const lado of (p.lados?.length ? p.lados : ['D', 'I'])) {
            for (let col = 1; col <= p.columnas; col++) {
                for (let niv = 1; niv <= p.niveles; niv++) {
                    const etq = `P${String(p.numero).padStart(3,'0')} ${lado} X${String(col).padStart(3,'0')} Y${String(niv).padStart(2,'0')}`;
                    ubis.push({ etiqueta: etq, pasillo: p.numero, lado, columna: col, nivel: niv });
                }
            }
        }
    }
    return ubis;
}

router.post('/api/almacen/sync-ubicaciones', async (req, res) => {
    const { pasillos, config } = req.body ?? {};
    const errP = validatePasillos(pasillos);
    if (errP) return res.status(400).json({ error: errP });

    try {
        const ubis = pasillosToUbicaciones(pasillos);
        await writeJson(path.join(DATA_DIR, 'ubicaciones.json'), ubis);
        await writeJson(path.join(DATOS_DIR, 'ubicaciones.json'), ubis);
        if (config) {
            const errC = validateConfig(config);
            if (!errC) {
                await writeJson(path.join(DATA_DIR, 'distribucion.json'), config);
                await writeJson(path.join(DATOS_DIR, 'distribucion.json'), config);
            }
        }
        res.json({ ok: true, generadas: ubis.length });
    } catch (e) { serverError(res, e); }
});

// ── PICKING FILE-BASED (supervisor 3D) ────────────────────────────────────────

function loadPickings() {
    const data = readJson(PICKING_FILE);
    return Array.isArray(data) ? data : [];
}

async function savePickings(list) {
    await writeJson(PICKING_FILE, list);
}

// Emitir evento SSE a todos los clientes conectados
const _sseClients = new Set();

function broadcast(event, payload) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const c of _sseClients) {
        try { c.write(msg); } catch { _sseClients.delete(c); }
    }
}

// GET /api/almacen/events — SSE para actualizaciones en tiempo real
router.get('/api/almacen/events', requireAuthSse, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(':ok\n\n');
    _sseClients.add(res);
    req.on('close', () => _sseClients.delete(res));
});

// GET /api/almacen/picking
router.get('/api/almacen/picking', (req, res) => {
    res.json(loadPickings());
});

// GET /api/almacen/picking/:id
router.get('/api/almacen/picking/:id', (req, res) => {
    const p = loadPickings().find(x => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'No encontrado' });
    res.json(p);
});

// POST /api/almacen/picking — crear nueva ruta
router.post('/api/almacen/picking', async (req, res) => {
    const { docNum, operario, paradas } = req.body ?? {};
    if (!Array.isArray(paradas) || !paradas.length)
        return res.status(400).json({ error: 'Se requiere paradas []' });

    const id      = `pk_${Date.now()}`;
    const picking = { id, docNum: docNum ?? '', operario: operario ?? null,
        fecha: new Date().toISOString(), estado: 'pendiente', paradas };
    const list = loadPickings();
    list.push(picking);
    await savePickings(list);
    broadcast('nuevo', picking);
    res.status(201).json({ id });
});

// DELETE /api/almacen/picking/:id
router.delete('/api/almacen/picking/:id', async (req, res) => {
    const list = loadPickings().filter(x => x.id !== req.params.id);
    await savePickings(list);
    broadcast('eliminado', { id: req.params.id });
    res.json({ ok: true });
});

// PATCH /api/almacen/picking/:id/validar/:idx
router.patch('/api/almacen/picking/:id/validar/:idx', async (req, res) => {
    const list = loadPickings();
    const p = list.find(x => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'No encontrado' });

    const idx = +req.params.idx;
    if (!p.paradas[idx]) return res.status(400).json({ error: 'Índice inválido' });

    const parada = p.paradas[idx];
    parada.completada = true;
    parada.qtyCounted = req.body?.qty ?? null;
    parada.tsValidado = new Date().toISOString();

    if (p.paradas.every(s => s.completada)) p.estado = 'completada';
    else p.estado = 'en_curso';

    await savePickings(list);
    broadcast('actualizado', { ...p, lastValidatedIdx: idx });
    res.json({ ok: true, estado: p.estado });
});

// PATCH /api/almacen/picking/:id/incidencia/:idx
router.patch('/api/almacen/picking/:id/incidencia/:idx', async (req, res) => {
    const list = loadPickings();
    const p = list.find(x => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'No encontrado' });

    const idx = +req.params.idx;
    if (!p.paradas[idx]) return res.status(400).json({ error: 'Índice inválido' });

    const TIPOS_VALIDOS = ['stock', 'danado', 'ubicacion', 'otro'];
    const tipo  = TIPOS_VALIDOS.includes(req.body?.tipo) ? req.body.tipo : 'otro';
    const texto = String(req.body?.texto ?? req.body?.motivo ?? '').trim().slice(0, 500) || 'Sin motivo';

    const parada = p.paradas[idx];
    if (!parada.incidencias) parada.incidencias = [];
    parada.incidencias.push({ texto, tipo, ts: new Date().toISOString() });

    await savePickings(list);
    broadcast('incidencia', { ...p, lastIncidenciaIdx: idx });
    res.json({ ok: true });
});

// ── REDIRECT /movil → página móvil estática ───────────────────────────────────
router.get('/movil', (req, res) => {
    const qs = new URLSearchParams(req.query).toString();
    res.redirect(302, '/pages/almacen/movil.html' + (qs ? '?' + qs : ''));
});

// ── QR ────────────────────────────────────────────────────────────────────────
// Genera un PNG de código QR. Requiere el paquete 'qrcode'.
// Si no está instalado devuelve 501 con instrucciones.
router.get('/api/almacen/qr', async (req, res) => {
    const data = req.query.data;
    if (!data) return res.status(400).json({ error: 'Falta ?data=' });
    try {
        const QRCode = require('qrcode');
        const buf = await QRCode.toBuffer(data, { type: 'png', width: 300, margin: 2 });
        res.set('Content-Type', 'image/png');
        res.send(buf);
    } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND')
            return res.status(501).json({ error: 'Paquete qrcode no instalado. Ejecuta: cd backend && npm install qrcode' });
        serverError(res, e);
    }
});

module.exports = router;
