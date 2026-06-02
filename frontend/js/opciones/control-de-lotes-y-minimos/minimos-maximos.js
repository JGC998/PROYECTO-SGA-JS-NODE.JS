"use strict";

let todosRegistros = [];

document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
document.getElementById('btn-nuevo').addEventListener('click', () => abrirModal(null));
document.getElementById('btn-exportar').addEventListener('click', exportarCSV);
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });

document.getElementById('f-articulo').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    renderTabla(todosRegistros.filter(r =>
        String(r.articulo ?? '').trim().toLowerCase().includes(q) ||
        String(r.nombre ?? '').trim().toLowerCase().includes(q)
    ));
});

async function cargarDatos() {
    const btn = document.getElementById('btn-actualizar');
    btn.textContent = 'Cargando...';
    btn.disabled = true;
    try {
        todosRegistros = await SGA.minimosMaximos.list();
        renderTabla(todosRegistros);
    } catch {
        document.getElementById('tbody-minmax').innerHTML =
            '<tr class="placeholder-row"><td colspan="8">Error al conectar con el servidor.</td></tr>';
    } finally {
        btn.textContent = 'Actualizar (F5)';
        btn.disabled = false;
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-minmax');
    if (!rows.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="8">No hay artículos con mínimos/máximos configurados.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map((r, i) => `
        <tr data-idx="${i}">
            <td class="col-num">${i + 1}</td>
            <td><strong>${String(r.articulo ?? '').trim()}</strong></td>
            <td>${String(r.nombre ?? '').trim()}</td>
            <td>${r.stock_minimo ?? 0}</td>
            <td>${r.stock_maximo ?? 0}</td>
            <td>${r.stock_actual ?? 0}</td>
            <td style="white-space:nowrap">
                <button class="btn-icon btn-editar" data-idx="${i}" title="Editar">✏️</button>
                <button class="btn-icon btn-eliminar" data-idx="${i}" title="Eliminar">🗑️</button>
            </td>
        </tr>`).join('');

    tbody.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', function () {
            abrirModal(rows[parseInt(this.dataset.idx)]);
        });
    });
    tbody.querySelectorAll('.btn-eliminar').forEach(btn => {
        btn.addEventListener('click', function () {
            eliminar(rows[parseInt(this.dataset.idx)]);
        });
    });
}

async function eliminar(r) {
    if (!confirm(`¿Eliminar la configuración de mínimos/máximos del artículo "${String(r.articulo ?? '').trim()}"?`)) return;
    try {
        await SGA.minimosMaximos.delete(String(r.articulo).trim());
        await cargarDatos();
    } catch {
        alert('Error al eliminar el registro.');
    }
}

function abrirModal(r) {
    const esNuevo = !r;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:10px;padding:28px;width:420px;box-shadow:0 8px 32px rgba(0,0,0,.18);font-family:inherit';

    const campo = (label, id, val, type = 'text', readonly = false) => `
        <div style="margin-bottom:14px">
            <label style="display:block;font-size:.78rem;font-weight:700;color:#374151;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">${label}</label>
            <input id="mm-${id}" type="${type}" value="${(val ?? '').toString().replace(/"/g, '&quot;')}" ${readonly ? 'readonly' : ''} ${type === 'number' ? 'min="0"' : ''}
                style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:.9rem;box-sizing:border-box;font-family:inherit${readonly ? ';background:#f9fafb;color:#6b7280' : ''}">
        </div>`;

    modal.innerHTML = `
        <div style="font-weight:700;font-size:1.05rem;margin-bottom:20px;color:#1e3a5f">
            ${esNuevo ? 'Nuevo artículo' : 'Editar mínimos/máximos'}
        </div>
        ${campo('Artículo', 'articulo', r?.articulo, 'text', !esNuevo)}
        ${!esNuevo ? `<div style="margin-bottom:14px;font-size:.82rem;color:#6b7280">${String(r?.nombre ?? '').trim()}</div>` : ''}
        ${campo('Stock mínimo', 'stock_minimo', r?.stock_minimo ?? 0, 'number')}
        ${campo('Stock máximo', 'stock_maximo', r?.stock_maximo ?? 0, 'number')}
        <div id="mm-error" style="display:none;color:#dc2626;font-size:.82rem;margin-bottom:10px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
            <button id="mm-cancel" style="padding:9px 18px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:.85rem">Cancelar</button>
            <button id="mm-save" style="padding:9px 20px;border:none;border-radius:6px;background:#2563c0;color:#fff;font-weight:700;cursor:pointer;font-size:.85rem">💾 Guardar</button>
        </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('#mm-articulo').focus();

    function cerrar() { document.body.removeChild(overlay); }
    modal.querySelector('#mm-cancel').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    modal.querySelector('#mm-save').addEventListener('click', async () => {
        const btn = modal.querySelector('#mm-save');
        const errEl = modal.querySelector('#mm-error');

        const articulo = modal.querySelector('#mm-articulo').value.trim();
        const stock_minimo = parseInt(modal.querySelector('#mm-stock_minimo').value, 10);
        const stock_maximo = parseInt(modal.querySelector('#mm-stock_maximo').value, 10);
        if (!articulo) { errEl.textContent = 'El campo Artículo es obligatorio.'; errEl.style.display = 'block'; return; }
        if (!Number.isFinite(stock_minimo) || stock_minimo < 0) { errEl.textContent = 'Stock mínimo debe ser un número ≥ 0.'; errEl.style.display = 'block'; return; }
        if (!Number.isFinite(stock_maximo) || stock_maximo < 0) { errEl.textContent = 'Stock máximo debe ser un número ≥ 0.'; errEl.style.display = 'block'; return; }

        btn.disabled = true;
        btn.textContent = 'Guardando...';
        errEl.style.display = 'none';

        try {
            await SGA.minimosMaximos.save([{ articulo, stock_minimo, stock_maximo }]);
            await cargarDatos();
            cerrar();
        } catch (e) {
            errEl.textContent = 'Error al guardar: ' + (e.message || 'desconocido');
            errEl.style.display = 'block';
            btn.disabled = false;
            btn.textContent = '💾 Guardar';
        }
    });
}

function exportarCSV() {
    if (!todosRegistros.length) { alert('No hay datos para exportar.'); return; }
    const cabecera = ['Artículo', 'Nombre', 'Stock mínimo', 'Stock máximo', 'Stock actual'];
    const filas = todosRegistros.map(r => [
        String(r.articulo ?? '').trim(),
        String(r.nombre ?? '').trim(),
        r.stock_minimo ?? 0,
        r.stock_maximo ?? 0,
        r.stock_actual ?? 0,
    ].join(';'));
    const csv = [cabecera.join(';'), ...filas].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `minimos-maximos_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

cargarDatos();
