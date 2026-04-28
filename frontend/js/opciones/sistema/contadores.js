async function cargarContadores() {
    const grid = document.getElementById('grid-contadores');
    grid.innerHTML = '<p style="padding:20px">Cargando contadores...</p>';
    try {
        const data = await SGA.contadores.get();
        const labels = {
            articulos: 'Artículos',
            proveedores: 'Proveedores',
            clientes: 'Clientes',
            operarios: 'Operarios',
            almacenes: 'Almacenes',
            ubicaciones: 'Ubicaciones',
            stock_activo: 'Líneas de stock activo',
            movimientos: 'Movimientos registrados',
        };
        grid.innerHTML = Object.entries(data).map(([key, val]) => `
            <div class="contador-card">
                <div class="contador-valor">${Number(val).toLocaleString('es-ES')}</div>
                <div class="contador-label">${labels[key] ?? key}</div>
            </div>`).join('');
    } catch {
        grid.innerHTML = '<p style="padding:20px;color:red">Error al cargar los contadores.</p>';
    }
}

document.getElementById('btn-actualizar').addEventListener('click', cargarContadores);
cargarContadores();
