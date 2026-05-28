/**
 * Editor de Planta 2D — lógica principal
 * Canvas top-down, sin Three.js.
 * Coordenadas: mundo X = canvas X, mundo Z = canvas Y (vista desde arriba).
 */

// ── CONSTANTES ────────────────────────────────────────────────────
const DEFAULT_DIMS = {
    estanteria:   { ancho: 8, profundidad: 0.85, niveles: 5 },
    pasillo:      { longitud: 10, ancho: 2 },
    zona_carga:   { ancho: 8, profundidad: 5 },
    zona_oficina: { ancho: 6, profundidad: 4 },
    columna:      { radio: 0.25 },
    puerta:       { ancho: 3 },
};

const COLORS = {
    floor:        '#0d1626',
    grid:         'rgba(30,58,95,0.45)',
    gridSub:      'rgba(20,40,70,0.28)',
    wall:         '#1e3a5f',
    estanteria:   '#1d4064',
    estanteriaERP:'#204e7c',
    pasillo:      'rgba(251,191,36,0.13)',
    zona_carga:   'rgba(161,100,20,0.40)',
    zona_oficina: 'rgba(190,155,90,0.38)',
    columna:      'rgba(140,160,170,0.85)',
    puerta:       'rgba(74,222,128,0.65)',
    sel:          'rgba(59,130,246,0.5)',
    selBorder:    '#3b82f6',
    handle:       '#3b82f6',
    oob:          'rgba(127,29,29,0.55)',
    oobBorder:    '#ef4444',
    ghost:        'rgba(59,130,246,0.25)',
    ghostBorder:  'rgba(59,130,246,0.7)',
};

// ── STATE ─────────────────────────────────────────────────────────
const st = {
    config: {
        nombre: 'Almacén',
        dimensiones: { ancho: 50, profundidad: 50 },
        objetos: [],
    },
    // viewport
    panX: 0, panZ: 0, zoom: 1,
    // interaction
    tool: 'select',
    snapOn: true,
    snapVal: 0.5,
    selectedId: null,
    // drag state
    drag: null,       // { type, ... }
    // undo/redo
    history: [],
    historyIdx: -1,
    // stock preview
    stockActive: false,
    stockMap: {},     // id → hex color
};

let canvas, ctx;
let _animId = null;

// ── UTILS ─────────────────────────────────────────────────────────
function uid() { return `obj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function snap(v) {
    if (!st.snapOn) return v;
    return Math.round(v / st.snapVal) * st.snapVal;
}

function worldToCanvas(wx, wz) {
    return {
        cx: st.panX + wx * st.zoom,
        cy: st.panZ + wz * st.zoom,
    };
}

function canvasToWorld(cx, cy) {
    return {
        wx: (cx - st.panX) / st.zoom,
        wz: (cy - st.panZ) / st.zoom,
    };
}

function getCanvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { cx: e.clientX - r.left, cy: e.clientY - r.top };
}

// ── HISTORY ───────────────────────────────────────────────────────
function pushHistory() {
    const snap_ = structuredClone(st.config);
    st.history = st.history.slice(0, st.historyIdx + 1);
    st.history.push(snap_);
    if (st.history.length > 80) st.history.shift();
    st.historyIdx = st.history.length - 1;
}

function undo() {
    if (st.historyIdx <= 0) return;
    st.historyIdx--;
    st.config = structuredClone(st.history[st.historyIdx]);
    st.selectedId = null;
    syncUI();
    scheduleRedraw();
}

function redo() {
    if (st.historyIdx >= st.history.length - 1) return;
    st.historyIdx++;
    st.config = structuredClone(st.history[st.historyIdx]);
    st.selectedId = null;
    syncUI();
    scheduleRedraw();
}

// ── OBJECT HELPERS ────────────────────────────────────────────────
function getById(id) { return st.config.objetos.find(o => o.id === id) ?? null; }

function objBounds(o) {
    const { x, z } = o.posicion;
    const rot = (o.rotacion?.y ?? 0) % 360;
    const is90 = Math.abs(rot % 180) === 90;
    let w, d;
    if (o.tipo === 'columna') {
        const r = o.dimensiones?.radio ?? 0.25;
        return { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r };
    }
    if (o.tipo === 'pasillo') {
        const L  = o.dimensiones?.longitud ?? 10;
        const aw = o.dimensiones?.ancho    ?? 2;
        w = is90 ? aw : L;
        d = is90 ? L  : aw;
    } else if (o.tipo === 'puerta') {
        const pw = o.dimensiones?.ancho ?? 3;
        w = is90 ? 0.25 : pw;
        d = is90 ? pw   : 0.25;
    } else {
        w = o.dimensiones?.ancho       ?? 4;
        d = o.dimensiones?.profundidad ?? 0.85;
        if (is90) [w, d] = [d, w];
    }
    return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
}

function hitTest(o, wx, wz) {
    const b = objBounds(o);
    return wx >= b.minX && wx <= b.maxX && wz >= b.minZ && wz <= b.maxZ;
}

function objAtWorld(wx, wz) {
    for (let i = st.config.objetos.length - 1; i >= 0; i--) {
        if (hitTest(st.config.objetos[i], wx, wz)) return st.config.objetos[i];
    }
    return null;
}

function outOfBounds(o) {
    const W = st.config.dimensiones.ancho;
    const D = st.config.dimensiones.profundidad;
    const b = objBounds(o);
    return b.minX < -0.01 || b.maxX > W + 0.01 || b.minZ < -0.01 || b.maxZ > D + 0.01;
}

// ── DRAWING ───────────────────────────────────────────────────────
function scheduleRedraw() {
    if (_animId) return;
    _animId = requestAnimationFrame(() => { _animId = null; draw(); });
}

function draw() {
    const W  = canvas.width;
    const H  = canvas.height;
    const cW = st.config.dimensiones.ancho;
    const cD = st.config.dimensiones.profundidad;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#060d18';
    ctx.fillRect(0, 0, W, H);

    // ── SUELO DEL ALMACÉN ────────────────────────────────────────
    const fp = worldToCanvas(0, 0);
    const fw = cW * st.zoom, fh = cD * st.zoom;
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(fp.cx, fp.cy, fw, fh);

    // ── CUADRÍCULA ───────────────────────────────────────────────
    _drawGrid(cW, cD);

    // ── BORDE DEL ALMACÉN ────────────────────────────────────────
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth   = 2;
    ctx.strokeRect(fp.cx, fp.cy, fw, fh);

    // ── OBJETOS ──────────────────────────────────────────────────
    const drawOrder = ['zona_carga', 'zona_oficina', 'pasillo', 'estanteria', 'columna', 'puerta'];
    for (const tipo of drawOrder) {
        for (const o of st.config.objetos) {
            if (o.tipo !== tipo) continue;
            _drawObj(o);
        }
    }

    // ── GHOST AL CREAR ───────────────────────────────────────────
    if (st.drag?.type === 'create') {
        _drawGhost(st.drag);
    }

    // ── HANDLES DEL SELECCIONADO ─────────────────────────────────
    if (st.selectedId) {
        const sel = getById(st.selectedId);
        if (sel) _drawSelection(sel);
    }

    // ── COORDENADAS ──────────────────────────────────────────────
    _updateZoomInfo();
}

function _drawGrid(cW, cD) {
    const fp  = worldToCanvas(0, 0);
    const sub = st.snapVal;
    const maj = sub * 10;
    const startX = Math.floor(-fp.cx / st.zoom / sub) * sub;
    const startZ = Math.floor(-fp.cy / st.zoom / sub) * sub;
    const endX   = startX + (canvas.width  / st.zoom) + sub * 2;
    const endZ   = startZ + (canvas.height / st.zoom) + sub * 2;

    for (let wx_ = startX; wx_ <= endX; wx_ += sub) {
        const isMaj = Math.abs(wx_ % maj) < sub * 0.01;
        ctx.strokeStyle = isMaj ? COLORS.grid : COLORS.gridSub;
        ctx.lineWidth   = isMaj ? 0.8 : 0.4;
        const cx = fp.cx + wx_ * st.zoom;
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, canvas.height); ctx.stroke();
    }
    for (let wz_ = startZ; wz_ <= endZ; wz_ += sub) {
        const isMaj = Math.abs(wz_ % maj) < sub * 0.01;
        ctx.strokeStyle = isMaj ? COLORS.grid : COLORS.gridSub;
        ctx.lineWidth   = isMaj ? 0.8 : 0.4;
        const cy = fp.cy + wz_ * st.zoom;
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(canvas.width, cy); ctx.stroke();
    }

    // Meter labels del grid en múltiplos grandes (cada 5m)
    if (st.zoom > 4) {
        ctx.fillStyle = 'rgba(71,85,105,0.7)';
        ctx.font = `${Math.max(9, 11 / st.zoom * 10)}px monospace`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        for (let wx_ = 0; wx_ <= cW; wx_ += 5) {
            const p = worldToCanvas(wx_, 0);
            ctx.fillText(wx_, p.cx + 2, p.cy + 2);
        }
    }
}

function _drawObj(o) {
    const { x, z }  = o.posicion;
    const rot        = (o.rotacion?.y ?? 0);
    const rotRad     = rot * Math.PI / 180;
    const is90       = Math.abs(rot % 180) === 90;
    const b          = objBounds(o);
    const oob        = outOfBounds(o);
    const isSel      = o.id === st.selectedId;

    const cp = worldToCanvas(x, z);

    ctx.save();
    ctx.translate(cp.cx, cp.cy);
    ctx.rotate(-rotRad);

    if (o.tipo === 'columna') {
        const r = (o.dimensiones?.radio ?? 0.25) * st.zoom;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = oob ? COLORS.oob : COLORS.columna;
        ctx.fill();
        if (isSel) {
            ctx.strokeStyle = COLORS.selBorder;
            ctx.lineWidth = 2 / st.zoom * 10;
            ctx.stroke();
        }
        ctx.restore();
        return;
    }

    let w, d, fillStyle, strokeStyle;

    if (o.tipo === 'estanteria') {
        w  = (o.dimensiones?.ancho       ?? 8) * st.zoom;
        d  = (o.dimensiones?.profundidad ?? 0.85) * st.zoom;
        fillStyle   = o.meta?.pasillo ? COLORS.estanteriaERP : COLORS.estanteria;
        strokeStyle = '#2563eb';
        // Stock override
        if (st.stockActive && st.stockMap[o.id] !== undefined) {
            fillStyle = '#' + st.stockMap[o.id].toString(16).padStart(6, '0');
        }
        if (oob) fillStyle = COLORS.oob;
    } else if (o.tipo === 'pasillo') {
        const L  = o.dimensiones?.longitud ?? 10;
        const aw = o.dimensiones?.ancho    ?? 2;
        w  = L * st.zoom;
        d  = aw * st.zoom;
        fillStyle   = COLORS.pasillo;
        strokeStyle = 'rgba(251,191,36,0.3)';
        if (oob) { fillStyle = COLORS.oob; strokeStyle = COLORS.oobBorder; }
    } else if (o.tipo === 'zona_carga') {
        w  = (o.dimensiones?.ancho       ?? 8) * st.zoom;
        d  = (o.dimensiones?.profundidad ?? 5) * st.zoom;
        fillStyle   = COLORS.zona_carga;
        strokeStyle = 'rgba(251,191,36,0.25)';
        if (oob) { fillStyle = COLORS.oob; strokeStyle = COLORS.oobBorder; }
    } else if (o.tipo === 'zona_oficina') {
        w  = (o.dimensiones?.ancho       ?? 6) * st.zoom;
        d  = (o.dimensiones?.profundidad ?? 4) * st.zoom;
        fillStyle   = COLORS.zona_oficina;
        strokeStyle = 'rgba(251,220,150,0.4)';
        if (oob) { fillStyle = COLORS.oob; strokeStyle = COLORS.oobBorder; }
    } else if (o.tipo === 'puerta') {
        const pw = o.dimensiones?.ancho ?? 3;
        w  = pw * st.zoom;
        d  = 0.25 * st.zoom;
        fillStyle   = COLORS.puerta;
        strokeStyle = 'rgba(74,222,128,0.45)';
        if (oob) { fillStyle = COLORS.oob; strokeStyle = COLORS.oobBorder; }
    } else {
        w = 2 * st.zoom; d = 2 * st.zoom; fillStyle = '#555'; strokeStyle = '#888';
    }

    // Fill (sin rotación, ya rotamos el ctx)
    ctx.fillStyle = fillStyle;
    ctx.fillRect(-w / 2, -d / 2, w, d);

    // Rayas zona_carga
    if (o.tipo === 'zona_carga') {
        ctx.fillStyle = 'rgba(251,191,36,0.12)';
        for (let i = 0; i < 5; i++) {
            const ox = -w / 2 + (i + 0.5) * (w / 5);
            ctx.fillRect(ox - 1, -d / 2, 2, d);
        }
    }

    // Stroke
    ctx.strokeStyle = isSel ? COLORS.selBorder : strokeStyle;
    ctx.lineWidth   = isSel ? 2 : 0.8;
    ctx.strokeRect(-w / 2, -d / 2, w, d);

    ctx.restore();

    // Etiqueta (en coordenadas canvas, no rotadas)
    const lbl = o.etiqueta || (o.meta?.pasillo ? `P${String(o.meta.pasillo).padStart(3,'0')} ${o.meta.lado ?? ''}` : '');
    if (lbl && st.zoom > 3) {
        const fs = Math.min(11, Math.max(7, st.zoom * 0.85));
        ctx.font      = `bold ${fs}px monospace`;
        ctx.fillStyle = 'rgba(203,213,225,0.85)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lbl, cp.cx, cp.cy);
    } else if (!lbl && o.tipo === 'zona_oficina' && st.zoom > 2) {
        const fs = Math.min(10, Math.max(7, st.zoom));
        ctx.font = `bold ${fs}px monospace`;
        ctx.fillStyle = 'rgba(251,220,150,0.75)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('CTRL', cp.cx, cp.cy);
    }
}

function _drawGhost(drag) {
    if (!drag.x1 || drag.x0 === undefined) return;
    const x0 = Math.min(drag.x0, drag.x1), x1 = Math.max(drag.x0, drag.x1);
    const z0 = Math.min(drag.z0, drag.z1), z1 = Math.max(drag.z0, drag.z1);
    const p0 = worldToCanvas(x0, z0);
    const w  = (x1 - x0) * st.zoom, h = (z1 - z0) * st.zoom;
    ctx.fillStyle   = COLORS.ghost;
    ctx.strokeStyle = COLORS.ghostBorder;
    ctx.lineWidth   = 1.5;
    ctx.fillRect(p0.cx, p0.cy, w, h);
    ctx.strokeRect(p0.cx, p0.cy, w, h);
}

function _drawSelection(o) {
    const b  = objBounds(o);
    const p0 = worldToCanvas(b.minX, b.minZ);
    const p1 = worldToCanvas(b.maxX, b.maxZ);
    const w  = p1.cx - p0.cx, h = p1.cy - p0.cy;

    ctx.strokeStyle = COLORS.selBorder;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(p0.cx - 3, p0.cy - 3, w + 6, h + 6);
    ctx.setLineDash([]);

    // Corner resize handles
    const handles = [
        [b.minX, b.minZ], [b.maxX, b.minZ],
        [b.minX, b.maxZ], [b.maxX, b.maxZ],
    ];
    for (const [hx, hz] of handles) {
        const hp = worldToCanvas(hx, hz);
        ctx.fillStyle = COLORS.handle;
        ctx.fillRect(hp.cx - 4, hp.cy - 4, 8, 8);
    }
}

function _updateZoomInfo() {
    document.getElementById('pl-zoom-info').textContent = `${Math.round(st.zoom * 100)}%`;
}

// ── RESIZE CANVAS ─────────────────────────────────────────────────
function resizeCanvas() {
    const wrap = document.querySelector('.pl-canvas-wrap');
    canvas.width  = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
    scheduleRedraw();
}

// ── FIT SCENE ─────────────────────────────────────────────────────
function fitScene() {
    const cW = st.config.dimensiones.ancho;
    const cD = st.config.dimensiones.profundidad;
    const pad = 40;
    const scaleX = (canvas.width  - pad * 2) / cW;
    const scaleZ = (canvas.height - pad * 2) / cD;
    st.zoom = Math.min(scaleX, scaleZ, 30);
    st.panX = (canvas.width  - cW * st.zoom) / 2;
    st.panZ = (canvas.height - cD * st.zoom) / 2;
    scheduleRedraw();
}

// ── SYNC UI ───────────────────────────────────────────────────────
function syncUI() {
    updateObjList();
    updatePropsPanel();
    checkOutOfBounds();
    document.getElementById('scene-name').value = st.config.nombre;
    document.getElementById('scene-w').value    = st.config.dimensiones.ancho;
    document.getElementById('scene-d').value    = st.config.dimensiones.profundidad;
}

function updateObjList() {
    const el = document.getElementById('obj-list');
    const cnt = document.getElementById('obj-count');
    cnt.textContent = st.config.objetos.length;

    const ICONS = { estanteria:'🗄', pasillo:'━', zona_carga:'📦', zona_oficina:'🏢', columna:'⬤', puerta:'🚪' };
    el.innerHTML = st.config.objetos.map(o => {
        const lbl  = o.etiqueta || o.tipo;
        const ico  = ICONS[o.tipo] ?? '?';
        const isSel = o.id === st.selectedId;
        return `<div class="obj-item${isSel ? ' sel' : ''}" data-id="${o.id}">
            <span class="obj-item-ico">${ico}</span>
            <span class="obj-item-lbl" title="${lbl}">${lbl}</span>
            <button class="obj-item-del" data-del="${o.id}" title="Eliminar">✕</button>
        </div>`;
    }).join('');
}

function updatePropsPanel() {
    const el = document.getElementById('pl-props');
    if (!st.selectedId) { el.innerHTML = '<p class="no-sel">Sin selección</p>'; return; }
    const o = getById(st.selectedId);
    if (!o) { el.innerHTML = '<p class="no-sel">Sin selección</p>'; return; }

    const dim = o.dimensiones ?? {};
    const meta = o.meta ?? {};

    let rows = `
        <div class="prop-row">
            <label>Tipo</label>
            <span class="prop-type-badge">${o.tipo}</span>
        </div>
        <div class="prop-row">
            <label>Etiqueta</label>
            <input id="pp-lbl" type="text" value="${o.etiqueta ?? ''}">
        </div>
        <div class="prop-row">
            <label>X (m)</label>
            <input id="pp-x" type="number" step="0.1" value="${(+o.posicion.x).toFixed(2)}">
        </div>
        <div class="prop-row">
            <label>Z (m)</label>
            <input id="pp-z" type="number" step="0.1" value="${(+o.posicion.z).toFixed(2)}">
        </div>
        <div class="prop-row">
            <label>Rot Y (°)</label>
            <input id="pp-rot" type="number" step="5" value="${+(o.rotacion?.y ?? 0)}">
        </div>`;

    if (o.tipo === 'estanteria') {
        rows += `
        <div class="prop-row"><label>Ancho (m)</label><input id="pp-w" type="number" step="0.1" value="${+(dim.ancho ?? 8)}"></div>
        <div class="prop-row"><label>Prof (m)</label><input id="pp-d" type="number" step="0.05" value="${+(dim.profundidad ?? 0.85)}"></div>
        <div class="prop-row"><label>Niveles</label><input id="pp-niv" type="number" min="1" max="20" value="${+(dim.niveles ?? 5)}"></div>
        <div class="prop-row"><label>Pasillo</label><input id="pp-pasillo" type="number" min="1" value="${+(meta.pasillo ?? '')}"></div>
        <div class="prop-row"><label>Lado</label>
            <select id="pp-lado">
                <option value="">—</option>
                <option value="D" ${meta.lado === 'D' ? 'selected' : ''}>D</option>
                <option value="I" ${meta.lado === 'I' ? 'selected' : ''}>I</option>
            </select>
        </div>`;
    } else if (o.tipo === 'pasillo') {
        rows += `
        <div class="prop-row"><label>Longitud</label><input id="pp-lon" type="number" step="0.1" value="${+(dim.longitud ?? 10)}"></div>
        <div class="prop-row"><label>Ancho</label><input id="pp-aw" type="number" step="0.1" value="${+(dim.ancho ?? 2)}"></div>
        <div class="prop-row"><label>Número</label><input id="pp-pnum" type="number" min="1" value="${+(meta.numero ?? '')}"></div>`;
    } else if (o.tipo === 'zona_carga' || o.tipo === 'zona_oficina') {
        rows += `
        <div class="prop-row"><label>Ancho (m)</label><input id="pp-w" type="number" step="0.5" value="${+(dim.ancho ?? 8)}"></div>
        <div class="prop-row"><label>Prof (m)</label><input id="pp-d" type="number" step="0.5" value="${+(dim.profundidad ?? 5)}"></div>`;
    } else if (o.tipo === 'puerta') {
        rows += `
        <div class="prop-row"><label>Ancho (m)</label><input id="pp-w" type="number" step="0.1" value="${+(dim.ancho ?? 3)}"></div>`;
    } else if (o.tipo === 'columna') {
        rows += `
        <div class="prop-row"><label>Radio (m)</label><input id="pp-r" type="number" step="0.05" value="${+(dim.radio ?? 0.25)}"></div>`;
    }

    rows += `<button class="tb danger prop-del" id="pp-del">Eliminar objeto</button>`;
    el.innerHTML = rows;

    // Bind changes
    const bind = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener('change', fn); };
    bind('pp-lbl',    e => { applyPropChange(o, 'etiqueta', e.target.value); });
    bind('pp-x',      e => { applyPropChange(o, 'posicion.x', +e.target.value); });
    bind('pp-z',      e => { applyPropChange(o, 'posicion.z', +e.target.value); });
    bind('pp-rot',    e => { applyPropChange(o, 'rotacion.y', +e.target.value); });
    bind('pp-w',      e => { applyPropChange(o, 'dimensiones.ancho', +e.target.value); });
    bind('pp-d',      e => { applyPropChange(o, 'dimensiones.profundidad', +e.target.value); });
    bind('pp-niv',    e => { applyPropChange(o, 'dimensiones.niveles', +e.target.value); });
    bind('pp-lon',    e => { applyPropChange(o, 'dimensiones.longitud', +e.target.value); });
    bind('pp-aw',     e => { applyPropChange(o, 'dimensiones.ancho', +e.target.value); });
    bind('pp-pasillo',e => { applyPropChange(o, 'meta.pasillo', +e.target.value || undefined); });
    bind('pp-lado',   e => { applyPropChange(o, 'meta.lado', e.target.value || undefined); });
    bind('pp-pnum',   e => { applyPropChange(o, 'meta.numero', +e.target.value || undefined); });
    bind('pp-r',      e => { applyPropChange(o, 'dimensiones.radio', +e.target.value); });

    document.getElementById('pp-del')?.addEventListener('click', () => {
        pushHistory();
        st.config.objetos = st.config.objetos.filter(x => x.id !== o.id);
        st.selectedId = null;
        syncUI();
        scheduleRedraw();
    });
}

function applyPropChange(o, path, value) {
    pushHistory();
    const parts = path.split('.');
    let ref = o;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!ref[parts[i]]) ref[parts[i]] = {};
        ref = ref[parts[i]];
    }
    ref[parts[parts.length - 1]] = value;
    checkOutOfBounds();
    scheduleRedraw();
}

function checkOutOfBounds() {
    const el = document.getElementById('ed-status');
    if (!el) return;
    const n = st.config.objetos.filter(outOfBounds).length;
    if (n > 0) {
        el.textContent = `⚠ ${n} objeto(s) fuera del suelo`;
        el.style.color = '#fca5a5';
    } else {
        el.textContent = '';
    }
}

// ── HERRAMIENTA ACTIVA ────────────────────────────────────────────
function setTool(tool) {
    st.tool = tool;
    document.querySelectorAll('[data-tool]').forEach(b => {
        b.classList.toggle('active', b.dataset.tool === tool);
    });
    // cursor
    const cursors = { select: 'cur-select', estanteria: 'crosshair', pasillo: 'crosshair',
        zona_carga: 'crosshair', zona_oficina: 'crosshair', columna: 'crosshair', puerta: 'crosshair' };
    canvas.className = '';
    if (tool === 'select') canvas.classList.add('cur-select');
    else canvas.style.cursor = 'crosshair';
}

// ── MOUSE EVENTS ──────────────────────────────────────────────────
let _isPanning   = false;
let _panStartX   = 0, _panStartY = 0;
let _panOrigX    = 0, _panOrigZ  = 0;
let _spaceDown   = false;


function _resizeHandleAt(o, cx, cy) {
    const b  = objBounds(o);
    const corners = [
        { pos: [b.minX, b.minZ], handle: 'tl' },
        { pos: [b.maxX, b.minZ], handle: 'tr' },
        { pos: [b.minX, b.maxZ], handle: 'bl' },
        { pos: [b.maxX, b.maxZ], handle: 'br' },
    ];
    for (const { pos, handle } of corners) {
        const p = worldToCanvas(pos[0], pos[1]);
        if (Math.abs(p.cx - cx) < 7 && Math.abs(p.cy - cy) < 7) return handle;
    }
    return null;
}

function _handleResize(drag, wx, wz) {
    const o  = getById(drag.id);
    const oo = drag.origObj;
    if (!o) return;
    const snWx = snap(wx), snWz = snap(wz);

    // Resize only supports axis-aligned objects (rotation=0 or 90)
    const is90  = Math.abs((o.rotacion?.y ?? 0) % 180) === 90;
    const b     = objBounds(oo);
    const { handle } = drag;

    const newMinX = (handle === 'tl' || handle === 'bl') ? Math.min(snWx, b.maxX - 0.5) : b.minX;
    const newMaxX = (handle === 'tr' || handle === 'br') ? Math.max(snWx, b.minX + 0.5) : b.maxX;
    const newMinZ = (handle === 'tl' || handle === 'tr') ? Math.min(snWz, b.maxZ - 0.5) : b.minZ;
    const newMaxZ = (handle === 'bl' || handle === 'br') ? Math.max(snWz, b.minZ + 0.5) : b.maxZ;

    const nw = newMaxX - newMinX;
    const nd = newMaxZ - newMinZ;

    o.posicion.x = (newMinX + newMaxX) / 2;
    o.posicion.z = (newMinZ + newMaxZ) / 2;

    if (o.tipo === 'pasillo') {
        if (is90) { o.dimensiones.ancho = nd; o.dimensiones.longitud = nw; }
        else       { o.dimensiones.longitud = nw; o.dimensiones.ancho = nd; }
    } else if (o.tipo === 'columna') {
        o.dimensiones.radio = Math.max(0.1, Math.min(nw, nd) / 2);
    } else if (o.tipo === 'puerta') {
        if (is90) o.dimensiones.ancho = nd; else o.dimensiones.ancho = nw;
    } else {
        if (is90) { o.dimensiones.profundidad = nw; o.dimensiones.ancho = nd; }
        else       { o.dimensiones.ancho = nw; o.dimensiones.profundidad = nd; }
    }

    updatePropsPanel();
    checkOutOfBounds();
}

function _makeObj(tipo, x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const w  = Math.max(0.5, x1 - x0), d = Math.max(0.5, z1 - z0);
    const def = DEFAULT_DIMS[tipo] ?? {};

    const o = {
        id:       uid(),
        tipo,
        etiqueta: '',
        posicion: { x: +cx.toFixed(3), y: 0, z: +cz.toFixed(3) },
        rotacion: { y: 0 },
        dimensiones: {},
        meta: {},
        locked: false,
    };

    if (tipo === 'estanteria') {
        o.dimensiones = { ancho: +w.toFixed(3), profundidad: +d.toFixed(3), niveles: def.niveles ?? 5, alturaNivel: 0.4 };
    } else if (tipo === 'pasillo') {
        o.dimensiones = { longitud: +w.toFixed(3), ancho: +d.toFixed(3), forma: 'recto', longitud2: 0 };
    } else if (tipo === 'zona_carga' || tipo === 'zona_oficina') {
        o.dimensiones = { ancho: +w.toFixed(3), profundidad: +d.toFixed(3) };
    } else if (tipo === 'columna') {
        o.dimensiones = { radio: 0.25 };
        o.posicion.x  = +cx.toFixed(3);
        o.posicion.z  = +cz.toFixed(3);
    } else if (tipo === 'puerta') {
        o.dimensiones = { ancho: +w.toFixed(3) };
    }

    return o;
}

// ── ZOOM ──────────────────────────────────────────────────────────
function onWheel(e) {
    e.preventDefault();
    const { cx, cy } = getCanvasPos(e);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newZoom = Math.max(0.5, Math.min(60, st.zoom * factor));
    st.panX = cx - (cx - st.panX) * (newZoom / st.zoom);
    st.panZ = cy - (cy - st.panZ) * (newZoom / st.zoom);
    st.zoom = newZoom;
    scheduleRedraw();
}

// ── KEYBOARD ──────────────────────────────────────────────────────
function initKeyboard() {
    window.addEventListener('keydown', e => {
        if (e.code === 'Space' && !e.repeat) {
            _spaceDown = true;
            canvas.classList.add('cur-pan');
            e.preventDefault();
        }
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        const k = e.key.toLowerCase();
        if (k === 'v') setTool('select');
        if (k === 'e') setTool('estanteria');
        if (k === 'p') setTool('pasillo');
        if (k === 'z') { if (!e.ctrlKey && !e.metaKey) setTool('zona_carga'); }
        if (k === 'c' && !e.ctrlKey) setTool('columna');
        if (k === 'd' && !e.ctrlKey) setTool('puerta');
        if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); }
        if ((e.ctrlKey || e.metaKey) && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); redo(); }
        if (k === 'delete' || k === 'backspace') {
            if (st.selectedId) {
                pushHistory();
                st.config.objetos = st.config.objetos.filter(x => x.id !== st.selectedId);
                st.selectedId = null;
                syncUI();
                scheduleRedraw();
            }
        }
        if (k === 'escape') {
            st.drag = null;
            setTool('select');
            scheduleRedraw();
        }
        if (k === 'f') fitScene();
        if (k === 'r' && st.selectedId) {
            const o = getById(st.selectedId);
            if (o) {
                pushHistory();
                o.rotacion.y = ((o.rotacion?.y ?? 0) + 90) % 360;
                updatePropsPanel();
                scheduleRedraw();
            }
        }
    });
    window.addEventListener('keyup', e => {
        if (e.code === 'Space') {
            _spaceDown = false;
            canvas.classList.remove('cur-pan');
        }
    });
}

// ── CARGA / GUARDADO ──────────────────────────────────────────────
async function cargar() {
    showStatus('Cargando distribucion.json…');
    try {
        const r = await fetch(`./datos/distribucion.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!data?.objetos) throw new Error('JSON inválido');
        st.config = data;
        st.config.dimensiones ??= { ancho: 50, profundidad: 50 };
        st.config.objetos     ??= [];
        st.selectedId = null;
        pushHistory();
        syncUI();
        fitScene();
        showStatus(`✓ ${st.config.objetos.length} objetos cargados`);
    } catch (err) {
        showStatus(`✗ Error al cargar: ${err.message}`, true);
    }
}

async function guardar() {
    const btn = document.getElementById('btn-guardar');
    if (btn?.disabled) return;
    if (btn) btn.disabled = true;

    const cfg = structuredClone(st.config);
    cfg.nombre = document.getElementById('scene-name').value || cfg.nombre;
    cfg.dimensiones.ancho       = +(document.getElementById('scene-w').value);
    cfg.dimensiones.profundidad = +(document.getElementById('scene-d').value);
    for (const o of cfg.objetos) { delete o._stockClass; }

    showStatus('Guardando…');
    try {
        const r = await fetch('/api/almacen/save-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        st.config.nombre = cfg.nombre;
        st.config.dimensiones = cfg.dimensiones;
        showStatus('✓ Guardado en servidor (distribucion.json)');
    } catch (err) {
        showStatus(`✗ Error al guardar: ${err.message}`, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function sincronizarConVisor() {
    showStatus('Sincronizando con el visor 3D…');
    try {
        // Build pasillo layout for viewer
        const pasilloMap = {};
        for (const o of st.config.objetos) {
            if (o.tipo !== 'estanteria') continue;
            const p    = o.meta?.pasillo; if (!p) continue;
            const lado = o.meta?.lado;
            const cols = o.meta?.columnas ?? Math.max(1, Math.round(((o.dimensiones?.ancho ?? 1.5) - 2) / (0.65 + 0.05)));
            const nivs = o.meta?.niveles ?? o.dimensiones?.niveles ?? 5;
            if (!pasilloMap[p]) pasilloMap[p] = { numero: p, columnas: cols, niveles: nivs, lados: [] };
            else {
                pasilloMap[p].columnas = Math.max(pasilloMap[p].columnas, cols);
                pasilloMap[p].niveles  = Math.max(pasilloMap[p].niveles,  nivs);
            }
            if (lado && !pasilloMap[p].lados.includes(lado)) pasilloMap[p].lados.push(lado);
        }
        const pasillos = Object.values(pasilloMap).sort((a, b) => a.numero - b.numero);
        const fullConfig = structuredClone(st.config);
        const r = await fetch('/api/almacen/sync-ubicaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pasillos, config: fullConfig }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const res = await r.json();
        showStatus(`✓ Sincronizado — ${res.generadas ?? '?'} ubicaciones`);
    } catch (err) {
        showStatus(`✗ Error al sincronizar: ${err.message}`, true);
    }
}

function nuevoLayout() {
    if (st.config.objetos.length > 0 && !confirm('¿Crear layout vacío? Se perderán los cambios no guardados.')) return;
    pushHistory();
    st.config = { nombre: 'Almacén', dimensiones: { ancho: 50, profundidad: 50 }, objetos: [] };
    st.selectedId = null;
    syncUI();
    fitScene();
    showStatus('Layout vacío creado');
}

// ── STOCK PREVIEW ─────────────────────────────────────────────────
async function toggleStock() {
    if (st.stockActive) {
        st.stockActive = false;
        st.stockMap = {};
        document.getElementById('btn-stock-preview').classList.remove('active');
        scheduleRedraw();
        showStatus('Vista de stock desactivada');
        return;
    }
    showStatus('Cargando stock…');
    try {
        const stks = await fetch(`./datos/articulos.json?t=${Date.now()}`, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : []).catch(() => []);
        const stockIdx = {};
        for (const s of stks) {
            const k = s.ubicacion ?? s.STOUBI; if (!k) continue;
            if (!stockIdx[k]) stockIdx[k] = 0;
            stockIdx[k] += Number(s.stock ?? s.STOCAN ?? 0);
        }
        st.stockMap = {};
        for (const o of st.config.objetos) {
            if (o.tipo !== 'estanteria' || !o.meta?.pasillo) continue;
            const p = o.meta.pasillo, lado = o.meta.lado ?? 'D';
            const cols = o.meta?.columnas ?? Math.max(1, Math.round(((o.dimensiones?.ancho ?? 1.5) - 2) / 0.7));
            const nivs = o.meta?.niveles  ?? o.dimensiones?.niveles ?? 1;
            const total = cols * nivs;
            let conStock = 0;
            for (let col = 1; col <= cols; col++) {
                for (let niv = 1; niv <= nivs; niv++) {
                    const etq = `P${String(p).padStart(3,'0')} ${lado} X${String(col).padStart(3,'0')} Y${String(niv).padStart(2,'0')}`;
                    if ((stockIdx[etq] ?? 0) > 0) conStock++;
                }
            }
            const pct = total > 0 ? conStock / total : 0;
            st.stockMap[o.id] = pct === 0 ? 0x7f1d1d : pct < 0.3 ? 0x7c2d12 : pct < 0.8 ? 0x713f12 : 0x14532d;
        }
        st.stockActive = true;
        document.getElementById('btn-stock-preview').classList.add('active');
        scheduleRedraw();
        showStatus('Stock: verde=alto · amarillo=medio · naranja=bajo · rojo=vacío');
    } catch (err) {
        showStatus(`✗ Error al cargar stock: ${err.message}`, true);
    }
}

// ── STATUS ────────────────────────────────────────────────────────
let _statusTimer = null;
function showStatus(msg, isErr = false) {
    const el = document.getElementById('pl-status-msg');
    el.textContent = msg;
    el.style.color = isErr ? '#fca5a5' : '';
    if (_statusTimer) clearTimeout(_statusTimer);
    _statusTimer = setTimeout(() => { el.textContent = ''; el.style.color = ''; }, 5000);
}

// ── INIT ──────────────────────────────────────────────────────────
function init() {
    canvas = document.getElementById('pl-canvas');
    ctx    = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Bind canvas events
    const onDown = (e) => {
        const { cx, cy } = getCanvasPos(e);
        const { wx, wz } = canvasToWorld(cx, cy);

        if (e.button === 1 || (e.button === 0 && _spaceDown)) {
            _isPanning = true;
            _panStartX = cx; _panStartY = cy;
            _panOrigX  = st.panX; _panOrigZ = st.panZ;
            canvas.classList.add('cur-panning');
            e.preventDefault();
            return;
        }
        if (e.button !== 0) return;

        if (st.tool === 'select') {
            const hit = objAtWorld(wx, wz);
            if (hit) {
                const h = _resizeHandleAt(hit, cx, cy);
                if (h) {
                    pushHistory();
                    st.drag = { type: 'resize', id: hit.id, handle: h, origObj: structuredClone(hit) };
                    return;
                }
                if (hit.id !== st.selectedId) {
                    st.selectedId = hit.id;
                    updatePropsPanel();
                    updateObjList();
                    scheduleRedraw();
                }
                pushHistory();
                st.drag = { type: 'move', id: hit.id, startWx: wx, startWz: wz,
                    origX: hit.posicion.x, origZ: hit.posicion.z };
            } else {
                st.selectedId = null;
                updatePropsPanel();
                updateObjList();
                scheduleRedraw();
            }
        } else {
            const sx = snap(wx), sz = snap(wz);
            if (st.tool === 'columna') {
                pushHistory();
                const o = _makeObj(st.tool, sx, sz, sx + 0.5, sz + 0.5);
                st.config.objetos.push(o);
                st.selectedId = o.id;
                syncUI();
                scheduleRedraw();
            } else {
                st.drag = { type: 'create', tool: st.tool, x0: sx, z0: sz, x1: sx, z1: sz };
            }
        }
    };

    const onMove = (e) => {
        const { cx, cy } = getCanvasPos(e);
        const { wx, wz } = canvasToWorld(cx, cy);
        document.getElementById('pl-coords').textContent = `X ${wx.toFixed(2)}  Z ${wz.toFixed(2)}`;

        if (_isPanning) {
            st.panX = _panOrigX + (cx - _panStartX);
            st.panZ = _panOrigZ + (cy - _panStartY);
            scheduleRedraw();
            return;
        }
        if (!st.drag) return;

        if (st.drag.type === 'move') {
            const o = getById(st.drag.id);
            if (!o) return;
            o.posicion.x = snap(st.drag.origX + (wx - st.drag.startWx));
            o.posicion.z = snap(st.drag.origZ + (wz - st.drag.startWz));
            updatePropsPanel();
            checkOutOfBounds();
            scheduleRedraw();
        } else if (st.drag.type === 'create') {
            st.drag.x1 = snap(wx);
            st.drag.z1 = snap(wz);
            scheduleRedraw();
        } else if (st.drag.type === 'resize') {
            _handleResize(st.drag, wx, wz);
            scheduleRedraw();
        }
    };

    const onUp = () => {
        if (_isPanning) {
            _isPanning = false;
            canvas.classList.remove('cur-panning');
        }
        if (!st.drag) return;
        if (st.drag.type === 'create') {
            const { x0, z0, x1, z1, tool } = st.drag;
            if (Math.abs(x1 - x0) >= 0.4 || Math.abs(z1 - z0) >= 0.4) {
                const o = _makeObj(tool, Math.min(x0,x1), Math.min(z0,z1), Math.max(x0,x1), Math.max(z0,z1));
                st.config.objetos.push(o);
                st.selectedId = o.id;
                syncUI();
            }
        }
        st.drag = null;
        scheduleRedraw();
    };

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', onWheel, { passive: false });

    initKeyboard();

    // Topbar buttons
    document.getElementById('btn-nuevo').addEventListener('click', nuevoLayout);
    document.getElementById('btn-cargar').addEventListener('click', cargar);
    document.getElementById('btn-guardar').addEventListener('click', guardar);
    document.getElementById('btn-sincronizar').addEventListener('click', sincronizarConVisor);
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-stock-preview').addEventListener('click', toggleStock);
    document.getElementById('btn-snap-toggle').addEventListener('click', () => {
        st.snapOn = !st.snapOn;
        document.getElementById('btn-snap-toggle').textContent = st.snapOn ? 'Snap ON' : 'Snap OFF';
        document.getElementById('btn-snap-toggle').classList.toggle('active', st.snapOn);
    });
    document.getElementById('snap-val').addEventListener('change', e => {
        st.snapVal = Math.max(0.05, +e.target.value || 0.5);
    });
    document.getElementById('scene-w').addEventListener('change', e => {
        st.config.dimensiones.ancho = +e.target.value;
        checkOutOfBounds(); scheduleRedraw();
    });
    document.getElementById('scene-d').addEventListener('change', e => {
        st.config.dimensiones.profundidad = +e.target.value;
        checkOutOfBounds(); scheduleRedraw();
    });

    // Tool buttons (topbar + sidebar catalog)
    document.querySelectorAll('[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });

    // Object list delegation
    document.getElementById('obj-list').addEventListener('click', e => {
        const del = e.target.closest('[data-del]');
        if (del) {
            pushHistory();
            st.config.objetos = st.config.objetos.filter(x => x.id !== del.dataset.del);
            if (st.selectedId === del.dataset.del) st.selectedId = null;
            syncUI(); scheduleRedraw();
            return;
        }
        const item = e.target.closest('[data-id]');
        if (item) {
            st.selectedId = item.dataset.id;
            updatePropsPanel(); updateObjList(); scheduleRedraw();
        }
    });

    // Initial state
    pushHistory();
    fitScene();
    cargar();
}

document.addEventListener('DOMContentLoaded', init);
