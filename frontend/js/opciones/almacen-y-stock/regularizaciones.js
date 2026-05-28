(function () {
    'use strict';

    var elTbody  = document.getElementById('tbody-reg');
    var elStatus = document.getElementById('rg-status');

    function setLoading(on) {
        elTbody.innerHTML = '';
        if (on) {
            var ph = document.createElement('div');
            ph.className = 'rg-loading';
            var sp = document.createElement('span');
            sp.className = 'rg-spinner';
            sp.setAttribute('aria-hidden', 'true');
            ph.appendChild(sp);
            ph.appendChild(document.createTextNode('Cargando regularizaciones…'));
            var tr = document.createElement('tr');
            var td = document.createElement('td');
            td.colSpan = 8;
            td.appendChild(ph);
            tr.appendChild(td);
            elTbody.appendChild(tr);
        }
    }

    function setStatus(msg) {
        if (!elStatus) return;
        if (msg) {
            elStatus.textContent = msg;
            elStatus.removeAttribute('hidden');
        } else {
            elStatus.hidden = true;
        }
    }

    var TIPOS = {
        'E':  'Entrada',
        'S':  'Salida',
        'T':  'Traspaso',
        'R':  'Regularización',
        'PP': 'Entrada directa',
        'SP': 'Salida directa'
    };

    function tipoLabel(cod) {
        var c = (cod || '').trim();
        return TIPOS[c] || c || '—';
    }

    function renderTabla(rows) {
        if (!rows.length) {
            elTbody.innerHTML = '<tr class="placeholder-row"><td colspan="10">No se encontraron movimientos.</td></tr>';
            setStatus('Sin resultados para los filtros indicados.');
            return;
        }
        setStatus('');
        elTbody.innerHTML = rows.map(function (r) {
            var tipo = (r.tipo || '').trim();
            var badgeClass = tipo === 'PP' || tipo === 'E' ? 'rg-badge rg-badge--entrada'
                           : tipo === 'S' || tipo === 'SP' ? 'rg-badge rg-badge--salida'
                           : tipo === 'T' ? 'rg-badge rg-badge--traspaso'
                           : 'rg-badge';
            return '<tr>'
                + '<td>' + (r.fecha  ?? '') + '</td>'
                + '<td>' + (r.serie  ?? '') + '/' + (r.numero ?? '') + '</td>'
                + '<td><span class="' + badgeClass + '">' + tipoLabel(tipo) + '</span></td>'
                + '<td>' + (r.articulo ?? '') + '</td>'
                + '<td>' + (r.nombre ?? '') + '</td>'
                + '<td>' + (r.ubicacion ?? '') + '</td>'
                + '<td>' + (r.lote ?? '') + '</td>'
                + '<td class="col-num">' + (r.cantidad ?? '') + '</td>'
                + '</tr>';
        }).join('');
    }

    function cargarDatos() {
        var btn = document.getElementById('btn-actualizar');
        btn.textContent = 'Cargando…';
        btn.disabled = true;
        setLoading(true);
        setStatus('');

        var params = {
            articulo: document.getElementById('f-articulo').value,
            desde:    document.getElementById('f-desde').value,
            hasta:    document.getElementById('f-hasta').value
        };

        SGA.regularizaciones.list(params)
            .then(renderTabla)
            .catch(function () {
                elTbody.innerHTML = '<tr class="placeholder-row"><td colspan="10">Error al conectar con el servidor.</td></tr>';
                setStatus('Error de conexión. Inténtelo de nuevo.');
            })
            .finally(function () {
                btn.textContent = 'Buscar';
                btn.disabled = false;
            });
    }

    document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'F5') { e.preventDefault(); cargarDatos(); }
    });

    var btnExportarReg = document.getElementById('btn-exportar');
    if (btnExportarReg) btnExportarReg.addEventListener('click', function () {
        var params = {
            articulo: document.getElementById('f-articulo').value,
            desde:    document.getElementById('f-desde').value,
            hasta:    document.getElementById('f-hasta').value,
            format:   'csv',
        };
        var a = document.createElement('a');
        a.href = '/regularizaciones?' + new URLSearchParams(params).toString();
        a.download = 'regularizaciones_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    var hoy    = new Date().toISOString().split('T')[0];
    var hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    document.getElementById('f-desde').value = hace30;
    document.getElementById('f-hasta').value = hoy;
})();
