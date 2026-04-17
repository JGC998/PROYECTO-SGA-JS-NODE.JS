let datosCache = [];

async function cargarDatos() {
    const tabla = document.getElementById('tabla-select').value;
    const tbody = document.getElementById('tbody');
    const thead = document.getElementById('thead');

    tbody.innerHTML = '<tr><td colspan="100%">Cargando datos...</td></tr>';

    try {
        const res = await fetch(`http://localhost:3000/datos/${tabla}`);
        datosCache = await res.json();

        if (datosCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="100%">Tabla vacía</td></tr>';
            return;
        }

        // 1. Generar Cabeceras automáticas
        const columnas = Object.keys(datosCache[0]);
        thead.innerHTML = `<tr>${columnas.map(c => `<th>${c}</th>`).join('')}</tr>`;

        // 2. Mostrar Filas
        renderizar(datosCache);

    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="100%" style="color:red">Error al conectar con la API</td></tr>';
    }
}

function renderizar(lista) {
    const tbody = document.getElementById('tbody');
    tbody.innerHTML = lista.map(fila => `
        <tr>${Object.values(fila).map(val => `<td>${val ?? ''}</td>`).join('')}</tr>
    `).join('');
}

// Evento: Cambio de tabla
document.getElementById('tabla-select').addEventListener('change', cargarDatos);

// Evento: Buscador en tiempo real
document.getElementById('buscador').addEventListener('keyup', (e) => {
    const busqueda = e.target.value.toLowerCase();
    const filtrados = datosCache.filter(fila =>
        Object.values(fila).some(v => String(v).toLowerCase().includes(busqueda))
    );
    renderizar(filtrados);
});

// Carga inicial al abrir la página
window.onload = cargarDatos;