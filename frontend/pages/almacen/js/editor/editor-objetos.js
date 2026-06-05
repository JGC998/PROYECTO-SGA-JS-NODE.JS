import * as THREE from 'three';
import { UD, AW, LH }    from '../shared/configuracion.js';
import { st, TIPO_META, pushHistory, _saveEditorState } from './editor-state.js';
import {
    scene, transformCtrl,
    buildMesh, buildFloor,
    createLabel, removeLabel, updateLabelText, updateLabelLock,
    snap, _applyHighlight, _removeHighlight,
    SEL_EMISSIVE, MULTISEL_EMISSIVE,
    showStatus,
} from './editor-core.js';

// ── CALLBACK ERP (evita import circular con editor-erp.js) ────
let _erpCallback = null;
export function registerErpCallback(fn) { _erpCallback = fn; }

// ── HELPERS ───────────────────────────────────────────────────
export function _nextPasilloNum() {
    const pasObj = new Set();
    for (const o of st.config.objetos) {
        if (o.tipo === 'pasillo' && o.meta?.numero) pasObj.add(o.meta.numero);
    }
    const huerfanos = new Set();
    for (const o of st.config.objetos) {
        if (o.tipo === 'estanteria' && o.meta?.pasillo && !pasObj.has(o.meta.pasillo))
            huerfanos.add(o.meta.pasillo);
    }
    if (huerfanos.size > 0) return Math.min(...huerfanos);
    let n = 1;
    while (pasObj.has(n)) n++;
    return n;
}

function _autoLabel(src) {
    const etq = src.etiqueta;

    if (src.tipo === 'pasillo') {
        const nextP = _nextPasilloNum();
        return { etiqueta: `P${String(nextP).padStart(3, '0')}`, meta: { ...src.meta, numero: nextP } };
    }

    const mP = etq.match(/^(P)(\d+)(\s+[ID]\b.*)$/i);
    if (mP && src.tipo === 'estanteria') {
        const usados = new Set(
            st.config.objetos.filter(o => o.tipo === 'estanteria' && o.meta?.pasillo).map(o => o.meta.pasillo)
        );
        let nextP = (src.meta?.pasillo ?? +mP[2]) + 1;
        while (usados.has(nextP)) nextP++;
        return { etiqueta: `${mP[1]}${String(nextP).padStart(mP[2].length, '0')}${mP[3]}`, meta: { ...src.meta, pasillo: nextP } };
    }

    const mN = etq.match(/^(.*?)(\d+)(\s*)$/);
    if (mN) {
        const next = String(+mN[2] + 1).padStart(mN[2].length, '0');
        return { etiqueta: `${mN[1]}${next}${mN[3]}` };
    }

    return { etiqueta: etq + ' 2' };
}

export function _objFueraDePlanta(o) {
    const mesh = st.meshById.get(o.id);
    if (!mesh) return false;
    const box = new THREE.Box3().setFromObject(mesh);
    const W = st.config.dimensiones.ancho, D = st.config.dimensiones.profundidad;
    const tol = 0.05;
    return box.min.x < -tol || box.max.x > W + tol || box.min.z < -tol || box.max.z > D + tol;
}

// ── AÑADIR / ELIMINAR / DUPLICAR ─────────────────────────────
export function añadirObjeto(tipo, opts = {}) {
    pushHistory();

    const id  = `${tipo}_${String(st.nextId++).padStart(3, '0')}`;
    const cx  = st.config.dimensiones.ancho      / 2;
    const cz  = st.config.dimensiones.profundidad / 2;

    const defDim = {
        estanteria:   { ancho: 1.5,  profundidad: 0.85, niveles: 5, alturaNivel: 1.1 },
        pasillo:      { longitud: 8.0, ancho: AW, forma: 'recto', longitud2: 4.0 },
        pared:        { ancho: 8.0,  alto: 5.0 },
        zona_carga:   { ancho: 8.0,  profundidad: 5.0 },
        zona_oficina: { ancho: 6.0,  profundidad: 4.0 },
        columna:      {},
        puerta:       { ancho: 3.0,  alto: 4.0 },
    }[tipo] ?? {};

    let metaInit = { ...(opts.meta ?? {}) };
    if (tipo === 'pasillo' && !metaInit.numero) metaInit.numero = _nextPasilloNum();

    const defaultEtq = tipo === 'pasillo'
        ? `P${String(metaInit.numero).padStart(3, '0')}`
        : `${TIPO_META[tipo]?.label ?? tipo} ${st.nextId - 1}`;

    const newObj = {
        id,
        tipo,
        etiqueta: opts.etiqueta ?? defaultEtq,
        posicion: opts.posicion ?? { x: snap(cx), y: 0, z: snap(cz) },
        rotacion: opts.rotacion ?? { y: 0 },
        dimensiones: { ...defDim, ...(opts.dimensiones ?? {}) },
        meta: metaInit,
        locked: false,
    };

    st.config.objetos.push(newObj);

    const mesh = buildMesh(newObj);
    mesh.position.set(newObj.posicion.x, newObj.posicion.y ?? 0, newObj.posicion.z);
    mesh.rotation.y = (newObj.rotacion.y ?? 0) * Math.PI / 180;
    mesh.userData.edId = id;
    mesh.traverse(c => { c.userData.edId = id; });
    scene.add(mesh);
    st.meshById.set(id, mesh);
    createLabel(id, newObj.etiqueta);

    seleccionar(id);
    updateObjList();
    _saveEditorState();
    showStatus(`✓ ${newObj.etiqueta} añadido`);
    return id;
}

export function eliminarObjeto(id) {
    const cfgObj = st.config.objetos.find(o => o.id === id);
    if (cfgObj?.locked) { showStatus('⚠ Objeto bloqueado — desbloquea antes de eliminar', true); return; }
    pushHistory();
    const mesh = st.meshById.get(id);
    if (mesh) {
        if (st.selectedId === id) { transformCtrl.detach(); deseleccionar(); }
        scene.remove(mesh);
        mesh.traverse(c => {
            if (c.isMesh) {
                c.geometry?.dispose();
                const mat = c.material;
                if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(m => { m.map?.dispose(); m.dispose(); });
            } else if (c.isSprite && c.material) {
                c.material.map?.dispose(); c.material.dispose();
            }
        });
        st.meshById.delete(id);
    }
    removeLabel(id);
    st.config.objetos = st.config.objetos.filter(o => o.id !== id);
    updateObjList();
    _saveEditorState();
    showStatus('Objeto eliminado');
}

export function duplicarObjeto(id) {
    const src = st.config.objetos.find(o => o.id === id);
    if (!src) return;
    pushHistory();

    const newId  = `${src.tipo}_${String(st.nextId++).padStart(3, '0')}`;
    const clone  = structuredClone(src);
    const { etiqueta: newEtq, meta: newMeta } = _autoLabel(src);
    clone.id          = newId;
    clone.etiqueta    = newEtq;
    if (newMeta) clone.meta = { ...clone.meta, ...newMeta };
    clone.posicion.x  = snap(src.posicion.x + st.GRID_SNAP * 3);
    clone.posicion.z  = snap(src.posicion.z + st.GRID_SNAP * 3);

    st.config.objetos.push(clone);

    const mesh = buildMesh(clone);
    mesh.position.set(clone.posicion.x, clone.posicion.y ?? 0, clone.posicion.z);
    mesh.rotation.y = (clone.rotacion?.y ?? 0) * Math.PI / 180;
    mesh.userData.edId = newId;
    mesh.traverse(c => { c.userData.edId = newId; });
    scene.add(mesh);
    st.meshById.set(newId, mesh);

    seleccionar(newId);
    updateObjList();
    _saveEditorState();
    showStatus(`✓ Duplicado: ${clone.etiqueta}`);
}

// ── BLOQUEAR / DESBLOQUEAR ────────────────────────────────────
export function toggleLock(id) {
    const cfgObj = st.config.objetos.find(o => o.id === id);
    if (!cfgObj) return;
    cfgObj.locked = !cfgObj.locked;
    const mesh = st.meshById.get(id);
    if (mesh && cfgObj.locked && transformCtrl.object === mesh) transformCtrl.detach();
    updateLabelLock(id, cfgObj.locked);
    if (st.selectedId === id) {
        const btnLock = document.getElementById('btn-lock-obj');
        btnLock.textContent = cfgObj.locked ? '🔒 Desbloquear' : '🔓 Bloquear';
        btnLock.classList.toggle('active', cfgObj.locked);
        if (!cfgObj.locked && mesh) transformCtrl.attach(mesh);
    }
    updateObjList();
    _saveEditorState();
    showStatus(cfgObj.locked ? '🔒 Objeto bloqueado' : '🔓 Objeto desbloqueado');
}

// ── RECONSTRUIR MESH ──────────────────────────────────────────
export function rebuildMesh(id) {
    const old = st.meshById.get(id);
    if (old) {
        scene.remove(old);
        old.traverse(c => {
            if (c.isMesh) {
                c.geometry?.dispose();
                const mat = c.material;
                if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(m => { m.map?.dispose(); m.dispose(); });
            } else if (c.isSprite && c.material) {
                c.material.map?.dispose(); c.material.dispose();
            }
        });
    }
    removeLabel(id);

    const cfgObj = st.config.objetos.find(o => o.id === id);
    if (!cfgObj) return;

    const mesh = buildMesh(cfgObj);
    mesh.position.set(cfgObj.posicion.x, 0, cfgObj.posicion.z);
    mesh.rotation.y = (cfgObj.rotacion?.y ?? 0) * Math.PI / 180;
    mesh.userData.edId = id;
    mesh.traverse(c => { c.userData.edId = id; });
    scene.add(mesh);
    st.meshById.set(id, mesh);
    createLabel(id, cfgObj.etiqueta, !!cfgObj.locked);

    if (st.selectedId === id) seleccionar(id);
}

// ── SELECCIÓN ─────────────────────────────────────────────────
export function seleccionar(id) {
    deseleccionarTodo();
    st.selectedId = id;
    st.selectedIds.add(id);
    const mesh   = st.meshById.get(id);
    if (!mesh) return;

    const cfgObj   = st.config.objetos.find(o => o.id === id);
    const isLocked = !!cfgObj?.locked;
    _applyHighlight(id, SEL_EMISSIVE);

    if (!isLocked) transformCtrl.attach(mesh);
    syncPropsFromSelected();
    updateObjList();
    document.getElementById('props-section').style.display = 'block';

    const btnLock = document.getElementById('btn-lock-obj');
    btnLock.textContent = isLocked ? '🔒 Desbloquear' : '🔓 Bloquear';
    btnLock.classList.toggle('active', isLocked);
}

export function seleccionarAdicional(id) {
    if (st.selectedIds.has(id)) {
        st.selectedIds.delete(id);
        _removeHighlight(id);
        if (id === st.selectedId) {
            transformCtrl.detach();
            if (st.selectedIds.size > 0) {
                st.selectedId = [...st.selectedIds][0];
                const m   = st.meshById.get(st.selectedId);
                const cfg = st.config.objetos.find(o => o.id === st.selectedId);
                if (m && !cfg?.locked) transformCtrl.attach(m);
                _applyHighlight(st.selectedId, SEL_EMISSIVE);
                syncPropsFromSelected();
            } else {
                st.selectedId = null;
                document.getElementById('props-section').style.display = 'none';
            }
        }
        updateObjList();
        return;
    }
    if (st.selectedIds.size === 0) { seleccionar(id); return; }

    st.selectedIds.add(id);
    _applyHighlight(id, MULTISEL_EMISSIVE);
    updateObjList();
    showStatus(`${st.selectedIds.size} objetos seleccionados`);
}

export function deseleccionarTodo() {
    st.selectedIds.forEach(id => _removeHighlight(id));
    st.selectedIds.clear();
    st.selectedId = null;
    transformCtrl.detach();
    document.getElementById('props-section').style.display = 'none';
    updateObjList();
}

export function deseleccionar() { deseleccionarTodo(); }

// ── SINCRONIZAR PANEL DE PROPIEDADES ─────────────────────────
export function _dimSpecOf(tipo) {
    switch (tipo) {
        case 'estanteria':   return { a: 'ancho',    b: 'profundidad', la: 'Largo (m)',    lb: 'Fondo (m)' };
        case 'pasillo':      return { a: 'longitud', b: 'ancho',       la: 'Longitud (m)', lb: 'Ancho corredor (m)' };
        case 'pared':        return { a: 'ancho',    b: 'alto',        la: 'Longitud (m)', lb: 'Alto (m)' };
        case 'zona_carga':   return { a: 'ancho',    b: 'profundidad', la: 'Ancho (m)',    lb: 'Fondo (m)' };
        case 'zona_oficina': return { a: 'ancho',    b: 'profundidad', la: 'Ancho (m)',    lb: 'Fondo (m)' };
        case 'puerta':       return { a: 'ancho',    b: 'alto',        la: 'Ancho (m)',    lb: 'Alto (m)' };
        default:             return null;
    }
}

export function syncPropsFromSelected() {
    if (!st.selectedId) return;
    const cfgObj = st.config.objetos.find(o => o.id === st.selectedId);
    const mesh   = st.meshById.get(st.selectedId);
    if (!cfgObj || !mesh) return;

    cfgObj.posicion.x = +mesh.position.x.toFixed(3);
    cfgObj.posicion.z = +mesh.position.z.toFixed(3);
    cfgObj.rotacion.y = +((mesh.rotation.y * 180 / Math.PI) % 360).toFixed(1);

    document.getElementById('props-type-badge').textContent = TIPO_META[cfgObj.tipo]?.label ?? cfgObj.tipo;
    document.getElementById('prop-label').value = cfgObj.etiqueta;
    document.getElementById('prop-x').value     = cfgObj.posicion.x;
    document.getElementById('prop-z').value     = cfgObj.posicion.z;
    document.getElementById('prop-roty').value  = cfgObj.rotacion.y;

    const dimSpec = _dimSpecOf(cfgObj.tipo);
    const dimRow  = document.getElementById('prop-dim-row');
    if (!dimSpec) {
        dimRow.style.display = 'none';
    } else {
        dimRow.style.display = 'grid';
        document.getElementById('prop-dim-a-label').textContent = dimSpec.la;
        document.getElementById('prop-dim-b-label').textContent = dimSpec.lb;
        document.getElementById('prop-dim-a').value = cfgObj.dimensiones[dimSpec.a] ?? '';
        document.getElementById('prop-dim-b').value = cfgObj.dimensiones[dimSpec.b] ?? '';
    }

    ['dim-estanteria', 'dim-pasillo', 'dim-pared', 'dim-zona'].forEach(id =>
        document.getElementById(id).style.display = 'none');

    if (cfgObj.tipo === 'estanteria') {
        document.getElementById('dim-estanteria').style.display = 'block';
        document.getElementById('dim-ancho').value    = cfgObj.dimensiones.ancho    ?? 1.5;
        document.getElementById('dim-prof').value     = cfgObj.dimensiones.profundidad ?? 0.85;
        document.getElementById('dim-niveles').value  = cfgObj.dimensiones.niveles  ?? 5;
        document.getElementById('dim-altnivel').value = cfgObj.dimensiones.alturaNivel ?? 1.1;
        const pasilloNum = cfgObj.meta?.pasillo ?? '';
        document.getElementById('meta-pasillo').value = pasilloNum;
        const lado = cfgObj.meta?.lado ?? '';
        document.getElementById('meta-lado-i').classList.toggle('active', lado === 'I');
        document.getElementById('meta-lado-d').classList.toggle('active', lado === 'D');
        const selAnc = document.getElementById('anclar-pasillo');
        if (selAnc) {
            const pasillos  = st.config.objetos.filter(o => o.tipo === 'pasillo' && o.meta?.numero);
            const segActual = cfgObj.meta?.segmento ?? 1;
            selAnc.innerHTML =
                `<option value="">— Sin anclar —</option>` +
                pasillos.flatMap(p => {
                    const tieneL = p.dimensiones?.forma === 'L_derecha' || p.dimensiones?.forma === 'L_izquierda';
                    const num    = p.meta.numero;
                    const opts   = [
                        `<option value="${num}|D|1">P${String(num).padStart(3,'0')} · Lado D · Seg.1</option>`,
                        `<option value="${num}|I|1">P${String(num).padStart(3,'0')} · Lado I · Seg.1</option>`,
                    ];
                    if (tieneL) {
                        opts.push(`<option value="${num}|D|2">P${String(num).padStart(3,'0')} · Lado D · Seg.2 (codo)</option>`);
                        opts.push(`<option value="${num}|I|2">P${String(num).padStart(3,'0')} · Lado I · Seg.2 (codo)</option>`);
                    }
                    return opts;
                }).join('');
            const curP = cfgObj.meta?.pasillo, curL = cfgObj.meta?.lado;
            selAnc.value = (curP && curL) ? `${curP}|${curL}|${segActual}` : '';
        }
    } else if (cfgObj.tipo === 'pasillo') {
        document.getElementById('dim-pasillo').style.display = 'block';
        document.getElementById('dim-pas-num').value  = cfgObj.meta?.numero ?? 1;
        document.getElementById('dim-pas-long').value = cfgObj.dimensiones.longitud ?? 6;
        document.getElementById('dim-pas-ancho').value = cfgObj.dimensiones.ancho ?? AW;
        const forma = cfgObj.dimensiones?.forma ?? 'recto';
        document.getElementById('dim-pas-forma').value = forma;
        const isL = forma === 'L_derecha' || forma === 'L_izquierda';
        document.getElementById('dim-pas-long2-row').style.display = isL ? 'grid' : 'none';
        document.getElementById('dim-pas-long2').value = cfgObj.dimensiones.longitud2 ?? 3;
    } else if (cfgObj.tipo === 'pared') {
        document.getElementById('dim-pared').style.display = 'block';
        document.getElementById('dim-pared-w').value = cfgObj.dimensiones.ancho ?? 10;
        document.getElementById('dim-pared-h').value = cfgObj.dimensiones.alto  ?? 5;
    } else if (cfgObj.tipo.startsWith('zona_')) {
        document.getElementById('dim-zona').style.display = 'block';
        document.getElementById('dim-zona-w').value = cfgObj.dimensiones.ancho      ?? 8;
        document.getElementById('dim-zona-d').value = cfgObj.dimensiones.profundidad ?? 5;
    }
}

// ── LISTA DE OBJETOS (sidebar) ────────────────────────────────
export function updateObjList() {
    updatePasilloList();
    _erpCallback?.();

    const list = document.getElementById('obj-list');
    document.getElementById('obj-count').textContent = st.config.objetos.length;

    if (!st.config.objetos.length) {
        list.innerHTML = '<div style="font-size:11px;color:#334155;padding:6px">Sin objetos. Añade desde el catálogo.</div>';
        return;
    }

    let nFuera = 0;
    list.innerHTML = st.config.objetos.map(o => {
        const icon   = TIPO_META[o.tipo]?.icon ?? '📦';
        const isSel  = st.selectedIds.has(o.id);
        const isLock = !!o.locked;
        const fuera  = _objFueraDePlanta(o);
        if (fuera) nFuera++;
        const stockCls = o._stockClass ? `<span class="stock-bar ${o._stockClass}"></span>` : '';
        const warn     = fuera ? `<span title="Objeto fuera del suelo configurado" style="color:#ef4444">⚠</span>` : '';
        return `<div class="obj-item${isSel ? ' selected' : ''}${isLock ? ' locked-item' : ''}${fuera ? ' obj-out' : ''}" data-id="${o.id}">
            <span class="obj-item-icon">${icon}</span>
            <span class="obj-item-label">${o.etiqueta}</span>
            ${warn}${stockCls}
            <button class="obj-item-lock${isLock ? ' locked' : ''}" data-lock="${o.id}" title="${isLock ? 'Desbloquear' : 'Bloquear'}">${isLock ? '🔒' : '🔓'}</button>
            <button class="obj-item-del" data-del="${o.id}" title="Eliminar">✕</button>
        </div>`;
    }).join('');

    const countEl = document.getElementById('obj-count');
    countEl.innerHTML = `${st.config.objetos.length}${nFuera ? ` <span style="color:#ef4444">⚠ ${nFuera} fuera</span>` : ''}`;

    list.querySelectorAll('.obj-item').forEach(el => {
        el.addEventListener('click', e => {
            if (e.target.closest('[data-del]') || e.target.closest('[data-lock]')) return;
            seleccionar(el.dataset.id);
        });
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); eliminarObjeto(btn.dataset.del); });
    });
    list.querySelectorAll('[data-lock]').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); toggleLock(btn.dataset.lock); });
    });
}

export function updatePasilloList() {
    const pasilloNums = [...new Set([
        ...st.config.objetos.filter(o => o.tipo === 'pasillo'    && o.meta?.numero ).map(o => o.meta.numero),
        ...st.config.objetos.filter(o => o.tipo === 'estanteria' && o.meta?.pasillo).map(o => o.meta.pasillo),
    ])].sort((a, b) => a - b);

    const section = document.getElementById('pasillo-section');
    section.style.display = pasilloNums.length ? 'block' : 'none';
    document.getElementById('pasillo-count').textContent = pasilloNums.length;

    const container = document.getElementById('pasillo-list');
    container.innerHTML = pasilloNums.map(p =>
        `<button class="pasillo-chip" data-p="${p}">P${String(p).padStart(3,'0')}</button>`
    ).join('');
    container.querySelectorAll('.pasillo-chip').forEach(chip => {
        chip.addEventListener('click', () => highlightPasillo(+chip.dataset.p, chip));
    });
}

let _hlPasilloTimer = null;
export function highlightPasillo(num, chipEl) {
    document.querySelectorAll('.pasillo-chip.hl').forEach(c => c.classList.remove('hl'));
    chipEl.classList.add('hl');

    const HL      = new THREE.Color(0xf59e0b);
    const targets = st.config.objetos.filter(o => o.tipo === 'estanteria' && o.meta?.pasillo === num);
    targets.forEach(o => {
        const mesh = st.meshById.get(o.id);
        if (!mesh) return;
        mesh.traverse(c => {
            if (c.isMesh && c.material && c.userData._origEmissive === undefined) {
                c.userData._hlSaved = c.material.emissive?.getHex() ?? 0;
                c.material.emissive?.set(HL);
            }
        });
    });

    clearTimeout(_hlPasilloTimer);
    _hlPasilloTimer = setTimeout(() => {
        targets.forEach(o => {
            const mesh = st.meshById.get(o.id);
            if (!mesh) return;
            mesh.traverse(c => {
                if (c.isMesh && c.material && c.userData._hlSaved !== undefined) {
                    c.material.emissive?.setHex(c.userData._hlSaved);
                    delete c.userData._hlSaved;
                }
            });
        });
        chipEl.classList.remove('hl');
    }, 2000);
}

// ── RENDERIZAR DESDE JSON ─────────────────────────────────────
export function renderizarAlmacen(jsonConfig) {
    st.meshById.forEach((mesh) => {
        scene.remove(mesh);
        mesh.traverse(c => {
            if (c.isMesh) {
                c.geometry?.dispose();
                const mat = c.material;
                if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(m => { m.map?.dispose(); m.dispose(); });
            } else if (c.isSprite && c.material) {
                c.material.map?.dispose(); c.material.dispose();
            }
        });
    });
    st.meshById.clear();
    deseleccionar();

    st.config = structuredClone(jsonConfig);
    buildFloor();

    let maxNum = 0;
    for (const o of st.config.objetos) {
        const m = o.id.match(/_(\d+)$/);
        if (m) maxNum = Math.max(maxNum, +m[1]);
    }
    st.nextId = maxNum + 1;

    st.labelById.forEach(lbl => lbl.removeFromParent());
    st.labelById.clear();

    for (const obj of st.config.objetos) {
        const mesh = buildMesh(obj);
        mesh.position.set(obj.posicion.x, obj.posicion.y ?? 0, obj.posicion.z);
        mesh.rotation.y = (obj.rotacion?.y ?? 0) * Math.PI / 180;
        mesh.userData.edId = obj.id;
        mesh.traverse(c => { c.userData.edId = obj.id; });
        scene.add(mesh);
        st.meshById.set(obj.id, mesh);
        createLabel(obj.id, obj.etiqueta, !!obj.locked);
    }

    updateObjList();
    document.getElementById('scene-name').value = st.config.nombre ?? '';
    document.getElementById('scene-w').value    = st.config.dimensiones?.ancho ?? 50;
    document.getElementById('scene-d').value    = st.config.dimensiones?.profundidad ?? 30;
    showStatus(`✓ Layout cargado: ${st.config.objetos.length} objetos`);
}

// ── VISIBILIDAD ───────────────────────────────────────────────
export function _toggleHidden(id) {
    const cfgObj = st.config.objetos.find(o => o.id === id);
    if (!cfgObj) return;
    cfgObj._hidden = !cfgObj._hidden;
    const mesh = st.meshById.get(id);
    if (mesh) mesh.visible = !cfgObj._hidden;
    const lbl = st.labelById.get(id);
    if (lbl) lbl.visible = !cfgObj._hidden;
    if (cfgObj._hidden && st.selectedId === id) transformCtrl.detach();
    showStatus(cfgObj._hidden ? '🙈 Oculto' : '👁 Visible');
}
