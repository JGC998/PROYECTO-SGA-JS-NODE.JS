import * as THREE from 'three';
import { INV_RADIUS, MMAP_SIZE, UW, CG, UD, AW } from './configuracion.js';
import { S, pauseGame, resumeGame, clearKeys } from './estado.js';
import { esc, showToast } from './utilidades.js';
import { teleportTo } from './almacen.js';
import { openPickPanel, closePickPanel, aisleRouteWaypoints } from './picking.js';

// ── INVENTARIO EN TIEMPO REAL ─────────────────────────────────
let invSprite       = null;
let invSpriteTarget = null;

export function initInventorySprite() {
    const cv  = document.createElement('canvas');
    cv.width  = 210; cv.height = 84;
    const tex = new THREE.CanvasTexture(cv);
    invSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    invSprite.scale.set(1.9, 0.76, 1);
    invSprite.visible = false;
    invSprite.renderOrder = 10;
    S.scene.add(invSprite);
    invSprite._cv  = cv;
    invSprite._tex = tex;
}

function _drawInvSprite(col) {
    const cv  = invSprite._cv;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 210, 84);
    const isLow   = col.totalUnits > 0 && col.totalUnits < S.LOW_STOCK_THRESH;
    const isEmpty = col.totalUnits === 0;
    const bg = isLow ? 'rgba(220,38,38,0.94)' : isEmpty ? 'rgba(51,65,85,0.92)' : 'rgba(15,23,42,0.92)';
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(3, 3, 204, 78, 11); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.roundRect(3, 3, 204, 24, [11, 11, 0, 0]); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(col.code, 105, 15);
    ctx.fillStyle = '#fff';
    const udsStr = isEmpty ? 'VACÍO' : col.totalUnits.toLocaleString('es-ES') + ' uds';
    ctx.font = `bold ${col.totalUnits > 9999 ? 20 : 26}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(udsStr, 105, 50);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '10px monospace'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${col.filledLevels}/${col.totalLevels} niveles con stock`, 105, 75);
    invSprite._tex.needsUpdate = true;
}

export function hideInventorySprite() {
    if (invSprite) invSprite.visible = false;
}

export function updateInventoryOverlay() {
    if (!invSprite || !S.mmapLayout) { if (invSprite) invSprite.visible = false; return; }
    const obj = S.controls.getObject();
    let nearest = null, minD = INV_RADIUS;
    for (const col of S.shelfCols) {
        const d = Math.hypot(obj.position.x - col.x, obj.position.z - col.z);
        if (d < minD) { minD = d; nearest = col; }
    }
    if (nearest) {
        invSprite.visible = true;
        invSprite.position.set(nearest.x, 3.6, nearest.z);
        if (invSpriteTarget !== nearest) { invSpriteTarget = nearest; _drawInvSprite(nearest); }
    } else {
        invSprite.visible = false;
        invSpriteTarget = null;
    }
}

// ── MINIMAPA ──────────────────────────────────────────────────
let mmapCtx = null;
const _mmapDir = new THREE.Vector3();

export function initMinimap() {
    const cv = document.getElementById('minimap');
    mmapCtx  = cv.getContext('2d');
}

export function drawMinimap() {
    if (!mmapCtx || !S.mmapLayout) return;
    const { pNums, pBase, pasillosMap, wBounds: wb } = S.mmapLayout;
    const W = wb.maxX - wb.minX, D = wb.maxZ - wb.minZ;
    const pad = 10;
    const sx = (MMAP_SIZE - pad * 2) / W;
    const sz = (MMAP_SIZE - pad * 2) / D;
    const wx = x => pad + (x - wb.minX) * sx;
    const wz = z => pad + (z - wb.minZ) * sz;

    mmapCtx.clearRect(0, 0, MMAP_SIZE, MMAP_SIZE);
    mmapCtx.fillStyle = 'rgba(12,18,35,0.97)';
    mmapCtx.fillRect(0, 0, MMAP_SIZE, MMAP_SIZE);

    for (const p of pNums) {
        const bx  = pBase[p];
        const mc  = Math.max(...pasillosMap[p].map(u => u.col), 1);
        const len = mc * (UW + CG) + 2;
        mmapCtx.fillStyle = '#7a9ab0';
        mmapCtx.fillRect(wx(bx), wz(0), UD * sx, len * sz);
        mmapCtx.fillStyle = 'rgba(251,191,36,0.22)';
        mmapCtx.fillRect(wx(bx + UD), wz(0), AW * sx, len * sz);
        mmapCtx.fillStyle = '#7a9ab0';
        mmapCtx.fillRect(wx(bx + UD + AW), wz(0), UD * sx, len * sz);
        mmapCtx.fillStyle = 'rgba(147,197,253,0.9)';
        mmapCtx.font = 'bold 7px monospace';
        mmapCtx.textAlign = 'center';
        const labelY = Math.max(pad - 2, wz(-0.8));
        mmapCtx.fillText(`P${String(p).padStart(2,'0')}`, wx(bx + UD + AW / 2), labelY);
    }

    const obj = S.controls.getObject();
    const px  = wx(obj.position.x);
    const pz  = wz(obj.position.z);
    S.camera.getWorldDirection(_mmapDir);
    const lineLen = 9;
    mmapCtx.strokeStyle = 'rgba(147,197,253,0.9)';
    mmapCtx.lineWidth = 1.5;
    mmapCtx.beginPath();
    mmapCtx.moveTo(px, pz);
    mmapCtx.lineTo(px + _mmapDir.x * lineLen, pz + _mmapDir.z * lineLen);
    mmapCtx.stroke();
    mmapCtx.fillStyle = '#93c5fd';
    mmapCtx.beginPath();
    mmapCtx.arc(px, pz, 3.5, 0, Math.PI * 2);
    mmapCtx.fill();

    if (S.pickRoute.length) {
        const fromPlayer = [{ x: obj.position.x, z: obj.position.z }, ...S.pickRoute];
        const waypts = aisleRouteWaypoints(fromPlayer);
        mmapCtx.save();
        mmapCtx.strokeStyle = 'rgba(251,191,36,0.8)';
        mmapCtx.lineWidth = 1.5;
        mmapCtx.setLineDash([3, 3]);
        mmapCtx.beginPath();
        mmapCtx.moveTo(wx(waypts[0].x), wz(waypts[0].z));
        for (let i = 1; i < waypts.length; i++) mmapCtx.lineTo(wx(waypts[i].x), wz(waypts[i].z));
        mmapCtx.stroke();
        mmapCtx.restore();
        for (let i = 0; i < S.pickRoute.length; i++) {
            const s = S.pickRoute[i];
            mmapCtx.beginPath();
            mmapCtx.arc(wx(s.x), wz(s.z), 3.5, 0, Math.PI * 2);
            mmapCtx.fillStyle = '#fbbf24';
            mmapCtx.fill();
            mmapCtx.fillStyle = '#000';
            mmapCtx.font = 'bold 6px monospace';
            mmapCtx.textAlign = 'center'; mmapCtx.textBaseline = 'middle';
            mmapCtx.fillText(String(i + 1), wx(s.x), wz(s.z));
        }
    }
}

// ── TELETRANSPORTE ────────────────────────────────────────────
let tpActiveIndex = -1;

export function openTeleport() {
    if (!S.controls?.isLocked) return;
    clearKeys();
    S.teleportOpen = true;
    pauseGame();
    document.getElementById('teleport').style.display = 'flex';
    const input = document.getElementById('tp-input');
    input.value = '';
    setTimeout(() => input.focus(), 30);
    updateTeleportResults('');
}

export function closeTeleport(andLock = false) {
    S.teleportOpen = false;
    tpActiveIndex  = -1;
    document.getElementById('teleport').style.display = 'none';
    if (andLock) resumeGame();
}

export function updateTeleportResults(val) {
    const locResults = _searchLocations(val);
    const artResults = val.trim().length >= 2 ? _searchArticles(val) : [];
    const el = document.getElementById('tp-results');
    tpActiveIndex = -1;
    if (!locResults.length && !artResults.length) {
        el.innerHTML = `<div class="tp-empty">Sin resultados</div>`;
        return;
    }
    const clickData = [];
    let html = '';
    for (const r of locResults) {
        const icon = r.key.includes('-X') ? '📍' : '🏭';
        const i = clickData.length;
        clickData.push({ x: r.x, z: r.z, yaw: r.yaw });
        html += `<button class="tp-result" data-i="${i}">${icon} <span>${esc(r.key)}</span></button>`;
    }
    if (artResults.length) {
        if (locResults.length) html += `<div class="tp-sep">Artículos</div>`;
        for (const r of artResults) {
            const i = clickData.length;
            clickData.push({ x: r.x, z: r.z, yaw: r.yaw });
            html += `<button class="tp-result tp-art" data-i="${i}">
                <div class="tp-art-top">
                    <span class="tp-art-code">📦 ${esc(r.artCode)}</span>
                    <span class="tp-art-loc">${esc(r.locKey)}</span>
                </div>
                ${r.artName ? `<div class="tp-art-name">${esc(r.artName.substring(0, 42))}</div>` : ''}
            </button>`;
        }
    }
    el.innerHTML = html;
    el.querySelectorAll('.tp-result').forEach(btn => {
        btn.addEventListener('click', () => {
            const loc = clickData[+btn.dataset.i];
            if (loc) { teleportTo({ ...loc, yaw: Math.PI }); closeTeleport(true); }
        });
    });
}

function teleportResultsNav(dir) {
    const btns = document.querySelectorAll('.tp-result');
    if (!btns.length) return;
    tpActiveIndex = Math.max(0, Math.min(btns.length - 1, tpActiveIndex + dir));
    btns.forEach((b, i) => b.classList.toggle('active', i === tpActiveIndex));
    btns[tpActiveIndex]?.scrollIntoView({ block: 'nearest' });
}

function _searchLocations(val) {
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

function _searchArticles(query) {
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

// ── RAYCASTER / PEEK ──────────────────────────────────────────
const ray  = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(), 0, 7.0);
const _pos = new THREE.Vector3(), _dir = new THREE.Vector3();

export function checkLookAt() {
    S.camera.getWorldPosition(_pos);
    S.camera.getWorldDirection(_dir);
    ray.set(_pos, _dir);
    const hits  = ray.intersectObjects(S.interactables);
    const xhair = document.getElementById('xhair');
    const prompt = document.getElementById('prompt');
    if (hits.length) {
        S.lookedAt = hits[0].object.userData.sd;
        xhair.classList.add('hit');
        prompt.style.display = 'block';
        updatePeekPanel(S.lookedAt);
    } else {
        S.lookedAt = null;
        xhair.classList.remove('hit');
        prompt.style.display = 'none';
        clearPeekPanel();
    }
}

export function updatePeekPanel(sd) {
    const el = document.getElementById('peek-panel');
    if (!el) return;
    const locKey = `P${String(sd.unit.pasillo).padStart(2,'0')}-${sd.unit.lado}-X${String(sd.unit.col).padStart(2,'0')}`;
    document.getElementById('peek-code').textContent = locKey;
    const sorted = [...sd.unit.niveles].sort((a, b) => b.nivel - a.nivel);
    document.getElementById('peek-levels').innerHTML = sorted.map(({ nivel, ubi }) => {
        const k   = ubi.ubicacion ?? ubi.codigo ?? '';
        const stk = sd.stockIdx?.[k];
        const cur = nivel === sd.nivel;
        if (stk && stk.total > 0) {
            const arts = (stk.arts ?? []).map(a => {
                const nom = esc((a.nombre ?? a.articulo ?? '').substring(0, 30));
                const qty = Number(a.stock ?? a.STOCAN ?? 0);
                return `<div class="pk-art"><span class="pk-name">${nom}</span><span class="pk-qty">${qty.toLocaleString('es-ES')}</span></div>`;
            }).join('');
            return `<div class="pk-lv pk-lv-full${cur ? ' pk-lv-cur' : ''}"><span class="pk-nv">Nv${nivel}</span><div class="pk-arts">${arts}</div></div>`;
        }
        if (stk) return `<div class="pk-lv pk-lv-empty${cur ? ' pk-lv-cur' : ''}"><span class="pk-nv">Nv${nivel}</span><span class="pk-empty">Vacía</span></div>`;
        return `<div class="pk-lv pk-lv-unk${cur ? ' pk-lv-cur' : ''}"><span class="pk-nv">Nv${nivel}</span><span class="pk-empty">Sin datos</span></div>`;
    }).join('');
    el.style.display = 'block';
}

export function clearPeekPanel() {
    const el = document.getElementById('peek-panel');
    if (el) el.style.display = 'none';
}

// ── PANEL DE DETALLE ──────────────────────────────────────────
let _detailSD = null;

export function openDetail(sd) {
    S.detailOpen = true;
    _detailSD    = sd;
    pauseGame();

    const locKey    = `P${String(sd.unit.pasillo).padStart(2,'0')}-${sd.unit.lado}-X${String(sd.unit.col).padStart(2,'0')}`;
    const ladoLabel = sd.unit?.lado === 'I' ? 'izq.' : 'der.';

    document.getElementById('det-cod').textContent = locKey;
    document.getElementById('det-sub').textContent =
        `Pasillo ${String(sd.unit?.pasillo ?? '?').padStart(2,'0')} · lado ${ladoLabel} · columna ${String(sd.unit?.col ?? '?').padStart(2,'0')}`;

    // ── Calcular estadísticas ─────────────────────────────────
    const sorted = [...sd.unit.niveles].sort((a, b) => b.nivel - a.nivel);
    let maxTotal = 1, totalUnits = 0, nFull = 0, nEmpty = 0, nUnk = 0;
    const shelfArtCodes = new Set();
    for (const { ubi } of sorted) {
        const k   = ubi.ubicacion ?? ubi.codigo ?? '';
        const stk = sd.stockIdx?.[k];
        if (stk?.total > 0) {
            nFull++; totalUnits += stk.total;
            if (stk.total > maxTotal) maxTotal = stk.total;
            for (const a of (stk.arts ?? [])) {
                const cod = String(a.articulo ?? a.STOART ?? '').trim();
                if (cod) shelfArtCodes.add(cod);
            }
        } else if (stk) { nEmpty++; } else { nUnk++; }
    }

    const firstFull = sorted.find(({ ubi }) => (sd.stockIdx?.[ubi.ubicacion ?? ubi.codigo ?? '']?.total ?? 0) > 0);
    const headArt   = firstFull ? sd.stockIdx?.[firstFull.ubi?.ubicacion ?? firstFull.ubi?.codigo ?? '']?.arts?.[0] : null;
    document.getElementById('det-tit').textContent = headArt?.nombre ?? headArt?.articulo ?? locKey;

    // Stats — siempre visibles
    document.querySelectorAll('.det-stat').forEach(el => el.style.display = '');
    document.getElementById('ds-tot').textContent   = sorted.length;
    document.getElementById('ds-stk').textContent   = nFull;
    document.getElementById('ds-emp').textContent   = nEmpty;
    document.getElementById('ds-units').textContent = totalUnits > 0 ? totalUnits.toLocaleString('es-ES') : '—';

    // ── Filas de niveles ──────────────────────────────────────
    document.getElementById('det-body').innerHTML = sorted.map(({ nivel, ubi }) => {
        const k   = ubi.ubicacion ?? ubi.codigo ?? '';
        const stk = sd.stockIdx?.[k];
        const ubiLabel = `<span class="dlv-ubi-lbl">${esc(k)}</span>`;
        if (stk?.total > 0) {
            const rows = (stk.arts ?? []).map((a, ai) => {
                const qty    = Number(a.stock ?? a.STOCAN ?? 0);
                const pct    = Math.max(3, Math.round((qty / maxTotal) * 100));
                const nom    = esc((a.nombre ?? a.articulo ?? '').substring(0, 44));
                const cod    = esc(a.articulo ?? a.STOART ?? '');
                return `<div class="dlv-art">
                    <div class="dlv-art-body">
                        <div class="dlv-art-top"><span class="dlv-cod">${cod}</span><span class="dlv-qty">${qty.toLocaleString('es-ES')} uds</span></div>
                        <div class="dlv-name">${nom}</div>
                        <div class="dlv-bar"><div class="dlv-bar-fill" style="width:${pct}%"></div></div>
                    </div>
                </div>`;
            }).join('');
            return `<div class="dlv-row dlv-full"><div class="dlv-nv">Nv${nivel}${ubiLabel}</div><div class="dlv-arts">${rows}</div></div>`;
        }
        if (stk) return `<div class="dlv-row dlv-empty"><div class="dlv-nv">Nv${nivel}${ubiLabel}</div><span class="dlv-empty-lbl">Vacía</span></div>`;
        return `<div class="dlv-row dlv-unk"><div class="dlv-nv">Nv${nivel}${ubiLabel}</div><span class="dlv-empty-lbl">Sin datos</span></div>`;
    }).join('');

    document.getElementById('det-pick-btn').style.display = 'none';

    // ── Otras ubicaciones de estos artículos ──────────────────
    const otherLocsEl = document.getElementById('det-other-locs');
    const otherBodyEl = document.getElementById('det-other-body');
    if (shelfArtCodes.size > 0) {
        const seen = new Set();
        const otherRows = [];
        for (const e of S.artEntries) {
            if (!shelfArtCodes.has(e.artCode) || e.locKey === locKey || e.qty <= 0) continue;
            const uid = `${e.artCode}|${e.locKey}`;
            if (seen.has(uid)) continue;
            seen.add(uid);
            otherRows.push(e);
            if (otherRows.length >= 12) break;
        }
        if (otherRows.length > 0) {
            otherBodyEl.innerHTML = otherRows.map((e, i) =>
                `<div class="det-oc-row">
                    <span class="det-oc-loc">${esc(e.locKey)}</span>
                    <div class="det-oc-info">
                        <span class="det-oc-art">${esc(e.artCode)}</span>
                        <span class="det-oc-name">${esc(e.artName)}</span>
                    </div>
                    <span class="det-oc-qty">${e.qty.toLocaleString('es-ES')} uds</span>
                    <button class="det-oc-goto" data-i="${i}">↗ Ir</button>
                </div>`
            ).join('');
            otherBodyEl.onclick = e => {
                const btn = e.target.closest('.det-oc-goto');
                if (!btn) return;
                const entry = otherRows[+btn.dataset.i];
                if (!entry) return;
                const loc = S.LOCATION_MAP.get(entry.locKey);
                if (loc) { closeDetail(false); teleportTo(loc); resumeGame(); }
            };
            otherLocsEl.style.display = '';
        } else {
            otherLocsEl.style.display = 'none';
        }
    } else {
        otherLocsEl.style.display = 'none';
    }

    document.getElementById('detail').style.display = 'flex';
}

export function closeDetail(relock = true) {
    S.detailOpen = false;
    document.getElementById('detail').style.display = 'none';
    document.getElementById('pause').style.display  = 'none';
    if (relock) resumeGame();
}

// ── EVENT LISTENERS ───────────────────────────────────────────
document.getElementById('tp-input').addEventListener('input', e => {
    updateTeleportResults(e.target.value);
});
document.getElementById('tp-input').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); teleportResultsNav(+1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); teleportResultsNav(-1); return; }
    if (e.key === 'Enter') {
        const active = document.querySelector('.tp-result.active') ?? document.querySelector('.tp-result');
        if (active) active.click();
        return;
    }
    if (e.key === 'Escape') closeTeleport(true);
});
document.getElementById('tp-cls').addEventListener('click', () => closeTeleport(true));
document.getElementById('det-cls').addEventListener('click', () => closeDetail(true));
