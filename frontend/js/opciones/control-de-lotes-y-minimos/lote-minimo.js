"use strict";

let todosRegistros = [];

document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });

const fCliente = document.getElementById('f-cliente');
fCliente.addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderTabla(todosRegistros.filter(r =>
        String(r.cliente ?? '').toLowerCase().includes(q) ||
        String(r.nombre_cliente ?? '').toLowerCase().includes(q)
    ));
});

async function cargarDatos() {
    const btn = document.getElementById('btn-actualizar');
    btn.textContent = 'Cargando...';
    btn.disabled = true;
    try {
        todosRegistros = await SGA.loteMinimo.list();
        renderTabla(todosRegistros);
    } catch {
        document.getElementById('tbody-lminimo').innerHTML =
            '<tr class="placeholder-row"><td colspan="4">Error al conectar con el servidor.</td></tr>';
    } finally {
        btn.textContent = 'Actualizar (F5)';
        btn.disabled = false;
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-lminimo');
    if (!rows.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="4">No se encontraron clientes.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map((r, i) => `
        <tr data-idx="${i}">
            <td class="col-num">${i + 1}</td>
            <td><strong>${r.cliente ?? ''}</strong></td>
            <td>${r.nombre_cliente ?? ''}</td>
            <td>${r.dias ?? 0}</td>
            <td style="white-space:nowrap">
                <button class="btn-icon btn-editar" data-idx="${i}" title="Editar días">✏️</button>
            </td>
        </tr>`).join('');

    tbody.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', function () {
            editarDias(rows[parseInt(this.dataset.idx)]);
        });
    });
}

function editarDias(r) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:10px;padding:28px;width:380px;box-shadow:0 8px 32px rgba(0,0,0,.18);font-family:inherit';

    modal.innerHTML = `
        <div style="font-weight:700;font-size:1.05rem;margin-bottom:4px;color:#1e3a5f">Editar días mínimos</div>
        <div style="font-size:.82rem;color:#6b7280;margin-bottom:20px">
            Cliente: <strong>${(r.cliente ?? '').trim()}</strong> · ${(r.nombre_cliente ?? '').trim()}
        </div>
        <div style="margin-bottom:18px">
            <label style="display:block;font-size:.78rem;font-weight:700;color:#374151;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Días mínimos</label>
            <input id="dias-input" type="number" min="0" value="${r.dias ?? 0}"
                style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:.9rem;box-sizing:border-box;font-family:inherit">
        </div>
        <div id="dias-error" style="display:none;color:#dc2626;font-size:.82rem;margin-bottom:10px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
            <button id="dias-cancel" style="padding:9px 18px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:.85rem">Cancelar</button>
            <button id="dias-save" style="padding:9px 20px;border:none;border-radius:6px;background:#2563c0;color:#fff;font-weight:700;cursor:pointer;font-size:.85rem">💾 Guardar</button>
        </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const input = modal.querySelector('#dias-input');
    input.focus();
    input.select();

    function cerrar() { document.body.removeChild(overlay); }

    modal.querySelector('#dias-cancel').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    input.addEventListener('keydown', e => { if (e.key === 'Enter') modal.querySelector('#dias-save').click(); });

    modal.querySelector('#dias-save').addEventListener('click', async () => {
        const btn = modal.querySelector('#dias-save');
        const errEl = modal.querySelector('#dias-error');
        const dias = parseInt(input.value, 10);

        if (!Number.isFinite(dias) || dias < 0) {
            errEl.textContent = 'Introduce un número de días válido (≥ 0).';
            errEl.style.display = 'block';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Guardando...';
        errEl.style.display = 'none';

        try {
            await SGA.loteMinimo.save([{ cliente: r.cliente, dias }]);
            r.dias = dias;
            renderTabla(todosRegistros);
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
