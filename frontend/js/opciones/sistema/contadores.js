async function cargarContadores() {
    const grid = document.getElementById('grid-contadores');
    const loading = document.createElement('p');
    loading.style.padding = '20px';
    loading.textContent = 'Cargando contadores...';
    grid.replaceChildren(loading);
    try {
        const data = await SGA.contadores.get();
        const labels = {
            articulos:    'Artículos',
            proveedores:  'Proveedores',
            clientes:     'Clientes',
            operarios:    'Operarios',
            almacenes:    'Almacenes',
            ubicaciones:  'Ubicaciones',
            stock_activo: 'Líneas de stock activo',
            movimientos:  'Movimientos registrados',
        };
        const cards = Object.entries(data).map(([key, val]) => {
            const card  = document.createElement('div');
            card.className = 'contador-card';
            const valor = document.createElement('div');
            valor.className = 'contador-valor';
            valor.textContent = Number(val).toLocaleString('es-ES');
            const label = document.createElement('div');
            label.className = 'contador-label';
            label.textContent = labels[key] ?? key;
            card.append(valor, label);
            return card;
        });
        grid.replaceChildren(...cards);
    } catch {
        const err = document.createElement('p');
        err.style.cssText = 'padding:20px;color:red';
        err.textContent = 'Error al cargar los contadores.';
        grid.replaceChildren(err);
    }
}

document.getElementById('btn-actualizar').addEventListener('click', cargarContadores);
cargarContadores();
