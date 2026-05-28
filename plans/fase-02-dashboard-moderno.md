# FASE 2 — Dashboard Moderno del SGA LIN

## Estado inicial revisado

### Archivos afectados
- `frontend/index.html` — página del dashboard (reescribir)
- `frontend/css/pages/dashboard.css` — estilos del dashboard (reescribir)
- `frontend/js/api.js` — añadir métodos correctos para dashboard/alertas
- `frontend/js/pages/dashboard.js` — nuevo archivo de lógica del dashboard

### Archivos que NO tocar
- Todo el backend (routes, services, db, tests)
- `frontend/js/ui/sidebar.js`
- `frontend/js/ui/layout.js`
- `frontend/js/api.js` — solo añadir métodos al objeto SGA, sin eliminar nada
- Cualquier otra página HTML/CSS distinta de `frontend/index.html`

---

## 1. Diagnóstico del dashboard actual

### Problemas UX identificados
1. **Sin jerarquía de urgencia** — los 6 KPIs tienen el mismo peso visual; un artículo con stock negativo pesa igual que el contador de proveedores
2. **Alertas invisibles** — el backend expone `/estadisticas/alertas` con stock_bajo/stock_negativo/sin_movimiento_90_dias; el dashboard actual los ignora completamente
3. **api.js desalineado** — `SGA.estadisticas.*` apunta a rutas legacy (`/estadisticas/resumen`, `/estadisticas/movimientos-por-dia`) que no existen en el backend; el backend real expone `/estadisticas/dashboard` y `/estadisticas/alertas`
4. **Sin actividad reciente** — el backend devuelve los últimos 12 movimientos en `movimientos_recientes`; no se muestran
5. **Cards de sección sin datos** — son listas de enlaces estáticas, sin contexto operativo
6. **Sin selector de periodo** — el endpoint `/estadisticas/dashboard` acepta `?desde=&hasta=` pero el dashboard no lo ofrece
7. **dashboard.css sin estructura de widgets** — el CSS actual solo define `.sections-grid`, `.section-card` y `.kpi-grid`; no hay estilos para alertas, actividad, barras de progreso, ni sparklines

### API disponible en el backend (confirmado en analytics.service.js)

| Endpoint | Método en api.js nuevo | Datos clave |
|---|---|---|
| `GET /estadisticas/dashboard?desde=&hasta=` | `SGA.dashboard.get(desde, hasta)` | kpis completos + gráficos + movimientos_recientes |
| `GET /estadisticas/alertas` | `SGA.dashboard.alertas()` | stock_bajo (25), stock_negativo (25), sin_movimiento_90_dias (25) |
| `GET /analitica/log?desde=&hasta=` | `SGA.dashboard.log(desde, hasta)` | actividad_por_usuario, actividad_por_dia |
| `GET /contadores` | ya existe como `SGA.contadores.get()` | articulos, proveedores, clientes, etc. |

---

## 2. Estructura visual nueva

### Jerarquía de zonas (de arriba a abajo)

```
┌──────────────────────────────────────────────────────────────────┐
│ ZONA A — KPIs operativos principales (fila de 4)                 │
│  [Artículos activos]  [Líneas stock]  [% Ocupación]  [Mov. hoy] │
├──────────────────────────────────────────────────────────────────┤
│ ZONA B — KPIs de alerta (fila de 3, fondo coloreado)            │
│  [🔴 Stock bajo]  [⚠️ Sin movimiento 90d]  [🔴 Stock negativo] │
├──────────────────────────────────────────────────────────────────┤
│ ZONA C — Actividad (2 columnas)                                  │
│  [Movimientos últimos 30d — barras CSS]  [Actividad reciente]    │
├──────────────────────────────────────────────────────────────────┤
│ ZONA D — Tablas operativas (2 columnas)                          │
│  [Top 10 artículos movidos]  [Alertas stock bajo — top 10]       │
├──────────────────────────────────────────────────────────────────┤
│ ZONA E — Stock por almacén (barras horizontales CSS)             │
├──────────────────────────────────────────────────────────────────┤
│ ZONA F — Accesos rápidos (compactos, sin datos dinámicos)        │
└──────────────────────────────────────────────────────────────────┘
```

### Principios visuales
- **Sin librerías de gráficos** — todo CSS puro (barras de altura variable, barras horizontales, progress bars)
- **Paleta de alertas**: rojo `#dc2626` = crítico, naranja `#d97706` = advertencia, verde `#16a34a` = OK
- **Sparklines de barras**: `display: flex; align-items: flex-end; gap: 2px` + barras con `height` inline en `%`
- **Cards con borde izquierdo de color** para alertas (mismo patrón que badges.css)
- **Texto siempre legible** con números grandes (2rem) para KPIs principales, medianos (1.25rem) para secundarios

---

## 3. Tareas de implementación

### TAREA 1 — Añadir endpoints de dashboard a api.js
**Archivo:** `frontend/js/api.js`

Añadir al objeto `SGA` los siguientes métodos (después de `contadores`):

```js
dashboard: {
    get:     (desde, hasta) => _get('/estadisticas/dashboard?' + new URLSearchParams(
                                    Object.fromEntries(
                                        [['desde', desde], ['hasta', hasta]].filter(([,v]) => v)
                                    ))),
    alertas: ()             => _get('/estadisticas/alertas'),
    log:     (desde, hasta) => _get('/analitica/log?' + new URLSearchParams(
                                    Object.fromEntries(
                                        [['desde', desde], ['hasta', hasta]].filter(([,v]) => v)
                                    ))),
},
```

**Verificación:** Abrir DevTools → Network → llamar `SGA.dashboard.alertas()` desde consola. Debe devolver `{stock_bajo: [...], stock_negativo: [...], sin_movimiento_90_dias: [...]}`.

---

### TAREA 2 — Reescribir dashboard.css
**Archivo:** `frontend/css/pages/dashboard.css`

Reemplazar el contenido completo. Debe incluir:

#### 2a. Layout interno
```css
.db-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 24px 28px 32px;
    display: flex;
    flex-direction: column;
    gap: 24px;
}
```

#### 2b. Fila de KPIs (zona A y B)
```css
/* Zona A: 4 KPIs principales */
.db-kpi-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
}

/* Zona B: 3 KPIs de alerta */
.db-alert-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
}

.db-kpi {
    background: var(--sga-surface);
    border-radius: var(--sga-radius);
    padding: 20px 22px;
    box-shadow: var(--sga-shadow);
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: relative;
    overflow: hidden;
}

.db-kpi-label {
    font-size: .75rem;
    font-weight: 600;
    color: var(--sga-text-muted);
    text-transform: uppercase;
    letter-spacing: .05em;
}

.db-kpi-value {
    font-size: 2rem;
    font-weight: 800;
    color: var(--sga-text);
    line-height: 1;
}

.db-kpi-sub {
    font-size: .8rem;
    color: var(--sga-text-muted);
}

/* Variantes de alerta */
.db-kpi.db-kpi--danger  { border-left: 4px solid #dc2626; }
.db-kpi.db-kpi--warn    { border-left: 4px solid #d97706; }
.db-kpi.db-kpi--ok      { border-left: 4px solid #16a34a; }

.db-kpi--danger .db-kpi-value { color: #dc2626; }
.db-kpi--warn   .db-kpi-value { color: #d97706; }
.db-kpi--ok     .db-kpi-value { color: #16a34a; }

/* Icono de fondo decorativo */
.db-kpi-icon {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 2.5rem;
    opacity: .08;
    pointer-events: none;
}
```

#### 2c. Zona C — Actividad (2 columnas)
```css
.db-row-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

.db-widget {
    background: var(--sga-surface);
    border-radius: var(--sga-radius);
    box-shadow: var(--sga-shadow);
    overflow: hidden;
}

.db-widget-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px 12px;
    border-bottom: 1px solid var(--sga-border);
}

.db-widget-title {
    font-size: .85rem;
    font-weight: 700;
    color: var(--sga-primary);
    text-transform: uppercase;
    letter-spacing: .04em;
}

.db-widget-body {
    padding: 16px 18px;
}
```

#### 2d. Sparkline de barras CSS
```css
.db-sparkline {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 72px;
    padding-top: 4px;
}

.db-spark-bar {
    flex: 1;
    background: var(--sga-accent);
    border-radius: 2px 2px 0 0;
    min-height: 3px;
    opacity: .7;
    transition: opacity .15s;
}

.db-spark-bar:hover {
    opacity: 1;
    background: var(--sga-primary-light);
}

.db-sparkline-labels {
    display: flex;
    justify-content: space-between;
    font-size: .65rem;
    color: var(--sga-text-muted);
    margin-top: 4px;
}
```

#### 2e. Tabla de actividad reciente
```css
.db-activity-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.db-activity-item {
    display: grid;
    grid-template-columns: 52px 1fr auto;
    gap: 8px 12px;
    align-items: start;
    padding: 10px 0;
    border-bottom: 1px solid var(--sga-border);
    font-size: .8rem;
}

.db-activity-item:last-child { border-bottom: none; }

.db-activity-time {
    color: var(--sga-text-muted);
    font-size: .72rem;
    line-height: 1.4;
}

.db-activity-desc {
    color: var(--sga-text);
    font-weight: 500;
    line-height: 1.4;
}

.db-activity-meta {
    font-size: .72rem;
    color: var(--sga-text-muted);
    text-align: right;
    white-space: nowrap;
}
```

#### 2f. Barras de stock por almacén
```css
.db-bar-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0;
    list-style: none;
}

.db-bar-item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px;
    font-size: .8rem;
}

.db-bar-name { color: var(--sga-text); font-weight: 500; }

.db-bar-count {
    font-size: .75rem;
    font-weight: 700;
    color: var(--sga-primary);
}

.db-bar-track {
    grid-column: 1 / -1;
    height: 6px;
    background: var(--sga-border);
    border-radius: 3px;
    overflow: hidden;
}

.db-bar-fill {
    height: 100%;
    background: var(--sga-accent);
    border-radius: 3px;
    transition: width .4s ease;
}
```

#### 2g. Tabla interna de widget
```css
.db-mini-table {
    width: 100%;
    border-collapse: collapse;
    font-size: .8rem;
}

.db-mini-table th {
    text-align: left;
    padding: 6px 8px;
    font-size: .7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--sga-text-muted);
    border-bottom: 1px solid var(--sga-border);
}

.db-mini-table td {
    padding: 7px 8px;
    border-bottom: 1px solid #f1f5f9;
    color: var(--sga-text);
}

.db-mini-table tr:last-child td { border-bottom: none; }

.db-mini-table tr:hover td { background: #f8fafc; }

.db-mini-table .td-num {
    text-align: right;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.db-mini-table .td-warn { color: #d97706; font-weight: 700; }
.db-mini-table .td-danger { color: #dc2626; font-weight: 700; }
```

#### 2h. Zona F — Accesos rápidos (compactos)
```css
.db-quick-access {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
}

.db-quick-card {
    background: var(--sga-surface);
    border-radius: var(--sga-radius);
    box-shadow: var(--sga-shadow);
    overflow: hidden;
}

.db-quick-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    background: #f7f9fc;
    border-bottom: 2px solid var(--sga-border);
    text-decoration: none;
    color: var(--sga-primary);
    font-weight: 700;
    font-size: .85rem;
    transition: background .12s;
}

.db-quick-header:hover { background: #edf2fb; text-decoration: none; opacity: 1; }

.db-quick-links { padding: 4px 0; }

.db-quick-links a {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 14px;
    font-size: .8rem;
    color: #374151;
    text-decoration: none;
    border-bottom: 1px solid #f3f4f6;
    transition: background .1s, padding-left .1s;
}

.db-quick-links a:last-child { border-bottom: none; }

.db-quick-links a:hover {
    background: #f0f5ff;
    color: var(--sga-primary-light);
    padding-left: 18px;
    text-decoration: none;
    opacity: 1;
}

.db-link-dot {
    width: 4px; height: 4px;
    border-radius: 50%;
    background: #c5d4ed;
    flex-shrink: 0;
}
```

#### 2i. Filtro de periodo
```css
.db-period-filter {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: .8rem;
    color: var(--sga-text-muted);
}

.db-period-filter input[type="date"] {
    border: 1px solid var(--sga-border);
    border-radius: var(--sga-radius-sm);
    padding: 4px 8px;
    font-size: .8rem;
    color: var(--sga-text);
    background: white;
}

.db-period-filter input[type="date"]:focus {
    outline: 2px solid var(--sga-accent);
    outline-offset: 1px;
}
```

#### 2j. Responsive
```css
.db-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60px;
    color: var(--sga-text-muted);
    font-size: .85rem;
}

.db-empty {
    padding: 20px;
    text-align: center;
    color: var(--sga-text-muted);
    font-size: .82rem;
}

.db-error {
    padding: 12px 16px;
    background: #fef2f2;
    border-left: 3px solid #dc2626;
    color: #dc2626;
    font-size: .82rem;
    border-radius: var(--sga-radius-sm);
}

@media (max-width: 1100px) {
    .db-kpi-row { grid-template-columns: repeat(2, 1fr); }
    .db-alert-row { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 800px) {
    .db-inner { padding: 16px 14px 24px; gap: 16px; }
    .db-kpi-row { grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .db-alert-row { grid-template-columns: 1fr 1fr; gap: 10px; }
    .db-row-2col { grid-template-columns: 1fr; }
    .db-quick-access { grid-template-columns: 1fr 1fr; }
    .db-kpi-value { font-size: 1.5rem; }
}

@media (max-width: 500px) {
    .db-kpi-row { grid-template-columns: 1fr 1fr; }
    .db-alert-row { grid-template-columns: 1fr; }
    .db-quick-access { grid-template-columns: 1fr; }
}
```

---

### TAREA 3 — Crear frontend/js/pages/dashboard.js
**Archivo:** `frontend/js/pages/dashboard.js` (nuevo)

Este archivo contiene toda la lógica del dashboard. No usa frameworks. Estructura:

```js
"use strict";
(function () {

    // ── UTILIDADES ────────────────────────────────────────────────────────────
    function fmt(n)  { return Number(n ?? 0).toLocaleString('es-ES'); }
    function pct(n)  { return (Number(n ?? 0)).toFixed(1) + '%'; }
    function dash(s) { return s || '—'; }

    function setEl(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function setLoading(id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="db-loading">Cargando…</div>';
    }

    function setError(id, msg) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="db-error">' + (msg || 'Error al cargar') + '</div>';
    }

    // ── FECHA POR DEFECTO: últimos 30 días ────────────────────────────────────
    function isoDate(d) { return d.toISOString().slice(0, 10); }

    function defaultPeriod() {
        var hasta = new Date();
        var desde = new Date(hasta);
        desde.setDate(desde.getDate() - 30);
        return { desde: isoDate(desde), hasta: isoDate(hasta) };
    }

    // ── SPARKLINE ─────────────────────────────────────────────────────────────
    function renderSparkline(containerId, data, keyX, keyY) {
        var el = document.getElementById(containerId);
        if (!el || !data || !data.length) { if (el) el.innerHTML = '<div class="db-empty">Sin datos</div>'; return; }
        var max = Math.max.apply(null, data.map(function (r) { return r[keyY] || 0; })) || 1;
        var bars = data.map(function (r) {
            var h = Math.round(((r[keyY] || 0) / max) * 100);
            return '<div class="db-spark-bar" style="height:' + Math.max(h, 3) + '%" title="' + dash(r[keyX]) + ': ' + fmt(r[keyY]) + '"></div>';
        }).join('');
        var label1 = data[0] ? String(data[0][keyX]).slice(5) : '';
        var labelN = data[data.length - 1] ? String(data[data.length - 1][keyX]).slice(5) : '';
        el.innerHTML = '<div class="db-sparkline">' + bars + '</div>'
            + '<div class="db-sparkline-labels"><span>' + label1 + '</span><span>' + labelN + '</span></div>';
    }

    // ── BARRAS HORIZONTALES ────────────────────────────────────────────────────
    function renderBarList(containerId, data, keyName, keyVal) {
        var el = document.getElementById(containerId);
        if (!el || !data || !data.length) { if (el) el.innerHTML = '<div class="db-empty">Sin datos</div>'; return; }
        var max = Math.max.apply(null, data.map(function (r) { return r[keyVal] || 0; })) || 1;
        el.innerHTML = '<ul class="db-bar-list">' + data.map(function (r) {
            var w = Math.round(((r[keyVal] || 0) / max) * 100);
            return '<li class="db-bar-item">'
                + '<span class="db-bar-name">' + dash(r[keyName]) + '</span>'
                + '<span class="db-bar-count">' + fmt(r[keyVal]) + '</span>'
                + '<div class="db-bar-track"><div class="db-bar-fill" style="width:' + w + '%"></div></div>'
                + '</li>';
        }).join('') + '</ul>';
    }

    // ── ACTIVIDAD RECIENTE ─────────────────────────────────────────────────────
    function renderActividad(data) {
        var el = document.getElementById('db-actividad');
        if (!el) return;
        if (!data || !data.length) { el.innerHTML = '<div class="db-empty">Sin actividad reciente</div>'; return; }
        el.innerHTML = '<ul class="db-activity-list">' + data.map(function (r) {
            var tipo = dash(r.tipo);
            var art  = (r.articulo ? r.articulo + ' ' : '') + dash(r.nombre);
            var loc  = [r.ubicacion, r.lote].filter(Boolean).join(' / ') || '—';
            var cant = (r.cantidad > 0 ? '+' : '') + fmt(r.cantidad);
            var t    = (r.hora || '').slice(0,5) || '—';
            var d    = (r.fecha || '').slice(5);
            return '<li class="db-activity-item">'
                + '<span class="db-activity-time">' + d + '<br>' + t + '</span>'
                + '<span class="db-activity-desc">'
                +   '<strong>' + tipo + '</strong> · ' + art
                + '</span>'
                + '<span class="db-activity-meta">' + cant + '<br><small>' + loc + '</small></span>'
                + '</li>';
        }).join('') + '</ul>';
    }

    // ── TABLA DE ALERTAS ───────────────────────────────────────────────────────
    function renderAlertasStock(data) {
        var el = document.getElementById('db-alertas-stock');
        if (!el) return;
        if (!data || !data.length) { el.innerHTML = '<div class="db-empty">Sin alertas activas</div>'; return; }
        el.innerHTML = '<table class="db-mini-table"><thead><tr>'
            + '<th>Artículo</th><th>Nombre</th><th class="td-num">Stock</th><th class="td-num">Mín.</th>'
            + '</tr></thead><tbody>'
            + data.map(function (r) {
                var cls = (r.stock_actual <= 0) ? 'td-danger' : 'td-warn';
                return '<tr>'
                    + '<td>' + r.articulo + '</td>'
                    + '<td>' + (r.nombre || '—') + '</td>'
                    + '<td class="td-num ' + cls + '">' + fmt(r.stock_actual) + '</td>'
                    + '<td class="td-num">' + fmt(r.stock_minimo) + '</td>'
                    + '</tr>';
            }).join('')
            + '</tbody></table>';
    }

    // ── TOP ARTÍCULOS ──────────────────────────────────────────────────────────
    function renderTopArticulos(data) {
        var el = document.getElementById('db-top-articulos');
        if (!el) return;
        if (!data || !data.length) { el.innerHTML = '<div class="db-empty">Sin datos</div>'; return; }
        el.innerHTML = '<table class="db-mini-table"><thead><tr>'
            + '<th>#</th><th>Artículo</th><th class="td-num">Unidades</th>'
            + '</tr></thead><tbody>'
            + data.slice(0, 10).map(function (r, i) {
                return '<tr>'
                    + '<td>' + (i + 1) + '</td>'
                    + '<td title="' + (r.nombre || '') + '">' + r.articulo + '</td>'
                    + '<td class="td-num">' + fmt(r.unidades) + '</td>'
                    + '</tr>';
            }).join('')
            + '</tbody></table>';
    }

    // ── KPIs PRINCIPALES ──────────────────────────────────────────────────────
    function renderKpis(kpis) {
        setEl('db-kpi-articulos',    fmt(kpis.articulos));
        setEl('db-kpi-lineas',       fmt(kpis.lineas_stock));
        setEl('db-kpi-unidades',     fmt(kpis.unidades_stock));
        setEl('db-kpi-ocupacion',    pct(kpis.ocupacion_porcentaje));
        setEl('db-kpi-ocupacion-sub',
              fmt(kpis.ubicaciones_ocupadas) + ' / ' + fmt(kpis.ubicaciones) + ' ubicaciones');
        setEl('db-kpi-movperiodo',   fmt(kpis.movimientos_periodo));
        setEl('db-kpi-movperiodo-sub', fmt(kpis.unidades_movidas_periodo) + ' ud. movidas');

        // KPIs de alerta con color dinámico
        var stockBajoEl = document.getElementById('db-kpi-stockbajo');
        if (stockBajoEl) {
            stockBajoEl.textContent = fmt(kpis.stock_bajo);
            var card = document.getElementById('db-kpi-card-stockbajo');
            if (card) card.classList.toggle('db-kpi--danger', kpis.stock_bajo > 0);
        }
        setEl('db-kpi-sinmovto', fmt(kpis.sin_movimiento_90_dias));
    }

    // ── CARGA PRINCIPAL ────────────────────────────────────────────────────────
    function loadDashboard(desde, hasta) {
        ['db-sparkline-wrap', 'db-actividad', 'db-alertas-stock', 'db-top-articulos', 'db-stock-almacen'].forEach(setLoading);

        SGA.dashboard.get(desde, hasta).then(function (data) {
            renderKpis(data.kpis);
            renderSparkline('db-sparkline-wrap', data.graficos.movimientos_por_dia, 'fecha', 'movimientos');
            renderBarList('db-stock-almacen', data.graficos.stock_por_almacen, 'nombre_almacen', 'unidades');
            renderTopArticulos(data.graficos.top_articulos);
            renderActividad(data.movimientos_recientes);
        }).catch(function (err) {
            console.error('[dashboard]', err);
            ['db-sparkline-wrap', 'db-actividad', 'db-top-articulos', 'db-stock-almacen'].forEach(function (id) {
                setError(id);
            });
        });

        SGA.dashboard.alertas().then(function (data) {
            renderAlertasStock(data.stock_bajo);
            var negEl = document.getElementById('db-kpi-stockneg');
            if (negEl) negEl.textContent = fmt(data.stock_negativo.length);
            var cardNeg = document.getElementById('db-kpi-card-stockneg');
            if (cardNeg) cardNeg.classList.toggle('db-kpi--danger', data.stock_negativo.length > 0);
        }).catch(function () {
            setError('db-alertas-stock');
        });
    }

    // ── INIT ──────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        var p = defaultPeriod();
        var inpDesde = document.getElementById('db-desde');
        var inpHasta = document.getElementById('db-hasta');

        if (inpDesde) inpDesde.value = p.desde;
        if (inpHasta) inpHasta.value = p.hasta;

        loadDashboard(p.desde, p.hasta);

        var btnActualizar = document.getElementById('db-btn-actualizar');
        if (btnActualizar) {
            btnActualizar.addEventListener('click', function () {
                var d = inpDesde ? inpDesde.value : p.desde;
                var h = inpHasta ? inpHasta.value : p.hasta;
                loadDashboard(d, h);
            });
        }
    });

})();
```

---

### TAREA 4 — Reescribir frontend/index.html

**Archivo:** `frontend/index.html`

Leer el archivo actual antes de escribir. Mantener:
- `class="sga-layout"` en `<body>`
- Misma estructura `.sga-main` → `.sga-header` → `.sga-content`
- Los mismos `<script>` tags de api.js, sidebar.js, layout.js

Nueva estructura dentro de `.sga-content`:

```html
<div class="db-inner">

  <!-- FILTRO DE PERIODO -->
  <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
    <div>
      <h1 class="sga-page-title">Panel de Control</h1>
      <p class="sga-page-description">Centro operativo · SGA LIN</p>
    </div>
    <div class="db-period-filter">
      <label for="db-desde">Desde</label>
      <input type="date" id="db-desde">
      <label for="db-hasta">Hasta</label>
      <input type="date" id="db-hasta">
      <button class="sga-btn sga-btn-primary sga-btn-sm" id="db-btn-actualizar">Actualizar</button>
    </div>
  </div>

  <!-- ZONA A: KPIs principales -->
  <div class="db-kpi-row">
    <div class="db-kpi">
      <span class="db-kpi-icon">🔩</span>
      <div class="db-kpi-label">Artículos</div>
      <div class="db-kpi-value" id="db-kpi-articulos">—</div>
    </div>
    <div class="db-kpi">
      <span class="db-kpi-icon">📦</span>
      <div class="db-kpi-label">Líneas de stock</div>
      <div class="db-kpi-value" id="db-kpi-lineas">—</div>
      <div class="db-kpi-sub" id="db-kpi-unidades">— ud.</div>
    </div>
    <div class="db-kpi">
      <span class="db-kpi-icon">📍</span>
      <div class="db-kpi-label">Ocupación almacén</div>
      <div class="db-kpi-value" id="db-kpi-ocupacion">—</div>
      <div class="db-kpi-sub" id="db-kpi-ocupacion-sub">— / — ubicaciones</div>
    </div>
    <div class="db-kpi">
      <span class="db-kpi-icon">📊</span>
      <div class="db-kpi-label">Movimientos (periodo)</div>
      <div class="db-kpi-value" id="db-kpi-movperiodo">—</div>
      <div class="db-kpi-sub" id="db-kpi-movperiodo-sub">— ud. movidas</div>
    </div>
  </div>

  <!-- ZONA B: KPIs de alerta -->
  <div class="db-alert-row">
    <div class="db-kpi db-kpi--warn" id="db-kpi-card-stockbajo">
      <span class="db-kpi-icon">⚠️</span>
      <div class="db-kpi-label">Stock bajo mínimo</div>
      <div class="db-kpi-value" id="db-kpi-stockbajo">—</div>
      <div class="db-kpi-sub">artículos por debajo del mínimo</div>
    </div>
    <div class="db-kpi" id="db-kpi-card-stockneg">
      <span class="db-kpi-icon">🔴</span>
      <div class="db-kpi-label">Stock negativo</div>
      <div class="db-kpi-value" id="db-kpi-stockneg">—</div>
      <div class="db-kpi-sub">líneas con stock < 0</div>
    </div>
    <div class="db-kpi">
      <span class="db-kpi-icon">💤</span>
      <div class="db-kpi-label">Sin movimiento 90 días</div>
      <div class="db-kpi-value" id="db-kpi-sinmovto">—</div>
      <div class="db-kpi-sub">artículos con stock parado</div>
    </div>
  </div>

  <!-- ZONA C: Actividad -->
  <div class="db-row-2col">

    <div class="db-widget">
      <div class="db-widget-header">
        <span class="db-widget-title">Movimientos por día</span>
        <span style="font-size:.75rem; color:var(--sga-text-muted)">últimos 30 días</span>
      </div>
      <div class="db-widget-body" id="db-sparkline-wrap">
        <div class="db-loading">Cargando…</div>
      </div>
    </div>

    <div class="db-widget">
      <div class="db-widget-header">
        <span class="db-widget-title">Actividad reciente</span>
        <span style="font-size:.75rem; color:var(--sga-text-muted)">últimos 12 movimientos</span>
      </div>
      <div class="db-widget-body" id="db-actividad" style="padding:0 18px;">
        <div class="db-loading">Cargando…</div>
      </div>
    </div>

  </div>

  <!-- ZONA D: Tablas operativas -->
  <div class="db-row-2col">

    <div class="db-widget">
      <div class="db-widget-header">
        <span class="db-widget-title">🔴 Alertas stock bajo</span>
        <a href="pages/opciones/almacen-y-stock/consulta-de-stock/index.html"
           style="font-size:.75rem; color:var(--sga-accent);">Ver todo →</a>
      </div>
      <div class="db-widget-body" id="db-alertas-stock" style="padding:0;">
        <div class="db-loading">Cargando…</div>
      </div>
    </div>

    <div class="db-widget">
      <div class="db-widget-header">
        <span class="db-widget-title">Top artículos movidos</span>
      </div>
      <div class="db-widget-body" id="db-top-articulos" style="padding:0;">
        <div class="db-loading">Cargando…</div>
      </div>
    </div>

  </div>

  <!-- ZONA E: Stock por almacén -->
  <div class="db-widget">
    <div class="db-widget-header">
      <span class="db-widget-title">Stock por almacén</span>
    </div>
    <div class="db-widget-body" id="db-stock-almacen">
      <div class="db-loading">Cargando…</div>
    </div>
  </div>

  <!-- ZONA F: Accesos rápidos -->
  <div class="db-quick-access">

    <div class="db-quick-card">
      <a class="db-quick-header" href="pages/ferreteria/index.html">
        <span>🔩</span> Ferretería
      </a>
      <div class="db-quick-links">
        <a href="pages/ferreteria/articulos.html"><span class="db-link-dot"></span>Artículos</a>
        <a href="pages/ferreteria/entradas.html"><span class="db-link-dot"></span>Entrada de mercancía</a>
        <a href="pages/ferreteria/salidas.html"><span class="db-link-dot"></span>Salida de mercancía</a>
        <a href="pages/ferreteria/traspasos.html"><span class="db-link-dot"></span>Traspasos</a>
      </div>
    </div>

    <div class="db-quick-card">
      <a class="db-quick-header" href="pages/opciones/index.html">
        <span>⚙️</span> Opciones
      </a>
      <div class="db-quick-links">
        <a href="pages/opciones/almacen-y-stock/consulta-de-stock/index.html"><span class="db-link-dot"></span>Consulta de stock</a>
        <a href="pages/opciones/almacen-y-stock/movimientos-por-articulo/index.html"><span class="db-link-dot"></span>Movimientos por artículo</a>
        <a href="pages/opciones/almacen-y-stock/ubicaciones/index.html"><span class="db-link-dot"></span>Ubicaciones</a>
        <a href="pages/opciones/control-de-lotes-y-minimos/minimos-maximos/index.html"><span class="db-link-dot"></span>Mínimos y máximos</a>
      </div>
    </div>

    <div class="db-quick-card">
      <a class="db-quick-header" href="pages/informes/index.html">
        <span>📊</span> Informes
      </a>
      <div class="db-quick-links">
        <a href="pages/informes/index.html"><span class="db-link-dot"></span>KPIs generales</a>
        <a href="pages/informes/index.html"><span class="db-link-dot"></span>Movimientos por día</a>
        <a href="pages/informes/index.html"><span class="db-link-dot"></span>Top artículos</a>
        <a href="pages/informes/index.html"><span class="db-link-dot"></span>Alertas de stock</a>
      </div>
    </div>

    <div class="db-quick-card">
      <a class="db-quick-header" href="pages/visor/index.html">
        <span>🔍</span> Visor
      </a>
      <div class="db-quick-links">
        <a href="pages/visor/articulos.html"><span class="db-link-dot"></span>Visor de artículos</a>
        <a href="pages/visor/proveedores.html"><span class="db-link-dot"></span>Visor de proveedores</a>
        <a href="pages/visor/clientes.html"><span class="db-link-dot"></span>Visor de clientes</a>
      </div>
    </div>

  </div>

  <div class="footer-note">SGA LIN · v1.0 · Base de datos SQL Server LIN</div>

</div><!-- /.db-inner -->
```

Scripts al final del `<body>`:
```html
<script src="js/api.js"></script>
<script src="js/ui/sidebar.js"></script>
<script src="js/ui/layout.js"></script>
<script src="js/pages/dashboard.js"></script>
```

El `<link>` de CSS específico de página debe apuntar a `css/pages/dashboard.css`.

---

## 4. Verificaciones manuales

### V1 — Backend conectado
1. Arrancar el servidor: `node backend/app.js` (o `npm start` / `npm run dev`)
2. Abrir `frontend/index.html` en un servidor HTTP local (ej. `npx serve frontend` o Live Server de VSCode)
3. Abrir DevTools → Network
4. Verificar que se hacen las llamadas a `/estadisticas/dashboard` y `/estadisticas/alertas`
5. Ambas deben devolver status 200 con JSON

### V2 — KPIs se pintan
- Los 7 contadores de zona A y B muestran números reales (no `—`)
- Si hay artículos con stock bajo: el card "Stock bajo mínimo" tiene borde rojo
- Si hay stock negativo: el card "Stock negativo" tiene borde rojo

### V3 — Sparkline de movimientos
- La zona "Movimientos por día" muestra barras verticales de altura proporcional
- Al pasar el cursor sobre cada barra aparece tooltip con fecha y número

### V4 — Actividad reciente
- La lista muestra hasta 12 filas con fecha/hora, tipo de movimiento, artículo, cantidad

### V5 — Alertas stock bajo
- La tabla muestra artículos con stock ≤ mínimo
- Stock = 0 aparece en rojo, stock > 0 pero ≤ mínimo en naranja

### V6 — Top artículos
- Tabla de 10 filas con artículo y unidades movidas en el periodo

### V7 — Stock por almacén
- Lista de almacenes con barras horizontales proporcionales

### V8 — Filtro de periodo
- Cambiar fecha desde/hasta y pulsar "Actualizar" recarga todos los widgets dinámicos
- Los widgets estáticos (accesos rápidos) no se recargan

### V9 — Responsive
- A 900px: sidebar se colapsa, dos columnas de zona C se apilan
- A 600px: KPIs en 2 columnas, accesos rápidos en 2 columnas

### V10 — Sin regresiones
- Navegar a `pages/opciones/index.html` y `pages/opciones/almacen-y-stock/consulta-de-stock/index.html`
- Ambas siguen funcionando con el mismo layout de FASE 1
- La sidebar muestra "Dashboard" activo solo cuando se está en index.html

---

## 5. Criterios de éxito

| # | Criterio | Resultado esperado |
|---|---|---|
| 1 | Dashboard carga sin errores en consola | No hay errores 404, 500 ni JS exceptions |
| 2 | KPIs principales visibles en < 2 segundos | Números reales reemplazan los `—` |
| 3 | Alertas visibles si existen | Card rojo con número > 0 visible at-a-glance |
| 4 | Sparkline renderizado con CSS puro | Barras visibles, sin librerías externas |
| 5 | Actividad reciente muestra últimos 12 | Tabla poblada con datos reales |
| 6 | Filtro de periodo funcional | Cambiar fechas y actualizar recarga con nuevos datos |
| 7 | Responsive correcto en 3 breakpoints | 1280px, 900px, 600px visualmente coherente |
| 8 | Cero regresiones en páginas FASE 1 | opciones/index.html y consulta-de-stock/index.html sin cambios funcionales |
| 9 | api.js: SGA.dashboard.* disponible | `SGA.dashboard.get()` y `SGA.dashboard.alertas()` resuelven sin error |
| 10 | Sin librerías externas añadidas | Solo CSS puro + JS vanilla |

---

## 6. Archivos exactos a crear o modificar

| Acción | Archivo |
|---|---|
| MODIFICAR | `frontend/js/api.js` — añadir `SGA.dashboard.*` |
| REESCRIBIR | `frontend/css/pages/dashboard.css` |
| CREAR | `frontend/js/pages/dashboard.js` |
| REESCRIBIR | `frontend/index.html` |

**No tocar nada más.**

---

## 7. Iconografía

| Zona | Icono | Significado |
|---|---|---|
| Artículos | 🔩 | Ferretería (coherente con el dominio) |
| Stock / Líneas | 📦 | Cajas = stock físico |
| Ocupación | 📍 | Pin = ubicación |
| Movimientos | 📊 | Actividad / volumen |
| Stock bajo | ⚠️ | Advertencia operativa |
| Stock negativo | 🔴 | Crítico |
| Sin movimiento | 💤 | Inactividad |
| Sparkline | (CSS puro) | Sin iconos |

Los iconos de fondo en KPI cards son decorativos, `opacity: .08`, sin interacción.

---

## 8. Notas de implementación

- **dashboard.js no accede a DOM antes de DOMContentLoaded** — todo el código de render se llama desde el listener del evento
- **Valores null/undefined seguros** — todas las funciones de render usan `?? 0` o `dash()`
- **No se añade polyfill ni transpilación** — el código es compatible con los últimos 2 años de Chrome/Edge/Firefox
- **El `<link>` de dashboard.css reemplaza la hoja actual** — no duplicar hojas
- **`SGA.estadisticas.*` en api.js NO se elimina** — pueden existir otras páginas que lo usen; solo se añade `SGA.dashboard.*` al objeto

