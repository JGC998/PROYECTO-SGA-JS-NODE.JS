// ── UTILIDADES PURAS ──────────────────────────────────────────

export function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function parseEtiqueta(etq) {
    if (!etq) return null;
    const p = etq.match(/P(\d+)/i), x = etq.match(/X(\d+)/i),
          y = etq.match(/Y(\d+)/i), l = etq.match(/\b([ID])\b/i);
    if (!p || !x || !y) return null;
    return { pasillo: +p[1], lado: l ? l[1].toUpperCase() : 'I', col: +x[1], nivel: +y[1] };
}

let _toastTimer = null;
export function showToast(msg, ms = 4000) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.style.display = 'none'; }, ms);
}
