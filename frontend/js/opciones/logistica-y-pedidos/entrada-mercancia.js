"use strict";

(function () {

    /* ── ESTADO ────────────────────────────────────────────────────────────── */
    var _artState  = null;   // null | 'loading' | 'found' | 'notfound'
    var _ubiState  = null;
    var _artNombre = '';
    var _sending   = false;

    /* ── HELPERS ────────────────────────────────────────────────────────────── */
    function $(id)      { return document.getElementById(id); }
    function el(tag, c) { var e = document.createElement(tag); if (c) e.className = c; return e; }
    function txt(s)     { return document.createTextNode(String(s == null ? '' : s)); }
    function fmt(n)     { return Number(n || 0).toLocaleString('es-ES'); }

    /* ── ARTÍCULO ───────────────────────────────────────────────────────────── */

    function buscarArticulo() {
        var cod = $('enm-art').value.trim();
        if (!cod) { clearArticuloState(); return; }
        setArtState('loading');
        SGA.articulos.get(cod)
            .then(function (a) {
                _artNombre = a.nombre || cod;
                setArtState('found');
                showPill('enm-art-pill', 'ok', '✓ ' + _artNombre);
                $('enm-ubi').focus();
            })
            .catch(function () {
                _artNombre = '';
                setArtState('notfound');
                showPill('enm-art-pill', 'err', '✗ Artículo no encontrado en LIN');
            });
    }

    function setArtState(state) {
        _artState = state;
        removeInputStates('enm-art');
        if (state === 'loading') {
            $('enm-art').classList.add('enm-input--loading');
            showPill('enm-art-pill', 'loading', 'Buscando artículo…');
        } else if (state === 'found') {
            $('enm-art').classList.add('enm-input--valid');
            $('btn-art-clear').hidden = false;
        } else if (state === 'notfound') {
            $('enm-art').classList.add('enm-input--invalid');
            $('btn-art-clear').hidden = false;
        }
    }

    function clearArticuloState() {
        _artState  = null;
        _artNombre = '';
        clearPill('enm-art-pill');
        $('btn-art-clear').hidden = true;
        removeInputStates('enm-art');
    }

    function clearArticulo() {
        $('enm-art').value = '';
        clearArticuloState();
        $('enm-art').focus();
    }

    /* ── UBICACIÓN ──────────────────────────────────────────────────────────── */

    function buscarUbicacion() {
        var cod = $('enm-ubi').value.trim();
        if (!cod) { clearUbicacionState(); return; }
        setUbiState('loading');
        SGA.ubicaciones.list({ ubicacion: cod })
            .then(function (data) {
                var arr   = Array.isArray(data) ? data : [];
                var codUp = cod.toUpperCase();
                var found = arr.find(function (u) {
                    return (u.ubicacion || '').trim().toUpperCase() === codUp;
                });
                if (found) {
                    setUbiState('found');
                    var etiqueta = (found.etiqueta || '').trim();
                    var label = '📍 ' + cod.toUpperCase();
                    if (etiqueta) label += '  ·  ' + etiqueta;
                    showPill('enm-ubi-pill', 'ubi-ok', label);
                    $('enm-lot').focus();
                } else {
                    setUbiState('notfound');
                    showPill('enm-ubi-pill', 'ubi-err', '✗ Ubicación no encontrada en LIN');
                }
            })
            .catch(function () {
                setUbiState('notfound');
                showPill('enm-ubi-pill', 'ubi-err', '✗ Error al buscar ubicación');
            });
    }

    function setUbiState(state) {
        _ubiState = state;
        removeInputStates('enm-ubi');
        if (state === 'loading') {
            $('enm-ubi').classList.add('enm-input--loading');
            showPill('enm-ubi-pill', 'loading', 'Buscando ubicación…');
        } else if (state === 'found') {
            $('enm-ubi').classList.add('enm-input--valid');
        } else if (state === 'notfound') {
            $('enm-ubi').classList.add('enm-input--invalid');
        }
    }

    function clearUbicacionState() {
        _ubiState = null;
        clearPill('enm-ubi-pill');
        removeInputStates('enm-ubi');
    }

    /* ── PILLS ──────────────────────────────────────────────────────────────── */

    function showPill(id, variant, text) {
        var p = $(id);
        if (!p) return;
        p.className   = 'enm-pill enm-pill--' + variant;
        p.textContent = text;
        p.hidden      = false;
    }

    function clearPill(id) {
        var p = $(id);
        if (!p) return;
        p.hidden      = true;
        p.textContent = '';
        p.className   = 'enm-pill';
    }

    /* ── INPUTS ─────────────────────────────────────────────────────────────── */

    function removeInputStates(id) {
        var inp = $(id);
        if (!inp) return;
        inp.classList.remove(
            'enm-input--valid', 'enm-input--invalid',
            'enm-input--warn',  'enm-input--loading'
        );
    }

    /* ── LOTE ───────────────────────────────────────────────────────────────── */

    var _sinLoteActivo = false;

    function setSinLote() {
        _sinLoteActivo = true;
        $('enm-lot').value = 'SL';
        clearPill('enm-lot-pill');
        removeInputStates('enm-lot');
        $('enm-lot').classList.add('enm-input--valid');
        showPill('enm-lot-pill', 'ok', '✓ Sin lote (SL)');
        $('btn-sin-lote').classList.add('enm-btn-tag--active');
        actualizarContadorLote();
        $('enm-cant').focus();
    }

    function actualizarContadorLote() {
        var inp  = $('enm-lot');
        var cnt  = $('enm-lot-count');
        if (!cnt || !inp) return;
        var len  = inp.value.length;
        cnt.textContent = len + ' / 10';
        cnt.className   = 'enm-char-count';
        if (len >= 10)     cnt.classList.add('enm-char-count--full');
        else if (len >= 7) cnt.classList.add('enm-char-count--warn');
    }

    /* ── STEPPER ────────────────────────────────────────────────────────────── */

    function stepCant(delta) {
        var inp  = $('enm-cant');
        var curr = parseInt(inp.value, 10) || 0;
        inp.value = String(Math.max(1, curr + delta));
        removeInputStates('enm-cant');
        inp.focus();
    }

    /* ── VALIDACIÓN ─────────────────────────────────────────────────────────── */

    function validar() {
        var art  = $('enm-art').value.trim();
        var ubi  = $('enm-ubi').value.trim();
        var lot  = $('enm-lot').value.trim();
        var cant = parseInt($('enm-cant').value, 10);

        if (!art) {
            $('enm-art').classList.add('enm-input--invalid');
            $('enm-art').focus();
            return 'Artículo obligatorio';
        }
        if (art.length > 50) {
            $('enm-art').classList.add('enm-input--invalid');
            return 'Artículo demasiado largo (máx 50 caracteres)';
        }
        if (_artState === 'notfound') {
            $('enm-art').focus();
            return 'El artículo no existe en LIN — verifique el código';
        }

        if (!ubi) {
            $('enm-ubi').classList.add('enm-input--invalid');
            $('enm-ubi').focus();
            return 'Ubicación obligatoria';
        }
        if (ubi.length > 20) {
            $('enm-ubi').classList.add('enm-input--invalid');
            return 'Ubicación demasiado larga (máx 20 caracteres)';
        }
        if (_ubiState === 'notfound') {
            $('enm-ubi').focus();
            return 'La ubicación no existe en LIN';
        }
        if (_ubiState === null) {
            $('enm-ubi').focus();
            return 'Verifique la ubicación (pulse Enter o Tab en el campo)';
        }

        if (!lot) {
            $('enm-lot').classList.add('enm-input--invalid');
            $('enm-lot').focus();
            return 'Lote obligatorio — use "SIN LOTE" si no aplica';
        }
        if (lot.length > 10) {
            $('enm-lot').classList.add('enm-input--invalid');
            $('enm-lot').focus();
            return 'Lote demasiado largo (máx 10 caracteres en LIN)';
        }

        if (!Number.isFinite(cant) || cant < 1) {
            $('enm-cant').classList.add('enm-input--invalid');
            $('enm-cant').focus();
            return 'La cantidad debe ser un número entero mayor que 0';
        }

        return null;
    }

    /* ── BOTÓN: estado enviando ──────────────────────────────────────────────── */

    function setBtnEnviando(enviando) {
        var btn = $('btn-registrar');
        btn.disabled = enviando;
        btn.textContent = '';

        if (enviando) {
            var sp = el('span', 'enm-spinner');
            btn.appendChild(sp);
            btn.appendChild(txt(' Registrando…'));
        } else {
            btn.appendChild(txt('Registrar entrada ▶'));
        }
    }

    /* ── REGISTRAR ──────────────────────────────────────────────────────────── */

    function registrar() {
        if (_sending) return;

        ['enm-art', 'enm-ubi', 'enm-lot', 'enm-cant'].forEach(function (id) {
            removeInputStates(id);
        });
        ocultarStatus();

        var error = validar();
        if (error) {
            mostrarStatus('⚠ ' + error, 'error');
            return;
        }

        _sending = true;
        setBtnEnviando(true);
        $('btn-menos').disabled = true;
        $('btn-mas').disabled   = true;

        var payload = {
            articulo:  $('enm-art').value.trim(),
            ubicacion: $('enm-ubi').value.trim(),
            lote:      $('enm-lot').value.trim(),
            cantidad:  parseInt($('enm-cant').value, 10),
            usuario:   'SGA'
        };

        SGA.entradaMercancia.save(payload)
            .then(function (data) {
                _sending = false;
                setBtnEnviando(false);
                $('btn-menos').disabled = false;
                $('btn-mas').disabled   = false;
                renderResultadoOk(data);
            })
            .catch(function (err) {
                _sending = false;
                setBtnEnviando(false);
                $('btn-menos').disabled = false;
                $('btn-mas').disabled   = false;
                var msg = err.message || 'Error desconocido';
                if (/→ 400/.test(msg)) msg = 'Datos inválidos — artículo, ubicación, lote o cantidad incorrectos';
                if (/→ 404/.test(msg)) msg = 'Artículo o ubicación no encontrados en LIN';
                if (/→ 500/.test(msg)) msg = 'Error del servidor ERP — compruebe los datos e inténtelo de nuevo';
                renderResultadoError(msg);
            });
    }

    /* ── RENDER RESULTADO OK ────────────────────────────────────────────────── */

    function renderResultadoOk(data) {
        var header = $('enm-resultado-header');
        header.textContent = '';

        /* Banner de éxito con albarán badge */
        var sumDiv = el('div', 'enm-resultado-summary enm-resultado-summary--ok');
        sumDiv.appendChild(txt('✓ Entrada registrada correctamente'));
        var albBadge = el('span', 'enm-albaran-badge');
        albBadge.appendChild(txt(data.serie + ' / ' + data.albaran));
        sumDiv.appendChild(albBadge);
        header.appendChild(sumDiv);

        /* Ficha de datos */
        var ficha = el('div', 'enm-resultado-ficha');

        function fRow(label, value, cls, isStock) {
            var row = el('div', 'enm-ficha-row' + (isStock ? ' enm-ficha-row--stock' : ''));
            var lEl = el('span', 'enm-ficha-label');
            var vEl = el('span', 'enm-ficha-value' + (cls ? ' ' + cls : ''));
            lEl.appendChild(txt(label));
            vEl.appendChild(txt(value));
            if (isStock) {
                /* badge de delta */
                var delta = data.stocklote_nuevo - data.stocklote_antes;
                var badge = el('span', 'enm-delta-badge');
                badge.appendChild(txt('+' + fmt(delta)));
                vEl.appendChild(badge);
            }
            row.appendChild(lEl);
            row.appendChild(vEl);
            ficha.appendChild(row);
        }

        fRow('Artículo',       data.articulo + (_artNombre ? '  ·  ' + _artNombre : ''));
        fRow('Ubicación',      data.ubicacion);
        fRow('Lote',           data.lote);
        fRow('Cantidad',       fmt(data.cantidad) + ' uds.');
        fRow('Stock anterior', fmt(data.stocklote_antes) + ' uds.');
        fRow('Stock nuevo',    fmt(data.stocklote_nuevo) + ' uds.', 'enm-ficha-value--delta', true);
        fRow('Fecha',          new Date().toLocaleString('es-ES'));

        header.appendChild(ficha);

        /* Actualizar link ver-stock */
        $('link-ver-stock').href =
            '../../almacen-y-stock/consulta-de-stock/index.html?articulo=' +
            encodeURIComponent(data.articulo);

        $('enm-resultado').hidden    = false;
        $('enm-form-section').hidden = true;
        $('enm-resultado').setAttribute('role', 'status');
        $('enm-resultado').setAttribute('aria-live', 'polite');
        $('btn-nueva-entrada').focus();
    }

    /* ── RENDER RESULTADO ERROR ─────────────────────────────────────────────── */

    function renderResultadoError(msg) {
        var header = $('enm-resultado-header');
        header.textContent = '';

        var sumDiv = el('div', 'enm-resultado-summary enm-resultado-summary--error');
        sumDiv.appendChild(txt('✗ No se pudo registrar la entrada'));
        header.appendChild(sumDiv);

        var detalle = $('enm-resultado-detalle');
        detalle.textContent = '';
        var errDiv = el('div', 'enm-form-status enm-form-status--error');
        errDiv.appendChild(txt(msg));
        detalle.appendChild(errDiv);

        $('enm-resultado').hidden    = false;
        $('enm-form-section').hidden = true;
        $('btn-nueva-entrada').focus();
    }

    /* ── LIMPIAR ────────────────────────────────────────────────────────────── */

    function limpiarTodo() {
        $('enm-art').value  = '';
        $('enm-ubi').value  = '';
        $('enm-lot').value  = '';
        $('enm-cant').value = '1';

        _artState      = null;
        _artNombre     = '';
        _ubiState      = null;
        _sinLoteActivo = false;

        clearPill('enm-art-pill');
        clearPill('enm-ubi-pill');
        clearPill('enm-lot-pill');
        $('btn-art-clear').hidden = true;
        $('btn-sin-lote').classList.remove('enm-btn-tag--active');

        ['enm-art', 'enm-ubi', 'enm-lot', 'enm-cant'].forEach(function (id) {
            removeInputStates(id);
        });

        actualizarContadorLote();
        ocultarStatus();

        $('enm-resultado').hidden    = false;  /* quitar hidden antes de ocultar */
        $('enm-resultado').hidden    = true;
        $('enm-form-section').hidden = false;

        $('enm-resultado-header').textContent  = '';
        $('enm-resultado-detalle').textContent = '';

        setBtnEnviando(false);
        $('btn-menos').disabled = false;
        $('btn-mas').disabled   = false;

        $('enm-art').focus();
    }

    /* ── STATUS INLINE ──────────────────────────────────────────────────────── */

    function mostrarStatus(msg, tipo) {
        var s = $('enm-form-status');
        if (!s) return;
        s.textContent = msg;
        s.className   = 'enm-form-status enm-form-status--' + tipo;
        s.hidden      = false;
    }

    function ocultarStatus() {
        var s = $('enm-form-status');
        if (s) s.hidden = true;
    }

    /* ── INIT ───────────────────────────────────────────────────────────────── */

    document.addEventListener('DOMContentLoaded', function () {

        /* Artículo: blur y Enter disparan búsqueda */
        $('enm-art').addEventListener('blur', buscarArticulo);
        $('enm-art').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); buscarArticulo(); }
        });
        $('enm-art').addEventListener('input', function () {
            if (!this.value.trim()) clearArticulo();
            else ocultarStatus();
        });
        $('btn-art-clear').addEventListener('click', clearArticulo);

        /* Ubicación */
        $('enm-ubi').addEventListener('blur', buscarUbicacion);
        $('enm-ubi').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); buscarUbicacion(); }
        });
        $('enm-ubi').addEventListener('input', function () {
            if (!this.value.trim()) clearUbicacionState();
            else ocultarStatus();
        });

        /* Lote */
        $('enm-lot').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); $('enm-cant').focus(); }
        });
        $('enm-lot').addEventListener('input', function () {
            _sinLoteActivo = false;
            $('btn-sin-lote').classList.remove('enm-btn-tag--active');
            clearPill('enm-lot-pill');
            removeInputStates('enm-lot');
            actualizarContadorLote();
            if (this.value.trim().length > 10) {
                this.classList.add('enm-input--invalid');
                showPill('enm-lot-pill', 'err', '✗ Máximo 10 caracteres');
            }
        });

        /* SIN LOTE */
        $('btn-sin-lote').addEventListener('click', setSinLote);

        /* Steppers */
        $('btn-menos').addEventListener('click', function () { stepCant(-1); });
        $('btn-mas').addEventListener('click',   function () { stepCant(1);  });

        /* Cantidad Enter = registrar */
        $('enm-cant').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); registrar(); }
        });
        $('enm-cant').addEventListener('input', function () {
            removeInputStates('enm-cant');
            ocultarStatus();
        });

        /* Botón registrar */
        $('btn-registrar').addEventListener('click', registrar);

        /* Nueva entrada */
        $('btn-nueva-entrada').addEventListener('click', limpiarTodo);

        /* Limpiar (header) */
        $('btn-limpiar').addEventListener('click', limpiarTodo);

        /* F5 */
        document.addEventListener('keydown', function (e) {
            if (e.key === 'F5') { e.preventDefault(); limpiarTodo(); }
        });

        /* Init contador lote y foco */
        actualizarContadorLote();
        $('enm-art').focus();
    });

})();
