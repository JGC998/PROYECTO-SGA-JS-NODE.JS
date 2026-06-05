"use strict";

(function () {

    var elTbody        = null;
    var elCount        = null;
    var _loading       = false;
    var _pasilloActivo = null;
    var _stockMap      = {};   // cod_ubicacion → [{articulo, lote, stock}]

    /* ── PASILLOS ────────────────────────────────────────────────────────── */

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
                        document.querySelectorAll('.ubi-pasillo-btn').forEach(function (b) { b.classList.remove('ubi-pasillo-btn--active'); });
                        btn.classList.add('ubi-pasillo-btn--active');
                        _pasilloActivo = btn.dataset.pasillo;
                        document.getElementById('f-ubicacion').value = '';
                        cargarDatos({ pasillo: _pasilloActivo });
                    });
                });
            })
            .catch(function () {
                grid.innerHTML = '<span class="ubi-pasillos-loading">Error al cargar pasillos.</span>';
            });
    }

    /* ── CARGAR DATOS ────────────────────────────────────────────────────── */

    function cargarDatos(params) {
        if (_loading) return;
        _loading = true;
        var btn = document.getElementById('btn-buscar');
        btn.textContent = 'Cargando…';
        btn.disabled = true;

        SGA.ubicaciones.list(params)
            .then(function (ubis) {
                ubis = Array.isArray(ubis) ? ubis : [];
                // Cargar stock por ubicación en paralelo
                return SGA.consultaStock.list({ ubicacion: params.pasillo ? params.pasillo : (params.buscar || ''), pageSize: 2000 })
                    .then(function (stockRows) {
                        _stockMap = {};
                        (Array.isArray(stockRows) ? stockRows : []).forEach(function (s) {
                            var ubi = (s.ubicacion || '').trim();
                            if (!_stockMap[ubi]) _stockMap[ubi] = [];
                            _stockMap[ubi].push(s);
                        });
                        renderTabla(ubis);
                    })
                    .catch(function () { renderTabla(ubis); });
            })
            .catch(function () {
                elTbody.innerHTML = '<tr class="ubi-placeholder"><td colspan="7">Error al conectar con el servidor.</td></tr>';
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
            elTbody.innerHTML = '<tr class="ubi-placeholder"><td colspan="7">No se encontraron ubicaciones.</td></tr>';
            return;
        }

        elTbody.innerHTML = rows.map(function (r, i) {
            var cod      = (r.ubicacion || '').trim();
            var stockArr = _stockMap[cod] || [];
            var totalStk = stockArr.reduce(function (a, s) { return a + Number(s.stock || 0); }, 0);
            var stockTxt = totalStk > 0
                ? '<span style="color:#059669;font-weight:700">' + totalStk.toLocaleString('es-ES') + ' ud</span>'
                : '<span style="color:#9ca3af">Vacía</span>';

            return '<tr class="ubi-row" data-cod="' + cod + '" style="cursor:pointer" title="Ver contenido">'
                + '<td class="col-contador">' + (i + 1) + '</td>'
                + '<td><strong>' + cod + '</strong></td>'
                + '<td>' + esc(r.etiqueta) + '</td>'
                + '<td class="col-num">' + (r.palets || 0) + '</td>'
                + '<td class="col-check">' + (r.picking  ? '✓' : '') + '</td>'
                + '<td class="col-check">' + (r.multiple ? '✓' : '') + '</td>'
                + '<td>' + stockTxt + '</td>'
                + '</tr>';
        }).join('');

        elTbody.querySelectorAll('.ubi-row').forEach(function (tr) {
            tr.addEventListener('click', function () {
                verContenido(tr.dataset.cod);
            });
        });
    }

    function esc(val) {
        return (val ?? '').toString().replace(/"/g, '&quot;').replace(/</g, '&lt;').trim();
    }

    /* ── MODAL CONTENIDO ─────────────────────────────────────────────────── */

    function verContenido(cod) {
        var stockArr = _stockMap[cod] || [];

        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';

        var modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:10px;padding:24px;width:560px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.18);font-family:inherit';

        var contenido = stockArr.length
            ? '<table style="width:100%;border-collapse:collapse;font-size:.83rem">'
                + '<thead><tr style="background:#f9fafb">'
                + '<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:.72rem;text-transform:uppercase">Artículo</th>'
                + '<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:.72rem;text-transform:uppercase">Lote</th>'
                + '<th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:.72rem;text-transform:uppercase">Stock</th>'
                + '</tr></thead><tbody>'
                + stockArr.map(function (s) {
                    return '<tr style="border-bottom:1px solid #f3f4f6">'
                        + '<td style="padding:8px 12px"><strong>' + (s.articulo || '').trim() + '</strong>'
                        + (s.nombre ? '<div style="font-size:.75rem;color:#6b7280">' + s.nombre.trim() + '</div>' : '')
                        + '</td>'
                        + '<td style="padding:8px 12px;color:#6b7280">' + (s.lote || '').trim() + '</td>'
                        + '<td style="padding:8px 12px;text-align:right;font-weight:700;color:#059669">' + Number(s.stock || 0).toLocaleString('es-ES') + ' ud</td>'
                        + '</tr>';
                }).join('')
                + '</tbody></table>'
            : '<div style="text-align:center;padding:32px;color:#9ca3af">Ubicación vacía — sin stock registrado.</div>';

        modal.innerHTML = '<div style="font-weight:700;font-size:1.05rem;color:#1e3a5f;margin-bottom:2px">Contenido de ubicación</div>'
            + '<div style="font-size:.82rem;color:#6b7280;margin-bottom:16px">📍 <strong>' + cod + '</strong></div>'
            + '<div style="flex:1;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;min-height:60px">' + contenido + '</div>'
            + '<div style="display:flex;justify-content:flex-end;margin-top:16px">'
            + '<button id="ubi-modal-cerrar" style="padding:9px 18px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:.85rem">Cerrar</button>'
            + '</div>';

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        function cerrar() { document.body.removeChild(overlay); }
        modal.querySelector('#ubi-modal-cerrar').addEventListener('click', cerrar);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrar(); });
        document.addEventListener('keydown', function onKey(e) {
            if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', onKey); }
        });
    }

    /* ── BÚSQUEDA DIRECTA ────────────────────────────────────────────────── */

    function buscarDirecto() {
        var texto = document.getElementById('f-ubicacion').value.trim();
        if (!texto) return;
        document.querySelectorAll('.ubi-pasillo-btn').forEach(function (b) { b.classList.remove('ubi-pasillo-btn--active'); });
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
