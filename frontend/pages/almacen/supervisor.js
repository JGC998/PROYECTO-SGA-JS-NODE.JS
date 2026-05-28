/* SGA LIN — Supervisor de Picking */
(function () {
    'use strict';

    // ── ESTADO ────────────────────────────────────────────────────
    let _artMap       = new Map();   // artCode → { artName, locs:[{ubicacion,stock}] }
    let _pickItems    = [];          // { artCode, artName, ubicacion, qtyNeeded }
    let _pickings     = [];          // historial desde /picking
    let _mobileBase   = window.location.origin;
    let _activeTab    = 'curso';
    let _activeWorker = '';
    let _detailId     = null;
    let _searchTimer  = 0;
    let _query        = '';

    // ── INIT ──────────────────────────────────────────────────────
    async function init() {
        renderItemsList();
        bindEvents();
        await Promise.all([loadArticles(), loadPickings(), loadWorkers()]);
        connectSSE();
        fetchServerInfo();
    }

    async function loadWorkers() {
        try {
            const workers = await fetch('/operarios').then(r => r.json());
            const sel = document.getElementById('worker-sel');
            workers.forEach(w => {
                const opt = document.createElement('option');
                opt.value = w.nombre;
                opt.textContent = w.nombre;
                sel.appendChild(opt);
            });
        } catch (err) {
            console.warn('[supervisor] No se pudo cargar operarios:', err.message);
            const sel = document.getElementById('worker-sel');
            if (sel) sel.insertAdjacentHTML('beforeend', '<option disabled>⚠ Error al cargar operarios</option>');
        }
    }

    // ── TABS ──────────────────────────────────────────────────────
    function switchTab(tab) {
        _activeTab = tab;
        document.querySelectorAll('.tab-btn').forEach(b => {
            const active = b.dataset.tab === tab;
            b.classList.toggle('tab-active', active);
            b.setAttribute('aria-selected', active);
        });
        document.querySelectorAll('.tab-panel').forEach(p => {
            p.style.display = p.id === `tab-${tab}` ? '' : 'none';
        });
        if (tab === 'curso')       renderCurso();
        if (tab === 'finalizadas') renderFinalizadas();
    }

    async function fetchServerInfo() {
        try {
            const r = await fetch('/api/almacen/server-info');
            if (!r.ok) return;
            const { ip, port } = await r.json();
            if (ip && ip !== 'localhost') _mobileBase = `http://${ip}:${port}`;
        } catch {}
    }

    // ── CARGA DE DATOS ────────────────────────────────────────────
    async function loadArticles() {
        try {
            // Intenta SQL primero; cae en JSON estático si el servidor SQL no está disponible
            let r = await fetch(`/api/almacen/articulos?t=${Date.now()}`);
            if (!r.ok) r = await fetch('./datos/articulos.json');
            if (!r.ok) return;
            const raw = await r.json();
            _artMap.clear();
            for (const item of raw) {
                const code = item.articulo;
                if (!_artMap.has(code)) _artMap.set(code, { artName: item.nombre, locs: [] });
                _artMap.get(code).locs.push({ ubicacion: item.ubicacion, stock: item.stock });
            }
            for (const [, v] of _artMap) v.locs.sort((a, b) => b.stock - a.stock);
            renderCatalog();
        } catch (e) { console.error('loadArticles:', e); }
    }

    async function loadPickings() {
        try {
            const r = await fetch('/api/almacen/picking');
            if (!r.ok) return;
            _pickings = await r.json();
            renderStats();
            renderMonitor();
            populateWorkerFilter();
        } catch {}
    }

    // ── ESTADÍSTICAS ─────────────────────────────────────────────
    function renderStats() {
        const hoy = new Date().toDateString();
        const pickingsHoy = _pickings.filter(p => new Date(p.fecha).toDateString() === hoy);
        const enCurso     = _pickings.filter(p => p.estado !== 'completada').length;
        const finalizadas = _pickings.filter(p => p.estado === 'completada').length;
        const udsHoy      = pickingsHoy.reduce((s, p) =>
            s + p.paradas.filter(x => x.completada).reduce((si, pa) =>
                si + (pa.qtyCounted ?? pa.items.reduce((q, i) => q + i.qtyTake, 0)), 0), 0);
        document.getElementById('st-total').textContent = _pickings.length;
        document.getElementById('st-hoy').textContent   = pickingsHoy.length;
        document.getElementById('st-curso').textContent  = enCurso;
        document.getElementById('st-uds').textContent    = udsHoy;
        document.getElementById('badge-curso').textContent = enCurso;
        document.getElementById('badge-fin').textContent   = finalizadas;
    }

    function populateWorkerFilter() {
        const sel = document.getElementById('filter-worker');
        const workers = [...new Set(_pickings.map(p => p.operario).filter(Boolean))].sort();
        const current = sel.value;
        sel.innerHTML = '<option value="">Todos los operarios</option>'
            + workers.map(w => `<option value="${esc(w)}" ${w === current ? 'selected' : ''}>${esc(w)}</option>`).join('');
    }

    // ── ELIMINAR PICKING ─────────────────────────────────────────
    async function deletePicking(id) {
        if (!confirm('¿Eliminar esta ruta del historial? Esta acción no se puede deshacer.')) return;
        try {
            const r = await fetch(`/api/almacen/picking/${id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error('Error al eliminar');
            _pickings = _pickings.filter(p => p.id !== id);
            if (_detailId === id) closeRouteDetail();
            renderStats();
            renderMonitor();
            populateWorkerFilter();
            showToast('Ruta eliminada');
        } catch (e) { showToast('Error: ' + e.message, 3000); }
    }

    // ── DUPLICAR RUTA ────────────────────────────────────────────
    function duplicateRoute(picking) {
        _pickItems = [];
        for (const parada of picking.paradas) {
            for (const item of parada.items) {
                const existing = _pickItems.find(i => i.artCode === item.artCode);
                if (existing) {
                    existing.qtyNeeded += item.qtyTake;
                } else {
                    const data = _artMap.get(item.artCode);
                    _pickItems.push({
                        artCode:   item.artCode,
                        artName:   item.artName ?? data?.artName ?? '',
                        ubicacion: parada.locKey,
                        qtyNeeded: item.qtyTake,
                    });
                }
            }
        }
        renderItemsList();
        showToast('Ruta duplicada en la pestaña "Nueva ruta"', 3000);
        switchTab('nuevo');
    }

    // ── EXPORTAR CSV ─────────────────────────────────────────────
    function exportCSV() {
        const rows = [['Documento','Fecha','Operario','Estado','Paradas','Completadas','Unidades']];
        for (const p of _pickings) {
            const completadas = p.paradas.filter(s => s.completada).length;
            const uds = p.paradas.reduce((s, pa) => s + pa.items.reduce((si, i) => si + i.qtyTake, 0), 0);
            rows.push([p.docNum, new Date(p.fecha).toLocaleString('es-ES'), p.operario ?? '', p.estado, p.paradas.length, completadas, uds]);
        }
        const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = `picking-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // ── STOCK CHECK ──────────────────────────────────────────────
    function stockFor(artCode) {
        const data = _artMap.get(artCode);
        return data ? data.locs.reduce((s, l) => s + l.stock, 0) : 0;
    }

    // ── CATÁLOGO ──────────────────────────────────────────────────
    function onSearchInput(e) {
        _query = e.target.value.trim();
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(renderCatalog, 120);
    }

    function renderCatalog() {
        const el = document.getElementById('catalog-list');
        const countEl = document.getElementById('catalog-count');
        const q = _query.toLowerCase();

        const matches = [];
        for (const [code, data] of _artMap) {
            if (!q || code.toLowerCase().includes(q) || data.artName.toLowerCase().includes(q)) {
                matches.push({ code, ...data });
            }
        }

        countEl.textContent = matches.length;

        if (!matches.length) {
            el.innerHTML = '<div class="catalog-no-results">Sin resultados para "' + esc(_query) + '"</div>';
            return;
        }

        el.innerHTML = matches.map(m => {
            const totalStock  = m.locs.reduce((s, l) => s + l.stock, 0);
            const bestLoc     = m.locs[0]?.ubicacion ?? '—';
            const stockClass  = totalStock === 0 ? 'stock-zero' : totalStock < 10 ? 'stock-low' : '';
            const inRoute     = _pickItems.find(i => i.artCode === m.code);
            const warnStock   = inRoute && inRoute.qtyNeeded > totalStock;
            return `<div class="catalog-row${warnStock ? ' warn-stock' : ''}">
                <div class="catalog-info">
                    <span class="catalog-code">${esc(m.code)}</span>
                    <span class="catalog-name">${esc(m.artName)}</span>
                    <span class="catalog-loc">&#128205; ${esc(bestLoc)}</span>
                    ${warnStock ? `<span class="catalog-stock-warn">&#9888; Stock insuficiente</span>` : ''}
                </div>
                <div class="catalog-right">
                    <span class="catalog-stock ${stockClass}">${totalStock} ud${totalStock !== 1 ? 's' : ''}</span>
                    <div style="display:flex;align-items:center;gap:4px">
                        <input class="catalog-qty-inp" type="number" value="1" min="1" max="9999" data-code="${esc(m.code)}">
                        <button class="catalog-add" data-code="${esc(m.code)}" title="Añadir a la ruta">+</button>
                    </div>
                </div>
            </div>`;
        }).join('');

        el.querySelectorAll('.catalog-add').forEach(btn => {
            btn.addEventListener('click', () => {
                const inp = el.querySelector(`.catalog-qty-inp[data-code="${btn.dataset.code}"]`);
                const qty = Math.max(1, parseInt(inp?.value ?? '1', 10) || 1);
                addItemWithQty(btn.dataset.code, qty);
                if (inp) inp.value = '1';
            });
        });
    }

    // ── GESTIÓN DE ÍTEMS ──────────────────────────────────────────
    function addItem(artCode) { addItemWithQty(artCode, 1); }

    function addItemWithQty(artCode, qty) {
        const data = _artMap.get(artCode);
        if (!data) return;
        const existing = _pickItems.find(i => i.artCode === artCode);
        if (existing) {
            existing.qtyNeeded += qty;
        } else {
            _pickItems.push({
                artCode,
                artName:   data.artName,
                ubicacion: data.locs[0]?.ubicacion ?? '?',
                qtyNeeded: qty,
            });
        }
        renderItemsList();
        renderCatalog(); // refresca warnings de stock
    }

    function removeItem(artCode) {
        _pickItems = _pickItems.filter(i => i.artCode !== artCode);
        renderItemsList();
    }

    function setQty(artCode, val) {
        const item = _pickItems.find(i => i.artCode === artCode);
        if (!item) return;
        item.qtyNeeded = Math.max(1, val);
        renderItemsList();
    }

    function changeQty(artCode, delta) {
        const item = _pickItems.find(i => i.artCode === artCode);
        if (!item) return;
        setQty(artCode, item.qtyNeeded + delta);
    }

    function renderItemsList() {
        const listEl  = document.getElementById('items-list');
        const countEl = document.getElementById('items-count');
        const genBtn  = document.getElementById('btn-generate');
        const qrBtn   = document.getElementById('btn-qr-only');

        countEl.textContent = _pickItems.length;
        genBtn.disabled = _pickItems.length === 0;
        qrBtn.disabled  = _pickItems.length === 0;

        if (!_pickItems.length) {
            listEl.innerHTML = '<div class="items-empty">Añade artículos usando el buscador de arriba</div>';
            return;
        }
        listEl.innerHTML = _pickItems.map(item => `
            <div class="item-row">
                <div class="item-info">
                    <span class="item-code">${esc(item.artCode)}</span>
                    <span class="item-name">${esc(item.artName)}</span>
                    <span class="item-loc">&#128205; ${esc(item.ubicacion)}</span>
                </div>
                <div class="item-qty-ctrl">
                    <button class="qty-btn qty-dec" data-code="${esc(item.artCode)}">&#8722;</button>
                    <input class="qty-input" type="number" min="1" max="9999"
                        value="${item.qtyNeeded}" data-code="${esc(item.artCode)}">
                    <button class="qty-btn qty-inc" data-code="${esc(item.artCode)}">+</button>
                </div>
                <button class="item-del" data-code="${esc(item.artCode)}" title="Eliminar">&times;</button>
            </div>
        `).join('');
        listEl.querySelectorAll('.qty-dec').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.code, -1)));
        listEl.querySelectorAll('.qty-inc').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.code, +1)));
        listEl.querySelectorAll('.qty-input').forEach(inp => {
            inp.addEventListener('change', () => {
                const v = parseInt(inp.value, 10);
                setQty(inp.dataset.code, isNaN(v) || v < 1 ? 1 : v);
            });
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
        });
        listEl.querySelectorAll('.item-del').forEach(b => b.addEventListener('click', () => removeItem(b.dataset.code)));
    }

    // ── GENERACIÓN DE RUTA ────────────────────────────────────────
    function buildParadas() {
        const locMap = new Map();
        for (const item of _pickItems) {
            const key = item.ubicacion;
            if (!locMap.has(key)) locMap.set(key, []);
            locMap.get(key).push({ artCode: item.artCode, artName: item.artName, qtyTake: item.qtyNeeded });
        }
        return [...locMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
            .map(([locKey, items]) => ({ locKey, items, distFromPrev: 0 }));
    }

    function makeDocNum() {
        const d = new Date();
        return `PCK-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
    }

    async function postPicking(docNum, paradas, operario) {
        const resp = await fetch('/api/almacen/picking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ docNum, operario: operario || null, paradas }),
        });
        if (!resp.ok) throw new Error('Error al crear la ruta en el servidor');
        return (await resp.json()).id;
    }

    async function generateRoute() {
        const paradas = buildParadas();
        if (!paradas.length) return;
        const operario = document.getElementById('worker-sel').value;
        const docNum   = makeDocNum();

        document.getElementById('btn-generate').disabled = true;
        showToast('Generando ruta…');
        try {
            const id = await postPicking(docNum, paradas, operario);
            _pickItems = [];
            renderItemsList();
            await loadPickings();
            await exportPDF(id, docNum, paradas, operario || null);
            showToast('✓ Ruta creada — PDF listo para imprimir', 3500);
            switchTab('curso');
        } catch (e) {
            showToast('Error: ' + e.message, 4000);
        } finally {
            document.getElementById('btn-generate').disabled = false;
        }
    }

    async function generateQROnly() {
        const paradas = buildParadas();
        if (!paradas.length) return;
        const operario = document.getElementById('worker-sel').value;
        const docNum   = makeDocNum();

        document.getElementById('btn-qr-only').disabled = true;
        try {
            const id = await postPicking(docNum, paradas, operario);
            _pickItems = [];
            renderItemsList();
            await loadPickings();
            switchTab('curso');
            showQR(id);
        } catch (e) {
            showToast('Error: ' + e.message, 4000);
        } finally {
            document.getElementById('btn-qr-only').disabled = false;
        }
    }

    // ── QR MODAL ──────────────────────────────────────────────────
    function showQR(routeId) {
        const mobileUrl = `${_mobileBase}/movil?ruta=${routeId}`;
        document.getElementById('qr-img').src = `/api/almacen/qr?data=${encodeURIComponent(mobileUrl)}`;
        document.getElementById('qr-url').textContent = mobileUrl;
        document.getElementById('qr-modal').style.display = 'flex';
    }

    function closeQR() {
        document.getElementById('qr-modal').style.display = 'none';
    }

    // ── EXPORTAR PDF ──────────────────────────────────────────────
    async function exportPDF(routeId, docNum, paradas, workerName) {
        docNum          = esc(docNum ?? '');
        const now       = new Date().toLocaleString('es-ES');
        const mobileUrl = routeId ? `${_mobileBase}/movil?ruta=${routeId}` : null;
        const totalU    = paradas.reduce((s, p) => s + p.items.reduce((si, i) => si + i.qtyTake, 0), 0);

        let qrDataUrl = null;
        if (mobileUrl) {
            try {
                const r = await fetch(`/api/almacen/qr?data=${encodeURIComponent(mobileUrl)}`);
                if (r.ok) {
                    const blob = await r.blob();
                    qrDataUrl  = await new Promise(res => {
                        const reader = new FileReader();
                        reader.onload = () => res(reader.result);
                        reader.readAsDataURL(blob);
                    });
                }
            } catch {}
        }

        const rows = paradas.map((p, idx) => {
            const uds  = p.items.reduce((s, i) => s + i.qtyTake, 0);
            const arts = p.items.map(i =>
                `<div class="art-row"><span class="art-code">${esc(i.artCode)}</span><span class="art-name">${esc(i.artName ?? '')}</span><span class="art-qty">&times;${i.qtyTake}</span></div>`
            ).join('');
            return `<tr class="${idx % 2 === 1 ? 'even' : ''}">
                <td class="td-num"><div class="num-badge">${idx+1}</div></td>
                <td class="td-loc"><span class="loc-code">${esc(p.locKey)}</span></td>
                <td class="td-art">${arts}</td>
                <td class="td-uds">${uds}</td>
                <td class="td-chk"><div class="chkbox"></div></td>
            </tr>`;
        }).join('');

        const qrCSS = qrDataUrl ? `
            .qr-wrap{float:left;margin:0 14px 8px 0;text-align:center}
            .qr-img{width:120px;height:120px;display:block;border-radius:4px;background:#fff;padding:4px}
            .qr-label{font-size:8px;color:#6b7280;margin-top:3px;max-width:128px}
            .qr-url{font-size:7px;color:#9ca3af;word-break:break-all;max-width:128px;margin-top:1px}` : '';

        const win = window.open('', '_blank');
        if (!win) { showToast('Permite las ventanas emergentes para exportar', 4000); return; }

        win.document.write(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>${docNum}</title><style>
*{margin:0;padding:0;box-sizing:border-box}
${qrCSS}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;padding:0 20px 30px}
header{display:flex;justify-content:space-between;align-items:flex-start;padding:14px 0 10px;border-bottom:3px solid #1e3a5f;margin-bottom:10px}
.logo{font-size:17px;font-weight:bold;color:#1e3a5f}.logo small{display:block;font-size:10px;font-weight:normal;color:#6b7280;margin-top:2px}
.meta{text-align:right;font-size:10px;color:#555}.meta strong{display:block;font-size:13px;color:#111;margin-bottom:2px}
.summary{display:flex;gap:0;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;margin-bottom:12px}
.sum-cell{flex:1;padding:8px 12px;border-right:1px solid #d1d5db}.sum-cell:last-child{border-right:none}
.sum-label{font-size:9px;text-transform:uppercase;color:#9ca3af;letter-spacing:.5px}
.sum-val{font-size:15px;font-weight:bold;color:#1e3a5f;margin-top:2px}
table{width:100%;border-collapse:collapse}
thead th{background:#1e3a5f;color:#fff;padding:6px 8px;text-align:left;font-size:10px;letter-spacing:.3px}
td{padding:5px 8px;vertical-align:top;border-bottom:1px solid #e5e7eb}
tr.even td{background:#f9fafb}
.td-num{width:34px;text-align:center}
.num-badge{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#1e3a5f;color:#fff;font-weight:bold;font-size:10px}
.td-loc{width:160px}.loc-code{font-family:monospace;font-weight:bold;font-size:12px;color:#1e3a5f}
.art-row{display:flex;gap:6px;align-items:baseline;margin-bottom:1px}
.art-code{font-family:monospace;font-size:10px;font-weight:bold;min-width:72px;color:#374151}
.art-name{font-size:10px;color:#6b7280;flex:1}.art-qty{font-weight:bold;font-size:11px;white-space:nowrap}
.td-uds{width:44px;font-weight:bold;text-align:right}.td-chk{width:40px;text-align:center}
.chkbox{width:18px;height:18px;border:2px solid #9ca3af;border-radius:3px;display:inline-block}
footer{margin-top:14px;font-size:9px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:8px}
@media print{@page{margin:15mm}body{padding:0}.no-print{display:none}}
.no-print{display:flex;align-items:center;gap:12px;background:#eff6ff;border-bottom:1px solid #bfdbfe;padding:9px 20px;margin:0 -20px 12px}
#print-btn{background:#1d4ed8;color:#fff;border:none;border-radius:6px;padding:7px 18px;font-size:12px;font-weight:700;cursor:pointer}
#print-btn:disabled{background:#93c5fd;cursor:not-allowed}
#print-status{font-size:11px;color:#6b7280}
</style></head><body>
<div class="no-print">
    <button id="print-btn" onclick="window.print()" disabled>&#128438;&nbsp;Imprimir / Guardar PDF</button>
    <span id="print-status">&#9203; Preparando…</span>
</div>
<header>
    <div><div class="logo">&#x1F3ED; SGA LIN &mdash; Lista de Picking<small>Sistema de Gesti&oacute;n de Almac&eacute;n</small></div></div>
    <div class="meta"><strong>${docNum}</strong>${now}</div>
</header>
${qrDataUrl ? `<div class="qr-wrap"><img src="${qrDataUrl}" class="qr-img" alt="QR"><div class="qr-label">Ruta en el m&oacute;vil</div><div class="qr-url">${mobileUrl}</div></div>` : ''}
<div class="summary">
    <div class="sum-cell"><div class="sum-label">Documento</div><div class="sum-val" style="font-size:11px;word-break:break-all">${docNum}</div></div>
    <div class="sum-cell"><div class="sum-label">Operario</div><div class="sum-val" style="font-size:${workerName ? '13px' : '14px'}">${workerName ? esc(workerName) : '&mdash;'}</div></div>
    <div class="sum-cell"><div class="sum-label">Paradas</div><div class="sum-val">${paradas.length}</div></div>
    <div class="sum-cell"><div class="sum-label">Unidades</div><div class="sum-val">${totalU}</div></div>
</div>
<table>
<thead><tr>
    <th style="width:34px">#</th>
    <th style="width:160px">Ubicaci&oacute;n</th>
    <th>Art&iacute;culos</th>
    <th style="width:44px;text-align:right">Uds</th>
    <th style="width:40px">&#10003;</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<footer>Documento ${docNum} &middot; Generado ${now} &middot; SGA LIN</footer>
<script>
window.onload = function() {
    var btn = document.getElementById('print-btn');
    var st  = document.getElementById('print-status');
    var pending = Array.from(document.images).filter(function(i){ return !i.complete; });
    if (!pending.length) { btn.disabled = false; st.textContent = 'Listo para imprimir'; return; }
    var n = 0;
    pending.forEach(function(img) {
        img.onload = img.onerror = function() {
            if (++n === pending.length) { btn.disabled = false; st.textContent = 'Listo para imprimir'; }
        };
    });
};
<\/script>
</body></html>`);
        win.document.close();
    }

    // ── RENDER TABS ───────────────────────────────────────────────
    function renderMonitor() {
        renderStats();
        renderCurso();
        renderFinalizadas();
        if (_detailId) renderDetailDrawer(_detailId);
    }

    function renderCurso() {
        const grid   = document.getElementById('curso-grid');
        const active = _pickings.filter(p => p.estado !== 'completada');
        if (!active.length) {
            grid.innerHTML = '<div class="grid-empty">No hay rutas activas en este momento</div>';
            return;
        }
        grid.innerHTML = active.map(renderCardCompact).join('');
        _attachCardEvents(grid);
    }

    function renderFinalizadas() {
        const grid = document.getElementById('fin-grid');
        let done   = _pickings.filter(p => p.estado === 'completada');
        if (_activeWorker) done = done.filter(p => p.operario === _activeWorker);
        if (!done.length) {
            grid.innerHTML = '<div class="grid-empty">Sin rutas finalizadas</div>';
            return;
        }
        grid.innerHTML = done.map(renderCardCompact).join('');
        _attachCardEvents(grid);
    }

    function renderCardCompact(p) {
        const completadas = p.paradas.filter(s => s.completada).length;
        const total       = p.paradas.length;
        const pct         = total ? Math.round((completadas / total) * 100) : 0;
        const fecha       = new Date(p.fecha).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const isActive = p.estado !== 'completada';
        const hasInc   = p.paradas.some(s => s.incidencias?.length);
        const hasDiff  = p.paradas.some(s => {
            if (!s.completada || s.qtyCounted == null) return false;
            const uds = s.items.reduce((sum, it) => sum + it.qtyTake, 0);
            return s.qtyCounted !== uds;
        });

        const alerts = (hasInc  ? `<span class="rc-alert rc-alert-inc">&#9888; Incidencias</span>` : '')
                     + (hasDiff ? `<span class="rc-alert rc-alert-diff">&#9888; Diferencias</span>` : '');

        return `<div class="route-card ${isActive ? 'rc-active' : 'rc-done'}" data-id="${esc(p.id)}">
            <div class="rc-top">
                <span class="rc-docnum">${esc(p.docNum)}</span>
                <span class="rc-badge ${isActive ? 'badge-active' : 'badge-done'}">${isActive ? 'En curso' : 'Completada'}</span>
            </div>
            <div class="rc-meta">
                <span class="rc-worker">${p.operario ? '&#128119; ' + esc(p.operario) : '&#8212; Sin asignar'}</span>
                <span class="rc-date">${fecha}</span>
            </div>
            <div class="rc-progress">
                <div class="rc-bar"><div class="rc-fill" style="width:${pct}%"></div></div>
                <span class="rc-pct">${completadas}/${total} &middot; ${pct}%</span>
            </div>
            ${alerts ? `<div class="rc-alerts">${alerts}</div>` : ''}
            <div class="rc-actions">
                <button class="rc-btn rc-qr"  data-id="${esc(p.id)}" title="Ver QR">&#9646;&#9646; QR</button>
                <button class="rc-btn rc-dup" data-id="${esc(p.id)}" title="Duplicar">&#128260; Dup</button>
                <button class="rc-btn rc-del" data-id="${esc(p.id)}" title="Eliminar">&#128465;</button>
            </div>
        </div>`;
    }

    function _attachCardEvents(container) {
        container.querySelectorAll('.rc-qr').forEach(btn =>
            btn.addEventListener('click', () => showQR(btn.dataset.id)));
        container.querySelectorAll('.rc-del').forEach(btn =>
            btn.addEventListener('click', () => deletePicking(btn.dataset.id)));
        container.querySelectorAll('.rc-dup').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = _pickings.find(pk => pk.id === btn.dataset.id);
                if (p) duplicateRoute(p);
            });
        });
        container.querySelectorAll('.route-card').forEach(card => {
            card.addEventListener('click', e => {
                if (e.target.closest('.rc-btn')) return;
                openRouteDetail(card.dataset.id);
            });
        });
    }

    // ── DETAIL DRAWER ─────────────────────────────────────────────
    function openRouteDetail(id) {
        _detailId = id;
        renderDetailDrawer(id);
        document.getElementById('detail-overlay').classList.add('visible');
        document.getElementById('detail-drawer').classList.add('open');
    }

    function closeRouteDetail() {
        _detailId = null;
        document.getElementById('detail-overlay').classList.remove('visible');
        document.getElementById('detail-drawer').classList.remove('open');
    }

    function renderDetailDrawer(id) {
        const p = _pickings.find(pk => pk.id === id);
        if (!p) { closeRouteDetail(); return; }
        const isActive = p.estado !== 'completada';
        document.getElementById('dd-docnum').textContent = p.docNum;
        const badge = document.getElementById('dd-badge');
        badge.textContent = isActive ? 'En curso' : 'Completada';
        badge.className = 'dd-badge ' + (isActive ? 'badge-active' : 'badge-done');
        document.getElementById('dd-body').innerHTML = renderDetailContent(p);

        document.getElementById('dd-body').querySelector('.dd-action-btn.dd-qr')?.addEventListener('click', () => showQR(p.id));
        document.getElementById('dd-body').querySelector('.dd-action-btn.dd-dup')?.addEventListener('click', () => { closeRouteDetail(); duplicateRoute(p); });
        document.getElementById('dd-body').querySelector('.dd-action-btn.dd-del')?.addEventListener('click', () => deletePicking(p.id));
    }

    function renderDetailContent(p) {
        const completadas = p.paradas.filter(s => s.completada).length;
        const total       = p.paradas.length;
        const pct         = total ? Math.round((completadas / total) * 100) : 0;
        const isActive    = p.estado !== 'completada';
        const fecha       = new Date(p.fecha).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const stopsHtml = p.paradas.map((s, idx) => {
            const needUds = s.items.reduce((sum, i) => sum + i.qtyTake, 0);
            const gotUds  = s.qtyCounted ?? (s.completada ? needUds : null);
            const hasDiff = s.completada && gotUds != null && gotUds !== needUds;
            const stateClass = !s.completada ? 'dd-stop-pending' : hasDiff ? 'dd-stop-diff' : 'dd-stop-done';
            const ts = s.timestamp ? new Date(s.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';

            const statusEl = s.completada
                ? (hasDiff
                    ? `<span class="dd-stop-status dd-status-diff">&#9888; ${gotUds}/${needUds}</span>`
                    : `<span class="dd-stop-status dd-status-ok">&#10003; ${ts}</span>`)
                : `<span class="dd-stop-status dd-status-pending">Pendiente</span>`;

            const itemsHtml = s.items.map(i =>
                `<div class="dd-item">
                    <span class="dd-item-code">${esc(i.artCode)}</span>
                    <span class="dd-item-name">${esc(i.artName ?? '')}</span>
                    <span class="dd-item-qty">&times;${i.qtyTake}</span>
                </div>`
            ).join('');

            const incsHtml = (s.incidencias?.length)
                ? `<div class="dd-incs">${s.incidencias.map(inc =>
                    `<div class="dd-inc">&#9888; [${esc(inc.tipo ?? '')}] ${esc(inc.texto ?? '')}</div>`).join('')}</div>`
                : '';

            return `<div class="dd-stop ${stateClass}">
                <div class="dd-stop-hdr">
                    <span class="dd-stop-num">${idx + 1}</span>
                    <span class="dd-stop-loc">${esc(s.locKey)}</span>
                    ${statusEl}
                </div>
                <div class="dd-items">${itemsHtml}</div>
                ${incsHtml}
            </div>`;
        }).join('');

        return `
        <div class="dd-summary">
            <div class="dd-summary-row">
                <span class="dd-worker">${p.operario ? '&#128119; ' + esc(p.operario) : '&#8212; Sin asignar'}</span>
                <span class="dd-date">${fecha}</span>
            </div>
            <div class="dd-prog-wrap">
                <div class="dd-prog-bar"><div class="dd-prog-fill ${!isActive ? 'fill-done' : ''}" style="width:${pct}%"></div></div>
                <span class="dd-prog-txt">${completadas}/${total} &middot; ${pct}%</span>
            </div>
        </div>
        <div class="dd-actions-bar">
            <button class="dd-action-btn dd-qr">&#9646;&#9646; QR</button>
            <button class="dd-action-btn dd-dup">&#128260; Duplicar</button>
            <button class="dd-action-btn dd-del">&#128465; Eliminar</button>
        </div>
        <div class="dd-stops-hdr">${total} parada${total !== 1 ? 's' : ''}</div>
        <div class="dd-stops">${stopsHtml}</div>`;
    }

    // ── SSE — TIEMPO REAL ─────────────────────────────────────────
    function connectSSE() {
        const dotEl = document.getElementById('sse-dot');
        let es;

        function connect() {
            const _k = (() => { try { return localStorage.getItem('sga-api-key') || ''; } catch { return ''; } })();
            es = new EventSource('/api/almacen/events' + (_k ? '?token=' + encodeURIComponent(_k) : ''));
            es.addEventListener('open', () => dotEl?.classList.add('dot-live'));
            es.addEventListener('error', () => {
                dotEl?.classList.remove('dot-live');
                es.close();
                setTimeout(connect, 3000);
            });
            es.addEventListener('nuevo', e => {
                try {
                    const picking = JSON.parse(e.data);
                    if (!_pickings.find(p => p.id === picking.id)) {
                        _pickings.push(picking);
                        renderStats();
                        renderMonitor();
                    }
                } catch {}
            });

            es.addEventListener('actualizado', e => {
                try {
                    const payload = JSON.parse(e.data);
                    const i = _pickings.findIndex(p => p.id === payload.id);
                    if (i >= 0) {
                        _pickings[i] = payload;
                        renderStats();
                        renderMonitor();
                    } else {
                        loadPickings();
                    }
                } catch {}
            });

            es.addEventListener('eliminado', e => {
                try {
                    const { id } = JSON.parse(e.data);
                    const i = _pickings.findIndex(p => p.id === id);
                    if (i >= 0) {
                        _pickings.splice(i, 1);
                        renderStats();
                        renderMonitor();
                    }
                } catch {}
            });

            es.addEventListener('incidencia', e => {
                try {
                    const payload = JSON.parse(e.data);
                    const i = _pickings.findIndex(p => p.id === payload.id);
                    if (i >= 0) {
                        _pickings[i] = payload;
                        const parada = payload.paradas[payload.lastIncidenciaIdx];
                        renderMonitor();
                        showToast(`⚠ Incidencia en ${esc(parada?.locKey ?? '')}${payload.operario ? ' · ' + esc(payload.operario) : ''}`, 5000);
                    } else {
                        loadPickings();
                    }
                } catch {}
            });
        }
        connect();
    }

    // ── UTILIDADES ────────────────────────────────────────────────
    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    let _toastTimer = 0;
    function showToast(msg, ms = 2000) {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('toast-visible');
        clearTimeout(_toastTimer);
        _toastTimer = setTimeout(() => el.classList.remove('toast-visible'), ms);
    }

    // ── EVENTOS ───────────────────────────────────────────────────
    function bindEvents() {
        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Buscador de artículos
        const searchEl = document.getElementById('art-search');
        searchEl.addEventListener('input', onSearchInput);
        searchEl.addEventListener('keydown', e => {
            if (e.key === 'Escape') { searchEl.value = ''; _query = ''; renderCatalog(); }
        });

        document.getElementById('btn-clear').addEventListener('click', () => {
            _pickItems = [];
            renderItemsList();
        });
        document.getElementById('btn-generate').addEventListener('click', generateRoute);
        document.getElementById('btn-qr-only').addEventListener('click', generateQROnly);

        document.getElementById('qr-cls').addEventListener('click', closeQR);
        document.getElementById('qr-modal').addEventListener('click', e => {
            if (e.target === document.getElementById('qr-modal')) closeQR();
        });

        document.getElementById('filter-worker').addEventListener('change', e => {
            _activeWorker = e.target.value;
            renderFinalizadas();
        });

        document.getElementById('btn-refresh').addEventListener('click', loadPickings);
        document.getElementById('btn-csv').addEventListener('click', exportCSV);

        document.getElementById('dd-cls').addEventListener('click', closeRouteDetail);
        document.getElementById('detail-overlay').addEventListener('click', closeRouteDetail);
    }

    init();
})();
