document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });

async function cargarDatos() {
    const btn = document.getElementById('btn-actualizar');
    btn.textContent = 'Cargando...';
    btn.disabled = true;

    const params = {
        articulo: document.getElementById('f-articulo').value,
        desde: document.getElementById('f-desde').value,
        hasta: document.getElementById('f-hasta').value,
    };

    try {
        const data = await SGA.regularizaciones.list(params);
        renderTabla(data);
    } catch {
        document.getElementById('tbody-reg').innerHTML =
            '<tr class="placeholder-row"><td colspan="9">Error al conectar con el servidor.</td></tr>';
    } finally {
        btn.textContent = 'Actualizar (F5)';
        btn.disabled = false;
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-reg');
    if (!rows.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="9">No se encontraron regularizaciones.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td>${r.fecha ?? ''}</td>
            <td>${r.serie ?? ''}/${r.numero ?? ''}</td>
            <td>${r.articulo ?? ''}</td>
            <td>${r.nombre ?? ''}</td>
            <td>${r.ubicacion ?? ''}</td>
            <td>${r.lote ?? ''}</td>
            <td class="col-num">${r.cantidad ?? ''}</td>
            <td>${r.tercero ?? ''}</td>
            <td>${r.nombre_tercero ?? ''}</td>
        </tr>`).join('');
}

// Inicializar fechas
const hoy = new Date().toISOString().split('T')[0];
const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
document.getElementById('f-desde').value = hace30;
document.getElementById('f-hasta').value = hoy;
