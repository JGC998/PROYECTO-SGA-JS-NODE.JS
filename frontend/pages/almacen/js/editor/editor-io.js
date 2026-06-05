import * as THREE from 'three';
import { UD, AW, LH, UW, CG, PG } from '../shared/configuracion.js';
import { st, _saveEditorState }     from './editor-state.js';
import {
    scene, orbitCtrl, orbitOrtho, perspCam,
    buildMesh, buildFloor, showStatus, createLabel,
} from './editor-core.js';
import {
    deseleccionar, updateObjList,
    syncPropsFromSelected, renderizarAlmacen,
} from './editor-objetos.js';

// ── EXPORTAR CONFIGURACIÓN ────────────────────────────────────
export function exportarConfiguracion() {
    updateConfigFromScene();
    st.config.nombre = document.getElementById('scene-name').value || st.config.nombre;
    const cfg = structuredClone(st.config);
    for (const obj of cfg.objetos) {
        // Strip transient UI-state properties before export
        delete obj._hidden;
        delete obj._outOfBounds;
        delete obj._selected;
        // Enrich shelves with meta.columnas for editor↔viewer fidelity
        if (obj.tipo === 'estanteria') {
            if (!obj.meta) obj.meta = {};
            obj.meta.columnas = Math.max(1, Math.round((obj.dimensiones.ancho - 2) / (UW + CG)));
            obj.meta.niveles  = obj.dimensiones.niveles ?? 5;
        }
    }
    return cfg;
}

// ── DETECCIÓN DE FUERA DE PLANTA ─────────────────────────────
// buildMesh crea materiales por instancia, por lo que mutar emissive en traversal es seguro.
const OOB_EMISSIVE = new THREE.Color(0x7f1d1d);
export function _checkOutOfBounds() {
    const W = st.config.dimensiones?.ancho       ?? 50;
    const D = st.config.dimensiones?.profundidad ?? 30;
    let nOut = 0;
    const tmpBox = new THREE.Box3();
    for (const obj of st.config.objetos) {
        const mesh = st.meshById.get(obj.id);
        if (!mesh) continue;
        tmpBox.setFromObject(mesh);
        const out = tmpBox.min.x < -0.01 || tmpBox.max.x > W + 0.01 ||
                    tmpBox.min.z < -0.01 || tmpBox.max.z > D + 0.01;
        if (out !== !!obj._outOfBounds) {
            obj._outOfBounds = out;
            mesh.traverse(c => {
                if (!c.isMesh || !c.material?.emissive) return;
                if (out) {
                    if (c.userData._oobSaved === undefined) c.userData._oobSaved = c.material.emissive.getHex();
                    c.material.emissive.copy(OOB_EMISSIVE);
                } else if (c.userData._oobSaved !== undefined) {
                    c.material.emissive.setHex(c.userData._oobSaved);
                    delete c.userData._oobSaved;
                }
            });
        }
        if (out) nOut++;
    }
    const elStatus = document.getElementById('ed-status');
    if (!elStatus) return;
    if (nOut > 0) {
        elStatus.textContent = `⚠ ${nOut} objeto(s) sobresalen del suelo (${W}×${D} m) — atravesarán las paredes en el visor`;
        elStatus.style.color = '#fca5a5';
    } else if (elStatus.style.color === 'rgb(252, 165, 165)') {
        elStatus.textContent = '';
        elStatus.style.color = '';
    }
}

// ── SINCRONIZAR CONFIGURACIÓN DESDE ESCENA ────────────────────
export function updateConfigFromScene() {
    for (const obj of st.config.objetos) {
        const mesh = st.meshById.get(obj.id);
        if (!mesh) continue;
        obj.posicion.x = +mesh.position.x.toFixed(3);
        obj.posicion.y = +mesh.position.y.toFixed(3);
        obj.posicion.z = +mesh.position.z.toFixed(3);
        obj.rotacion.y = +((mesh.rotation.y * 180 / Math.PI) % 360).toFixed(2);
    }
    if (st.selectedId) syncPropsFromSelected();
    _checkOutOfBounds();
    _saveEditorState();
}

// ── CONSTRUIR LAYOUT PARA EL VISOR ───────────────────────────
function _buildLayout() {
    const pasilloMap = {};
    for (const obj of st.config.objetos) {
        if (obj.tipo !== 'estanteria') continue;
        const p    = obj.meta?.pasillo;
        const lado = obj.meta?.lado;
        if (!p) continue;
        const cols = obj.meta?.columnas ?? Math.max(1, Math.round((obj.dimensiones.ancho - 2) / (UW + CG)));
        const nivs = obj.meta?.niveles  ?? obj.dimensiones.niveles ?? 5;
        if (!pasilloMap[p]) pasilloMap[p] = { numero: p, columnas: cols, niveles: nivs, lados: [] };
        else {
            pasilloMap[p].columnas = Math.max(pasilloMap[p].columnas, cols);
            pasilloMap[p].niveles  = Math.max(pasilloMap[p].niveles,  nivs);
        }
        if (lado && !pasilloMap[p].lados.includes(lado)) pasilloMap[p].lados.push(lado);
    }
    return { pasillos: Object.values(pasilloMap).sort((a, b) => a.numero - b.numero) };
}

export async function sincronizarConVisor() {
    const layout     = _buildLayout();
    const fullConfig = exportarConfiguracion();
    const r = await fetch('/api/almacen/sync-ubicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pasillos: layout.pasillos, config: fullConfig }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
}

// ── VISTA PREVIA DE STOCK ─────────────────────────────────────
let _stockPreviewActive = false;

export async function toggleStockPreview() {
    if (_stockPreviewActive) {
        st.config.objetos.forEach(o => {
            delete o._stockClass;
            const mesh = st.meshById.get(o.id);
            if (!mesh) return;
            mesh.traverse(c => {
                if (c.isMesh && c.material && c.userData._stockOrigColor !== undefined) {
                    c.material.color.setHex(c.userData._stockOrigColor);
                    delete c.userData._stockOrigColor;
                }
            });
        });
        _stockPreviewActive = false;
        document.getElementById('btn-stock-preview').classList.remove('active');
        updateObjList();
        showStatus('📊 Vista de stock desactivada');
        return;
    }

    showStatus('📊 Cargando datos de stock…');
    try {
        const ts   = `?t=${Date.now()}`;
        const stks = await fetch(`/api/almacen/articulos${ts}`, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null).catch(() => null)
            .then(d => d ?? fetch(`./datos/articulos.json${ts}`, { cache: 'no-store' })
                .then(r => r.ok ? r.json() : []).catch(() => []));

        const stockIdx = {};
        for (const s of stks) {
            const k = s.ubicacion ?? s.STOUBI; if (!k) continue;
            if (!stockIdx[k]) stockIdx[k] = 0;
            stockIdx[k] += Number(s.stock ?? s.STOCAN ?? 0);
        }

        for (const o of st.config.objetos) {
            if (o.tipo !== 'estanteria' || !o.meta?.pasillo) continue;
            const p    = o.meta.pasillo;
            const lado = o.meta.lado ?? 'D';
            const cols = o.meta?.columnas ?? Math.max(1, Math.round(((o.dimensiones?.ancho ?? 1.5) - 2) / (UW + CG)));
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
            o._stockClass = pct === 0 ? 'stock-none' : pct < 0.3 ? 'stock-low' : pct < 0.8 ? 'stock-mid' : 'stock-full';
            const colHex  = pct === 0 ? 0x7f1d1d : pct < 0.3 ? 0x7c2d12 : pct < 0.8 ? 0x713f12 : 0x14532d;

            const mesh = st.meshById.get(o.id);
            if (!mesh) continue;
            mesh.traverse(c => {
                if (c.isMesh && c.material && c.userData._stockOrigColor === undefined) {
                    c.userData._stockOrigColor = c.material.color.getHex();
                    c.material.color.setHex(colHex);
                }
            });
        }

        _stockPreviewActive = true;
        document.getElementById('btn-stock-preview').classList.add('active');
        updateObjList();
        showStatus('📊 Stock: 🟢 alto · 🟡 medio · 🟠 bajo · 🔴 vacío');
    } catch (err) {
        showStatus(`✗ Error al cargar stock: ${err.message}`, true);
    }
}

// ── CARGAR DESDE SERVIDOR (backend/data/distribucion.json vía API) ───────────
export async function cargarDesdeServidor() {
    showStatus('Cargando layout desde servidor…');
    try {
        const ts = `?t=${Date.now()}`;
        let data = null;
        try {
            const r = await fetch(`/api/almacen/load-config${ts}`, { cache: 'no-store' });
            if (r.ok) data = await r.json();
        } catch (_) {}
        if (!data) {
            const r = await fetch(`./datos/distribucion.json${ts}`, { cache: 'no-store' });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            data = await r.json();
        }
        if (!data?.objetos?.length) throw new Error('No hay objetos en el layout guardado');
        renderizarAlmacen(data);
        _saveEditorState();
        showStatus(`✓ Layout cargado desde servidor — ${data.objetos.length} objetos`);
    } catch (err) {
        showStatus(`✗ Error al cargar: ${err.message}`, true);
    }
}

// ── PARSEAR ETIQUETA DE UBICACIÓN ─────────────────────────────
export function _parseUbiEtq(etq) {
    const p = etq.match(/P(\d+)/i), x = etq.match(/X(\d+)/i),
          y = etq.match(/Y(\d+)/i), l = etq.match(/\b([ID])\b/i);
    if (!p || !x || !y) return null;
    return { pasillo: +p[1], lado: l ? l[1].toUpperCase() : 'I', col: +x[1], nivel: +y[1] };
}

// ── IMPORTAR DESDE UBICACIONES (API → fallback JSON estático) ────────────────
export async function importarDesdeUbicaciones() {
    showStatus('Cargando ubicaciones desde servidor…');
    try {
        let ubis = null;
        try {
            const r = await fetch('/api/ubicaciones', { cache: 'no-store' });
            if (r.ok) ubis = await r.json();
        } catch (_) {}
        if (!ubis) {
            const r = await fetch('./datos/ubicaciones.json', { cache: 'no-store' });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            ubis = await r.json();
        }

        const pasillos = {};
        for (const u of ubis) {
            const parsed = _parseUbiEtq(u.etiqueta ?? u.ubicacion ?? '');
            if (!parsed) continue;
            const { pasillo, lado, col, nivel } = parsed;
            if (!pasillos[pasillo]) pasillos[pasillo] = { cols: new Set(), niveles: new Set(), lados: new Set() };
            pasillos[pasillo].cols.add(col);
            pasillos[pasillo].niveles.add(nivel);
            pasillos[pasillo].lados.add(lado);
        }

        const pNums = Object.keys(pasillos).map(Number).sort((a, b) => a - b);
        if (!pNums.length) { showStatus('⚠ No se encontraron pasillos en ubicaciones.json', true); return; }

        st.meshById.forEach(mesh => {
            scene.remove(mesh);
            mesh.traverse(c => {
                if (c.isMesh) {
                    c.geometry?.dispose();
                    const mat = c.material;
                    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(m => { m.map?.dispose(); m.dispose(); });
                }
            });
        });
        st.meshById.clear();
        st.labelById.forEach(lbl => lbl.removeFromParent());
        st.labelById.clear();
        deseleccionar();
        st.config.objetos = [];

        let curX = 0;
        let globalMaxLen = 0;

        for (const p of pNums) {
            const info     = pasillos[p];
            const maxCol   = Math.max(...info.cols);
            const maxNiv   = Math.max(...info.niveles);
            const aisleLen = maxCol * (UW + CG) + 2;
            const bx       = curX;
            globalMaxLen   = Math.max(globalMaxLen, aisleLen);

            const label      = `P${String(p).padStart(3, '0')}`;
            const pasilloId  = `pasillo_${label}`;
            const pasilloX   = bx + UD + AW / 2;
            const pasilloZ   = aisleLen / 2;
            const pasObj = {
                id:          pasilloId,
                tipo:        'pasillo',
                etiqueta:    label,
                posicion:    { x: +pasilloX.toFixed(3), y: 0, z: +pasilloZ.toFixed(3) },
                rotacion:    { y: 0 },
                dimensiones: { longitud: +aisleLen.toFixed(3), ancho: AW, forma: 'recto', longitud2: 0 },
                meta:        { numero: p },
                locked:      false,
            };
            st.config.objetos.push(pasObj);
            const pMesh = buildMesh(pasObj);
            pMesh.position.set(pasObj.posicion.x, 0, pasObj.posicion.z);
            pMesh.rotation.y = 0;
            pMesh.userData.edId = pasilloId;
            pMesh.traverse(c => { c.userData.edId = pasilloId; });
            scene.add(pMesh);
            st.meshById.set(pasilloId, pMesh);
            createLabel(pasilloId, label);

            for (const lado of ['D', 'I']) {
                if (!info.lados.has(lado)) continue;
                const shelfX = lado === 'D' ? bx + UD / 2 : bx + UD + AW + UD / 2;
                const shelfZ = aisleLen / 2;
                const id     = `estanteria_${label}_${lado}`;
                const newObj = {
                    id,
                    tipo:        'estanteria',
                    etiqueta:    `${label} ${lado}`,
                    posicion:    { x: +shelfX.toFixed(3), y: 0, z: +shelfZ.toFixed(3) },
                    rotacion:    { y: 90 },
                    dimensiones: { ancho: +aisleLen.toFixed(3), profundidad: UD, niveles: maxNiv, alturaNivel: LH },
                    meta:        { pasillo: p, lado, segmento: 1 },
                };
                st.config.objetos.push(newObj);
                const mesh = buildMesh(newObj);
                mesh.position.set(newObj.posicion.x, 0, newObj.posicion.z);
                mesh.rotation.y = Math.PI / 2;
                mesh.userData.edId = id;
                mesh.traverse(c => { c.userData.edId = id; });
                scene.add(mesh);
                st.meshById.set(id, mesh);
                createLabel(id, newObj.etiqueta);
            }

            curX += UD + AW + UD + PG;
        }

        const totalW = curX + 6;
        const totalD = globalMaxLen + 6;
        st.config.dimensiones.ancho       = Math.ceil(totalW);
        st.config.dimensiones.profundidad = Math.ceil(totalD);
        st.config.nombre = 'Almacén importado';
        document.getElementById('scene-w').value    = st.config.dimensiones.ancho;
        document.getElementById('scene-d').value    = st.config.dimensiones.profundidad;
        document.getElementById('scene-name').value = st.config.nombre;

        buildFloor();
        updateObjList();

        const cx = st.config.dimensiones.ancho / 2;
        const cz = st.config.dimensiones.profundidad / 2;
        orbitCtrl.target.set(cx, 0, cz);
        orbitOrtho.target.set(cx, 0, cz);
        perspCam.position.set(cx, Math.max(totalW, totalD) * 0.8, cz - Math.max(totalW, totalD) * 0.6);

        showStatus(`✓ ${st.config.objetos.length} estanterías cargadas (${pNums.length} pasillos)`);
    } catch (err) {
        showStatus(`✗ Error al importar: ${err.message}`, true);
    }
}
