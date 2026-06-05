"use strict";

/**
 * Rutas /api/almacen — visor 3D, editor de planta, supervisor de picking 3D.
 *
 * NOTA API-01 — Dos sistemas de picking coexisten intencionalmente:
 *   1. GET/POST /api/almacen/picking  → picking 3D del supervisor (JSON en disco).
 *      Gestiona rutas visuales en el visor 3D: posición, paradas, QR móvil.
 *   2. GET /picking (picking.routes.js) → historial de ALBARANCS+SGA_PICKING_CONFIRMACION en SQL Server.
 *      Refleja el estado real del ERP.
 * Los dos sistemas NO están sincronizados automáticamente. Un picking 3D completado
 * no confirma automáticamente en SGA_PICKING_CONFIRMACION. Para sincronizarlos,
 * llamar a POST /picking/confirmar al completar cada parada del picking 3D.
 *
 * Los datos de layout se almacenan en disco (independiente de SQL Server)
 * ya que describen la distribución física del almacén, no transacciones ERP.
 */

const { Router } = require('express');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');    // CODE-03: mover require al top
const { getPool } = require('../db');
const { serverError } = require('../middleware/error');
const { requireAuth, requireAuthSse } = require('../middleware/auth');

const router = Router();
router.use((req, res, next) => {
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) return requireAuth(req, res, next);
    next();
});

// Datos persistentes en backend/data/ (independiente del frontend)
const DATA_DIR     = path.join(__dirname, '../data');
const DATOS_DIR    = path.join(__dirname, '../../frontend/pages/almacen/datos'); // fallback estático
const PICKING_FILE = path.join(DATA_DIR, 'picking.json');
const MAX_NOTIFS   = 50;

// ── HELPERS ──────────────────────────────────────────────────────────────────

// BUG-06: loguear errores que no sean "archivo no existe"
function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        if (e.code !== 'ENOENT') console.error(`[readJson] Error en ${path.basename(filePath)}:`, e.message);
        return null;
    }
}

async function writeJson(filePath, data) {
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ── ESTRUCTURA DESDE UBICACION ────────────────────────────────────────────────
// Parsea registros de UBICACION (formato UBICODUBI de 11 chars: PPP CCC NNN L 1)
// y devuelve { [pasillo]: { D?: {cols, nivs}, I?: {cols, nivs} } }
const UW = 1.5, CG = 0.1, UD = 0.85, AW = 4.5;  // metros por unidad de estantería

// Convierte UBICODUBI (11 dígitos, ej. "00100100121") al formato de texto canónico
// que usa el visor: "P001 D X001 Y01". Si ya es texto lo devuelve limpio.
function _ubicodubiToLabel(raw) {
    const code = (raw ?? '').trim();
    if (!/^\d{11}$/.test(code)) return code;
    const p    = parseInt(code.slice(0, 3));
    const col  = parseInt(code.slice(3, 6));
    const niv  = parseInt(code.slice(6, 9));
    const lado = code[9] === '1' ? 'I' : 'D';
    return `P${String(p).padStart(3,'0')} ${lado} X${String(col).padStart(3,'0')} Y${String(niv).padStart(2,'0')}`;
}

function _parseUbicaciones(rawUbis) {
    const pasillos = {};
    for (const u of rawUbis) {
        let p, col, niv, lado;
        const code = (u.ubicacion ?? '').trim();
        if (/^\d{11}$/.test(code)) {
            p    = parseInt(code.slice(0, 3));
            col  = parseInt(code.slice(3, 6));
            niv  = parseInt(code.slice(6, 9));
            lado = code[9] === '1' ? 'I' : 'D';
        } else if (u.pasillo && u.columna && u.nivel && u.lado) {
            p = u.pasillo; col = u.columna; niv = u.nivel; lado = u.lado;
        } else {
            const str = (u.etiqueta ?? code).trim();
            const m   = str.match(/P(\d+)\s+([DI])\s+X(\d+)\s+Y(\d+)/i);
            if (!m) continue;
            p = parseInt(m[1]); lado = m[2].toUpperCase(); col = parseInt(m[3]); niv = parseInt(m[4]);
        }
        if (!p || !col || !niv) continue;
        if (!pasillos[p]) pasillos[p] = {};
        if (!pasillos[p][lado]) pasillos[p][lado] = { cols: 0, nivs: 0 };
        pasillos[p][lado].cols = Math.max(pasillos[p][lado].cols, col);
        pasillos[p][lado].nivs = Math.max(pasillos[p][lado].nivs, niv);
    }
    return pasillos;
}

// Obtiene la estructura de pasillos desde la BD; fallback a ubicaciones.json
async function _getDbStruct() {
    try {
        const { getPool } = require('../db');
        const pool = await getPool();
        const r = await pool.request().query('SELECT RTRIM(UBICODUBI) AS ubicacion FROM UBICACION');
        if (r.recordset.length) return _parseUbicaciones(r.recordset);
    } catch { /* BD no disponible */ }
    const fallback = readJson(path.join(DATA_DIR, 'ubicaciones.json'))
        || readJson(path.join(DATOS_DIR, 'ubicaciones.json'));
    if (!Array.isArray(fallback) || !fallback.length) return null;
    const struct = _parseUbicaciones(fallback);
    return Object.keys(struct).length ? struct : null;
}

// Genera un layout completo (posiciones automáticas) a partir de la estructura de pasillos
function _buildLayoutFromStruct(pasillos) {
    const objetos = [];
    const pNums   = Object.keys(pasillos).map(Number).sort((a, b) => a - b);
    let curX = 3, maxZ = 0;

    for (const p of pNums) {
        const info     = pasillos[p];
        const maxCols  = Math.max(...Object.values(info).map(s => s.cols));
        const aisleLen = +((maxCols * (UW + CG)) + 2).toFixed(3);
        maxZ = Math.max(maxZ, aisleLen);
        const label    = `P${String(p).padStart(3, '0')}`;
        const pasilloX = +(curX + UD + AW / 2).toFixed(3);
        const cz       = +(aisleLen / 2).toFixed(3);

        objetos.push({
            id: `pasillo_${label}`, tipo: 'pasillo', etiqueta: label,
            posicion: { x: pasilloX, y: 0, z: cz },
            rotacion: { y: 0 },
            dimensiones: { longitud: aisleLen, ancho: AW, forma: 'recto', longitud2: 0 },
            meta: { numero: p }, locked: false,
        });

        for (const lado of ['D', 'I']) {
            if (!info[lado]) continue;
            const sideCols = info[lado].cols;
            const sideNivs = info[lado].nivs;
            const shelfLen = +((sideCols * (UW + CG)) + 2).toFixed(3);
            const shelfZ   = +(shelfLen / 2).toFixed(3);
            const shelfX   = lado === 'D'
                ? +(curX + UD / 2).toFixed(3)
                : +(curX + UD + AW + UD / 2).toFixed(3);
            objetos.push({
                id: `estanteria_${label}_${lado}`, tipo: 'estanteria',
                etiqueta: `${label} ${lado}`,
                posicion: { x: shelfX, y: 0, z: shelfZ },
                rotacion: { y: 90 },
                dimensiones: { ancho: shelfLen, profundidad: UD, niveles: sideNivs, alturaNivel: 1.1 },
                meta: { pasillo: p, lado, columnas: sideCols, niveles: sideNivs },
                locked: false,
            });
        }
        curX = +(curX + UD + AW + UD + 1).toFixed(3);
    }
    return {
        nombre: 'Almacén',
        dimensiones: { ancho: Math.ceil(curX + 3), profundidad: Math.ceil(maxZ + 6), alto: 9 },
        objetos,
    };
}

// Fusiona layout existente (posiciones del JSON) con estructura real de BD.
// - Actualiza columnas/niveles/longitud de objetos existentes desde BD.
// - Añade pasillos/estanterías que están en BD pero no en JSON.
// - Mantiene posiciones y objetos decorativos (zonas, columnas, puertas) del JSON.
function _mergeLayoutWithStruct(layout, pasillos) {
    const merged = structuredClone(layout);
    const seenShelf = new Set();

    // 1. Actualizar estanterías existentes con datos de BD
    for (const obj of merged.objetos) {
        if (obj.tipo !== 'estanteria' || !obj.meta?.pasillo || !obj.meta?.lado) continue;
        const side = pasillos[obj.meta.pasillo]?.[obj.meta.lado];
        if (!side) continue;
        const newLen = +((side.cols * (UW + CG)) + 2).toFixed(3);
        obj.meta.columnas       = side.cols;
        obj.meta.niveles        = side.nivs;
        obj.dimensiones.ancho   = newLen;
        obj.dimensiones.niveles = side.nivs;
        seenShelf.add(`${obj.meta.pasillo}_${obj.meta.lado}`);
    }

    // 2. Actualizar longitud de pasillos según columnas reales
    for (const obj of merged.objetos) {
        if (obj.tipo !== 'pasillo' || !obj.meta?.numero) continue;
        const info = pasillos[obj.meta.numero];
        if (!info) continue;
        const maxCols  = Math.max(...Object.values(info).map(s => s.cols));
        obj.dimensiones.longitud = +((maxCols * (UW + CG)) + 2).toFixed(3);
    }

    // 3. Añadir pasillos+estanterías que están en BD pero no en JSON
    const existingPNums = new Set(
        merged.objetos.filter(o => o.tipo === 'pasillo').map(o => o.meta?.numero).filter(Boolean)
    );
    const allX   = merged.objetos.filter(o => o.tipo === 'pasillo').map(o => o.posicion?.x ?? 0);
    let curX     = (allX.length ? Math.max(...allX) + AW / 2 + UD + 1 : 3);

    const newPNums = Object.keys(pasillos).map(Number)
        .filter(p => !existingPNums.has(p))
        .sort((a, b) => a - b);

    for (const p of newPNums) {
        const info     = pasillos[p];
        const label    = `P${String(p).padStart(3, '0')}`;
        const maxCols  = Math.max(...Object.values(info).map(s => s.cols));
        const aisleLen = +((maxCols * (UW + CG)) + 2).toFixed(3);
        const pasilloX = +(curX + UD + AW / 2).toFixed(3);
        const cz       = +(aisleLen / 2).toFixed(3);

        merged.objetos.push({
            id: `pasillo_${label}`, tipo: 'pasillo', etiqueta: label,
            posicion: { x: pasilloX, y: 0, z: cz },
            rotacion: { y: 0 },
            dimensiones: { longitud: aisleLen, ancho: AW, forma: 'recto', longitud2: 0 },
            meta: { numero: p }, locked: false,
        });
        for (const [lado, side] of Object.entries(info)) {
            const shelfLen = +((side.cols * (UW + CG)) + 2).toFixed(3);
            const shelfZ   = +(shelfLen / 2).toFixed(3);
            const shelfX   = lado === 'D'
                ? +(curX + UD / 2).toFixed(3)
                : +(curX + UD + AW + UD / 2).toFixed(3);
            merged.objetos.push({
                id: `estanteria_${label}_${lado}`, tipo: 'estanteria',
                etiqueta: `${label} ${lado}`,
                posicion: { x: shelfX, y: 0, z: shelfZ },
                rotacion: { y: 90 },
                dimensiones: { ancho: shelfLen, profundidad: UD, niveles: side.nivs, alturaNivel: 1.1 },
                meta: { pasillo: p, lado, columnas: side.cols, niveles: side.nivs },
                locked: false,
            });
        }
        curX = +(curX + UD + AW + UD + 1).toFixed(3);
    }

    // 4. Añadir lados faltantes en pasillos ya existentes
    for (const p of existingPNums) {
        const info = pasillos[p];
        if (!info) continue;
        const pasilloObj = merged.objetos.find(o => o.tipo === 'pasillo' && o.meta?.numero === p);
        if (!pasilloObj) continue;
        const label = `P${String(p).padStart(3, '0')}`;
        for (const [lado, side] of Object.entries(info)) {
            if (seenShelf.has(`${p}_${lado}`)) continue;
            const px = pasilloObj.posicion.x;
            const shelfLen = +((side.cols * (UW + CG)) + 2).toFixed(3);
            const shelfX   = lado === 'D' ? +(px - AW / 2 - UD / 2).toFixed(3) : +(px + AW / 2 + UD / 2).toFixed(3);
            merged.objetos.push({
                id: `estanteria_${label}_${lado}`, tipo: 'estanteria',
                etiqueta: `${label} ${lado}`,
                posicion: { x: shelfX, y: 0, z: +(shelfLen / 2).toFixed(3) },
                rotacion: { y: 90 },
                dimensiones: { ancho: shelfLen, profundidad: UD, niveles: side.nivs, alturaNivel: 1.1 },
                meta: { pasillo: p, lado, columnas: side.cols, niveles: side.nivs },
                locked: false,
            });
        }
    }

    return merged;
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
// STOUBI en la BD está en formato UBICODUBI (11 dígitos, ej. "00100100121").
// Se convierte a texto canónico "P001 D X001 Y01" para que coincida con las
// claves que genera el visor 3D al construir su índice de estanterías.
router.get('/api/almacen/articulos', async (req, res) => {
    try {
        const { getPool } = require('../db');
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT
                RTRIM(s.STOUBI)       AS ubicacion,
                RTRIM(s.STOARTCOD)    AS articulo,
                RTRIM(ISNULL(a.ARTNOM, s.STOARTCOD)) AS nombre,
                SUM(s.STOCAN)         AS stock
            FROM STOCK s
            LEFT JOIN ARTICULO a ON a.ARTCOD = s.STOARTCOD
            WHERE s.STOCAN > 0
            GROUP BY RTRIM(s.STOUBI), RTRIM(s.STOARTCOD), RTRIM(ISNULL(a.ARTNOM, s.STOARTCOD))
            ORDER BY RTRIM(s.STOUBI), RTRIM(s.STOARTCOD)
        `);
        res.json(result.recordset.map(r => ({
            ...r,
            ubicacion: _ubicodubiToLabel(r.ubicacion),
        })));
    } catch (sqlErr) {
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
// API-05: requireAuth — expone IP del servidor (solo para supervisor autenticado)
router.get('/api/almacen/server-info', requireAuth, (req, res) => {
    const nets = os.networkInterfaces();
    let ip = 'localhost';
    // Preferir IPs en rangos de red doméstica/WiFi (192.168.0.x, 10.x, 172.16-31.x)
    // excluyendo rangos típicos de VirtualBox/VMware (192.168.56.x, 192.168.126.x)
    const candidates = [];
    for (const ifaces of Object.values(nets)) {
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) candidates.push(iface.address);
        }
    }
    const preferred = candidates.find(a => !a.startsWith('192.168.56.') && !a.startsWith('192.168.126.'));
    ip = preferred ?? candidates[0] ?? 'localhost';
    const port = req.socket.localPort ?? process.env.PORT ?? 3000;
    res.json({ ip, port });
});

// ── LOAD-CONFIG ───────────────────────────────────────────────────────────────
// Devuelve la estructura del almacén fusionando:
//   - Posiciones del layout guardado (distribucion.json) — dónde está cada pasillo.
//   - Estructura real de UBICACION (BD) — cuántas columnas/niveles tiene cada lado.
// Si no hay JSON → genera layout automático desde BD.
// Si no hay BD → devuelve JSON tal cual (fallback offline).
router.get('/api/almacen/load-config', async (req, res) => {
    const [dbStruct, layout] = await Promise.all([
        _getDbStruct(),
        Promise.resolve(readJson(path.join(DATA_DIR, 'distribucion.json'))),
    ]);

    if (!layout && !dbStruct)
        return res.status(404).json({ error: 'distribucion.json no encontrado y BD no disponible' });
    if (!layout)
        return res.json(_buildLayoutFromStruct(dbStruct));
    if (!dbStruct)
        return res.json(layout);

    res.json(_mergeLayoutWithStruct(layout, dbStruct));
});

// ── REGENERAR-LAYOUT ──────────────────────────────────────────────────────────
// Genera un layout físico completo desde UBICACION (BD o JSON de fallback)
// y lo guarda como nuevo distribucion.json (sobrescribiendo posiciones manuales).
// Usar cuando el layout no existe o cuando se quiere resetear completamente.
router.post('/api/almacen/regenerar-layout', async (req, res) => {
    let rawUbis = [];
    try {
        const { getPool } = require('../db');
        const pool = await getPool();
        const r = await pool.request().query('SELECT RTRIM(UBICODUBI) AS ubicacion FROM UBICACION');
        rawUbis = r.recordset;
    } catch {
        const fallback = readJson(path.join(DATA_DIR, 'ubicaciones.json'))
            || readJson(path.join(DATOS_DIR, 'ubicaciones.json'));
        if (Array.isArray(fallback)) rawUbis = fallback;
    }

    if (!rawUbis.length)
        return res.status(404).json({ error: 'No se encontraron ubicaciones en BD ni en archivo estático' });

    const pasillos = _parseUbicaciones(rawUbis);
    const pNums    = Object.keys(pasillos).map(Number);
    if (!pNums.length)
        return res.status(422).json({ error: 'No se pudieron parsear códigos de UBICACION' });

    const layout = _buildLayoutFromStruct(pasillos);

    try {
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
        const json = JSON.stringify(layout, null, 2);
        await fs.promises.writeFile(path.join(DATA_DIR, 'distribucion.json'), json, 'utf8');
        await fs.promises.writeFile(path.join(DATOS_DIR, 'distribucion.json'), json, 'utf8');
    } catch (e) {
        console.error('[regenerar-layout] Error al guardar:', e.message);
    }

    res.json({ ok: true, pasillos: pNums.length, objetos: layout.objetos.length, layout });
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

// Promesa-cola: serializa las escrituras para evitar que dos PATCH concurrentes
// lean el mismo estado y se machaquen mutuamente (last-write-wins).
let _writeLock = Promise.resolve();

async function savePickings(list) {
    _writeLock = _writeLock.then(() =>
        fs.promises.writeFile(PICKING_FILE, JSON.stringify(list, null, 2), 'utf8')
    );
    return _writeLock;
}

// ── NOTIFICACIONES ────────────────────────────────────────────────────────────

async function _loadNotifs() {
    try {
        const pool = await getPool();
        const r = await pool.request().query(
            `SELECT TOP ${MAX_NOTIFS} NOTEXTID AS id, NOTTIPO AS tipo, NOTTITULO AS titulo,
                    NOTDESC AS descripcion, NOTTS AS ts
             FROM SGANOTIFICACION ORDER BY NOTTS DESC`);
        return r.recordset.map(n => ({ ...n, ts: new Date(n.ts).toISOString() }));
    } catch (err) {
        console.error('[notificaciones] Error al leer BD:', err.message);
        return [];
    }
}

function pushNotif(tipo, titulo, descripcion) {
    const notif = {
        id:          `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        tipo,
        titulo,
        descripcion,
        ts:          new Date().toISOString(),
    };
    getPool().then(pool => pool.request()
        .input('extid', notif.id)
        .input('tipo',  tipo)
        .input('tit',   titulo)
        .input('desc',  descripcion || '')
        .query(`INSERT INTO SGANOTIFICACION (NOTEXTID,NOTTIPO,NOTTITULO,NOTDESC)
                VALUES (@extid,@tipo,@tit,@desc);
                DELETE FROM SGANOTIFICACION WHERE NOTID NOT IN
                    (SELECT TOP ${MAX_NOTIFS} NOTID FROM SGANOTIFICACION ORDER BY NOTTS DESC)`)
    ).catch(err => console.error('[notificaciones] Error al guardar:', err.message));
    broadcast('notificacion', notif);
    return notif;
}

// pushNotif exportado al final junto con router

// ── SSE ───────────────────────────────────────────────────────────────────────

// Emitir evento SSE a todos los clientes conectados
const _sseClients = new Set();

function broadcast(event, payload) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const c of _sseClients) {
        // BUG-05: loguear errores inesperados, no solo desconexiones de cliente
        try { c.write(msg); } catch (e) {
            if (e.code !== 'ERR_HTTP_HEADERS_SENT' && e.code !== 'ERR_STREAM_DESTROYED')
                console.error('[SSE broadcast]', e.message);
            _sseClients.delete(c);
        }
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
    pushNotif('picking', 'Nueva ruta de picking',
        `${docNum || id}${operario ? ` · Operario: ${operario}` : ''} · ${paradas.length} parada${paradas.length !== 1 ? 's' : ''}`);
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
    pushNotif('incidencia', 'Incidencia reportada',
        `Ruta ${p.docNum || p.id}${p.operario ? ` · ${p.operario}` : ''} · Parada ${idx + 1}: ${texto.slice(0, 80)}`);
    res.json({ ok: true });
});

// ── NOTIFICACIONES — endpoints ────────────────────────────────────────────────

router.get('/api/almacen/notificaciones', async (req, res) => {
    res.json(await _loadNotifs());
});

router.post('/api/almacen/notificaciones/limpiar', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request().query('DELETE FROM SGANOTIFICACION');
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// API-02: alias REST DELETE para notificaciones
router.delete('/api/almacen/notificaciones', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request().query('DELETE FROM SGANOTIFICACION');
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
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
    // SEC-05: limitar longitud del dato QR
    if (data.length > 2000) return res.status(400).json({ error: 'Datos demasiado largos para QR (máx 2000 caracteres)' });
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
module.exports.pushNotif = pushNotif;
