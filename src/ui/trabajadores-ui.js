// ── UI: TRABAJADORES — MODAL DE SELECCIÓN ─────────────────────
// DOM puro: modal de selección de operario y modal de simulación.
// La lógica 3D (meshes, animación) vive en src/3d/trabajadores-3d.js.
import { store, S, pauseGame, resumeGame, clearKeys } from '../state/store.js';
import { esc, showToast } from '../../js/shared/utilidades.js';
import { WORKERS_ROSTER, spawnWorker } from '../3d/trabajadores-3d.js';

export function showWorkerModal(route) {
    store.dispatch('workerModalOpen', true);
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
            store.dispatch('assignedWorker', { id: entry.id, name: entry.name });
            closeWorkerModal(false);
            _showSimModal(route, entry);
        });
    });
    document.getElementById('worker-modal').style.display = 'flex';
}

function _showSimModal(route, entry) {
    store.dispatch('simModalOpen', true);
    document.getElementById('sim-worker-name').textContent = entry.name;
    document.getElementById('sim-modal').style.display = 'flex';
    document.getElementById('sim-yes').onclick = () => {
        closeSimModal();
        spawnWorker(route, entry);
        resumeGame();
        showToast(`👷 ${entry.name} asignado/a · simulación activa`, 3000);
    };
    document.getElementById('sim-no').onclick = () => {
        closeSimModal();
        resumeGame();
        showToast(`👷 ${entry.name} asignado/a a la ruta`, 2500);
    };
}

export function closeSimModal() {
    store.dispatch('simModalOpen', false);
    document.getElementById('sim-modal').style.display = 'none';
}

export function closeWorkerModal(andResume = false) {
    store.dispatch('workerModalOpen', false);
    document.getElementById('worker-modal').style.display = 'none';
    if (andResume) resumeGame();
}

export function assignRoute() {
    if (!S.pickRoute.length) return;
    showWorkerModal([...S.pickRoute]);
}

// ── EVENT LISTENERS ───────────────────────────────────────────
document.getElementById('wm-cls').addEventListener('click', () => {
    closeWorkerModal(false);
    document.getElementById('pause').style.display = 'flex';
});
