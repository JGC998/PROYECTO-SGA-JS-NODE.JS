// ── CONSTANTES (sincronizadas con configuracion.js) ───────────
const LAYOUT_KEY = 'sga_warehouse_layout';

let CFG = { AW: 4.5, UD: 0.85, UW: 1.5, CG: 0.1, LH: 1.1 };

// ── ESTADO ────────────────────────────────────────────────────
let layout = { version: 1, pasillos: [] };
let selected = null;  // número de pasillo seleccionado

// ── CANVAS ────────────────────────────────────────────────────
const canvas = document.getElementById('cfg-canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
    const wrap = document.getElementById('canvas-wrap');
    const W = wrap.clientWidth  - 40;
    const H = wrap.clientHeight - 80;
    canvas.width  = Math.max(400, W);
    canvas.height = Math.max(300, H);
    drawCanvas();
}

function drawCanvas() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0f1e';
    ctx.fillRect(0, 0, W, H);

    if (!layout.pasillos.length) {
        ctx.fillStyle = '#334155';
        ctx.font = '14px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Añade pasillos con el botón "+ Añadir" para ver el layout', W / 2, H / 2);
        return;
    }

    const { AW, UD, UW, CG } = CFG;
    const PG = 0.5;
    const totalW = layout.pasillos.length * (2 * UD + AW) + (layout.pasillos.length - 1) * PG;
    const maxCols = Math.max(...layout.pasillos.map(p => p.columnas));
    const totalD  = maxCols * (UW + CG) + 2;

    const pad  = 32;
    const scaleX = (W - pad * 2) / totalW;
    const scaleZ = (H - pad * 2) / totalD;
    const scale  = Math.min(scaleX, scaleZ, 18);

    const offsetX = (W - totalW * scale) / 2;
    const offsetZ = pad + 4;

    const wx = x => offsetX + x * scale;
    const wz = z => offsetZ + z * scale;

    // Zona de entrada (franja delantera)
    ctx.fillStyle = 'rgba(251,191,36,0.04)';
    ctx.fillRect(wx(0) - 4, wz(0) - scale * 2, totalW * scale + 8, scale * 2);
    ctx.strokeStyle = 'rgba(251,191,36,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(wx(0) - 4, wz(0));
    ctx.lineTo(wx(totalW) + 4, wz(0));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ENTRADA', wx(0), wz(0) - 2);

    let curX = 0;
    for (const p of layout.pasillos) {
        const aisleLen = p.columnas * (UW + CG);
        const isSel    = selected === p.numero;
        const hasI     = p.lados.includes('I');
        const hasD     = p.lados.includes('D');

        // Sombra de selección
        if (isSel) {
            ctx.shadowColor = '#3b82f6';
            ctx.shadowBlur  = 12;
        }

        // Estantería izquierda (I)
        ctx.fillStyle = isSel ? '#3b82f6' : (hasI ? '#5a7a8f' : '#1e293b');
        ctx.fillRect(wx(curX), wz(0), UD * scale, aisleLen * scale);
        if (hasI && !isSel) {
            ctx.fillStyle = 'rgba(147,197,253,0.15)';
            ctx.fillRect(wx(curX) + 1, wz(0) + 1, UD * scale - 2, aisleLen * scale - 2);
        }

        // Pasillo
        ctx.fillStyle = isSel ? 'rgba(59,130,246,0.18)' : 'rgba(251,191,36,0.1)';
        ctx.fillRect(wx(curX + UD), wz(0), AW * scale, aisleLen * scale);

        // Línea central del pasillo
        ctx.strokeStyle = isSel ? 'rgba(59,130,246,0.4)' : 'rgba(251,191,36,0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(wx(curX + UD + AW / 2), wz(0));
        ctx.lineTo(wx(curX + UD + AW / 2), wz(aisleLen));
        ctx.stroke();
        ctx.setLineDash([]);

        // Estantería derecha (D)
        ctx.fillStyle = isSel ? '#3b82f6' : (hasD ? '#5a7a8f' : '#1e293b');
        ctx.fillRect(wx(curX + UD + AW), wz(0), UD * scale, aisleLen * scale);
        if (hasD && !isSel) {
            ctx.fillStyle = 'rgba(147,197,253,0.15)';
            ctx.fillRect(wx(curX + UD + AW) + 1, wz(0) + 1, UD * scale - 2, aisleLen * scale - 2);
        }

        ctx.shadowBlur = 0;

        // Líneas de columnas (ticks en las estanterías)
        ctx.strokeStyle = isSel ? 'rgba(255,255,255,0.2)' : 'rgba(100,116,139,0.4)';
        ctx.lineWidth = 0.5;
        for (let col = 1; col <= p.columnas; col++) {
            const tz = (col - 1) * (UW + CG);
            if (hasI) {
                ctx.beginPath();
                ctx.moveTo(wx(curX), wz(tz));
                ctx.lineTo(wx(curX + UD), wz(tz));
                ctx.stroke();
            }
            if (hasD) {
                ctx.beginPath();
                ctx.moveTo(wx(curX + UD + AW), wz(tz));
                ctx.lineTo(wx(curX + 2 * UD + AW), wz(tz));
                ctx.stroke();
            }
        }

        // Etiqueta pasillo
        const fontSize = Math.max(9, Math.min(14, scale * 1.8));
        ctx.fillStyle = isSel ? '#fff' : '#93c5fd';
        ctx.font      = `bold ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`P${String(p.numero).padStart(2, '0')}`, wx(curX + UD + AW / 2), wz(0) - 4);

        // Dimensiones en el pasillo si hay espacio
        if (aisleLen * scale > 60) {
            ctx.fillStyle = 'rgba(100,116,139,0.8)';
            ctx.font      = `${Math.max(8, fontSize - 2)}px system-ui`;
            ctx.textBaseline = 'middle';
            ctx.fillText(`${p.columnas} col · ${p.niveles} niv`,
                wx(curX + UD + AW / 2), wz(aisleLen / 2));
        }

        curX += 2 * UD + AW + PG;
    }

    // Ejes
    ctx.fillStyle = '#334155';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const mLen = maxCols * (UW + CG);
    for (let col = 0; col <= maxCols; col += Math.ceil(maxCols / 6)) {
        const tz = col * (UW + CG);
        ctx.fillText(`X${String(col).padStart(2,'0')}`, offsetX - 4, wz(tz));
    }
}

// ── RENDER LISTA ──────────────────────────────────────────────
function renderList() {
    const list = document.getElementById('pasillo-list');
    if (!layout.pasillos.length) {
        list.innerHTML = '<div style="padding:20px 10px;color:#475569;font-size:13px;text-align:center">Sin pasillos. Pulsa "+ Añadir".</div>';
        return;
    }
    list.innerHTML = layout.pasillos.map((p, idx) => {
        const isSel = selected === p.numero;
        const totalUbis = p.columnas * p.lados.length * p.niveles;
        return `
        <div class="p-card${isSel ? ' selected' : ''}" data-num="${p.numero}">
            <div class="p-card-hdr">
                <span class="p-num">P${String(p.numero).padStart(2,'0')}</span>
                <button class="p-del" data-del="${p.numero}" title="Eliminar pasillo">✕</button>
            </div>
            <div class="p-fields">
                <div class="p-field">
                    <label>Columnas</label>
                    <input type="number" min="1" max="50" value="${p.columnas}"
                        data-num="${p.numero}" data-field="columnas">
                </div>
                <div class="p-field">
                    <label>Niveles</label>
                    <input type="number" min="1" max="10" value="${p.niveles}"
                        data-num="${p.numero}" data-field="niveles">
                </div>
                <div class="p-sides">
                    <label class="top">Lados con estantería</label>
                    <div class="sides-btns">
                        <button class="side-btn${p.lados.includes('I') ? ' active' : ''}"
                            data-num="${p.numero}" data-side="I">Izq (I)</button>
                        <button class="side-btn${p.lados.includes('D') ? ' active' : ''}"
                            data-num="${p.numero}" data-side="D">Der (D)</button>
                    </div>
                </div>
            </div>
            <div class="p-info">${totalUbis} ubicaciones · ${(p.columnas * (1.5 + 0.1)).toFixed(1)} m de largo</div>
        </div>`;
    }).join('');
}

function renderAll() {
    renderList();
    drawCanvas();
    wireCardEvents();
}

function wireCardEvents() {
    // Select card on click (not on inputs/buttons)
    document.querySelectorAll('.p-card').forEach(card => {
        card.addEventListener('click', e => {
            if (e.target.closest('input, button')) return;
            const num = +card.dataset.num;
            selected = selected === num ? null : num;
            renderAll();
        });
    });

    // Delete button
    document.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const num = +btn.dataset.del;
            layout.pasillos = layout.pasillos.filter(p => p.numero !== num);
            if (selected === num) selected = null;
            renderAll();
        });
    });

    // Number inputs
    document.querySelectorAll('.p-field input').forEach(input => {
        input.addEventListener('change', () => {
            const num   = +input.dataset.num;
            const field = input.dataset.field;
            const val   = Math.max(+input.min, Math.min(+input.max, parseInt(input.value) || 1));
            const p = layout.pasillos.find(p => p.numero === num);
            if (p) { p[field] = val; input.value = val; }
            renderAll();
        });
    });

    // Side toggle buttons
    document.querySelectorAll('.side-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const num  = +btn.dataset.num;
            const side = btn.dataset.side;
            const p    = layout.pasillos.find(p => p.numero === num);
            if (!p) return;
            const idx = p.lados.indexOf(side);
            if (idx >= 0) {
                if (p.lados.length > 1) p.lados.splice(idx, 1);
            } else {
                p.lados.push(side);
                p.lados.sort();
            }
            renderAll();
        });
    });
}

// ── GENERAR UBICACIONES DESDE LAYOUT ─────────────────────────
export function generateUbisFromLayout(layoutData) {
    const ubis = [];
    for (const p of layoutData.pasillos) {
        for (const lado of p.lados) {
            for (let col = 1; col <= p.columnas; col++) {
                for (let nivel = 1; nivel <= p.niveles; nivel++) {
                    const etq = `P${String(p.numero).padStart(3,'0')} ${lado} X${String(col).padStart(3,'0')} Y${String(nivel).padStart(2,'0')}`;
                    ubis.push({ etiqueta: etq, ubicacion: etq });
                }
            }
        }
    }
    return ubis;
}

// ── GUARDAR / CARGAR ──────────────────────────────────────────
function saveLayout() {
    const full = { ...layout, cfg: CFG };
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(full));
    showStatus('✓ Layout guardado. Recarga el almacén 3D para aplicarlo.', '#4ade80');
}

function exportLayout() {
    const full = { ...layout, cfg: CFG };
    const blob = new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sga-layout.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showStatus('✓ Exportado como sga-layout.json', '#4ade80');
}

function loadFromFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.pasillos) throw new Error('Formato incorrecto');
            layout = { version: data.version ?? 1, pasillos: data.pasillos };
            if (data.cfg) {
                CFG = { ...CFG, ...data.cfg };
                syncCfgInputs();
            }
            selected = null;
            renderAll();
            showStatus(`✓ Cargado: ${data.pasillos.length} pasillos`, '#4ade80');
        } catch {
            showStatus('✗ Archivo no válido', '#f87171');
        }
    };
    reader.readAsText(file);
}

async function importFromDemoData() {
    showStatus('Importando…', '#93c5fd');
    try {
        // Try API ubicaciones first, fall back to datos-demo.json
        let ubis = null;
        try {
            const r = await fetch('../../../localhost:3000/ubicaciones');
            if (r.ok) ubis = await r.json();
        } catch { /* intentional */ }

        if (!ubis) {
            const r = await fetch('./datos/datos-demo.json');
            if (!r.ok) throw new Error('No se encontró datos/datos-demo.json');
            const d = await r.json();
            ubis = d.ubicaciones ?? [];
        }

        if (!ubis.length) throw new Error('Sin datos de ubicaciones');

        const pasillosMap = {};
        for (const u of ubis) {
            const p = u.etiqueta?.match(/P(\d+)/i);
            const x = u.etiqueta?.match(/X(\d+)/i);
            const y = u.etiqueta?.match(/Y(\d+)/i);
            const l = u.etiqueta?.match(/\b([ID])\b/i);
            if (!p || !x || !y) continue;
            const pn = parseInt(p[1]);
            if (!pasillosMap[pn]) pasillosMap[pn] = { numero: pn, maxCol: 0, maxNivel: 0, lados: new Set() };
            pasillosMap[pn].maxCol   = Math.max(pasillosMap[pn].maxCol,   parseInt(x[1]));
            pasillosMap[pn].maxNivel = Math.max(pasillosMap[pn].maxNivel, parseInt(y[1]));
            if (l) pasillosMap[pn].lados.add(l[1].toUpperCase());
        }

        layout.pasillos = Object.values(pasillosMap)
            .sort((a, b) => a.numero - b.numero)
            .map(p => ({ numero: p.numero, columnas: p.maxCol, niveles: p.maxNivel, lados: [...p.lados].sort() }));

        selected = layout.pasillos[0]?.numero ?? null;
        renderAll();
        showStatus(`✓ Importados ${layout.pasillos.length} pasillos desde datos actuales`, '#4ade80');
    } catch (e) {
        showStatus('✗ Error al importar: ' + e.message, '#f87171');
    }
}

function showStatus(msg, color = '#94a3b8') {
    const el = document.getElementById('status-bar');
    el.textContent = msg;
    el.style.color = color;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ''; }, 5000);
}

function syncCfgInputs() {
    document.getElementById('cfg-aw').value = CFG.AW;
    document.getElementById('cfg-ud').value = CFG.UD;
    document.getElementById('cfg-uw').value = CFG.UW;
    document.getElementById('cfg-lh').value = CFG.LH;
}

// ── CANVAS CLICK (seleccionar pasillo) ────────────────────────
canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    if (!layout.pasillos.length) return;

    const { AW, UD, UW, CG } = CFG;
    const PG = 0.5;
    const totalW = layout.pasillos.length * (2 * UD + AW) + (layout.pasillos.length - 1) * PG;
    const maxCols = Math.max(...layout.pasillos.map(p => p.columnas));
    const pad = 32;
    const scaleX = (canvas.width - pad * 2) / totalW;
    const scaleZ = (canvas.height - pad * 2) / (maxCols * (UW + CG) + 2);
    const scale  = Math.min(scaleX, scaleZ, 18);
    const offsetX = (canvas.width - totalW * scale) / 2;

    let curX = 0;
    for (const p of layout.pasillos) {
        const x0 = offsetX + curX * scale;
        const x1 = x0 + (2 * UD + AW) * scale;
        if (mx >= x0 && mx <= x1) {
            selected = selected === p.numero ? null : p.numero;
            renderAll();
            return;
        }
        curX += 2 * UD + AW + PG;
    }
    selected = null;
    renderAll();
});

// ── INIT ──────────────────────────────────────────────────────
function init() {
    // Load saved layout from localStorage
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            layout = { version: data.version ?? 1, pasillos: data.pasillos ?? [] };
            if (data.cfg) { CFG = { ...CFG, ...data.cfg }; syncCfgInputs(); }
            showStatus(`Layout cargado: ${layout.pasillos.length} pasillos`, '#93c5fd');
        } catch { /* ignore */ }
    }

    renderAll();
    resizeCanvas();

    // Add pasillo
    document.getElementById('btn-add').addEventListener('click', () => {
        const nums = layout.pasillos.map(p => p.numero);
        const next = nums.length ? Math.max(...nums) + 1 : 1;
        layout.pasillos.push({ numero: next, columnas: 10, niveles: 5, lados: ['I', 'D'] });
        selected = next;
        renderAll();
        // Scroll to bottom of list
        const list = document.getElementById('pasillo-list');
        list.scrollTop = list.scrollHeight;
    });

    // Import from demo/API data
    document.getElementById('btn-import-demo').addEventListener('click', importFromDemoData);

    // Save
    document.getElementById('btn-save').addEventListener('click', saveLayout);

    // Export
    document.getElementById('btn-export').addEventListener('click', exportLayout);

    // Load file
    document.getElementById('btn-load-file').addEventListener('click', () =>
        document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', e => {
        if (e.target.files[0]) loadFromFile(e.target.files[0]);
        e.target.value = '';
    });

    // CFG inputs
    ['cfg-aw', 'cfg-ud', 'cfg-uw', 'cfg-lh'].forEach(id => {
        document.getElementById(id).addEventListener('change', e => {
            const key = id.replace('cfg-', '').toUpperCase();
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val > 0) { CFG[key] = val; drawCanvas(); }
        });
    });

    window.addEventListener('resize', () => { resizeCanvas(); });
}

init();
