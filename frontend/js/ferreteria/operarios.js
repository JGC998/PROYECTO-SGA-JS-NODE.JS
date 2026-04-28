let todosOperarios = [];

async function cargarOperarios() {
    const tbody = document.getElementById('tbody-operarios');
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Cargando operarios...</td></tr>';
    try {
        todosOperarios = await SGA.operarios.list();
        renderTabla(todosOperarios);
        document.getElementById('total-operarios').textContent = todosOperarios.length;
    } catch {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Error al conectar con el servidor.</td></tr>';
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-operarios');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">No se encontraron operarios.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td><strong>${r.codigo ?? ''}</strong></td>
            <td>${r.nombre ?? ''}</td>
            <td>${r.direccion ?? ''}</td>
            <td>${r.telefono ?? ''}</td>
            <td>${r.email ?? ''}</td>
            <td><span class="badge active">Activo</span></td>
            <td>
                <button class="btn-icon" title="Editar">✏️</button>
            </td>
        </tr>`).join('');
}

document.querySelector('.search-bar').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderTabla(todosOperarios.filter(r =>
        Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))
    ));
});

cargarOperarios();
