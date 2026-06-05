(function () {
    const ICONOS = { picking: '📋', incidencia: '⚠️', backup: '💾', stock: '📦' };
    const listEl  = document.getElementById('notif-list');
    const countEl = document.getElementById('notif-count');

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function fmtTs(iso) {
        try {
            return new Date(iso).toLocaleString('es-ES',
                { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    }

    function render(notifs) {
        if (countEl) countEl.textContent = notifs.length
            ? `${notifs.length} evento${notifs.length !== 1 ? 's' : ''}`
            : '';
        if (!notifs.length) {
            listEl.innerHTML = '<p class="notif-empty">Sin notificaciones</p>';
            return;
        }
        listEl.innerHTML = notifs.map(n => `
            <div class="notif-card notif-${esc(n.tipo)}">
                <span class="notif-icon">${ICONOS[n.tipo] ?? '🔔'}</span>
                <div>
                    <div class="notif-titulo">${esc(n.titulo)}</div>
                    <div class="notif-desc">${esc(n.descripcion)}</div>
                </div>
                <time class="notif-ts" title="${esc(n.ts)}">${fmtTs(n.ts)}</time>
            </div>`).join('');
    }

    async function cargar() {
        try {
            const r = await fetch('/api/almacen/notificaciones');
            render(r.ok ? await r.json() : []);
        } catch { render([]); }
        try { localStorage.setItem('sga-notif-unread', '0'); } catch {}
    }

    document.getElementById('btn-limpiar').addEventListener('click', async () => {
        if (!confirm('¿Limpiar el historial de notificaciones?')) return;
        try {
            const k = localStorage.getItem('sga-api-key') || '';
            await fetch('/api/almacen/notificaciones/limpiar',
                { method: 'POST', headers: { 'x-api-key': k } });
            try { localStorage.setItem('sga-notif-unread', '0'); } catch {}
            render([]);
        } catch { alert('Error al limpiar notificaciones'); }
    });

    cargar();
})();
