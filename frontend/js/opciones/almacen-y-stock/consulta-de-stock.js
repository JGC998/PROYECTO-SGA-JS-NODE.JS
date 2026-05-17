"use strict";

(function () {

    // ── ESTADO INTERNO ────────────────────────────────────────────────────────
    var _rows     = [];   // filas completas devueltas por el servidor
    var _filtered = [];   // filas tras filtros client-side
    var _current  = null; // fila seleccionada actualmente en el panel lateral

    // ── HELPERS ───────────────────────────────────────────────────────────────

    function fmt(n) {
        return Number(n ?? 0).toLocaleString('es-ES');
    }

    function fmtTime(d) {
        var h = String(d.getHours()).padStart(2, '0');
        var m = String(d.getMinutes()).padStart(2, '0');
        return h + ':' + m;
    }

    function val(v, fallback) {
        return (v !== null && v !== undefined && v !== '') ? v : (fallback || '—');
    }

    function el(tag, cls) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        return e;
    }

    function txt(s) {
        return document.createTextNode(String(s ?? ''));
    }

    function $(id) {
        return document.getElementById(id);
    }

    // ── PARÁMETROS DE CONSULTA ────────────────────────────────────────────────

    function getServerParams() {
        var existencias = $('f-existencias').value;
        var params = {
            articulo:  $('f-articulo').value.trim(),
            ubicacion: $('f-ubicacion').value.trim(),
            lote:      $('f-lote').value.trim(),
        };
        if (existencias === '1')  params.solo_existencias = '1';
        if (existencias === '0')  params.solo_existencias = '0';
        if (existencias === '-1') params.sin_existencias = '1';
        return params;
    }

    function getClientFilters() {
        return {
            libre: $('f-libre').value,
        };
    }

    function applyClientFilters() {
        var cf = getClientFilters();
        _filtered = _rows.filter(function (r) {
            if (cf.libre === '1' && !r.libre) return false;
            if (cf.libre === '0' && r.libre)  return false;
            return true;
        });
        renderTabla(_filtered);
        renderCards(_filtered);
        renderTotales(_filtered);
    }

    // ── SPINNER BOTÓN ─────────────────────────────────────────────────────────

    function setBtnCargando(cargando) {
        var ids = ['btn-buscar', 'btn-actualizar'];
        ids.forEach(function (id) {
            var btn = $(id);
            if (!btn) return;
            btn.disabled = cargando;
            btn.innerHTML = '';
            if (cargando) {
                var sp = el('span', 'cs-btn-spinner');
                sp.setAttribute('aria-hidden', 'true');
                btn.appendChild(sp);
                btn.appendChild(txt(' Cargando…'));
            } else {
                var label = id === 'btn-buscar' ? 'Buscar' : 'Actualizar (F5)';
                btn.appendChild(txt(label));
            }
        });
    }

    // ── CARGA DE DATOS ────────────────────────────────────────────────────────

    function setLoadingState() {
        var tbody = $('tbody-stock');
        if (tbody) {
            tbody.innerHTML = '';
            var tr = el('tr', 'cs-state-row');
            var td = el('td');
            td.colSpan = 9;
            var sp = el('span', 'cs-loading-spinner');
            sp.setAttribute('aria-hidden', 'true');
            td.appendChild(sp);
            td.appendChild(txt(' Cargando…'));
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
        var cards = $('cs-cards');
        if (cards) cards.innerHTML = '';

        var countEl = $('cs-count');
        if (countEl) countEl.textContent = 'Cargando…';
        var tsEl = $('cs-timestamp');
        if (tsEl) tsEl.textContent = '';
        var warnEl = $('cs-limit-warn');
        if (warnEl) warnEl.hidden = true;

        var totalEl = $('total-stock');
        if (totalEl) totalEl.textContent = '—';
    }

    function cargarDatos() {
        setLoadingState();
        setBtnCargando(true);

        var params = getServerParams();
        SGA.consultaStock.list(params)
            .then(function (data) {
                _rows = Array.isArray(data) ? data : [];
                applyClientFilters();
                renderStatusbar(_filtered.length, new Date(), _rows.length >= 500);
            })
            .catch(function (err) {
                console.error('[consulta-stock]', err);
                _rows = [];
                _filtered = [];
                renderTablaError();
                var countEl = $('cs-count');
                if (countEl) countEl.textContent = 'Error de conexión';
            })
            .then(function () {
                setBtnCargando(false);
            });
    }

    // ── RENDER TABLA ──────────────────────────────────────────────────────────

    function renderTabla(rows) {
        var tbody = $('tbody-stock');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!rows.length) {
            var tr = el('tr', 'cs-state-row');
            var td = el('td');
            td.colSpan = 9;
            td.textContent = 'No se encontraron registros con los filtros indicados.';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        var frag = document.createDocumentFragment();
        rows.forEach(function (r, i) {
            var tr = buildRow(r);
            tr.style.animationDelay = Math.min(i * 12, 200) + 'ms';
            tr.classList.add('cs-row--fadein');
            frag.appendChild(tr);
        });
        tbody.appendChild(frag);
    }

    function renderTablaError() {
        var tbody = $('tbody-stock');
        if (!tbody) return;
        tbody.innerHTML = '';
        var tr = el('tr', 'cs-state-row cs-state-row--error');
        var td = el('td');
        td.colSpan = 9;
        td.textContent = 'No se pudo conectar con el servidor. Compruebe la conexión.';
        tr.appendChild(td);
        tbody.appendChild(tr);
    }

    function buildRow(r) {
        var tr = el('tr', 'cs-row');
        tr.addEventListener('click', function (e) {
            if (e.target.classList.contains('cs-btn-action')) return;
            selectRow(tr, r);
            openDetail(r);
        });

        // Ubicación + badge LIBRE
        var tdUbi = el('td');
        tdUbi.appendChild(txt(val(r.ubicacion)));
        if (r.libre) tdUbi.appendChild(buildBadgeLibre());

        // Artículo
        var tdArt = el('td');
        tdArt.appendChild(txt(val(r.articulo)));

        // Nombre
        var tdNom = el('td', 'cs-td--nombre');
        tdNom.title = val(r.nombre);
        tdNom.appendChild(txt(val(r.nombre)));

        // Lote
        var tdLote = el('td');
        tdLote.appendChild(txt(val(r.lote)));

        // Stock
        var tdStock = el('td', 'cs-td--num');
        var stockNum = parseFloat(r.stock) || 0;
        var stockCls = stockNum < 0 ? 'cs-stock--neg' : (stockNum === 0 ? 'cs-stock--zero' : 'cs-stock--pos');
        tdStock.className += ' ' + stockCls;
        tdStock.appendChild(txt(fmt(r.stock)));

        // Palets
        var tdPal = el('td', 'cs-td--num');
        tdPal.appendChild(txt(r.palets ? fmt(r.palets) : '—'));

        // Múltiple
        var tdMul = el('td', 'cs-td--num');
        tdMul.appendChild(txt(r.multiple ? fmt(r.multiple) : '—'));

        // Acciones
        var tdAcc = el('td', 'cs-td--actions');
        tdAcc.appendChild(buildActionBtn(r));

        tr.appendChild(tdUbi);
        tr.appendChild(tdArt);
        tr.appendChild(tdNom);
        tr.appendChild(tdLote);
        tr.appendChild(tdStock);
        tr.appendChild(tdPal);
        tr.appendChild(tdMul);
        tr.appendChild(tdAcc);
        return tr;
    }

    function buildBadgeLibre() {
        var span = el('span', 'cs-badge cs-badge--libre');
        span.textContent = 'LIBRE';
        return span;
    }

    function buildActionBtn(r) {
        var btn = el('button', 'cs-btn-action');
        btn.title = 'Ver movimientos de ' + (r.articulo || '');
        btn.setAttribute('aria-label', 'Ver movimientos');
        btn.textContent = '↗';
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var url = '../movimientos-por-articulo/index.html?articulo='
                + encodeURIComponent(r.articulo || '');
            window.location.href = url;
        });
        return btn;
    }

    // ── RENDER CARDS (MÓVIL) ──────────────────────────────────────────────────

    function renderCards(rows) {
        var container = $('cs-cards');
        if (!container) return;
        container.innerHTML = '';

        if (!rows.length) return;

        var frag = document.createDocumentFragment();
        rows.forEach(function (r) { frag.appendChild(buildCard(r)); });
        container.appendChild(frag);
    }

    function buildCard(r) {
        var div = el('div', 'cs-card');
        div.addEventListener('click', function () { openDetail(r); });

        var stockNum = parseFloat(r.stock) || 0;
        var stockCls = stockNum < 0 ? 'cs-stock--neg' : (stockNum === 0 ? 'cs-stock--zero' : '');

        var header = el('div', 'cs-card-header');
        var ubiSpan = el('span', 'cs-card-ubi');
        ubiSpan.textContent = val(r.ubicacion);
        if (r.libre) ubiSpan.appendChild(buildBadgeLibre());
        var stockSpan = el('span', 'cs-card-stock ' + stockCls);
        stockSpan.textContent = fmt(r.stock);
        header.appendChild(ubiSpan);
        header.appendChild(stockSpan);

        var artDiv = el('div', 'cs-card-articulo');
        artDiv.textContent = val(r.articulo);

        var nomDiv = el('div', 'cs-card-nombre');
        nomDiv.textContent = val(r.nombre);

        var meta = el('div', 'cs-card-meta');
        if (r.lote) {
            var loteSpan = el('span');
            loteSpan.textContent = 'Lote: ' + r.lote;
            meta.appendChild(loteSpan);
        }

        div.appendChild(header);
        div.appendChild(artDiv);
        div.appendChild(nomDiv);
        if (meta.children.length) div.appendChild(meta);
        return div;
    }

    // ── RENDER STATUSBAR ──────────────────────────────────────────────────────

    function renderStatusbar(n, ts, limit) {
        var countEl = $('cs-count');
        if (countEl) countEl.textContent = n + ' registro' + (n !== 1 ? 's' : '');

        var tsEl = $('cs-timestamp');
        if (tsEl) tsEl.textContent = '· Actualizado ' + fmtTime(ts);

        var warnEl = $('cs-limit-warn');
        if (warnEl) warnEl.hidden = !limit;
    }

    // ── RENDER TOTALES ────────────────────────────────────────────────────────

    function renderTotales(rows) {
        var total = rows.reduce(function (s, r) { return s + (parseFloat(r.stock) || 0); }, 0);
        var totalEl = $('total-stock');
        if (totalEl) totalEl.textContent = fmt(total);
    }

    // ── PANEL LATERAL ─────────────────────────────────────────────────────────

    function selectRow(tr, r) {
        // Desmarcar fila anterior
        var prev = document.querySelector('.cs-row--selected');
        if (prev) prev.classList.remove('cs-row--selected');
        tr.classList.add('cs-row--selected');
        _current = r;
    }

    function openDetail(r) {
        var panel = $('cs-detail');
        var workspace = $('cs-workspace');
        var backdrop = $('cs-detail-backdrop');
        if (!panel || !workspace) return;

        buildDetailBody(r);

        var url = '../movimientos-por-articulo/index.html?articulo='
                + encodeURIComponent(r.articulo || '');
        var btnMov = $('cs-btn-movimientos');
        if (btnMov) btnMov.href = url;

        panel.hidden = false;
        workspace.classList.add('cs-detail-open');

        if (backdrop) {
            backdrop.hidden = false;
            backdrop.addEventListener('click', closeDetail, { once: true });
        }

        _current = r;
    }

    function closeDetail() {
        var panel = $('cs-detail');
        var workspace = $('cs-workspace');
        var backdrop = $('cs-detail-backdrop');

        if (panel)    panel.hidden = true;
        if (workspace) workspace.classList.remove('cs-detail-open');
        if (backdrop)  backdrop.hidden = true;

        var prev = document.querySelector('.cs-row--selected');
        if (prev) prev.classList.remove('cs-row--selected');

        _current = null;
    }

    function buildDetailBody(r) {
        var body = $('cs-detail-body');
        if (!body) return;
        body.innerHTML = '';

        var frag = document.createDocumentFragment();

        // Stock (destacado)
        var stockRow = el('div', 'cs-detail-row');
        var stockLbl = el('span', 'cs-detail-lbl');
        stockLbl.textContent = 'Stock actual';
        var stockNum = parseFloat(r.stock) || 0;
        var stockCls = stockNum < 0 ? 'cs-detail-stock cs-stock--neg'
                     : stockNum === 0 ? 'cs-detail-stock cs-stock--zero'
                     : 'cs-detail-stock';
        var stockVal = el('span', stockCls);
        stockVal.textContent = fmt(r.stock);
        stockRow.appendChild(stockLbl);
        stockRow.appendChild(stockVal);
        frag.appendChild(stockRow);

        // Artículo
        frag.appendChild(buildDetailRow('Artículo', val(r.articulo)));

        // Nombre
        frag.appendChild(buildDetailRow('Nombre', val(r.nombre)));

        // Ubicación
        var ubiRow = buildDetailRow('Ubicación', val(r.ubicacion));
        if (r.nom_ubicacion) {
            var ubiSub = el('span', 'cs-detail-val');
            ubiSub.style.cssText = 'font-size:.78rem;color:var(--sga-text-muted)';
            ubiSub.textContent = r.nom_ubicacion;
            ubiRow.appendChild(ubiSub);
        }
        frag.appendChild(ubiRow);

        // Lote
        frag.appendChild(buildDetailRow('Lote', val(r.lote, 'Sin lote')));

        // Palets / Múltiple
        if (r.palets || r.multiple) {
            var row2 = el('div', 'cs-detail-row');
            var lbl2 = el('span', 'cs-detail-lbl');
            lbl2.textContent = 'Palets / Múltiple';
            var val2 = el('span', 'cs-detail-val');
            val2.textContent = fmt(r.palets || 0) + ' / ' + fmt(r.multiple || 0);
            row2.appendChild(lbl2);
            row2.appendChild(val2);
            frag.appendChild(row2);
        }

        // Libre
        var libreRow = el('div', 'cs-detail-row');
        var libreLbl = el('span', 'cs-detail-lbl');
        libreLbl.textContent = 'Ubicación libre';
        var libreVal = el('span', 'cs-detail-val');
        if (r.libre) {
            libreVal.appendChild(buildBadgeLibre());
        } else {
            libreVal.textContent = 'No';
        }
        libreRow.appendChild(libreLbl);
        libreRow.appendChild(libreVal);
        frag.appendChild(libreRow);

        body.appendChild(frag);
    }

    function buildDetailRow(lbl, value) {
        var row = el('div', 'cs-detail-row');
        var lblEl = el('span', 'cs-detail-lbl');
        lblEl.textContent = lbl;
        var valEl = el('span', 'cs-detail-val');
        valEl.textContent = value;
        row.appendChild(lblEl);
        row.appendChild(valEl);
        return row;
    }

    // ── EXPORTAR CSV ──────────────────────────────────────────────────────────

    function exportarCSV() {
        if (!_filtered.length) return;

        var headers = ['Ubicacion', 'Articulo', 'Nombre', 'Lote', 'Stock', 'Palets', 'Multiple', 'Libre'];
        var lines = [headers.join(';')];

        _filtered.forEach(function (r) {
            var line = [
                r.ubicacion   || '',
                r.articulo    || '',
                (r.nombre     || '').replace(/;/g, ','),
                r.lote        || '',
                r.stock       ?? 0,
                r.palets      ?? 0,
                r.multiple    ?? 0,
                r.libre ? 'Si' : 'No',
            ].join(';');
            lines.push(line);
        });

        var csv = lines.join('\n');
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        a.download = 'stock_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // ── TOGGLE FILTROS SECUNDARIOS ────────────────────────────────────────────

    function toggleFiltrosSecundarios() {
        var panel = $('filtros-secundarios');
        var btn   = $('btn-toggle-filtros');
        if (!panel || !btn) return;
        var abierto = !panel.hidden;
        panel.hidden = abierto;
        btn.setAttribute('aria-expanded', String(!abierto));
        btn.textContent = abierto ? '▸ Más filtros' : '▴ Menos filtros';
    }

    // ── INIT ──────────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', function () {

        // Autofoco en artículo al cargar
        var artInp = $('f-articulo');
        if (artInp) artInp.focus();

        // Buscar / Actualizar
        var btnBuscar = $('btn-buscar');
        if (btnBuscar) btnBuscar.addEventListener('click', cargarDatos);

        var btnActualizar = $('btn-actualizar');
        if (btnActualizar) btnActualizar.addEventListener('click', cargarDatos);

        // Exportar CSV
        var btnExportar = $('btn-exportar');
        if (btnExportar) btnExportar.addEventListener('click', exportarCSV);

        // Toggle filtros secundarios
        var btnToggle = $('btn-toggle-filtros');
        if (btnToggle) btnToggle.addEventListener('click', toggleFiltrosSecundarios);

        // Filtro client-side (libre)
        var fLibre = $('f-libre');
        if (fLibre) fLibre.addEventListener('change', applyClientFilters);

        // Cerrar panel lateral
        var btnClose = $('cs-detail-close');
        if (btnClose) btnClose.addEventListener('click', closeDetail);

        // Cerrar con Escape
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && _current) closeDetail();
        });

        // F5
        document.addEventListener('keydown', function (e) {
            if (e.key === 'F5') { e.preventDefault(); cargarDatos(); }
        });

        // Enter en inputs de filtros primarios
        ['f-articulo', 'f-ubicacion', 'f-lote'].forEach(function (id) {
            var inp = $(id);
            if (inp) inp.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') cargarDatos();
            });
        });
    });

})();
