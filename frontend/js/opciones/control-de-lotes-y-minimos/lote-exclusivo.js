"use strict";

let todosRegistros = [];

document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
document.getElementById('btn-nuevo').addEventListener('click', () => abrirModal(null));
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });

const fCliente = document.getElementById('f-cliente');
const fArticulo = document.getElementById('f-articulo');
fCliente.addEventListener('input', filtrar);
fArticulo.addEventListener('input', filtrar);

function filtrar() {
    const qCli = fCliente.value.toLowerCase().trim();
    const qArt = fArticulo.value.toLowerCase().trim();
    renderTabla(todosRegistros.filter(r =>
        (!qCli || String(r.cliente ?? '').trim().toLowerCase().includes(qCli) || String(r.nombre_cliente ?? '').trim().toLowerCase().includes(qCli)) &&
        (!qArt || String(r.articulo ?? '').trim().toLowerCase().includes(qArt) || String(r.nombre_articulo ?? '').trim().toLowerCase().includes(qArt))
    ));
}

async function cargarDatos() {
    const btn = document.getElementById('btn-actualizar');
    btn.textContent = 'Cargando...';
    btn.disabled = true;
    try {
        todosRegistros = await SGA.loteExclusivo.list();
        renderTabla(todosRegistros);
    } catch {
        document.getElementById('tbody-lexclusivo').innerHTML =
            '<tr class="placeholder-row"><td colspan="7">Error al conectar con el servidor.</td></tr>';
    } finally {
        btn.textContent = 'Actualizar (F5)';
        btn.disabled = false;
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-lexclusivo');
    if (!rows.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="7">No hay lotes exclusivos registrados.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map((r, i) => `
        <tr data-idx="${i}">
            <td class="col-num">${i + 1}</td>
            <td><strong>${String(r.cliente ?? '').trim()}</strong></td>
            <td>${String(r.nombre_cliente ?? '').trim()}</td>
            <td><strong>${String(r.articulo ?? '').trim()}</strong></td>
            <td>${String(r.nombre_articulo ?? '').trim()}</td>
            <td>${String(r.lote_exclusivo ?? '').trim()}</td>
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
    if (!confirm(`¿Eliminar el lote exclusivo "${r.lote_exclusivo ?? ''}" del cliente "${r.cliente ?? ''}" y artículo "${r.articulo ?? ''}"?`)) return;
    try {
        await SGA.loteExclusivo.delete(r.id);
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

    const campo = (label, id, val, readonly = false) => `
        <div style="margin-bottom:14px">
            <label style="display:block;font-size:.78rem;font-weight:700;color:#374151;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">${label}</label>
            <input id="le-${id}" type="text" value="${(val ?? '').toString().replace(/"/g, '&quot;')}" ${readonly ? 'readonly' : ''}
                style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:.9rem;box-sizing:border-box;font-family:inherit${readonly ? ';background:#f9fafb;color:#6b7280' : ''}">
        </div>`;

    modal.innerHTML = `
        <div style="font-weight:700;font-size:1.05rem;margin-bottom:20px;color:#1e3a5f">
            ${esNuevo ? 'Nuevo lote exclusivo' : 'Editar lote exclusivo'}
        </div>
        ${campo('Cliente', 'cliente', r?.cliente, !esNuevo)}
        ${campo('Artículo', 'articulo', r?.articulo, !esNuevo)}
        ${campo('Lote exclusivo', 'lote', r?.lote_exclusivo)}
        <div id="le-error" style="display:none;color:#dc2626;font-size:.82rem;margin-bottom:10px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
            <button id="le-cancel" style="padding:9px 18px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:.85rem">Cancelar</button>
            <button id="le-save" style="padding:9px 20px;border:none;border-radius:6px;background:#2563c0;color:#fff;font-weight:700;cursor:pointer;font-size:.85rem">💾 Guardar</button>
        </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('#le-cliente').focus();

    function cerrar() { document.body.removeChild(overlay); }
    modal.querySelector('#le-cancel').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    modal.querySelector('#le-save').addEventListener('click', async () => {
        const btn = modal.querySelector('#le-save');
        const errEl = modal.querySelector('#le-error');

        const cliente = modal.querySelector('#le-cliente').value.trim();
        const articulo = modal.querySelector('#le-articulo').value.trim();
        const lote_exclusivo = modal.querySelector('#le-lote').value.trim();

        if (!cliente) { errEl.textContent = 'El campo Cliente es obligatorio.'; errEl.style.display = 'block'; return; }
        if (!articulo) { errEl.textContent = 'El campo Artículo es obligatorio.'; errEl.style.display = 'block'; return; }
        if (!lote_exclusivo) { errEl.textContent = 'El campo Lote exclusivo es obligatorio.'; errEl.style.display = 'block'; return; }

        btn.disabled = true;
        btn.textContent = 'Guardando...';
        errEl.style.display = 'none';

        try {
            await SGA.loteExclusivo.save([{ id: r?.id ?? 'new', cliente, articulo, lote_exclusivo }]);
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

cargarDatos();
