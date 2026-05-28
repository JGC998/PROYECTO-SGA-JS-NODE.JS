"use strict";

(function () {

    /* ── ESTADO ──────────────────────────────────────────────────────────── */

    var _rows    = [];
    var _loading = false;
    var _filters = { cliente: '', articulo: '', desde: '', hasta: '' };

    /* ── REFS DOM ────────────────────────────────────────────────────────── */

    var elTbody      = null;
    var elDesde      = null;
    var elHasta      = null;
    var elCliente    = null;
    var elArticulo   = null;
    var elCntTotal   = null;
    var elCntClientes  = null;
    var elCntArticulos = null;
    var elCntCantidad  = null;

    /* ── FECHAS ──────────────────────────────────────────────────────────── */

    function getDefaultDesde() {
        var d = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
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

        document.querySelectorAll('.spv-quick-btn').forEach(function (btn) {
            btn.classList.toggle('spv-quick-btn--active', parseInt(btn.dataset.days, 10) === days);
        });
    }

    /* ── CARGA ───────────────────────────────────────────────────────────── */

    function dispararBusqueda() {
        _filters.desde    = elDesde.value;
        _filters.hasta    = elHasta.value;
        _filters.cliente  = elCliente.value.trim();
        _filters.articulo = elArticulo.value.trim();
        cargarDatos();
    }

    function cargarDatos() {
        if (_loading) return;
        _loading = true;

        var btn = document.getElementById('spv-btn-buscar');
        btn.textContent = 'Cargando…';
        btn.disabled = true;
        setLoading(true);

        SGA.situacionPedidos.list({
            cliente:  _filters.cliente,
            articulo: _filters.articulo,
            desde:    _filters.desde,
            hasta:    _filters.hasta
        })
        .then(function (data) {
            _rows = Array.isArray(data) ? data : [];
            renderTabla(_rows);
            updateCounters(_rows);
        })
        .catch(function () {
            elTbody.innerHTML = '<tr class="spv-placeholder-row"><td colspan="8">Error al conectar con el servidor.</td></tr>';
            resetCounters();
        })
        .finally(function () {
            _loading = false;
            btn.textContent = 'Buscar';
            btn.disabled = false;
        });
    }

    /* ── RENDER ──────────────────────────────────────────────────────────── */

    function setLoading(on) {
        elTbody.innerHTML = '';
        if (on) {
            var tr = document.createElement('tr');
            var td = document.createElement('td');
            td.colSpan = 8;
            var ph = document.createElement('div');
            ph.className = 'spv-loading';
            var sp = document.createElement('span');
            sp.className = 'spv-spinner';
            sp.setAttribute('aria-hidden', 'true');
            ph.appendChild(sp);
            ph.appendChild(document.createTextNode('Cargando pedidos…'));
            td.appendChild(ph);
            tr.appendChild(td);
            elTbody.appendChild(tr);
        }
    }

    function renderTabla(rows) {
        if (!rows.length) {
            elTbody.innerHTML = '<tr class="spv-placeholder-row"><td colspan="8">No se encontraron pedidos con los filtros indicados.</td></tr>';
            return;
        }
        elTbody.innerHTML = rows.map(function (r) {
            return '<tr>'
                + '<td>' + (r.fecha ?? '') + '</td>'
                + '<td>' + (r.serie ?? '') + '/' + (r.albaran ?? '') + '</td>'
                + '<td>' + (r.cliente ?? '') + '</td>'
                + '<td>' + (r.nombre_cliente ?? '') + '</td>'
                + '<td>' + (r.articulo ?? '') + '</td>'
                + '<td>' + (r.nombre_articulo ?? '') + '</td>'
                + '<td class="col-num">' + (r.cantidad ?? '') + '</td>'
                + '<td>' + (r.tipo ?? '') + '</td>'
                + '</tr>';
        }).join('');
    }

    /* ── CONTADORES ──────────────────────────────────────────────────────── */

    function updateCounters(rows) {
        var clientes  = new Set(rows.map(function (r) { return r.cliente; })).size;
        var articulos = new Set(rows.map(function (r) { return r.articulo; })).size;
        var cantidad  = rows.reduce(function (acc, r) { return acc + (Number(r.cantidad) || 0); }, 0);

        elCntTotal.textContent     = rows.length;
        elCntClientes.textContent  = clientes;
        elCntArticulos.textContent = articulos;
        elCntCantidad.textContent  = cantidad % 1 === 0 ? cantidad : cantidad.toFixed(2);
    }

    function resetCounters() {
        elCntTotal.textContent = elCntClientes.textContent =
        elCntArticulos.textContent = elCntCantidad.textContent = '—';
    }

    /* ── EXPORTAR CSV ────────────────────────────────────────────────────── */

    function exportarCsv() {
        var params = {
            cliente:  _filters.cliente,
            articulo: _filters.articulo,
            desde:    _filters.desde,
            hasta:    _filters.hasta,
            format:   'csv'
        };
        var a = document.createElement('a');
        a.href = '/situacion-pedidos-venta?' + new URLSearchParams(params).toString();
        a.download = 'pedidos_venta_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    /* ── INIT ────────────────────────────────────────────────────────────── */

    document.addEventListener('DOMContentLoaded', function () {
        elTbody        = document.getElementById('tbody-spv');
        elDesde        = document.getElementById('spv-f-desde');
        elHasta        = document.getElementById('spv-f-hasta');
        elCliente      = document.getElementById('spv-f-cliente');
        elArticulo     = document.getElementById('spv-f-articulo');
        elCntTotal     = document.getElementById('spv-cnt-total');
        elCntClientes  = document.getElementById('spv-cnt-clientes');
        elCntArticulos = document.getElementById('spv-cnt-articulos');
        elCntCantidad  = document.getElementById('spv-cnt-cantidad');

        /* fechas por defecto */
        elDesde.value = getDefaultDesde();
        elHasta.value = getDefaultHasta();
        _filters.desde = elDesde.value;
        _filters.hasta = elHasta.value;

        /* botones rápidos */
        document.querySelectorAll('.spv-quick-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                setQuickDate(parseInt(btn.dataset.days, 10));
            });
        });

        /* marcar activo el de 365 al inicio */
        setQuickDate(365);

        /* buscar */
        document.getElementById('spv-btn-buscar').addEventListener('click', dispararBusqueda);

        /* enter en los inputs de texto */
        [elCliente, elArticulo].forEach(function (el) {
            el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') dispararBusqueda();
            });
        });

        /* exportar */
        var btnExp = document.getElementById('btn-exportar');
        if (btnExp) btnExp.addEventListener('click', exportarCsv);

        /* F5 */
        document.addEventListener('keydown', function (e) {
            if (e.key === 'F5') { e.preventDefault(); dispararBusqueda(); }
        });
    });

})();
