const lineas = [];
let lineaIdx = 0;

const $ = id => document.getElementById(id);

function setFechaHoy() {
    $('sal-fecha').value = new Date().toISOString().split('T')[0];
}

async function buscarOperario() {
    const cod = $('sal-op-cod').value.trim();
    if (!cod) return;
    try {
        const op = await SGA.operarios.get(cod);
        $('sal-op-nombre').value = op.nombre ?? '';
    } catch {
        $('sal-op-nombre').value = 'Operario no encontrado';
    }
}

async function buscarArticulo() {
    const cod = $('sal-art-cod').value.trim();
    if (!cod) return;
    try {
        const a = await SGA.articulos.get(cod);
        $('sal-art-nombre').value = a.nombre ?? '';
        const stk = await SGA.stock.get(cod);
        const total = stk.reduce ? stk.reduce((s, r) => s + (r.stock || 0), 0) : (stk.stock || 0);
        $('sal-stock').value = total;
    } catch {
        $('sal-art-nombre').value = 'Artículo no encontrado';
        $('sal-stock').value = '0';
    }
}

function agregarLinea() {
    const art = $('sal-art-cod').value.trim();
    if (!art) return;
    const cant = parseFloat($('sal-cantidad').value) || 0;
    const stock = parseFloat($('sal-stock').value) || 0;
    if (cant > stock) return alert(`Stock insuficiente. Disponible: ${stock}`);
    lineaIdx++;
    lineas.push({
        idx: lineaIdx,
        articulo: art,
        nombre: $('sal-art-nombre').value,
        cantidad: cant,
        ubicacion: '',
    });
    renderLineas();
    $('sal-art-cod').value = '';
    $('sal-art-nombre').value = '';
    $('sal-stock').value = '';
    $('sal-cantidad').value = '';
}

function renderLineas() {
    const tbody = document.getElementById('tbody-salidas');
    if (!lineas.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="5">No hay materiales seleccionados para la salida.</td></tr>';
        return;
    }
    tbody.innerHTML = lineas.map(l => `
        <tr>
            <td>${l.articulo}</td>
            <td>${l.nombre}</td>
            <td>${l.cantidad}</td>
            <td>${l.ubicacion}</td>
            <td><button class="btn-icon" onclick="eliminarLinea(${l.idx})">🗑️</button></td>
        </tr>`).join('');
}

function eliminarLinea(idx) {
    const i = lineas.findIndex(l => l.idx === idx);
    if (i !== -1) lineas.splice(i, 1);
    renderLineas();
}

async function registrarSalida() {
    if (!lineas.length) return alert('Añada al menos una línea.');
    const datos = {
        fecha: $('sal-fecha').value,
        operario: $('sal-op-cod').value,
        destino: $('sal-destino').value,
        ot: $('sal-ot').value,
        lineas,
    };
    try {
        await SGA.salidas.save(datos);
        alert('Salida registrada correctamente.');
        lineas.length = 0;
        renderLineas();
    } catch {
        alert('Error al registrar la salida.');
    }
}

setFechaHoy();
$('sal-op-cod')?.addEventListener('change', buscarOperario);
$('sal-art-cod')?.addEventListener('change', buscarArticulo);
document.querySelector('.btn-add')?.addEventListener('click', agregarLinea);
document.querySelectorAll('.toolbar-actions .btn-tool')[0]?.addEventListener('click', registrarSalida);
