"use strict";

(function () {

    // ── ESTADO ────────────────────────────────────────────────────────────────

    var _rows        = [];   // rows devueltos por el API
    var _selectedIdx = -1;   // índice del row seleccionado en _rows
    var _loading     = false;

    // ── HELPERS ───────────────────────────────────────────────────────────────

    function fmt(n) {
        return Number(n != null ? n : 0).toLocaleString('es-ES');
    }

    function dash(v) {
        var s = (v != null) ? String(v).trim() : '';
        return s.length ? s : '—';
    }

    function fmtFecha(iso) {
        // "2024-05-08" → "08/05/2024"
        if (!iso) return '—';
        var p = String(iso).slice(0, 10).split('-');
        return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
    }

    function fmtHora(s) {
        // "10:30:00" → "10:30"
        return s ? String(s).slice(0, 5) : '—';
    }

    function isoHoy() {
        return new Date().toISOString().slice(0, 10);
    }

    function isoHace30() {
        var d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 10);
    }

    var TIPO_LABEL = { E: 'Entrada', S: 'Salida', T: 'Traspaso', R: 'Regularización', P: 'Picking' };

    function labelTipo(t) {
        return TIPO_LABEL[t] || (t ? String(t) : '—');
    }

    function classTipo(t) {
        var allowed = { E: 'e', S: 's', T: 't', R: 'r', P: 'p' };
        return 'mv-card--' + (allowed[t] || 'x');
    }

    function classBadge(t) {
        var allowed = { E: 'e', S: 's', T: 't', R: 'r', P: 'p' };
        return 'mv-card-badge--' + (allowed[t] || 'x');
    }

    function labelFecha(iso) {
        var hoy    = isoHoy();
        var d      = new Date();
        d.setDate(d.getDate() - 1);
        var ayer   = d.toISOString().slice(0, 10);
        if (iso === hoy)  return 'Hoy';
        if (iso === ayer) return 'Ayer';
        return null;
    }

    function qtyClass(n) {
        var num = Number(n);
        if (num > 0)  return 'mv-card-qty--pos';
        if (num < 0)  return 'mv-card-qty--neg';
        return 'mv-card-qty--zero';
    }

    function qtySign(n) {
        return Number(n) > 0 ? '+' : '';
    }

    function panelQtyClass(n) {
        var num = Number(n);
        if (num > 0)  return 'mv-detail-qty--pos';
        if (num < 0)  return 'mv-detail-qty--neg';
        return 'mv-detail-qty--zero';
    }

    // ── AGRUPACIÓN POR FECHA ──────────────────────────────────────────────────

    function groupByDate(rows) {
        var map = new Map();
        rows.forEach(function (r) {
            var d = (r.fecha || '').slice(0, 10);
            if (!map.has(d)) map.set(d, []);
            map.get(d).push(r);
        });
        return map;
    }

    // ── CONSTRUCCIÓN DE TARJETA ───────────────────────────────────────────────

    function buildCard(row, idx) {
        var tipo = (row.tipo || '').toUpperCase();
        var cant = Number(row.cantidad != null ? row.cantidad : 0);

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mv-card ' + classTipo(tipo);
        if (idx === _selectedIdx) btn.classList.add('mv-card--selected');

        // Badge
        var badge = document.createElement('div');
        badge.className = 'mv-card-badge ' + classBadge(tipo);
        badge.textContent = tipo || '?';

        // Hora
        var time = document.createElement('div');
        time.className = 'mv-card-time';
        time.textContent = fmtHora(row.hora);

        // Cuerpo
        var body = document.createElement('div');
        body.className = 'mv-card-body';

        var art = document.createElement('div');
        art.className = 'mv-card-art';
        art.textContent = dash(row.articulo_buscado || row.articulo || '');
        // La búsqueda puede filtrar por artículo; si el campo no existe en el row
        // se mostrará el valor del filtro o '—'. El backend no devuelve ACSARTCOD
        // directamente, pero el campo de filtro está accesible en cierre.

        var meta = document.createElement('div');
        meta.className = 'mv-card-meta';
        var lotePart = row.lote ? 'Lote: ' + row.lote : '';
        var ubiPart  = row.ubicacion ? row.ubicacion : '';
        meta.textContent = [lotePart, ubiPart].filter(Boolean).join('  ·  ') || '—';

        var doc = document.createElement('div');
        doc.className = 'mv-card-doc';
        var docParts = [];
        if (row.serie && row.numero) docParts.push('Alb. ' + row.serie + row.numero);
        else if (row.numero)         docParts.push('Nº ' + row.numero);
        if (row.nombre_tercero)      docParts.push(String(row.nombre_tercero).slice(0, 28));
        doc.textContent = docParts.join('  ·  ') || '';

        body.append(art, meta, doc);

        // Cantidad
        var qty = document.createElement('div');
        qty.className = 'mv-card-qty ' + qtyClass(cant);
        qty.textContent = qtySign(cant) + fmt(cant);

        btn.append(badge, time, body, qty);

        btn.addEventListener('click', function () { selectCard(idx); });
        btn.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectCard(idx);
            }
        });

        return btn;
    }

    // ── CONSTRUCCIÓN DE GRUPO DE DÍA ─────────────────────────────────────────

    function buildDayGroup(dateIso, rows, startIdx) {
        var group = document.createElement('div');
        group.className = 'mv-day-group';

        // Cabecera de día
        var header = document.createElement('div');
        header.className = 'mv-day-header';

        var spanDate = document.createElement('span');
        spanDate.className = 'mv-day-header-date';
        spanDate.textContent = fmtFecha(dateIso);

        var relLabel = labelFecha(dateIso);
        if (relLabel) {
            var spanLabel = document.createElement('span');
            spanLabel.className = 'mv-day-header-label';
            spanLabel.textContent = relLabel;
            header.append(spanDate, spanLabel);
        } else {
            header.append(spanDate);
        }

        var spanCount = document.createElement('span');
        spanCount.className = 'mv-day-header-count';
        spanCount.textContent = rows.length + (rows.length === 1 ? ' movimiento' : ' movimientos');
        header.appendChild(spanCount);

        // Lista de cards
        var list = document.createElement('div');
        list.className = 'mv-cards-list';

        var frag = document.createDocumentFragment();
        rows.forEach(function (row, i) {
            frag.appendChild(buildCard(row, startIdx + i));
        });
        list.appendChild(frag);

        group.append(header, list);
        return group;
    }

    // ── RENDERIZADO DEL TIMELINE ──────────────────────────────────────────────

    function renderTimeline(rows) {
        var container = document.getElementById('mv-timeline');
        if (!container) return;
        container.innerHTML = '';

        var frag = document.createDocumentFragment();

        if (!rows || !rows.length) {
            var empty = document.createElement('div');
            empty.className = 'mv-empty';
            var icon = document.createElement('span');
            icon.className = 'mv-empty-icon';
            icon.textContent = '📭';
            var txt = document.createTextNode('Sin movimientos para los filtros seleccionados.');
            empty.append(icon, txt);
            frag.appendChild(empty);
            container.appendChild(frag);
            updateSummary([]);
            return;
        }

        // Nota de límite
        if (rows.length >= 500) {
            var note = document.createElement('div');
            note.className = 'mv-limit-note';
            note.textContent = 'Mostrando hasta 500 movimientos. Afina los filtros para ver resultados más precisos.';
            frag.appendChild(note);
        }

        // Agrupar y construir
        var grouped = groupByDate(rows);
        var offset = 0;
        grouped.forEach(function (dayRows, dateIso) {
            frag.appendChild(buildDayGroup(dateIso, dayRows, offset));
            offset += dayRows.length;
        });

        container.appendChild(frag);
        updateSummary(rows);
    }

    // ── RESUMEN ───────────────────────────────────────────────────────────────

    function updateSummary(rows) {
        var bar = document.getElementById('mv-summary');
        var txt = document.getElementById('mv-summary-text');
        if (!bar || !txt) return;

        if (!rows || !rows.length) {
            bar.hidden = true;
            return;
        }

        bar.hidden = false;
        txt.innerHTML = '';

        var spanCount = document.createElement('span');
        spanCount.className = 'mv-summary-count';
        spanCount.textContent = rows.length + (rows.length === 1 ? ' movimiento' : ' movimientos');
        txt.appendChild(spanCount);

        // Stock del primer row (si existe — mismo artículo)
        var firstStock = rows[0] && rows[0].stock != null ? rows[0].stock : null;
        if (firstStock !== null) {
            var sep = document.createTextNode('  ·  ');
            var spanStock = document.createElement('span');
            spanStock.className = 'mv-summary-stock';
            spanStock.textContent = 'Stock actual: ' + fmt(firstStock) + ' uds';
            txt.append(sep, spanStock);
        }
    }

    // ── PANEL DE DETALLE ──────────────────────────────────────────────────────

    function makeDetailRow(label, value) {
        var row = document.createElement('div');
        row.className = 'mv-detail-row';

        var lbl = document.createElement('span');
        lbl.className = 'mv-detail-label';
        lbl.textContent = label;

        var val = document.createElement('span');
        val.className = 'mv-detail-value';
        val.textContent = dash(value);

        row.append(lbl, val);
        return row;
    }

    function renderPanel(row) {
        var panelEmpty = document.getElementById('mv-panel-empty');
        var panelBody  = document.getElementById('mv-panel-body');
        if (!panelBody) return;

        if (panelEmpty) panelEmpty.hidden = true;
        panelBody.hidden = false;
        panelBody.innerHTML = '';

        var tipo = (row.tipo || '').toUpperCase();
        var cant = Number(row.cantidad != null ? row.cantidad : 0);

        // ── Hero: badge + tipo + fecha/hora
        var hero = document.createElement('div');
        hero.className = 'mv-panel-hero';

        var badgeLg = document.createElement('div');
        badgeLg.className = 'mv-panel-badge-lg ' + classBadge(tipo);
        badgeLg.textContent = tipo || '?';

        var heroInfo = document.createElement('div');
        heroInfo.className = 'mv-panel-hero-info';

        var tipoSpan = document.createElement('div');
        tipoSpan.className = 'mv-panel-tipo';
        tipoSpan.textContent = labelTipo(tipo);

        var dtSpan = document.createElement('div');
        dtSpan.className = 'mv-panel-datetime';
        dtSpan.textContent = fmtFecha(row.fecha) + '  ·  ' + fmtHora(row.hora);

        heroInfo.append(tipoSpan, dtSpan);
        hero.append(badgeLg, heroInfo);
        panelBody.appendChild(hero);

        // ── Sección: Movimiento
        var secMov = document.createElement('div');
        secMov.className = 'mv-panel-section';

        var secMovTitle = document.createElement('div');
        secMovTitle.className = 'mv-panel-section-title';
        secMovTitle.textContent = 'Movimiento';

        var qtyDiv = document.createElement('div');
        qtyDiv.className = 'mv-detail-qty ' + panelQtyClass(cant);
        qtyDiv.textContent = qtySign(cant) + fmt(cant) + ' ud';

        secMov.append(secMovTitle, qtyDiv);
        secMov.appendChild(makeDetailRow('Ubicación', row.ubicacion));
        secMov.appendChild(makeDetailRow('Lote', row.lote));
        panelBody.appendChild(secMov);

        // ── Sección: Documento
        var secDoc = document.createElement('div');
        secDoc.className = 'mv-panel-section';

        var secDocTitle = document.createElement('div');
        secDocTitle.className = 'mv-panel-section-title';
        secDocTitle.textContent = 'Documento';

        secDoc.appendChild(secDocTitle);
        var docRef = (row.serie && row.numero)
            ? row.serie + ' / ' + row.numero
            : (row.numero || null);
        secDoc.appendChild(makeDetailRow('Referencia', docRef));
        if (row.picking) secDoc.appendChild(makeDetailRow('Picking / Palet', row.picking));
        secDoc.appendChild(makeDetailRow('Empresa', row.empresa));
        panelBody.appendChild(secDoc);

        // ── Sección: Tercero
        var hasTercero = row.tercero || row.nombre_tercero || row.centro;
        if (hasTercero) {
            var secTerc = document.createElement('div');
            secTerc.className = 'mv-panel-section';

            var secTercTitle = document.createElement('div');
            secTercTitle.className = 'mv-panel-section-title';
            secTercTitle.textContent = 'Tercero';

            secTerc.appendChild(secTercTitle);
            secTerc.appendChild(makeDetailRow('Código', row.tercero));
            secTerc.appendChild(makeDetailRow('Nombre', row.nombre_tercero));
            if (row.centro) secTerc.appendChild(makeDetailRow('Centro', row.centro));
            panelBody.appendChild(secTerc);
        }

        // ── Sección: Trazabilidad técnica
        var secTraz = document.createElement('div');
        secTraz.className = 'mv-panel-section';

        var secTrazTitle = document.createElement('div');
        secTrazTitle.className = 'mv-panel-section-title';
        secTrazTitle.textContent = 'Trazabilidad';

        secTraz.appendChild(secTrazTitle);
        if (row.terminal) secTraz.appendChild(makeDetailRow('Terminal', row.terminal));
        if (row.caja)     secTraz.appendChild(makeDetailRow('Caja', row.caja));
        if (row.palet)    secTraz.appendChild(makeDetailRow('Palet', row.palet));
        panelBody.appendChild(secTraz);

        // ── Sección: Stock registrado
        if (row.stock != null) {
            var secStock = document.createElement('div');
            secStock.className = 'mv-panel-section';

            var secStockTitle = document.createElement('div');
            secStockTitle.className = 'mv-panel-section-title';
            secStockTitle.textContent = 'Stock registrado';

            var stockVal = document.createElement('div');
            stockVal.className = 'mv-detail-value';
            stockVal.textContent = fmt(row.stock) + ' uds';

            var stockNote = document.createElement('div');
            stockNote.className = 'mv-detail-stock-note';
            stockNote.textContent = 'Valor actual del artículo — no snapshot histórico del movimiento.';

            secStock.append(secStockTitle, stockVal, stockNote);
            panelBody.appendChild(secStock);
        }

        // Abrir panel
        openPanel();
    }

    // ── APERTURA Y CIERRE DEL PANEL ───────────────────────────────────────────

    function openPanel() {
        var panel    = document.getElementById('mv-panel');
        var backdrop = document.getElementById('mv-panel-backdrop');
        if (panel)    panel.classList.add('mv-panel--open');
        if (backdrop) backdrop.classList.add('mv-panel-backdrop--visible');
    }

    function closePanel() {
        _selectedIdx = -1;
        var panel    = document.getElementById('mv-panel');
        var backdrop = document.getElementById('mv-panel-backdrop');
        if (panel)    panel.classList.remove('mv-panel--open');
        if (backdrop) backdrop.classList.remove('mv-panel-backdrop--visible');

        var panelEmpty = document.getElementById('mv-panel-empty');
        var panelBody  = document.getElementById('mv-panel-body');
        if (panelEmpty) panelEmpty.hidden = false;
        if (panelBody)  panelBody.hidden  = true;
        if (panelBody)  panelBody.innerHTML = '';

        // Quitar selección de todas las cards
        document.querySelectorAll('.mv-card--selected').forEach(function (el) {
            el.classList.remove('mv-card--selected');
        });
    }

    // ── SELECCIÓN DE TARJETA ──────────────────────────────────────────────────

    function selectCard(idx) {
        if (idx < 0 || idx >= _rows.length) return;
        _selectedIdx = idx;

        // Actualizar selección visual
        document.querySelectorAll('.mv-card').forEach(function (el, i) {
            el.classList.toggle('mv-card--selected', i === idx);
        });

        renderPanel(_rows[idx]);
    }

    // ── LEER FILTROS ──────────────────────────────────────────────────────────

    function getFilterParams() {
        return {
            articulo:  val('mv-f-articulo'),
            lote:      val('mv-f-lote'),
            ubicacion: val('mv-f-ubicacion'),
            movimiento: val('mv-f-tipo'),
            desde:     val('mv-f-desde'),
            hasta:     val('mv-f-hasta'),
            cliente:   val('mv-f-cliente')
        };
    }

    function val(id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    // ── CARGA DE DATOS ────────────────────────────────────────────────────────

    function setLoading() {
        var container = document.getElementById('mv-timeline');
        if (!container) return;
        container.innerHTML = '';

        var div = document.createElement('div');
        div.className = 'mv-loading';
        var icon = document.createElement('span');
        icon.className = 'mv-loading-icon';
        icon.textContent = '⏳';
        var txt = document.createTextNode('Cargando movimientos…');
        div.append(icon, txt);
        container.appendChild(div);
    }

    function setError(err) {
        var container = document.getElementById('mv-timeline');
        if (!container) return;
        container.innerHTML = '';

        var div = document.createElement('div');
        div.className = 'mv-error';
        div.textContent = 'No se pudieron cargar los movimientos. ' +
            (err && err.message ? err.message : 'Compruebe la conexión con el servidor.');
        container.appendChild(div);

        updateSummary([]);
    }

    function cargarMovimientos() {
        if (_loading) return;
        _loading = true;

        var btn = document.getElementById('btn-mv-buscar');
        if (btn) { btn.disabled = true; btn.textContent = 'Cargando…'; }

        closePanel();
        setLoading();

        var params = getFilterParams();

        // Guardar artículo buscado para mostrarlo en las cards
        var articuloBuscado = params.articulo;

        SGA.movimientos.list(params).then(function (data) {
            _rows = (Array.isArray(data) ? data : []).map(function (r) {
                // Inyectar el artículo buscado para mostrarlo en la card
                r.articulo_buscado = articuloBuscado || null;
                return r;
            });
            renderTimeline(_rows);

            var exportBtn = document.getElementById('btn-mv-exportar');
            if (exportBtn) exportBtn.disabled = _rows.length === 0;

        }).catch(function (err) {
            console.error('[movimientos-mv]', err);
            _rows = [];
            setError(err);

        }).then(function () {
            _loading = false;
            if (btn) { btn.disabled = false; btn.textContent = 'Buscar'; }
        });
    }

    // ── LIMPIAR FILTROS ───────────────────────────────────────────────────────

    function limpiarFiltros() {
        ['mv-f-articulo','mv-f-lote','mv-f-ubicacion','mv-f-cliente'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });

        var tipoEl = document.getElementById('mv-f-tipo');
        if (tipoEl) tipoEl.value = '';

        // Restablecer fechas por defecto
        var desdeEl = document.getElementById('mv-f-desde');
        var hastaEl = document.getElementById('mv-f-hasta');
        if (desdeEl) desdeEl.value = isoHace30();
        if (hastaEl) hastaEl.value = isoHoy();

        _rows = [];
        _selectedIdx = -1;
        closePanel();

        // Restaurar placeholder
        var container = document.getElementById('mv-timeline');
        if (container) {
            container.innerHTML = '';
            var ph = document.createElement('div');
            ph.className = 'mv-placeholder';
            ph.id = 'mv-placeholder';
            var icon = document.createElement('span');
            icon.className = 'mv-placeholder-icon';
            icon.textContent = '🔍';
            var txt = document.createTextNode('Introduce un artículo u otros filtros y pulsa ');
            var strong = document.createElement('strong');
            strong.textContent = 'Buscar';
            var txt2 = document.createTextNode(' para ver el timeline de movimientos.');
            ph.append(icon, txt, strong, txt2);
            container.appendChild(ph);
        }

        var bar = document.getElementById('mv-summary');
        if (bar) bar.hidden = true;

        var exportBtn = document.getElementById('btn-mv-exportar');
        if (exportBtn) exportBtn.disabled = true;
    }

    // ── EXPORTAR CSV ──────────────────────────────────────────────────────────

    function exportarCSV() {
        if (!_rows.length) return;

        var headers = [
            'empresa','fecha','hora','tipo','serie','numero','picking',
            'ubicacion','lote','cantidad','stock','terminal','caja',
            'palet','tercero','centro','nombre_tercero'
        ];

        var lines = [headers.join(';')];

        _rows.forEach(function (r) {
            var row = headers.map(function (k) {
                var v = r[k];
                if (v == null) return '';
                var s = String(v);
                // Escapar valores con punto y coma
                if (s.indexOf(';') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
                    s = '"' + s.replace(/"/g, '""') + '"';
                }
                return s;
            });
            lines.push(row.join(';'));
        });

        var csv  = lines.join('\r\n');
        var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href     = url;
        a.download = 'movimientos_' + isoHoy() + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ── INIT ──────────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', function () {

        // Fechas por defecto
        var desdeEl = document.getElementById('mv-f-desde');
        var hastaEl = document.getElementById('mv-f-hasta');
        if (desdeEl) desdeEl.value = isoHace30();
        if (hastaEl) hastaEl.value = isoHoy();

        // URL params: ?articulo=X&ubicacion=Y&lote=Z
        var urlParams = new URLSearchParams(window.location.search);
        var paramMap  = { articulo: 'mv-f-articulo', ubicacion: 'mv-f-ubicacion', lote: 'mv-f-lote' };
        var hasTrigger = false;

        Object.keys(paramMap).forEach(function (key) {
            var v = urlParams.get(key);
            if (v) {
                var el = document.getElementById(paramMap[key]);
                if (el) { el.value = v; hasTrigger = true; }
            }
        });

        // Fecha desde URL (opcional)
        var urlDesde = urlParams.get('desde');
        var urlHasta = urlParams.get('hasta');
        if (urlDesde && desdeEl) desdeEl.value = urlDesde;
        if (urlHasta && hastaEl) hastaEl.value = urlHasta;

        // Botones
        var btnBuscar  = document.getElementById('btn-mv-buscar');
        var btnLimpiar = document.getElementById('btn-mv-limpiar');
        var btnExport  = document.getElementById('btn-mv-exportar');
        var btnClose   = document.getElementById('btn-mv-panel-close');
        var backdrop   = document.getElementById('mv-panel-backdrop');

        if (btnBuscar)  btnBuscar.addEventListener('click', cargarMovimientos);
        if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarFiltros);
        if (btnExport)  btnExport.addEventListener('click', exportarCSV);
        if (btnClose)   btnClose.addEventListener('click', closePanel);
        if (backdrop)   backdrop.addEventListener('click', closePanel);

        // Enter en inputs dispara búsqueda
        ['mv-f-articulo','mv-f-lote','mv-f-ubicacion','mv-f-cliente'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') cargarMovimientos();
                });
            }
        });

        // Teclado global
        document.addEventListener('keydown', function (e) {
            if (e.key === 'F5') {
                e.preventDefault();
                cargarMovimientos();
            }
            if (e.key === 'Escape') {
                closePanel();
            }
        });

        // Auto-carga si hay parámetros en URL
        if (hasTrigger) {
            cargarMovimientos();
        }
    });

})();
