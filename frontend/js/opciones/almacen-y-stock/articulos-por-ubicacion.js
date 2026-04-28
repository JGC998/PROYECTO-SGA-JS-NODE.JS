document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });

async function cargarDatos() {
    const btn = document.getElementById('btn-actualizar');
    btn.textContent = 'Cargando...';
    btn.disabled = true;

    const params = {
        ubicacion: document.getElementById('f-ubicacion').value,
        articulo: document.getElementById('f-articulo').value,
    };

    try {
        const data = await SGA.articulosPorUbicacion.list(params);
        renderTabla(data);
    } catch {
        document.getElementById('tbody-apu').innerHTML =
            '<tr class="placeholder-row"><td colspan="9">Error al conectar con el servidor.</td></tr>';
    } finally {
        btn.textContent = 'Actualizar (F5)';
        btn.disabled = false;
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-apu');
    if (!rows.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="9">No se encontraron artículos con los filtros indicados.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td class="col-check"><input type="checkbox"></td>
            <td></td>
            <td>${r.ubicacion ?? ''}</td>
            <td>${r.etiqueta ?? ''}</td>
            <td>${r.articulo ?? ''}</td>
            <td>${r.nombre ?? ''}</td>
            <td class="col-num">${r.stock_minimo ?? ''}</td>
            <td class="col-num">${r.stock_maximo ?? ''}</td>
            <td>${r.exclusiva ? 'Sí' : 'No'}</td>
        </tr>`).join('');
}
