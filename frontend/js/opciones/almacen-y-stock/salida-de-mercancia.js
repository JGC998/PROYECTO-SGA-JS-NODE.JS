"use strict";

(function () {

    /* ── ESTADO INTERNO ─────────────────────────────────────────────── */
    var _lineas      = [];
    var _lineaIdx    = 0;

    var _artCod      = '';
    var _artNombre   = '';
    var _artState    = null;   // null | 'loading' | 'found' | 'notfound' | 'error'

    var _stockLines  = [];     // [{ubi, ubiNombre, lot, disponible}]
    var _selectedIdx = -1;     // índice en _stockLines de la línea seleccionada
    var _selectedUbi = '';
    var _ubiNombre   = '';
    var _selectedLot = '';
    var _disponible  = 0;

    var _sending     = false;

    /* ── HELPERS ────────────────────────────────────────────────────── */
    function $(id) { return document.getElementById(id); }

    function el(tag, cls) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        return e;
    }

    function txt(s) {
        return document.createTextNode(String(s == null ? '' : s));
    }

    function fmt(n) {
        return Number(n || 0).toLocaleString('es-ES');
    }

    function lotLabel(lot) {
        return lot === 'SL' ? 'Sin lote' : lot;
    }

    /* ── ARTÍCULO ───────────────────────────────────────────────────── */

    function setArtPill(mode, texto) {
        var pill = $('sm-art-pill');
        pill.className = 'sm-pill sm-pill--' + mode;
        pill.textContent = texto;
        pill.hidden = false;
    }

    function clearArtPill() {
        var pill = $('sm-art-pill');
        pill.hidden = true;
        pill.textContent = '';
    }

    function limpiarArticulo() {
        _artCod = '';
        _artNombre = '';
        _artState = null;
        $('sm-art-cod').value = '';
        $('btn-art-clear').hidden = true;
        clearArtPill();
        resetStockSelector();
        resetCantidad();
        $('btn-anadir').disabled = true;
    }

    async function buscarArticulo() {
        var cod = $('sm-art-cod').value.trim();
        if (!cod) {
            limpiarArticulo();
            return;
        }

        _artCod = cod;
        _artState = 'loading';
        $('btn-art-clear').hidden = false;
        setArtPill('loading', 'Buscando…');
        resetStockSelector();
        resetCantidad();
        $('btn-anadir').disabled = true;

        try {
            var art = await SGA.articulos.get(cod);
            _artNombre = art.nombre || cod;
            _artState = 'found';
            setArtPill('ok', '✓ ' + _artNombre);
            await cargarStock(cod);
        } catch (err) {
            _artState = 'notfound';
            _artNombre = '';
            setArtPill('warn', '⚠ Artículo no encontrado');
            mostrarStockVacio();
            $('sm-stock-hint').textContent = 'Artículo no encontrado';
        }
    }

    /* ── STOCK SELECTOR ─────────────────────────────────────────────── */

    function resetStockSelector() {
        _stockLines  = [];
        _selectedIdx = -1;
        _selectedUbi = '';
        _ubiNombre   = '';
        _selectedLot = '';
        _disponible  = 0;

        $('sm-stock-lista').hidden   = true;
        $('sm-stock-empty').hidden   = true;
        $('sm-stock-loading').hidden = true;
        $('sm-stock-placeholder').style.display = '';
        $('sm-stock-hint').textContent = 'Busque un artículo primero';

        var lista = $('sm-stock-lista');
        while (lista.firstChild) lista.removeChild(lista.firstChild);
    }

    function mostrarStockVacio() {
        $('sm-stock-placeholder').style.display = 'none';
        $('sm-stock-lista').hidden   = true;
        $('sm-stock-loading').hidden = true;
        $('sm-stock-empty').hidden   = false;
        $('sm-stock-hint').textContent = 'Sin stock disponible';
    }

    async function cargarStock(cod) {
        $('sm-stock-placeholder').style.display = 'none';
        $('sm-stock-loading').hidden = false;
        $('sm-stock-empty').hidden   = true;
        $('sm-stock-lista').hidden   = true;
        $('sm-stock-hint').textContent = 'Consultando stock…';

        try {
            var rows = await SGA.stock.get(cod);

            // Filtrar solo líneas con stock > 0
            var lineas = (Array.isArray(rows) ? rows : [])
                .filter(function (r) { return (r.STOCAN || r.stock || 0) > 0; })
                .sort(function (a, b) {
                    return (b.STOCAN || b.stock || 0) - (a.STOCAN || a.stock || 0);
                })
                .slice(0, 50);

            $('sm-stock-loading').hidden = true;

            if (!lineas.length) {
                mostrarStockVacio();
                return;
            }

            // Normalizar campos según lo que devuelve SGA.stock.get
            _stockLines = lineas.map(function (r) {
                return {
                    ubi:       r.STOUBI || r.ubicacion || '',
                    ubiNombre: r.UBINOM || r.ubicacionNombre || '',
                    lot:       r.STOLOT || r.lote || 'SL',
                    disponible: Number(r.STOCAN || r.stock || 0)
                };
            });

            renderStockSelector();
            $('sm-stock-hint').textContent = _stockLines.length + ' línea(s) con stock';

        } catch (err) {
            $('sm-stock-loading').hidden = true;
            $('sm-stock-empty').hidden   = false;
            $('sm-stock-empty').textContent = 'Error al consultar stock. Reintente.';
            $('sm-stock-hint').textContent  = 'Error al cargar';
        }
    }

    function renderStockSelector() {
        var lista = $('sm-stock-lista');
        while (lista.firstChild) lista.removeChild(lista.firstChild);

        _stockLines.forEach(function (line, idx) {
            var btn = el('button', 'sm-stock-item');
            btn.type = 'button';
            btn.setAttribute('role', 'option');
            btn.setAttribute('aria-selected', 'false');
            btn.dataset.idx = idx;

            // Columna izquierda: ubi (row 1) + lot (row 2)
            var ubiSpan = el('span', 'sm-stock-item-ubi');
            ubiSpan.appendChild(txt(line.ubi));
            btn.appendChild(ubiSpan);

            var lotSpan = el('span', 'sm-stock-item-lot');
            lotSpan.appendChild(txt(lotLabel(line.lot)));
            if (line.ubiNombre) {
                lotSpan.appendChild(txt(' · ' + line.ubiNombre));
            }
            btn.appendChild(lotSpan);

            // Columna derecha: cantidad disponible
            var cantSpan = el('span', 'sm-stock-item-cant');
            cantSpan.appendChild(txt(fmt(line.disponible) + ' ud'));
            btn.appendChild(cantSpan);

            btn.addEventListener('click', function () { seleccionarLinea(idx); });
            btn.addEventListener('keydown', function (ev) {
                if (ev.key === 'ArrowDown') {
                    ev.preventDefault();
                    var next = lista.querySelector('[data-idx="' + (idx + 1) + '"]');
                    if (next) next.focus();
                } else if (ev.key === 'ArrowUp') {
                    ev.preventDefault();
                    if (idx === 0) {
                        $('sm-art-cod').focus();
                    } else {
                        var prev = lista.querySelector('[data-idx="' + (idx - 1) + '"]');
                        if (prev) prev.focus();
                    }
                }
            });

            lista.appendChild(btn);
        });

        $('sm-stock-lista').hidden = false;
    }

    function seleccionarLinea(idx) {
        if (idx < 0 || idx >= _stockLines.length) return;

        _selectedIdx = idx;
        var line = _stockLines[idx];
        _selectedUbi = line.ubi;
        _ubiNombre   = line.ubiNombre;
        _selectedLot = line.lot;
        _disponible  = line.disponible;

        // Actualizar highlight visual
        var lista = $('sm-stock-lista');
        var items = lista.querySelectorAll('.sm-stock-item');
        items.forEach(function (item, i) {
            item.classList.toggle('sm-stock-item--selected', i === idx);
            item.setAttribute('aria-selected', i === idx ? 'true' : 'false');
        });

        // Activar sección cantidad
        var dispTag = $('sm-disponible-tag');
        dispTag.textContent = 'Disponible: ' + fmt(_disponible) + ' ud';
        dispTag.hidden = false;

        var cantInput = $('sm-cant');
        cantInput.disabled = false;
        cantInput.max = _disponible;
        cantInput.value = 1;

        $('btn-menos').disabled = false;
        $('btn-mas').disabled   = false;

        validarCantidad();
        cantInput.focus();
        cantInput.select();
    }

    /* ── CANTIDAD ───────────────────────────────────────────────────── */

    function resetCantidad() {
        _selectedIdx = -1;
        _selectedUbi = '';
        _ubiNombre   = '';
        _selectedLot = '';
        _disponible  = 0;

        var cantInput = $('sm-cant');
        cantInput.value = 1;
        cantInput.max = '';
        cantInput.disabled = true;

        $('btn-menos').disabled = true;
        $('btn-mas').disabled   = true;

        $('sm-disponible-tag').hidden = true;
        $('sm-cant-warn').hidden = true;
        $('btn-anadir').disabled = true;
    }

    function validarCantidad() {
        var cantInput = $('sm-cant');
        var warn = $('sm-cant-warn');
        var cant = parseFloat(cantInput.value);

        if (_selectedIdx < 0) {
            cantInput.classList.remove('sm-input--valid', 'sm-input--invalid');
            warn.hidden = true;
            $('btn-anadir').disabled = true;
            return;
        }

        if (!Number.isFinite(cant) || cant <= 0) {
            cantInput.classList.add('sm-input--invalid');
            cantInput.classList.remove('sm-input--valid');
            warn.textContent = 'La cantidad debe ser mayor que 0';
            warn.hidden = false;
            $('btn-anadir').disabled = true;
            return;
        }

        if (cant > _disponible) {
            cantInput.classList.add('sm-input--invalid');
            cantInput.classList.remove('sm-input--valid');
            warn.textContent = 'Supera el stock disponible (' + fmt(_disponible) + ' ud)';
            warn.hidden = false;
            $('btn-anadir').disabled = true;
            return;
        }

        cantInput.classList.add('sm-input--valid');
        cantInput.classList.remove('sm-input--invalid');
        warn.hidden = true;
        $('btn-anadir').disabled = false;
    }

    function stepCant(delta) {
        if ($('sm-cant').disabled) return;
        var cantInput = $('sm-cant');
        var val = parseFloat(cantInput.value) || 0;
        val = Math.max(0.001, Math.min(_disponible, val + delta));
        cantInput.value = val;
        validarCantidad();
    }

    /* ── VALIDAR LÍNEA ──────────────────────────────────────────────── */

    function validarLinea() {
        var errores = [];
        var cod  = $('sm-art-cod').value.trim();
        var cant = parseFloat($('sm-cant').value);

        if (!cod)                    errores.push('Artículo no especificado');
        if (_artState === 'notfound') errores.push('Artículo no encontrado');
        if (!_selectedUbi)           errores.push('Seleccione una línea de stock');
        if (!_selectedLot)           errores.push('Lote no disponible');
        if (!Number.isFinite(cant) || cant <= 0) errores.push('Cantidad inválida (debe ser > 0)');
        if (cant > _disponible)      errores.push('Cantidad supera el stock disponible');

        return errores;
    }

    /* ── AGREGAR LÍNEA ──────────────────────────────────────────────── */

    function agregarLinea() {
        var errores = validarLinea();
        if (errores.length) {
            mostrarStatus('err', errores[0]);
            return;
        }

        var cant = parseFloat($('sm-cant').value);
        _lineaIdx++;
        _lineas.push({
            id:        _lineaIdx,
            cod:       _artCod,
            nombre:    _artNombre,
            ubi:       _selectedUbi,
            ubiNombre: _ubiNombre,
            lot:       _selectedLot,
            cant:      cant,
            disponible: _disponible
        });

        renderCarrito();
        mostrarStatus('ok', 'Línea añadida ✓');
        setTimeout(function () { ocultarStatus(); }, 2000);
        limpiarFormRapido();
        $('sm-art-cod').focus();
    }

    /* ── LIMPIAR FORM RÁPIDO ────────────────────────────────────────── */

    function limpiarFormRapido() {
        _artCod    = '';
        _artNombre = '';
        _artState  = null;

        $('sm-art-cod').value = '';
        $('btn-art-clear').hidden = true;
        clearArtPill();

        resetStockSelector();
        resetCantidad();
    }

    /* ── STATUS ─────────────────────────────────────────────────────── */

    function mostrarStatus(mode, texto) {
        var s = $('sm-form-status');
        s.className = 'sm-form-status sm-form-status--' + mode;
        s.textContent = texto;
        s.hidden = false;
    }

    function ocultarStatus() {
        $('sm-form-status').hidden = true;
    }

    /* ── CARRITO ────────────────────────────────────────────────────── */

    function renderCarrito() {
        var body  = $('sm-carrito-body');
        var empty = $('sm-carrito-empty');
        var count = $('sm-carrito-count');
        var totales = $('sm-carrito-totales');

        while (body.firstChild) body.removeChild(body.firstChild);

        if (!_lineas.length) {
            body.appendChild(empty);
            empty.hidden = false;
            count.textContent = '0 líneas';
            totales.textContent = '';
            $('btn-confirmar').disabled = true;
            return;
        }

        empty.hidden = true;

        _lineas.forEach(function (l) {
            body.appendChild(buildLineaCarritoEl(l));
        });

        var nLineas = _lineas.length;
        count.textContent = nLineas + (nLineas === 1 ? ' línea' : ' líneas');

        var nArts = new Set(_lineas.map(function (l) { return l.cod; })).size;
        totales.textContent = nArts + ' art. · ' + nLineas + ' líneas';

        $('btn-confirmar').disabled = _sending;
    }

    function buildLineaCarritoEl(l) {
        var div = el('div', 'sm-carrito-line');

        // Columna izquierda: artículo (row 1) + ubi·lote (row 2)
        var artEl = el('span', 'sm-carrito-line-art');
        artEl.title = l.nombre;
        artEl.appendChild(txt(l.cod + (l.nombre ? ' · ' + l.nombre : '')));
        div.appendChild(artEl);

        var subEl = el('span', 'sm-carrito-line-sub');
        subEl.appendChild(txt(l.ubi + ' · ' + lotLabel(l.lot)));
        div.appendChild(subEl);

        // Columna derecha: cantidad (row 1) + borrar (row 2)
        var cantEl = el('span', 'sm-carrito-line-cant');
        cantEl.appendChild(txt('×' + fmt(l.cant)));
        div.appendChild(cantEl);

        var actEl = el('span', 'sm-carrito-line-actions');
        var delBtn = el('button', 'sm-btn-del');
        delBtn.type = 'button';
        delBtn.title = 'Eliminar línea';
        delBtn.appendChild(txt('🗑'));
        (function (id) {
            delBtn.addEventListener('click', function () { eliminarLinea(id); });
        }(l.id));
        actEl.appendChild(delBtn);
        div.appendChild(actEl);

        return div;
    }

    function eliminarLinea(id) {
        var idx = _lineas.findIndex(function (l) { return l.id === id; });
        if (idx !== -1) _lineas.splice(idx, 1);
        renderCarrito();
    }

    /* ── CONFIRMAR SALIDA ───────────────────────────────────────────── */

    async function confirmarSalida() {
        if (!_lineas.length || _sending) return;
        _sending = true;
        $('btn-confirmar').disabled = true;
        $('btn-confirmar').textContent = 'Enviando…';

        var snap = _lineas.slice();
        var results = await Promise.allSettled(snap.map(saveLinea));

        var exitosos = [];
        var fallidos = [];
        snap.forEach(function (l, i) {
            if (results[i].status === 'fulfilled') {
                exitosos.push(l);
            } else {
                fallidos.push({ linea: l, motivo: results[i].reason || 'Error desconocido' });
            }
        });

        // Mantener en carrito solo las fallidas
        var fallIdSet = new Set(fallidos.map(function (f) { return f.linea.id; }));
        _lineas = _lineas.filter(function (l) { return fallIdSet.has(l.id); });

        renderCarrito();
        renderResultados(snap, results, exitosos.length, fallidos.length);

        _sending = false;
        $('btn-confirmar').textContent = 'Confirmar salida ▶';
    }

    async function saveLinea(l) {
        try {
            await SGA.salidas.save({ cod: l.cod, ubi: l.ubi, lot: l.lot, cant: l.cant });
            return { ok: true };
        } catch (err) {
            var msg = (err && err.message) ? err.message : '';
            if (msg.indexOf('400') !== -1) throw 'Stock insuficiente en ubicación';
            if (msg.indexOf('409') !== -1) throw 'Stock insuficiente en ubicación';
            if (msg.indexOf('500') !== -1) throw 'Error interno del servidor';
            throw 'Error de conexión — compruebe la red';
        }
    }

    /* ── RESULTADOS ─────────────────────────────────────────────────── */

    function renderResultados(snap, results, nOk, nErr) {
        var header = $('sm-results-header');
        while (header.firstChild) header.removeChild(header.firstChild);

        if (nErr === 0) {
            header.className = 'sm-results-header sm-results-header--ok';
            header.appendChild(txt('✓ ' + nOk + ' ' + (nOk === 1 ? 'línea confirmada' : 'líneas confirmadas') + ' correctamente'));
        } else if (nOk === 0) {
            header.className = 'sm-results-header';
            header.appendChild(txt('✗ Todas las líneas fallaron (' + nErr + ')'));
        } else {
            header.className = 'sm-results-header sm-results-header--partial';
            header.appendChild(txt('⚠ ' + nOk + ' de ' + snap.length + ' líneas confirmadas — ' + nErr + ' con error'));
        }

        var linesDiv = $('sm-results-lines');
        while (linesDiv.firstChild) linesDiv.removeChild(linesDiv.firstChild);

        snap.forEach(function (l, i) {
            var ok = results[i].status === 'fulfilled';
            var motivo = ok ? '' : (results[i].reason || 'Error desconocido');

            var lineEl = el('div', 'sm-result-line sm-result-line--' + (ok ? 'ok' : 'err'));

            var iconEl = el('span', 'sm-result-line-icon');
            iconEl.appendChild(txt(ok ? '✓' : '✗'));
            lineEl.appendChild(iconEl);

            var infoEl = el('span', 'sm-result-line-info');
            infoEl.appendChild(txt(l.cod + ' · ' + l.ubi + ' · ' + lotLabel(l.lot)));
            if (!ok) {
                var errSpan = el('span', 'sm-result-line-err-msg');
                errSpan.appendChild(txt(motivo));
                infoEl.appendChild(errSpan);
            }
            lineEl.appendChild(infoEl);

            var cantEl = el('span', 'sm-result-line-cant');
            cantEl.appendChild(txt('×' + fmt(l.cant)));
            lineEl.appendChild(cantEl);

            linesDiv.appendChild(lineEl);
        });

        $('sm-workspace').hidden = true;
        $('sm-results').hidden = false;
    }

    /* ── LIMPIAR TODO ───────────────────────────────────────────────── */

    function limpiarTodo() {
        if (_lineas.length > 0) {
            if (!window.confirm('¿Limpiar todo el formulario? Se perderán las líneas del carrito.')) return;
        }

        _lineas   = [];
        _lineaIdx = 0;
        _sending  = false;

        limpiarFormRapido();
        ocultarStatus();
        renderCarrito();

        $('sm-workspace').hidden = false;
        $('sm-results').hidden   = true;
        $('btn-confirmar').textContent = 'Confirmar salida ▶';

        $('sm-art-cod').focus();
    }

    /* ── INIT ───────────────────────────────────────────────────────── */

    document.addEventListener('DOMContentLoaded', function () {

        /* Artículo */
        $('sm-art-cod').addEventListener('blur', buscarArticulo);
        $('sm-art-cod').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                buscarArticulo().then(function () {
                    // Si hay stock, mover foco al primer item de la lista
                    var first = $('sm-stock-lista').querySelector('.sm-stock-item');
                    if (first) first.focus();
                });
            } else if (ev.key === 'ArrowDown') {
                ev.preventDefault();
                var first = $('sm-stock-lista').querySelector('.sm-stock-item');
                if (first) first.focus();
            }
        });
        $('sm-art-cod').addEventListener('input', function () {
            if (!this.value.trim()) limpiarArticulo();
        });
        $('btn-art-clear').addEventListener('click', limpiarArticulo);

        /* Cantidad */
        $('sm-cant').addEventListener('input', validarCantidad);
        $('sm-cant').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                agregarLinea();
            }
        });
        $('btn-menos').addEventListener('click', function () { stepCant(-1); });
        $('btn-mas').addEventListener('click',   function () { stepCant(+1); });

        /* Botones principales */
        $('btn-anadir').addEventListener('click', agregarLinea);
        $('btn-confirmar').addEventListener('click', confirmarSalida);
        $('btn-nueva-salida').addEventListener('click', limpiarTodo);
        $('btn-limpiar').addEventListener('click', limpiarTodo);

        /* F5 */
        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'F5') {
                ev.preventDefault();
                limpiarTodo();
            }
        });

        /* Estado inicial */
        renderCarrito();
        $('sm-art-cod').focus();
    });

})();
