// ── 3D: RAYCASTING + GRID ESPACIAL ───────────────────────────
// Responsabilidad: detectar qué objeto 3D está bajo el cursor del jugador.
// Patrón SoC: cuando cambia el objetivo, despacha al store.
// La capa UI suscribe store.on('lookedAt', …) para actualizar el DOM.
import * as THREE from 'three';
import { store, S } from '../state/store.js';

const ray  = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(), 0, 7.0);
const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();

// ── GRID ESPACIAL ─────────────────────────────────────────────
// Evita el scan O(N) por frame: agrupa interactables en celdas de 4 m.
const GRID_CELL = 4;
let _iGrid = new Map(); // "cx,cz" → Object3D[]

export function buildInteractableGrid() {
    _iGrid = new Map();
    for (const o of S.interactables) {
        const cx  = Math.floor(o.position.x / GRID_CELL);
        const cz  = Math.floor(o.position.z / GRID_CELL);
        const key = `${cx},${cz}`;
        if (!_iGrid.has(key)) _iGrid.set(key, []);
        _iGrid.get(key).push(o);
    }
}

// ── CHECK LOOK-AT ─────────────────────────────────────────────
// Llamado cada frame desde el loop principal.
// Despacha store.dispatch('lookedAt', sd|null) → la UI reacciona.
export function checkLookAt() {
    S.camera.getWorldPosition(_pos);
    S.camera.getWorldDirection(_dir);
    ray.set(_pos, _dir);

    const cx0 = Math.floor(_pos.x / GRID_CELL);
    const cz0 = Math.floor(_pos.z / GRID_CELL);
    const nearby = [];
    for (let dcx = -2; dcx <= 2; dcx++) {
        for (let dcz = -2; dcz <= 2; dcz++) {
            const cell = _iGrid.get(`${cx0 + dcx},${cz0 + dcz}`);
            if (cell) for (const o of cell) nearby.push(o);
        }
    }

    const hits = ray.intersectObjects(nearby);
    if (hits.length) {
        const sd = hits[0].object.userData.sd;
        if (sd !== S.lookedAt) store.dispatch('lookedAt', sd);
    } else {
        if (S.lookedAt !== null) store.dispatch('lookedAt', null);
    }
}
