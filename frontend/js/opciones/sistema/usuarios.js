"use strict";

let todosUsuarios = [];

document.getElementById('btn-actualizar').addEventListener('click', cargarUsuarios);
document.getElementById('btn-nuevo').addEventListener('click', () => abrirModal(null));
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarUsuarios(); } });

document.querySelector('.search-bar').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderTabla(todosUsuarios.filter(r =>
        Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))
    ));
});

async function cargarUsuarios() {
    const btn = document.getElementById('btn-actualizar');
    btn.textContent = 'Cargando...';
    btn.disabled = true;
    try {
        todosUsuarios = await SGA.usuarios.list();
        renderTabla(todosUsuarios);
    } catch {
        document.getElementById('tbody-usuarios').innerHTML =
            '<tr class="placeholder-row"><td colspan="5">Error al conectar con el servidor.</td></tr>';
    } finally {
        btn.textContent = 'Actualizar (F5)';
        btn.disabled = false;
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-usuarios');
    if (!rows.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="5">No se encontraron usuarios.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map((r, i) => `
        <tr data-idx="${i}">
            <td><strong>${r.codigo ?? ''}</strong></td>
            <td>${r.nombre ?? ''}</td>
            <td>${r.tipo ?? ''}</td>
            <td>${r.nivel ?? ''}</td>
            <td style="white-space:nowrap">
                <button class="btn-icon btn-editar" data-idx="${i}" title="Editar">✏️</button>
                <button class="btn-icon btn-icon-danger btn-eliminar" data-idx="${i}" title="Borrar">🗑️</button>
            </td>
        </tr>`).join('');

    tbody.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', function () {
            abrirModal(rows[parseInt(this.dataset.idx)]);
        });
    });
    tbody.querySelectorAll('.btn-eliminar').forEach(btn => {
        btn.addEventListener('click', function () {
            borrarUsuario(rows[parseInt(this.dataset.idx)]);
        });
    });
}

async function borrarUsuario(r) {
    if (!confirm(`¿Borrar el usuario "${r.nombre}" (${r.codigo})?`)) return;
    try {
        await SGA.usuarios.delete(r.codigo);
        await cargarUsuarios();
    } catch {
        alert('Error al borrar el usuario.');
    }
}

function abrirModal(r) {
    const esNuevo = !r;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:10px;padding:28px;width:400px;box-shadow:0 8px 32px rgba(0,0,0,.18);font-family:inherit';

    const campo = (label, id, val, readonly = false) => `
        <div style="margin-bottom:14px">
            <label style="display:block;font-size:.78rem;font-weight:700;color:#374151;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">${label}</label>
            <input id="usu-${id}" type="text" value="${(val ?? '').toString().replace(/"/g, '&quot;')}" ${readonly ? 'readonly' : ''}
                style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:.9rem;box-sizing:border-box;font-family:inherit${readonly ? ';background:#f9fafb;color:#6b7280' : ''}">
        </div>`;

    modal.innerHTML = `
        <div style="font-weight:700;font-size:1.05rem;margin-bottom:20px;color:#1e3a5f">
            ${esNuevo ? 'Nuevo usuario' : 'Editar usuario'}
        </div>
        ${campo('Código', 'codigo', r?.codigo, !esNuevo)}
        ${campo('Nombre', 'nombre', r?.nombre)}
        ${campo('Tipo', 'tipo', r?.tipo)}
        ${campo('Nivel', 'nivel', r?.nivel)}
        <div id="usu-error" style="display:none;color:#dc2626;font-size:.82rem;margin-bottom:10px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
            <button id="usu-cancel" style="padding:9px 18px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:.85rem">Cancelar</button>
            <button id="usu-save" style="padding:9px 20px;border:none;border-radius:6px;background:#2563c0;color:#fff;font-weight:700;cursor:pointer;font-size:.85rem">💾 Guardar</button>
        </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('#usu-' + (esNuevo ? 'codigo' : 'nombre')).focus();

    function cerrar() { document.body.removeChild(overlay); }
    modal.querySelector('#usu-cancel').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    modal.querySelector('#usu-save').addEventListener('click', async () => {
        const btn = modal.querySelector('#usu-save');
        const errEl = modal.querySelector('#usu-error');

        const codigo = modal.querySelector('#usu-codigo').value.trim();
        const nombre = modal.querySelector('#usu-nombre').value.trim();
        const tipo   = modal.querySelector('#usu-tipo').value.trim();
        const nivel  = modal.querySelector('#usu-nivel').value.trim();

        if (!codigo) { errEl.textContent = 'El código es obligatorio.'; errEl.style.display = 'block'; return; }
        if (!nombre) { errEl.textContent = 'El nombre es obligatorio.'; errEl.style.display = 'block'; return; }

        btn.disabled = true;
        btn.textContent = 'Guardando...';
        errEl.style.display = 'none';

        try {
            await SGA.usuarios.save({ codigo, nombre, tipo, nivel });
            await cargarUsuarios();
            cerrar();
        } catch (e) {
            errEl.textContent = 'Error al guardar: ' + (e.message || 'desconocido');
            errEl.style.display = 'block';
            btn.disabled = false;
            btn.textContent = '💾 Guardar';
        }
    });
}

cargarUsuarios();
