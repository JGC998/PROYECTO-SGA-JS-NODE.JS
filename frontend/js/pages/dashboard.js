"use strict";

(function () {

    // ── HELPERS ───────────────────────────────────────────────────────────────

    function fmt(n) {
        return Number(n ?? 0).toLocaleString('es-ES');
    }

    function dash(v) {
        return v != null ? String(v) : '—';
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function setLoading(id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="db-loading">Cargando…</div>';
    }

    function setError(id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="db-error">No se pudo cargar la información.</div>';
    }

    function setEmpty(id, msg) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="db-empty">' + (msg || 'Sin datos.') + '</div>';
    }

    // ── KPIs ──────────────────────────────────────────────────────────────────

    function renderKpis(kpis) {
        setText('db-v-articulos',        fmt(kpis.articulos));
        setText('db-v-lineas',           fmt(kpis.lineas_stock));
        setText('db-v-lineas-sub',       fmt(kpis.unidades_stock) + ' unidades en stock');
        setText('db-v-ocupacion',        (kpis.ocupacion_porcentaje || 0).toFixed(0) + '%');
        setText('db-v-ocupacion-sub',    fmt(kpis.ubicaciones_ocupadas) + ' de ' + fmt(kpis.ubicaciones) + ' ubicaciones');
        setText('db-v-movimientos',      fmt(kpis.movimientos_periodo));
        setText('db-v-movimientos-sub',  fmt(kpis.unidades_movidas_periodo) + ' unidades movidas');
    }

    // ── ALERTAS ───────────────────────────────────────────────────────────────

    function applyAlertClass(id, level) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('db-kpi--danger', 'db-kpi--warn', 'db-kpi--zero');
        el.classList.add('db-kpi--' + level);
    }

    function renderAlertas(kpis, alertasData) {
        var bajo = kpis.stock_bajo || 0;
        var neg  = (alertasData.stock_negativo || []).length;
        var sin  = kpis.sin_movimiento_90_dias || 0;

        setText('db-v-stockbajo', fmt(bajo));
        setText('db-v-stockneg',  fmt(neg));
        setText('db-v-sinmovto',  fmt(sin));

        applyAlertClass('db-card-stockbajo', bajo > 0 ? 'danger' : 'zero');
        applyAlertClass('db-card-stockneg',  neg  > 0 ? 'danger' : 'zero');
        applyAlertClass('db-card-sinmovto',  sin  > 0 ? 'warn'   : 'zero');
    }

    // ── ACTIVIDAD RECIENTE ────────────────────────────────────────────────────

    function buildActivityItem(r) {
        var li = document.createElement('li');
        li.className = 'db-activity-item';

        var time = document.createElement('span');
        time.className = 'db-act-time';
        time.textContent = (r.fecha || '').slice(5) + '\n' + (r.hora || '').slice(0, 5);

        var desc = document.createElement('span');
        desc.className = 'db-act-desc';
        var strong = document.createElement('strong');
        strong.textContent = r.tipo || '—';
        var rest = ' · ' + ([r.articulo, r.nombre].filter(Boolean).join(' ') || '—');
        desc.append(strong, document.createTextNode(rest));

        var qty = document.createElement('span');
        qty.className = 'db-act-qty' + (r.cantidad > 0 ? ' qty--pos' : r.cantidad < 0 ? ' qty--neg' : '');
        qty.textContent = (r.cantidad > 0 ? '+' : '') + fmt(r.cantidad);

        li.append(time, desc, qty);
        return li;
    }

    function renderActividad(movimientos) {
        if (!movimientos || !movimientos.length) {
            setEmpty('db-actividad', 'Sin actividad reciente.');
            return;
        }

        var ul = document.createElement('ul');
        ul.className = 'db-activity-list';
        movimientos.forEach(function (r) { ul.appendChild(buildActivityItem(r)); });

        var el = document.getElementById('db-actividad');
        if (el) { el.innerHTML = ''; el.appendChild(ul); }
    }

    // ── SPARKLINE ─────────────────────────────────────────────────────────────

    function renderSparkline(containerId, data, keyX, keyY) {
        var el = document.getElementById(containerId);
        if (!el) return;
        if (!data || !data.length) { el.innerHTML = '<div class="db-empty">Sin datos</div>'; return; }

        var max = Math.max.apply(null, data.map(function (r) { return r[keyY] || 0; })) || 1;

        var barsDiv = document.createElement('div');
        barsDiv.className = 'db-sparkline';
        data.forEach(function (r) {
            var h = Math.max(Math.round(((r[keyY] || 0) / max) * 100), 3);
            var bar = document.createElement('div');
            bar.className = 'db-spark-bar';
            bar.style.height = h + '%';
            bar.title = dash(r[keyX]) + ': ' + fmt(r[keyY] || 0);
            barsDiv.appendChild(bar);
        });

        var labelsDiv = document.createElement('div');
        labelsDiv.className = 'db-sparkline-labels';
        var spanL = document.createElement('span');
        spanL.textContent = data[0] ? String(data[0][keyX]).slice(5) : '';
        var spanR = document.createElement('span');
        spanR.textContent = data[data.length - 1] ? String(data[data.length - 1][keyX]).slice(5) : '';
        labelsDiv.append(spanL, spanR);

        el.innerHTML = '';
        el.append(barsDiv, labelsDiv);
    }

    // ── BARRAS HORIZONTALES ────────────────────────────────────────────────────

    function renderBarList(containerId, data, keyName, keyVal) {
        var el = document.getElementById(containerId);
        if (!el) return;
        if (!data || !data.length) { el.innerHTML = '<div class="db-empty db-bar-list">Sin datos</div>'; return; }

        var max = Math.max.apply(null, data.map(function (r) { return r[keyVal] || 0; })) || 1;
        var ul = document.createElement('ul');
        ul.className = 'db-bar-list';

        data.forEach(function (r) {
            var w = Math.round(((r[keyVal] || 0) / max) * 100);
            var li = document.createElement('li');
            li.className = 'db-bar-item';

            var name = document.createElement('span');
            name.className = 'db-bar-name';
            name.textContent = dash(r[keyName]);

            var count = document.createElement('span');
            count.className = 'db-bar-count';
            count.textContent = fmt(r[keyVal] || 0);

            var track = document.createElement('div');
            track.className = 'db-bar-track';
            var fill = document.createElement('div');
            fill.className = 'db-bar-fill';
            fill.style.width = w + '%';
            track.appendChild(fill);

            li.append(name, count, track);
            ul.appendChild(li);
        });

        el.innerHTML = '';
        el.appendChild(ul);
    }

    // ── TABLA ALERTAS STOCK ────────────────────────────────────────────────────

    function renderAlertasStock(data) {
        var el = document.getElementById('db-alertas-stock');
        if (!el) return;
        if (!data || !data.length) { el.innerHTML = '<div class="db-empty">Sin alertas activas</div>'; return; }

        var table = document.createElement('table');
        table.className = 'db-mini-table';

        var thead = document.createElement('thead');
        var htr = document.createElement('tr');
        ['Artículo', 'Nombre', 'Stock', 'Mín.'].forEach(function (t, i) {
            var th = document.createElement('th');
            th.textContent = t;
            if (i >= 2) th.className = 'td-num';
            htr.appendChild(th);
        });
        thead.appendChild(htr);
        table.appendChild(thead);

        var tbody = document.createElement('tbody');
        data.forEach(function (r) {
            var tr = document.createElement('tr');
            var cls = (r.stock_actual <= 0) ? 'td-danger' : 'td-warn';

            var tdArt = document.createElement('td');
            tdArt.textContent = dash(r.articulo);

            var tdNom = document.createElement('td');
            tdNom.textContent = dash(r.nombre);

            var tdStock = document.createElement('td');
            tdStock.className = 'td-num ' + cls;
            tdStock.textContent = fmt(r.stock_actual);

            var tdMin = document.createElement('td');
            tdMin.className = 'td-num';
            tdMin.textContent = fmt(r.stock_minimo);

            tr.append(tdArt, tdNom, tdStock, tdMin);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        el.innerHTML = '';
        el.appendChild(table);
    }

    // ── TABLA TOP ARTÍCULOS ────────────────────────────────────────────────────

    function renderTopArticulos(data) {
        var el = document.getElementById('db-top-articulos');
        if (!el) return;
        if (!data || !data.length) { el.innerHTML = '<div class="db-empty">Sin datos</div>'; return; }

        var table = document.createElement('table');
        table.className = 'db-mini-table';

        var thead = document.createElement('thead');
        var htr = document.createElement('tr');
        [['#', ''], ['Artículo', ''], ['Unidades', 'td-num']].forEach(function (pair) {
            var th = document.createElement('th');
            th.textContent = pair[0];
            if (pair[1]) th.className = pair[1];
            htr.appendChild(th);
        });
        thead.appendChild(htr);
        table.appendChild(thead);

        var tbody = document.createElement('tbody');
        data.slice(0, 10).forEach(function (r, i) {
            var tr = document.createElement('tr');

            var tdN = document.createElement('td');
            tdN.textContent = i + 1;

            var tdArt = document.createElement('td');
            tdArt.textContent = dash(r.articulo);
            tdArt.title = dash(r.nombre);

            var tdUd = document.createElement('td');
            tdUd.className = 'td-num';
            tdUd.textContent = fmt(r.unidades);

            tr.append(tdN, tdArt, tdUd);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        el.innerHTML = '';
        el.appendChild(table);
    }

    // ── CARGA ─────────────────────────────────────────────────────────────────

    function loadDashboard(desde, hasta) {
        ['db-actividad', 'db-sparkline-wrap', 'db-alertas-stock',
         'db-top-articulos', 'db-stock-almacen'].forEach(setLoading);

        Promise.all([
            SGA.dashboard.get(desde, hasta),
            SGA.dashboard.alertas()
        ]).then(function (results) {
            var dash    = results[0];
            var alertas = results[1];
            var graficos = dash.graficos || {};

            renderKpis(dash.kpis);
            renderAlertas(dash.kpis, alertas);
            renderActividad(dash.movimientos_recientes);
            renderSparkline('db-sparkline-wrap', graficos.movimientos_por_dia, 'fecha', 'movimientos');
            renderBarList('db-stock-almacen', graficos.stock_por_almacen, 'nombre_almacen', 'unidades');
            renderTopArticulos(graficos.top_articulos);
            renderAlertasStock(alertas.stock_bajo);
        }).catch(function (err) {
            console.error('[dashboard]', err);
            ['db-actividad', 'db-sparkline-wrap', 'db-alertas-stock',
             'db-top-articulos', 'db-stock-almacen'].forEach(setError);
        });
    }

    // ── INIT ──────────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', function () {
        var hoy    = new Date();
        var hace30 = new Date(hoy);
        hace30.setDate(hace30.getDate() - 30);
        var iso = function (d) { return d.toISOString().slice(0, 10); };

        var inpDesde = document.getElementById('db-desde');
        var inpHasta = document.getElementById('db-hasta');
        if (inpDesde) inpDesde.value = iso(hace30);
        if (inpHasta) inpHasta.value = iso(hoy);

        loadDashboard(iso(hace30), iso(hoy));

        var btn = document.getElementById('db-btn-actualizar');
        if (btn) {
            btn.addEventListener('click', function () {
                loadDashboard(
                    inpDesde ? inpDesde.value : iso(hace30),
                    inpHasta ? inpHasta.value : iso(hoy)
                );
            });
        }
    });

})();
