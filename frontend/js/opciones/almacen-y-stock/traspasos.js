"use strict";

(function () {

    // ── ESTADO ────────────────────────────────────────────────────────────────

    var _articulo      = '';    // código artículo buscado
    var _stockRows     = [];    // filas devueltas por consultaStock.list
    var _selectedOrigen = null; // { cod, nombre, ubiOri, lot, disponible }
    var _lineas        = [];    // líneas en el carrito
    var _loading       = false;
    var _sending       = false;

    // ── HELPERS ───────────────────────────────────────────────────────────────

    function fmt(n) {
        return Number(n != null ? n : 0).toLocaleString('es-ES');
    }

    function dash(v) {
        return v != null && v !== '' ? String(v) : '—';
    }

    function val(id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function el(tag, cls) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        return e;
    }

    function txt(s) {
        return document.createTextNode(String(s != null ? s : ''));
    }

    function getEl(id) {
        return document.getElementById(id);
    }

    function show(id) {
        var e = getEl(id);
        if (e) e.hidden = false;
    }

    function hide(id) {
        var e = getEl(id);
        if (e) e.hidden = true;
    }

    function clearError(id) {
        var e = getEl(id);
        if (e) e.textContent = '';
    }

    function setError(id, msg) {
        var e = getEl(id);
        if (e) e.textContent = msg || '';
    }

    function addInputError(inputId) {
        var e = getEl(inputId);
        if (e) e.classList.add('tp-dest-input--error', 'tp-qty-input--error');
    }

    function clearInputError(inputId) {
        var e = getEl(inputId);
        if (e) {
            e.classList.remove('tp-dest-input--error');
            e.classList.remove('tp-qty-input--error');
        }
    }

    // ── BÚSQUEDA DE STOCK ─────────────────────────────────────────────────────

    function buscarStock() {
        var cod = val('tp-f-articulo');
        if (!cod) {
            renderStockMessage('Introduce un código de artículo para buscar.');
            return;
        }
        if (_loading) return;
        _loading = true;
        _articulo = cod;
        _selectedOrigen = null;
        resetDestForm();
        hide('tp-dest-zone');
        renderLoading();

        SGA.consultaStock.list({ articulo: cod, solo_existencias: '1' })
            .then(function (data) {
                _stockRows = Array.isArray(data) ? data : [];
                renderStockList(_stockRows);
            })
            .catch(function () {
                renderStockError();
            })
            .finally(function () {
                _loading = false;
            });
    }

    function renderLoading() {
        var section = getEl('tp-stock-section');
        if (!section) return;
        section.innerHTML = '';
        var d = el('div', 'tp-loading');
        d.appendChild(txt('Cargando stock…'));
        section.appendChild(d);
    }

    function renderStockError() {
        var section = getEl('tp-stock-section');
        if (!section) return;
        section.innerHTML = '';
        var d = el('div', 'tp-error-msg');
        d.appendChild(txt('No se pudo cargar el stock. Comprueba la conexión.'));
        section.appendChild(d);
    }

    function renderStockMessage(msg) {
        var section = getEl('tp-stock-section');
        if (!section) return;
        section.innerHTML = '';
        var d = el('div', 'tp-placeholder');
        var icon = el('span', 'tp-placeholder-icon');
        icon.textContent = '📦';
        d.appendChild(icon);
        d.appendChild(txt(msg));
        section.appendChild(d);
    }

    function renderStockList(rows) {
        var section = getEl('tp-stock-section');
        if (!section) return;
        section.innerHTML = '';

        if (!rows || !rows.length) {
            var empty = el('div', 'tp-empty');
            empty.appendChild(txt('Sin stock disponible para este artículo.'));
            section.appendChild(empty);
            return;
        }

        var titleEl = el('div', 'tp-section-title');
        titleEl.appendChild(txt('Stock disponible — ' + _articulo));
        section.appendChild(titleEl);

        var list = el('div', 'tp-stock-list');
        rows.forEach(function (row, idx) {
            list.appendChild(buildStockCard(row, idx));
        });
        section.appendChild(list);
    }

    function buildStockCard(row, idx) {
        var cant = Number(row.cantidad != null ? row.cantidad : 0);
        var btn = el('button', 'tp-stock-card' + (cant <= 0 ? ' tp-stock-card--zero' : ''));
        btn.type = 'button';
        btn.dataset.idx = idx;
        btn.setAttribute('aria-label',
            'Seleccionar origen: ' + dash(row.ubicacion) + ', lote ' + dash(row.lote));

        var info = el('div');

        var ubi = el('div', 'tp-stock-card-ubi');
        ubi.appendChild(txt(dash(row.ubicacion)));
        info.appendChild(ubi);

        var lot = el('div', 'tp-stock-card-lot');
        lot.appendChild(txt('Lote: ' + dash(row.lote)));
        info.appendChild(lot);

        var qtyEl = el('div', 'tp-stock-card-qty');
        qtyEl.appendChild(txt(fmt(cant)));

        var unitEl = el('div', 'tp-stock-card-unit');
        unitEl.appendChild(txt('unidades'));

        btn.appendChild(info);
        btn.appendChild(qtyEl);
        btn.appendChild(unitEl);

        btn.addEventListener('click', function () {
            selectOrigen(idx);
        });

        return btn;
    }

    // ── SELECCIÓN DE ORIGEN ───────────────────────────────────────────────────

    function selectOrigen(idx) {
        var row = _stockRows[idx];
        if (!row) return;

        _selectedOrigen = {
            cod:       row.articulo || _articulo,
            nombre:    row.nombre || '',
            ubiOri:    row.ubicacion || '',
            lot:       row.lote || '',
            disponible: Number(row.cantidad != null ? row.cantidad : 0)
        };

        // Marcar card activa
        var cards = document.querySelectorAll('.tp-stock-card');
        cards.forEach(function (c, i) {
            if (i === idx) {
                c.classList.add('tp-stock-card--active');
            } else {
                c.classList.remove('tp-stock-card--active');
            }
        });

        // Actualizar hint de cantidad
        var hint = getEl('tp-qty-hint');
        if (hint) hint.textContent = '/ ' + fmt(_selectedOrigen.disponible) + ' disponibles';

        // Limpiar errores previos
        resetDestForm();
        // Mostrar zona de destino
        show('tp-dest-zone');

        // Foco en input destino
        var destInput = getEl('tp-dest-input');
        if (destInput) destInput.focus();
    }

    // ── VALIDACIÓN ────────────────────────────────────────────────────────────

    function validateLinea() {
        var errors = {};

        if (!_selectedOrigen) {
            errors.general = 'Selecciona primero una línea de stock origen.';
            return errors;
        }

        var ubiDes = val('tp-dest-input');
        if (!ubiDes) {
            errors.dest = 'Introduce la ubicación destino.';
        } else if (ubiDes === _selectedOrigen.ubiOri) {
            errors.dest = 'La ubicación destino debe ser diferente de la origen.';
        }

        var cantRaw = val('tp-qty-input');
        var cant = Number(cantRaw);
        if (!cantRaw) {
            errors.qty = 'Introduce una cantidad.';
        } else if (!Number.isFinite(cant) || cant <= 0) {
            errors.qty = 'La cantidad debe ser un número mayor que 0.';
        } else if (cant > _selectedOrigen.disponible) {
            errors.qty = 'Cantidad máxima disponible: ' + fmt(_selectedOrigen.disponible) + ' ud.';
        }

        return errors;
    }

    // ── CARRITO ───────────────────────────────────────────────────────────────

    function addLinea() {
        var errors = validateLinea();

        clearError('tp-dest-error');
        clearError('tp-qty-error');
        clearInputError('tp-dest-input');
        clearInputError('tp-qty-input');

        if (errors.general) {
            var generalMsg = el('div', 'tp-error-msg');
            generalMsg.appendChild(txt(errors.general));
            var section = getEl('tp-stock-section');
            if (section) section.insertBefore(generalMsg, section.firstChild);
            return;
        }

        if (errors.dest) {
            setError('tp-dest-error', errors.dest);
            var destEl = getEl('tp-dest-input');
            if (destEl) destEl.classList.add('tp-dest-input--error');
        }

        if (errors.qty) {
            setError('tp-qty-error', errors.qty);
            var qtyEl = getEl('tp-qty-input');
            if (qtyEl) qtyEl.classList.add('tp-qty-input--error');
        }

        if (errors.dest || errors.qty) return;

        _lineas.push({
            cod:    _selectedOrigen.cod,
            nombre: _selectedOrigen.nombre,
            ubiOri: _selectedOrigen.ubiOri,
            ubiDes: val('tp-dest-input'),
            lot:    _selectedOrigen.lot,
            cant:   Number(val('tp-qty-input'))
        });

        renderLineas();
        updatePanelBadge();
        resetDestForm();

        // Limpiar selección de origen para forzar nueva selección
        _selectedOrigen = null;
        var cards = document.querySelectorAll('.tp-stock-card');
        cards.forEach(function (c) { c.classList.remove('tp-stock-card--active'); });
        hide('tp-dest-zone');
    }

    function removeLinea(idx) {
        _lineas.splice(idx, 1);
        renderLineas();
        updatePanelBadge();
    }

    function renderLineas() {
        var body   = getEl('tp-panel-body');
        var empty  = getEl('tp-panel-empty');
        var footer = getEl('tp-panel-footer');
        if (!body) return;

        if (!_lineas.length) {
            body.innerHTML = '';
            body.hidden = true;
            if (empty)  empty.hidden  = false;
            if (footer) footer.hidden = true;
            return;
        }

        if (empty)  empty.hidden  = true;
        body.hidden = false;
        if (footer) footer.hidden = false;

        body.innerHTML = '';
        _lineas.forEach(function (linea, idx) {
            body.appendChild(buildLineaCard(linea, idx));
        });
    }

    function buildLineaCard(linea, idx) {
        var card = el('div', 'tp-linea');

        var art = el('div', 'tp-linea-art');
        var artLabel = linea.cod + (linea.nombre ? ' — ' + linea.nombre.slice(0, 30) : '');
        art.appendChild(txt(artLabel));

        var route = el('div', 'tp-linea-route');
        var oriTxt = el('span');
        oriTxt.appendChild(txt(dash(linea.ubiOri)));
        var arrow = el('span', 'tp-linea-route-arrow');
        arrow.appendChild(txt('→'));
        var desTxt = el('span');
        desTxt.appendChild(txt(dash(linea.ubiDes)));
        route.append(oriTxt, arrow, desTxt);

        var lot = el('div', 'tp-linea-lot');
        lot.appendChild(txt('Lote: ' + dash(linea.lot) + ' · ' + fmt(linea.cant) + ' ud.'));

        var removeBtn = el('button', 'tp-linea-remove');
        removeBtn.type = 'button';
        removeBtn.setAttribute('aria-label', 'Eliminar línea');
        removeBtn.appendChild(txt('×'));
        removeBtn.addEventListener('click', function () { removeLinea(idx); });

        card.append(art, route, lot, removeBtn);
        return card;
    }

    function updatePanelBadge() {
        var n = _lineas.length;

        var badge1 = getEl('tp-panel-count');
        if (badge1) badge1.textContent = String(n);

        var badge2 = getEl('tp-panel-badge');
        if (badge2) badge2.textContent = String(n);
    }

    // ── PANEL ────────────────────────────────────────────────────────────────

    function openPanel() {
        var panel    = getEl('tp-panel');
        var backdrop = getEl('tp-panel-backdrop');
        if (panel)    panel.classList.add('tp-panel--open');
        if (backdrop) backdrop.classList.add('tp-panel-backdrop--active');
    }

    function closePanel() {
        var panel    = getEl('tp-panel');
        var backdrop = getEl('tp-panel-backdrop');
        if (panel)    panel.classList.remove('tp-panel--open');
        if (backdrop) backdrop.classList.remove('tp-panel-backdrop--active');
    }

    // ── CONFIRMACIÓN ─────────────────────────────────────────────────────────

    function confirmarTraspaso() {
        if (_sending) return;
        if (!_lineas.length) {
            // Abrir panel para que el usuario lo vea vacío
            openPanel();
            return;
        }

        _sending = true;
        var btnConfirmar = getEl('tp-btn-confirmar');
        if (btnConfirmar) {
            btnConfirmar.disabled = true;
            btnConfirmar.textContent = 'Procesando…';
        }

        var okList  = [];
        var errList = [];
        var chain   = Promise.resolve();

        _lineas.forEach(function (linea, i) {
            chain = chain.then(function () {
                return SGA.traspasos.save({
                    cod:    linea.cod,
                    ubiOri: linea.ubiOri,
                    ubiDes: linea.ubiDes,
                    lot:    linea.lot,
                    cant:   linea.cant
                }).then(function () {
                    okList.push(i);
                }).catch(function (err) {
                    var msg = '';
                    if (err && err.message) msg = err.message;
                    errList.push({ idx: i, msg: msg });
                });
            });
        });

        chain.then(function () {
            _sending = false;
            if (btnConfirmar) {
                btnConfirmar.disabled = false;
                btnConfirmar.textContent = 'Confirmar traspaso';
            }
            renderResultModal(okList, errList);
        });
    }

    // ── MODAL RESULTADO ───────────────────────────────────────────────────────

    function renderResultModal(okList, errList) {
        var overlay = getEl('tp-result-overlay');
        var body    = getEl('tp-result-body');
        var title   = getEl('tp-result-title');
        if (!overlay || !body) return;

        body.innerHTML = '';

        var todoOk = errList.length === 0;
        var nOk    = okList.length;
        var nErr   = errList.length;

        if (title) {
            title.textContent = todoOk
                ? 'Traspaso completado'
                : 'Traspaso — ' + nOk + ' de ' + _lineas.length + ' líneas procesadas';
        }

        _lineas.forEach(function (linea, idx) {
            var isOk = okList.indexOf(idx) >= 0;
            var row  = el('div', 'tp-result-line ' + (isOk ? 'tp-result-line--ok' : 'tp-result-line--err'));

            var icon = el('span', 'tp-result-line-icon');
            icon.appendChild(txt(isOk ? '✓' : '✗'));

            var textEl = el('span', 'tp-result-line-text');
            var label  = dash(linea.cod) + ': ' + dash(linea.ubiOri) + ' → ' + dash(linea.ubiDes)
                       + ' · ' + fmt(linea.cant) + ' ud';
            if (!isOk) {
                var errEntry = errList.filter(function (e) { return e.idx === idx; })[0];
                if (errEntry && errEntry.msg) label += ' — ' + errEntry.msg;
            }
            textEl.appendChild(txt(label));

            row.append(icon, textEl);
            body.appendChild(row);
        });

        overlay.classList.add('tp-result-overlay--active');
        closePanel();

        if (todoOk) {
            _lineas = [];
            renderLineas();
            updatePanelBadge();
            resetAll();
        }
    }

    function closeResultModal() {
        var overlay = getEl('tp-result-overlay');
        if (overlay) overlay.classList.remove('tp-result-overlay--active');
    }

    // ── LIMPIEZA ──────────────────────────────────────────────────────────────

    function resetDestForm() {
        var destInput = getEl('tp-dest-input');
        var qtyInput  = getEl('tp-qty-input');
        if (destInput) {
            destInput.value = '';
            destInput.classList.remove('tp-dest-input--error');
        }
        if (qtyInput) {
            qtyInput.value = '';
            qtyInput.classList.remove('tp-qty-input--error');
        }
        clearError('tp-dest-error');
        clearError('tp-qty-error');
        var hint = getEl('tp-qty-hint');
        if (hint) hint.textContent = '';
    }

    function resetAll() {
        _articulo       = '';
        _stockRows      = [];
        _selectedOrigen = null;

        var artInput = getEl('tp-f-articulo');
        if (artInput) artInput.value = '';

        hide('tp-dest-zone');
        resetDestForm();

        var section = getEl('tp-stock-section');
        if (section) {
            section.innerHTML = '';
            var ph = el('div', 'tp-placeholder');
            var icon = el('span', 'tp-placeholder-icon');
            icon.textContent = '📦';
            ph.appendChild(icon);
            ph.appendChild(txt('Introduce un código de artículo y pulsa Buscar para ver el stock disponible.'));
            section.appendChild(ph);
        }
    }

    // ── URL PARAMS ────────────────────────────────────────────────────────────

    function readUrlParams() {
        var params = new URLSearchParams(window.location.search);
        var art    = params.get('articulo');
        if (art) {
            var artInput = getEl('tp-f-articulo');
            if (artInput) artInput.value = art;
            buscarStock();
        }
    }

    // ── INIT ─────────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', function () {

        readUrlParams();

        // Buscar artículo
        var btnBuscar = getEl('tp-btn-buscar');
        if (btnBuscar) btnBuscar.addEventListener('click', buscarStock);

        var artInput = getEl('tp-f-articulo');
        if (artInput) {
            artInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') buscarStock();
            });
        }

        // Añadir al carrito
        var btnAdd = getEl('tp-btn-add');
        if (btnAdd) btnAdd.addEventListener('click', addLinea);

        var qtyInput = getEl('tp-qty-input');
        if (qtyInput) {
            qtyInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') addLinea();
            });
        }

        // Confirmar traspaso
        var btnConfirmar = getEl('tp-btn-confirmar');
        if (btnConfirmar) btnConfirmar.addEventListener('click', confirmarTraspaso);

        // Vaciar todo
        var btnVaciar = getEl('tp-btn-vaciar');
        if (btnVaciar) {
            btnVaciar.addEventListener('click', function () {
                _lineas = [];
                renderLineas();
                updatePanelBadge();
                resetAll();
            });
        }

        // Panel — abrir (tablet/móvil)
        var btnPanelOpen = getEl('btn-tp-panel-open');
        if (btnPanelOpen) btnPanelOpen.addEventListener('click', openPanel);

        // Panel — cerrar
        var btnPanelClose = getEl('btn-tp-panel-close');
        if (btnPanelClose) btnPanelClose.addEventListener('click', closePanel);

        // Backdrop
        var backdrop = getEl('tp-panel-backdrop');
        if (backdrop) backdrop.addEventListener('click', closePanel);

        // Modal resultado — cerrar
        var btnResultClose = getEl('tp-result-close');
        if (btnResultClose) btnResultClose.addEventListener('click', closeResultModal);

        // Escape → cerrar panel o modal
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            var overlay = getEl('tp-result-overlay');
            if (overlay && overlay.classList.contains('tp-result-overlay--active')) {
                closeResultModal();
            } else {
                closePanel();
            }
        });

        // Limpiar errores inline al escribir
        var destInput = getEl('tp-dest-input');
        if (destInput) {
            destInput.addEventListener('input', function () {
                clearError('tp-dest-error');
                destInput.classList.remove('tp-dest-input--error');
            });
        }
        if (qtyInput) {
            qtyInput.addEventListener('input', function () {
                clearError('tp-qty-error');
                qtyInput.classList.remove('tp-qty-input--error');
            });
        }

    });

})();
