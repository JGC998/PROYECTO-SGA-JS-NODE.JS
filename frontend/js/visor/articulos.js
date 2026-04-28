let todos = [];

async function cargar() {
    const tbody = document.getElementById('tbody-visor-articulos');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px">Cargando...</td></tr>';
    try {
        todos = await SGA.visor.articulos();
        render(todos);
    } catch {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px">Error al conectar con el servidor.</td></tr>';
    }
}

function render(rows) {
    const tbody = document.getElementById('tbody-visor-articulos');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px">No se encontraron artículos.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td>${r.articulo ?? ''}</td>
            <td>${r.nombre ?? ''}</td>
            <td>${r.familia ?? ''}</td>
            <td>${r.stock ?? ''}</td>
            <td>${r.ubicacion ?? ''}</td>
            <td>${r.ultimo_movimiento ? r.ultimo_movimiento.substring(0, 10) : ''}</td>
        </tr>`).join('');
}

document.querySelector('.search-bar').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    render(todos.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))));
});

cargar();
