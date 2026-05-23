// ── CORE: SINCRONIZACIÓN SSE ──────────────────────────────────
// Abre un EventSource a /events y reacciona a dos tipos de evento:
//   · data-changed   → recarga datos del almacén
//   · ruta-progreso  → notifica al supervisor cuando un operario valida una parada
import { refresh } from './datos.js';
import { buildInteractableGrid } from '../3d/raycast.js';
import { showToast } from '../../js/shared/utilidades.js';
import { store, S } from '../state/store.js';

export function initSync() {
    const ev = new EventSource('/events');

    ev.onmessage = ({ data }) => {
        try {
            const msg = JSON.parse(data);

            if (msg.type === 'data-changed') {
                showToast('↺ Datos actualizados automáticamente', 2500);
                refresh().then(buildInteractableGrid);
                return;
            }

            if (msg.type === 'ruta-progreso') {
                const { id, idx, locKey, operario, completadas, total } = msg;
                const quien = operario ? `👷 ${operario}` : '👷 Operario';
                showToast(`${quien} — ${locKey} completada (${completadas}/${total})`, 4000);
                // Si la ruta activa en el visor coincide, actualizar marcador
                if (id === S.activeRouteId) {
                    store.dispatch('rutaProgresoLocal', { idx });
                }
            }
        } catch {}
    };
}
