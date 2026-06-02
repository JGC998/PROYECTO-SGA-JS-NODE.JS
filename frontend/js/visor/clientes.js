"use strict";

let todos = [];

async function cargar() {
    const tbody = document.getElementById('tbody-visor-clientes');
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px">Cargando...</td></tr>';
    try {
        todos = await SGA.clientes.list();
        render(todos);
    } catch {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px">Error al conectar con el servidor.</td></tr>';
    }
}

function render(rows) {
    const tbody = document.getElementById('tbody-visor-clientes');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px">No se encontraron clientes.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map((r, i) => `
        <tr data-idx="${i}">
            <td>${i + 1}</td>
            <td><strong>${(r.codigo ?? '').trim()}</strong></td>
            <td>${(r.nombre ?? r.razon_social ?? '').trim()}</td>
            <td>${(r.cif ?? '').trim()}</td>
            <td>${(r.direccion ?? '').trim()}</td>
            <td>${(r.localidad ?? '').trim()}</td>
            <td>${(r.telefono ?? '').trim()}</td>
            <td>${(r.email ?? '').trim()}</td>
            <td style="white-space:nowrap">
                <button class="btn-icon btn-editar" data-idx="${i}" title="Editar">✏️</button>
                <button class="btn-icon btn-albaranes" data-idx="${i}" title="Ver albaranes">📋</button>
            </td>
        </tr>`).join('');

    tbody.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', function () {
            editarCliente(rows[parseInt(this.dataset.idx)]);
        });
    });

    tbody.querySelectorAll('.btn-albaranes').forEach(btn => {
        btn.addEventListener('click', function () {
            verAlbaranes(rows[parseInt(this.dataset.idx)]);
        });
    });
}

function editarCliente(r) {
    const cod = (r.codigo || '').trim();

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:10px;padding:28px;width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.18);font-family:inherit';

    const campo = (label, id, val) => `
        <div style="margin-bottom:14px">
            <label style="display:block;font-size:.78rem;font-weight:700;color:#374151;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">${label}</label>
            <input id="cli-${id}" type="text" value="${(val || '').trim().replace(/"/g, '&quot;')}"
                style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:.9rem;box-sizing:border-box;font-family:inherit">
        </div>`;

    modal.innerHTML = `
        <div style="font-weight:700;font-size:1.05rem;margin-bottom:4px;color:#1e3a5f">Editar cliente</div>
        <div style="font-size:.82rem;color:#6b7280;margin-bottom:20px">Código: <strong>${cod}</strong></div>
        ${campo('Nombre', 'nombre', r.nombre)}
        ${campo('Razón social', 'razon_social', r.razon_social)}
        ${campo('Dirección', 'direccion', r.direccion)}
        ${campo('Localidad', 'localidad', r.localidad)}
        ${campo('CIF / NIF', 'cif', r.cif)}
        ${campo('Teléfono', 'telefono', r.telefono)}
        ${campo('Persona de contacto', 'contacto', r.contacto)}
        ${campo('Email', 'email', r.email)}
        <div id="cli-error" style="display:none;color:#dc2626;font-size:.82rem;margin-bottom:10px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
            <button id="cli-cancel" style="padding:9px 18px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:.85rem">Cancelar</button>
            <button id="cli-save" style="padding:9px 20px;border:none;border-radius:6px;background:#2563c0;color:#fff;font-weight:700;cursor:pointer;font-size:.85rem">💾 Guardar</button>
        </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function cerrar() { document.body.removeChild(overlay); }
    modal.querySelector('#cli-cancel').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    modal.querySelector('#cli-save').addEventListener('click', async () => {
        const btn   = modal.querySelector('#cli-save');
        const errEl = modal.querySelector('#cli-error');
        btn.disabled = true;
        btn.textContent = 'Guardando...';
        errEl.style.display = 'none';

        const datos = {
            nombre:       modal.querySelector('#cli-nombre').value.trim(),
            razon_social: modal.querySelector('#cli-razon_social').value.trim(),
            direccion:    modal.querySelector('#cli-direccion').value.trim(),
            localidad:    modal.querySelector('#cli-localidad').value.trim(),
            cif:          modal.querySelector('#cli-cif').value.trim(),
            telefono:     modal.querySelector('#cli-telefono').value.trim(),
            contacto:     modal.querySelector('#cli-contacto').value.trim(),
            email:        modal.querySelector('#cli-email').value.trim(),
        };

        try {
            await SGA.clientes.update(r.codigo.trim(), datos);
            Object.assign(r, datos);
            render(todos);
            cerrar();
        } catch (e) {
            errEl.textContent = 'Error al guardar: ' + (e.message || 'desconocido');
            errEl.style.display = 'block';
            btn.disabled = false;
            btn.textContent = '💾 Guardar';
        }
    });
}

function verAlbaranes(r) {
    const cod = (r.codigo || '').trim();
    const nom = (r.nombre || r.razon_social || cod).trim();

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:10px;padding:24px;width:700px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.18);font-family:inherit';

    modal.innerHTML = `
        <div style="font-weight:700;font-size:1.05rem;color:#1e3a5f;margin-bottom:2px">Salidas del cliente</div>
        <div style="font-size:.82rem;color:#6b7280;margin-bottom:16px">${nom} · <strong>${cod}</strong></div>
        <div id="alb-tabla" style="flex:1;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;min-height:80px">
            <div style="text-align:center;padding:24px;color:#9ca3af;font-size:.85rem">Cargando...</div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px">
            <button id="alb-cerrar" style="padding:9px 18px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:.85rem">Cerrar</button>
        </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function cerrar() { document.body.removeChild(overlay); }
    modal.querySelector('#alb-cerrar').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    SGA.movimientos.list({ cliente: cod, pageSize: 200 })
        .then(function (data) {
            const rows = (Array.isArray(data) ? data : []).filter(m => m.tipo === 'PC' || m.tipo === 'SA');
            const tabla = modal.querySelector('#alb-tabla');
            if (!rows.length) {
                tabla.innerHTML = '<div style="text-align:center;padding:24px;color:#9ca3af;font-size:.85rem">Sin salidas registradas para este cliente.</div>';
                return;
            }
            tabla.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:.82rem">
                <thead>
                    <tr style="background:#f9fafb">
                        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:.72rem;text-transform:uppercase">Fecha</th>
                        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:.72rem;text-transform:uppercase">Artículo</th>
                        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:.72rem;text-transform:uppercase">Ubicación</th>
                        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:.72rem;text-transform:uppercase">Lote</th>
                        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:.72rem;text-transform:uppercase">Cantidad</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(m => `<tr style="border-bottom:1px solid #f3f4f6">
                        <td style="padding:8px 12px">${m.fecha || ''}</td>
                        <td style="padding:8px 12px"><strong>${(m.articulo || '').trim()}</strong></td>
                        <td style="padding:8px 12px">${(m.ubicacion || '').trim()}</td>
                        <td style="padding:8px 12px">${(m.lote || '').trim()}</td>
                        <td style="padding:8px 12px;text-align:right;color:#dc2626;font-weight:700">−${m.cantidad || 0}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
        })
        .catch(function () {
            modal.querySelector('#alb-tabla').innerHTML = '<div style="text-align:center;padding:24px;color:#dc2626;font-size:.85rem">Error al cargar las salidas.</div>';
        });
}

document.querySelector('.search-bar').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    render(todos.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))));
});

cargar();
