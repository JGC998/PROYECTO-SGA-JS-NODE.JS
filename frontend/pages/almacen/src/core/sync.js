// ── CORE: SINCRONIZACIÓN SSE ──────────────────────────────────
// Abre un EventSource a /events y reacciona a dos tipos de evento:
//   · data-changed   → recarga datos del almacén
//   · ruta-progreso  → notifica al supervisor cuando un operario valida una parada
import { refresh } from './datos.js';
import { buildInteractableGrid } from '../3d/raycast.js';
import { showToast } from '../../js/shared/utilidades.js';
import { store, S } from '../state/store.js';

export function initSync() {
    const ev = new EventSource('/api/almacen/events');

    ev.addEventListener('actualizado', ({ data }) => {
        try {
            const picking = JSON.parse(data);
            const completadas = picking.paradas.filter(p => p.completada).length;
            const total       = picking.paradas.length;
            const quien = picking.operario ? `👷 ${picking.operario}` : '👷 Operario';
            showToast(`${quien} — ${completadas}/${total} paradas completadas`, 4000);
            if (picking.id === S.activeRouteId && picking.lastValidatedIdx != null) {
                store.dispatch('rutaProgresoLocal', { idx: picking.lastValidatedIdx });
            }
        } catch {}
    });

    ev.addEventListener('incidencia', ({ data }) => {
        try {
            const picking = JSON.parse(data);
            const parada  = picking.paradas[picking.lastIncidenciaIdx];
            const last    = parada?.incidencias?.at(-1);
            if (last) {
                const quien = picking.operario ? ` · 👷 ${picking.operario}` : '';
                showToast(`⚠ Incidencia en ${parada.locKey ?? ''}${quien}`, 5000);
            }
        } catch {}
    });
}
