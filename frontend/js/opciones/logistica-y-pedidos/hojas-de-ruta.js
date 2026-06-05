"use strict";

(function () {

    /* ── ESTADO ──────────────────────────────────────────────────────────── */

    var _rows    = [];
    var _loading = false;
    var _filters = { buscar: '', desde: '', hasta: '' };

    /* ── REFS DOM ────────────────────────────────────────────────────────── */

    var elDesde        = null;
    var elHasta        = null;
    var elBuscar       = null;
    var elTbodyPedidos = null;
    var elCntTotal     = null;
    var elCntClientes  = null;
    var elCntLineas    = null;
    var elCntPick      = null;

    /* ── FECHAS ──────────────────────────────────────────────────────────── */

    function getDefaultDesde() {
        var d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return d.toISOString().split('T')[0];
    }

    function getDefaultHasta() {
        return new Date().toISOString().split('T')[0];
    }

    /* ── BOTONES RÁPIDOS ─────────────────────────────────────────────────── */

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

        document.querySelectorAll('.hr-quick-btn').forEach(function (btn) {
            btn.classList.toggle('hr-quick-btn--active', parseInt(btn.dataset.days, 10) === days);
        });
    }

    /* ── CARGA ───────────────────────────────────────────────────────────── */

    function dispararBusqueda() {
        _filters.desde  = elDesde.value;
        _filters.hasta  = elHasta.value;
        _filters.buscar = elBuscar.value.trim();
        cargarDatos();
    }

    function cargarDatos() {
        if (_loading) return;
        _loading = true;

        var btn = document.getElementById('hr-btn-buscar');
        btn.textContent = 'Cargando…';
        btn.disabled = true;
        setLoading(elTbodyPedidos, 6, true);

        SGA.expediciones.list({
            buscar: _filters.buscar,
            desde:  _filters.desde,
            hasta:  _filters.hasta
        })
        .then(function (data) {
            _rows = Array.isArray(data) ? data : [];
            renderTabla(_rows);
            updateCounters(_rows);
        })
        .catch(function () {
            elTbodyPedidos.innerHTML = '<tr class="hr-placeholder-row"><td colspan="6">Error al conectar con el servidor.</td></tr>';
            resetCounters();
        })
        .finally(function () {
            _loading = false;
            btn.textContent = 'Buscar';
            btn.disabled = false;
        });
    }

    /* ── RENDER ──────────────────────────────────────────────────────────── */

    function setLoading(tbody, cols, on) {
        tbody.innerHTML = '';
        if (!on) return;
        var tr = document.createElement('tr');
        var td = document.createElement('td');
        td.colSpan = cols;
        var ph = document.createElement('div');
        ph.className = 'hr-loading';
        var sp = document.createElement('span');
        sp.className = 'hr-spinner';
        sp.setAttribute('aria-hidden', 'true');
        ph.appendChild(sp);
        ph.appendChild(document.createTextNode('Cargando…'));
        td.appendChild(ph);
        tr.appendChild(td);
        tbody.appendChild(tr);
    }

    function renderTabla(rows) {
        if (!rows.length) {
            elTbodyPedidos.innerHTML = '<tr class="hr-placeholder-row"><td colspan="6">No hay albaranes para los filtros indicados.</td></tr>';
            return;
        }
        elTbodyPedidos.innerHTML = rows.map(function (r) {
            return '<tr>'
                + '<td>' + (r.serie ?? '') + '</td>'
                + '<td class="col-albaran">' + (r.albaran ?? '') + '</td>'
                + '<td>' + (r.cliente ?? '') + '</td>'
                + '<td>' + (r.nombre_cliente ?? '') + '</td>'
                + '<td>' + (r.picking ?? '') + '</td>'
                + '<td>' + (r.fecha ?? '') + '</td>'
                + '</tr>';
        }).join('');
    }

    /* ── CONTADORES ──────────────────────────────────────────────────────── */

    function updateCounters(rows) {
        var albaranes = new Set(rows.map(function (r) { return r.albaran; })).size;
        var clientes  = new Set(rows.map(function (r) { return r.cliente; })).size;
        var conPick   = rows.filter(function (r) { return !!r.picking; }).length;

        elCntTotal.textContent    = albaranes;
        elCntClientes.textContent = clientes;
        elCntLineas.textContent   = rows.length;
        elCntPick.textContent     = conPick;
    }

    function resetCounters() {
        elCntTotal.textContent = elCntClientes.textContent =
        elCntLineas.textContent = elCntPick.textContent = '—';
    }

    /* ── TABS ────────────────────────────────────────────────────────────── */

    function wireTabEvents() {
        document.querySelectorAll('.hr-tab-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.hr-tab-btn').forEach(function (b) {
                    b.classList.remove('hr-tab-btn--active');
                    b.setAttribute('aria-selected', 'false');
                });
                document.querySelectorAll('.hr-tab-panel').forEach(function (p) {
                    p.classList.remove('hr-tab-panel--active');
                });
                btn.classList.add('hr-tab-btn--active');
                btn.setAttribute('aria-selected', 'true');
                var panel = document.getElementById('tab-' + btn.dataset.tab);
                if (panel) panel.classList.add('hr-tab-panel--active');
            });
        });
    }

    /* ── INIT ────────────────────────────────────────────────────────────── */

    document.addEventListener('DOMContentLoaded', function () {
        elDesde        = document.getElementById('hr-f-desde');
        elHasta        = document.getElementById('hr-f-hasta');
        elBuscar       = document.getElementById('hr-f-buscar');
        elTbodyPedidos = document.getElementById('tbody-pedidos');
        elCntTotal     = document.getElementById('hr-cnt-total');
        elCntClientes  = document.getElementById('hr-cnt-clientes');
        elCntLineas    = document.getElementById('hr-cnt-lineas');
        elCntPick      = document.getElementById('hr-cnt-pick');

        elDesde.value = getDefaultDesde();
        elHasta.value = getDefaultHasta();
        _filters.desde = elDesde.value;
        _filters.hasta = elHasta.value;

        wireTabEvents();

        document.querySelectorAll('.hr-quick-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                setQuickDate(parseInt(btn.dataset.days, 10));
            });
        });

        document.getElementById('hr-btn-buscar').addEventListener('click', dispararBusqueda);

        elBuscar.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') dispararBusqueda();
        });

        var btnExp = document.getElementById('btn-exportar');
        if (btnExp) btnExp.addEventListener('click', function () {
            var params = { buscar: _filters.buscar, desde: _filters.desde, hasta: _filters.hasta, format: 'csv' };
            var a = document.createElement('a');
            a.href = '/expediciones?' + new URLSearchParams(params).toString();
            a.download = 'albaranes_' + new Date().toISOString().slice(0, 10) + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'F5') { e.preventDefault(); dispararBusqueda(); }
        });
    });

})();
