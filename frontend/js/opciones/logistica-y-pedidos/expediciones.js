"use strict";

(function () {

    /* ── ESTADO ──────────────────────────────────────────────────────────── */

    var _rows      = [];
    var _albaranes = Object.create(null);
    var _selected  = null;
    var _loading   = false;
    var _filters   = {
        buscar : '',
        desde  : '',
        hasta  : '',
        status : 'todos'
    };

    /* ── REFS DOM ────────────────────────────────────────────────────────── */

    var elList        = null;
    var elPanel       = null;
    var elPanelTitle  = null;
    var elPanelEmpty  = null;
    var elPanelMeta   = null;
    var elPanelBody   = null;
    var elPanelClose  = null;
    var elBackdrop    = null;
    var elDesde       = null;
    var elHasta       = null;
    var elBuscar      = null;
    var elStatus      = null;
    var elCntTotal    = null;
    var elCntPend     = null;
    var elCntParcial  = null;
    var elCntPrep     = null;
    var elKpiStrip    = null;
    var elLimitNotice = null;

    /* ── FECHAS ──────────────────────────────────────────────────────────── */

    function getDefaultDesde() {
        var d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return d.toISOString().split('T')[0];
    }

    function getDefaultHasta() {
        return new Date().toISOString().split('T')[0];
    }

    function formatFecha(isoStr) {
        if (!isoStr) return '';
        var parts = isoStr.split('-');
        if (parts.length !== 3) return isoStr;
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    /* ── AGRUPACIÓN ──────────────────────────────────────────────────────── */

    function groupByAlbaran(rows) {
        var map = Object.create(null);
        rows.forEach(function (r) {
            var key = String(r.albaran) + '|' + (r.serie || '');
            if (!map[key]) {
                map[key] = {
                    key            : key,
                    albaran        : r.albaran,
                    serie          : r.serie || '',
                    cliente        : r.cliente || '',
                    nombre_cliente : r.nombre_cliente || '',
                    fecha          : r.fecha || '',
                    lineas         : []
                };
            }
            if (r.articulo) {
                map[key].lineas.push({
                    articulo        : r.articulo,
                    nombre_articulo : r.nombre_articulo || r.articulo,
                    cantidad        : r.cantidad,
                    ubicacion       : r.ubicacion || '',
                    lote            : r.lote || '',
                    picking         : r.picking || ''
                });
            }
        });
        Object.keys(map).forEach(function (k) {
            var alb    = map[k];
            var total  = alb.lineas.length;
            var conPick = alb.lineas.filter(function (l) { return !!l.picking; }).length;
            alb.numPicking = conPick
                ? alb.lineas.find(function (l) { return !!l.picking; }).picking
                : null;
            if (total === 0 || conPick === 0) alb.status = 'pendiente';
            else if (conPick === total)        alb.status = 'preparado';
            else                               alb.status = 'parcial';
        });
        return map;
    }

    /* ── FILTRO EN MEMORIA ───────────────────────────────────────────────── */

    function filterAlbaranes() {
        var st = _filters.status;
        return Object.values(_albaranes).filter(function (alb) {
            return st === 'todos' || alb.status === st;
        });
    }

    /* ── CARGA DESDE SERVIDOR ────────────────────────────────────────────── */

    var _ultimaFechaDisponible = null;
    var _limitAlcanzado        = false;

    function cargar() {
        if (_loading) return;
        _loading = true;
        setLoading(true);

        SGA.expediciones.list({
            buscar : _filters.buscar,
            desde  : _filters.desde,
            hasta  : _filters.hasta
        }).then(function (data) {
            _rows      = Array.isArray(data) ? data : [];
            _albaranes = groupByAlbaran(_rows);
            _loading   = false;
            _limitAlcanzado = _rows.length >= 500;
            if (_rows.length > 0) {
                var fechas = _rows.map(function (r) { return r.fecha || ''; })
                    .filter(Boolean).sort();
                _ultimaFechaDisponible = fechas[fechas.length - 1] || null;
            } else {
                _ultimaFechaDisponible = null;
            }
            filterAndRender();
        }).catch(function (err) {
            console.error('[EP] error al cargar expediciones:', err);
            _loading = false;
            showError('Error al conectar con el servidor. Comprueba la conexión.');
        });
    }

    /* ── RENDER PRINCIPAL ────────────────────────────────────────────────── */

    function filterAndRender() {
        var lista = filterAlbaranes();
        renderList(lista);
        updateCounters();
        updateKpiStrip();
    }

    function _rangoEsCorto() {
        if (!_filters.desde || !_filters.hasta) return false;
        var d = new Date(_filters.desde);
        var h = new Date(_filters.hasta);
        return (h - d) <= 31 * 24 * 60 * 60 * 1000;
    }

    function _formatFechaMes(isoStr) {
        if (!isoStr) return null;
        var m = ['enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre'];
        var parts = isoStr.split('-');
        if (parts.length < 2) return isoStr;
        var mes = parseInt(parts[1], 10) - 1;
        return m[mes] + ' ' + parts[0];
    }

    function renderList(lista) {
        elList.innerHTML = '';

        if (elLimitNotice) elLimitNotice.hidden = true;

        if (!lista.length) {
            var ph = document.createElement('div');
            ph.className = 'ep-placeholder';
            var icon = document.createElement('span');
            icon.className = 'ep-placeholder-icon';
            icon.textContent = '🚛';
            ph.appendChild(icon);

            var msg = ' No hay expediciones para los filtros aplicados.';
            if (_rangoEsCorto() && _ultimaFechaDisponible) {
                var mesDisp = _formatFechaMes(_ultimaFechaDisponible);
                msg = ' No hay expediciones en este periodo.'
                    + '\nEl último registro disponible es de ' + mesDisp + '.'
                    + '\nPrueba ampliando el rango de fechas.';
            }
            msg.split('\n').forEach(function (linea, i) {
                if (i > 0) ph.appendChild(document.createElement('br'));
                ph.appendChild(document.createTextNode(linea));
            });

            elList.appendChild(ph);
            return;
        }

        if (_limitAlcanzado && elLimitNotice) {
            elLimitNotice.hidden = false;
        }

        lista.forEach(function (alb) {
            elList.appendChild(buildCard(alb));
        });
    }

    /* ── TARJETA ─────────────────────────────────────────────────────────── */

    function buildCard(alb) {
        var card = document.createElement('div');
        card.className = 'ep-card' + (_selected === alb.key ? ' ep-card--active' : '');
        card.dataset.key = alb.key;

        var top = document.createElement('div');
        top.className = 'ep-card-top';
        top.appendChild(buildBadge(alb.status));
        var fecha = document.createElement('span');
        fecha.className = 'ep-card-fecha';
        fecha.textContent = formatFecha(alb.fecha);
        top.appendChild(fecha);
        card.appendChild(top);

        var albNum = document.createElement('div');
        albNum.className = 'ep-card-albaran';
        albNum.textContent = 'ALB ' + alb.albaran + (alb.serie ? ' · ' + alb.serie : '');
        card.appendChild(albNum);

        var cliente = document.createElement('div');
        cliente.className = 'ep-card-cliente';
        cliente.textContent = alb.nombre_cliente
            ? alb.nombre_cliente + (alb.cliente ? ' (' + alb.cliente + ')' : '')
            : alb.cliente || '—';
        card.appendChild(cliente);

        var footer = document.createElement('div');
        footer.className = 'ep-card-footer';
        var lineasTxt = document.createElement('span');
        lineasTxt.textContent = alb.lineas.length + ' línea' + (alb.lineas.length !== 1 ? 's' : '');
        footer.appendChild(lineasTxt);
        if (alb.numPicking) {
            var pickTxt = document.createElement('span');
            pickTxt.className = 'ep-card-picking';
            pickTxt.textContent = 'Pick.#' + alb.numPicking;
            footer.appendChild(pickTxt);
        }
        card.appendChild(footer);

        card.addEventListener('click', function () {
            selectAlbaran(alb.key);
        });

        return card;
    }

    /* ── BADGE ───────────────────────────────────────────────────────────── */

    function buildBadge(status) {
        var badge = document.createElement('span');
        badge.className = 'ep-badge ep-badge--' + status;
        var labels = { pendiente: 'Pendiente', parcial: 'Parcial', preparado: 'Con picking' };
        badge.textContent = labels[status] || status;
        return badge;
    }

    /* ── SELECCIÓN Y PANEL ───────────────────────────────────────────────── */

    function selectAlbaran(key) {
        _selected = key;
        var alb = _albaranes[key];

        document.querySelectorAll('.ep-card').forEach(function (c) {
            c.classList.toggle('ep-card--active', c.dataset.key === key);
        });

        renderDetalle(alb);
        openPanel();
    }

    function renderDetalle(alb) {
        elPanelTitle.textContent = 'ALB ' + alb.albaran + (alb.serie ? ' · ' + alb.serie : '');

        elPanelMeta.innerHTML = '';
        var mAlb = document.createElement('div');
        mAlb.className = 'ep-panel-meta-albaran';
        mAlb.textContent = 'Albarán ' + alb.albaran + (alb.serie ? ' / ' + alb.serie : '');
        elPanelMeta.appendChild(mAlb);

        var mCli = document.createElement('div');
        mCli.className = 'ep-panel-meta-cliente';
        mCli.textContent = alb.nombre_cliente
            ? alb.nombre_cliente + (alb.cliente ? ' · ' + alb.cliente : '')
            : alb.cliente || '—';
        elPanelMeta.appendChild(mCli);

        var mFecha = document.createElement('div');
        mFecha.className = 'ep-panel-meta-fecha';
        mFecha.textContent = formatFecha(alb.fecha);
        elPanelMeta.appendChild(mFecha);

        elPanelMeta.appendChild(buildBadge(alb.status));
        elPanelMeta.hidden = false;

        elPanelBody.innerHTML = '';
        if (!alb.lineas.length) {
            var noLines = document.createElement('div');
            noLines.style.padding = '16px';
            noLines.style.color = 'var(--sga-text-muted)';
            noLines.style.fontSize = '13px';
            noLines.textContent = 'Sin líneas de artículo registradas.';
            elPanelBody.appendChild(noLines);
        } else {
            alb.lineas.forEach(function (linea) {
                elPanelBody.appendChild(buildLineaEl(linea));
            });
        }
        elPanelBody.hidden = false;
        elPanelEmpty.hidden = true;
    }

    /* ── LÍNEA DE ARTÍCULO ───────────────────────────────────────────────── */

    function buildLineaEl(linea) {
        var div = document.createElement('div');
        div.className = 'ep-linea';

        var art = document.createElement('div');
        art.className = 'ep-linea-art';
        art.textContent = linea.articulo + ' · ' + linea.nombre_articulo;
        div.appendChild(art);

        var data = document.createElement('div');
        data.className = 'ep-linea-data';
        var parts = [];
        if (linea.cantidad !== null && linea.cantidad !== undefined) parts.push(linea.cantidad + ' uds');
        if (linea.lote)      parts.push('Lote: ' + linea.lote);
        if (linea.ubicacion) parts.push('Ubi: ' + linea.ubicacion);
        data.textContent = parts.join(' · ');
        div.appendChild(data);

        div.appendChild(buildAcciones(linea.articulo));
        return div;
    }

    function buildAcciones(articulo) {
        var wrap = document.createElement('div');
        wrap.className = 'ep-linea-actions';

        var aMov = document.createElement('a');
        aMov.className = 'ep-linea-link';
        aMov.textContent = '→ Movimientos';
        aMov.href = '../../almacen-y-stock/movimientos-por-articulo/index.html?articulo=' + encodeURIComponent(articulo);
        wrap.appendChild(aMov);

        var aStock = document.createElement('a');
        aStock.className = 'ep-linea-link';
        aStock.textContent = '→ Stock';
        aStock.href = '../../almacen-y-stock/consulta-de-stock/index.html?articulo=' + encodeURIComponent(articulo);
        wrap.appendChild(aStock);

        return wrap;
    }

    /* ── CONTADORES ──────────────────────────────────────────────────────── */

    function updateCounters() {
        var vals = Object.values(_albaranes);
        var total   = vals.length;
        var pend    = vals.filter(function (a) { return a.status === 'pendiente';  }).length;
        var parcial = vals.filter(function (a) { return a.status === 'parcial';    }).length;
        var prep    = vals.filter(function (a) { return a.status === 'preparado';  }).length;

        elCntTotal.textContent   = total;
        elCntPend.textContent    = pend;
        elCntParcial.textContent = parcial;
        elCntPrep.textContent    = prep;
    }

    /* ── KPI STRIP ───────────────────────────────────────────────────────── */

    function updateKpiStrip() {
        if (!elKpiStrip) return;
        elKpiStrip.innerHTML = '';
        elKpiStrip.hidden = false;

        var vals = Object.values(_albaranes);
        var total   = vals.length;
        var prep    = vals.filter(function (a) { return a.status === 'preparado'; }).length;
        var pct     = total > 0 ? Math.round(prep / total * 100) : 0;

        if (total === 0) {
            var g0 = document.createElement('span');
            g0.className = 'ep-kpi-grp';
            var v0 = document.createElement('span');
            v0.className = 'ep-kpi-val';
            v0.textContent = '0%';
            g0.appendChild(v0);
            g0.appendChild(document.createTextNode(' con picking'));
            elKpiStrip.appendChild(g0);

            var s0a = document.createElement('span');
            s0a.className = 'ep-kpi-sep';
            s0a.textContent = '·';
            elKpiStrip.appendChild(s0a);

            var g0b = document.createElement('span');
            g0b.className = 'ep-kpi-grp';
            var v0b = document.createElement('span');
            v0b.className = 'ep-kpi-val';
            v0b.textContent = '0 / 0';
            g0b.appendChild(v0b);
            g0b.appendChild(document.createTextNode(' expediciones'));
            elKpiStrip.appendChild(g0b);

            var s0b = document.createElement('span');
            s0b.className = 'ep-kpi-sep';
            s0b.textContent = '·';
            elKpiStrip.appendChild(s0b);

            var g0c = document.createElement('span');
            g0c.className = 'ep-kpi-grp';
            g0c.appendChild(document.createTextNode('Sin expediciones en este periodo'));
            elKpiStrip.appendChild(g0c);
            return;
        }

        var pctClass = pct >= 80 ? 'ep-kpi-val--verde'
                     : pct >= 40 ? 'ep-kpi-val--ambar'
                     :             'ep-kpi-val--rojo';

        var g1 = document.createElement('span');
        g1.className = 'ep-kpi-grp';
        var v1 = document.createElement('span');
        v1.className = 'ep-kpi-val ' + pctClass;
        v1.textContent = pct + '%';
        g1.appendChild(v1);
        g1.appendChild(document.createTextNode(' con picking'));
        elKpiStrip.appendChild(g1);

        var s1 = document.createElement('span');
        s1.className = 'ep-kpi-sep';
        s1.textContent = '·';
        elKpiStrip.appendChild(s1);

        var g2 = document.createElement('span');
        g2.className = 'ep-kpi-grp';
        var v2 = document.createElement('span');
        v2.className = 'ep-kpi-val';
        v2.textContent = prep + ' / ' + total;
        g2.appendChild(v2);
        g2.appendChild(document.createTextNode(' expediciones'));
        elKpiStrip.appendChild(g2);
    }

    /* ── PANEL OPEN / CLOSE ──────────────────────────────────────────────── */

    function openPanel() {
        elPanel.classList.add('ep-panel--open');
        elBackdrop.classList.add('ep-panel-backdrop--active');
    }

    function closePanel() {
        elPanel.classList.remove('ep-panel--open');
        elBackdrop.classList.remove('ep-panel-backdrop--active');
        _selected = null;
        document.querySelectorAll('.ep-card--active').forEach(function (c) {
            c.classList.remove('ep-card--active');
        });
        elPanelMeta.hidden    = true;
        elPanelBody.hidden    = true;
        elPanelEmpty.hidden   = false;
        elPanelTitle.textContent = 'Detalle';
    }

    /* ── BOTONES RÁPIDOS DE FECHA ────────────────────────────────────────── */

    function setQuickDate(days) {
        var hasta = getDefaultHasta();
        var desde;
        if (days === 0) {
            desde = hasta;
        } else {
            var d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            desde = d.toISOString().split('T')[0];
        }
        elDesde.value = desde;
        elHasta.value = hasta;

        document.querySelectorAll('.ep-quick-btn').forEach(function (btn) {
            btn.classList.toggle('ep-quick-btn--active', parseInt(btn.dataset.days, 10) === days);
        });
    }

    /* ── LOADING / ERROR ─────────────────────────────────────────────────── */

    function setLoading(on) {
        elList.innerHTML = '';
        if (on) {
            var ph = document.createElement('div');
            ph.className = 'ep-loading';
            var sp = document.createElement('span');
            sp.className = 'ep-spinner';
            sp.setAttribute('aria-hidden', 'true');
            ph.appendChild(sp);
            ph.appendChild(document.createTextNode('Cargando expediciones…'));
            elList.appendChild(ph);
        }
    }

    function showError(msg) {
        elList.innerHTML = '';
        var ph = document.createElement('div');
        ph.className = 'ep-placeholder';
        ph.textContent = msg;
        elList.appendChild(ph);
        elCntTotal.textContent = elCntPend.textContent = elCntParcial.textContent = elCntPrep.textContent = '—';
    }

    /* ── LEER PARAMS DE URL ──────────────────────────────────────────────── */

    function readUrlParams() {
        try {
            var params = new URLSearchParams(window.location.search);
            if (params.get('albaran')) {
                elBuscar.value   = params.get('albaran');
                _filters.buscar  = params.get('albaran');
            }
            if (params.get('cliente')) {
                elBuscar.value   = elBuscar.value || params.get('cliente');
                _filters.buscar  = _filters.buscar || params.get('cliente');
            }
        } catch (_) {}
    }

    /* ── DEBOUNCE ────────────────────────────────────────────────────────── */

    function debounce(fn, ms) {
        var timer;
        return function () {
            clearTimeout(timer);
            timer = setTimeout(fn, ms);
        };
    }

    /* ── INIT ────────────────────────────────────────────────────────────── */

    function initFiltros() {
        _filters.desde = getDefaultDesde();
        _filters.hasta = getDefaultHasta();
        elDesde.value  = _filters.desde;
        elHasta.value  = _filters.hasta;
    }

    function dispararBusqueda() {
        _filters.desde  = elDesde.value;
        _filters.hasta  = elHasta.value;
        _filters.buscar = elBuscar.value.trim();
        cargar();
    }

    function wireEvents() {
        elStatus.addEventListener('change', function () {
            _filters.status = elStatus.value;
            filterAndRender();
        });

        document.querySelectorAll('.ep-quick-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                setQuickDate(parseInt(btn.dataset.days, 10));
            });
        });

        var btnBuscar = document.getElementById('ep-btn-buscar');
        if (btnBuscar) {
            btnBuscar.addEventListener('click', dispararBusqueda);
        }

        elBuscar.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') dispararBusqueda();
        });

        var btnExportar = document.getElementById('btn-exportar');
        if (btnExportar) btnExportar.addEventListener('click', function () {
            var params = {
                buscar: _filters.buscar,
                desde:  _filters.desde,
                hasta:  _filters.hasta,
                format: 'csv',
            };
            var a = document.createElement('a');
            a.href = '/expediciones?' + new URLSearchParams(params).toString();
            a.download = 'expediciones_' + new Date().toISOString().slice(0, 10) + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });

        elPanelClose.addEventListener('click', closePanel);
        elBackdrop.addEventListener('click', closePanel);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closePanel();
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        elList       = document.getElementById('ep-list');
        elPanel      = document.getElementById('ep-panel');
        elPanelTitle = document.getElementById('ep-panel-title');
        elPanelEmpty = document.getElementById('ep-panel-empty');
        elPanelMeta  = document.getElementById('ep-panel-meta');
        elPanelBody  = document.getElementById('ep-panel-body');
        elPanelClose = document.getElementById('ep-panel-close');
        elBackdrop   = document.getElementById('ep-panel-backdrop');
        elDesde      = document.getElementById('ep-f-desde');
        elHasta      = document.getElementById('ep-f-hasta');
        elBuscar     = document.getElementById('ep-f-buscar');
        elStatus     = document.getElementById('ep-f-status');
        elCntTotal    = document.getElementById('ep-cnt-total');
        elCntPend     = document.getElementById('ep-cnt-pend');
        elCntParcial  = document.getElementById('ep-cnt-parcial');
        elCntPrep     = document.getElementById('ep-cnt-prep');
        elKpiStrip    = document.getElementById('ep-kpi-strip');
        elLimitNotice = document.getElementById('ep-limit-notice');

        try {
            initFiltros();
            wireEvents();
            readUrlParams();
            cargar();
        } catch (err) {
            console.error('[EP] init error:', err);
        }
    });

})();
