let almacenes = [];
let idx = 0;

const $ = id => document.getElementById(id);

async function cargarAlmacenes() {
    try {
        almacenes = await SGA.almacenes.list();
        if (almacenes.length) mostrar(0);
    } catch {
        console.error('Error al cargar almacenes');
    }
}

function mostrar(i) {
    idx = i;
    const a = almacenes[i] ?? {};
    $('alm-codigo').value = a.codigo ?? '';
    $('alm-nombre').value = a.nombre ?? '';
}

async function guardar() {
    const datos = { codigo: $('alm-codigo').value.trim(), nombre: $('alm-nombre').value.trim() };
    if (!datos.codigo) return alert('Introduzca un código de almacén.');
    try {
        await SGA.almacenes.save(datos);
        await cargarAlmacenes();
        alert('Almacén guardado.');
    } catch {
        alert('Error al guardar el almacén.');
    }
}

function limpiar() {
    $('alm-codigo').value = '';
    $('alm-nombre').value = '';
    $('alm-codigo').focus();
}

function borrar() {
    if (!confirm('¿Eliminar este almacén?')) return;
    almacenes.splice(idx, 1);
    mostrar(Math.max(0, idx - 1));
}

$('btn-guardar')?.addEventListener('click', guardar);
$('btn-limpiar')?.addEventListener('click', limpiar);
$('btn-borrar')?.addEventListener('click', borrar);
$('btn-prev')?.addEventListener('click', () => { if (idx > 0) mostrar(idx - 1); });
$('btn-next')?.addEventListener('click', () => { if (idx < almacenes.length - 1) mostrar(idx + 1); });

cargarAlmacenes();
