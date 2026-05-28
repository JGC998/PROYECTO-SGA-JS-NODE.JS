"use strict";

(function () {

    /* ── ESTADO INTERNO ─────────────────────────────────────────────────────── */
    var _lineas    = [];
    var _lineaIdx  = 0;
    var _artState  = null;   // null | 'loading' | 'found' | 'notfound'
    var _ubiState  = null;   // null | 'loading' | 'found' | 'notfound'
    var _artNombre = '';
    var _ubiNombre = '';
    var _sending   = false;

    /* ── HELPERS ────────────────────────────────────────────────────────────── */
    function $(id)       { return document.getElementById(id); }
    function el(tag, c)  { var e = document.createElement(tag); if (c) e.className = c; return e; }
    function txt(s)      { return document.createTextNode(String(s == null ? '' : s)); }
    function fmt(n)      { return Number(n || 0).toLocaleString('es-ES'); }

    function fechaHoy() {
        return new Date().toISOString().split('T')[0];
    }

    /* ── ARTÍCULO ───────────────────────────────────────────────────────────── */

    function buscarArticulo() {
        var cod = $('ent-art-cod').value.trim();
        if (!cod) { clearArticuloState(); return; }
        setArtState('loading');
        SGA.articulos.get(cod)
            .then(function (a) {
                _artNombre = a.nombre || cod;
                setArtState('found');
                showPill('em-art-pill', 'ok', '✓ ' + _artNombre);
            })
            .catch(function () {
                _artNombre = '';
                setArtState('notfound');
                showPill('em-art-pill', 'warn',
                    '⚠ Artículo no encontrado — se dará de alta automáticamente');
            });
    }

    function clearArticuloState() {
        _artState  = null;
        _artNombre = '';
        clearPill('em-art-pill');
        $('btn-art-clear').hidden = true;
        removeInputStates('ent-art-cod');
        actualizarBtnAnadir();
    }

    function clearArticulo() {
        $('ent-art-cod').value = '';
        clearArticuloState();
        $('ent-art-cod').focus();
    }

    function setArtState(state) {
        _artState = state;
        removeInputStates('ent-art-cod');
        if (state === 'loading') {
            $('ent-art-cod').classList.add('em-input--loading');
            showPill('em-art-pill', 'loading', 'Buscando…');
        } else if (state === 'found') {
            $('ent-art-cod').classList.add('em-input--valid');
            $('btn-art-clear').hidden = false;
        } else if (state === 'notfound') {
            $('ent-art-cod').classList.add('em-input--warn');
            $('btn-art-clear').hidden = false;
        }
        actualizarBtnAnadir();
    }

    /* ── UBICACIÓN ──────────────────────────────────────────────────────────── */

    function buscarUbicacion() {
        var cod = $('ent-ubi').value.trim();
        if (!cod) { clearUbicacionState(); return; }
        setUbiState('loading');
        SGA.ubicaciones.list({ ubicacion: cod })
            .then(function (data) {
                var arr  = Array.isArray(data) ? data : [];
                var codUp = cod.toUpperCase();
                var found = arr.find(function (u) {
                    return (u.ubicacion || '').trim().toUpperCase() === codUp;
                });
                if (found) {
                    _ubiNombre = found.nombre || found.nom_ubicacion || '';
                    var almacen = found.almacen || '';
                    setUbiState('found');
                    var label = '📍 ' + (found.ubicacion || cod);
                    if (_ubiNombre) label += ' · ' + _ubiNombre;
                    if (almacen)   label += ' · ' + almacen;
                    showPill('em-ubi-pill', 'ubi-ok', label);
                } else {
                    _ubiNombre = '';
                    setUbiState('notfound');
                    showPill('em-ubi-pill', 'ubi-err', '✗ Ubicación no encontrada');
                }
            })
            .catch(function () {
                _ubiNombre = '';
                setUbiState('notfound');
                showPill('em-ubi-pill', 'ubi-err', '✗ Error al buscar ubicación');
            });
    }

    function clearUbicacionState() {
        _ubiState  = null;
        _ubiNombre = '';
        clearPill('em-ubi-pill');
        removeInputStates('ent-ubi');
        actualizarBtnAnadir();
    }

    function setUbiState(state) {
        _ubiState = state;
        removeInputStates('ent-ubi');
        if (state === 'loading') {
            $('ent-ubi').classList.add('em-input--loading');
            showPill('em-ubi-pill', 'loading', 'Buscando…');
        } else if (state === 'found') {
            $('ent-ubi').classList.add('em-input--valid');
        } else if (state === 'notfound') {
            $('ent-ubi').classList.add('em-input--invalid');
        }
        actualizarBtnAnadir();
    }

    /* ── PILLS ──────────────────────────────────────────────────────────────── */

    function showPill(id, variant, text) {
        var p = $(id);
        if (!p) return;
        p.className = 'em-pill em-pill--' + variant;
        p.textContent = text;
        p.hidden = false;
    }

    function clearPill(id) {
        var p = $(id);
        if (!p) return;
        p.hidden    = true;
        p.textContent = '';
        p.className = 'em-pill';
    }

    /* ── UTILIDADES INPUT ───────────────────────────────────────────────────── */

    function removeInputStates(id) {
        var inp = $(id);
        if (!inp) return;
        inp.classList.remove(
            'em-input--valid', 'em-input--invalid',
            'em-input--warn',  'em-input--loading'
        );
    }

    /* ── BOTÓN AÑADIR — activación dinámica ────────────────────────────────── */

    function actualizarBtnAnadir() {
        var cod  = $('ent-art-cod').value.trim();
        var lot  = $('ent-lot').value.trim();
        var ubi  = $('ent-ubi').value.trim();
        var cant = parseFloat($('ent-cant').value);
        var ok = cod && lot && ubi && _ubiState === 'found' && Number.isFinite(cant) && cant > 0;
        $('btn-anadir').disabled = !ok;
    }

    /* ── SIN LOTE ───────────────────────────────────────────────────────────── */

    function setSinLote() {
        $('ent-lot').value = 'SL';
        removeInputStates('ent-lot');
        actualizarBtnAnadir();
    }

    /* ── STEPPER ────────────────────────────────────────────────────────────── */

    function stepCant(delta) {
        var inp  = $('ent-cant');
        var curr = parseFloat(inp.value) || 0;
        var next = Math.max(0.001, curr + delta);
        inp.value = (next % 1 === 0) ? String(Math.round(next)) : next.toFixed(3);
        removeInputStates('ent-cant');
    }

    /* ── VALIDACIÓN ─────────────────────────────────────────────────────────── */

    function validarLinea() {
        var errors = [];
        var cod  = $('ent-art-cod').value.trim();
        var lot  = $('ent-lot').value.trim();
        var ubi  = $('ent-ubi').value.trim();
        var cant = parseFloat($('ent-cant').value);

        if (!cod) {
            $('ent-art-cod').classList.add('em-input--invalid');
            errors.push('Artículo obligatorio');
        } else if (cod.length > 50) {
            $('ent-art-cod').classList.add('em-input--invalid');
            errors.push('Artículo demasiado largo (máx 50 caracteres)');
        }
        if (!lot) {
            $('ent-lot').classList.add('em-input--invalid');
            errors.push('Lote obligatorio — use "SIN LOTE" si no aplica');
        } else if (lot.length > 10) {
            $('ent-lot').classList.add('em-input--invalid');
            errors.push('Lote demasiado largo (máx 10 caracteres en LIN)');
        }
        if (!ubi) {
            $('ent-ubi').classList.add('em-input--invalid');
            errors.push('Ubicación destino obligatoria');
        } else if (ubi.length > 20) {
            $('ent-ubi').classList.add('em-input--invalid');
            errors.push('Ubicación demasiado larga (máx 20 caracteres)');
        } else if (_ubiState === 'notfound') {
            errors.push('La ubicación no existe en el sistema');
        } else if (_ubiState === null) {
            errors.push('Verifique la ubicación (pulse Enter o Tab en el campo)');
        }
        if (!Number.isFinite(cant) || cant <= 0) {
            $('ent-cant').classList.add('em-input--invalid');
            errors.push('La cantidad debe ser mayor que 0');
        }
        return errors;
    }

    /* ── AÑADIR LÍNEA ───────────────────────────────────────────────────────── */

    function agregarLinea() {
        ['ent-art-cod', 'ent-lot', 'ent-ubi', 'ent-cant'].forEach(function (id) {
            removeInputStates(id);
        });

        var errors = validarLinea();
        if (errors.length) {
            mostrarStatus(errors[0], 'error');
            return;
        }

        _lineaIdx++;
        var linea = {
            id:        _lineaIdx,
            cod:       $('ent-art-cod').value.trim(),
            nombre:    _artNombre || $('ent-art-cod').value.trim(),
            lot:       $('ent-lot').value.trim(),
            ubi:       $('ent-ubi').value.trim(),
            ubiNombre: _ubiNombre,
            cant:      parseFloat($('ent-cant').value)
        };

        _lineas.push(linea);
        renderCarrito();
        ocultarStatus();
        limpiarFormRapido();
        $('ent-art-cod').focus();
    }

    /* ── CARRITO ────────────────────────────────────────────────────────────── */

    function renderCarrito() {
        var body      = $('em-carrito-body');
        var empty     = $('em-carrito-empty');
        var countEl   = $('em-carrito-count');
        var totalesEl = $('em-carrito-totales');
        var btnConf   = $('btn-confirmar');

        /* Vaciar body */
        while (body.firstChild) body.removeChild(body.firstChild);

        if (!_lineas.length) {
            empty.hidden = false;
            body.appendChild(empty);
            countEl.textContent   = '0 líneas';
            totalesEl.textContent = '';
            btnConf.disabled      = true;
            return;
        }

        /* Mantener el empty en DOM pero oculto */
        empty.hidden = true;
        body.appendChild(empty);

        var frag = document.createDocumentFragment();
        _lineas.forEach(function (l) { frag.appendChild(buildLineaEl(l)); });
        body.appendChild(frag);

        var n         = _lineas.length;
        var totalUds  = _lineas.reduce(function (s, l) { return s + l.cant; }, 0);
        countEl.textContent   = n + ' ' + (n === 1 ? 'línea' : 'líneas');
        totalesEl.textContent = n + ' ' + (n === 1 ? 'línea' : 'líneas') + ' · ' + fmt(totalUds) + ' uds.';
        btnConf.disabled      = false;
    }

    function buildLineaEl(l) {
        var div = el('div', 'em-line');
        div.dataset.id = l.id;

        /* -- info izquierda -- */
        var info = el('div', 'em-line-info');

        var artRow  = el('div', 'em-line-art-row');
        var artSpan = el('span', 'em-line-art');
        artSpan.appendChild(txt(l.cod));
        artRow.appendChild(artSpan);
        if (l.nombre && l.nombre !== l.cod) {
            var nomSpan = el('span', 'em-line-nombre');
            nomSpan.appendChild(txt(l.nombre));
            artRow.appendChild(nomSpan);
        }
        info.appendChild(artRow);

        var tags    = el('div', 'em-line-tags');
        var lotBadge = el('span', 'em-line-lote');
        lotBadge.appendChild(txt(l.lot));
        tags.appendChild(lotBadge);
        var ubiBadge = el('span', 'em-line-ubi');
        var ubiText  = l.ubi + (l.ubiNombre ? ' · ' + l.ubiNombre : '');
        ubiBadge.appendChild(txt(ubiText));
        tags.appendChild(ubiBadge);
        info.appendChild(tags);

        div.appendChild(info);

        /* -- derecha: cant + eliminar -- */
        var right    = el('div', 'em-line-right');
        var cantSpan = el('span', 'em-line-cant');
        cantSpan.appendChild(txt(fmt(l.cant)));
        right.appendChild(cantSpan);

        var btnDel = el('button', 'em-line-del');
        btnDel.type = 'button';
        btnDel.setAttribute('aria-label', 'Eliminar línea');
        btnDel.appendChild(txt('🗑'));
        /* IIFE para capturar id en el closure */
        (function (lineId) {
            btnDel.addEventListener('click', function () { eliminarLinea(lineId); });
        })(l.id);
        right.appendChild(btnDel);

        div.appendChild(right);
        return div;
    }

    /* ── ELIMINAR LÍNEA ─────────────────────────────────────────────────────── */

    function eliminarLinea(id) {
        _lineas = _lineas.filter(function (l) { return l.id !== id; });
        renderCarrito();
    }

    /* ── CONFIRMAR ENTRADA ──────────────────────────────────────────────────── */

    function confirmarEntrada() {
        if (_sending || !_lineas.length) return;
        _sending = true;

        var btnConf = $('btn-confirmar');
        btnConf.disabled    = true;
        btnConf.textContent = 'Enviando…';

        var snap = _lineas.slice();   /* snapshot del estado actual */

        Promise.allSettled(snap.map(function (l) {
            return saveLinea(l);
        })).then(function (results) {
            _sending = false;
            renderResultados(snap, results);

            /* Mantener en carrito solo las líneas que fallaron */
            var failIds = [];
            results.forEach(function (r, i) {
                if (r.status === 'rejected') failIds.push(snap[i].id);
            });
            _lineas = _lineas.filter(function (l) {
                return failIds.indexOf(l.id) !== -1;
            });

            renderCarrito();

            if (_lineas.length) {
                /* Hay fallos — habilitar reintento */
                btnConf.disabled    = false;
                btnConf.textContent = 'Reintentar fallidas ▶';
            } else {
                btnConf.textContent = 'Confirmar entrada ▶';
            }
        });
    }

    function saveLinea(l) {
        return SGA.entradaMercancia.save({
            articulo:  l.cod,
            ubicacion: l.ubi,
            lote:      l.lot,
            cantidad:  l.cant,
            usuario:   'SGA'
        }).catch(function (err) {
            var match = err.message && err.message.match(/→ (\d+)/);
            if (!match) match = err.message && err.message.match(/(\d{3})/);
            if (match) {
                var status = parseInt(match[1], 10);
                if (status === 400) throw new Error('Datos inválidos (artículo, ubicación, lote o cantidad)');
                if (status === 404) throw new Error('Artículo o ubicación no encontrados en LIN');
                if (status === 500) throw new Error('Error del servidor ERP');
            }
            throw err;
        });
    }

    /* ── MODAL DE RESULTADO ─────────────────────────────────────────────────── */

    function renderResultados(lineas, results) {
        var nOk   = results.filter(function (r) { return r.status === 'fulfilled'; }).length;
        var total = results.length;

        var title = $('em-result-title');
        if (title) {
            title.textContent = nOk === total
                ? 'Entrada completada'
                : 'Entrada — ' + nOk + ' de ' + total + ' líneas registradas';
        }

        var body = $('em-result-modal-body');
        body.innerHTML = '';

        results.forEach(function (r, i) {
            var l     = lineas[i];
            var exito = r.status === 'fulfilled';
            var row   = el('div', exito ? 'em-result-line em-result-line--ok' : 'em-result-line em-result-line--err');

            var iconSpan = el('span', 'em-result-icon');
            iconSpan.appendChild(txt(exito ? '✓' : '✗'));
            row.appendChild(iconSpan);

            var infoSpan = el('span', 'em-result-info');
            if (exito) {
                var d     = r.value;
                var alb   = d.serie + '/' + d.albaran;
                var delta = 'Stock: ' + fmt(d.stocklote_antes) + ' → ' + fmt(d.stocklote_nuevo);
                infoSpan.appendChild(txt(l.cod + ' · ' + l.ubi + ' · ' + fmt(l.cant) + ' uds. — Alb. ' + alb + ' · ' + delta));
            } else {
                infoSpan.appendChild(txt(l.cod + ' · ' + l.ubi + ' · ' + fmt(l.cant) + ' uds.'));
                var errSpan = el('span', 'em-result-err');
                errSpan.appendChild(txt((r.reason && r.reason.message) ? r.reason.message : 'Error desconocido'));
                infoSpan.appendChild(errSpan);
            }
            row.appendChild(infoSpan);
            body.appendChild(row);
        });

        var firstOkIdx = results.findIndex(function (r) { return r.status === 'fulfilled'; });
        if (firstOkIdx !== -1) {
            $('link-ver-stock').href =
                '../consulta-de-stock/index.html?articulo=' +
                encodeURIComponent(lineas[firstOkIdx].cod);
        }

        $('em-result-overlay').classList.add('em-result-overlay--active');
    }

    function closeResultModal() {
        var overlay = $('em-result-overlay');
        if (overlay) overlay.classList.remove('em-result-overlay--active');
    }

    /* ── LIMPIAR ────────────────────────────────────────────────────────────── */

    function limpiarFormRapido() {
        $('ent-art-cod').value = '';
        $('ent-lot').value     = '';
        $('ent-ubi').value     = '';
        $('ent-cant').value    = '1';
        _artState  = null;
        _artNombre = '';
        _ubiState  = null;
        _ubiNombre = '';
        clearPill('em-art-pill');
        clearPill('em-ubi-pill');
        $('btn-art-clear').hidden = true;
        ['ent-art-cod', 'ent-lot', 'ent-ubi', 'ent-cant'].forEach(function (id) {
            removeInputStates(id);
        });
    }

    function limpiarTodo() {
        if (_lineas.length > 0) {
            var n   = _lineas.length;
            var msg = '¿Descartar ' + n + ' ' + (n === 1 ? 'línea' : 'líneas') + ' del carrito?';
            if (!window.confirm(msg)) return;
        }
        _lineas   = [];
        _lineaIdx = 0;
        limpiarFormRapido();
        renderCarrito();

        /* Resetear cabecera albarán */
        $('ent-fecha').value       = fechaHoy();
        $('ent-prov-cod').value    = '';
        $('ent-prov-nombre').value = '';
        $('ent-albaran').value     = '';

        /* Resetear texto del botón confirmar */
        var btnConf = $('btn-confirmar');
        btnConf.textContent = 'Confirmar entrada ▶';
        btnConf.disabled    = true;

        ocultarStatus();
        $('ent-art-cod').focus();
    }

    /* ── ESTADO VISUAL DEL FORMULARIO ───────────────────────────────────────── */

    function mostrarStatus(msg, tipo) {
        var el2 = $('em-form-status');
        if (!el2) return;
        el2.textContent = msg;
        el2.className   = 'em-form-status em-form-status--' + tipo;
        el2.hidden      = false;
        /* Auto-ocultar mensajes de éxito */
        if (tipo === 'ok') {
            setTimeout(function () { ocultarStatus(); }, 2000);
        }
    }

    function ocultarStatus() {
        var el2 = $('em-form-status');
        if (el2) el2.hidden = true;
    }

    /* ── CABECERA ALBARÁN TOGGLE ────────────────────────────────────────────── */

    function toggleCabecera() {
        var body = $('em-cabecera-body');
        var btn  = $('btn-toggle-cabecera');
        var open = body.hidden;
        body.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = (open ? '▾' : '▸') +
            ' Datos del albarán — proveedor, fecha, nº albarán (opcional)';
    }

    /* ── PROVEEDOR ──────────────────────────────────────────────────────────── */

    function buscarProveedor() {
        var cod = $('ent-prov-cod').value.trim();
        if (!cod) return;
        SGA.proveedores.get(cod)
            .then(function (p) { $('ent-prov-nombre').value = p.nombre || ''; })
            .catch(function () { $('ent-prov-nombre').value = 'No encontrado'; });
    }

    /* ── INIT ───────────────────────────────────────────────────────────────── */

    document.addEventListener('DOMContentLoaded', function () {
        /* Fecha de hoy */
        $('ent-fecha').value = fechaHoy();

        /* Artículo */
        $('ent-art-cod').addEventListener('blur', buscarArticulo);
        $('ent-art-cod').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); buscarArticulo(); }
        });
        $('ent-art-cod').addEventListener('input', function () {
            if (!this.value.trim()) clearArticulo();
        });
        $('btn-art-clear').addEventListener('click', clearArticulo);

        /* Lote — Enter salta a ubicación */
        $('ent-lot').addEventListener('input', actualizarBtnAnadir);
        $('ent-lot').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); $('ent-ubi').focus(); }
        });

        /* SIN LOTE */
        $('btn-sin-lote').addEventListener('click', setSinLote);

        /* Ubicación */
        $('ent-ubi').addEventListener('blur', buscarUbicacion);
        $('ent-ubi').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                buscarUbicacion();
                /* Pequeño delay para que la búsqueda arranque antes de mover foco */
                setTimeout(function () { $('ent-cant').focus(); }, 80);
            }
        });
        $('ent-ubi').addEventListener('input', function () {
            if (!this.value.trim()) clearUbicacionState();
        });

        /* Cantidad — Enter = Añadir */
        $('ent-cant').addEventListener('input', actualizarBtnAnadir);
        $('ent-cant').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); agregarLinea(); }
        });

        /* Steppers */
        $('btn-menos').addEventListener('click', function () { stepCant(-1); });
        $('btn-mas').addEventListener('click',   function () { stepCant(1);  });

        /* Añadir línea */
        $('btn-anadir').addEventListener('click', agregarLinea);

        /* Confirmar entrada */
        $('btn-confirmar').addEventListener('click', confirmarEntrada);

        /* Modal resultado — cerrar */
        $('em-result-close').addEventListener('click', closeResultModal);
        $('em-result-overlay').addEventListener('click', function (e) {
            if (e.target === this) closeResultModal();
        });

        /* Limpiar (header) */
        $('btn-limpiar').addEventListener('click', limpiarTodo);

        /* Toggle cabecera albarán */
        $('btn-toggle-cabecera').addEventListener('click', toggleCabecera);

        /* Proveedor */
        $('ent-prov-cod').addEventListener('blur', buscarProveedor);

        /* F5 — limpiar todo */
        document.addEventListener('keydown', function (e) {
            if (e.key === 'F5') { e.preventDefault(); limpiarTodo(); }
        });

        /* Foco inicial */
        $('ent-art-cod').focus();
    });

})();
