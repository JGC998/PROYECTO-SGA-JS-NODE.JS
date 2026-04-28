let todosProveedores = [];

async function cargarProveedores() {
    const tbody = document.getElementById('tbody-proveedores');
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Cargando proveedores...</td></tr>';
    try {
        todosProveedores = await SGA.proveedores.list();
        renderTabla(todosProveedores);
    } catch {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Error al conectar con el servidor.</td></tr>';
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-proveedores');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">No se encontraron proveedores.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td><strong>${r.codigo ?? ''}</strong></td>
            <td>${r.nombre ?? r.razon_social ?? ''}</td>
            <td>${r.direccion ?? ''}</td>
            <td>${r.contacto ?? ''}</td>
            <td>${r.email ?? ''}</td>
            <td>${r.localidad ?? ''}</td>
            <td>
                <button class="btn-icon" title="Editar" onclick="editarProveedor('${r.codigo}')">✏️</button>
                <button class="btn-icon" title="Ver Albaranes">📋</button>
            </td>
        </tr>`).join('');
}

function editarProveedor(cod) {
    // placeholder para futura ficha de proveedor
    console.log('Editar proveedor:', cod);
}

document.querySelector('.search-bar').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderTabla(todosProveedores.filter(r =>
        Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))
    ));
});

cargarProveedores();
