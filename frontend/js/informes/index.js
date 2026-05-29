// ── COLORES ───────────────────────────────────────────────────────────────────
const PAL = ['#2563c0','#059669','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#6d28d9'];
const BLUE   = '#2563c0', LBLUE = 'rgba(37,99,192,.12)';
const GREEN  = '#059669', RED   = '#dc2626', AMBER = '#d97706', PURPLE = '#7c3aed';

Chart.defaults.font  = { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", size: 11 };
Chart.defaults.color = '#6b7280';

const charts = {};
const loaded = {};   // pestañas ya cargadas

// ── PERIODO ───────────────────────────────────────────────────────────────────
let DIAS = 365;  // por defecto 1 año (para garantizar datos en demo)

document.querySelectorAll('.period-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        document.querySelectorAll('.period-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        DIAS = parseInt(pill.dataset.dias);
        recargarTodo();
    });
});

// ── TABS ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn-inf').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn-inf').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel-inf').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.getElementById('tab-' + tab).classList.add('active');
        if (!loaded[tab]) cargarTab(tab);
    });
});

function cargarTab(tab) {
    loaded[tab] = true;
    switch (tab) {
        case 'actividad':    if (typeof loadDashboard === 'function') loadDashboard(); break;
        case 'trabajadores': cargarTrabajadores(); break;
        case 'almacen':      cargarAlmacen();      break;
        case 'movimientos':  cargarMovimientos();  break;
        case 'proveedores':  cargarProveedores();  break;
        case 'articulos':    cargarArticulos();    break;
    }
}

// ── CARGA INICIAL (pestaña Resumen) ───────────────────────────────────────────
async function cargarResumen() {
    const btn = document.getElementById('btn-refresh');
    btn.textContent = '↻ Cargando...';
    btn.disabled = true;
    try {
        const p = { dias: DIAS };
        const [resumen, porDia, top, evs, alertas] = await Promise.all([
            SGA.estadisticas.resumen(p),
            SGA.estadisticas.movimientosPorDia(p),
            SGA.estadisticas.topArticulos(p),
            SGA.estadisticas.entradasVsSalidas(p),
            SGA.estadisticas.alertasStock(),
        ]);
        pintarKPIs(resumen);
        pintarMovimientosDia(porDia);
        pintarTopArticulos(top);
        pintarEntradasVsSalidas(evs);
        pintarTablaAlertas(alertas);
    } catch (e) {
        console.error(e);
    } finally {
        btn.textContent = '↻ Actualizar';
        btn.disabled = false;
    }
}

// ── KPIs CABECERA ─────────────────────────────────────────────────────────────
function pintarKPIs(d) {
    setText('kpi-articulos',   fmt(d.articulos));
    setText('kpi-ubicaciones', fmt(d.ubicaciones_activas));
    setText('kpi-movimientos', fmt(d.movimientos_periodo ?? d.movimientos_mes ?? 0));
    setText('kpi-alertas',     fmt(d.alertas_stock));
    setText('kpi-movimientos-label',
        DIAS >= 9999 ? 'Movimientos totales' :
        DIAS >= 365  ? 'Movimientos este año' :
        DIAS >= 90   ? 'Movimientos 90 días' :
                       'Movimientos este mes');
}

// ── RESUMEN: CHARTS ───────────────────────────────────────────────────────────
function rellenarDias(data, dias) {
    const map = {};
    data.forEach(r => { map[r.fecha.slice(0, 10)] = r.total || 0; });
    const result = [];
    for (let i = dias - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toISOString().slice(0, 10);
        result.push({ fecha: key, total: map[key] || 0 });
    }
    return result;
}

function pintarMovimientosDia(data) {
    const filled = rellenarDias(data, 30);
    destroy('movimientos');
    charts.movimientos = new Chart(get('chart-movimientos'), {
        type: 'line',
        data: {
            labels: filled.map(r => r.fecha.slice(5)),
            datasets: [{ label: 'Movimientos', data: filled.map(r => r.total),
                borderColor: BLUE, backgroundColor: LBLUE,
                borderWidth: 2, pointRadius: 2, pointHoverRadius: 5,
                fill: true, tension: .35 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#f3f4f6' } } } },
    });
}

function pintarTopArticulos(data) {
    destroy('top');
    charts.top = new Chart(get('chart-top'), {
        type: 'bar',
        data: {
            labels: data.map(r => trunc(r.nombre || r.articulo, 20)),
            datasets: [{ data: data.map(r => r.movimientos),
                backgroundColor: 'rgba(37,99,192,.7)', borderColor: BLUE,
                borderWidth: 1, borderRadius: 4 }],
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, grid: { color: '#f3f4f6' } },
                      y: { grid: { display: false }, ticks: { font: { size: 10 } } } } },
    });
}

function labelSemana(isoLunes) {
    const d = new Date(isoLunes + 'T00:00:00');
    const fin = new Date(d); fin.setDate(fin.getDate() + 6);
    const pad = n => String(n).padStart(2, '0');
    return pad(d.getDate()) + '-' + pad(d.getMonth()+1) + ' › ' + pad(fin.getDate()) + '-' + pad(fin.getMonth()+1);
}

function pintarEntradasVsSalidas(data) {
    destroy('evs');
    charts.evs = new Chart(get('chart-evs'), {
        type: 'bar',
        data: {
            labels: data.map(r => labelSemana(r.semana)),
            datasets: [
                { label: 'Entradas', data: data.map(r => r.entradas),
                    backgroundColor: 'rgba(5,150,105,.75)', borderColor: GREEN, borderWidth: 1, borderRadius: 4 },
                { label: 'Salidas',  data: data.map(r => r.salidas),
                    backgroundColor: 'rgba(220,38,38,.7)', borderColor: RED, borderWidth: 1, borderRadius: 4 },
            ],
        },
        options: { responsive: true,
            plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 16 } } },
            scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#f3f4f6' } } } },
    });
}

function pintarTablaAlertas(data) {
    const el = document.getElementById('tabla-alertas');
    if (!data.length) { el.innerHTML = '<div class="placeholder-msg">✅ No hay artículos bajo mínimo.</div>'; return; }
    const top10 = data.slice(0, 10);
    const resto = data.length - 10;
    const urlAlertas = '../../pages/opciones/almacen-y-stock/alertas-stock/index.html';
    el.innerHTML = `<div class="data-table-wrap"><table>
        <thead><tr><th>Código</th><th>Artículo</th><th class="num">Mínimo</th><th class="num">Stock</th><th>Cobertura</th><th class="num">Déficit</th></tr></thead>
        <tbody>${top10.map(r => `<tr>
            <td><strong>${r.articulo.trim()}</strong></td><td>${r.nombre.trim() ?? ''}</td>
            <td class="num">${fmt(r.stock_minimo)}</td><td class="num">${fmt(r.stock_actual)}</td>
            <td><div class="mini-bar"><div class="mini-bar-fill" style="width:${Math.min(100,Math.round(r.stock_actual/r.stock_minimo*100))}%;background:${r.stock_actual===0?RED:AMBER}"></div></div></td>
            <td class="num"><span class="badge badge-red">−${fmt(r.deficit)}</span></td>
        </tr>`).join('')}</tbody>
    </table></div>
    <div style="padding:12px 0 4px;text-align:center">
        <a href="${urlAlertas}" class="sga-btn sga-btn-secondary sga-btn-sm">
            Ver todos los artículos bajo mínimo ${resto > 0 ? '(+' + fmt(resto) + ' más)' : ''}  ↗
        </a>
    </div>`;
}

// ── TRABAJADORES ──────────────────────────────────────────────────────────────
async function cargarTrabajadores() {
    try {
        const data = await SGA.estadisticas.trabajadores({ dias: DIAS });
        if (!data.length) {
            document.getElementById('mkpi-trabajadores').innerHTML = '<div class="placeholder-msg" style="grid-column:span 3">Sin datos de actividad por terminal en este periodo.</div>';
            get('chart-trabajadores-mov').style.display = 'none';
            get('chart-trabajadores-uni').style.display = 'none';
            document.getElementById('tabla-trabajadores').innerHTML = '<div class="placeholder-msg">Sin datos de actividad.</div>';
            return;
        }
        const top = data[0];
        const total = data.reduce((a, r) => a + r.movimientos, 0);
        document.getElementById('mkpi-trabajadores').innerHTML = `
            <div class="mini-kpi"><div class="mk-val">${data.length}</div><div class="mk-label">Trabajadores activos</div></div>
            <div class="mini-kpi green"><div class="mk-val">${fmt(total)}</div><div class="mk-label">Movimientos totales (30d)</div></div>
            <div class="mini-kpi amber"><div class="mk-val">${trunc(top.nombre||top.terminal,18)}</div><div class="mk-label">Más activo: ${fmt(top.movimientos)} movs.</div></div>`;

        const labels = data.map(r => trunc(r.nombre || r.terminal, 14));
        destroy('trab-mov');
        charts['trab-mov'] = new Chart(get('chart-trabajadores-mov'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Movimientos', data: data.map(r => r.movimientos),
                    backgroundColor: data.map((_, i) => PAL[i % PAL.length] + 'cc'),
                    borderColor: data.map((_, i) => PAL[i % PAL.length]),
                    borderWidth: 1, borderRadius: 4, maxBarThickness: 60 }],
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                          y: { beginAtZero: true, grid: { color: '#f3f4f6' } } } },
        });
        destroy('trab-uni');
        charts['trab-uni'] = new Chart(get('chart-trabajadores-uni'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Unidades', data: data.map(r => r.unidades),
                    backgroundColor: 'rgba(124,58,237,.7)', borderColor: PURPLE,
                    borderWidth: 1, borderRadius: 4, maxBarThickness: 60 }],
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                          y: { beginAtZero: true, grid: { color: '#f3f4f6' } } } },
        });

        const maxMov = Math.max(...data.map(r => r.movimientos), 1);
        document.getElementById('tabla-trabajadores').innerHTML = `<div class="data-table-wrap"><table>
            <thead><tr><th>#</th><th>Trabajador / Terminal</th><th class="num">Movimientos</th><th class="num">Unidades</th><th class="num">Entradas</th><th class="num">Salidas</th><th class="num">Traspasos</th><th>Actividad</th><th>Última actividad</th></tr></thead>
            <tbody>${data.map((r, i) => `<tr>
                <td><strong>#${i+1}</strong></td>
                <td><strong>${r.nombre || r.terminal}</strong></td>
                <td class="num"><span class="badge badge-blue">${fmt(r.movimientos)}</span></td>
                <td class="num">${fmt(r.unidades)}</td>
                <td class="num"><span class="badge badge-green">${r.entradas}</span></td>
                <td class="num"><span class="badge badge-red">${r.salidas}</span></td>
                <td class="num"><span class="badge badge-purple">${r.traspasos}</span></td>
                <td><div class="mini-bar" style="min-width:80px"><div class="mini-bar-fill" style="width:${Math.round(r.movimientos/maxMov*100)}%"></div></div></td>
                <td>${r.ultima_actividad ?? '—'}</td>
            </tr>`).join('')}</tbody>
        </table></div>`;
    } catch (e) {
        console.error('[trabajadores]', e);
        document.getElementById('mkpi-trabajadores').innerHTML = '<div class="placeholder-msg" style="grid-column:span 3">Error al cargar datos.</div>';
        document.getElementById('tabla-trabajadores').innerHTML = '<div class="placeholder-msg">Error al cargar datos.</div>';
    }
}

// ── ALMACÉN ───────────────────────────────────────────────────────────────────
async function cargarAlmacen() {
    try {
        const d = await SGA.estadisticas.almacen({ dias: DIAS });
        const oc = d.ocupacion;
        const pctOcu = oc.total_ubicaciones ? Math.round(oc.ocupadas / oc.total_ubicaciones * 100) : 0;
        document.getElementById('mkpi-almacen').innerHTML = `
            <div class="mini-kpi"><div class="mk-val">${fmt(oc.total_ubicaciones)}</div><div class="mk-label">Ubicaciones totales</div></div>
            <div class="mini-kpi green"><div class="mk-val">${fmt(oc.ocupadas)}</div><div class="mk-label">Ocupadas (${pctOcu}%)</div></div>
            <div class="mini-kpi amber"><div class="mk-val">${fmt(oc.vacias)}</div><div class="mk-label">Vacías</div></div>`;

        destroy('alm-stock');
        charts['alm-stock'] = new Chart(get('chart-almacen-stock'), {
            type: 'bar',
            data: {
                labels: d.por_almacen.map(r => r.almacen || 'Sin almacén'),
                datasets: [{ label: 'Stock total', data: d.por_almacen.map(r => r.stock_total),
                    backgroundColor: PAL.slice(0, d.por_almacen.length).map(c => c + 'cc'),
                    borderColor: PAL.slice(0, d.por_almacen.length),
                    borderWidth: 1, borderRadius: 4, maxBarThickness: 60 }],
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#f3f4f6' } } } },
        });

        destroy('alm-ocu');
        charts['alm-ocu'] = new Chart(get('chart-almacen-ocu'), {
            type: 'doughnut',
            data: {
                labels: ['Ocupadas', 'Vacías'],
                datasets: [{ data: [oc.ocupadas, oc.vacias],
                    backgroundColor: [GREEN + 'cc', '#e5e7eb'],
                    borderColor: [GREEN, '#d1d5db'], borderWidth: 2 }],
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '62%',
                plugins: { legend: { position: 'bottom' } } },
        });

        document.getElementById('tabla-ubicaciones').innerHTML = d.mas_activas.length
            ? `<div class="data-table-wrap"><table>
                <thead><tr><th>#</th><th>Ubicación</th><th class="num">Movimientos (30d)</th><th>Actividad</th></tr></thead>
                <tbody>${d.mas_activas.map((r, i) => `<tr>
                    <td>#${i+1}</td><td><strong>${r.ubicacion}</strong></td>
                    <td class="num"><span class="badge badge-blue">${r.movimientos}</span></td>
                    <td><div class="mini-bar"><div class="mini-bar-fill" style="width:${Math.round(r.movimientos/d.mas_activas[0].movimientos*100)}%"></div></div></td>
                </tr>`).join('')}</tbody>
               </table></div>`
            : '<div class="placeholder-msg">Sin datos de ubicaciones activas.</div>';
    } catch (e) { console.error(e); }
}

// ── MOVIMIENTOS ───────────────────────────────────────────────────────────────
const TIPO_LABEL = { PC:'Picking/Venta', PP:'Compra', RG:'Regularización', SA:'Salida almacén', E:'Entrada', S:'Salida', T:'Traspaso', R:'Regularización', I:'Inventario', P:'Pedido' };
const TIPO_COLOR = { PC: RED, PP: GREEN, RG: AMBER, SA: PURPLE, E: GREEN, S: RED, T: BLUE, R: AMBER, I: PURPLE, P: '#0891b2' };

async function cargarMovimientos() {
    try {
        const d = await SGA.estadisticas.porTipo({ dias: DIAS });
        const tipos = d.por_tipo;
        const dias  = d.por_dia_semana;

        destroy('mov-tipo');
        charts['mov-tipo'] = new Chart(get('chart-mov-tipo'), {
            type: 'doughnut',
            data: {
                labels: tipos.map(r => TIPO_LABEL[r.tipo] || r.tipo),
                datasets: [{ data: tipos.map(r => r.total),
                    backgroundColor: tipos.map(r => (TIPO_COLOR[r.tipo] || '#9ca3af') + 'cc'),
                    borderColor:     tipos.map(r => TIPO_COLOR[r.tipo] || '#9ca3af'),
                    borderWidth: 2 }],
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '55%',
                plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } },
        });

        destroy('mov-semana');
        charts['mov-semana'] = new Chart(get('chart-mov-semana'), {
            type: 'bar',
            data: {
                labels: dias.map(r => r.dia_nombre),
                datasets: [{ label: 'Movimientos', data: dias.map(r => r.total),
                    backgroundColor: 'rgba(37,99,192,.7)', borderColor: BLUE,
                    borderWidth: 1, borderRadius: 4 }],
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#f3f4f6' } } } },
        });

        document.getElementById('tabla-ultimos').innerHTML = d.ultimos.length
            ? `<div class="data-table-wrap"><table>
                <thead><tr><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Artículo</th><th>Nombre</th><th>Ubicación</th><th class="num">Cantidad</th><th>Tercero</th></tr></thead>
                <tbody>${d.ultimos.map(r => `<tr>
                    <td>${r.fecha}</td><td>${r.hora ?? ''}</td>
                    <td><span class="badge" style="background:${(TIPO_COLOR[r.tipo]||'#9ca3af')}22;color:${TIPO_COLOR[r.tipo]||'#374151'}">${TIPO_LABEL[r.tipo]||r.tipo}</span></td>
                    <td><strong>${r.articulo}</strong></td><td>${trunc(r.nombre_articulo||'',28)}</td>
                    <td>${r.ubicacion??''}</td><td class="num">${r.cantidad??''}</td>
                    <td>${trunc(r.tercero||'',20)}</td>
                </tr>`).join('')}</tbody>
               </table></div>`
            : '<div class="placeholder-msg">Sin movimientos recientes.</div>';
    } catch (e) { console.error(e); }
}

// ── PROVEEDORES ───────────────────────────────────────────────────────────────
async function cargarProveedores() {
    try {
        const data = await SGA.estadisticas.proveedoresActividad({ dias: DIAS });
        if (!data.length) {
            document.getElementById('tabla-proveedores').innerHTML = '<div class="placeholder-msg">Sin actividad de proveedores en los últimos 90 días.</div>';
            return;
        }
        destroy('prov-mov');
        charts['prov-mov'] = new Chart(get('chart-prov-mov'), {
            type: 'bar',
            data: {
                labels: data.map(r => trunc(r.nombre || r.codigo, 22)),
                datasets: [
                    { label: 'Movimientos', data: data.map(r => r.movimientos),
                        backgroundColor: 'rgba(37,99,192,.7)', borderColor: BLUE, borderWidth: 1, borderRadius: 4, maxBarThickness: 40 },
                    { label: 'Unidades',    data: data.map(r => r.unidades),
                        backgroundColor: 'rgba(5,150,105,.6)', borderColor: GREEN, borderWidth: 1, borderRadius: 4, maxBarThickness: 40 },
                ],
            },
            options: { responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 16 } } },
                scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                          y: { beginAtZero: true, grid: { color: '#f3f4f6' } } } },
        });

        const maxMov = Math.max(...data.map(r => r.movimientos), 1);
        document.getElementById('tabla-proveedores').innerHTML = `<div class="data-table-wrap"><table>
            <thead><tr><th>#</th><th>Código</th><th>Proveedor</th><th class="num">Entradas</th><th class="num">Artículos distintos</th><th class="num">Unidades</th><th>Actividad</th><th>Última entrada</th></tr></thead>
            <tbody>${data.map((r, i) => `<tr>
                <td><strong>#${i+1}</strong></td>
                <td>${r.codigo}</td><td>${r.nombre ?? ''}</td>
                <td class="num"><span class="badge badge-blue">${r.movimientos}</span></td>
                <td class="num">${r.articulos_distintos}</td>
                <td class="num">${fmt(r.unidades)}</td>
                <td><div class="mini-bar"><div class="mini-bar-fill" style="width:${Math.round(r.movimientos/maxMov*100)}%;background:${BLUE}"></div></div></td>
                <td>${r.ultima_entrada ?? '—'}</td>
            </tr>`).join('')}</tbody>
        </table></div>`;
    } catch (e) { console.error(e); }
}

// ── ARTÍCULOS ─────────────────────────────────────────────────────────────────
async function cargarArticulos() {
    try {
        const d = await SGA.estadisticas.articulosAnalisis({ dias: DIAS });

        destroy('art-rotacion');
        charts['art-rotacion'] = new Chart(get('chart-art-rotacion'), {
            type: 'bar',
            data: {
                labels: d.rotacion.map(r => trunc(r.nombre || r.articulo, 18)),
                datasets: [{ label: 'Unidades movidas', data: d.rotacion.map(r => r.unidades_movidas),
                    backgroundColor: 'rgba(37,99,192,.7)', borderColor: BLUE, borderWidth: 1, borderRadius: 4, maxBarThickness: 40 }],
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, grid: { color: '#f3f4f6' } },
                          y: { grid: { display: false }, ticks: { font: { size: 10 } } } } },
        });

        const topFamilias = d.por_familia.slice(0, 8);
        destroy('art-familia');
        charts['art-familia'] = new Chart(get('chart-art-familia'), {
            type: 'doughnut',
            data: {
                labels: topFamilias.map(r => r.familia),
                datasets: [{ data: topFamilias.map(r => r.stock_total),
                    backgroundColor: PAL.slice(0, topFamilias.length).map(c => c + 'cc'),
                    borderColor: PAL.slice(0, topFamilias.length), borderWidth: 2 }],
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '50%',
                plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } } },
        });

        document.getElementById('tabla-sin-mov').innerHTML = d.sin_movimiento.length
            ? `<div class="data-table-wrap"><table>
                <thead><tr><th>Artículo</th><th>Nombre</th><th class="num">Stock inmovilizado</th><th>Último movimiento</th></tr></thead>
                <tbody>${d.sin_movimiento.map(r => `<tr>
                    <td><strong>${r.articulo}</strong></td>
                    <td>${r.nombre ?? ''}</td>
                    <td class="num"><span class="badge badge-amber">${fmt(r.stock)}</span></td>
                    <td>${r.ultimo_mov}</td>
                </tr>`).join('')}</tbody>
               </table></div>`
            : '<div class="placeholder-msg">✅ Todos los artículos con stock han tenido movimiento recientemente.</div>';
    } catch (e) { console.error(e); }
}

// ── UTILIDADES ────────────────────────────────────────────────────────────────
function fmt(n)    { return Number(n ?? 0).toLocaleString('es-ES'); }
function trunc(s, n) { s = s || ''; return s.length > n ? s.slice(0, n) + '…' : s; }
function get(id)   { return document.getElementById(id); }
function setText(id, v) { const el = get(id); if (el) el.textContent = v; }
function destroy(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }

// ── ACTUALIZAR TODO ───────────────────────────────────────────────────────────
function recargarTodo() {
    Object.keys(loaded).forEach(k => delete loaded[k]);
    cargarResumen();
    const activeTab = document.querySelector('.tab-btn-inf.active')?.dataset.tab;
    if (activeTab && activeTab !== 'resumen') cargarTab(activeTab);
}

document.getElementById('btn-refresh').addEventListener('click', recargarTodo);
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); recargarTodo(); } });

// ── ARRANQUE ──────────────────────────────────────────────────────────────────
cargarResumen();
