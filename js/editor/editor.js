// ── PUNTO DE ENTRADA DEL EDITOR ──────────────────────────────
// Carga todos los módulos e instala los manejadores de eventos DOM,
// teclado y TransformControls. Ningún otro módulo importa este archivo.

import { st, pushHistory, EDITOR_STATE_KEY, EDITOR_STATE_VER, _saveEditorState } from './editor-state.js';
import {
    canvas, raycaster, mouse2d, _floorPlane, _coordHit,
    transformCtrl, orbitCtrl, orbitOrtho,
    snap, _clampToBoundsMesh,
    _clearGuides, _updateGuides,
    getCamera, switchCamera, setTransformMode,
    onResize, animate, showStatus, buildFloor,
    updateLabelText,
} from './editor-core.js';
import {
    añadirObjeto, eliminarObjeto, duplicarObjeto,
    toggleLock,
    rebuildMesh,
    seleccionar, seleccionarAdicional, deseleccionarTodo,
    syncPropsFromSelected, _dimSpecOf,
    updateObjList, renderizarAlmacen,
    _toggleHidden,
} from './editor-objetos.js';
import {
    sincronizarEstanteriasAncladas, autoRellenarPasilloIDe,
    _calcShelfPoseFromPasillo, _aplicarPoseAEstanteria,
    alignToGrid, añadirPasilloCompleto, repararPasillos, unirPasillos,
    _onPasilloDimChange, tryLivePasilloSnap,
} from './editor-pasillos.js';
import { cargarCatalogoERP } from './editor-erp.js';
import {
    exportarConfiguracion, updateConfigFromScene,
    sincronizarConVisor, toggleStockPreview, cargarDesdeServidor,
} from './editor-io.js';
// editor-erp.js se importa arriba y su inicialización registra el callback ERP automáticamente.

// ── MANEJADOR DE CLIC EN CANVAS ───────────────────────────────
function onCanvasClick(e) {
    if (transformCtrl.dragging) return;

    const rect = canvas.getBoundingClientRect();
    mouse2d.x  = ((e.clientX - rect.left)  / rect.width)  * 2 - 1;
    mouse2d.y  = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse2d, getCamera());

    const hits = raycaster.intersectObjects([...st.meshById.values()], true);
    if (hits.length) {
        let hit = hits[0].object;
        while (hit && !hit.userData.edId) hit = hit.parent;
        if (hit?.userData.edId) {
            if (e.shiftKey) seleccionarAdicional(hit.userData.edId);
            else            seleccionar(hit.userData.edId);
            return;
        }
    }
    deseleccionarTodo();
}

canvas.addEventListener('click', onCanvasClick);

// ── COORDENADAS DEL RATÓN SOBRE EL SUELO ─────────────────────
const _coordEl = document.getElementById('ed-coords-hud');
canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse2d.x  = ((e.clientX - rect.left)  / rect.width)  * 2 - 1;
    mouse2d.y  = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse2d, getCamera());
    if (raycaster.ray.intersectPlane(_floorPlane, _coordHit))
        _coordEl.textContent = `X ${_coordHit.x.toFixed(1).padStart(6)}  Z ${_coordHit.z.toFixed(1).padStart(6)}`;
});

// ── TRANSFORM CONTROLS ────────────────────────────────────────
transformCtrl.addEventListener('dragging-changed', e => {
    orbitCtrl.enabled  = !e.value;
    orbitOrtho.enabled = !e.value;
    if (e.value && st.selectedIds.size > 1) {
        const primary = transformCtrl.object;
        st._multiDragStart = { px: primary.position.x, pz: primary.position.z, others: new Map() };
        st.selectedIds.forEach(id => {
            if (id === st.selectedId) return;
            const m = st.meshById.get(id);
            if (m) st._multiDragStart.others.set(id, { x: m.position.x, z: m.position.z });
        });
    } else {
        st._multiDragStart = null;
        _clearGuides();
    }
});

transformCtrl.addEventListener('objectChange', () => {
    const obj = transformCtrl.object;
    if (!obj) return;

    if (st.transformMode === 'translate') {
        obj.position.x = snap(obj.position.x);
        obj.position.z = snap(obj.position.z);
        obj.position.y = 0;
        if (st._multiDragStart && st.selectedIds.size > 1) {
            const dx = obj.position.x - st._multiDragStart.px;
            const dz = obj.position.z - st._multiDragStart.pz;
            st._multiDragStart.others.forEach((start, id) => {
                const m = st.meshById.get(id);
                if (m) { m.position.x = snap(start.x + dx); m.position.z = snap(start.z + dz); }
            });
        }

        // Snap magnético espalda-con-espalda en tiempo real (después del grid-snap)
        const _liveEd = obj.userData?.edId;
        const _liveCfg = _liveEd ? st.config.objetos.find(o => o.id === _liveEd) : null;
        if (_liveCfg?.tipo === 'pasillo') {
            const _s = tryLivePasilloSnap(_liveCfg, obj.position.x, obj.position.z);
            if (_s) {
                obj.position.x += _s.dx;
                obj.position.z += _s.dz;
                st._multiDragStart?.others.forEach((_, id) => {
                    const m = st.meshById.get(id);
                    if (m) { m.position.x += _s.dx; m.position.z += _s.dz; }
                });
            }
        }

        _updateGuides(obj);
        _clampToBoundsMesh(obj);
        if (st._multiDragStart && st.selectedIds.size > 1) {
            st._multiDragStart.others.forEach((_, id) => {
                const m = st.meshById.get(id);
                if (m) _clampToBoundsMesh(m);
            });
        }
    }
    if (st.transformMode === 'rotate') {
        if (st.ROT_SNAP > 0) {
            const step = st.ROT_SNAP * Math.PI / 180;
            obj.rotation.y = Math.round(obj.rotation.y / step) * step;
        }
        obj.rotation.x = 0; obj.rotation.z = 0;
    }
    if (st.transformMode === 'scale') {
        obj.scale.x = Math.max(0.1, obj.scale.x);
        obj.scale.z = Math.max(0.1, obj.scale.z);
        obj.scale.y = 1;
    }

    syncPropsFromSelected();
    updateConfigFromScene();

    const ed = obj.userData?.edId;
    if (ed) {
        const cfg = st.config.objetos.find(o => o.id === ed);
        if (cfg?.tipo === 'pasillo') sincronizarEstanteriasAncladas(cfg);
    }
});

// ── PANEL DE PROPIEDADES ──────────────────────────────────────
document.getElementById('prop-label').addEventListener('change', e => {
    if (!st.selectedId) return;
    const cfgObj = st.config.objetos.find(o => o.id === st.selectedId);
    if (cfgObj) {
        cfgObj.etiqueta = e.target.value;
        updateLabelText(st.selectedId, e.target.value);
        updateObjList();
        _saveEditorState();
    }
});

document.getElementById('prop-x').addEventListener('change', e => {
    if (!st.selectedId) return;
    const mesh = st.meshById.get(st.selectedId);
    if (mesh) { mesh.position.x = snap(+e.target.value); _clampToBoundsMesh(mesh); updateConfigFromScene(); }
});

document.getElementById('prop-z').addEventListener('change', e => {
    if (!st.selectedId) return;
    const mesh = st.meshById.get(st.selectedId);
    if (mesh) { mesh.position.z = snap(+e.target.value); _clampToBoundsMesh(mesh); updateConfigFromScene(); }
});

document.getElementById('prop-roty').addEventListener('change', e => {
    if (!st.selectedId) return;
    const mesh = st.meshById.get(st.selectedId);
    if (mesh) {
        const raw = +e.target.value;
        const deg = st.ROT_SNAP > 0 ? Math.round(raw / st.ROT_SNAP) * st.ROT_SNAP : raw;
        e.target.value = deg;
        mesh.rotation.y = deg * Math.PI / 180;
        mesh.rotation.x = 0; mesh.rotation.z = 0;
        updateConfigFromScene();
        const cfgObj = st.config.objetos.find(o => o.id === st.selectedId);
        if (cfgObj?.tipo === 'pasillo') sincronizarEstanteriasAncladas(cfgObj);
    }
});

// Dimensiones rápidas genéricas (Largo / Ancho)
['prop-dim-a', 'prop-dim-b'].forEach((id, idx) => {
    document.getElementById(id).addEventListener('change', () => {
        if (!st.selectedId) return;
        const cfgObj = st.config.objetos.find(o => o.id === st.selectedId);
        if (!cfgObj) return;
        const dimSpec = _dimSpecOf(cfgObj.tipo);
        if (!dimSpec) return;
        const field = idx === 0 ? dimSpec.a : dimSpec.b;
        const val   = +document.getElementById(id).value;
        if (isNaN(val) || val <= 0) return;
        cfgObj.dimensiones[field] = val;
        rebuildMesh(st.selectedId);
        if (cfgObj.tipo === 'pasillo') sincronizarEstanteriasAncladas(cfgObj);
        syncPropsFromSelected();
    });
});

// Dimensiones estantería
['dim-ancho','dim-prof','dim-niveles','dim-altnivel'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
        if (!st.selectedId) return;
        const cfgObj = st.config.objetos.find(o => o.id === st.selectedId);
        if (!cfgObj) return;
        cfgObj.dimensiones.ancho       = +document.getElementById('dim-ancho').value;
        cfgObj.dimensiones.profundidad = +document.getElementById('dim-prof').value;
        cfgObj.dimensiones.niveles     = +document.getElementById('dim-niveles').value;
        cfgObj.dimensiones.alturaNivel = +document.getElementById('dim-altnivel').value;
        rebuildMesh(st.selectedId);
    });
});

// Dimensiones pared
['dim-pared-w','dim-pared-h'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
        if (!st.selectedId) return;
        const cfgObj = st.config.objetos.find(o => o.id === st.selectedId);
        if (!cfgObj) return;
        cfgObj.dimensiones.ancho = +document.getElementById('dim-pared-w').value;
        cfgObj.dimensiones.alto  = +document.getElementById('dim-pared-h').value;
        rebuildMesh(st.selectedId);
    });
});

// Dimensiones zona
['dim-zona-w','dim-zona-d'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
        if (!st.selectedId) return;
        const cfgObj = st.config.objetos.find(o => o.id === st.selectedId);
        if (!cfgObj) return;
        cfgObj.dimensiones.ancho       = +document.getElementById('dim-zona-w').value;
        cfgObj.dimensiones.profundidad = +document.getElementById('dim-zona-d').value;
        rebuildMesh(st.selectedId);
    });
});

document.getElementById('rot-snap-select').addEventListener('change', e => { st.ROT_SNAP = +e.target.value; });

// ── PROPIEDADES DE PASILLO ────────────────────────────────────
['dim-pas-long','dim-pas-ancho','dim-pas-long2'].forEach(id => {
    document.getElementById(id).addEventListener('change', _onPasilloDimChange);
});
document.getElementById('dim-pas-forma').addEventListener('change', _onPasilloDimChange);

document.getElementById('dim-pas-num').addEventListener('change', e => {
    if (!st.selectedId) return;
    const cfgObj = st.config.objetos.find(o => o.id === st.selectedId);
    if (!cfgObj || cfgObj.tipo !== 'pasillo') return;
    const nuevo = parseInt(e.target.value, 10);
    if (isNaN(nuevo) || nuevo < 1) { e.target.value = cfgObj.meta?.numero ?? ''; return; }
    const viejo = cfgObj.meta?.numero;
    if (viejo === nuevo) return;

    const conflict = st.config.objetos.some(o =>
        o.tipo === 'pasillo' && o.id !== cfgObj.id && o.meta?.numero === nuevo);
    if (conflict) {
        showStatus(`⚠ Ya existe un pasillo P${String(nuevo).padStart(3,'0')}. Elige otro número.`, true);
        e.target.value = viejo ?? '';
        return;
    }

    if (viejo) {
        for (const o of st.config.objetos)
            if (o.tipo === 'estanteria' && o.meta?.pasillo === viejo) o.meta.pasillo = nuevo;
    }
    cfgObj.meta = { ...(cfgObj.meta ?? {}), numero: nuevo };
    cfgObj.etiqueta = `P${String(nuevo).padStart(3, '0')}`;
    updateLabelText(st.selectedId, cfgObj.etiqueta);
    sincronizarEstanteriasAncladas(cfgObj);
    updateObjList();
    _saveEditorState();
    showStatus(`Pasillo renumerado a P${String(nuevo).padStart(3, '0')}`);
});

document.getElementById('btn-pasillo-fill').addEventListener('click', autoRellenarPasilloIDe);

// Anclar estantería a pasillo
document.getElementById('anclar-pasillo').addEventListener('change', e => {
    if (!st.selectedId) return;
    const cfgObj = st.config.objetos.find(o => o.id === st.selectedId);
    if (!cfgObj || cfgObj.tipo !== 'estanteria') return;
    const val = e.target.value;
    pushHistory();
    if (!val) {
        if (cfgObj.meta) { delete cfgObj.meta.pasillo; delete cfgObj.meta.lado; delete cfgObj.meta.segmento; }
        document.getElementById('meta-pasillo').value = '';
        document.getElementById('meta-lado-i').classList.remove('active');
        document.getElementById('meta-lado-d').classList.remove('active');
        _saveEditorState();
        updateObjList();
        showStatus('Desanclado');
        return;
    }
    const [numStr, lado, segStr] = val.split('|');
    const num     = +numStr, seg = +segStr;
    const pasillo = st.config.objetos.find(o => o.tipo === 'pasillo' && o.meta?.numero === num);
    if (!pasillo) return;
    cfgObj.meta = { ...(cfgObj.meta ?? {}), pasillo: num, lado, segmento: seg };
    const pose = _calcShelfPoseFromPasillo(pasillo, lado, seg);
    _aplicarPoseAEstanteria(cfgObj, pose);
    syncPropsFromSelected();
    showStatus(`Anclada a P${String(num).padStart(3,'0')} · ${lado} · Seg.${seg}`);
});

// Meta pasillo/lado manual
document.getElementById('meta-pasillo').addEventListener('change', e => {
    if (!st.selectedId) return;
    const cfgObj = st.config.objetos.find(o => o.id === st.selectedId);
    if (!cfgObj) return;
    if (!cfgObj.meta) cfgObj.meta = {};
    const v = parseInt(e.target.value, 10);
    cfgObj.meta.pasillo = isNaN(v) || v < 1 ? undefined : v;
    updateConfigFromScene();
});

['meta-lado-i', 'meta-lado-d'].forEach(btnId => {
    document.getElementById(btnId).addEventListener('click', () => {
        if (!st.selectedId) return;
        const cfgObj = st.config.objetos.find(o => o.id === st.selectedId);
        if (!cfgObj) return;
        if (!cfgObj.meta) cfgObj.meta = {};
        cfgObj.meta.lado = btnId === 'meta-lado-i' ? 'I' : 'D';
        document.getElementById('meta-lado-i').classList.toggle('active', cfgObj.meta.lado === 'I');
        document.getElementById('meta-lado-d').classList.toggle('active', cfgObj.meta.lado === 'D');
        updateConfigFromScene();
    });
});

document.getElementById('btn-delete').addEventListener('click', () => { if (st.selectedId) eliminarObjeto(st.selectedId); });

// ── BOTONES DE CATÁLOGO ───────────────────────────────────────
document.querySelectorAll('.cat-btn[data-tipo]').forEach(btn => {
    btn.addEventListener('click', () => añadirObjeto(btn.dataset.tipo));
});

// ── CÁMARA / MODO ─────────────────────────────────────────────
document.getElementById('btn-cam-persp').addEventListener('click', () => switchCamera('persp'));
document.getElementById('btn-cam-ortho').addEventListener('click', () => switchCamera('ortho'));
document.getElementById('btn-mode-translate').addEventListener('click', () => setTransformMode('translate'));
document.getElementById('btn-mode-rotate').addEventListener('click',    () => setTransformMode('rotate'));
document.getElementById('btn-mode-scale').addEventListener('click',     () => setTransformMode('scale'));
setTransformMode('translate');

document.getElementById('snap-input').addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v > 0) { st.GRID_SNAP = v; buildFloor(); }
});

// ── ESCENA (dimensiones) ──────────────────────────────────────
document.getElementById('btn-scene-update').addEventListener('click', () => {
    st.config.dimensiones.ancho       = +document.getElementById('scene-w').value || 50;
    st.config.dimensiones.profundidad = +document.getElementById('scene-d').value || 30;
    st.config.nombre = document.getElementById('scene-name').value || st.config.nombre;
    buildFloor();
    showStatus('✓ Planta actualizada');
});

// ── BOTONES DE HERRAMIENTAS ───────────────────────────────────
document.getElementById('btn-align-grid').addEventListener('click', alignToGrid);
document.getElementById('btn-lock-obj').addEventListener('click', () => { if (st.selectedId) toggleLock(st.selectedId); });
document.getElementById('btn-stock-preview').addEventListener('click', toggleStockPreview);
document.getElementById('btn-add-pasillo').addEventListener('click', añadirPasilloCompleto);
document.getElementById('btn-unir-pasillos')?.addEventListener('click', unirPasillos);
document.getElementById('btn-reparar-pasillos').addEventListener('click', repararPasillos);

// ── UNDO / REDO ───────────────────────────────────────────────
document.getElementById('btn-undo').addEventListener('click', () => {
    if (!st.history.length) return;
    st.redoStack.push(structuredClone(st.config));
    renderizarAlmacen(st.history.pop());
    showStatus('↩ Deshecho');
});

document.getElementById('btn-redo').addEventListener('click', () => {
    if (!st.redoStack.length) return;
    st.history.push(structuredClone(st.config));
    renderizarAlmacen(st.redoStack.pop());
    showStatus('↪ Rehecho');
});

// ── GUARDAR / CARGAR / EXPORTAR ───────────────────────────────
document.getElementById('btn-save-api').addEventListener('click', async () => {
    showStatus('Guardando…');
    try {
        const result = await sincronizarConVisor();
        showStatus(`✓ Guardado — ${result.ubicaciones} ubicaciones · recarga el visor para ver los cambios`);
    } catch (err) {
        showStatus(`✗ Error al guardar: ${err.message}`, true);
    }
});

document.getElementById('btn-load-server').addEventListener('click', cargarDesdeServidor);

document.getElementById('btn-load-api').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!data?.objetos) throw new Error('JSON no es un layout válido');
            renderizarAlmacen(data);
        } catch (err) {
            showStatus(`✗ Error al cargar: ${err.message}`, true);
        }
    });
    input.click();
});

document.getElementById('btn-export').addEventListener('click', () => {
    const data = exportarConfiguracion();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `layout-${data.nombre.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showStatus('✓ JSON exportado');
});

// ── TECLADO ───────────────────────────────────────────────────
function _nudgeSelection(dx, dz) {
    if (!st.selectedIds.size) return;
    pushHistory();
    for (const id of [...st.selectedIds]) {
        const cfgObj = st.config.objetos.find(o => o.id === id);
        if (cfgObj?.locked) continue;
        const mesh = st.meshById.get(id);
        if (!mesh) continue;
        mesh.position.x = snap(mesh.position.x + dx);
        mesh.position.z = snap(mesh.position.z + dz);
        _clampToBoundsMesh(mesh);
        if (cfgObj?.tipo === 'pasillo') sincronizarEstanteriasAncladas(cfgObj);
    }
    updateConfigFromScene();
}

function _rotateSelectionDeg(delta) {
    if (!st.selectedId) return;
    const cfgObj = st.config.objetos.find(o => o.id === st.selectedId);
    if (cfgObj?.locked) { showStatus('⚠ Objeto bloqueado', true); return; }
    const mesh = st.meshById.get(st.selectedId);
    if (!mesh) return;
    pushHistory();
    let deg = (mesh.rotation.y * 180 / Math.PI) + delta;
    deg = st.ROT_SNAP > 0 ? Math.round(deg / st.ROT_SNAP) * st.ROT_SNAP : deg;
    while (deg > 180)  deg -= 360;
    while (deg <= -180) deg += 360;
    mesh.rotation.y = deg * Math.PI / 180;
    mesh.rotation.x = 0; mesh.rotation.z = 0;
    updateConfigFromScene();
    if (cfgObj?.tipo === 'pasillo') sincronizarEstanteriasAncladas(cfgObj);
}

document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.selectedIds.size > 0) {
            const ids = [...st.selectedIds];
            deseleccionarTodo();
            ids.forEach(id => eliminarObjeto(id));
        }
    }
    if (e.key === 'Escape')  deseleccionarTodo();
    if (e.key === 'g' || e.key === 'G') setTransformMode('translate');
    if (e.key === 'r' || e.key === 'R') setTransformMode('rotate');
    if (e.key === 's' || e.key === 'S') setTransformMode('scale');
    if (e.key === 'p' || e.key === 'P') switchCamera('persp');
    if (e.key === 'o' || e.key === 'O') switchCamera('ortho');
    if ((e.key === 'q' || e.key === 'Q') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); _rotateSelectionDeg(-90); }
    if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); _rotateSelectionDeg(+90); }
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); alignToGrid(); }
    if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (st.selectedId) _toggleHidden(st.selectedId);
    }

    const ARR = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (ARR[e.key]) {
        e.preventDefault();
        const mult   = e.shiftKey ? 10 : 1;
        const [sx, sz] = ARR[e.key];
        _nudgeSelection(sx * st.GRID_SNAP * mult, sz * st.GRID_SNAP * mult);
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); document.getElementById('btn-undo').click(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); document.getElementById('btn-redo').click(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (st.selectedIds.size > 1) {
            const ids = [...st.selectedIds];
            deseleccionarTodo();
            ids.forEach(id => duplicarObjeto(id));
        } else if (st.selectedId) {
            duplicarObjeto(st.selectedId);
        }
    }
});

// ── RESIZE ────────────────────────────────────────────────────
window.addEventListener('resize', onResize);
onResize();

// ── LOOP ──────────────────────────────────────────────────────
animate();

// ── INICIALIZACIÓN ────────────────────────────────────────────
(async function _init() {
    cargarCatalogoERP();
    try {
        const saved = localStorage.getItem(EDITOR_STATE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed?._v === EDITOR_STATE_VER && parsed?.objetos?.length) {
                renderizarAlmacen(parsed);
                showStatus('✓ Estado restaurado');
                return;
            }
        }
    } catch { /* ignorar */ }
    // Fallback: cargar desde distribucion.json si existe
    try {
        const r = await fetch('./datos/distribucion.json');
        if (r.ok) {
            const data = await r.json();
            if (data?.objetos?.length) { renderizarAlmacen(data); showStatus('✓ Layout cargado desde distribucion.json'); return; }
        }
    } catch { /* ignorar */ }
    showStatus('Almacén vacío — añade objetos del catálogo');
})();
