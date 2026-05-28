let todosArticulos = [];

async function cargarArticulos() {
    const tbody = document.getElementById('tbody-articulos');
    tbody.innerHTML = '<tr><td colspan="10" class="loading">Cargando catálogo...</td></tr>';
    try {
        todosArticulos = await SGA.articulos.list();
        renderTabla(todosArticulos);
    } catch {
        tbody.innerHTML = '<tr><td colspan="10" class="loading">Error al conectar con el servidor.</td></tr>';
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-articulos');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="loading">No se encontraron artículos.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td>${r.articulo ?? ''}</td>
            <td>${r.nombre ?? ''}</td>
            <td>${r.stock_minimo ?? ''}</td>
            <td>${r.stock_maximo ?? ''}</td>
            <td>${r.precio_costo != null ? Number(r.precio_costo).toFixed(2) : ''}</td>
            <td>${r.dto ?? ''}</td>
            <td>${r.color ?? ''}</td>
            <td>${r.medida ?? ''}</td>
            <td>${r.material ?? ''}</td>
            <td>${r.codigo ?? ''}</td>
        </tr>`).join('');
}

document.getElementById('buscador-articulos').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderTabla(todosArticulos.filter(r =>
        Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))
    ));
});

cargarArticulos();
