(function () {
    'use strict';

    var elTbody = document.getElementById('tbody-apu');

    function setLoading(on) {
        elTbody.innerHTML = '';
        if (on) {
            var ph = document.createElement('div');
            ph.className = 'apu-loading';
            var sp = document.createElement('span');
            sp.className = 'apu-spinner';
            sp.setAttribute('aria-hidden', 'true');
            ph.appendChild(sp);
            ph.appendChild(document.createTextNode('Cargando artículos…'));
            var tr = document.createElement('tr');
            var td = document.createElement('td');
            td.colSpan = 9;
            td.appendChild(ph);
            tr.appendChild(td);
            elTbody.appendChild(tr);
        }
    }

    function renderTabla(rows) {
        if (!rows.length) {
            elTbody.innerHTML = '<tr class="placeholder-row"><td colspan="9">No se encontraron artículos con los filtros indicados.</td></tr>';
            return;
        }
        elTbody.innerHTML = rows.map(function (r) {
            return '<tr>'
                + '<td class="col-check"><input type="checkbox"></td>'
                + '<td></td>'
                + '<td>' + (r.ubicacion ?? '') + '</td>'
                + '<td>' + (r.etiqueta ?? '') + '</td>'
                + '<td>' + (r.articulo ?? '') + '</td>'
                + '<td>' + (r.nombre ?? '') + '</td>'
                + '<td class="col-num">' + (r.stock_minimo ?? '') + '</td>'
                + '<td class="col-num">' + (r.stock_maximo ?? '') + '</td>'
                + '<td>' + (r.exclusiva ? 'Sí' : 'No') + '</td>'
                + '</tr>';
        }).join('');
    }

    function cargarDatos() {
        var btn = document.getElementById('btn-actualizar');
        btn.textContent = 'Cargando…';
        btn.disabled = true;
        setLoading(true);

        var params = {
            ubicacion: document.getElementById('f-ubicacion').value,
            articulo:  document.getElementById('f-articulo').value
        };

        SGA.articulosPorUbicacion.list(params)
            .then(renderTabla)
            .catch(function () {
                elTbody.innerHTML = '<tr class="placeholder-row"><td colspan="9">Error al conectar con el servidor.</td></tr>';
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
})();
