// ── 3D: TRABAJADORES — MESHES Y ANIMACIÓN ─────────────────────
// Lógica puramente 3D: creación de meshes, simulación de movimiento.
// La capa UI (modales de selección) vive en src/ui/trabajadores-ui.js.
import * as THREE from 'three';
import { PICK_ARRIVE_R } from '../../js/shared/configuracion.js';
import { store, S } from '../state/store.js';
import { makeSmallSprite } from './sprites.js';
import { getFloorY } from './almacen.js';
import { astarRouteWaypoints } from '../core/grafo.js';
import { ctrlRoomPos } from '../core/picking-logic.js';
import { updatePickHUD } from '../ui/picking-ui.js';

const _BODY_PALETTE = [0x1D4ED8, 0x15803D, 0x7C3AED, 0xB45309, 0xBE123C, 0x0E7490];
const _HAT_PALETTE  = [0xFBBF24, 0xF97316, 0xEC4899, 0x34D399, 0x60A5FA, 0xA78BFA];
async function _fetchRoster() {
    try {
        const data = await fetch('/operarios').then(r => r.json());
        return data.map((w, i) => ({
            id:        i + 1,
            name:      w.nombre,
            bodyColor: _BODY_PALETTE[i % _BODY_PALETTE.length],
            hatColor:  _HAT_PALETTE[i % _HAT_PALETTE.length],
        }));
    } catch { return []; }
}
export const WORKERS_ROSTER = await _fetchRoster();

const MAT_COLLECTED = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.90 });
let _colorIdx = 0;

function _createMesh(entry) {
    const grp  = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.15, 8), new THREE.MeshLambertMaterial({ color: entry.bodyColor }));
    body.position.y = 0.58; body.castShadow = true; grp.add(body);
    const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.20, 8), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    vest.position.y = 0.85; grp.add(vest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffcc99 }));
    head.position.y = 1.35; grp.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: entry.hatColor }));
    helmet.position.y = 1.43; grp.add(helmet);
    const lbl = makeSmallSprite(entry.name);
    lbl.position.y = 1.95; grp.add(lbl);
    return grp;
}

export function spawnWorker(route, rosterEntry) {
    if (!route || route.length < 1) return;
    const entry    = rosterEntry ?? WORKERS_ROSTER[_colorIdx++ % WORKERS_ROSTER.length];
    const mesh     = _createMesh(entry);
    const { x: startX, z: startZ } = ctrlRoomPos();
    mesh.position.set(startX, getFloorY(startX, startZ), startZ);
    S.scene.add(mesh);
    const waypoints = astarRouteWaypoints([{ x: startX, z: startZ }, ...route.map(s => ({ x: s.x, z: s.z }))]);
    const collected = new Set();
    store.dispatch('activeWorkerCollected', collected);
    S.workers.push({ mesh, waypoints, wpIdx: 0, pos: new THREE.Vector2(startX, startZ), speed: 0.9 + Math.random() * 0.3, route: route.map(s => ({ x: s.x, z: s.z })), collectedStops: collected, rosterId: entry.id, rosterName: entry.name });
}

export function updateWorkers(delta) {
    for (let i = S.workers.length - 1; i >= 0; i--) {
        const w = S.workers[i];
        if (w.wpIdx >= w.waypoints.length) {
            w.mesh.traverse(ch => {
                if (ch.isSprite && ch.material) { ch.material.map?.dispose(); ch.material.dispose(); }
                else if (ch.isMesh) { ch.geometry?.dispose(); ch.material?.dispose(); }
            });
            S.scene.remove(w.mesh);
            S.workers.splice(i, 1);
            continue;
        }
        const tgt = w.waypoints[w.wpIdx];
        const dx  = tgt.x - w.pos.x, dz = tgt.z - w.pos.y;
        const d   = Math.sqrt(dx * dx + dz * dz);
        if (d < 0.2) {
            w.wpIdx++;
        } else {
            const step = w.speed * delta;
            w.pos.x += (dx / d) * step;
            w.pos.y += (dz / d) * step;
            let rotDelta = Math.atan2(dx, dz) - w.mesh.rotation.y;
            while (rotDelta >  Math.PI) rotDelta -= Math.PI * 2;
            while (rotDelta < -Math.PI) rotDelta += Math.PI * 2;
            w.mesh.rotation.y += rotDelta * Math.min(1, 8 * delta);
        }
        w.bobTime = (w.bobTime ?? 0) + delta;
        w.mesh.position.set(w.pos.x, getFloorY(w.pos.x, w.pos.y) + Math.abs(Math.sin(w.bobTime * 7)) * 0.03, w.pos.y);
        if (w.route && S.pickMarkerGrp) {
            for (let si = 0; si < w.route.length; si++) {
                if (w.collectedStops.has(si)) continue;
                const stop = w.route[si];
                if (Math.hypot(w.pos.x - stop.x, w.pos.y - stop.z) < PICK_ARRIVE_R) {
                    w.collectedStops.add(si);
                    for (const ch of S.pickMarkerGrp.children) {
                        if (ch.userData.stopIdx === si) { ch.material = MAT_COLLECTED; break; }
                    }
                    updatePickHUD();
                }
            }
        }
    }
}
