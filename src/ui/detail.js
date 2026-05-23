// ── UI: PANEL DE DETALLE DE ESTANTERÍA ───────────────────────
// Responsabilidad: DOM puro — muestra el detalle de niveles de stock.
// Se abre cuando S.pendingShelf es despachado tras desbloquear el puntero.
import { store, S, pauseGame, resumeGame } from '../state/store.js';
import { esc } from '../../js/shared/utilidades.js';
import { teleportTo } from '../3d/almacen.js';

export function openDetail(sd) {
    store.dispatch('detailOpen', true);
    pauseGame();

    const locKey    = `P${String(sd.unit.pasillo).padStart(2,'0')}-${sd.unit.lado}-X${String(sd.unit.col).padStart(2,'0')}`;
    const ladoLabel = sd.unit?.lado === 'I' ? 'izq.' : 'der.';

    document.getElementById('det-cod').textContent = locKey;
    document.getElementById('det-sub').textContent =
        `Pasillo ${String(sd.unit?.pasillo ?? '?').padStart(2,'0')} · lado ${ladoLabel} · columna ${String(sd.unit?.col ?? '?').padStart(2,'0')}`;

    const sorted = [...sd.unit.niveles].sort((a, b) => b.nivel - a.nivel);
    let maxTotal = 1, totalUnits = 0, nFull = 0, nEmpty = 0, nUnk = 0;
    const shelfArtCodes = new Set();
    for (const { ubi } of sorted) {
        const k   = ubi.ubicacion ?? ubi.codigo ?? '';
        const stk = sd.stockIdx?.[k];
        if (stk?.total > 0) {
            nFull++; totalUnits += stk.total;
            if (stk.total > maxTotal) maxTotal = stk.total;
            for (const a of (stk.arts ?? [])) {
                const cod = String(a.articulo ?? a.STOART ?? '').trim();
                if (cod) shelfArtCodes.add(cod);
            }
        } else if (stk) { nEmpty++; } else { nUnk++; }
    }

    const firstFull = sorted.find(({ ubi }) => (sd.stockIdx?.[ubi.ubicacion ?? ubi.codigo ?? '']?.total ?? 0) > 0);
    const headArt   = firstFull ? sd.stockIdx?.[firstFull.ubi?.ubicacion ?? firstFull.ubi?.codigo ?? '']?.arts?.[0] : null;
    document.getElementById('det-tit').textContent = headArt?.nombre ?? headArt?.articulo ?? locKey;

    document.querySelectorAll('.det-stat').forEach(el => el.style.display = '');
    document.getElementById('ds-tot').textContent   = sorted.length;
    document.getElementById('ds-stk').textContent   = nFull;
    document.getElementById('ds-emp').textContent   = nEmpty;
    document.getElementById('ds-units').textContent = totalUnits > 0 ? totalUnits.toLocaleString('es-ES') : '—';

    document.getElementById('det-body').innerHTML = sorted.map(({ nivel, ubi }) => {
        const k   = ubi.ubicacion ?? ubi.codigo ?? '';
        const stk = sd.stockIdx?.[k];
        const ubiLabel = `<span class="dlv-ubi-lbl">${esc(k)}</span>`;
        if (stk?.total > 0) {
            const rows = (stk.arts ?? []).map(a => {
                const qty = Number(a.stock ?? a.STOCAN ?? 0);
                const pct = Math.max(3, Math.round((qty / maxTotal) * 100));
                const nom = esc((a.nombre ?? a.articulo ?? '').substring(0, 44));
                const cod = esc(a.articulo ?? a.STOART ?? '');
                return `<div class="dlv-art"><div class="dlv-art-body">
                    <div class="dlv-art-top"><span class="dlv-cod">${cod}</span><span class="dlv-qty">${qty.toLocaleString('es-ES')} uds</span></div>
                    <div class="dlv-name">${nom}</div>
                    <div class="dlv-bar"><div class="dlv-bar-fill" style="width:${pct}%"></div></div>
                </div></div>`;
            }).join('');
            return `<div class="dlv-row dlv-full"><div class="dlv-nv">Nv${nivel}${ubiLabel}</div><div class="dlv-arts">${rows}</div></div>`;
        }
        if (stk) return `<div class="dlv-row dlv-empty"><div class="dlv-nv">Nv${nivel}${ubiLabel}</div><span class="dlv-empty-lbl">Vacía</span></div>`;
        return `<div class="dlv-row dlv-unk"><div class="dlv-nv">Nv${nivel}${ubiLabel}</div><span class="dlv-empty-lbl">Sin datos</span></div>`;
    }).join('');

    // Otras ubicaciones de los mismos artículos
    const otherLocsEl = document.getElementById('det-other-locs');
    const otherBodyEl = document.getElementById('det-other-body');
    if (shelfArtCodes.size > 0) {
        const seen = new Set(), otherRows = [];
        for (const e of S.artEntries) {
            if (!shelfArtCodes.has(e.artCode) || e.locKey === locKey || e.qty <= 0) continue;
            const uid = `${e.artCode}|${e.locKey}`;
            if (seen.has(uid)) continue;
            seen.add(uid);
            otherRows.push(e);
            if (otherRows.length >= 12) break;
        }
        if (otherRows.length > 0) {
            otherBodyEl.innerHTML = otherRows.map((e, i) =>
                `<div class="det-oc-row">
                    <span class="det-oc-loc">${esc(e.locKey)}</span>
                    <div class="det-oc-info"><span class="det-oc-art">${esc(e.artCode)}</span><span class="det-oc-name">${esc(e.artName)}</span></div>
                    <span class="det-oc-qty">${e.qty.toLocaleString('es-ES')} uds</span>
                    <button class="det-oc-goto" data-i="${i}">↗ Ir</button>
                </div>`
            ).join('');
            otherBodyEl.onclick = e => {
                const btn = e.target.closest('.det-oc-goto');
                if (!btn) return;
                const entry = otherRows[+btn.dataset.i];
                if (!entry) return;
                const loc = S.LOCATION_MAP.get(entry.locKey);
                if (loc) { closeDetail(false); teleportTo(loc); resumeGame(); }
            };
            otherLocsEl.style.display = '';
        } else {
            otherLocsEl.style.display = 'none';
        }
    } else {
        otherLocsEl.style.display = 'none';
    }

    document.getElementById('detail').style.display = 'flex';
}

export function closeDetail(relock = true) {
    store.dispatch('detailOpen', false);
    document.getElementById('detail').style.display = 'none';
    document.getElementById('pause').style.display  = 'none';
    if (relock) resumeGame();
}

// ── EVENT LISTENERS ───────────────────────────────────────────
document.getElementById('det-cls').addEventListener('click', () => closeDetail(true));
