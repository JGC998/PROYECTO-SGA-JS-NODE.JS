document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
});

const [inputDesde, inputHasta] = document.querySelectorAll('.input-date');
const btnRefresh = document.querySelector('.btn-refresh');
const tbodyPedidos = document.querySelector('#tab-pedidos-cliente tbody');

async function cargarDatos() {
    const params = {};
    if (inputDesde) params.desde = inputDesde.value;
    if (inputHasta) params.hasta = inputHasta.value;

    tbodyPedidos.innerHTML = '<tr class="placeholder-row"><td colspan="10">Cargando...</td></tr>';
    try {
        const data = await SGA.expediciones.list(params);
        if (!data.length) {
            tbodyPedidos.innerHTML = '<tr class="placeholder-row"><td colspan="10">No hay pedidos en el periodo seleccionado.</td></tr>';
            return;
        }
        tbodyPedidos.innerHTML = data.map(r => `
            <tr>
                <td></td>
                <td></td>
                <td>${r.albaran ?? ''}</td>
                <td></td>
                <td></td>
                <td>${r.cliente ?? ''}</td>
                <td></td>
                <td>${r.nombre_cliente ?? ''}</td>
                <td>${r.picking ?? ''}</td>
                <td>${r.fecha ?? ''}</td>
            </tr>`).join('');
    } catch {
        tbodyPedidos.innerHTML = '<tr class="placeholder-row"><td colspan="10">Error al conectar con el servidor.</td></tr>';
    }
}

if (btnRefresh) btnRefresh.addEventListener('click', cargarDatos);
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });

cargarDatos();
