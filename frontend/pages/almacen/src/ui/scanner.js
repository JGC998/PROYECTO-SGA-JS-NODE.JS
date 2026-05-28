// ── UI: MODO ESCÁNER (pistola de códigos de barras) ──────────
// Responsabilidad: capturar códigos de barras de una pistola USB HID
// (el lector emula teclado: envía caracteres + Enter por cada lectura).
// Añade el artículo escaneado directamente a la lista de picking.
import { store, S, pauseGame, resumeGame } from '../state/store.js';
import { getArtMap } from '../core/datos.js';
import { addPickItem } from './picking-ui.js';
import { showToast, esc } from '../../js/shared/utilidades.js';

const MAX_LOG = 6;
let _scanLog = [];  // [{ code, name, ok }]

const _panel = document.getElementById('scanner-panel');
const _input = document.getElementById('scanner-input');
const _logEl = document.getElementById('scanner-log');

export function openScanner() {
    if (S.scannerOpen) return;
    store.dispatch('scannerOpen', true);
    pauseGame();
    _panel.style.display = 'flex';
    _input.value = '';
    setTimeout(() => _input.focus(), 50);
}

export function closeScanner() {
    if (!S.scannerOpen) return;
    store.dispatch('scannerOpen', false);
    _panel.style.display = 'none';
    resumeGame();
}

function _processScan(raw) {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    const art = getArtMap().get(code);
    const entry = { code, name: art?.artName ?? '(no encontrado)', ok: !!art };
    _scanLog.unshift(entry);
    if (_scanLog.length > MAX_LOG) _scanLog.length = MAX_LOG;
    if (art) {
        addPickItem(code, art.artName, 1);
        showToast(`+ ${code} — ${art.artName.substring(0, 28)}`, 2000);
    } else {
        showToast(`⚠ Código no encontrado: ${code}`, 3000);
    }
    _renderLog();
}

function _renderLog() {
    if (!_logEl) return;
    _logEl.innerHTML = _scanLog.length
        ? _scanLog.map(e => `<div class="sc-row ${e.ok ? 'sc-ok' : 'sc-err'}">
            <span class="sc-code">${esc(e.code)}</span>
            <span class="sc-name">${esc(e.name.substring(0, 32))}</span>
        </div>`).join('')
        : '<div class="sc-empty">Ninguno todavía</div>';
}

_input?.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { closeScanner(); return; }
    if (e.key === 'Enter') {
        const val = _input.value;
        _input.value = '';
        _processScan(val);
    }
});

document.getElementById('sc-cls')?.addEventListener('click', closeScanner);

// Estado inicial del log
_renderLog();
