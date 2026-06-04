"use strict";

let todosRegistros = [];

document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
document.getElementById('btn-nuevo').addEventListener('click', () => abrirModal(null));
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });

async function cargarDatos() {
    const btn = document.getElementById('btn-actualizar');
    btn.textContent = 'Cargando...';
    btn.disabled = true;
    try {
        todosRegistros = await SGA.loteCuarentena.list();
        renderTabla(todosRegistros);
    } catch {
        document.getElementById('tbody-lcuarentena').innerHTML =
            '<tr class="placeholder-row"><td colspan="6">Error al conectar con el servidor.</td></tr>';
    } finally {
        btn.textContent = 'Actualizar (F5)';
        btn.disabled = false;
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-lcuarentena');
    if (!rows.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="6">No hay lotes en cuarentena registrados.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map((r, i) => `
        <tr data-idx="${i}">
            <td class="col-num">${i + 1}</td>
            <td><strong>${r.articulo ?? ''}</strong></td>
            <td>${r.nombre ?? ''}</td>
            <td>${r.lote ?? ''}</td>
            <td>${r.observaciones ?? ''}</td>
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
            eliminarRegistro(rows[parseInt(this.dataset.idx)]);
        });
    });
}

async function eliminarRegistro(r) {
    if (!confirm(`¿Eliminar el lote "${r.lote ?? ''}" del artículo "${r.articulo ?? ''}"?`)) return;
    try {
        await SGA.loteCuarentena.delete(r.id);
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

    const campo = (label, id, val, opts = '') => `
        <div style="margin-bottom:14px">
            <label style="display:block;font-size:.78rem;font-weight:700;color:#374151;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">${label}</label>
            <input id="lc-${id}" type="text" value="${(val ?? '').toString().replace(/"/g, '&quot;')}" ${opts}
                style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:.9rem;box-sizing:border-box;font-family:inherit">
        </div>`;

    modal.innerHTML = `
        <div style="font-weight:700;font-size:1.05rem;margin-bottom:20px;color:#1e3a5f">
            ${esNuevo ? 'Nuevo lote en cuarentena' : 'Editar lote en cuarentena'}
        </div>
        ${campo('Artículo', 'articulo', r?.articulo, esNuevo ? '' : 'readonly')}
        ${esNuevo ? '' : `<div style="margin-bottom:14px;font-size:.82rem;color:#6b7280">${r?.nombre ?? ''}</div>`}
        ${campo('Lote', 'lote', r?.lote, esNuevo ? '' : 'readonly')}
        ${campo('Observaciones', 'observaciones', r?.observaciones)}
        <div id="lc-error" style="display:none;color:#dc2626;font-size:.82rem;margin-bottom:10px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
            <button id="lc-cancel" style="padding:9px 18px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:.85rem">Cancelar</button>
            <button id="lc-save" style="padding:9px 20px;border:none;border-radius:6px;background:#2563c0;color:#fff;font-weight:700;cursor:pointer;font-size:.85rem">💾 Guardar</button>
        </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('#lc-articulo').focus();

    function cerrar() { document.body.removeChild(overlay); }

    modal.querySelector('#lc-cancel').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    modal.querySelector('#lc-save').addEventListener('click', async () => {
        const btn = modal.querySelector('#lc-save');
        const errEl = modal.querySelector('#lc-error');

        const articulo = modal.querySelector('#lc-articulo').value.trim();
        const lote = modal.querySelector('#lc-lote').value.trim();
        const observaciones = modal.querySelector('#lc-observaciones').value.trim();

        if (!articulo) {
            errEl.textContent = 'El campo Artículo es obligatorio.';
            errEl.style.display = 'block';
            return;
        }
        if (!lote) {
            errEl.textContent = 'El campo Lote es obligatorio.';
            errEl.style.display = 'block';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Guardando...';
        errEl.style.display = 'none';

        try {
            await SGA.loteCuarentena.save([{ id: r?.id ?? 'new-0', articulo, lote, observaciones }]);
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
