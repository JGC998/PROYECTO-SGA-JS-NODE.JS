import * as THREE from 'three';
import { PICK_ARRIVE_R, HISTORY_KEY, HISTORY_MAX, UW, CG, UD, AW } from './configuracion.js';
import { S, pauseGame, resumeGame, clearKeys } from './estado.js';
import { esc, showToast } from './utilidades.js';
import { getArtMap } from './datos.js';
import { teleportTo } from './almacen.js';
import { makePickSprite } from './sprites.js';

// ── ESTADO MÓDULO ─────────────────────────────────────────────
let pickStep    = -1;
let pickRouteObj = null;
let ppQuery     = '';
let sessionStart = null;
let historyOpen = false;

// ── MATERIALES / GEO ──────────────────────────────────────────
const MAT_PICK_LINE      = new THREE.LineBasicMaterial({ color: 0xfbbf24 });
const MAT_PICK_DISC      = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.65 });
const MAT_PICK_COLLECTED = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.90 });
const PICK_DISC_GEO      = new THREE.CylinderGeometry(0.38, 0.38, 0.05, 20);

// ── PICKING ITEMS ─────────────────────────────────────────────
export function addPickItem(artCode, artName, qty) {
    const ex = S.pickItems.find(i => i.artCode === artCode);
    if (ex) ex.qtyNeeded += qty;
    else S.pickItems.push({ artCode, artName, qtyNeeded: qty });
}

export function removePickItem(artCode) {
    const idx = S.pickItems.findIndex(i => i.artCode === artCode);
    if (idx >= 0) S.pickItems.splice(idx, 1);
}

// ── RESOLUCIÓN DE PARADAS ─────────────────────────────────────
function _ctrlRoomPos() {
    const wb = S.mmapLayout?.wBounds;
    return wb ? { x: wb.minX + 4.5, z: wb.minZ + 2.5 } : S.controls.getObject().position;
}

export function resolvePickStops() {
    const { x: cx, z: cz } = _ctrlRoomPos();
    const artMap = getArtMap();
    const stopMap = new Map();

    for (const item of S.pickItems) {
        const art = artMap.get(item.artCode);
        if (!art) continue;
        let remaining = item.qtyNeeded;
        const candidates = [...art.entries]
            .filter(e => e.qty > 0)
            .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
        for (const e of candidates) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, e.qty);
            if (stopMap.has(e.locKey)) {
                const stop = stopMap.get(e.locKey);
                const exItem = stop.items.find(i => i.artCode === item.artCode);
                if (exItem) exItem.qtyTake += take;
                else stop.items.push({ artCode: item.artCode, artName: item.artName, qtyTake: take });
            } else {
                stopMap.set(e.locKey, { locKey: e.locKey, x: e.x, z: e.z, yaw: e.yaw, items: [{ artCode: item.artCode, artName: item.artName, qtyTake: take }] });
            }
            remaining -= take;
        }
        if (remaining > 0) showToast(`⚠ ${item.artCode}: stock insuficiente — faltan ${remaining} uds`, 5000);
    }
    return [...stopMap.values()];
}

// ── ALGORITMOS DE RUTA ────────────────────────────────────────
export function nearestNeighbor(stops) {
    if (!stops.length) return [];
    let remaining = [...stops];
    let cur = _ctrlRoomPos();
    const route = [];
    while (remaining.length) {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const d = Math.hypot(remaining[i].x - cur.x, remaining[i].z - cur.z);
            if (d < bd) { bd = d; bi = i; }
        }
        const stop = remaining.splice(bi, 1)[0];
        stop.distFromPrev = Math.hypot(stop.x - cur.x, stop.z - cur.z);
        route.push(stop);
        cur = stop;
    }
    return route;
}

export function serpentineRoute(stops) {
    if (!stops.length) return [];
    if (!S.mmapLayout) return nearestNeighbor(stops);
    const { pNums, pBase } = S.mmapLayout;
    const byAisle = new Map();
    for (const stop of stops) {
        const m = stop.locKey.match(/^P(\d+)/);
        const p = m ? +m[1] : -1;
        if (!byAisle.has(p)) byAisle.set(p, []);
        byAisle.get(p).push(stop);
    }
    const aislesWithStops = pNums.filter(p => byAisle.has(p));
    if (!aislesWithStops.length) return nearestNeighbor(stops);
    let cur = _ctrlRoomPos();
    let startIdx = 0, minDist = Infinity;
    for (let i = 0; i < aislesWithStops.length; i++) {
        const ax = pBase[aislesWithStops[i]] + UD + AW / 2;
        if (Math.abs(ax - cur.x) < minDist) { minDist = Math.abs(ax - cur.x); startIdx = i; }
    }
    const ordered = [...aislesWithStops.slice(startIdx), ...aislesWithStops.slice(0, startIdx)];
    const midZ = (S.mmapLayout.wBounds.minZ + S.mmapLayout.wBounds.maxZ) / 2;
    let goForward = cur.z < midZ;
    const route = [];
    for (const p of ordered) {
        const aisleStops = byAisle.get(p);
        aisleStops.sort((a, b) => goForward ? a.z - b.z : b.z - a.z);
        for (const stop of aisleStops) {
            stop.distFromPrev = Math.hypot(stop.x - cur.x, stop.z - cur.z);
            route.push(stop);
            cur = stop;
        }
        goForward = !goForward;
    }
    return route;
}

export function aisleRouteWaypoints(stops) {
    if (!S.mmapLayout || stops.length < 2) return stops;
    const wb = S.mmapLayout.wBounds;
    const CORR_FRONT = wb.minZ + 0.8;
    const CORR_BACK  = wb.maxZ - 0.8;
    const pts = [stops[0]];
    for (let i = 1; i < stops.length; i++) {
        const a = stops[i - 1], b = stops[i];
        if (Math.abs(a.x - b.x) > 0.5) {
            const dFront = Math.abs(a.z - CORR_FRONT) + Math.abs(b.z - CORR_FRONT);
            const dBack  = Math.abs(a.z - CORR_BACK)  + Math.abs(b.z - CORR_BACK);
            const cz = dFront <= dBack ? CORR_FRONT : CORR_BACK;
            pts.push({ x: a.x, z: cz });
            pts.push({ x: b.x, z: cz });
        }
        pts.push(b);
    }
    return pts;
}

// ── VISUALES DE RUTA ──────────────────────────────────────────
export function clearPickVisuals() {
    if (pickRouteObj) { S.scene.remove(pickRouteObj); pickRouteObj.geometry.dispose(); pickRouteObj = null; }
    S.pickMarkerGrp?.clear();
}

export function drawPickRoute() {
    clearPickVisuals();
    if (!S.pickRoute.length) return;
    const obj = S.controls.getObject();
    const fromPlayer = [{ x: obj.position.x, z: obj.position.z }, ...S.pickRoute];
    const waypts = aisleRouteWaypoints(fromPlayer);
    const geo = new THREE.BufferGeometry().setFromPoints(waypts.map(s => new THREE.Vector3(s.x, 0.05, s.z)));
    pickRouteObj = new THREE.Line(geo, MAT_PICK_LINE);
    S.scene.add(pickRouteObj);
    for (let i = 0; i < S.pickRoute.length; i++) {
        const s = S.pickRoute[i];
        const collected = S.activeWorkerCollected?.has(i);
        const disc = new THREE.Mesh(PICK_DISC_GEO, collected ? MAT_PICK_COLLECTED : MAT_PICK_DISC);
        disc.position.set(s.x, 0.025, s.z);
        disc.userData.stopIdx = i;
        S.pickMarkerGrp.add(disc);
        const lbl = makePickSprite(String(i + 1), s.locKey);
        lbl.position.set(s.x, 0.95, s.z);
        S.pickMarkerGrp.add(lbl);
    }
}

// ── HUD DE RUTA ───────────────────────────────────────────────
export function updatePickHUD() {
    const hud   = document.getElementById('pick-hud');
    const hkPick = document.getElementById('hk-pick');
    if (!S.pickRoute.length) {
        hud.style.display = 'none';
        if (hkPick) hkPick.style.display = 'none';
        return;
    }
    if (hkPick) hkPick.style.display = 'block';
    const totalDist  = Math.round(S.pickRoute.reduce((s, st) => s + (st.distFromPrev ?? 0), 0));
    const totalUnits = S.pickRoute.reduce((s, st) => s + st.items.reduce((si, i) => si + i.qtyTake, 0), 0);
    document.getElementById('ph-meta').textContent =
        `${S.pickRoute.length} paradas · ${totalUnits} uds · ~${totalDist} m`;
    const obj = S.controls.getObject();
    const listEl = document.getElementById('ph-stops');
    listEl.innerHTML = S.pickRoute.map((s, i) => {
        const near      = Math.hypot(obj.position.x - s.x, obj.position.z - s.z) < PICK_ARRIVE_R;
        const collected = S.activeWorkerCollected?.has(i);
        const stopQty   = s.items.reduce((sum, it) => sum + it.qtyTake, 0);
        const arts = s.items.map(it => `${esc(it.artCode)} ×${it.qtyTake}`).join(', ');
        return `<div class="phs-row${near ? ' phs-near' : ''}${collected ? ' phs-done' : ''}" data-idx="${i}">
            <span class="phs-num">${collected ? '✓' : i + 1}</span>
            <div class="phs-info">
                <span class="phs-loc">${esc(s.locKey)}</span>
                <span class="phs-arts">${arts}</span>
            </div>
            <span class="phs-qty-badge">${stopQty} ud${stopQty !== 1 ? 's' : ''}</span>
            ${collected ? '<span class="phs-tick">&#10003;</span>' : `<button class="phs-go" data-idx="${i}" title="Ir a parada">&#8594;</button>`}
        </div>`;
    }).join('');
    listEl.querySelectorAll('.phs-go').forEach(btn => {
        btn.addEventListener('click', () => teleportToStop(+btn.dataset.idx));
    });
    hud.style.display = 'flex';
}

// ── CONTROLES DE RUTA ─────────────────────────────────────────
export function startRoute() {
    const stops = resolvePickStops();
    if (!stops.length) { showToast('No hay paradas válidas', 3000); return; }
    S.pickRoute  = serpentineRoute(stops);
    pickStep     = 0;
    sessionStart = Date.now();
    closePickPanel(false);
    drawPickRoute();
    updatePickHUD();
    resumeGame();
}

export function saveRoute() {
    if (!S.pickRoute.length) return;
    const elapsed = Date.now() - (sessionStart ?? Date.now());
    saveRouteToHistory(S.pickRoute, elapsed);
    showToast('✓ Ruta guardada en historial', 3000);
    exportPickPDF();
}

export function stopRoute() {
    S.pickRoute = []; pickStep = -1; S.pickArrived = false; clearPickVisuals();
    document.getElementById('pick-hud').style.display = 'none';
    const hkPick = document.getElementById('hk-pick');
    if (hkPick) hkPick.style.display = 'none';
    showToast('Ruta cancelada', 2000);
}

export function teleportToStop(idx) {
    if (idx < 0 || idx >= S.pickRoute.length) return;
    teleportTo(S.pickRoute[idx]);
    pickStep = idx;
    updatePickHUD();
}

export function showSessionSummary() {
    const elapsed = Date.now() - (sessionStart ?? Date.now());
    const mins    = Math.floor(elapsed / 60000);
    const secs    = Math.floor((elapsed % 60000) / 1000);
    const stops   = S.pickRoute.length;
    const items   = S.pickRoute.reduce((s, st) => s + st.items.reduce((si, i) => si + i.qtyTake, 0), 0);
    const dist    = Math.round(S.pickRoute.reduce((s, st) => s + (st.distFromPrev ?? 0), 0));
    saveRouteToHistory(S.pickRoute, elapsed);
    document.getElementById('sum-stops').textContent = stops;
    document.getElementById('sum-items').textContent = items;
    document.getElementById('sum-dist').textContent  = `~${dist} m`;
    document.getElementById('sum-time').textContent  = `${mins}m ${secs}s`;
    document.getElementById('session-summary').style.display = 'flex';
}

// ── HISTORIAL ─────────────────────────────────────────────────
export function saveRouteToHistory(route, elapsed) {
    const entry = {
        date: new Date().toISOString(),
        stops: route.length,
        items: route.reduce((s, st) => s + st.items.reduce((si, i) => si + i.qtyTake, 0), 0),
        dist:  Math.round(route.reduce((s, st) => s + (st.distFromPrev ?? 0), 0)),
        elapsed,
        route: route.map(st => ({
            locKey: st.locKey, x: st.x, z: st.z, yaw: st.yaw, distFromPrev: st.distFromPrev ?? 0,
            items: st.items.map(i => ({ artCode: i.artCode, artName: i.artName, qtyTake: i.qtyTake }))
        }))
    };
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch {}
    hist.unshift(entry);
    if (hist.length > HISTORY_MAX) hist.length = HISTORY_MAX;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
}

function getRouteHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

export function openHistory() {
    historyOpen = true;
    pauseGame();
    renderHistory();
    document.getElementById('history-panel').style.display = 'flex';
}

export function closeHistory(andLock = false) {
    historyOpen = false;
    document.getElementById('history-panel').style.display = 'none';
    if (andLock) resumeGame();
}

export function renderHistory() {
    const hist = getRouteHistory();
    const el   = document.getElementById('hp-list');
    if (!hist.length) {
        el.innerHTML = `<div class="hp-empty">Sin rutas guardadas todavía</div>`;
        return;
    }
    el.innerHTML = hist.map((e, idx) => {
        const d    = new Date(e.date);
        const dStr = d.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' });
        const tStr = d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
        const mins = Math.floor(e.elapsed / 60000);
        const secs = Math.floor((e.elapsed % 60000) / 1000);
        return `<div class="hp-entry">
            <div class="hp-entry-top">
                <span class="hp-date">${dStr} ${tStr}</span>
                <button class="hp-repeat-btn" data-idx="${idx}">&#9654; Repetir</button>
            </div>
            <div class="hp-stats">
                <span class="hp-stat"><strong>${e.stops}</strong> paradas</span>
                <span class="hp-stat"><strong>${e.items}</strong> uds</span>
                <span class="hp-stat"><strong>~${e.dist} m</strong></span>
                <span class="hp-stat"><strong>${mins}m ${secs}s</strong></span>
            </div>
            <div class="hp-stops-preview">${e.route.slice(0, 6).map(s => `<span class="hp-loc-chip">${esc(s.locKey)}</span>`).join('')}${e.route.length > 6 ? `<span class="hp-loc-more">+${e.route.length - 6}</span>` : ''}</div>
        </div>`;
    }).join('');
    el.querySelectorAll('.hp-repeat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const entry = hist[+btn.dataset.idx];
            if (entry) loadHistoryRoute(entry.route);
        });
    });
}

export function loadHistoryRoute(stops) {
    S.pickRoute  = stops.map(s => ({ ...s, items: s.items.map(i => ({ ...i })) }));
    pickStep     = 0;
    S.pickArrived = false;
    sessionStart = Date.now();
    closeHistory();
    drawPickRoute();
    updatePickHUD();
    resumeGame();
    showToast('Ruta cargada del historial', 3000);
}

// ── PANEL DE PICKING ──────────────────────────────────────────
export function openPickPanel() {
    if (!S.controls?.isLocked) return;
    clearKeys();
    S.pickPanelOpen = true;
    pauseGame();
    ppQuery = '';
    renderPickPanel();
    document.getElementById('pick-panel').style.display = 'flex';
    setTimeout(() => document.getElementById('pp-search')?.focus(), 30);
}

export function closePickPanel(andLock = false) {
    S.pickPanelOpen = false;
    document.getElementById('pick-panel').style.display = 'none';
    if (andLock) resumeGame();
}

export function renderPickPanel() {
    const artMap = getArtMap();
    const q = ppQuery.toUpperCase().trim();
    const matches = [];
    for (const art of artMap.values()) {
        if (!q || art.artCode.toUpperCase().includes(q) || art.artName.toUpperCase().includes(q)) matches.push(art);
        if (matches.length >= 60) break;
    }
    const resultsEl = document.getElementById('pp-art-results');
    resultsEl.innerHTML = matches.length ? matches.map(art => {
        const inPick = S.pickItems.find(i => i.artCode === art.artCode);
        const defQty = inPick ? inPick.qtyNeeded : 1;
        return `<div class="pp-art-row">
            <div class="pp-art-info">
                <span class="pp-art-code">${esc(art.artCode)}</span>
                <span class="pp-art-name-sm">${esc(art.artName.substring(0, 42))}</span>
                <span class="pp-art-stock">${art.totalStock.toLocaleString('es-ES')} uds disponibles</span>
            </div>
            <div class="pp-art-ctl">
                <input class="pp-qty" type="number" min="1" value="${defQty}" data-code="${esc(art.artCode)}">
                <button class="pp-add-btn ${inPick ? 'pp-added' : ''}" data-code="${esc(art.artCode)}" data-name="${esc(art.artName)}">${inPick ? '✓' : '+'}</button>
            </div>
        </div>`;
    }).join('') : `<div class="pp-art-empty">${q ? 'Sin resultados' : 'Escribe para buscar artículos'}</div>`;

    resultsEl.querySelectorAll('.pp-add-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const code = btn.dataset.code, name = btn.dataset.name;
            if (S.pickItems.find(i => i.artCode === code)) {
                removePickItem(code);
            } else {
                const qty = Math.max(1, parseInt(resultsEl.querySelector(`.pp-qty[data-code="${code}"]`)?.value || '1', 10));
                const art = artMap.get(code);
                if (art && qty > art.totalStock) {
                    const locs = [...new Set(art.entries.filter(e => e.qty > 0).map(e => e.locKey))].slice(0, 5).join(', ');
                    showToast(`⚠ Stock insuficiente: pides ${qty} uds, hay ${art.totalStock} (${locs || 'sin ubicación'})`, 6000);
                    if (art.totalStock > 0) addPickItem(code, name, art.totalStock);
                } else {
                    addPickItem(code, name, qty);
                }
            }
            renderPickPanel();
        });
    });

    resultsEl.querySelectorAll('.pp-qty').forEach(inp => {
        inp.addEventListener('change', () => {
            const code = inp.dataset.code;
            const art  = artMap.get(code);
            const qty  = Math.max(1, parseInt(inp.value || '1', 10));
            if (art && qty > art.totalStock) {
                inp.value = art.totalStock || 1;
                inp.classList.add('pp-qty-warn');
                showToast(`⚠ Máximo disponible: ${art.totalStock} uds`, 3000);
            } else {
                inp.classList.remove('pp-qty-warn');
            }
        });
    });

    const startBtn = document.getElementById('pp-start');
    const itemsEl  = document.getElementById('pp-items-list');
    document.getElementById('pp-items-count').textContent = S.pickItems.length ? `(${S.pickItems.length})` : '';
    if (!S.pickItems.length) {
        itemsEl.innerHTML = `<div class="pp-items-empty">Sin artículos en la lista</div>`;
        startBtn.disabled = true;
    } else {
        startBtn.disabled = false;
        itemsEl.innerHTML = S.pickItems.map(item => {
            const art = artMap.get(item.artCode);
            const totalStock = art?.totalStock ?? 0;
            const overStock  = item.qtyNeeded > totalStock;
            const shortage   = overStock ? item.qtyNeeded - totalStock : 0;
            // Resolved: which locations will actually be picked from and how many
            const resolvedLocs = [];
            if (art) {
                const { x: sx, z: sz } = _ctrlRoomPos();
                let rem = item.qtyNeeded;
                for (const e of [...art.entries].filter(e => e.qty > 0)
                    .sort((a, b) => Math.hypot(a.x - sx, a.z - sz) - Math.hypot(b.x - sx, b.z - sz))) {
                    if (rem <= 0) break;
                    const take = Math.min(rem, e.qty);
                    resolvedLocs.push({ locKey: e.locKey, take });
                    rem -= take;
                }
            }
            return `<div class="pp-item-chip ${overStock ? 'pp-chip-warn' : ''}">
                <div class="pp-chip-main">
                    <span class="pp-chip-code">${esc(item.artCode)}</span>
                    <span class="pp-chip-qty ${overStock ? 'pp-qty-over' : ''}">× ${item.qtyNeeded}${overStock ? ` ⚠ faltan ${shortage}` : ''}</span>
                    <button class="pp-chip-del" data-code="${esc(item.artCode)}">×</button>
                </div>
                ${resolvedLocs.length ? `<div class="pp-chip-locs">${resolvedLocs.map(e => `<span class="pp-loc-tag">${esc(e.locKey)}<span class="pp-loc-qty">×${e.take}</span></span>`).join('')}</div>` : ''}
                ${overStock ? `<div class="pp-shortage-warn">⚠ Faltan ${shortage} uds para completar el pedido</div>` : ''}
            </div>`;
        }).join('');
        itemsEl.querySelectorAll('.pp-chip-del').forEach(b => {
            b.addEventListener('click', () => { removePickItem(b.dataset.code); renderPickPanel(); });
        });
    }
}

// ── MAPA DE RUTA PARA PDF ────────────────────────────────────
function _buildPickMapDataURL() {
    if (!S.mmapLayout) return null;
    const { pNums, pBase, pasillosMap, wBounds: wb } = S.mmapLayout;
    const wW = wb.maxX - wb.minX, wD = wb.maxZ - wb.minZ;
    const MAP_W = 960;
    const MAP_H = Math.round(MAP_W * wD / wW);
    const pad = 28;
    const sx = (MAP_W - pad * 2) / wW;
    const sz = (MAP_H - pad * 2) / wD;
    const wx = x => pad + (x - wb.minX) * sx;
    const wz = z => pad + (z - wb.minZ) * sz;

    const cv = document.createElement('canvas');
    cv.width = MAP_W; cv.height = MAP_H;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, MAP_W - 1, MAP_H - 1);

    for (const p of pNums) {
        const bx = pBase[p];
        const mc = Math.max(...pasillosMap[p].map(u => u.col), 1);
        const len = mc * (UW + CG) + 2;
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(wx(bx), wz(0), UD * sx, len * sz);
        ctx.fillStyle = 'rgba(251,191,36,0.18)';
        ctx.fillRect(wx(bx + UD), wz(0), AW * sx, len * sz);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(wx(bx + UD + AW), wz(0), UD * sx, len * sz);
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        const lz = Math.max(14, wz(-0.8));
        ctx.fillText(`P${String(p).padStart(2,'0')}`, wx(bx + UD + AW / 2), lz);
    }

    if (S.pickRoute.length > 1) {
        const waypts = aisleRouteWaypoints(S.pickRoute);
        ctx.strokeStyle = 'rgba(245,158,11,0.75)'; ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(wx(waypts[0].x), wz(waypts[0].z));
        for (let i = 1; i < waypts.length; i++)
            ctx.lineTo(wx(waypts[i].x), wz(waypts[i].z));
        ctx.stroke(); ctx.setLineDash([]);
    }

    const R = Math.max(9, Math.min(14, Math.round(11 * Math.min(sx, sz))));
    for (let i = 0; i < S.pickRoute.length; i++) {
        const s = S.pickRoute[i];
        const px = wx(s.x), pz = wz(s.z);
        const qty = s.items.reduce((sum, it) => sum + it.qtyTake, 0);
        ctx.fillStyle = '#1d4ed8';
        ctx.beginPath(); ctx.arc(px, pz, R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(R * 1.1)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), px, pz);
        ctx.fillStyle = '#0f172a';
        ctx.font = `${Math.max(7, Math.round(R * 0.75))}px sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(`${qty}u`, px, pz + R + 2);
    }

    return cv.toDataURL('image/png');
}

// ── PDF ───────────────────────────────────────────────────────
export function exportPickPDF() {
    const now    = new Date().toLocaleString('es-ES');
    const date   = new Date();
    const docNum = `PCK-${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}-${String(date.getHours()).padStart(2,'0')}${String(date.getMinutes()).padStart(2,'0')}`;
    const totalU = S.pickRoute.reduce((s, st) => s + st.items.reduce((si, i) => si + i.qtyTake, 0), 0);
    const totalD = Math.round(S.pickRoute.reduce((s, st) => s + (st.distFromPrev ?? 0), 0));
    const rows = S.pickRoute.map((st, idx) => {
        const uds  = st.items.reduce((s, i) => s + i.qtyTake, 0);
        const arts = st.items.map(i =>
            `<div class="art-row"><span class="art-code">${esc(i.artCode)}</span>${i.artName ? `<span class="art-name">${esc(i.artName.substring(0,50))}</span>` : ''}<span class="art-qty">×${i.qtyTake}</span></div>`
        ).join('');
        return `<tr class="${idx % 2 === 1 ? 'even' : ''}">
            <td class="td-num"><div class="num-badge">${idx+1}</div></td>
            <td class="td-loc"><span class="loc-code">${esc(st.locKey)}</span></td>
            <td class="td-art">${arts}</td>
            <td class="td-uds">${uds}</td>
            <td class="td-chk"><div class="chkbox"></div></td>
        </tr>`;
    }).join('');
    const mapDataURL = _buildPickMapDataURL();

    const artMap = getArtMap();
    const shortages = S.pickItems
        .map(item => {
            const art  = artMap.get(item.artCode);
            const have = art?.totalStock ?? 0;
            const lack = item.qtyNeeded - have;
            return lack > 0 ? { artCode: item.artCode, artName: art?.artName ?? '', needed: item.qtyNeeded, have, lack } : null;
        })
        .filter(Boolean);

    const shortageHTML = shortages.length ? `
  <div class="warn-section">
    <div class="warn-title">&#9888; Stock insuficiente — artículos con cantidad incompleta</div>
    <table class="warn-table"><thead><tr>
      <th>Artículo</th><th class="th-c">Necesitas</th><th class="th-c">Disponible</th><th class="th-c">Faltan</th>
    </tr></thead><tbody>
      ${shortages.map(s =>
          `<tr><td><span class="art-code">${esc(s.artCode)}</span>${s.artName ? ` <span class="art-name">${esc(s.artName.substring(0,50))}</span>` : ''}</td>
           <td class="th-c">${s.needed}</td><td class="th-c">${s.have}</td>
           <td class="th-c warn-lack">&#8722;${s.lack}</td></tr>`
      ).join('')}
    </tbody></table>
  </div>` : '';

    const win = window.open('', '_blank');
    if (!win) { showToast('Permite las ventanas emergentes para exportar', 4000); return; }
    win.document.write(`<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"><title>${docNum}</title>
<style>
@page{size:A4 portrait;margin:10mm 12mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#f1f5f9;color:#1e293b;padding:16px 20px}
.page{max-width:780px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10)}
.hdr{background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 60%,#3b82f6 100%);padding:14px 20px;display:flex;align-items:center;justify-content:space-between}
.hdr-left{color:#fff}.hdr-title{font-size:18px;font-weight:800;letter-spacing:.5px}
.hdr-sub{font-size:10px;color:rgba(255,255,255,.7);margin-top:3px;text-transform:uppercase;letter-spacing:1px}
.hdr-right{text-align:right;color:#fff}
.doc-num{font-family:monospace;font-size:13px;font-weight:700;background:rgba(255,255,255,.15);padding:4px 10px;border-radius:6px;letter-spacing:.5px}
.doc-date{font-size:9px;color:rgba(255,255,255,.65);margin-top:4px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);background:#1e40af}
.stat{padding:8px 14px;border-right:1px solid rgba(255,255,255,.1);text-align:center}.stat:last-child{border-right:none}
.stat-v{font-size:18px;font-weight:800;color:#fff}.stat-l{font-size:8.5px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.8px;margin-top:2px}
.map-section{padding:12px 20px 10px;border-bottom:1px solid #e2e8f0}
.section-title{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#64748b;margin-bottom:8px}
.map-img{width:100%;border:1px solid #e2e8f0;border-radius:6px;display:block}
.map-legend{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:8px}
.leg-row{display:flex;align-items:center;gap:5px;font-size:9px;white-space:nowrap}
.leg-num{width:18px;height:18px;border-radius:50%;background:#1d4ed8;color:#fff;font-weight:800;font-size:8.5px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.leg-loc{font-family:monospace;font-weight:700;color:#1e3a8a;font-size:9px}
.leg-qty{color:#2563eb;font-weight:800}
.body{padding:12px 20px 16px}
table{width:100%;border-collapse:collapse;margin-top:6px}
thead tr{background:#f8fafc;border-bottom:2px solid #e2e8f0}
th{padding:7px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;text-align:left}
th.th-c{text-align:center}
td{padding:6px 10px;vertical-align:top;border-bottom:1px solid #f1f5f9}
tr.even td{background:#f8fafc}
.td-num{width:32px;text-align:center}
.num-badge{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;font-size:9.5px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto}
.td-loc{width:108px}
.loc-code{font-family:monospace;font-size:11px;font-weight:700;color:#1e3a8a;background:#eff6ff;padding:2px 7px;border-radius:4px;display:inline-block}
.art-row{display:flex;align-items:baseline;gap:5px;margin-bottom:2px;font-size:10px}
.art-code{font-family:monospace;font-weight:700;color:#334155;font-size:9.5px;flex-shrink:0}
.art-name{color:#64748b;flex:1;font-size:9px}.art-qty{font-weight:800;color:#2563eb;font-size:11px;flex-shrink:0}
.td-uds{width:44px;text-align:center;font-weight:800;font-size:11px}
.td-chk{width:44px;text-align:center}
.chkbox{width:16px;height:16px;border:2px solid #cbd5e1;border-radius:4px;margin:0 auto}
.warn-section{margin:0 20px 12px;border:1px solid #fca5a5;border-radius:8px;overflow:hidden}
.warn-title{background:#fee2e2;color:#991b1b;font-size:10px;font-weight:700;padding:7px 12px;letter-spacing:.3px}
.warn-table{width:100%;border-collapse:collapse;font-size:10px}
.warn-table thead tr{background:#fef2f2}.warn-table th{padding:5px 10px;font-size:9px;font-weight:700;text-transform:uppercase;color:#7f1d1d;letter-spacing:.4px}
.warn-table td{padding:5px 10px;border-top:1px solid #fee2e2}
.warn-lack{color:#b91c1c;font-weight:800}
@media print{.warn-section{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;font-size:9px;color:#94a3b8}
.footer-sig{display:flex;gap:28px}.sig-block{text-align:center}
.sig-line{width:90px;border-bottom:1px solid #cbd5e1;margin-bottom:4px}
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 20px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:14px}
.btn:hover{background:#1d4ed8}
@media print{
@page{size:A4 portrait;margin:10mm 12mm}
body{background:#fff;padding:0}.page{border-radius:0;box-shadow:none;max-width:100%}
.btn{display:none}
.hdr,.stats{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.num-badge,.leg-num{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style></head><body>
<div style="text-align:center;margin-bottom:14px">
  <button class="btn" onclick="window.print()">&#128438; Imprimir / Guardar PDF</button>
</div>
<div class="page">
  <div class="hdr">
    <div class="hdr-left"><div class="hdr-title">&#128722; Albarán de Picking</div>
    <div class="hdr-sub">SGA LIN &nbsp;·&nbsp; Almacén 3D &nbsp;·&nbsp; Documento de trabajo</div></div>
    <div class="hdr-right"><div class="doc-num">${esc(docNum)}</div><div class="doc-date">Emitido: ${esc(now)}</div></div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-v">${S.pickRoute.length}</div><div class="stat-l">Paradas</div></div>
    <div class="stat"><div class="stat-v">${totalU}</div><div class="stat-l">Unidades</div></div>
    <div class="stat"><div class="stat-v">${totalD > 0 ? '~' + totalD + ' m' : '—'}</div><div class="stat-l">Distancia est.</div></div>
    <div class="stat"><div class="stat-v">${new Set(S.pickRoute.flatMap(s => s.items.map(i => i.artCode))).size}</div><div class="stat-l">Artículos distintos</div></div>
  </div>
  ${mapDataURL ? `<div class="map-section">
    <div class="section-title">&#128205; Plano de ruta</div>
    <img src="${mapDataURL}" class="map-img" alt="Plano de ruta">
    <div class="map-legend">
      ${S.pickRoute.map((s, i) => {
          const qty = s.items.reduce((sum, it) => sum + it.qtyTake, 0);
          return `<div class="leg-row"><span class="leg-num">${i+1}</span><span class="leg-loc">${esc(s.locKey)}</span><span class="leg-qty">${qty}u</span></div>`;
      }).join('')}
    </div>
  </div>` : ''}
  ${shortageHTML}
  <div class="body">
    <div class="section-title">&#128203; Detalle de paradas</div>
    <table><thead><tr>
      <th class="th-c">#</th><th>Ubicación</th><th>Artículo(s)</th><th class="th-c">Uds.</th><th class="th-c">&#10003;</th>
    </tr></thead><tbody>${rows}</tbody></table>
  </div>
  <div class="footer">
    <span>Documento generado automáticamente — SGA LIN Almacén 3D</span>
    <div class="footer-sig">
      <div class="sig-block"><div class="sig-line"></div><div>Preparador</div></div>
      <div class="sig-block"><div class="sig-line"></div><div>Supervisor</div></div>
    </div>
  </div>
</div></body></html>`);
    win.document.close();
}

// ── DETECCIÓN DE LLEGADA ──────────────────────────────────────
// Llamada cada frame desde el loop principal cuando el juego está activo
export function checkPickArrival() {
    if (!S.pickRoute.length || pickStep < 0 || pickStep >= S.pickRoute.length) return;
    const obj  = S.controls.getObject();
    const stop = S.pickRoute[pickStep];
    const dist = Math.hypot(obj.position.x - stop.x, obj.position.z - stop.z);
    if (dist < PICK_ARRIVE_R && !S.pickArrived) {
        S.pickArrived = true;
        if (pickStep === S.pickRoute.length - 1) {
            showSessionSummary();
        } else {
            pickStep++;
            S.pickArrived = false;
            updatePickHUD();
        }
    }
}

// ── EVENT LISTENERS ───────────────────────────────────────────
document.getElementById('pp-cls').addEventListener('click', () => closePickPanel(true));
document.getElementById('pp-clear').addEventListener('click', () => { S.pickItems = []; renderPickPanel(); });
document.getElementById('pp-start').addEventListener('click', startRoute);
document.getElementById('ph-save').addEventListener('click', saveRoute);
document.getElementById('ph-stop').addEventListener('click', stopRoute);
document.getElementById('pp-search').addEventListener('input', e => { ppQuery = e.target.value; renderPickPanel(); });
document.getElementById('pp-search').addEventListener('keydown', e => { if (e.key === 'Escape') closePickPanel(true); });
document.getElementById('sum-cls').addEventListener('click', () => {
    document.getElementById('session-summary').style.display = 'none';
    resumeGame();
});
document.getElementById('sum-pdf').addEventListener('click', exportPickPDF);
document.getElementById('hp-cls').addEventListener('click', () => closeHistory(true));
document.getElementById('hp-clear-all').addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
});
