import { API_BASE, EYE, UD, AW } from './configuracion.js';
import { S } from './estado.js';
import { parseEtiqueta } from './utilidades.js';
import { buildWarehouse, buildLowStockAlerts, shelfModelReady } from './almacen.js';

const LAYOUT_KEY = 'sga_warehouse_layout';
let isDemo = false;

function _ubisFromStoredLayout() {
    try {
        const raw = localStorage.getItem(LAYOUT_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data?.pasillos?.length) return null;
        const ubis = [];
        for (const p of data.pasillos) {
            for (const lado of (p.lados ?? ['I', 'D'])) {
                for (let col = 1; col <= p.columnas; col++) {
                    for (let nivel = 1; nivel <= p.niveles; nivel++) {
                        const etq = `P${String(p.numero).padStart(3,'0')} ${lado} X${String(col).padStart(3,'0')} Y${String(nivel).padStart(2,'0')}`;
                        ubis.push({ etiqueta: etq, ubicacion: etq });
                    }
                }
            }
        }
        return ubis.length ? ubis : null;
    } catch { return null; }
}

// ── PARSEO ────────────────────────────────────────────────────
export function _parseDatosJson(ubis, stks) {
    const stockIdx = {};
    for (const s of (Array.isArray(stks) ? stks : [])) {
        const k = s.ubicacion ?? s.STOUBI; if (!k) continue;
        if (!stockIdx[k]) stockIdx[k] = { total: 0, arts: [] };
        stockIdx[k].total += Number(s.stock ?? s.STOCAN ?? 0);
        stockIdx[k].arts.push(s);
    }
    const unidades = {};
    for (const ubi of ubis) {
        const p = parseEtiqueta(ubi.etiqueta); if (!p) continue;
        const key = `P${String(p.pasillo).padStart(2,'0')}-${p.lado}-X${String(p.col).padStart(3,'0')}`;
        if (!unidades[key]) unidades[key] = { ...p, key, niveles: [] };
        unidades[key].niveles.push({ nivel: p.nivel, ubi });
    }
    const pasillosMap = {};
    for (const u of Object.values(unidades)) (pasillosMap[u.pasillo] ??= []).push(u);
    return { stockIdx, unidades, pasillosMap };
}

// ── CARGA DE DATOS ────────────────────────────────────────────
export async function cargar() {
    document.getElementById('load-t').textContent = 'Cargando datos del almacén…';
    document.getElementById('load').style.display = 'flex';

    await shelfModelReady; // wait for GLTF before building shelves
    const layoutUbis = _ubisFromStoredLayout();

    if (layoutUbis) {
        // Layout guardado en configurador: usar estructura custom + stock de API (opcional)
        try {
            const stks = await fetch(`${API_BASE}/consulta-de-stock?solo_existencias=0`)
                .then(r => r.json()).catch(() => []);
            const { stockIdx, unidades, pasillosMap } = _parseDatosJson(layoutUbis, stks);
            S.globalStockIdx = stockIdx;
            buildWarehouse(unidades, stockIdx, pasillosMap);
            buildArticleIndex();
            setStats(unidades, stockIdx);
            buildLowStockAlerts();
            _spawnSeguro();
            isDemo = false;
        } finally {
            document.getElementById('load').style.display = 'none';
        }
        return;
    }

    try {
        const [ubis, stks] = await Promise.all([
            fetch(`${API_BASE}/ubicaciones`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
            fetch(`${API_BASE}/consulta-de-stock?solo_existencias=0`).then(r => r.json()).catch(() => []),
        ]);
        const { stockIdx, unidades, pasillosMap } = _parseDatosJson(ubis, stks);
        S.globalStockIdx = stockIdx;
        buildWarehouse(unidades, stockIdx, pasillosMap);
        buildArticleIndex();
        setStats(unidades, stockIdx);
        buildLowStockAlerts();
        _spawnSeguro();
        isDemo = false;
    } catch {
        try {
            document.getElementById('load-t').textContent = 'Cargando datos de demostración…';
            const r = await fetch('./datos/datos-demo.json');
            if (!r.ok) throw new Error();
            const d = await r.json();
            const { stockIdx, unidades, pasillosMap } = _parseDatosJson(d.ubicaciones ?? [], d.stock ?? []);
            S.globalStockIdx = stockIdx;
            buildWarehouse(unidades, stockIdx, pasillosMap);
            buildArticleIndex();
            setStats(unidades, stockIdx);
            buildLowStockAlerts();
            _spawnSeguro();
            isDemo = true;
        } finally {
            document.getElementById('load').style.display = 'none';
        }
    }
}

// Repositiona al jugador en la entrada del primer pasillo si está en el origen
function _spawnSeguro() {
    if (!S.mmapLayout || !S.controls) return;
    const obj = S.controls.getObject();
    // Solo reposicionar si el jugador está en o cerca del origen (spawn inicial)
    if (Math.abs(obj.position.x) > 1 || Math.abs(obj.position.z) > 1) return;
    const { pNums, pBase, wBounds: wb } = S.mmapLayout;
    if (!pNums.length) return;
    const aisleX = pBase[pNums[0]] + UD + AW / 2;
    obj.position.set(aisleX, EYE, -2.0);
}

export async function refresh() {
    const savedPos = S.controls.getObject().position.clone();
    await cargar();
    if (savedPos.x > S.wBounds.minX + 0.38 && savedPos.x < S.wBounds.maxX - 0.38 &&
        savedPos.z > S.wBounds.minZ + 0.38 && savedPos.z < S.wBounds.maxZ - 0.38) {
        S.controls.getObject().position.copy(savedPos);
    }
}

export function setStats(unidades, stockIdx) {
    const total  = Object.keys(unidades).length;
    const conStk = Object.values(unidades).filter(u =>
        u.niveles.some(({ ubi }) => (stockIdx[ubi.ubicacion ?? '']?.total ?? 0) > 0)
    ).length;
    document.getElementById('hud-tot').textContent = total;
    document.getElementById('hud-stk').textContent = conStk;
    document.getElementById('hud-emp').textContent = total - conStk;
}

// ── ÍNDICE DE ARTÍCULOS ───────────────────────────────────────
export function buildArticleIndex() {
    S.artEntries = [];
    for (const [ubiCode, stk] of Object.entries(S.globalStockIdx)) {
        if (!stk?.arts?.length) continue;
        // Try the raw-code map first (stock codes often lack P/X/Y prefix)
        let locKey = S.ubiToLocKey.get(ubiCode);
        if (!locKey) {
            const parsed = parseEtiqueta(ubiCode);
            if (!parsed) continue;
            locKey = `P${String(parsed.pasillo).padStart(2,'0')}-${parsed.lado}-X${String(parsed.col).padStart(2,'0')}`;
        }
        const loc = S.LOCATION_MAP.get(locKey);
        if (!loc) continue;
        for (const art of stk.arts) {
            const artCode = String(art.articulo ?? art.STOART ?? '').trim();
            const artName = String(art.nombre   ?? art.ARTDES ?? '').trim();
            const qty     = Number(art.stock    ?? art.STOCAN ?? 0);
            S.artEntries.push({ artCode, artName, locKey, ubiCode, qty, ...loc });
        }
    }
}

// Devuelve Map: artCode → { artCode, artName, totalStock, entries[] }
export function getArtMap() {
    const map = new Map();
    for (const e of S.artEntries) {
        if (!e.artCode) continue;
        if (!map.has(e.artCode)) map.set(e.artCode, { artCode: e.artCode, artName: e.artName, totalStock: 0, entries: [] });
        const a = map.get(e.artCode);
        a.totalStock += e.qty;
        a.entries.push(e);
    }
    return map;
}

// ── BÚSQUEDA ──────────────────────────────────────────────────
export function searchLocations(val) {
    const q    = val.toUpperCase().replace(/\s+/g, '').replace(/-+/g, '-');
    const norm = q.replace(/-/g, '');
    const results = [];
    for (const [key, loc] of S.LOCATION_MAP) {
        if (!q) { if (!key.includes('-')) results.push({ key, ...loc }); }
        else if (key.replace(/-/g,'').startsWith(norm) || key.startsWith(q)) results.push({ key, ...loc });
        if (results.length >= 5) break;
    }
    return results;
}

export function searchArticles(query) {
    const q = query.toUpperCase().trim();
    if (q.length < 2) return [];
    const results = [], seen = new Set();
    for (const e of S.artEntries) {
        if (e.artCode.toUpperCase().startsWith(q)) {
            const uid = `${e.artCode}|${e.locKey}`;
            if (!seen.has(uid)) { seen.add(uid); results.push(e); }
            if (results.length >= 6) return results;
        }
    }
    for (const e of S.artEntries) {
        if (results.length >= 6) break;
        if (e.artName.toUpperCase().includes(q)) {
            const uid = `${e.artCode}|${e.locKey}`;
            if (!seen.has(uid)) { seen.add(uid); results.push(e); }
        }
    }
    return results;
}
