let terminales = [];
let currentIdx = 0;

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
});

async function cargarTerminales() {
    try {
        terminales = await SGA.terminales.list();
        if (terminales.length) mostrarTerminal(0);
    } catch {
        console.error('Error al cargar terminales');
    }
}

function mostrarTerminal(idx) {
    currentIdx = idx;
    const t = terminales[idx];
    document.getElementById('f-codigo').value = t.codigo ?? '';
    document.getElementById('f-nombre').value = t.nombre ?? '';
    document.getElementById('f-serie').value = t.serie ?? '';
    document.getElementById('f-ficheros-com').value = t.ficheros_com ?? '';
    document.getElementById('f-ruta-sinc').value = t.ruta_sinc ?? '';
    document.getElementById('f-ruta-wifi').value = t.ruta_wifi ?? '';
}

document.getElementById('btn-prev').addEventListener('click', () => {
    if (currentIdx > 0) mostrarTerminal(currentIdx - 1);
});
document.getElementById('btn-next').addEventListener('click', () => {
    if (currentIdx < terminales.length - 1) mostrarTerminal(currentIdx + 1);
});

document.getElementById('btn-nuevo').addEventListener('click', () => {
    ['f-codigo', 'f-nombre', 'f-serie', 'f-ficheros-com', 'f-ruta-sinc', 'f-ruta-wifi']
        .forEach(id => document.getElementById(id).value = '');
    document.getElementById('f-codigo').focus();
});

document.getElementById('btn-guardar').addEventListener('click', async () => {
    const datos = {
        codigo: document.getElementById('f-codigo').value,
        nombre: document.getElementById('f-nombre').value,
        serie: document.getElementById('f-serie').value,
        ficheros_com: document.getElementById('f-ficheros-com').value,
        ruta_sinc: document.getElementById('f-ruta-sinc').value,
        ruta_wifi: document.getElementById('f-ruta-wifi').value,
    };
    if (!datos.codigo) return alert('Introduzca un código de terminal.');
    try {
        await SGA.terminales.save(datos);
        await cargarTerminales();
        alert('Terminal guardado.');
    } catch {
        alert('Error al guardar el terminal.');
    }
});

cargarTerminales();
