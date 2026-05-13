import * as THREE from 'three';
import { PICK_ARRIVE_R } from './configuracion.js';
import { S, pauseGame, resumeGame, clearKeys } from './estado.js';
import { esc, showToast } from './utilidades.js';
import { makeSmallSprite } from './sprites.js';
import { getFloorY } from './almacen.js';
import { aisleRouteWaypoints, updatePickHUD } from './picking.js';

// ── ROSTER ────────────────────────────────────────────────────
export const WORKERS_ROSTER = [
    { id: 1, name: 'Carlos',  bodyColor: 0x1d4ed8, hatColor: 0xfbbf24 },
    { id: 2, name: 'María',   bodyColor: 0x15803d, hatColor: 0xef4444 },
    { id: 3, name: 'Pedro',   bodyColor: 0x7f1d1d, hatColor: 0xfbbf24 },
    { id: 4, name: 'Ana',     bodyColor: 0x6d28d9, hatColor: 0xf9fafb },
    { id: 5, name: 'Luis',    bodyColor: 0xc2410c, hatColor: 0x3b82f6 },
];

let _workerColorIdx = 0;

function _createWorkerMesh(entry) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 1.15, 8),
        new THREE.MeshLambertMaterial({ color: entry.bodyColor })
    );
    body.position.y = 0.58; body.castShadow = true; grp.add(body);
    const vest = new THREE.Mesh(
        new THREE.CylinderGeometry(0.225, 0.225, 0.20, 8),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    vest.position.y = 0.85; grp.add(vest);
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0xffcc99 })
    );
    head.position.y = 1.35; grp.add(head);
    const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: entry.hatColor })
    );
    helmet.position.y = 1.43; grp.add(helmet);
    const nameLbl = makeSmallSprite(entry.name);
    nameLbl.position.y = 1.95; grp.add(nameLbl);
    return grp;
}

export function spawnWorker(route, rosterEntry) {
    if (!route || route.length < 1) return;
    const entry  = rosterEntry ?? WORKERS_ROSTER[_workerColorIdx++ % WORKERS_ROSTER.length];
    const mesh   = _createWorkerMesh(entry);
    const startX = route[0].x, startZ = route[0].z;
    mesh.position.set(startX, getFloorY(startX, startZ), startZ);
    S.scene.add(mesh);
    const rawStops  = route.map(s => ({ x: s.x, z: s.z }));
    const waypoints = aisleRouteWaypoints([{ x: startX, z: startZ }, ...rawStops.slice(1)]);
    S.activeWorkerCollected = new Set();
    S.workers.push({
        mesh, waypoints, wpIdx: 0,
        pos: new THREE.Vector2(startX, startZ),
        speed: 0.9 + Math.random() * 0.3,
        route: route.map(s => ({ x: s.x, z: s.z })),
        collectedStops: S.activeWorkerCollected,
        rosterId: entry.id,
        rosterName: entry.name,
    });
    showToast(`👷 ${entry.name} asignado/a a la ruta`, 2500);
}

export function showWorkerModal(route) {
    S.workerModalOpen = true;
    clearKeys();
    pauseGame();
    const grid = document.getElementById('wm-grid');
    grid.innerHTML = WORKERS_ROSTER.map(entry => {
        const busy    = S.workers.find(w => w.rosterId === entry.id);
        const bodyHex = '#' + entry.bodyColor.toString(16).padStart(6, '0');
        const hatHex  = '#' + entry.hatColor.toString(16).padStart(6, '0');
        return `<button class="wm-card${busy ? ' wm-busy' : ''}" data-id="${entry.id}" ${busy ? 'disabled' : ''}>
            <div class="wm-figure">
                <div class="wm-hat" style="background:${hatHex}"></div>
                <div class="wm-body" style="background:${bodyHex}"><div class="wm-vest"></div></div>
            </div>
            <div class="wm-name">${esc(entry.name)}</div>
            <div class="wm-status">${busy ? '&#128260; En ruta' : '&#10003; Disponible'}</div>
        </button>`;
    }).join('');
    grid.querySelectorAll('.wm-card:not(.wm-busy)').forEach(btn => {
        btn.addEventListener('click', () => {
            const entry = WORKERS_ROSTER.find(e => e.id === +btn.dataset.id);
            closeWorkerModal(true);
            spawnWorker(route, entry);
        });
    });
    document.getElementById('worker-modal').style.display = 'flex';
}

export function closeWorkerModal(andResume = false) {
    S.workerModalOpen = false;
    document.getElementById('worker-modal').style.display = 'none';
    if (andResume) resumeGame();
}

export function assignRoute() {
    if (!S.pickRoute.length) return;
    showWorkerModal([...S.pickRoute]);
}

export function updateWorkers(delta) {
    for (let i = S.workers.length - 1; i >= 0; i--) {
        const w = S.workers[i];
        if (w.wpIdx >= w.waypoints.length) {
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
            w.mesh.rotation.y = Math.atan2(dx, dz);
        }
        const fy = getFloorY(w.pos.x, w.pos.y);
        w.mesh.position.set(w.pos.x, fy + Math.sin(Date.now() * 0.007) * 0.03, w.pos.y);
        if (w.route && S.pickMarkerGrp) {
            for (let si = 0; si < w.route.length; si++) {
                if (w.collectedStops.has(si)) continue;
                const stop = w.route[si];
                if (Math.hypot(w.pos.x - stop.x, w.pos.y - stop.z) < PICK_ARRIVE_R) {
                    w.collectedStops.add(si);
                    for (const ch of S.pickMarkerGrp.children) {
                        if (ch.userData.stopIdx === si) {
                            ch.material = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.90 });
                            break;
                        }
                    }
                    updatePickHUD();
                }
            }
        }
    }
}

// ── EVENT LISTENERS ───────────────────────────────────────────
document.getElementById('wm-cls').addEventListener('click', () => closeWorkerModal(true));
document.getElementById('ph-assign').addEventListener('click', assignRoute);
