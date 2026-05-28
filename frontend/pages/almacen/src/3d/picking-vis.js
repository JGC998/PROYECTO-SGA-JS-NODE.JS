// ── 3D: VISUALES DE RUTA DE PICKING ──────────────────────────
// Responsabilidad: Three.js puro — línea de ruta, discos de parada, sprites.
// Sin DOM. Los datos vienen del store (S.pickRoute).
import * as THREE from 'three';
import { store, S } from '../state/store.js';
import { makePickSprite } from './sprites.js';
import { astarRouteWaypointsAsync } from '../core/grafo.js';

const MAT_PICK_LINE      = new THREE.LineBasicMaterial({ color: 0xfbbf24 });
const MAT_PICK_DISC      = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.65 });
const MAT_PICK_COLLECTED = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.90 });
const PICK_DISC_GEO      = new THREE.CylinderGeometry(0.38, 0.38, 0.05, 20);

let _routeObj = null;

// Suscripción: cuando el operario valida una parada desde el móvil, el disco se pone verde
store.on('rutaProgresoLocal', ({ idx }) => {
    if (!S.pickMarkerGrp) return;
    for (const ch of S.pickMarkerGrp.children) {
        if (ch.isMesh && ch.userData.stopIdx === idx) {
            ch.material = MAT_PICK_COLLECTED;
        }
    }
});

export function clearPickVisuals() {
    if (_routeObj) { S.scene.remove(_routeObj); _routeObj.geometry.dispose(); _routeObj = null; }
    if (S.pickMarkerGrp) {
        for (const ch of S.pickMarkerGrp.children) {
            if (ch.isSprite && ch.material) { ch.material.map?.dispose(); ch.material.dispose(); }
        }
        S.pickMarkerGrp.clear();
    }
}

// Dibuja la línea de ruta en 3D usando el worker A* para no bloquear el hilo principal.
// La función es async — los marcadores (discos + sprites) se añaden inmediatamente;
// la línea de ruta aparece en cuanto el worker devuelve los waypoints.
export async function drawPickRoute() {
    clearPickVisuals();
    if (!S.pickRoute.length) return;

    const obj        = S.controls.getObject();
    const fromPlayer = [{ x: obj.position.x, z: obj.position.z }, ...S.pickRoute];

    // Marcadores síncronos — aparecen de inmediato
    for (let i = 0; i < S.pickRoute.length; i++) {
        const s         = S.pickRoute[i];
        const collected = S.activeWorkerCollected?.has(i);
        const disc = new THREE.Mesh(PICK_DISC_GEO, collected ? MAT_PICK_COLLECTED : MAT_PICK_DISC);
        disc.position.set(s.x, 0.025, s.z);
        disc.userData.stopIdx = i;
        S.pickMarkerGrp.add(disc);
        const lbl = makePickSprite(String(i + 1), s.locKey);
        lbl.position.set(s.x, 0.95, s.z);
        S.pickMarkerGrp.add(lbl);
    }

    // Línea de ruta — se computa en el worker para no bloquear (MEJ-1)
    const waypts = await astarRouteWaypointsAsync(fromPlayer);
    const geo    = new THREE.BufferGeometry().setFromPoints(
        waypts.map(s => new THREE.Vector3(s.x, 0.05, s.z))
    );
    _routeObj = new THREE.Line(geo, MAT_PICK_LINE);
    S.scene.add(_routeObj);
}
