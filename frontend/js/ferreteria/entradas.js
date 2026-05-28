const lineas = [];
let lineaIdx = 0;

const $ = id => document.getElementById(id);

function setFechaHoy() {
    $('ent-fecha').value = new Date().toISOString().split('T')[0];
}

async function buscarProveedor() {
    const cod = $('ent-prov-cod').value.trim();
    if (!cod) return;
    try {
        const p = await SGA.proveedores.get(cod);
        $('ent-prov-nombre').value = p.nombre ?? '';
    } catch {
        $('ent-prov-nombre').value = 'Proveedor no encontrado';
    }
}

async function buscarArticulo() {
    const cod = $('ent-art-cod').value.trim();
    if (!cod) return;
    try {
        const a = await SGA.articulos.get(cod);
        $('ent-art-nombre').value = a.nombre ?? '';
        calcularTotal();
    } catch {
        $('ent-art-nombre').value = 'Artículo no encontrado';
    }
}

function calcularTotal() {
    const cant = parseFloat($('ent-cantidad').value) || 0;
    const precio = parseFloat($('ent-precio').value) || 0;
    const dto = parseFloat($('ent-dto').value) || 0;
    const total = cant * precio * (1 - dto / 100);
    $('ent-total').value = total.toFixed(2) + ' €';
}

function agregarLinea() {
    const art = $('ent-art-cod').value.trim();
    if (!art) return;
    lineaIdx++;
    const linea = {
        idx: lineaIdx,
        articulo: art,
        nombre: $('ent-art-nombre').value,
        cantidad: $('ent-cantidad').value,
        precio: $('ent-precio').value,
        total: $('ent-total').value,
    };
    lineas.push(linea);
    renderLineas();
    limpiarDetalle();
}

function renderLineas() {
    const tbody = document.getElementById('tbody-entradas');
    if (!lineas.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="6">Escanee o introduzca artículos para visualizar la carga actual...</td></tr>';
        return;
    }
    tbody.innerHTML = lineas.map(l => `
        <tr>
            <td>${l.articulo}</td>
            <td>${l.nombre}</td>
            <td>${l.cantidad}</td>
            <td>${l.precio}</td>
            <td>${l.total}</td>
            <td><button class="btn-icon" onclick="eliminarLinea(${l.idx})">🗑️</button></td>
        </tr>`).join('');
}

function eliminarLinea(idx) {
    const i = lineas.findIndex(l => l.idx === idx);
    if (i !== -1) lineas.splice(i, 1);
    renderLineas();
}

function limpiarDetalle() {
    ['ent-art-cod', 'ent-art-nombre', 'ent-cantidad', 'ent-precio', 'ent-dto', 'ent-total'].forEach(id => $('$id') && ($('$id').value = ''));
    $('ent-art-cod') && ($('ent-art-cod').value = '');
    $('ent-art-nombre') && ($('ent-art-nombre').value = '');
    $('ent-cantidad') && ($('ent-cantidad').value = '');
    $('ent-precio') && ($('ent-precio').value = '');
    $('ent-dto') && ($('ent-dto').value = '');
    $('ent-total') && ($('ent-total').value = '');
}

async function guardarEntrada() {
    if (!lineas.length) return alert('Añada al menos una línea.');
    const datos = {
        fecha: $('ent-fecha').value,
        proveedor: $('ent-prov-cod').value,
        albaran: $('ent-albaran').value,
        lineas,
    };
    try {
        await SGA.entradas.save(datos);
        alert('Entrada registrada correctamente.');
        lineas.length = 0;
        renderLineas();
        limpiarDetalle();
    } catch {
        alert('Error al registrar la entrada.');
    }
}

function limpiarFormulario() {
    document.querySelector('form').reset();
    setFechaHoy();
    lineas.length = 0;
    renderLineas();
}

setFechaHoy();
$('ent-prov-cod')?.addEventListener('change', buscarProveedor);
$('ent-art-cod')?.addEventListener('change', buscarArticulo);
['ent-cantidad', 'ent-precio', 'ent-dto'].forEach(id => $(`${id}`)?.addEventListener('input', calcularTotal));
document.querySelector('.btn-add')?.addEventListener('click', agregarLinea);
document.querySelectorAll('.toolbar-actions .btn-tool')[0]?.addEventListener('click', guardarEntrada);
document.querySelectorAll('.toolbar-actions .btn-tool')[1]?.addEventListener('click', limpiarFormulario);
