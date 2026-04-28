document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });

async function cargarDatos() {
    const btn = document.getElementById('btn-actualizar');
    btn.textContent = 'Cargando...';
    btn.disabled = true;

    try {
        const data = await SGA.articulosSinReposicion.list();
        renderTabla(data);
    } catch {
        document.getElementById('tbody-asr').innerHTML =
            '<tr class="placeholder-row"><td colspan="3">Error al conectar con el servidor.</td></tr>';
    } finally {
        btn.textContent = 'Actualizar (F5)';
        btn.disabled = false;
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-asr');
    const filtro = document.getElementById('f-articulo').value.toLowerCase();
    const filtradas = filtro ? rows.filter(r => String(r.articulo ?? '').toLowerCase().includes(filtro) || String(r.nombre ?? '').toLowerCase().includes(filtro)) : rows;

    if (!filtradas.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="3">No hay artículos sin reposición automática.</td></tr>';
        return;
    }
    tbody.innerHTML = filtradas.map((r, i) => `
        <tr>
            <td class="col-num">${i + 1}</td>
            <td>${r.articulo ?? ''}</td>
            <td>${r.nombre ?? ''}</td>
        </tr>`).join('');
}

cargarDatos();
