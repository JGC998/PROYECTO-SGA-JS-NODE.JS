/**
 * SGA LIN — Servidor estático (Node.js puro, sin dependencias)
 * Ejecutar:  node server.js   (o ./start.sh)
 * Puerto:    3000
 */

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const os      = require('os');
const QRCode  = require('qrcode');

function getLocalIP() {
    for (const ifaces of Object.values(os.networkInterfaces())) {
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}
const LOCAL_IP = getLocalIP();

const PORT = 3000;
const ROOT = __dirname;

const ALLOWED_ORIGINS = new Set([
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    `http://${LOCAL_IP}:${PORT}`,
]);

function isAllowedOrigin(req) {
    const origin = req.headers.origin;
    return !origin || ALLOWED_ORIGINS.has(origin);
}

const CSP = [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net 'sha256-9HZ7iq1u/4DY3OSYci7n+3OdBkF/KATYRNxSXlGZotk='",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
].join('; ');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.glb':  'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.mp3':  'audio/mpeg',
    '.ogg':  'audio/ogg',
    '.wav':  'audio/wav',
    '.wasm': 'application/wasm',
};

// Constantes de layout — fuente: js/shared/constantes.json (mismo valor que configuracion.js)
const { UW, CG } = require('./js/shared/constantes.json');

// Convierte { pasillos: [...] } al array de etiquetas que lee el visor
function pasillosToUbicaciones(pasillos) {
    const ubis = [];
    for (const p of (pasillos ?? [])) {
        for (const lado of (p.lados ?? ['I', 'D'])) {
            for (let col = 1; col <= p.columnas; col++) {
                for (let niv = 1; niv <= p.niveles; niv++) {
                    const etq = `P${String(p.numero).padStart(3,'0')} ${lado} X${String(col).padStart(3,'0')} Y${String(niv).padStart(2,'0')}`;
                    ubis.push({ etiqueta: etq, ubicacion: etq });
                }
            }
        }
    }
    return ubis;
}

// Genera ubicaciones directamente desde distribucion.json (fuente única, sin pasar por sync)
function layoutToUbicaciones(layoutConfig) {
    const ubis = [];
    for (const obj of (layoutConfig.objetos ?? [])) {
        if (obj.tipo !== 'estanteria' || !obj.meta?.pasillo) continue;
        const p    = obj.meta.pasillo;
        const lado = obj.meta.lado ?? 'D';
        const cols = obj.meta?.columnas ?? Math.max(1, Math.round(((obj.dimensiones?.ancho ?? 1.5) - 2) / (UW + CG)));
        const nivs = obj.meta?.niveles  ?? obj.dimensiones?.niveles ?? 1;
        for (let col = 1; col <= cols; col++) {
            for (let niv = 1; niv <= nivs; niv++) {
                const etq = `P${String(p).padStart(3,'0')} ${lado} X${String(col).padStart(3,'0')} Y${String(niv).padStart(2,'0')}`;
                ubis.push({ etiqueta: etq, ubicacion: etq });
            }
        }
    }
    return ubis;
}

// ── VALIDACIÓN ─────────────────────────────────────────────────
function _validatePasillos(pasillos) {
    for (const p of pasillos) {
        if (typeof p.numero !== 'number' || p.numero < 1)
            return `pasillo.numero inválido: ${p.numero}`;
        if (typeof p.columnas !== 'number' || p.columnas < 1)
            return `pasillo.columnas inválido: ${p.columnas}`;
        if (typeof p.niveles !== 'number' || p.niveles < 1)
            return `pasillo.niveles inválido: ${p.niveles}`;
    }
    return null;
}

function _validateConfig(config) {
    const dim = config.dimensiones;
    if (!dim || typeof dim.ancho !== 'number' || dim.ancho <= 0 ||
        typeof dim.profundidad !== 'number' || dim.profundidad <= 0)
        return 'config.dimensiones requiere ancho y profundidad > 0';
    if (!Array.isArray(config.objetos))
        return 'config.objetos debe ser un array';
    return null;
}

const BODY_LIMIT = 5 * 1024 * 1024; // 5 MB

// ── ARCHIVO DE PICKINGS ────────────────────────────────────────
const PICKING_FILE = path.join(ROOT, 'datos', 'picking.json');

async function _readPickings() {
    try { return JSON.parse(await fs.promises.readFile(PICKING_FILE, 'utf8')); }
    catch { return []; }
}

// Mutex secuencial: encadena escrituras para evitar race conditions con operarios simultáneos
let _writeLock = Promise.resolve();
function _writePicking(arr) {
    _writeLock = _writeLock.then(() =>
        fs.promises.writeFile(PICKING_FILE, JSON.stringify(arr, null, 2), 'utf8')
    );
    return _writeLock;
}


// ── SSE — SINCRONIZACIÓN EN TIEMPO REAL ───────────────────────
const _sseClients = new Set();

function _broadcast(obj) {
    const msg = `data: ${JSON.stringify(obj)}\n\n`;
    for (const res of _sseClients) {
        try { res.write(msg); } catch { _sseClients.delete(res); }
    }
}

let _broadcastTimer = null;
try {
    fs.watch(path.join(ROOT, 'datos'), (_, filename) => {
        if (filename === 'picking.json') return; // los cambios de picking no recargan el stock
        clearTimeout(_broadcastTimer);
        _broadcastTimer = setTimeout(() => _broadcast({ type: 'data-changed' }), 300);
    });
} catch { /* datos/ no existe al arrancar — se ignorará */ }

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = []; let size = 0;
        req.on('data', c => {
            size += c.length;
            if (size > BODY_LIMIT) { req.destroy(); reject(new Error('Payload demasiado grande (>5 MB)')); return; }
            chunks.push(c);
        });
        req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('JSON inválido')); } });
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    let pathname = req.url.split('?')[0].replace(/\/+$/, '') || '/';
    const method = req.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
        const origin = req.headers.origin;
        if (origin && !ALLOWED_ORIGINS.has(origin)) {
            res.writeHead(403); res.end('Forbidden'); return;
        }
        res.writeHead(204, {
            'Access-Control-Allow-Origin': origin ?? `http://localhost:${PORT}`,
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    // POST /save-config — guarda distribucion.json directamente (editor de planta 2D)
    if (pathname === '/save-config' && method === 'POST') {
        if (!isAllowedOrigin(req)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Forbidden' }));
        }
        try {
            const cfg = await readBody(req);
            const cfgErr = _validateConfig(cfg);
            if (cfgErr) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: cfgErr }));
            }
            await fs.promises.writeFile(path.join(ROOT, 'datos', 'distribucion.json'), JSON.stringify(cfg, null, 2), 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': req.headers.origin ?? `http://localhost:${PORT}` });
            res.end(JSON.stringify({ ok: true, objetos: cfg.objetos?.length ?? 0 }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // POST /sync-ubicaciones — el editor escribe ubicaciones.json desde la estructura de pasillos
    if (pathname === '/sync-ubicaciones' && method === 'POST') {
        if (!isAllowedOrigin(req)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Forbidden' }));
        }
        try {
            const body = await readBody(req);
            if (!Array.isArray(body?.pasillos)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Se requiere { pasillos: [...] }' }));
            }
            const pasErr = _validatePasillos(body.pasillos);
            if (pasErr) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: pasErr }));
            }
            if (body.config) {
                const cfgErr = _validateConfig(body.config);
                if (cfgErr) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: cfgErr }));
                }
            }
            const ubis    = pasillosToUbicaciones(body.pasillos);
            const dataDir = path.join(ROOT, 'datos');
            await Promise.all([
                fs.promises.writeFile(path.join(dataDir, 'ubicaciones.json'), JSON.stringify(ubis, null, 2), 'utf8'),
                body.config
                    ? fs.promises.writeFile(path.join(dataDir, 'distribucion.json'), JSON.stringify(body.config, null, 2), 'utf8')
                    : Promise.resolve(),
            ]);
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': req.headers.origin ?? `http://localhost:${PORT}` });
            res.end(JSON.stringify({ ok: true, ubicaciones: ubis.length }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // GET /datos/ubicaciones.json — si no existe en disco, generarlo desde distribucion.json
    if (pathname === '/datos/ubicaciones.json' && method === 'GET') {
        const ubiPath    = path.join(ROOT, 'datos', 'ubicaciones.json');
        const layoutPath = path.join(ROOT, 'datos', 'distribucion.json');
        try {
            const data = await fs.promises.readFile(ubiPath);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            return res.end(data);
        } catch { /* archivo no existe, continuar */ }
        try {
            const layoutData = await fs.promises.readFile(layoutPath, 'utf8');
            const ubis = layoutToUbicaciones(JSON.parse(layoutData));
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify(ubis, null, 2));
        } catch {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'ubicaciones.json no encontrado y distribucion.json no disponible' }));
        }
    }

    // ── API DE PICKING ─────────────────────────────────────────────

    // GET /server-info — IP local y puerto para generar URLs escaneables desde móvil
    if (pathname === '/server-info' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
        return res.end(JSON.stringify({ ip: LOCAL_IP, port: PORT }));
    }

    // GET /qr?data=<url> — genera QR PNG localmente sin dependencia de internet
    if (pathname === '/qr' && method === 'GET') {
        const qs   = new URLSearchParams(req.url.split('?')[1] ?? '');
        const data = qs.get('data');
        if (!data) { res.writeHead(400); return res.end('Missing data param'); }
        try {
            const buf = await QRCode.toBuffer(data, { width: 240, margin: 1, errorCorrectionLevel: 'M' });
            res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' });
            return res.end(buf);
        } catch (err) {
            res.writeHead(500); return res.end(err.message);
        }
    }

    // POST /picking — supervisor crea un picking y obtiene UUID para el QR
    if (pathname === '/picking' && method === 'POST') {
        if (!isAllowedOrigin(req)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Forbidden' }));
        }
        try {
            const body = await readBody(req);
            if (!Array.isArray(body?.paradas) || !body.paradas.length) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Se requiere { paradas: [...] }' }));
            }
            const id     = crypto.randomUUID();
            const now    = new Date().toISOString();
            const record = {
                id,
                fecha:    now,
                docNum:   body.docNum ?? `PCK-${now.slice(0, 10)}`,
                operario: body.operario ?? null,
                estado:   'pendiente',
                paradas:  body.paradas.map(p => ({
                    locKey:       p.locKey,
                    items:        (p.items ?? []).map(i => ({ artCode: i.artCode, artName: i.artName ?? '', qtyTake: i.qtyTake })),
                    distFromPrev: p.distFromPrev ?? 0,
                    completada:   false,
                    timestamp:    null,
                })),
            };
            const arr = await _readPickings();
            arr.push(record);
            await _writePicking(arr);
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': req.headers.origin ?? `http://localhost:${PORT}` });
            return res.end(JSON.stringify({ ok: true, id, url: `/movil?ruta=${id}` }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: err.message }));
        }
    }

    // GET /picking — lista todos los pickings (más reciente primero)
    if (pathname === '/picking' && method === 'GET') {
        const arr = await _readPickings();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify(arr.slice().reverse()));
    }

    // GET /picking/:id — operario obtiene el picking completo
    // DELETE /picking/:id — eliminar un picking del historial
    const pickById = pathname.match(/^\/picking\/([0-9a-f-]{36})$/i);
    if (pickById && method === 'GET') {
        const arr = await _readPickings();
        const rec = arr.find(r => r.id === pickById[1]);
        if (!rec) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Picking no encontrado' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify(rec));
    }
    if (pickById && method === 'DELETE') {
        try {
            const arr = await _readPickings();
            const idx = arr.findIndex(p => p.id === pickById[1]);
            if (idx === -1) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Not found' })); }
            arr.splice(idx, 1);
            await _writePicking(arr);
            _broadcast({ type: 'reload' });
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ ok: true }));
        } catch (err) { res.writeHead(500); return res.end(JSON.stringify({ error: err.message })); }
    }

    // POST /picking/:id/validar/:idx — operario valida una parada desde el móvil
    const pickVal = pathname.match(/^\/picking\/([0-9a-f-]{36})\/validar\/(\d+)$/i);
    if (pickVal && method === 'POST') {
        const [, id, idxStr] = pickVal;
        const idx = parseInt(idxStr, 10);
        try {
            const body = await readBody(req);
            const arr = await _readPickings();
            const ri  = arr.findIndex(r => r.id === id);
            if (ri === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Picking no encontrado' }));
            }
            const rec = arr[ri];
            if (idx < 0 || idx >= rec.paradas.length) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Índice inválido' }));
            }
            rec.paradas[idx].completada  = true;
            rec.paradas[idx].timestamp   = new Date().toISOString();
            if (body.qtyCounted != null) rec.paradas[idx].qtyCounted = body.qtyCounted;
            const completadas = rec.paradas.filter(p => p.completada).length;
            rec.estado = completadas === rec.paradas.length ? 'completada' : 'en-curso';
            arr[ri] = rec;
            await _writePicking(arr);
            _broadcast({ type: 'ruta-progreso', id, idx, locKey: rec.paradas[idx].locKey, operario: rec.operario, completadas, total: rec.paradas.length, qtyCounted: rec.paradas[idx].qtyCounted ?? null });
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ ok: true, completadas, total: rec.paradas.length }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: err.message }));
        }
    }

    // POST /picking/:id/incidencia/:idx — operario reporta incidencia en una parada
    const pickInc = pathname.match(/^\/picking\/([0-9a-f-]{36})\/incidencia\/(\d+)$/i);
    if (pickInc && method === 'POST') {
        const [, id, idxStr] = pickInc;
        const stopIdx = parseInt(idxStr, 10);
        try {
            const body = await readBody(req);
            const arr  = await _readPickings();
            const ri   = arr.findIndex(r => r.id === id);
            if (ri === -1) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Not found' })); }
            const rec = arr[ri];
            if (!rec.paradas[stopIdx]) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Índice inválido' })); }
            if (!rec.paradas[stopIdx].incidencias) rec.paradas[stopIdx].incidencias = [];
            const inc = { texto: body.texto ?? '', tipo: body.tipo ?? 'otro', ts: new Date().toISOString() };
            rec.paradas[stopIdx].incidencias.push(inc);
            arr[ri] = rec;
            await _writePicking(arr);
            _broadcast({ type: 'incidencia', id, stopIdx, locKey: rec.paradas[stopIdx].locKey, operario: rec.operario, ...inc });
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ ok: true }));
        } catch (err) { res.writeHead(500); return res.end(JSON.stringify({ error: err.message })); }
    }

    // GET /movil → sirve movil.html (URL limpia sin extensión)
    if (pathname === '/movil') {
        const mFile = path.join(ROOT, 'movil.html');
        fs.readFile(mFile, (err, data) => {
            if (err) { res.writeHead(404); return res.end('404'); }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': data.length, 'Content-Security-Policy': CSP });
            res.end(data);
        });
        return;
    }

    // GET /events — Server-Sent Events para sincronización en tiempo real
    if (pathname === '/events' && method === 'GET') {
        res.writeHead(200, {
            'Content-Type':  'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection':    'keep-alive',
            'Access-Control-Allow-Origin': '*',
        });
        res.write(': connected\n\n');
        _sseClients.add(res);
        const hb = setInterval(() => {
            try { res.write(': hb\n\n'); } catch { _sseClients.delete(res); clearInterval(hb); }
        }, 25000);
        req.on('close', () => { _sseClients.delete(res); clearInterval(hb); });
        return;
    }

    let filePath = pathname === '/' || pathname === ''
        ? path.join(ROOT, 'index.html')
        : path.join(ROOT, pathname);

    // Seguridad: no escapar del ROOT (startsWith + sep evita falsos positivos con directorios hermanos)
    if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        const headers = {
            'Content-Type': mime,
            'Access-Control-Allow-Origin': '*',
            'Content-Length': data.length,
        };
        if (ext === '.html') headers['Content-Security-Policy'] = CSP;
        res.writeHead(200, {
            ...headers,
        });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`\n🏭 SGA LIN en http://localhost:${PORT}`);
    console.log(`   Visor 3D  →  http://localhost:${PORT}/mapa-3d.html`);
    console.log(`   Editor 3D →  http://localhost:${PORT}/editor.html`);
    console.log(`   Móvil/QR  →  http://${LOCAL_IP}:${PORT}/movil  (IP de red local)\n`);
});
