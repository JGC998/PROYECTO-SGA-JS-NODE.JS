// ── UI: PANEL DE TELETRANSPORTE ───────────────────────────────
// Responsabilidad: DOM puro — muestra resultados de búsqueda y teletransporta.
// Suscribe store.on('teleportOpen', …) para mostrar/ocultar el panel.
import { store, S, clearKeys, resumeGame, pauseGame } from '../state/store.js';
import { esc } from '../../js/shared/utilidades.js';
import { teleportTo } from '../3d/almacen.js';
import { searchLocations, searchArticles } from '../core/datos.js';

let _activeIndex = -1;

export function openTeleport() {
    if (!S.controls?.isLocked) return;
    clearKeys();
    store.dispatch('teleportOpen', true);
    pauseGame();
    document.getElementById('teleport').style.display = 'flex';
    const input = document.getElementById('tp-input');
    input.value = '';
    setTimeout(() => input.focus(), 30);
    _renderResults('');
}

export function closeTeleport(andLock = false) {
    store.dispatch('teleportOpen', false);
    _activeIndex = -1;
    document.getElementById('teleport').style.display = 'none';
    if (andLock) resumeGame();
}

function _renderResults(val) {
    const locResults = searchLocations(val);
    const artResults = val.trim().length >= 2 ? searchArticles(val) : [];
    const el = document.getElementById('tp-results');
    _activeIndex = -1;
    if (!locResults.length && !artResults.length) {
        el.innerHTML = `<div class="tp-empty">Sin resultados</div>`;
        return;
    }
    const clickData = [];
    let html = '';
    for (const r of locResults) {
        const icon = r.key.includes('-X') ? '📍' : '🏭';
        const i = clickData.length;
        clickData.push({ x: r.x, z: r.z, yaw: r.yaw });
        html += `<button class="tp-result" data-i="${i}">${icon} <span>${esc(r.key)}</span></button>`;
    }
    if (artResults.length) {
        if (locResults.length) html += `<div class="tp-sep">Artículos</div>`;
        for (const r of artResults) {
            const i = clickData.length;
            clickData.push({ x: r.x, z: r.z, yaw: r.yaw });
            html += `<button class="tp-result tp-art" data-i="${i}">
                <div class="tp-art-top">
                    <span class="tp-art-code">📦 ${esc(r.artCode)}</span>
                    <span class="tp-art-loc">${esc(r.locKey)}</span>
                </div>
                ${r.artName ? `<div class="tp-art-name">${esc(r.artName.substring(0, 42))}</div>` : ''}
            </button>`;
        }
    }
    el.innerHTML = html;
    el.querySelectorAll('.tp-result').forEach(btn => {
        btn.addEventListener('click', () => {
            const loc = clickData[+btn.dataset.i];
            if (loc) { teleportTo(loc); closeTeleport(true); }
        });
    });
}

function _nav(dir) {
    const btns = document.querySelectorAll('.tp-result');
    if (!btns.length) return;
    _activeIndex = Math.max(0, Math.min(btns.length - 1, _activeIndex + dir));
    btns.forEach((b, i) => b.classList.toggle('active', i === _activeIndex));
    btns[_activeIndex]?.scrollIntoView({ block: 'nearest' });
}

// ── EVENT LISTENERS ───────────────────────────────────────────
document.getElementById('tp-input').addEventListener('input',   e => _renderResults(e.target.value));
document.getElementById('tp-input').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); _nav(+1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); _nav(-1); return; }
    if (e.key === 'Enter') {
        const active = document.querySelector('.tp-result.active') ?? document.querySelector('.tp-result');
        if (active) active.click();
        return;
    }
    if (e.key === 'Escape') closeTeleport(true);
});
document.getElementById('tp-cls').addEventListener('click', () => closeTeleport(true));
