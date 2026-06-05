'use strict';

let _datos = [];
let _sortCol = 'deficit';
let _sortAsc = false;
let _autoTimer = null;
const AUTO_MS = 5 * 60 * 1000;

// ── API ────────────────────────────────────────────────────────
function params() {
    return new URLSearchParams({
        buscar:    document.getElementById('f-buscar').value.trim(),
        severidad: document.getElementById('f-severidad').value,
    });
}

async function cargar() {
    try {
        _datos = await fetch('/estadisticas/alertas-stock?' + params()).then(r => {
            if (!r.ok) throw new Error(r.status);
            return r.json();
        });
        renderKpis(_datos);
        renderTabla(_datos);
        document.getElementById('as-ts').textContent =
            'Actualizado: ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        document.getElementById('as-count').textContent =
            _datos.length + ' artículo' + (_datos.length !== 1 ? 's' : '');
    } catch {
        document.getElementById('as-tbody').innerHTML =
            '<tr class="as-placeholder"><td colspan="8">Error al conectar con el servidor.</td></tr>';
    }
}

// ── KPIs ───────────────────────────────────────────────────────
function renderKpis(rows) {
    const total   = rows.length;
    const critico = rows.filter(r => r.severidad === 'critico').length;
    const alto    = rows.filter(r => r.severidad === 'alto').length;
    const medio   = rows.filter(r => r.severidad === 'medio').length;
    document.getElementById('kpi-total').textContent   = total;
    document.getElementById('kpi-critico').textContent = critico;
    document.getElementById('kpi-alto').textContent    = alto;
    document.getElementById('kpi-medio').textContent   = medio;
}

// ── TABLA ──────────────────────────────────────────────────────
const SEV_LABEL = { critico: '🔴 Crítico', alto: '🟠 Alto', medio: '🟡 Medio' };

function renderTabla(rows) {
    const sorted = [...rows].sort((a, b) => {
        const va = a[_sortCol] ?? '';
        const vb = b[_sortCol] ?? '';
        const cmp = typeof va === 'number'
            ? va - vb
            : String(va).localeCompare(String(vb), 'es');
        return _sortAsc ? cmp : -cmp;
    });

    const tbody = document.getElementById('as-tbody');
    if (!sorted.length) {
        tbody.innerHTML = '<tr class="as-placeholder"><td colspan="9">No hay artículos bajo mínimo con los filtros aplicados. ✅</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(r => {
        const pct = r.stock_minimo > 0
            ? Math.min(100, Math.round((r.stock_actual / r.stock_minimo) * 100))
            : 0;
        const sev = r.severidad || 'medio';
        return `<tr class="sev-${sev}">
            <td><code>${esc(r.articulo)}</code></td>
            <td>${esc(r.nombre)}</td>
            <td class="num">${fmt(r.stock_minimo)}</td>
            <td class="num">${r.stock_maximo > 0 ? fmt(r.stock_maximo) : '—'}</td>
            <td class="num"><strong>${fmt(r.stock_actual)}</strong></td>
            <td class="num" style="color:#dc2626;font-weight:700">+${fmt(r.deficit)}</td>
            <td>
                <div class="cov-bar-wrap">
                    <div class="cov-bar-bg">
                        <div class="cov-bar-fill ${sev}" style="width:${pct}%"></div>
                    </div>
                    <span class="cov-pct">${pct}%</span>
                </div>
            </td>
            <td class="as-ubicaciones">${esc(r.ubicaciones || '—')}</td>
            <td><span class="sev-badge ${sev}">${SEV_LABEL[sev]}</span></td>
        </tr>`;
    }).join('');
}

function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n) {
    return Number(n ?? 0).toLocaleString('es-ES');
}

// ── ORDENACIÓN ─────────────────────────────────────────────────
document.querySelectorAll('#as-tabla thead th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (_sortCol === col) {
            _sortAsc = !_sortAsc;
        } else {
            _sortCol = col;
            _sortAsc = col !== 'deficit';
        }
        document.querySelectorAll('#as-tabla thead th').forEach(t => t.classList.remove('sorted'));
        th.classList.add('sorted');
        th.querySelector('.sort-arrow').textContent = _sortAsc ? '▲' : '▼';
        renderTabla(_datos);
    });
});

// ── EXPORTAR CSV ───────────────────────────────────────────────
document.getElementById('btn-exportar').addEventListener('click', () => {
    if (!_datos.length) return;
    const cols = ['articulo', 'nombre', 'stock_minimo', 'stock_maximo', 'stock_actual', 'deficit', 'severidad'];
    const head = ['Artículo', 'Nombre', 'Mínimo', 'Máximo', 'Actual', 'Déficit', 'Severidad'];
    const esc_csv = v => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [head.join(','), ..._datos.map(r => cols.map(c => esc_csv(r[c])).join(','))];
    const blob  = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'alertas-stock-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
});

// ── AUTO-REFRESH ───────────────────────────────────────────────
function arrancarAuto() {
    _autoTimer = setInterval(() => { cargar(); }, AUTO_MS);
    document.getElementById('as-auto-badge').textContent = '↻ Auto 5 min';
    document.getElementById('as-auto-badge').classList.remove('paused');
}

// ── EVENTOS ────────────────────────────────────────────────────
document.getElementById('btn-buscar').addEventListener('click', cargar);
document.getElementById('btn-actualizar').addEventListener('click', cargar);
document.getElementById('f-buscar').addEventListener('keydown', e => { if (e.key === 'Enter') cargar(); });
document.getElementById('f-severidad').addEventListener('change', cargar);

// ── INIT ───────────────────────────────────────────────────────
cargar();
arrancarAuto();
