/* SGA LIN — Interfaz móvil de picking */
(function () {
    'use strict';

    const params  = new URLSearchParams(location.search);
    const RUTA_ID = params.get('ruta');
    const app     = document.getElementById('app');

    // ── MODO OSCURO ───────────────────────────────────────────────
    (function initDarkMode() {
        const saved = localStorage.getItem('sga-dark');
        if (saved === 'true' || saved === null) document.body.classList.add('dark');
    })();

    // ── UTILIDADES ────────────────────────────────────────────────
    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function showToastMob(msg) {
        const t = document.createElement('div');
        t.className = 'toast-mob';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }

    function showError(msg) {
        app.innerHTML = `<div class="error-screen"><p>&#9888; ${esc(msg)}</p><button class="retry-btn">&#8635; Reintentar</button></div>`;
        app.querySelector('.retry-btn').addEventListener('click', () => location.reload());
    }

    // Traduce "P001 D X009 Y03" o "P06-D-X09" a texto legible
    function locLabel(locKey) {
        if (!locKey) return locKey;
        // Normalizar: reemplazar guiones por espacios si usa el formato P06-D-X09
        const s = locKey.replace(/-/g, ' ');
        // Extraer partes con regex flexible
        const m = s.match(/P(\d+)\s+([DIdi])\s+X(\d+)\s+Y(\d+)/i);
        if (!m) return locKey; // formato desconocido, devolver tal cual
        const pasillo  = parseInt(m[1], 10);
        const lado     = m[2].toUpperCase() === 'D' ? 'Derecho' : 'Izquierdo';
        const estant   = parseInt(m[3], 10);
        const altura   = parseInt(m[4], 10);
        return `Pasillo ${pasillo} · Lado ${lado} · Estantería ${estant} · Altura ${altura}`;
    }

    // ── CARGA DE LA RUTA ──────────────────────────────────────────
    async function cargarRuta() {
        if (!RUTA_ID) { showError('No se especificó una ruta. Escanea el QR de tu lista de picking.'); return; }
        try {
            const resp = await fetch(`/picking/${RUTA_ID}`);
            if (!resp.ok) throw new Error('Picking no encontrado. Comprueba que el QR sea correcto.');
            return await resp.json();
        } catch (err) {
            showError(err.message);
        }
    }

    // ── RENDERIZADO PRINCIPAL ─────────────────────────────────────
    function render(ruta) {
        const completadas = ruta.paradas.filter(p => p.completada).length;
        const total       = ruta.paradas.length;
        const idx         = ruta.paradas.findIndex(p => !p.completada);

        if (idx === -1) {
            renderDone(ruta, completadas, total);
            return;
        }

        const parada  = ruta.paradas[idx];
        const pct     = Math.round((completadas / total) * 100);
        const distTxt = parada.distFromPrev > 0 ? `~${Math.round(parada.distFromPrev)} m` : '';
        const locText = locLabel(parada.locKey);
        const incCount = parada.incidencias?.length ?? 0;

        app.innerHTML = `
<header class="hdr">
    <div class="hdr-top">
        <span class="hdr-nombre">${esc(ruta.nombre ?? ruta.docNum)}</span>
        <div class="hdr-tools">
            ${ruta.operario ? `<span class="hdr-operario">&#128119; ${esc(ruta.operario)}</span>` : ''}
            <button class="btn-dark" id="btn-dark" title="Modo oscuro/claro">&#9728;</button>
        </div>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="progress-text">${completadas} / ${total} paradas &middot; ${pct}%</div>
</header>

<main class="card">
    <div class="stop-meta">
        <span class="stop-num">Parada ${idx + 1} de ${total}</span>
        ${distTxt ? `<span class="stop-dist">${distTxt} desde anterior</span>` : ''}
    </div>
    <div class="stop-loc">${esc(parada.locKey)}</div>
    <div class="stop-loc-label">${esc(locText)}</div>
    <div class="items-hdr">Art&#237;culos a recoger</div>
    <div class="items-list">
        ${parada.items.map(it => `
        <div class="item-row">
            <span class="item-qty">&#215;${it.qtyTake}</span>
            <div class="item-info">
                <span class="item-code">${esc(it.artCode)}</span>
                <span class="item-name">${esc(it.artName ?? '')}</span>
            </div>
        </div>`).join('')}
    </div>
    ${incCount ? `<div class="inc-banner">&#9888; ${incCount} incidencia${incCount > 1 ? 's' : ''} registrada${incCount > 1 ? 's' : ''}</div>` : ''}
</main>

<footer class="foot">
    <!-- Input de cantidad real -->
    <div class="qty-row">
        <label class="qty-label">Unidades recogidas:</label>
        <div class="qty-ctrl">
            <button class="qty-adj" id="qty-dec">&#8722;</button>
            <input id="qty-input" class="qty-inp" type="number" min="0"
                value="${parada.items.reduce((s, i) => s + i.qtyTake, 0)}">
            <button class="qty-adj" id="qty-inc">+</button>
        </div>
    </div>
    <button class="btn-validar" id="btn-val">&#10003; Validar parada</button>
    <div class="foot-nav">
        <button class="btn-nav" id="btn-inc">&#9888; Incidencia</button>
        <button class="btn-nav" id="btn-reload">&#8635; Actualizar</button>
        ${ruta.operario ? `<button class="btn-nav" id="btn-hist">&#128203; Mis rutas</button>` : ''}
    </div>
</footer>

<!-- MODAL INCIDENCIA -->
<div id="inc-modal" class="modal-overlay" style="display:none">
    <div class="modal-box">
        <div class="modal-hdr">&#9888; Reportar incidencia</div>
        <select id="inc-tipo" class="inc-select">
            <option value="stock">Stock insuficiente</option>
            <option value="danado">Artículo dañado</option>
            <option value="ubicacion">Ubicación incorrecta</option>
            <option value="otro">Otro</option>
        </select>
        <textarea id="inc-texto" class="inc-textarea" placeholder="Describe la incidencia…" rows="3"></textarea>
        <div class="modal-btns">
            <button id="inc-cancel" class="btn-modal-sec">Cancelar</button>
            <button id="inc-send"   class="btn-modal-pri">&#9888; Enviar</button>
        </div>
    </div>
</div>`;

        document.getElementById('btn-val').addEventListener('click', () => {
            const qty = parseInt(document.getElementById('qty-input').value, 10);
            validar(idx, isNaN(qty) ? null : qty);
        });
        document.getElementById('btn-reload').addEventListener('click', init);
        document.getElementById('btn-dark').addEventListener('click', toggleDark);

        const qtyInp = document.getElementById('qty-input');
        document.getElementById('qty-dec').addEventListener('click', () => {
            qtyInp.value = Math.max(0, (parseInt(qtyInp.value, 10) || 0) - 1);
        });
        document.getElementById('qty-inc').addEventListener('click', () => {
            qtyInp.value = (parseInt(qtyInp.value, 10) || 0) + 1;
        });

        const btnInc = document.getElementById('btn-inc');
        btnInc.addEventListener('click', () => {
            document.getElementById('inc-modal').style.display = 'flex';
        });
        document.getElementById('inc-cancel').addEventListener('click', () => {
            document.getElementById('inc-modal').style.display = 'none';
            btnInc.focus();
        });
        document.getElementById('inc-send').addEventListener('click', () => reportarIncidencia(idx, ruta));

        const histBtn = document.getElementById('btn-hist');
        if (histBtn) histBtn.addEventListener('click', () => renderHistorial(ruta.operario));
    }

    // ── PANTALLA COMPLETADA ───────────────────────────────────────
    function renderDone(ruta, completadas, total) {
        const items   = ruta.paradas.reduce((s, p) => s + p.items.reduce((si, i) => si + i.qtyTake, 0), 0);
        const primero = ruta.paradas.find(p => p.timestamp);
        const ultimo  = [...ruta.paradas].reverse().find(p => p.timestamp);
        let tiempoTxt = '—';
        if (primero && ultimo && primero !== ultimo) {
            const ms   = new Date(ultimo.timestamp) - new Date(primero.timestamp);
            const mins = Math.floor(ms / 60000);
            const secs = Math.floor((ms % 60000) / 1000);
            tiempoTxt  = `${mins}m ${secs}s`;
        }
        const incTotal = ruta.paradas.reduce((s, p) => s + (p.incidencias?.length ?? 0), 0);
        app.innerHTML = `
<div class="done-screen">
    <div class="done-icon">&#10003;</div>
    <h1>&#161;Ruta completada!</h1>
    <p>${esc(ruta.docNum)}</p>
    ${ruta.operario ? `<p>&#128119; ${esc(ruta.operario)}</p>` : ''}
    <div class="done-resumen">
        <div class="done-stat"><div class="done-stat-v">${completadas}</div><div class="done-stat-l">Paradas</div></div>
        <div class="done-stat"><div class="done-stat-v">${items}</div><div class="done-stat-l">Unidades</div></div>
        <div class="done-stat" style="grid-column:span 2"><div class="done-stat-v">${tiempoTxt}</div><div class="done-stat-l">Tiempo</div></div>
        ${incTotal ? `<div class="done-stat" style="grid-column:span 2"><div class="done-stat-v" style="color:#f59e0b">${incTotal}</div><div class="done-stat-l">Incidencias</div></div>` : ''}
    </div>
    ${ruta.operario ? `<button class="btn-hist-done" id="btn-hist-done">&#128203; Ver mis rutas anteriores</button>` : ''}
    <button class="btn-dark-done" id="btn-dark-done">&#9728; Cambiar modo</button>
</div>`;
        document.getElementById('btn-dark-done')?.addEventListener('click', toggleDark);
        document.getElementById('btn-hist-done')?.addEventListener('click', () => renderHistorial(ruta.operario));
    }

    // ── HISTORIAL DEL OPERARIO ────────────────────────────────────
    async function renderHistorial(operario) {
        app.innerHTML = '<div class="splash"><div class="spin"></div><p>Cargando historial…</p></div>';
        try {
            const r = await fetch('/picking');
            if (!r.ok) throw new Error('No se pudo cargar el historial');
            const all = await r.json();
            const mias = all.filter(p => p.operario === operario);
            if (!mias.length) {
                app.innerHTML = `<div class="error-screen"><p>No hay rutas anteriores para ${esc(operario)}</p>
                    <button id="btn-back" style="margin-top:16px;padding:10px 20px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:1rem;cursor:pointer">&#8592; Volver</button></div>`;
                app.querySelector('#btn-back').addEventListener('click', () => history.back());
                return;
            }
            const rows = mias.map(p => {
                const completadas = p.paradas.filter(s => s.completada).length;
                const total       = p.paradas.length;
                const pct         = total ? Math.round((completadas / total) * 100) : 0;
                const fecha       = new Date(p.fecha).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
                const estado      = p.estado === 'completada' ? '&#10003; Completada' : `${completadas}/${total} paradas`;
                const stateClass  = p.estado === 'completada' ? 'hist-done' : 'hist-active';
                return `<div class="hist-card ${stateClass}">
                    <div class="hist-doc">${esc(p.docNum)}</div>
                    <div class="hist-fecha">${fecha}</div>
                    <div class="hist-estado">${estado}</div>
                    <div class="hist-bar"><div class="hist-fill" style="width:${pct}%"></div></div>
                    ${p.id === RUTA_ID ? '<div class="hist-current">&#x2192; Esta ruta</div>' : `<a class="hist-link" href="/movil?ruta=${p.id}">Abrir</a>`}
                </div>`;
            }).join('');
            app.innerHTML = `
<header class="hdr">
    <div class="hdr-top">
        <span class="hdr-nombre">&#128203; Mis rutas &mdash; ${esc(operario)}</span>
        <button class="btn-dark" id="btn-dark2">&#9728;</button>
    </div>
</header>
<div class="hist-list">${rows}</div>
<div style="padding:16px">
    <button class="btn-validar" id="btn-volver-ruta">&#8592; Volver a la ruta</button>
</div>`;
            document.getElementById('btn-dark2')?.addEventListener('click', toggleDark);
            document.getElementById('btn-volver-ruta')?.addEventListener('click', () => { location.href = `/movil?ruta=${RUTA_ID}`; });
        } catch (e) { showError(e.message); }
    }

    // ── VALIDAR PARADA ────────────────────────────────────────────
    async function validar(idx, qtyCounted) {
        const btn = document.getElementById('btn-val');
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
        try {
            const body = {};
            if (qtyCounted != null) body.qtyCounted = qtyCounted;
            const resp = await fetch(`/picking/${RUTA_ID}/validar/${idx}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!resp.ok) throw new Error('Error al validar. Inténtalo de nuevo.');
            const ruta = await (await fetch(`/picking/${RUTA_ID}`)).json();
            render(ruta);
            if (navigator.vibrate) navigator.vibrate(60);
        } catch (err) {
            if (btn) { btn.disabled = false; btn.textContent = '✓ Validar parada'; }
            showToastMob(err.message);
        }
    }

    // ── REPORTAR INCIDENCIA ───────────────────────────────────────
    async function reportarIncidencia(stopIdx, ruta) {
        const tipo  = document.getElementById('inc-tipo')?.value ?? 'otro';
        const texto = document.getElementById('inc-texto')?.value?.trim() ?? '';
        const btn   = document.getElementById('inc-send');
        if (!texto) { document.getElementById('inc-texto')?.focus(); return; }
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
        try {
            const resp = await fetch(`/picking/${RUTA_ID}/incidencia/${stopIdx}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo, texto }),
            });
            if (!resp.ok) throw new Error(`Error al enviar (${resp.status})`);
            document.getElementById('inc-modal').style.display = 'none';
            if (document.getElementById('inc-texto')) document.getElementById('inc-texto').value = '';
            document.getElementById('btn-inc')?.focus();
            // Mostrar banner de confirmación
            const banner = document.createElement('div');
            banner.className = 'toast-mob';
            banner.textContent = '⚠ Incidencia enviada al supervisor';
            document.body.appendChild(banner);
            setTimeout(() => banner.remove(), 3000);
        } catch (e) {
            showToastMob(e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '⚠ Enviar'; }
        }
    }

    // ── MODO OSCURO ───────────────────────────────────────────────
    function toggleDark() {
        const isDark = document.body.classList.toggle('dark');
        localStorage.setItem('sga-dark', isDark);
    }

    // ── INIT ─────────────────────────────────────────────────────
    async function init() {
        app.innerHTML = '<div class="splash"><div class="spin"></div><p>Actualizando…</p></div>';
        const ruta = await cargarRuta();
        if (ruta) render(ruta);
    }

    init();
})();
