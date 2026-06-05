// ── UI: PICKING — PANEL, HUD Y SESIÓN ────────────────────────
// Responsabilidad: DOM puro — panel de artículos, HUD de ruta, summary, historial.
// La lógica de rutas vive en src/core/picking-logic.js.
// Las visualizaciones 3D viven en src/3d/picking-vis.js.
import { store, S, pauseGame, resumeGame, clearKeys } from '../state/store.js';
import { esc, showToast } from '../../js/shared/utilidades.js';
import { PICK_ARRIVE_R, HISTORY_KEY } from '../../js/shared/configuracion.js';
import { getArtMap } from '../core/datos.js';
import { teleportTo } from '../3d/almacen.js';
import { drawPickRoute, clearPickVisuals } from '../3d/picking-vis.js';
import {
    resolvePickStops, serpentineRoute, nearestNeighbor, twoOpt,
    saveRouteToHistory, getRouteHistory, validateHistoryRoute,
    saveRouteToSession, loadRouteFromSession, ROUTE_SS_KEY,
    ctrlRoomPos,
} from '../core/picking-logic.js';
import { invalidateMinimapWaypoints } from './minimap.js';

// ── ESTADO MÓDULO ─────────────────────────────────────────────
let _pickStep     = -1;
let _ppQuery      = '';
let _sessionStart = null;

// IP de red local del servidor (para QR escaneables desde móvil en la misma red)
let _mobileBase = window.location.origin; // fallback: localhost
fetch('/api/almacen/server-info').then(r => r.ok ? r.json() : null).then(info => {
    if (info?.ip && info.ip !== 'localhost') _mobileBase = `http://${info.ip}:${info.port}`;
}).catch(() => {});
let _historySaved = false;

// ── ADD / REMOVE ITEMS ────────────────────────────────────────
export function addPickItem(artCode, artName, qty) {
    const ex = S.pickItems.find(i => i.artCode === artCode);
    if (ex) ex.qtyNeeded += qty;
    else S.pickItems.push({ artCode, artName, qtyNeeded: qty });
    store.commit('pickItems');
}

export function removePickItem(artCode) {
    const idx = S.pickItems.findIndex(i => i.artCode === artCode);
    if (idx >= 0) S.pickItems.splice(idx, 1);
    store.commit('pickItems');
}

// ── HUD (diff incremental: MEJ-7) ─────────────────────────────
let _hudRouteId = '';

function _hudSig()  { return S.pickRoute.map(s => s.locKey).join('|'); }

function _buildHudRows(listEl) {
    listEl.innerHTML = S.pickRoute.map((s, i) => {
        const stopQty = s.items.reduce((sum, it) => sum + it.qtyTake, 0);
        const arts    = s.items.map(it => `${esc(it.artCode)} ×${it.qtyTake}`).join(', ');
        return `<div class="phs-row" data-idx="${i}">
            <span class="phs-num">${i + 1}</span>
            <div class="phs-info">
                <span class="phs-loc">${esc(s.locKey)}</span>
                <span class="phs-arts">${arts}</span>
            </div>
            <span class="phs-qty-badge">${stopQty} ud${stopQty !== 1 ? 's' : ''}</span>
            <button class="phs-go" data-idx="${i}" title="Ir a parada">&#8594;</button>
        </div>`;
    }).join('');
    listEl.querySelectorAll('.phs-go').forEach(btn => {
        btn.addEventListener('click', () => teleportToStop(+btn.dataset.idx));
    });
}

function _patchHudRows(listEl) {
    const obj  = S.controls.getObject();
    const rows = listEl.querySelectorAll('.phs-row');
    rows.forEach((row, i) => {
        const s         = S.pickRoute[i];
        const near      = Math.hypot(obj.position.x - s.x, obj.position.z - s.z) < PICK_ARRIVE_R;
        const collected = !!S.activeWorkerCollected?.has(i);
        const isNext    = i === _pickStep && !collected;
        row.classList.toggle('phs-near', near);
        row.classList.toggle('phs-done', collected);
        row.classList.toggle('phs-next', isNext);
        const numEl = row.querySelector('.phs-num');
        if (numEl) numEl.textContent = collected ? '✓' : String(i + 1);
        const goBtn = row.querySelector('.phs-go');
        const tick  = row.querySelector('.phs-tick');
        if (collected && goBtn) {
            goBtn.replaceWith(Object.assign(document.createElement('span'), { className: 'phs-tick', textContent: '✓' }));
        } else if (!collected && tick) {
            const btn = document.createElement('button');
            btn.className = 'phs-go'; btn.dataset.idx = String(i); btn.title = 'Ir a parada'; btn.innerHTML = '&#8594;';
            btn.addEventListener('click', () => teleportToStop(i));
            tick.replaceWith(btn);
        }
    });
}

export function updatePickHUD() {
    const hud    = document.getElementById('pick-hud');
    const hkPick = document.getElementById('hk-pick');
    if (!S.pickRoute.length) {
        hud.style.display = 'none';
        if (hkPick) hkPick.style.display = 'none';
        _hudRouteId = '';
        return;
    }
    if (hkPick) hkPick.style.display = 'block';
    const totalDist  = Math.round(S.pickRoute.reduce((s, st) => s + (st.distFromPrev ?? 0), 0));
    const totalUnits = S.pickRoute.reduce((s, st) => s + st.items.reduce((si, i) => si + i.qtyTake, 0), 0);
    document.getElementById('ph-meta').textContent =
        `${S.pickRoute.length} paradas · ${totalUnits} uds · ~${totalDist} m`;
    const listEl = document.getElementById('ph-stops');
    const sig    = _hudSig();
    if (sig !== _hudRouteId) { _hudRouteId = sig; _buildHudRows(listEl); }
    _patchHudRows(listEl);
    hud.style.display = 'flex';
}

// ── CONTROLES DE RUTA ─────────────────────────────────────────
export async function startRoute() {
    const stops = resolvePickStops();
    if (!stops.length) { showToast('No hay paradas válidas', 3000, 'warn'); return; }
    const btn = document.getElementById('pp-start');
    const prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Calculando…';
    await new Promise(r => requestAnimationFrame(r));
    store.dispatch('pickRoute', twoOpt(serpentineRoute(stops)));
    btn.disabled = false;
    btn.textContent = prevText;
    store.dispatch('assignedWorker', null);
    store.dispatch('activeRouteId', null);
    _pickStep     = 0;
    _sessionStart = Date.now();
    _historySaved = false;
    closePickPanel(false);
    teleportTo({ ...ctrlRoomPos() });   // posiciona al jugador en la garita para que #1 sea siempre la primera
    invalidateMinimapWaypoints();
    drawPickRoute();
    updatePickHUD();
    saveRouteToSession(S.pickRoute, _pickStep);
    resumeGame();
}

export async function saveRoute() {
    if (!S.pickRoute.length || _historySaved) return;
    const elapsed = Date.now() - (_sessionStart ?? Date.now());
    saveRouteToHistory(S.pickRoute, elapsed);
    _historySaved = true;

    const docNum = (() => {
        const d = new Date();
        return `PCK-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
    })();

    let routeId = null;
    try {
        const resp = await fetch('/picking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ docNum, operario: S.assignedWorker?.name ?? null, paradas: S.pickRoute }),
        });
        if (resp.ok) {
            routeId = (await resp.json()).id;
            store.dispatch('activeRouteId', routeId);
        }
    } catch {}

    showToast(`✓ Ruta guardada${routeId ? ' · QR generado' : ''}`, 3000, 'success');
    exportPickPDF(routeId, docNum);
}

export function stopRoute() {
    store.dispatch('pickRoute', []);
    store.dispatch('assignedWorker', null);
    store.dispatch('activeRouteId', null);
    _pickStep = -1;
    store.dispatch('pickArrived', false);
    sessionStorage.removeItem(ROUTE_SS_KEY);
    clearPickVisuals();
    document.getElementById('pick-hud').style.display = 'none';
    const hkPick = document.getElementById('hk-pick');
    if (hkPick) hkPick.style.display = 'none';
    showToast('Ruta cancelada', 2000);
}

export function teleportToStop(idx) {
    if (idx < 0 || idx >= S.pickRoute.length) return;
    teleportTo(S.pickRoute[idx]);
    _pickStep = idx;
    updatePickHUD();
}

export function showSessionSummary() {
    const elapsed = Date.now() - (_sessionStart ?? Date.now());
    const mins    = Math.floor(elapsed / 60000);
    const secs    = Math.floor((elapsed % 60000) / 1000);
    const stops   = S.pickRoute.length;
    const items   = S.pickRoute.reduce((s, st) => s + st.items.reduce((si, i) => si + i.qtyTake, 0), 0);
    const dist    = Math.round(S.pickRoute.reduce((s, st) => s + (st.distFromPrev ?? 0), 0));
    if (!_historySaved) {
        saveRouteToHistory(S.pickRoute, elapsed);
        _historySaved = true;
    }
    document.getElementById('sum-stops').textContent = stops;
    document.getElementById('sum-items').textContent = items;
    document.getElementById('sum-dist').textContent  = `~${dist} m`;
    document.getElementById('sum-time').textContent  = `${mins}m ${secs}s`;
    document.getElementById('session-summary').style.display = 'flex';
}

export function checkPickArrival() {
    if (!S.pickRoute.length || _pickStep < 0 || _pickStep >= S.pickRoute.length) return;
    const obj  = S.controls.getObject();
    const stop = S.pickRoute[_pickStep];
    const near = Math.hypot(obj.position.x - stop.x, obj.position.z - stop.z) < PICK_ARRIVE_R;
    if (near !== S.pickArrived) store.dispatch('pickArrived', near);
}

export function confirmPickStop() {
    if (!S.pickRoute.length || _pickStep < 0 || _pickStep >= S.pickRoute.length) return;
    if (_pickStep === S.pickRoute.length - 1) {
        sessionStorage.removeItem(ROUTE_SS_KEY);
        showSessionSummary();
    } else {
        _pickStep++;
        store.dispatch('pickArrived', false);
        updatePickHUD();
        saveRouteToSession(S.pickRoute, _pickStep);
    }
}

export function restoreRouteFromSession() {
    const saved = loadRouteFromSession();
    if (!saved) return;
    const valid = saved.route.filter(s => s.locKey && S.LOCATION_MAP.has(s.locKey));
    if (!valid.length) { sessionStorage.removeItem(ROUTE_SS_KEY); return; }
    store.dispatch('pickRoute', valid);
    _pickStep     = Math.min(Math.max(saved.step, 0), valid.length - 1);
    store.dispatch('pickArrived', false);
    _sessionStart = Date.now();
    _historySaved = false;
    invalidateMinimapWaypoints();
    drawPickRoute();
    updatePickHUD();
    showToast('Ruta activa restaurada', 3000);
}

// ── PANEL DE PICKING ──────────────────────────────────────────
export function openPickPanel() {
    if (!S.controls?.isLocked) return;
    clearKeys();
    store.dispatch('pickPanelOpen', true);
    pauseGame();
    _ppQuery = '';
    renderPickPanel();
    document.getElementById('pick-panel').style.display = 'flex';
    setTimeout(() => document.getElementById('pp-search')?.focus(), 30);
}

export function closePickPanel(andLock = false) {
    store.dispatch('pickPanelOpen', false);
    document.getElementById('pick-panel').style.display = 'none';
    if (andLock) resumeGame();
}

export function renderPickPanel() {
    const artMap = getArtMap();
    const q = _ppQuery.toUpperCase().trim();
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
                <span class="pp-art-stock${art.totalStock === 0 ? ' pp-art-nostock' : ''}">${art.totalStock === 0 ? 'Sin stock' : art.totalStock.toLocaleString('es-ES') + ' uds disponibles'}</span>
            </div>
            <div class="pp-art-ctl">
                <input class="pp-qty" type="number" min="1" value="${defQty}" data-code="${esc(art.artCode)}">
                <button class="pp-add-btn ${inPick ? 'pp-added' : ''}" data-code="${esc(art.artCode)}" data-name="${esc(art.artName)}" ${art.totalStock === 0 ? 'disabled title="Sin stock"' : ''}>${inPick ? '✓' : '+'}</button>
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
                    showToast(`⚠ Stock insuficiente: pides ${qty} uds, hay ${art.totalStock} (${locs || 'sin ubicación'})`, 6000, 'warn');
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
                showToast(`⚠ Máximo disponible: ${art.totalStock} uds`, 3000, 'warn');
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
            const art        = artMap.get(item.artCode);
            const totalStock = art?.totalStock ?? 0;
            const overStock  = item.qtyNeeded > totalStock;
            const shortage   = overStock ? item.qtyNeeded - totalStock : 0;
            const resolvedLocs = [];
            if (art) {
                const { x: sx, z: sz } = ctrlRoomPos();
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

// ── HISTORIAL ─────────────────────────────────────────────────
export function openHistory() {
    pauseGame();
    _renderHistory();
    document.getElementById('history-panel').style.display = 'flex';
}

export function closeHistory(andLock = false) {
    document.getElementById('history-panel').style.display = 'none';
    if (andLock) resumeGame();
}

function _renderHistory() {
    const hist = getRouteHistory();
    const el   = document.getElementById('hp-list');
    if (!hist.length) { el.innerHTML = `<div class="hp-empty">Sin rutas guardadas todavía</div>`; return; }
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
            if (entry) _loadHistoryRoute(entry.route);
        });
    });
}

function _loadHistoryRoute(stops) {
    const { valid, invalid } = validateHistoryRoute(stops);
    if (!valid.length) { showToast('⚠ Ninguna parada de esta ruta es válida en el layout actual', 5000, 'warn'); return; }
    if (invalid.length) showToast(`⚠ ${invalid.length} parada(s) eliminada(s): ubicación no existe en el layout actual`, 5000, 'warn');
    store.dispatch('pickRoute', twoOpt(valid));
    _pickStep     = 0;
    store.dispatch('pickArrived', false);
    _sessionStart = Date.now();
    _historySaved = false;
    closeHistory();
    invalidateMinimapWaypoints();
    drawPickRoute();
    updatePickHUD();
    resumeGame();
    showToast('Ruta cargada del historial', 3000, 'success');
}

// ── QR MODAL ─────────────────────────────────────────────────
export async function showQRModal() {
    if (!S.pickRoute.length) return;
    let rid = S.activeRouteId;
    if (!rid) {
        showToast('Guardando ruta para generar QR…', 2000);
        try {
            const now    = new Date();
            const docNum = `PCK-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
            const resp = await fetch('/picking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docNum, operario: S.assignedWorker?.name ?? null, paradas: S.pickRoute }),
            });
            if (resp.ok) {
                rid = (await resp.json()).id;
                store.dispatch('activeRouteId', rid);
            }
        } catch {}
    }
    if (!rid) { showToast('No se pudo generar el QR — servidor no disponible', 4000); return; }
    const mobileUrl = `${_mobileBase}/movil?ruta=${rid}`;
    const qrUrl     = `/api/almacen/qr?data=${encodeURIComponent(mobileUrl)}`;
    document.getElementById('qr-img').src          = qrUrl;
    document.getElementById('qr-url-text').textContent = mobileUrl;
    document.getElementById('qr-modal').style.display  = 'flex';
    store.dispatch('qrModalOpen', true);
}

export function closeQRModal() {
    document.getElementById('qr-modal').style.display = 'none';
    store.dispatch('qrModalOpen', false);
}

// ── PDF ───────────────────────────────────────────────────────
export async function exportPickPDF(routeId = null, existingDocNum = null) {
    let rid = routeId ?? S.activeRouteId;
    const d = new Date();
    const docNum = existingDocNum ?? `PCK-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
    if (!rid && S.pickRoute.length) {
        try {
            const resp = await fetch('/picking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docNum, operario: S.assignedWorker?.name ?? null, paradas: S.pickRoute }),
            });
            if (resp.ok) {
                rid = (await resp.json()).id;
                store.dispatch('activeRouteId', rid);
            }
        } catch {}
    }
    import('../core/grafo.js')
        .then(m => _doExportPDF(m.astarRouteWaypoints, rid, docNum))
        .catch(() => _doExportPDF(null, rid, docNum));
}

async function _doExportPDF(astarRouteWaypoints, routeId = null, existingDocNum = null) {
    const now  = new Date().toLocaleString('es-ES');
    const date = new Date();
    const docNum = existingDocNum ?? `PCK-${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}-${String(date.getHours()).padStart(2,'0')}${String(date.getMinutes()).padStart(2,'0')}`;
    const mobileUrl  = routeId ? `${_mobileBase}/movil?ruta=${routeId}` : null;
    const workerName = S.assignedWorker?.name ?? null;
    const totalU = S.pickRoute.reduce((s, st) => s + st.items.reduce((si, i) => si + i.qtyTake, 0), 0);
    const totalD = Math.round(S.pickRoute.reduce((s, st) => s + (st.distFromPrev ?? 0), 0));

    const minimapEl  = document.getElementById('minimap');
    const minimapImg = minimapEl ? minimapEl.toDataURL('image/png') : '';

    const artMap = getArtMap();
    const shortages = S.pickItems.map(item => {
        const art = artMap.get(item.artCode), have = art?.totalStock ?? 0, lack = item.qtyNeeded - have;
        return lack > 0 ? { artCode: item.artCode, artName: art?.artName ?? '', needed: item.qtyNeeded, have, lack } : null;
    }).filter(Boolean);

    const rows = S.pickRoute.map((st, idx) => {
        const uds  = st.items.reduce((s, i) => s + i.qtyTake, 0);
        const arts = st.items.map(i => `<div class="art-row"><span class="art-code">${esc(i.artCode)}</span>${i.artName ? `<span class="art-name">${esc(i.artName.substring(0,50))}</span>` : ''}<span class="art-qty">×${i.qtyTake}</span></div>`).join('');
        return `<tr class="${idx % 2 === 1 ? 'even' : ''}"><td class="td-num"><div class="num-badge">${idx+1}</div></td><td class="td-loc"><span class="loc-code">${esc(st.locKey)}</span></td><td class="td-art">${arts}</td><td class="td-uds">${uds}</td><td class="td-chk"><div class="chkbox"></div></td></tr>`;
    }).join('');

    // Pre-fetch QR as data:URL from same-origin context to bypass Chrome Private Network Access restrictions
    // that block requests from about:blank (PDF window) to localhost.
    let qrDataUrl = null;
    if (mobileUrl) {
        try {
            const resp = await fetch(`/api/almacen/qr?data=${encodeURIComponent(mobileUrl)}`);
            if (resp.ok) {
                const blob = await resp.blob();
                qrDataUrl  = await new Promise(res => {
                    const r = new FileReader();
                    r.onload = () => res(r.result);
                    r.readAsDataURL(blob);
                });
            }
        } catch {}
    }

    const win = window.open('', '_blank');
    if (!win) { showToast('Permite las ventanas emergentes para exportar', 4000); return; }
    const mapCSS = minimapImg ? `
        .map-wrap{float:right;margin:0 0 8px 14px}
        .map-img{width:130px;height:130px;border:1px solid #d1d5db;border-radius:4px;display:block}
        .map-label{font-size:9px;color:#9ca3af;text-align:center;margin-top:2px}` : '';
    const qrCSS = qrDataUrl ? `
        .qr-wrap{float:left;margin:0 14px 8px 0;text-align:center}
        .qr-img{width:120px;height:120px;display:block;border-radius:4px;background:#fff;padding:4px}
        .qr-label{font-size:8px;color:#6b7280;margin-top:3px;max-width:128px}
        .qr-url{font-size:7px;color:#9ca3af;word-break:break-all;max-width:128px;margin-top:1px}` : '';
    const shortageCSS = shortages.length ? `
        .warn{margin:10px 0;padding:8px 12px;border:1px solid #fca5a5;background:#fef2f2;border-radius:4px;font-size:10px}
        .warn-title{font-weight:bold;color:#dc2626;margin-bottom:4px}
        .warn-row{display:flex;gap:10px;margin-top:3px}
        .warn-code{font-family:monospace;font-weight:bold;min-width:72px}` : '';
    win.document.write(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>${docNum}</title><style>
*{margin:0;padding:0;box-sizing:border-box}
${mapCSS}${qrCSS}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;padding:0 20px 30px}
header{display:flex;justify-content:space-between;align-items:flex-start;padding:14px 0 10px;border-bottom:3px solid #1e3a5f;margin-bottom:10px}
.logo{font-size:17px;font-weight:bold;color:#1e3a5f}
.logo small{display:block;font-size:10px;font-weight:normal;color:#6b7280;margin-top:2px}
.meta{text-align:right;font-size:10px;color:#555}.meta strong{display:block;font-size:13px;color:#111;margin-bottom:2px}
.summary{display:flex;gap:0;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;margin-bottom:12px}
.sum-cell{flex:1;padding:8px 12px;border-right:1px solid #d1d5db}.sum-cell:last-child{border-right:none}
.sum-label{font-size:9px;text-transform:uppercase;color:#9ca3af;letter-spacing:.5px}
.sum-val{font-size:15px;font-weight:bold;color:#1e3a5f;margin-top:2px}
table{width:100%;border-collapse:collapse}
thead th{background:#1e3a5f;color:#fff;padding:6px 8px;text-align:left;font-size:10px;letter-spacing:.3px}
td{padding:5px 8px;vertical-align:top;border-bottom:1px solid #e5e7eb}
tr.even td{background:#f9fafb}
.td-num{width:34px;text-align:center}
.num-badge{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#1e3a5f;color:#fff;font-weight:bold;font-size:10px}
.td-loc{width:110px}
.loc-code{font-family:monospace;font-weight:bold;font-size:12px;color:#1e3a5f}
.art-row{display:flex;gap:6px;align-items:baseline;margin-bottom:1px}
.art-code{font-family:monospace;font-size:10px;font-weight:bold;min-width:72px;color:#374151}
.art-name{font-size:10px;color:#6b7280;flex:1}
.art-qty{font-weight:bold;font-size:11px;white-space:nowrap}
.td-uds{width:44px;font-weight:bold;text-align:right}
.td-chk{width:40px;text-align:center}
.chkbox{width:18px;height:18px;border:2px solid #9ca3af;border-radius:3px;display:inline-block}
footer{margin-top:14px;font-size:9px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:8px}
@media print{@page{margin:15mm}body{padding:0}.no-print{display:none}}
.no-print{display:flex;align-items:center;gap:12px;background:#eff6ff;border-bottom:1px solid #bfdbfe;padding:9px 20px;margin:0 -20px 12px}
#print-btn{background:#1d4ed8;color:#fff;border:none;border-radius:6px;padding:7px 18px;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:.2px}
#print-btn:disabled{background:#93c5fd;cursor:not-allowed}
#print-status{font-size:11px;color:#6b7280}
${shortageCSS}
</style></head><body>
<div class="no-print">
  <button id="print-btn" onclick="window.print()" disabled>&#128438;&nbsp;Imprimir / Guardar PDF</button>
  <span id="print-status">&#9203; Preparando…</span>
</div>
<header>
  <div><div class="logo">&#x1F3ED; SGA LIN &mdash; Lista de Picking<small>Sistema de Gestión de Almacén</small></div></div>
  <div class="meta"><strong>${docNum}</strong>${now}</div>
</header>
${qrDataUrl ? `<div class="qr-wrap"><img src="${qrDataUrl}" class="qr-img" alt="QR"><div class="qr-label">Ruta en el m&oacute;vil</div><div class="qr-url">${mobileUrl}</div></div>` : ''}
${minimapImg ? `<div class="map-wrap"><img src="${minimapImg}" class="map-img" alt="Mapa"><div class="map-label">Plano del almac&eacute;n</div></div>` : ''}
<div class="summary">
  <div class="sum-cell"><div class="sum-label">Documento</div><div class="sum-val" style="font-size:11px;word-break:break-all">${docNum}</div></div>
  <div class="sum-cell"><div class="sum-label">Operario</div><div class="sum-val" style="font-size:${workerName ? '13px' : '14px'}">${workerName ? esc(workerName) : '—'}</div></div>
  <div class="sum-cell"><div class="sum-label">Paradas</div><div class="sum-val">${S.pickRoute.length}</div></div>
  <div class="sum-cell"><div class="sum-label">Unidades</div><div class="sum-val">${totalU}</div></div>
  <div class="sum-cell"><div class="sum-label">Distancia est.</div><div class="sum-val">~${totalD}&thinsp;m</div></div>
</div>
${shortages.length ? `<div class="warn"><div class="warn-title">&#9888; Roturas de stock (${shortages.length})</div>${shortages.map(s => `<div class="warn-row"><span class="warn-code">${esc(s.artCode)}</span><span>${esc(s.artName.substring(0,40))}</span><span>Necesita <strong>${s.needed}</strong>, disponible ${s.have} &mdash; <strong style="color:#dc2626">faltan ${s.lack}</strong></span></div>`).join('')}</div>` : ''}
<table>
<thead><tr>
  <th style="width:34px">#</th>
  <th style="width:110px">Ubicaci&oacute;n</th>
  <th>Art&iacute;culos</th>
  <th style="width:44px;text-align:right">Uds</th>
  <th style="width:40px">&#10003;</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<footer>Documento ${docNum} &middot; Generado ${now} &middot; SGA LIN</footer>
<script>
window.onload = function() {
    var btn = document.getElementById('print-btn');
    var st  = document.getElementById('print-status');
    var pending = Array.from(document.images).filter(function(i){ return !i.complete; });
    if (!pending.length) { btn.disabled = false; st.textContent = 'Listo para imprimir'; return; }
    var n = 0;
    pending.forEach(function(img) {
        img.onload = img.onerror = function() {
            if (++n === pending.length) { btn.disabled = false; st.textContent = 'Listo para imprimir'; }
        };
    });
};
</script>
</body></html>`);
    win.document.close();
}

// ── EVENT LISTENERS ───────────────────────────────────────────
document.getElementById('pp-cls').addEventListener('click',   () => closePickPanel(true));
document.getElementById('pp-clear').addEventListener('click', () => { store.dispatch('pickItems', []); renderPickPanel(); });
document.getElementById('pp-start').addEventListener('click', startRoute);
document.getElementById('ph-save').addEventListener('click',  saveRoute);
document.getElementById('ph-stop').addEventListener('click',  stopRoute);
document.getElementById('ph-assign').addEventListener('click', () => {
    // Importación diferida para evitar ciclo picking-ui → trabajadores-ui → picking-ui
    import('./trabajadores-ui.js').then(m => m.assignRoute());
});
let _ppSearchTimer = 0;
document.getElementById('pp-search').addEventListener('input', e => {
    _ppQuery = e.target.value;
    clearTimeout(_ppSearchTimer);
    _ppSearchTimer = setTimeout(renderPickPanel, 100);
});
document.getElementById('pp-search').addEventListener('keydown', e => { if (e.key === 'Escape') closePickPanel(true); });
document.getElementById('sum-cls').addEventListener('click', () => {
    document.getElementById('session-summary').style.display = 'none';
    stopRoute();
    resumeGame();
});
document.getElementById('sum-pdf').addEventListener('click', () => exportPickPDF());
document.getElementById('ph-mark').addEventListener('click', confirmPickStop);
document.getElementById('ph-qr').addEventListener('click',  showQRModal);
document.getElementById('qr-cls').addEventListener('click',  closeQRModal);
document.getElementById('hp-cls').addEventListener('click', () => closeHistory(true));
document.getElementById('hp-clear-all').addEventListener('click', () => {
    if (!confirm('¿Eliminar todo el historial de rutas? Esta acción no se puede deshacer.')) return;
    localStorage.removeItem(HISTORY_KEY);
    _renderHistory();
});
