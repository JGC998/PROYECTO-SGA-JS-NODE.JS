(function () {
    'use strict';

    var elTbody = document.getElementById('tbody-spv');

    function setLoading(on) {
        elTbody.innerHTML = '';
        if (on) {
            var ph = document.createElement('div');
            ph.className = 'spv-loading';
            var sp = document.createElement('span');
            sp.className = 'spv-spinner';
            sp.setAttribute('aria-hidden', 'true');
            ph.appendChild(sp);
            ph.appendChild(document.createTextNode('Cargando pedidos…'));
            var tr = document.createElement('tr');
            var td = document.createElement('td');
            td.colSpan = 8;
            td.appendChild(ph);
            tr.appendChild(td);
            elTbody.appendChild(tr);
        }
    }

    function renderTabla(rows) {
        if (!rows.length) {
            elTbody.innerHTML = '<tr class="placeholder-row"><td colspan="8">No se encontraron pedidos con los filtros indicados.</td></tr>';
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

    function cargarDatos() {
        var btn = document.getElementById('btn-actualizar');
        btn.textContent = 'Cargando…';
        btn.disabled = true;
        setLoading(true);

        var params = {
            cliente:  document.getElementById('f-cliente').value,
            articulo: document.getElementById('f-articulo').value,
            desde:    document.getElementById('f-desde').value,
            hasta:    document.getElementById('f-hasta').value
        };

        SGA.situacionPedidos.list(params)
            .then(renderTabla)
            .catch(function () {
                elTbody.innerHTML = '<tr class="placeholder-row"><td colspan="8">Error al conectar con el servidor.</td></tr>';
            })
            .finally(function () {
                btn.textContent = 'Actualizar (F5)';
                btn.disabled = false;
            });
    }

    document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'F5') { e.preventDefault(); cargarDatos(); }
    });

    var hoy    = new Date().toISOString().split('T')[0];
    var hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    document.getElementById('f-desde').value = hace30;
    document.getElementById('f-hasta').value = hoy;
})();
