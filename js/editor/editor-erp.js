import { UD, AW, LH, UW, CG, PG } from '../shared/configuracion.js';
import { st }                       from './editor-state.js';
import { snap, showStatus }         from './editor-core.js';
import {
    añadirObjeto, seleccionar, registerErpCallback,
} from './editor-objetos.js';
import { _calcShelfPoseFromPasillo } from './editor-pasillos.js';

// ── CATÁLOGO ERP ──────────────────────────────────────────────
let _erpCatalog  = [];           // [{ pasillo, lado, maxCol, maxNiv }, ...]
const _erpExpanded = new Set(); // pasillos con grupo abierto

function _erpIsPlaced(pas, lado) {
    return st.config.objetos.some(o =>
        o.tipo === 'estanteria' && o.meta?.pasillo === pas && o.meta?.lado === lado);
}

export async function cargarCatalogoERP() {
    try {
        const r = await fetch('./datos/ubicaciones.json', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const ubis = await r.json();
        const agrup = new Map();
        for (const u of ubis) {
            const parsed = _parseUbiEtqERP(u.etiqueta ?? u.ubicacion ?? '');
            if (!parsed) continue;
            const k   = `${parsed.pasillo}|${parsed.lado}`;
            const cur = agrup.get(k) ?? { pasillo: parsed.pasillo, lado: parsed.lado, maxCol: 0, maxNiv: 0 };
            cur.maxCol = Math.max(cur.maxCol, parsed.col);
            cur.maxNiv = Math.max(cur.maxNiv, parsed.nivel);
            agrup.set(k, cur);
        }
        _erpCatalog = [...agrup.values()].sort((a, b) => a.pasillo - b.pasillo || a.lado.localeCompare(b.lado));
        updateErpCatalogUI();
        showStatus(`📋 Catálogo ERP: ${_erpCatalog.length} estanterías`);
    } catch (e) {
        document.getElementById('erp-catalog-section').style.display = 'none';
        console.warn('No se pudo cargar ubicaciones.json:', e);
    }
}

function _parseUbiEtqERP(etq) {
    const p = etq.match(/P(\d+)/i), x = etq.match(/X(\d+)/i),
          y = etq.match(/Y(\d+)/i), l = etq.match(/\b([ID])\b/i);
    if (!p || !x || !y) return null;
    return { pasillo: +p[1], lado: l ? l[1].toUpperCase() : 'I', col: +x[1], nivel: +y[1] };
}

export function updateErpCatalogUI() {
    const sec = document.getElementById('erp-catalog-section');
    if (!_erpCatalog.length) { sec.style.display = 'none'; return; }
    sec.style.display = 'block';

    const filtro = (document.getElementById('erp-filter')?.value ?? '').toUpperCase().trim();
    const placed = _erpCatalog.filter(e => _erpIsPlaced(e.pasillo, e.lado)).length;
    document.getElementById('erp-catalog-count').textContent = `(${placed} / ${_erpCatalog.length})`;

    const grupos = new Map();
    for (const e of _erpCatalog) {
        if (filtro) {
            const id = `P${String(e.pasillo).padStart(3,'0')} ${e.lado}`;
            if (!id.includes(filtro)) continue;
        }
        if (!grupos.has(e.pasillo)) grupos.set(e.pasillo, []);
        grupos.get(e.pasillo).push(e);
    }

    const list = document.getElementById('erp-catalog-list');
    list.innerHTML = [...grupos.entries()].map(([pas, items]) => {
        const expanded = _erpExpanded.has(pas);
        const lbl      = `P${String(pas).padStart(3,'0')}`;
        const np       = items.filter(it => _erpIsPlaced(it.pasillo, it.lado)).length;
        const rows     = items.map(it => {
            const placed = _erpIsPlaced(it.pasillo, it.lado);
            const cls    = placed ? 'green' : 'blue';
            const dims   = `${it.maxCol}c×${it.maxNiv}n`;
            return `<div class="erp-item ${cls}" data-pas="${it.pasillo}" data-lado="${it.lado}" title="Click para ${placed ? 'localizar' : 'añadir'} · ${dims}">
                <span class="erp-dot"></span>
                <span class="erp-item-label">${lbl} ${it.lado}</span>
                <span class="erp-item-action">${placed ? '✓' : '+'}</span>
            </div>`;
        }).join('');
        return `<div class="erp-pas">
            <div class="erp-pas-head" data-pas-head="${pas}">
                <span>${expanded ? '▼' : '▶'}</span><span>${lbl}</span>
                <span class="erp-pas-count">${np}/${items.length}</span>
            </div>
            <div class="erp-pas-items ${expanded ? '' : 'hidden'}">${rows}</div>
        </div>`;
    }).join('') || '<div style="color:var(--text3);padding:8px">Sin resultados</div>';

    list.querySelectorAll('.erp-pas-head').forEach(el => {
        el.addEventListener('click', () => {
            const p = +el.dataset.pasHead;
            if (_erpExpanded.has(p)) _erpExpanded.delete(p); else _erpExpanded.add(p);
            updateErpCatalogUI();
        });
    });
    list.querySelectorAll('.erp-item').forEach(el => {
        el.addEventListener('click', () => _erpItemClicked(+el.dataset.pas, el.dataset.lado));
    });
}

function _erpItemClicked(pas, lado) {
    const existing = st.config.objetos.find(o =>
        o.tipo === 'estanteria' && o.meta?.pasillo === pas && o.meta?.lado === lado);
    if (existing) { seleccionar(existing.id); return; }

    let pasilloObj = st.config.objetos.find(o => o.tipo === 'pasillo' && o.meta?.numero === pas);
    const catEntry = _erpCatalog.find(c => c.pasillo === pas && c.lado === lado);
    const maxCol   = catEntry?.maxCol ?? 14;
    const maxNiv   = catEntry?.maxNiv ?? 5;
    const aisleLen = +(maxCol * (UW + CG) + 2).toFixed(3);

    if (!pasilloObj) {
        const otros = st.config.objetos.filter(o => o.tipo === 'pasillo');
        const px    = otros.length
            ? Math.max(...otros.map(o => o.posicion.x)) + UD + AW + UD + PG
            : st.config.dimensiones.ancho / 2;
        const pz = st.config.dimensiones.profundidad / 2;
        const pid = añadirObjeto('pasillo', {
            etiqueta:    `P${String(pas).padStart(3, '0')}`,
            posicion:    { x: snap(px), y: 0, z: snap(pz) },
            rotacion:    { y: 0 },
            dimensiones: { longitud: aisleLen, ancho: AW, forma: 'recto', longitud2: 0 },
            meta:        { numero: pas },
        });
        pasilloObj = st.config.objetos.find(o => o.id === pid);
    }

    const pose = _calcShelfPoseFromPasillo(pasilloObj, lado, 1);
    añadirObjeto('estanteria', {
        etiqueta:    `P${String(pas).padStart(3, '0')} ${lado}`,
        posicion:    { x: pose.x, y: 0, z: pose.z },
        rotacion:    { y: pose.rotY },
        dimensiones: { ancho: pose.ancho, profundidad: UD, niveles: maxNiv, alturaNivel: LH },
        meta:        { pasillo: pas, lado, segmento: 1 },
    });
    updateErpCatalogUI();
    showStatus(`+ P${String(pas).padStart(3, '0')} ${lado} añadido`);
}

// Registrar la función de actualización en editor-objetos para que
// updateObjList() pueda llamarla sin importar este módulo directamente.
registerErpCallback(updateErpCatalogUI);

document.getElementById('btn-erp-reload')?.addEventListener('click', cargarCatalogoERP);
document.getElementById('erp-filter')?.addEventListener('input', updateErpCatalogUI);
