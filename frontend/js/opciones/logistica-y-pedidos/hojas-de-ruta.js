(function () {
    'use strict';

    /* ── TABS ─────────────────────────────────────────────────────────────── */
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.tab-btn').forEach(function (b) {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            document.querySelectorAll('.tab-panel').forEach(function (p) {
                p.classList.remove('active');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            var panel = document.getElementById('tab-' + btn.dataset.tab);
            if (panel) panel.classList.add('active');
        });
    });

    /* ── CARGA ────────────────────────────────────────────────────────────── */
    var elTbodyPedidos = document.getElementById('tbody-pedidos');
    var elDesde  = document.querySelector('#f-desde');
    var elHasta  = document.querySelector('#f-hasta');
    var btnRef   = document.getElementById('btn-refresh');

    function setLoading(tbody, cols, on) {
        tbody.innerHTML = '';
        if (on) {
            var ph = document.createElement('div');
            ph.className = 'hr-loading';
            var sp = document.createElement('span');
            sp.className = 'hr-spinner';
            sp.setAttribute('aria-hidden', 'true');
            ph.appendChild(sp);
            ph.appendChild(document.createTextNode('Cargando…'));
            var tr = document.createElement('tr');
            var td = document.createElement('td');
            td.colSpan = cols;
            td.appendChild(ph);
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
    }

    function cargarDatos() {
        var params = {};
        if (elDesde) params.desde = elDesde.value;
        if (elHasta) params.hasta = elHasta.value;

        setLoading(elTbodyPedidos, 10, true);

        SGA.expediciones.list(params)
            .then(function (data) {
                if (!data.length) {
                    elTbodyPedidos.innerHTML = '<tr class="placeholder-row"><td colspan="10">No hay pedidos en el periodo seleccionado.</td></tr>';
                    return;
                }
                elTbodyPedidos.innerHTML = data.map(function (r) {
                    return '<tr>'
                        + '<td></td>'
                        + '<td></td>'
                        + '<td>' + (r.albaran ?? '') + '</td>'
                        + '<td></td>'
                        + '<td></td>'
                        + '<td>' + (r.cliente ?? '') + '</td>'
                        + '<td></td>'
                        + '<td>' + (r.nombre_cliente ?? '') + '</td>'
                        + '<td>' + (r.picking ?? '') + '</td>'
                        + '<td>' + (r.fecha ?? '') + '</td>'
                        + '</tr>';
                }).join('');
            })
            .catch(function () {
                elTbodyPedidos.innerHTML = '<tr class="placeholder-row"><td colspan="10">Error al conectar con el servidor.</td></tr>';
            });
    }

    if (btnRef) btnRef.addEventListener('click', cargarDatos);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'F5') { e.preventDefault(); cargarDatos(); }
    });

    /* Inicializar fechas */
    var hoy    = new Date().toISOString().split('T')[0];
    var hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (elDesde) elDesde.value = hace30;
    if (elHasta) elHasta.value = hoy;

    cargarDatos();
})();
