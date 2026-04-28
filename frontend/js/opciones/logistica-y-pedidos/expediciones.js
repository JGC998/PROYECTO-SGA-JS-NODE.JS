document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
});

const tbodyCliente = document.querySelector('#tab-pedidos-cliente tbody');
const searchInput = document.querySelector('#tab-pedidos-cliente .input-sm');

async function cargarPedidosCliente(buscar = '') {
    tbodyCliente.innerHTML = '<tr class="placeholder-row"><td colspan="11">Cargando...</td></tr>';
    try {
        const data = await SGA.expediciones.list({ buscar });
        if (!data.length) {
            tbodyCliente.innerHTML = '<tr class="placeholder-row"><td colspan="11">No hay pedidos de cliente para mostrar.</td></tr>';
            return;
        }
        tbodyCliente.innerHTML = data.map(r => `
            <tr>
                <td><input type="checkbox"></td>
                <td></td>
                <td>${r.albaran ?? ''}</td>
                <td></td>
                <td></td>
                <td>${r.cliente ?? ''}</td>
                <td></td>
                <td></td>
                <td>${r.nombre_cliente ?? ''}</td>
                <td>${r.picking ?? ''}</td>
                <td>${r.fecha ?? ''}</td>
            </tr>`).join('');
    } catch {
        tbodyCliente.innerHTML = '<tr class="placeholder-row"><td colspan="11">Error al conectar con el servidor.</td></tr>';
    }
}

if (searchInput) {
    let timer;
    searchInput.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => cargarPedidosCliente(searchInput.value), 300);
    });
}

cargarPedidosCliente();
