"use strict";

(function () {

    /* ── ESTADO ──────────────────────────────────────────────────────────── */

    var _rows      = [];
    var _albaranes = Object.create(null);
    var _selected  = null;
    var _loading   = false;
    var _filters   = {
        buscar : '',
        desde  : '',
        hasta  : '',
        status : 'todos'
    };

    /* ── REFS DOM ────────────────────────────────────────────────────────── */

    var elList        = null;
    var elPanel       = null;
    var elPanelTitle  = null;
    var elPanelEmpty  = null;
    var elPanelMeta   = null;
    var elPanelBody   = null;
    var elPanelClose  = null;
    var elBackdrop    = null;
    var elDesde       = null;
    var elHasta       = null;
    var elBuscar      = null;
    var elStatus      = null;
    var elCntTotal    = null;
    var elCntPend     = null;
    var elCntParcial  = null;
    var elCntPrep     = null;
    var elKpiStrip    = null;

    /* ── FECHAS ──────────────────────────────────────────────────────────── */

    function getDefaultDesde() {
        var d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return d.toISOString().split('T')[0];
    }

    function getDefaultHasta() {
        return new Date().toISOString().split('T')[0];
    }

    function formatFecha(isoStr) {
        if (!isoStr) return '';
        var parts = isoStr.split('-');
        if (parts.length !== 3) return isoStr;
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    function formatFechaHora(isoStr) {
        if (!isoStr) return '';
        var d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        var dd = String(d.getDate()).padStart(2, '0');
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var yy = d.getFullYear();
        var hh = String(d.getHours()).padStart(2, '0');
        var mi = String(d.getMinutes()).padStart(2, '0');
        return dd + '/' + mm + '/' + yy + ' ' + hh + ':' + mi;
    }

    /* ── ESTADO DE LÍNEA ─────────────────────────────────────────────────── */

    function estadoLinea(linea) {
        if (linea.confirmado_sga) return 'confirmada';
        if (linea.picking)        return 'recogida';
        if (linea.stock_ubi === 0 && linea.stock_total === 0) return 'faltante';
        if (linea.stock_ubi < linea.cantidad_pedida)          return 'stock-bajo';
        return 'pendiente';
    }

    var ICONOS = {
        confirmada  : '✓',
        recogida    : '✓',
        pendiente   : '○',
        'stock-bajo': '⚠',
        faltante    : '✗'
    };

    /* ── AGRUPACIÓN POR ALBARÁN ──────────────────────────────────────────── */

    function groupByAlbaran(rows) {
        var map = Object.create(null);
        rows.forEach(function (r) {
            var key = String(r.albaran) + '|' + (r.serie || '');
            if (!map[key]) {
                map[key] = {
                    key            : key,
                    albaran        : r.albaran,
                    serie          : r.serie || '',
                    cliente        : r.cliente || '',
                    nombre_cliente : r.nombre_cliente || '',
                    fecha          : r.fecha || '',
                    lineas         : []
                };
            }
            if (r.articulo) {
                map[key].lineas.push({
                    articulo        : r.articulo,
                    nombre_articulo : r.nombre_articulo || r.articulo,
                    cantidad_pedida : r.cantidad_pedida != null ? Number(r.cantidad_pedida) : 0,
                    ubicacion       : r.ubicacion || '',
                    nom_ubicacion   : r.nom_ubicacion || '',
                    almacen         : r.almacen || '',
                    ubi_etiqueta    : r.ubi_etiqueta || '',
                    lote            : r.lote || '',
                    picking         : r.picking || '',
                    stock_ubi       : r.stock_ubi   != null ? Number(r.stock_ubi)   : 0,
                    stock_total     : r.stock_total != null ? Number(r.stock_total) : 0,
                    confirmado_sga  : !!r.confirmado_sga,
                    fecha_conf_sga  : r.fecha_conf_sga  || null,
                    operario_sga    : r.operario_sga    || '',
                    _albaran        : r.albaran,
                    _serie          : r.serie || ''
                });
            }
        });

        Object.keys(map).forEach(function (k) {
            var alb      = map[k];
            var total    = alb.lineas.length;
            var conPick  = alb.lineas.filter(function (l) {
                return !!l.picking || !!l.confirmado_sga;
            }).length;
            var faltantes = alb.lineas.filter(function (l) {
                return !l.picking && !l.confirmado_sga && l.stock_ubi === 0 && l.stock_total === 0;
            }).length;

            alb.numPicking = conPick
                ? alb.lineas.find(function (l) { return !!l.picking; }).picking
                : null;
            alb.faltantes = faltantes;
            alb.progreso  = {
                total     : total,
                conPicking: conPick,
                faltantes : faltantes,
                pct       : total > 0 ? Math.round(conPick / total * 100) : 0
            };

            if (total === 0 || conPick === 0) alb.status = 'pendiente';
            else if (conPick === total)        alb.status = 'preparado';
            else                               alb.status = 'parcial';
        });

        return map;
    }

    /* ── FILTRO EN MEMORIA ───────────────────────────────────────────────── */

    function filterAlbaranes() {
        var st = _filters.status;
        return Object.values(_albaranes).filter(function (alb) {
            return st === 'todos' || alb.status === st;
        });
    }

    /* ── CARGA DESDE SERVIDOR ────────────────────────────────────────────── */

    var _ultimaFechaDisponible = null;
    var _limitAlcanzado        = false;

    function cargar() {
        if (_loading) return;
        _loading = true;
        setLoading(true);

        SGA.picking.list({
            buscar : _filters.buscar,
            desde  : _filters.desde,
            hasta  : _filters.hasta
        }).then(function (data) {
            _rows      = Array.isArray(data) ? data : [];
            _albaranes = groupByAlbaran(_rows);
            _loading   = false;
            _limitAlcanzado = _rows.length >= 500;
            if (_rows.length > 0) {
                var fechas = _rows.map(function (r) { return r.fecha || ''; })
                    .filter(Boolean).sort();
                _ultimaFechaDisponible = fechas[fechas.length - 1] || null;
            } else {
                _ultimaFechaDisponible = null;
            }
            filterAndRender();
        }).catch(function (err) {
            console.error('[PK] error al cargar picking:', err);
            _loading = false;
            showError('Error al conectar con el servidor. Comprueba la conexión.');
        });
    }

    /* ── RENDER PRINCIPAL ────────────────────────────────────────────────── */

    function filterAndRender() {
        var lista = filterAlbaranes();
        renderList(lista);
        updateCounters();
        updateKpiStrip();
    }

    function _rangoEsCorto() {
        if (!_filters.desde || !_filters.hasta) return false;
        var d = new Date(_filters.desde);
        var h = new Date(_filters.hasta);
        return (h - d) <= 31 * 24 * 60 * 60 * 1000;
    }

    function _formatFechaMes(isoStr) {
        if (!isoStr) return null;
        var m = ['enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre'];
        var parts = isoStr.split('-');
        if (parts.length < 2) return isoStr;
        var mes = parseInt(parts[1], 10) - 1;
        return m[mes] + ' ' + parts[0];
    }

    function renderList(lista) {
        elList.innerHTML = '';
        if (!lista.length) {
            var ph = document.createElement('div');
            ph.className = 'pk-placeholder';
            var icon = document.createElement('span');
            icon.className = 'pk-placeholder-icon';
            icon.textContent = '📋';
            ph.appendChild(icon);

            var msg = ' No hay tareas de picking para los filtros aplicados.';
            if (_rangoEsCorto() && _ultimaFechaDisponible) {
                var mesDisp = _formatFechaMes(_ultimaFechaDisponible);
                msg = ' No hay tareas de picking en este periodo.'
                    + '\nEl último registro disponible es de ' + mesDisp + '.'
                    + '\nPrueba ampliando el rango de fechas.';
            }
            msg.split('\n').forEach(function (linea, i) {
                if (i > 0) ph.appendChild(document.createElement('br'));
                ph.appendChild(document.createTextNode(linea));
            });

            elList.appendChild(ph);
            return;
        }
        if (_limitAlcanzado) {
            var notice = document.createElement('div');
            notice.className = 'pk-limit-notice';
            notice.id = 'pk-limit-notice';
            var icon = document.createElement('span');
            icon.textContent = '⚠';
            notice.appendChild(icon);
            var txt = document.createElement('span');
            txt.textContent = 'Mostrando las primeras 500 líneas. Amplía los filtros de fecha o usa el buscador para acotar resultados.';
            notice.appendChild(txt);
            elList.appendChild(notice);
        }
        lista.forEach(function (alb) {
            elList.appendChild(buildCard(alb));
        });
    }

    /* ── TARJETA OPERATIVA ───────────────────────────────────────────────── */

    function buildCard(alb) {
        var card = document.createElement('div');
        card.className = 'pk-task pk-task--' + alb.status
            + (_selected === alb.key ? ' pk-task--active' : '');
        card.dataset.key = alb.key;

        card.appendChild(buildProgressBar(alb.progreso, alb.status));

        var albNum = document.createElement('div');
        albNum.className = 'pk-task-albaran';
        albNum.textContent = 'ALB ' + alb.albaran;
        card.appendChild(albNum);

        var cliente = document.createElement('div');
        cliente.className = 'pk-task-cliente';
        cliente.textContent = alb.nombre_cliente || alb.cliente || '—';
        card.appendChild(cliente);

        var footer = document.createElement('div');
        footer.className = 'pk-task-footer';

        var p = alb.progreso;
        var progresoTxt = document.createElement('span');
        progresoTxt.textContent = p.conPicking + '/' + p.total
            + ' línea' + (p.total !== 1 ? 's' : '')
            + (p.total > 0 ? ' · ' + p.pct + '%' : '');
        footer.appendChild(progresoTxt);

        if (alb.faltantes > 0) {
            var faltTxt = document.createElement('span');
            faltTxt.className = 'pk-task-faltantes';
            faltTxt.textContent = '⚠ ' + alb.faltantes
                + ' faltante' + (alb.faltantes !== 1 ? 's' : '');
            footer.appendChild(faltTxt);
        }

        card.appendChild(footer);

        card.addEventListener('click', function () {
            selectAlbaran(alb.key);
        });

        return card;
    }

    /* ── BARRA DE PROGRESO ───────────────────────────────────────────────── */

    function buildProgressBar(progreso, status) {
        var wrap = document.createElement('div');
        wrap.className = 'pk-task-progress';
        var fill = document.createElement('div');
        var pct  = progreso.total > 0
            ? Math.round(progreso.conPicking / progreso.total * 100)
            : 0;
        fill.style.width = pct + '%';

        var colorClass = 'pk-task-progress__fill';
        if (status === 'preparado') {
            colorClass += ' pk-task-progress__fill--verde';
        } else if (progreso.faltantes > 0) {
            colorClass += ' pk-task-progress__fill--rojo';
        } else if (status === 'parcial') {
            colorClass += ' pk-task-progress__fill--naranja';
        }
        fill.className = colorClass;
        wrap.appendChild(fill);
        return wrap;
    }

    /* ── BADGE ───────────────────────────────────────────────────────────── */

    function buildBadge(status) {
        var badge = document.createElement('span');
        badge.className = 'pk-badge pk-badge--' + status;
        var labels = { pendiente: 'Pendiente', parcial: 'Parcial', preparado: 'Preparado' };
        badge.textContent = labels[status] || status;
        return badge;
    }

    /* ── SELECCIÓN Y PANEL ───────────────────────────────────────────────── */

    function selectAlbaran(key) {
        _selected = key;
        document.querySelectorAll('.pk-task').forEach(function (c) {
            c.classList.toggle('pk-task--active', c.dataset.key === key);
        });
        renderDetalle(_albaranes[key]);
        openPanel();
    }

    function renderDetalle(alb) {
        elPanelTitle.textContent = 'ALB ' + alb.albaran;

        elPanelMeta.innerHTML = '';

        var mCli = document.createElement('div');
        mCli.className = 'pk-panel-meta-cliente';
        mCli.textContent = alb.nombre_cliente || alb.cliente || '—';
        elPanelMeta.appendChild(mCli);

        elPanelMeta.appendChild(buildProgressBar(alb.progreso, alb.status));

        var p = alb.progreso;
        var mProg = document.createElement('div');
        mProg.className = 'pk-panel-meta-progress';
        var progTxt = p.conPicking + '/' + p.total
            + ' línea' + (p.total !== 1 ? 's' : '')
            + (p.total > 0 ? ' · ' + p.pct + '%' : '');
        if (p.faltantes > 0) {
            progTxt += ' · ⚠ ' + p.faltantes + ' faltante'
                + (p.faltantes !== 1 ? 's' : '');
        }
        mProg.textContent = progTxt;
        elPanelMeta.appendChild(mProg);

        elPanelMeta.hidden = false;

        elPanelBody.innerHTML = '';

        if (!alb.lineas.length) {
            var noLines = document.createElement('div');
            noLines.style.padding = '16px';
            noLines.style.color   = 'var(--sga-text-muted)';
            noLines.style.fontSize = '13px';
            noLines.textContent = 'Sin líneas de artículo registradas.';
            elPanelBody.appendChild(noLines);
        } else {
            /* Orden operativo: faltantes → stock-bajo → pendientes → recogidas
               Dentro de cada grupo, ordenar por ubicación física              */
            var ordenEstado = { faltante: 0, 'stock-bajo': 1, pendiente: 2, recogida: 3, confirmada: 4 };
            var sorted = alb.lineas.slice().sort(function (a, b) {
                var ea = estadoLinea(a), eb = estadoLinea(b);
                var oa = ordenEstado[ea] !== undefined ? ordenEstado[ea] : 99;
                var ob = ordenEstado[eb] !== undefined ? ordenEstado[eb] : 99;
                if (oa !== ob) return oa - ob;
                return (a.ubicacion || '').localeCompare(b.ubicacion || '');
            });
            sorted.forEach(function (linea) {
                elPanelBody.appendChild(buildLineaEl(linea));
            });
        }

        elPanelBody.hidden  = false;
        elPanelEmpty.hidden = true;
    }

    /* ── LÍNEA DE ARTÍCULO ───────────────────────────────────────────────── */

    function buildLineaEl(linea) {
        var estado = estadoLinea(linea);

        var div = document.createElement('div');
        div.className = 'pk-linea pk-linea--' + estado;

        var row = document.createElement('div');
        row.className = 'pk-linea-row';

        var icon = document.createElement('span');
        icon.className = 'pk-linea-icon';
        icon.textContent = ICONOS[estado] || '○';
        row.appendChild(icon);

        var content = document.createElement('div');
        content.className = 'pk-linea-content';

        /* 1 — Ubicación primero: es el dato más importante para el picker */
        if (linea.ubicacion) {
            var ubi = document.createElement('div');
            ubi.className = 'pk-linea-ubi';
            ubi.textContent = '📍 ' + (linea.nom_ubicacion
                ? linea.ubicacion + ' — ' + linea.nom_ubicacion
                : linea.ubicacion);
            content.appendChild(ubi);
        }

        /* 2 — Nombre del artículo (sin código) */
        var art = document.createElement('div');
        art.className = 'pk-linea-art';
        art.textContent = linea.nombre_articulo;
        content.appendChild(art);

        /* 3 — Código del artículo en secundario */
        var cod = document.createElement('div');
        cod.className = 'pk-linea-codigo';
        cod.textContent = linea.articulo;
        content.appendChild(cod);

        /* 4 — Cantidad y lote */
        var dataParts = [];
        if (linea.cantidad_pedida != null) dataParts.push('× ' + linea.cantidad_pedida + ' ud');
        if (linea.lote) dataParts.push('Lote: ' + linea.lote);
        if (dataParts.length) {
            var datos = document.createElement('div');
            datos.className = 'pk-linea-data';
            datos.textContent = dataParts.join(' · ');
            content.appendChild(datos);
        }

        /* 5 — Stock solo cuando hay problema */
        if (linea.stock_ubi < linea.cantidad_pedida) {
            var stockClass = 'pk-linea-stock';
            stockClass += linea.stock_ubi === 0
                ? ' pk-linea-stock--cero'
                : ' pk-linea-stock--bajo';
            var stockEl = document.createElement('div');
            stockEl.className = stockClass;
            var stockParts = ['Ubi: ' + linea.stock_ubi + ' ud'];
            if (linea.stock_total !== linea.stock_ubi) {
                stockParts.push('Total: ' + linea.stock_total + ' ud');
            }
            stockEl.textContent = stockParts.join(' · ');
            content.appendChild(stockEl);
        }

        /* 6 — Guía operativa en faltante */
        if (estado === 'faltante') {
            var hint = document.createElement('div');
            hint.className = 'pk-linea-hint';
            hint.textContent = 'Sin stock en ubicación. Consultar con responsable.';
            content.appendChild(hint);
        }

        /* 7 — Trazabilidad en confirmada */
        if (estado === 'confirmada') {
            var confParts = [];
            if (linea.operario_sga) confParts.push('por ' + linea.operario_sga);
            if (linea.fecha_conf_sga) confParts.push(formatFechaHora(linea.fecha_conf_sga));
            if (confParts.length) {
                var confEl = document.createElement('div');
                confEl.className = 'pk-linea-conf-info';
                confEl.textContent = '✓ Confirmada ' + confParts.join(' · ');
                content.appendChild(confEl);
            }
        }

        row.appendChild(content);
        div.appendChild(row);
        div.appendChild(buildAcciones(linea));
        return div;
    }

    function buildAcciones(linea) {
        var wrap   = document.createElement('div');
        wrap.className = 'pk-linea-actions';

        var estado = estadoLinea(linea);
        if (estado === 'confirmada') {
            var btnDes = document.createElement('button');
            btnDes.className = 'pk-linea-link pk-linea-link--desconfirmar';
            btnDes.textContent = '↩ Deshacer';
            btnDes.addEventListener('click', function (e) {
                e.stopPropagation();
                desconfirmarLinea(linea, btnDes);
            });
            wrap.appendChild(btnDes);
        } else if (estado === 'pendiente' || estado === 'stock-bajo') {
            var btnConf = document.createElement('button');
            btnConf.className = 'pk-linea-link pk-linea-link--confirmar';
            btnConf.textContent = '✓ Confirmar';
            btnConf.addEventListener('click', function (e) {
                e.stopPropagation();
                confirmarLinea(linea, btnConf);
            });
            wrap.appendChild(btnConf);
        }

        var aMov = document.createElement('a');
        aMov.className = 'pk-linea-link';
        aMov.textContent = '→ Movimientos';
        aMov.href = '../../almacen-y-stock/movimientos-por-articulo/index.html?articulo='
            + encodeURIComponent(linea.articulo);
        wrap.appendChild(aMov);

        var aStock = document.createElement('a');
        aStock.className = 'pk-linea-link';
        aStock.textContent = '→ Stock';
        aStock.href = '../../almacen-y-stock/consulta-de-stock/index.html?articulo='
            + encodeURIComponent(linea.articulo);
        wrap.appendChild(aStock);

        return wrap;
    }

    /* ── CONFIRMACIÓN DE LÍNEA ───────────────────────────────────────────────── */

    function recalcProgreso(alb) {
        var total    = alb.lineas.length;
        var conPick  = alb.lineas.filter(function (l) {
            return !!l.picking || !!l.confirmado_sga;
        }).length;
        var faltantes = alb.lineas.filter(function (l) {
            return !l.picking && !l.confirmado_sga
                && l.stock_ubi === 0 && l.stock_total === 0;
        }).length;
        alb.faltantes = faltantes;
        alb.progreso  = {
            total     : total,
            conPicking: conPick,
            faltantes : faltantes,
            pct       : total > 0 ? Math.round(conPick / total * 100) : 0
        };
        if (total === 0 || conPick === 0) alb.status = 'pendiente';
        else if (conPick === total)        alb.status = 'preparado';
        else                               alb.status = 'parcial';
    }

    function updateCard(key) {
        var alb  = _albaranes[key];
        var card = document.querySelector('.pk-task[data-key="' + key + '"]');
        if (!card) return;
        var newCard = buildCard(alb);
        card.parentNode.replaceChild(newCard, card);
    }

    function _actualizarTrasConfirm(linea) {
        var lineaKey = String(linea._albaran) + '|' + linea._serie;
        var alb      = _albaranes[lineaKey];
        if (!alb) return;
        recalcProgreso(alb);
        updateCard(lineaKey);
        updateCounters();
        updateKpiStrip();
        if (_selected === lineaKey) renderDetalle(alb);
    }

    function confirmarLinea(linea, btn) {
        btn.disabled    = true;
        btn.textContent = '…';
        SGA.picking.confirmar({
            albaran  : linea._albaran,
            serie    : linea._serie,
            articulo : linea.articulo,
            ubicacion: linea.ubicacion,
            lote     : linea.lote || null
        }).then(function () {
            linea.confirmado_sga = true;
            _actualizarTrasConfirm(linea);
        }).catch(function (err) {
            console.error('[PK] error al confirmar:', err);
            btn.textContent = '⚠ Error';
            setTimeout(function () {
                if (!linea.confirmado_sga) {
                    btn.disabled    = false;
                    btn.textContent = '✓ Confirmar';
                }
            }, 2000);
        });
    }

    function desconfirmarLinea(linea, btn) {
        btn.disabled    = true;
        btn.textContent = '…';
        SGA.picking.desconfirmar({
            albaran  : linea._albaran,
            serie    : linea._serie,
            articulo : linea.articulo,
            ubicacion: linea.ubicacion,
            lote     : linea.lote || null
        }).then(function () {
            linea.confirmado_sga = false;
            _actualizarTrasConfirm(linea);
        }).catch(function (err) {
            console.error('[PK] error al desconfirmar:', err);
            btn.textContent = '⚠ Error';
            setTimeout(function () {
                if (linea.confirmado_sga) {
                    btn.disabled    = false;
                    btn.textContent = '↩ Deshacer';
                }
            }, 2000);
        });
    }

    /* ── KPI STRIP (líneas) ──────────────────────────────────────────────── */

    function updateKpiStrip() {
        if (!elKpiStrip) return;
        elKpiStrip.innerHTML = '';

        var todasLineas = [];
        Object.values(_albaranes).forEach(function (alb) {
            alb.lineas.forEach(function (l) { todasLineas.push(l); });
        });

        var total      = todasLineas.length;
        elKpiStrip.hidden = false;
        if (total === 0) {
            elKpiStrip.innerHTML = '';
            var g0 = document.createElement('span');
            g0.className = 'pk-kpi-grp';
            var v0 = document.createElement('span');
            v0.className = 'pk-kpi-val';
            v0.textContent = '0%';
            g0.appendChild(v0);
            g0.appendChild(document.createTextNode(' preparado'));
            elKpiStrip.appendChild(g0);

            var s0a = document.createElement('span');
            s0a.className = 'pk-kpi-sep';
            s0a.textContent = '·';
            elKpiStrip.appendChild(s0a);

            var g0b = document.createElement('span');
            g0b.className = 'pk-kpi-grp';
            var v0b = document.createElement('span');
            v0b.className = 'pk-kpi-val';
            v0b.textContent = '0 / 0';
            g0b.appendChild(v0b);
            g0b.appendChild(document.createTextNode(' líneas'));
            elKpiStrip.appendChild(g0b);

            var s0b = document.createElement('span');
            s0b.className = 'pk-kpi-sep';
            s0b.textContent = '·';
            elKpiStrip.appendChild(s0b);

            var g0c = document.createElement('span');
            g0c.className = 'pk-kpi-grp';
            g0c.appendChild(document.createTextNode('Sin tareas en este periodo'));
            elKpiStrip.appendChild(g0c);
            return;
        }

        var preparadas = todasLineas.filter(function (l) {
            return !!l.picking || !!l.confirmado_sga;
        }).length;
        var faltantes  = todasLineas.filter(function (l) {
            return !l.picking && !l.confirmado_sga
                && l.stock_ubi === 0 && l.stock_total === 0;
        }).length;
        var pct = Math.round(preparadas / total * 100);
        var pctClass = pct >= 80 ? 'pk-kpi-val--verde'
                     : pct >= 40 ? 'pk-kpi-val--ambar'
                     :             'pk-kpi-val--rojo';

        /* % global */
        var g1 = document.createElement('span');
        g1.className = 'pk-kpi-grp';
        var v1 = document.createElement('span');
        v1.className = 'pk-kpi-val ' + pctClass;
        v1.textContent = pct + '%';
        g1.appendChild(v1);
        g1.appendChild(document.createTextNode(' preparado'));
        elKpiStrip.appendChild(g1);

        var s1 = document.createElement('span');
        s1.className = 'pk-kpi-sep';
        s1.textContent = '·';
        elKpiStrip.appendChild(s1);

        /* N/M líneas */
        var g2 = document.createElement('span');
        g2.className = 'pk-kpi-grp';
        var v2 = document.createElement('span');
        v2.className = 'pk-kpi-val';
        v2.textContent = preparadas + ' / ' + total;
        g2.appendChild(v2);
        g2.appendChild(document.createTextNode(' líneas'));
        elKpiStrip.appendChild(g2);

        /* faltantes (solo si hay) */
        if (faltantes > 0) {
            var s2 = document.createElement('span');
            s2.className = 'pk-kpi-sep';
            s2.textContent = '·';
            elKpiStrip.appendChild(s2);

            var g3 = document.createElement('span');
            g3.className = 'pk-kpi-grp';
            var v3 = document.createElement('span');
            v3.className = 'pk-kpi-val pk-kpi-val--rojo';
            v3.textContent = '⚠ ' + faltantes;
            g3.appendChild(v3);
            g3.appendChild(document.createTextNode(' faltante' + (faltantes !== 1 ? 's' : '')));
            elKpiStrip.appendChild(g3);
        }
    }

    /* ── CONTADORES ──────────────────────────────────────────────────────── */

    function updateCounters() {
        var vals    = Object.values(_albaranes);
        var total   = vals.length;
        var pend    = vals.filter(function (a) { return a.status === 'pendiente'; }).length;
        var parcial = vals.filter(function (a) { return a.status === 'parcial';   }).length;
        var prep    = vals.filter(function (a) { return a.status === 'preparado'; }).length;

        elCntTotal.textContent   = total;
        elCntPend.textContent    = pend;
        elCntParcial.textContent = parcial;
        elCntPrep.textContent    = prep;
    }

    /* ── PANEL OPEN / CLOSE ──────────────────────────────────────────────── */

    function openPanel() {
        elPanel.classList.add('pk-panel--open');
        elBackdrop.classList.add('pk-panel-backdrop--active');
    }

    function closePanel() {
        elPanel.classList.remove('pk-panel--open');
        elBackdrop.classList.remove('pk-panel-backdrop--active');
        _selected = null;
        document.querySelectorAll('.pk-task--active').forEach(function (c) {
            c.classList.remove('pk-task--active');
        });
        elPanelMeta.hidden  = true;
        elPanelBody.hidden  = true;
        elPanelEmpty.hidden = false;
        elPanelTitle.textContent = 'Detalle';
    }

    /* ── BOTONES RÁPIDOS DE FECHA ────────────────────────────────────────── */

    function setQuickDate(days) {
        var hasta = getDefaultHasta();
        var desde;
        if (days === 0) {
            desde = hasta;
        } else {
            var d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            desde = d.toISOString().split('T')[0];
        }
        elDesde.value  = desde;
        elHasta.value  = hasta;
        _filters.desde = desde;
        _filters.hasta = hasta;

        document.querySelectorAll('.pk-quick-btn').forEach(function (btn) {
            btn.classList.toggle(
                'pk-quick-btn--active',
                parseInt(btn.dataset.days, 10) === days
            );
        });

        cargar();
    }

    /* ── LOADING / ERROR ─────────────────────────────────────────────────── */

    function setLoading(on) {
        elList.innerHTML = '';
        if (on) {
            var ph = document.createElement('div');
            ph.className = 'pk-loading';
            var sp = document.createElement('span');
            sp.className = 'pk-spinner';
            sp.setAttribute('aria-hidden', 'true');
            ph.appendChild(sp);
            ph.appendChild(document.createTextNode('Cargando tareas de picking…'));
            elList.appendChild(ph);
        }
    }

    function showError(msg) {
        elList.innerHTML = '';
        var ph = document.createElement('div');
        ph.className = 'pk-placeholder';
        ph.textContent = msg;
        elList.appendChild(ph);
        elCntTotal.textContent   = '—';
        elCntPend.textContent    = '—';
        elCntParcial.textContent = '—';
        elCntPrep.textContent    = '—';
        if (elKpiStrip) { elKpiStrip.innerHTML = ''; elKpiStrip.hidden = true; }
    }

    /* ── DEBOUNCE ────────────────────────────────────────────────────────── */

    function debounce(fn, ms) {
        var timer;
        return function () {
            clearTimeout(timer);
            timer = setTimeout(fn, ms);
        };
    }

    /* ── INIT ────────────────────────────────────────────────────────────── */

    function initFiltros() {
        _filters.desde = getDefaultDesde();
        _filters.hasta = getDefaultHasta();
        elDesde.value  = _filters.desde;
        elHasta.value  = _filters.hasta;
    }

    function wireEvents() {
        elDesde.addEventListener('change', function () {
            _filters.desde = elDesde.value;
            cargar();
        });

        elHasta.addEventListener('change', function () {
            _filters.hasta = elHasta.value;
            cargar();
        });

        elBuscar.addEventListener('input', debounce(function () {
            _filters.buscar = elBuscar.value.trim();
            cargar();
        }, 300));

        elStatus.addEventListener('change', function () {
            _filters.status = elStatus.value;
            filterAndRender();
        });

        document.querySelectorAll('.pk-quick-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                setQuickDate(parseInt(btn.dataset.days, 10));
            });
        });

        elPanelClose.addEventListener('click', closePanel);
        elBackdrop.addEventListener('click', closePanel);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closePanel();
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        elList        = document.getElementById('pk-list');
        elPanel       = document.getElementById('pk-panel');
        elPanelTitle  = document.getElementById('pk-panel-title');
        elPanelEmpty  = document.getElementById('pk-panel-empty');
        elPanelMeta   = document.getElementById('pk-panel-meta');
        elPanelBody   = document.getElementById('pk-panel-body');
        elPanelClose  = document.getElementById('pk-panel-close');
        elBackdrop    = document.getElementById('pk-panel-backdrop');
        elDesde       = document.getElementById('pk-f-desde');
        elHasta       = document.getElementById('pk-f-hasta');
        elBuscar      = document.getElementById('pk-f-buscar');
        elStatus      = document.getElementById('pk-f-status');
        elCntTotal    = document.getElementById('pk-cnt-total');
        elCntPend     = document.getElementById('pk-cnt-pend');
        elCntParcial  = document.getElementById('pk-cnt-parcial');
        elCntPrep     = document.getElementById('pk-cnt-prep');
        elKpiStrip    = document.getElementById('pk-kpi-strip');

        initFiltros();
        wireEvents();
        cargar();
    });

})();
