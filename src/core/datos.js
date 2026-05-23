// ── CORE: CARGA Y PARSEO DE DATOS ─────────────────────────────
// Módulo puro: sin Three.js, sin DOM.
// Exporta funciones de fetch, validación de schema y parseo JSON.
// La capa 3D (almacen.js) y el store son actualizados desde aquí.
import { UW, CG } from '../../js/shared/configuracion.js';
import { store, S } from '../state/store.js';
import { parseEtiqueta, showToast } from '../../js/shared/utilidades.js';
import { buildWarehouseFromLayout, buildLowStockAlerts } from '../3d/almacen.js';

// ── VALIDACIÓN DE SCHEMA ──────────────────────────────────────
function _validateDistribucion(cfg) {
    const warns = [];
    if (!cfg || typeof cfg !== 'object') return ['distribucion.json: no es un objeto JSON válido'];
    const dim = cfg.dimensiones;
    if (!dim || !(dim.ancho > 0) || !(dim.profundidad > 0))
        warns.push('distribucion.json: dimensiones.ancho/profundidad deben ser > 0');
    if (!Array.isArray(cfg.objetos))
        warns.push('distribucion.json: "objetos" debe ser un array');
    else {
        for (const [i, o] of cfg.objetos.entries()) {
            if (!o.tipo)        warns.push(`objetos[${i}]: falta "tipo"`);
            if (!o.posicion)    warns.push(`objetos[${i}]: falta "posicion"`);
            if (!o.dimensiones) warns.push(`objetos[${i}]: falta "dimensiones"`);
            if (o.tipo === 'estanteria' && o.meta?.pasillo && !o.meta?.lado)
                warns.push(`objetos[${i}] (estanteria P${o.meta.pasillo}): falta "meta.lado"`);
        }
    }
    return warns;
}

function _validateArticulos(arr) {
    if (!Array.isArray(arr)) return ['articulos.json: debe ser un array'];
    const warns = [];
    for (const [i, it] of arr.entries()) {
        if (typeof it !== 'object' || !it)       { warns.push(`articulos[${i}]: no es objeto`); continue; }
        if (!it.etiqueta && !it.ubicacion)        warns.push(`articulos[${i}]: falta "etiqueta" o "ubicacion"`);
        if (it.cantidad !== undefined && typeof it.cantidad !== 'number')
            warns.push(`articulos[${i}]: "cantidad" debe ser número`);
    }
    return warns;
}

// ── PARSEO ────────────────────────────────────────────────────
function _ubisFromLayoutConfig(config) {
    const ubis = [];
    for (const obj of (config.objetos ?? [])) {
        if (obj.tipo !== 'estanteria' || !obj.meta?.pasillo) continue;
        const p    = obj.meta.pasillo;
        const lado = obj.meta.lado ?? 'D';
        const maxCol = obj.meta?.columnas ?? Math.max(1, Math.round(((obj.dimensiones?.ancho ?? 1.5) - 2) / (UW + CG)));
        const maxNiv = obj.meta?.niveles  ?? obj.dimensiones?.niveles ?? 1;
        for (let col = 1; col <= maxCol; col++) {
            for (let niv = 1; niv <= maxNiv; niv++) {
                const etq = `P${String(p).padStart(3,'0')} ${lado} X${String(col).padStart(3,'0')} Y${String(niv).padStart(2,'0')}`;
                ubis.push({ etiqueta: etq, ubicacion: etq });
            }
        }
    }
    return ubis;
}

export function parseDatosJson(ubis, stks) {
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

// ── FETCH CON TIMEOUT ─────────────────────────────────────────
const LOAD_TIMEOUT_MS = 15000;

function _fetchWithTimeout(url) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LOAD_TIMEOUT_MS);
    return fetch(url, { cache: 'no-store', signal: ctrl.signal })
        .finally(() => clearTimeout(timer));
}

// ── ÍNDICE DE ARTÍCULOS ───────────────────────────────────────
export function buildArticleIndex() {
    S.artEntries = [];
    for (const [ubiCode, stk] of Object.entries(S.globalStockIdx)) {
        if (!stk?.arts?.length) continue;
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

function _computeStats(unidades, stockIdx) {
    const total  = Object.keys(unidades).length;
    const withStock = Object.values(unidades).filter(u =>
        u.niveles.some(({ ubi }) => (stockIdx[ubi.ubicacion ?? '']?.total ?? 0) > 0)
    ).length;
    store.dispatch('hudStats', { total, withStock });
}

// ── CARGA PRINCIPAL ───────────────────────────────────────────
export async function cargar() {
    const loadEl = document.getElementById('load');
    const loadT  = document.getElementById('load-t');
    loadT.textContent = 'Cargando datos del almacén…';
    loadEl.style.display = 'flex';

    const oldBtn = loadEl.querySelector('.load-retry');
    if (oldBtn) oldBtn.remove();

    try {
        const ts = `?t=${Date.now()}`;
        const [stks, layoutConfig] = await Promise.all([
            _fetchWithTimeout(`./datos/articulos.json${ts}`).then(r => r.ok ? r.json() : []).catch(() => []),
            _fetchWithTimeout(`./datos/distribucion.json${ts}`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);

        const allWarns = [..._validateDistribucion(layoutConfig), ..._validateArticulos(stks)];
        if (allWarns.length) {
            console.warn('[SGA] Advertencias de schema:', allWarns);
            showToast(`⚠ ${allWarns.length} advertencia(s) en datos — ver consola`, 6000);
        }

        if (layoutConfig?.objetos?.length) {
            const layoutUbis = _ubisFromLayoutConfig(layoutConfig);
            const { stockIdx, unidades, pasillosMap } = parseDatosJson(layoutUbis, stks);
            S.globalStockIdx = stockIdx;
            buildWarehouseFromLayout(layoutConfig, stockIdx);
            buildArticleIndex();
            _computeStats(unidades, stockIdx);
            buildLowStockAlerts();
        } else {
            loadT.textContent = 'Sin distribucion.json — diseña el layout en el Editor de almacén.';
            const btn = document.createElement('button');
            btn.className = 'load-retry';
            btn.textContent = '⚙ Abrir Editor';
            btn.onclick = () => { window.location.href = 'editor.html'; };
            loadEl.appendChild(btn);
            return;
        }
    } catch (err) {
        const isTimeout = err?.name === 'AbortError';
        loadT.textContent = isTimeout
            ? 'Tiempo de espera agotado. ¿El servidor está activo?'
            : `Error al cargar: ${err?.message ?? 'desconocido'}`;
        const btn = document.createElement('button');
        btn.className = 'load-retry';
        btn.textContent = '↺ Reintentar';
        btn.onclick = () => cargar();
        loadEl.appendChild(btn);
        return;
    }
    loadEl.style.display = 'none';
}

export async function refresh() {
    const camObj    = S.controls.getObject();
    const savedPos  = camObj.position.clone();
    const savedRotY = camObj.rotation.y;
    const savedRotX = S.camera.rotation.x;
    await cargar();
    if (savedPos.x > S.wBounds.minX + 0.38 && savedPos.x < S.wBounds.maxX - 0.38 &&
        savedPos.z > S.wBounds.minZ + 0.38 && savedPos.z < S.wBounds.maxZ - 0.38) {
        camObj.position.copy(savedPos);
        camObj.rotation.y   = savedRotY;
        S.camera.rotation.x = savedRotX;
    }
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
