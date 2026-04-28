let todos = [];

async function cargar() {
    const tbody = document.getElementById('tbody-visor-proveedores');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px">Cargando...</td></tr>';
    try {
        todos = await SGA.visor.proveedores();
        render(todos);
    } catch {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px">Error al conectar con el servidor.</td></tr>';
    }
}

function render(rows) {
    const tbody = document.getElementById('tbody-visor-proveedores');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px">No se encontraron proveedores.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td>${r.codigo ?? ''}</td>
            <td>${r.nombre ?? ''}</td>
            <td>${r.cif ?? ''}</td>
            <td>${r.telefono ?? ''}</td>
            <td>${r.localidad ?? ''}</td>
        </tr>`).join('');
}

document.querySelector('.search-bar').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    render(todos.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))));
});

cargar();
