import * as THREE                from 'three';
import { OrbitControls }         from 'three/addons/controls/OrbitControls.js';
import { TransformControls }     from 'three/addons/controls/TransformControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { AW }                    from '../shared/configuracion.js';
import { st, TIPO_META }         from './editor-state.js';

// ── CANVAS & RENDERER ─────────────────────────────────────────
export const canvas   = document.getElementById('editor-canvas');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

// ── CSS2D LABEL RENDERER ──────────────────────────────────────
export const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position    = 'absolute';
labelRenderer.domElement.style.top         = '0';
labelRenderer.domElement.style.left        = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.getElementById('ed-canvas-wrap').appendChild(labelRenderer.domElement);

// ── LABEL FUNCTIONS ───────────────────────────────────────────
export function createLabel(id, text, isLocked = false) {
    removeLabel(id);
    const div = document.createElement('div');
    div.className = 'ed-label3d' + (isLocked ? ' locked' : '');
    div.textContent = text.length > 16 ? text.slice(0, 15) + '…' : text;
    const label = new CSS2DObject(div);
    label.position.set(0, 0.25, 0);
    st.labelById.set(id, label);
    const mesh = st.meshById.get(id);
    if (mesh) mesh.add(label);
}

export function removeLabel(id) {
    const old = st.labelById.get(id);
    if (old) { old.removeFromParent(); st.labelById.delete(id); }
}

export function updateLabelText(id, text) {
    const lbl = st.labelById.get(id);
    if (lbl) lbl.element.textContent = text.length > 16 ? text.slice(0, 15) + '…' : text;
}

export function updateLabelLock(id, locked) {
    const lbl = st.labelById.get(id);
    if (lbl) lbl.element.className = 'ed-label3d' + (locked ? ' locked' : '');
}

// ── ESCENA ────────────────────────────────────────────────────
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080e1c);
scene.fog        = new THREE.Fog(0x080e1c, 60, 150);

// ── CÁMARAS ───────────────────────────────────────────────────
export const perspCam = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
perspCam.position.set(25, 30, -15);
perspCam.lookAt(25, 0, 15);

export const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
orthoCam.position.set(25, 100, 15);
orthoCam.lookAt(25, 0, 15);

export function getCamera() { return st.activeCamera === 'persp' ? perspCam : orthoCam; }

// ── CONTROLES DE ÓRBITA ───────────────────────────────────────
export const orbitCtrl = new OrbitControls(perspCam, renderer.domElement);
orbitCtrl.enableDamping = true;
orbitCtrl.dampingFactor = 0.08;
orbitCtrl.maxPolarAngle = Math.PI / 2.1;
orbitCtrl.target.set(25, 0, 15);

export const orbitOrtho = new OrbitControls(orthoCam, renderer.domElement);
orbitOrtho.enableRotate  = false;
orbitOrtho.enabled       = false;
orbitOrtho.target.set(25, 0, 15);

// ── TRANSFORM CONTROLS ────────────────────────────────────────
export const transformCtrl = new TransformControls(perspCam, renderer.domElement);
transformCtrl.setSpace('world');
scene.add(transformCtrl);

// ── SNAP & CLAMP ──────────────────────────────────────────────
export function snap(v) { return Math.round(v / st.GRID_SNAP) * st.GRID_SNAP; }

const _clampTmpBox = new THREE.Box3();
export function _clampToBoundsMesh(mesh) {
    if (!mesh) return false;
    const W = st.config.dimensiones?.ancho       ?? 50;
    const D = st.config.dimensiones?.profundidad ?? 30;
    _clampTmpBox.setFromObject(mesh);
    let dx = 0, dz = 0;
    if (_clampTmpBox.min.x < 0)  dx = -_clampTmpBox.min.x;
    else if (_clampTmpBox.max.x > W) dx = W - _clampTmpBox.max.x;
    if (_clampTmpBox.min.z < 0)  dz = -_clampTmpBox.min.z;
    else if (_clampTmpBox.max.z > D) dz = D - _clampTmpBox.max.z;
    if (dx !== 0 || dz !== 0) {
        mesh.position.x = snap(mesh.position.x + dx);
        mesh.position.z = snap(mesh.position.z + dz);
        return true;
    }
    return false;
}

// ── LUCES ─────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const sun = new THREE.DirectionalLight(0xfff5e0, 1.0);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = sun.shadow.camera.bottom = -80;
sun.shadow.camera.right = sun.shadow.camera.top  =  80;
scene.add(sun);

// ── SUELO Y CUADRÍCULA ────────────────────────────────────────
let floorMesh  = null;
let gridHelper = null;

export function buildFloor() {
    if (floorMesh) {
        scene.remove(floorMesh);
        floorMesh.geometry.dispose();
        floorMesh.material.dispose();
        floorMesh = null;
    }
    if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper.geometry?.dispose();
        gridHelper.material?.dispose();
        gridHelper = null;
    }
    // Dispose y eliminar helpers anteriores
    for (const c of scene.children.filter(c => c.userData.isHelperPerim || c.userData.isAxisHelper || c.userData.isScaleMark)) {
        scene.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
        // ArrowHelper contiene children (Line + Mesh) con sus propias geo/mat
        c.traverse(ch => { if (ch !== c) { ch.geometry?.dispose(); ch.material?.dispose(); } });
    }

    const { ancho, profundidad } = st.config.dimensiones;
    const cx = ancho / 2, cz = profundidad / 2;

    const geo = new THREE.PlaneGeometry(ancho, profundidad);
    const mat = new THREE.MeshLambertMaterial({ color: 0x0d2235 });
    floorMesh  = new THREE.Mesh(geo, mat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(cx, -0.01, cz);
    floorMesh.receiveShadow = true;
    floorMesh.userData.isFloor = true;
    scene.add(floorMesh);

    const gridSize = Math.max(ancho, profundidad) + 20;
    const gridDivs = Math.round(gridSize / st.GRID_SNAP);
    gridHelper = new THREE.GridHelper(gridSize, gridDivs, 0x1e3a5f, 0x0d2035);
    gridHelper.position.set(cx, 0.002, cz);
    scene.add(gridHelper);

    const perimGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(ancho, 0.02, profundidad));
    const perimMat = new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.9 });
    const perim    = new THREE.LineSegments(perimGeo, perimMat);
    perim.position.set(cx, 0.01, cz);
    perim.userData.isHelperPerim = true;
    scene.add(perim);

    const axisX = new THREE.ArrowHelper(new THREE.Vector3(1,0,0), new THREE.Vector3(0,0.05,0), Math.min(6, ancho*0.18), 0xf87171, 0.9, 0.5);
    const axisZ = new THREE.ArrowHelper(new THREE.Vector3(0,0,1), new THREE.Vector3(0,0.05,0), Math.min(6, profundidad*0.18), 0x60a5fa, 0.9, 0.5);
    axisX.userData.isAxisHelper = true;
    axisZ.userData.isAxisHelper = true;
    scene.add(axisX, axisZ);

    const tickMat = new THREE.LineBasicMaterial({ color: 0x3d6a9e });
    const tickH = 0.35;
    for (let x = 5; x < ancho; x += 5) {
        const g  = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,0,0),          new THREE.Vector3(x,tickH,0)]);
        const m  = new THREE.Line(g, tickMat); m.userData.isScaleMark = true; scene.add(m);
        const g2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,0,profundidad), new THREE.Vector3(x,tickH,profundidad)]);
        const m2 = new THREE.Line(g2, tickMat); m2.userData.isScaleMark = true; scene.add(m2);
    }
    for (let z = 5; z < profundidad; z += 5) {
        const g  = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,z),     new THREE.Vector3(0,tickH,z)]);
        const m  = new THREE.Line(g, tickMat); m.userData.isScaleMark = true; scene.add(m);
        const g2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ancho,0,z), new THREE.Vector3(ancho,tickH,z)]);
        const m2 = new THREE.Line(g2, tickMat); m2.userData.isScaleMark = true; scene.add(m2);
    }
}

buildFloor();

// ── RAYCASTER ─────────────────────────────────────────────────
export const raycaster  = new THREE.Raycaster();
export const mouse2d    = new THREE.Vector2();
export const _floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
export const _coordHit  = new THREE.Vector3();

// ── GEOMETRÍAS POR TIPO ───────────────────────────────────────
export function buildMesh(obj) {
    const { tipo, dimensiones: d } = obj;
    let mesh;

    if (tipo === 'estanteria') {
        const w = d.ancho ?? 1.5, depth = d.profundidad ?? 0.85;
        const h = (d.niveles ?? 5) * (d.alturaNivel ?? 1.1);
        const group = new THREE.Group();

        const bodyGeo = new THREE.BoxGeometry(w, h, depth);
        const bodyMat = new THREE.MeshLambertMaterial({ color: TIPO_META.estanteria.color, transparent: true, opacity: 0.85 });
        const body    = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = h / 2;
        body.castShadow = body.receiveShadow = true;
        group.add(body);

        const niveles = d.niveles ?? 5;
        const altNiv  = d.alturaNivel ?? 1.1;
        const plkMat  = new THREE.MeshLambertMaterial({ color: 0x2d4a6b });
        for (let n = 0; n <= niveles; n++) {
            const plkGeo = new THREE.BoxGeometry(w + 0.02, 0.04, depth + 0.02);
            const plk    = new THREE.Mesh(plkGeo, plkMat);
            plk.position.y = n * altNiv;
            group.add(plk);
        }
        mesh = group;

    } else if (tipo === 'pasillo') {
        const L1   = d.longitud  ?? 6;
        const W    = d.ancho     ?? AW;
        const forma = d.forma   ?? 'recto';
        const L2   = d.longitud2 ?? 3;
        const group = new THREE.Group();
        const matStrip  = new THREE.MeshLambertMaterial({ color: TIPO_META.pasillo.color, transparent: true, opacity: 0.45 });
        const arrGeo = new THREE.ConeGeometry(0.28, 0.6, 4);
        const arrMat = new THREE.MeshBasicMaterial({ color: 0x78350f });

        const seg1 = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, L1), matStrip);
        seg1.position.set(0, 0.025, 0);
        group.add(seg1);

        const arr1 = new THREE.Mesh(arrGeo, arrMat);
        arr1.rotation.x = Math.PI / 2;
        arr1.position.set(0, 0.12, L1 / 2 - 0.4);
        group.add(arr1);

        if (forma === 'L_derecha' || forma === 'L_izquierda') {
            const dir = forma === 'L_derecha' ? 1 : -1;
            const seg2 = new THREE.Mesh(new THREE.BoxGeometry(L2, 0.05, W), matStrip);
            seg2.position.set(dir * (W / 2 + L2 / 2), 0.025, L1 / 2 - W / 2);
            group.add(seg2);

            const arr2 = new THREE.Mesh(arrGeo, arrMat);
            arr2.rotation.z = -dir * Math.PI / 2;
            arr2.position.set(dir * (W / 2 + L2 - 0.4), 0.12, L1 / 2 - W / 2);
            group.add(arr2);
        }

        const edges1 = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, L1)),
            new THREE.LineBasicMaterial({ color: 0xb45309, transparent: true, opacity: 0.6 })
        );
        edges1.rotation.x = -Math.PI / 2;
        edges1.position.y = 0.06;
        group.add(edges1);
        mesh = group;

    } else if (tipo === 'pared') {
        const w = d.ancho ?? 10, h = d.alto ?? 5, th = 0.2;
        const geo = new THREE.BoxGeometry(w, h, th);
        const mat = new THREE.MeshLambertMaterial({ color: TIPO_META.pared.color });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = h / 2;
        mesh.castShadow = true;

    } else if (tipo === 'zona_carga' || tipo === 'zona_oficina') {
        const w = d.ancho ?? 8, dep = d.profundidad ?? 5;
        const col = tipo === 'zona_carga' ? TIPO_META.zona_carga.color : TIPO_META.zona_oficina.color;
        const mat = new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.55 });
        const group = new THREE.Group();
        const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, dep), mat);
        slab.position.y = 0.04;
        group.add(slab);
        if (tipo === 'zona_oficina') {
            // Flecha indicando orientación de la entrada (frente = -Z local)
            const arrMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const shaft  = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, dep * 0.45), arrMat);
            shaft.position.set(0, 0.12, -dep * 0.15);
            group.add(shaft);
            const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 4), arrMat);
            head.rotation.x = -Math.PI / 2;
            head.position.set(0, 0.12, -dep * 0.38);
            group.add(head);
            // Marca de ventana en el frente
            const winMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.7 });
            const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.06, 0.08), winMat);
            win.position.set(0, 0.12, -dep / 2 + 0.04);
            group.add(win);
        }
        mesh = group;
        mesh.position.y = 0;

    } else if (tipo === 'columna') {
        const r = 0.2, h = st.config.dimensiones.alto ?? 9;
        const geo = new THREE.CylinderGeometry(r, r, h, 8);
        const mat = new THREE.MeshLambertMaterial({ color: TIPO_META.columna.color });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = h / 2;
        mesh.castShadow = true;

    } else if (tipo === 'puerta') {
        const w = d.ancho ?? 3, h = d.alto ?? 4, th = 0.15;
        const mat = new THREE.MeshLambertMaterial({ color: TIPO_META.puerta.color, transparent: true, opacity: 0.6 });
        mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, th), mat);
        mesh.position.y = h / 2;

    } else {
        mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshLambertMaterial({ color: 0xffffff })
        );
        mesh.position.y = 0.5;
    }

    return mesh;
}

// ── GUÍAS DE ALINEAMIENTO + SNAP MAGNÉTICO ────────────────────
const _guideMat  = new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.8,  depthTest: false });
const _snapMat   = new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.95, depthTest: false });
let   _guideLines = [];

export function _clearGuides() {
    _guideLines.forEach(l => { scene.remove(l); l.geometry.dispose(); });
    _guideLines = [];
}

const _tmpBox3 = new THREE.Box3();
export function _bboxOfMesh(mesh) {
    _tmpBox3.setFromObject(mesh);
    return {
        minX: _tmpBox3.min.x, maxX: _tmpBox3.max.x,
        minZ: _tmpBox3.min.z, maxZ: _tmpBox3.max.z,
        cx:   (_tmpBox3.min.x + _tmpBox3.max.x) / 2,
        cz:   (_tmpBox3.min.z + _tmpBox3.max.z) / 2,
    };
}

export function _updateGuides(primaryObj) {
    _clearGuides();
    if (!primaryObj.userData?.edId) return;
    const primId    = primaryObj.userData.edId;
    const threshold = Math.max(st.GRID_SNAP * 0.6, 0.3);
    const { ancho, profundidad } = st.config.dimensiones;

    const primBB = _bboxOfMesh(primaryObj);
    let bestX = null, bestZ = null;

    for (const [id, mesh] of st.meshById) {
        if (id === primId) continue;
        if (st.selectedIds.has(id)) continue;
        const cfgObj = st.config.objetos.find(o => o.id === id);
        if (cfgObj?._hidden) continue;
        const bb = _bboxOfMesh(mesh);

        for (const pk of ['minX', 'maxX', 'cx']) {
            for (const ok of ['minX', 'maxX', 'cx']) {
                const delta = bb[ok] - primBB[pk];
                if (Math.abs(delta) < threshold && (bestX === null || Math.abs(delta) < Math.abs(bestX.delta)))
                    bestX = { delta, value: bb[ok], primKey: pk, otherKey: ok };
            }
        }
        for (const pk of ['minZ', 'maxZ', 'cz']) {
            for (const ok of ['minZ', 'maxZ', 'cz']) {
                const delta = bb[ok] - primBB[pk];
                if (Math.abs(delta) < threshold && (bestZ === null || Math.abs(delta) < Math.abs(bestZ.delta)))
                    bestZ = { delta, value: bb[ok], primKey: pk, otherKey: ok };
            }
        }
    }

    const applyDelta = (axis, delta) => {
        primaryObj.position[axis] += delta;
        if (st._multiDragStart) {
            st._multiDragStart[axis === 'x' ? 'px' : 'pz'] += delta;
            st._multiDragStart.others.forEach((start, id) => {
                if (id === primId) return;
                const m = st.meshById.get(id);
                if (m) m.position[axis] += delta;
                start[axis] += delta;
            });
        }
    };
    if (bestX) applyDelta('x', bestX.delta);
    if (bestZ) applyDelta('z', bestZ.delta);

    const drawLine = (a, b, mat) => {
        const geo  = new THREE.BufferGeometry().setFromPoints([a, b]);
        const line = new THREE.Line(geo, mat);
        scene.add(line); _guideLines.push(line);
    };
    if (bestX) drawLine(new THREE.Vector3(bestX.value, 0.04, -5),      new THREE.Vector3(bestX.value, 0.04, profundidad + 5), _snapMat);
    if (bestZ) drawLine(new THREE.Vector3(-5, 0.04, bestZ.value),      new THREE.Vector3(ancho + 5, 0.04, bestZ.value),        _snapMat);
}

// ── SELECCIÓN — HIGHLIGHT ─────────────────────────────────────
export const SEL_EMISSIVE      = new THREE.Color(0x1a3a6a);
export const MULTISEL_EMISSIVE = new THREE.Color(0x0d2040);

export function _applyHighlight(id, emissive) {
    const mesh = st.meshById.get(id);
    if (!mesh) return;
    mesh.traverse(c => {
        if (c.isMesh && c.material) {
            if (c.userData._origEmissive === undefined)
                c.userData._origEmissive = c.material.emissive?.getHex() ?? 0;
            c.material.emissive?.set(emissive);
        }
    });
}

export function _removeHighlight(id) {
    const mesh = st.meshById.get(id);
    if (!mesh) return;
    mesh.traverse(c => {
        if (c.isMesh && c.material && c.userData._origEmissive !== undefined) {
            c.material.emissive?.setHex(c.userData._origEmissive);
            delete c.userData._origEmissive;
        }
    });
}

// ── STATUS ────────────────────────────────────────────────────
export function showStatus(msg, isError = false) {
    const el = document.getElementById('ed-status');
    el.textContent = msg;
    el.style.color = isError ? '#f87171' : '#4ade80';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ''; }, 5000);
}

// ── CAMBIO DE CÁMARA ──────────────────────────────────────────
export function switchCamera(mode) {
    st.activeCamera = mode;
    const isOrtho = mode === 'ortho';

    if (isOrtho) {
        const { ancho, profundidad } = st.config.dimensiones;
        const aspect = canvas.clientWidth / canvas.clientHeight;
        const halfH  = Math.max(ancho, profundidad) / 2 + 5;
        const halfW  = halfH * aspect;
        orthoCam.left   = -halfW; orthoCam.right  = halfW;
        orthoCam.top    =  halfH; orthoCam.bottom = -halfH;
        orthoCam.updateProjectionMatrix();
        orthoCam.position.set(ancho / 2, 100, profundidad / 2);
        orthoCam.lookAt(ancho / 2, 0, profundidad / 2);
        orbitOrtho.target.set(ancho / 2, 0, profundidad / 2);
        orbitOrtho.enabled = true;
        orbitCtrl.enabled  = false;
    } else {
        orbitCtrl.enabled  = true;
        orbitOrtho.enabled = false;
    }

    transformCtrl.camera = getCamera();
    document.getElementById('btn-cam-persp').classList.toggle('active', !isOrtho);
    document.getElementById('btn-cam-ortho').classList.toggle('active',  isOrtho);
}

// ── TRANSFORM MODE ────────────────────────────────────────────
export function setTransformMode(mode) {
    st.transformMode = mode;
    transformCtrl.setMode(mode);

    if (mode === 'translate') {
        transformCtrl.showX = true;
        transformCtrl.showY = false;
        transformCtrl.showZ = true;
    } else if (mode === 'rotate') {
        transformCtrl.showX = false;
        transformCtrl.showY = true;
        transformCtrl.showZ = false;
    } else {
        transformCtrl.showX = true;
        transformCtrl.showY = false;
        transformCtrl.showZ = true;
    }

    ['translate', 'rotate', 'scale'].forEach(m => {
        document.getElementById(`btn-mode-${m}`).classList.toggle('active', m === mode);
    });
}

// ── RESIZE ────────────────────────────────────────────────────
export function onResize() {
    const wrap = document.getElementById('ed-canvas-wrap');
    const W    = wrap.clientWidth;
    const H    = wrap.clientHeight;
    renderer.setSize(W, H);
    labelRenderer.setSize(W, H);
    perspCam.aspect = W / H;
    perspCam.updateProjectionMatrix();
    if (st.activeCamera === 'ortho') switchCamera('ortho');
}

// ── LOOP ──────────────────────────────────────────────────────
export function animate() {
    requestAnimationFrame(animate);
    if (st.activeCamera === 'persp') orbitCtrl.update();
    else orbitOrtho.update();
    renderer.render(scene, getCamera());
    labelRenderer.render(scene, getCamera());
}
