// ── UI: PANEL PEEK (info al apuntar) ─────────────────────────
// Responsabilidad: DOM puro — muestra niveles de la estantería bajo el cursor.
// Se suscribe a store.on('lookedAt', …); no importa Three.js.
import { store, S } from '../state/store.js';
import { esc } from '../../js/shared/utilidades.js';

export function updatePeekPanel(sd) {
    const el = document.getElementById('peek-panel');
    if (!el) return;
    const locKey = `P${String(sd.unit.pasillo).padStart(2,'0')}-${sd.unit.lado}-X${String(sd.unit.col).padStart(2,'0')}`;
    document.getElementById('peek-code').textContent = locKey;
    const sorted = [...sd.unit.niveles].sort((a, b) => b.nivel - a.nivel);
    document.getElementById('peek-levels').innerHTML = sorted.map(({ nivel, ubi }) => {
        const k   = ubi.ubicacion ?? ubi.codigo ?? '';
        const stk = sd.stockIdx?.[k];
        const cur = nivel === sd.nivel;
        if (stk && stk.total > 0) {
            const arts = (stk.arts ?? []).map(a => {
                const nom = esc((a.nombre ?? a.articulo ?? '').substring(0, 30));
                const qty = Number(a.stock ?? a.STOCAN ?? 0);
                return `<div class="pk-art"><span class="pk-name">${nom}</span><span class="pk-qty">${qty.toLocaleString('es-ES')}</span></div>`;
            }).join('');
            return `<div class="pk-lv pk-lv-full${cur ? ' pk-lv-cur' : ''}"><span class="pk-nv">Nv${nivel}</span><div class="pk-arts">${arts}</div></div>`;
        }
        if (stk) return `<div class="pk-lv pk-lv-empty${cur ? ' pk-lv-cur' : ''}"><span class="pk-nv">Nv${nivel}</span><span class="pk-empty">Vacía</span></div>`;
        return `<div class="pk-lv pk-lv-unk${cur ? ' pk-lv-cur' : ''}"><span class="pk-nv">Nv${nivel}</span><span class="pk-empty">Sin datos</span></div>`;
    }).join('');
    el.style.display = 'block';
    document.getElementById('xhair').classList.add('hit');
    document.getElementById('prompt').style.display = 'block';
}

export function clearPeekPanel() {
    const el = document.getElementById('peek-panel');
    if (el) el.style.display = 'none';
    document.getElementById('xhair')?.classList.remove('hit');
    const prompt = document.getElementById('prompt');
    if (prompt) prompt.style.display = 'none';
}

// ── REACTIVIDAD: lookedAt → peek panel ───────────────────────
store.on('lookedAt', sd => {
    if (sd) updatePeekPanel(sd);
    else    clearPeekPanel();
});
