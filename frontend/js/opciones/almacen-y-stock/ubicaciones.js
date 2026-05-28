"use strict";

(function () {

    var elTbody       = null;
    var elCount       = null;
    var _loading      = false;
    var _pasilloActivo = null;

    /* ── CARGAR PASILLOS ─────────────────────────────────────────────────── */

    function cargarPasillos() {
        var grid = document.getElementById('pasillos-grid');

        SGA.ubicaciones.filtrosPyl()
            .then(function (data) {
                var pasillos = data.pasillos || [];
                if (!pasillos.length) {
                    grid.innerHTML = '<span class="ubi-pasillos-loading">No hay pasillos disponibles.</span>';
                    return;
                }
                grid.innerHTML = pasillos.map(function (p) {
                    return '<button class="ubi-pasillo-btn" data-pasillo="' + p + '">' + p + '</button>';
                }).join('');

                grid.querySelectorAll('.ubi-pasillo-btn').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        seleccionarPasillo(btn.dataset.pasillo, btn);
                    });
                });
            })
            .catch(function () {
                grid.innerHTML = '<span class="ubi-pasillos-loading">Error al cargar pasillos.</span>';
            });
    }

    function seleccionarPasillo(pasillo, btn) {
        document.querySelectorAll('.ubi-pasillo-btn').forEach(function (b) {
            b.classList.remove('ubi-pasillo-btn--active');
        });
        btn.classList.add('ubi-pasillo-btn--active');
        _pasilloActivo = pasillo;
        document.getElementById('f-ubicacion').value = '';
        cargarDatos({ pasillo: pasillo });
    }

    /* ── CARGAR DATOS ────────────────────────────────────────────────────── */

    function cargarDatos(params) {
        if (_loading) return;
        _loading = true;

        var btn = document.getElementById('btn-buscar');
        btn.textContent = 'Cargando…';
        btn.disabled = true;

        SGA.ubicaciones.list(params)
            .then(function (data) {
                renderTabla(Array.isArray(data) ? data : []);
            })
            .catch(function () {
                elTbody.innerHTML = '<tr class="ubi-placeholder"><td colspan="14">Error al conectar con el servidor.</td></tr>';
                if (elCount) elCount.textContent = '—';
            })
            .finally(function () {
                _loading = false;
                btn.textContent = 'Buscar';
                btn.disabled = false;
            });
    }

    /* ── RENDER TABLA ────────────────────────────────────────────────────── */

    function renderTabla(rows) {
        if (elCount) elCount.textContent = rows.length + ' ubicacion' + (rows.length !== 1 ? 'es' : '');

        if (!rows.length) {
            elTbody.innerHTML = '<tr class="ubi-placeholder"><td colspan="14">No se encontraron ubicaciones.</td></tr>';
            return;
        }

        elTbody.innerHTML = rows.map(function (r, i) {
            return '<tr class="edit-row" data-id="' + (r.id ?? '') + '">'
                + '<td class="col-contador">' + (i + 1) + '</td>'
                + '<td class="col-check"><input type="checkbox" class="cell-check"></td>'
                + '<td><input type="text" class="cell-input" value="' + esc(r.ubicacion) + '"></td>'
                + '<td><input type="text" class="cell-input" value="' + esc(r.etiqueta) + '"></td>'
                + '<td><input type="text" class="cell-input cell-wide" value="' + esc(r.descripcion) + '"></td>'
                + '<td><input type="number" class="cell-input cell-num" value="' + (r.ancho ?? 0) + '"></td>'
                + '<td><input type="number" class="cell-input cell-num" value="' + (r.alto ?? 0) + '"></td>'
                + '<td><input type="number" class="cell-input cell-num" value="' + (r.palets ?? 0) + '"></td>'
                + '<td class="col-check"><input type="checkbox" class="cell-check"' + (r.picking   ? ' checked' : '') + '></td>'
                + '<td class="col-check"><input type="checkbox" class="cell-check"' + (r.multiple  ? ' checked' : '') + '></td>'
                + '<td><input type="text" class="cell-input" value="' + esc(r.ubicacion_tipo) + '"></td>'
                + '<td class="col-check"><input type="checkbox" class="cell-check"' + (r.exclusiva ? ' checked' : '') + '></td>'
                + '<td class="col-check"><input type="checkbox" class="cell-check"' + (r.no_av_inv ? ' checked' : '') + '></td>'
                + '<td><input type="text" class="cell-input" value="' + esc(r.articulo) + '"></td>'
                + '</tr>';
        }).join('');
    }

    function esc(val) {
        return (val ?? '').toString().replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    /* ── BÚSQUEDA DIRECTA ────────────────────────────────────────────────── */

    function buscarDirecto() {
        var texto = document.getElementById('f-ubicacion').value.trim();
        if (!texto) return;
        // Quitar pasillo activo al buscar directamente
        document.querySelectorAll('.ubi-pasillo-btn').forEach(function (b) {
            b.classList.remove('ubi-pasillo-btn--active');
        });
        _pasilloActivo = null;
        cargarDatos({ buscar: texto });
    }

    /* ── INIT ────────────────────────────────────────────────────────────── */

    document.addEventListener('DOMContentLoaded', function () {
        elTbody = document.getElementById('tbody-ubicaciones');
        elCount = document.getElementById('ubi-count');

        cargarPasillos();

        document.getElementById('btn-buscar').addEventListener('click', buscarDirecto);

        document.getElementById('f-ubicacion').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') buscarDirecto();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'F5') { e.preventDefault(); buscarDirecto(); }
        });

        document.getElementById('btn-seleccionar-todo').addEventListener('click', function () {
            document.querySelectorAll('#tbody-ubicaciones .cell-check').forEach(function (c) { c.checked = true; });
        });

        document.getElementById('btn-anular').addEventListener('click', function () {
            document.querySelectorAll('#tbody-ubicaciones .cell-check').forEach(function (c) { c.checked = false; });
        });

        document.getElementById('btn-exportar').addEventListener('click', function () {
            var params = { buscar: document.getElementById('f-ubicacion').value, format: 'csv' };
            if (_pasilloActivo) params.pasillo = _pasilloActivo;
            var a = document.createElement('a');
            a.href = '/ubicaciones?' + new URLSearchParams(params).toString();
            a.download = 'ubicaciones_' + new Date().toISOString().split('T')[0] + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    });

})();
