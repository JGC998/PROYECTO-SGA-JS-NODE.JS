import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EYE } from './configuracion.js';
import { S, resumeGame, isGameActive, clearKeys } from './estado.js';
import { showToast } from './utilidades.js';
import { getFloorY, collidesAt, initWarehouseGroups, buildLowStockAlerts, animateLowStockAlerts } from './almacen.js';
import { cargar, refresh } from './datos.js';
import { openPickPanel, closePickPanel, saveRoute, stopRoute, openHistory, updatePickHUD, drawPickRoute, checkPickArrival } from './picking.js';
import { closeWorkerModal, updateWorkers, assignRoute } from './trabajadores.js';
import { checkLookAt, drawMinimap, updateInventoryOverlay, clearPeekPanel, openTeleport, closeTeleport, openDetail, closeDetail, initMinimap, initInventorySprite, hideInventorySprite } from './interfaz.js';
import { startAmbient, stopAmbient } from './audio.js';

// ── ESCENA ────────────────────────────────────────────────────
const canvas = document.getElementById('c');
S.scene = new THREE.Scene();
S.scene.background = new THREE.Color(0x8ba0b5);
S.scene.fog = new THREE.Fog(0x8ba0b5, 25, 80);

S.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 200);
S.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
S.renderer.setSize(innerWidth, innerHeight);
S.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
S.renderer.shadowMap.enabled = true;
S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

S.controls = new PointerLockControls(S.camera, document.body);
S.scene.add(S.controls.getObject());
S.controls.getObject().position.set(0, EYE, 0);

// ── LUCES ─────────────────────────────────────────────────────
S.scene.add(new THREE.AmbientLight(0xfff5e0, 1.4));
S.scene.add(new THREE.HemisphereLight(0xffe8c0, 0x664422, 0.7));
const sun = new THREE.DirectionalLight(0xfff8ee, 1.6);
sun.position.set(40, 60, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = sun.shadow.camera.bottom = -100;
sun.shadow.camera.right = sun.shadow.camera.top = 100;
sun.shadow.camera.far = 250;
S.scene.add(sun);

// Inicializar grupos THREE que dependen de S.scene
initWarehouseGroups();

// ── MOVIMIENTO ────────────────────────────────────────────────
let prevTime = performance.now();
const _fwd = new THREE.Vector3();

function processMovement(delta) {
    let ix = 0, iz = 0;
    if (isGameActive()) {
        if (S.keys['KeyW'] || S.keys['ArrowUp'])    iz -= 1;
        if (S.keys['KeyS'] || S.keys['ArrowDown'])  iz += 1;
        if (S.keys['KeyA'] || S.keys['ArrowLeft'])  ix -= 1;
        if (S.keys['KeyD'] || S.keys['ArrowRight']) ix += 1;
        ix = Math.max(-1, Math.min(1, ix + S.gpMove.x));
        iz = Math.max(-1, Math.min(1, iz + S.gpMove.y));
    }
    if (ix !== 0 || iz !== 0) {
        const dlen = Math.sqrt(ix * ix + iz * iz);
        ix /= dlen; iz /= dlen;
        S.camera.getWorldDirection(_fwd);
        _fwd.y = 0;
        const flen = _fwd.length();
        if (flen > 0.001) {
            _fwd.divideScalar(flen);
            const maxSpeed = (S.keys['ShiftLeft'] || S.keys['ShiftRight']) ? 8 : 4;
            const rx = -_fwd.z, rz = _fwd.x;
            const wantX = (rx * ix + _fwd.x * (-iz)) * maxSpeed;
            const wantZ = (rz * ix + _fwd.z * (-iz)) * maxSpeed;
            const t = Math.min(1, 18 * delta);
            S.vel.x += (wantX - S.vel.x) * t;
            S.vel.y += (wantZ - S.vel.y) * t;
        }
    } else {
        S.vel.x *= Math.max(0, 1 - 14 * delta);
        S.vel.y *= Math.max(0, 1 - 14 * delta);
        if (S.vel.x * S.vel.x + S.vel.y * S.vel.y < 0.0025) { S.vel.x = 0; S.vel.y = 0; }
    }
    if (!isGameActive() || (S.vel.x === 0 && S.vel.y === 0)) return;
    const obj   = S.controls.getObject();
    const ox    = obj.position.x, oz = obj.position.z;
    const moveX = S.vel.x * delta, moveZ = S.vel.y * delta;
    const curFeet = obj.position.y - EYE;
    if (!collidesAt(ox + moveX, oz + moveZ, curFeet)) {
        obj.position.x += moveX; obj.position.z += moveZ;
    } else if (!collidesAt(ox + moveX, oz, curFeet)) {
        obj.position.x += moveX; S.vel.y = 0;
    } else if (!collidesAt(ox, oz + moveZ, curFeet)) {
        obj.position.z += moveZ; S.vel.x = 0;
    } else {
        S.vel.x = 0; S.vel.y = 0;
    }
    const tgtY = getFloorY(obj.position.x, obj.position.z, obj.position.y - EYE) + EYE;
    obj.position.y += (tgtY - obj.position.y) * Math.min(1, 9 * delta);
}

// ── GAMEPAD ───────────────────────────────────────────────────
function deadzone(v, dz = 0.12) {
    return Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz);
}

function pollGamepad(delta) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const gp   = pads.find(p => p?.connected);
    if (!gp) { S.gpMove.x = 0; S.gpMove.y = 0; return; }

    const isNow  = i => !!(gp.buttons[i]?.pressed);
    const justDn = i => isNow(i) && !S.gpBtns[i];

    if (justDn(0)) {
        checkLookAt();
        if (S.lookedAt) { S.pendingShelf = S.lookedAt; S.controls.unlock(); }
    }
    if (justDn(1)) {
        if (S.teleportOpen)     closeTeleport(true);
        else if (S.pickPanelOpen) closePickPanel(true);
        else if (S.detailOpen)    closeDetail(true);
        else if (isGameActive()) S.controls.unlock();
    }
    if (justDn(2) && isGameActive()) openTeleport();
    if (justDn(3) && isGameActive() && !S.detailOpen && !S.teleportOpen) openPickPanel();
    if (justDn(9) && !isGameActive()) resumeGame();

    for (let i = 0; i < gp.buttons.length; i++) S.gpBtns[i] = isNow(i);

    if (!isGameActive()) { S.gpMove.x = 0; S.gpMove.y = 0; return; }
    S.gpMove.x = deadzone(gp.axes[0]);
    S.gpMove.y = deadzone(gp.axes[1]);
    const rx = deadzone(gp.axes[2]), ry = deadzone(gp.axes[3]);
    if (rx !== 0 || ry !== 0) {
        S.controls.getObject().rotation.y -= rx * 2.2 * delta;
        S.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, S.camera.rotation.x - ry * 2.2 * delta));
    }
}

// ── LOOP ──────────────────────────────────────────────────────
(function animate() {
    requestAnimationFrame(animate);
    const now   = performance.now();
    const delta = Math.min((now - prevTime) / 1000, 0.05);
    prevTime = now;
    pollGamepad(delta);
    processMovement(delta);
    updateWorkers(delta);
    animateLowStockAlerts(now / 1000);
    if (isGameActive()) {
        checkLookAt();
        checkPickArrival();
        drawMinimap();
        updateInventoryOverlay();
    } else {
        hideInventorySprite();
        clearPeekPanel();
    }
    S.renderer.render(S.scene, S.camera);
})();

// ── POINTER LOCK ──────────────────────────────────────────────
S.controls.addEventListener('lock', () => {
    S.pendingShelf = null;
    startAmbient();
    document.getElementById('start').style.display       = 'none';
    document.getElementById('pause').style.display       = 'none';
    document.getElementById('xhair').style.display       = 'block';
    document.getElementById('hud').style.display         = 'flex';
    document.getElementById('hud-btns').style.display    = 'flex';
    document.getElementById('legend').style.display      = 'block';
    document.getElementById('minimap-wrap').style.display = 'block';
    if (S.detailOpen) closeDetail(false);
});

S.controls.addEventListener('unlock', () => {
    stopAmbient();
    document.getElementById('xhair').style.display  = 'none';
    document.getElementById('prompt').style.display = 'none';
    clearPeekPanel();
    S.lookedAt = null;
    if (S.pendingShelf) {
        const sd = S.pendingShelf; S.pendingShelf = null;
        openDetail(sd); return;
    }
    if (S.teleportOpen) return;
    if (S.pickPanelOpen) return;
    if (!S.detailOpen) document.getElementById('pause').style.display = 'flex';
});

// ── EVENTOS DE TECLADO ────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    S.keys[e.code] = true;
    if (e.code === 'KeyE' && S.controls.isLocked) {
        checkLookAt();
        if (S.lookedAt) { S.pendingShelf = S.lookedAt; S.controls.unlock(); }
    }
    if (e.code === 'KeyF' && S.controls.isLocked && !S.detailOpen && !S.pickPanelOpen) openTeleport();
    if (e.code === 'KeyP' && S.controls.isLocked && !S.detailOpen && !S.teleportOpen) openPickPanel();
    if (e.code === 'KeyR' && S.controls.isLocked && !S.detailOpen && !S.teleportOpen && !S.pickPanelOpen) refresh();
    if (e.code === 'KeyG' && S.controls.isLocked && S.pickRoute.length) { saveRoute(); return; }
    if (e.code === 'KeyT' && S.controls.isLocked && S.pickRoute.length) { assignRoute(); return; }
    if (e.code === 'KeyX' && S.controls.isLocked && S.pickRoute.length) { stopRoute(); return; }
    if (e.code === 'Escape') {
        S.pendingShelf = null;
        if (S.workerModalOpen)  { closeWorkerModal(true); return; }
        if (S.teleportOpen)     { closeTeleport(true); return; }
        if (S.pickPanelOpen)    { closePickPanel(true); return; }
        if (S.detailOpen)       { closeDetail(false); document.getElementById('pause').style.display = 'flex'; return; }
        if (document.getElementById('pause').style.display !== 'none') { clearKeys(); resumeGame(); }
    }
});
document.addEventListener('keyup', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    S.keys[e.code] = false;
});
document.addEventListener('mousedown', e => {
    if (e.button !== 0 || !S.controls.isLocked) return;
    checkLookAt();
    // Open detail immediately on left-click (same as E key)
    if (S.lookedAt) { S.pendingShelf = S.lookedAt; S.controls.unlock(); }
});

// ── BOTONES UI ────────────────────────────────────────────────
document.getElementById('btn-enter').addEventListener('click',  () => S.controls.lock());
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-refresh-pause').addEventListener('click', () => refresh().then(() => resumeGame()));
document.getElementById('btn-history').addEventListener('click', openHistory);
document.getElementById('thresh-input').addEventListener('change', e => {
    S.LOW_STOCK_THRESH = Math.max(1, parseInt(e.target.value, 10) || 10);
    buildLowStockAlerts();
    showToast(`Alerta: stock < ${S.LOW_STOCK_THRESH} uds`, 2500);
});

// ── RESIZE ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    S.camera.aspect = innerWidth / innerHeight;
    S.camera.updateProjectionMatrix();
    S.renderer.setSize(innerWidth, innerHeight);
});

// ── ARRANQUE ──────────────────────────────────────────────────
initMinimap();
initInventorySprite();
cargar();
