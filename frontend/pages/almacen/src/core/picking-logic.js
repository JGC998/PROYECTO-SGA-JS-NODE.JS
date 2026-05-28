// ── CORE: ALGORITMOS DE RUTA DE PICKING ───────────────────────
// Módulo puro: sin Three.js, sin DOM.
// Contiene toda la lógica de resolución y ordenación de paradas.
// La capa UI (src/ui/picking-ui.js) usa estas funciones y
// despacha el resultado al store.
import { HISTORY_KEY, HISTORY_MAX } from '../../js/shared/configuracion.js';
import { S, store } from '../state/store.js';
import { showToast } from '../../js/shared/utilidades.js';
import { getArtMap } from './datos.js';
import { graphDist } from './grafo.js';

// ── PUNTO DE PARTIDA/LLEGADA DE RUTAS ────────────────────────
export function ctrlRoomPos() {
    if (S.officePos) return { x: S.officePos.x, z: S.officePos.z };
    const wb = S.mmapLayout?.wBounds;
    if (wb) return { x: wb.minX + 4.5, z: wb.minZ + 2.5 };
    return S.controls.getObject().position;
}

// ── RESOLUCIÓN DE PARADAS ─────────────────────────────────────
export function resolvePickStops() {
    const { x: cx, z: cz } = ctrlRoomPos();
    const artMap = getArtMap();
    const stopMap = new Map();

    for (const item of S.pickItems) {
        const art = artMap.get(item.artCode);
        if (!art) continue;
        let remaining = item.qtyNeeded;
        const from = { x: cx, z: cz };
        const candidates = [...art.entries]
            .filter(e => e.qty > 0)
            .sort((a, b) => graphDist(from, a) - graphDist(from, b));
        for (const e of candidates) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, e.qty);
            if (stopMap.has(e.locKey)) {
                const stop = stopMap.get(e.locKey);
                const exItem = stop.items.find(i => i.artCode === item.artCode);
                if (exItem) exItem.qtyTake += take;
                else stop.items.push({ artCode: item.artCode, artName: item.artName, qtyTake: take });
            } else {
                stopMap.set(e.locKey, {
                    locKey: e.locKey, x: e.x, z: e.z, yaw: e.yaw,
                    items: [{ artCode: item.artCode, artName: item.artName, qtyTake: take }],
                });
            }
            remaining -= take;
        }
        if (remaining > 0)
            showToast(`⚠ ${item.artCode}: stock insuficiente — faltan ${remaining} uds`, 5000);
    }
    return [...stopMap.values()];
}

// ── NEAREST NEIGHBOUR ─────────────────────────────────────────
export function nearestNeighbor(stops) {
    if (!stops.length) return [];
    let remaining = [...stops], cur = ctrlRoomPos();
    const route = [];
    while (remaining.length) {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const d = graphDist(cur, remaining[i]);
            if (d < bd) { bd = d; bi = i; }
        }
        const stop = remaining.splice(bi, 1)[0];
        stop.distFromPrev = graphDist(cur, stop);
        route.push(stop);
        cur = stop;
    }
    return route;
}

// ── SERPENTINA ────────────────────────────────────────────────
export function serpentineRoute(stops) {
    if (!stops.length) return [];
    if (!S.mmapLayout) return nearestNeighbor(stops);
    const { pNums } = S.mmapLayout;
    const byAisle = new Map();
    const unknownStops = [];
    for (const stop of stops) {
        const m = stop.locKey.match(/^P(\d+)/);
        const p = m ? +m[1] : -1;
        if (p === -1 || !pNums.includes(p)) { unknownStops.push(stop); continue; }
        if (!byAisle.has(p)) byAisle.set(p, []);
        byAisle.get(p).push(stop);
    }
    const aislesWithStops = pNums.filter(p => byAisle.has(p));
    if (!aislesWithStops.length) return nearestNeighbor(stops);
    let cur = ctrlRoomPos();
    let startIdx = 0, minDist = Infinity;
    for (let i = 0; i < aislesWithStops.length; i++) {
        const p    = aislesWithStops[i];
        const info = S.aisleInfo?.get(p);
        const ax   = info ? info.x : 0, az = info ? info.z : 0;
        const d    = Math.hypot(ax - cur.x, az - cur.z);
        if (d < minDist) { minDist = d; startIdx = i; }
    }
    const ordered = [...aislesWithStops.slice(startIdx), ...aislesWithStops.slice(0, startIdx)];
    let goForward = true;
    const route = [];
    for (const p of ordered) {
        const aisleStops = byAisle.get(p);
        const info = S.aisleInfo?.get(p);
        aisleStops.sort((a, b) => {
            if (info) {
                const projA = (a.x - info.x) * info.dx + (a.z - info.z) * info.dz;
                const projB = (b.x - info.x) * info.dx + (b.z - info.z) * info.dz;
                return goForward ? projA - projB : projB - projA;
            }
            return goForward ? a.z - b.z : b.z - a.z;
        });
        for (const stop of aisleStops) {
            stop.distFromPrev = graphDist(cur, stop);
            route.push(stop);
            cur = stop;
        }
        goForward = !goForward;
    }
    for (const stop of unknownStops) {
        stop.distFromPrev = graphDist(cur, stop);
        route.push(stop);
        cur = stop;
    }
    return route;
}

// ── HISTORIAL ─────────────────────────────────────────────────
export function saveRouteToHistory(route, elapsed) {
    const entry = {
        date:    new Date().toISOString(),
        stops:   route.length,
        items:   route.reduce((s, st) => s + st.items.reduce((si, i) => si + i.qtyTake, 0), 0),
        dist:    Math.round(route.reduce((s, st) => s + (st.distFromPrev ?? 0), 0)),
        elapsed,
        route: route.map(st => ({
            locKey: st.locKey, x: st.x, z: st.z, yaw: st.yaw, distFromPrev: st.distFromPrev ?? 0,
            items: st.items.map(i => ({ artCode: i.artCode, artName: i.artName, qtyTake: i.qtyTake })),
        })),
    };
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch {}
    hist.unshift(entry);
    if (hist.length > HISTORY_MAX) hist.length = HISTORY_MAX;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
}

export function getRouteHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

// ── VALIDACIÓN DE RUTA DEL HISTORIAL ─────────────────────────
export function validateHistoryRoute(stops) {
    const valid = [], invalid = [];
    for (const s of stops) {
        const cur = s.locKey && S.LOCATION_MAP.get(s.locKey);
        if (cur) valid.push({ ...s, x: cur.x, z: cur.z, yaw: cur.yaw, items: s.items.map(i => ({ ...i })) });
        else invalid.push(s.locKey ?? '?');
    }
    return { valid, invalid };
}

// ── SESSION STORAGE ───────────────────────────────────────────
export const ROUTE_SS_KEY = 'sga_active_route';

export function saveRouteToSession(route, step) {
    try {
        if (route.length) sessionStorage.setItem(ROUTE_SS_KEY, JSON.stringify({ route, step }));
        else sessionStorage.removeItem(ROUTE_SS_KEY);
    } catch {}
}

export function loadRouteFromSession() {
    try {
        const raw = sessionStorage.getItem(ROUTE_SS_KEY);
        if (!raw) return null;
        const { route, step } = JSON.parse(raw);
        if (!Array.isArray(route) || !route.length) return null;
        return { route, step: step ?? 0 };
    } catch { return null; }
}

// ── TSP 2-OPT ─────────────────────────────────────────────────
// Mejora una ruta abierta invirtiendo segmentos mientras reduzca la distancia euclídea.
// Capeado a 80 iteraciones para no bloquear el hilo principal.
// Tras optimizar, recalcula distFromPrev con graphDist real.
function _euclidSq(a, b) { return (a.x - b.x) ** 2 + (a.z - b.z) ** 2; }

function _recalcDist(stops) {
    let cur = ctrlRoomPos();
    return stops.map(stop => {
        const d = graphDist(cur, stop);
        cur = stop;
        return { ...stop, distFromPrev: d };
    });
}

export function twoOpt(stops) {
    if (stops.length < 4) return _recalcDist(stops);
    let route = [...stops];
    let improved = true, iter = 0;
    while (improved && iter++ < 80) {
        improved = false;
        for (let i = 0; i < route.length - 1; i++) {
            for (let j = i + 2; j < route.length; j++) {
                const next = route[j + 1];
                const dCur = _euclidSq(route[i], route[i + 1]) + (next ? _euclidSq(route[j], next) : 0);
                const dAlt = _euclidSq(route[i], route[j])     + (next ? _euclidSq(route[i + 1], next) : 0);
                if (dAlt < dCur - 0.01) {
                    route = [
                        ...route.slice(0, i + 1),
                        ...route.slice(i + 1, j + 1).reverse(),
                        ...route.slice(j + 1),
                    ];
                    improved = true;
                }
            }
        }
    }
    return _recalcDist(route);
}
