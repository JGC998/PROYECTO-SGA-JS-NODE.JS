const lineas = [];
let lineaIdx = 0;

const $ = id => document.getElementById(id);

function setFechaHoy() {
    $('tra-fecha').value = new Date().toISOString().split('T')[0];
}

async function buscarOperario() {
    const cod = $('tra-op-cod').value.trim();
    if (!cod) return;
    try {
        const op = await SGA.operarios.get(cod);
        $('tra-op-nombre').value = op.nombre ?? '';
    } catch {
        $('tra-op-nombre').value = 'Operario no encontrado';
    }
}

async function buscarArticuloOrigen() {
    const cod = $('tra-art-cod').value.trim();
    if (!cod) return;
    try {
        const a = await SGA.articulos.get(cod);
        $('tra-art-nombre').value = a.nombre ?? '';
        const stk = await SGA.stock.get(cod);
        const total = Array.isArray(stk) ? stk.reduce((s, r) => s + (r.stock || 0), 0) : (stk.stock || 0);
        $('tra-stock').value = total;
    } catch {
        $('tra-art-nombre').value = 'Artículo no encontrado';
        $('tra-stock').value = '0';
    }
}

function agregarLinea() {
    const art = $('tra-art-cod').value.trim();
    if (!art) return;
    const cant = parseFloat($('tra-cantidad').value) || 0;
    const stock = parseFloat($('tra-stock').value) || 0;
    if (cant > stock) return alert(`Stock insuficiente. Disponible: ${stock}`);
    lineaIdx++;
    lineas.push({
        idx: lineaIdx,
        articulo: art,
        nombre: $('tra-art-nombre').value,
        cantidad: cant,
        ori: $('tra-ori-ubi').value,
        des: $('tra-des-ubi').value,
    });
    renderLineas();
}

function renderLineas() {
    const tbody = document.getElementById('tbody-traspasos');
    if (!lineas.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="6">No hay líneas añadidas al traspaso.</td></tr>';
        return;
    }
    tbody.innerHTML = lineas.map(l => `
        <tr>
            <td>${l.articulo}</td>
            <td>${l.nombre}</td>
            <td>${l.cantidad}</td>
            <td>${l.ori}</td>
            <td>${l.des}</td>
            <td><button class="btn-icon" onclick="eliminarLinea(${l.idx})">🗑️</button></td>
        </tr>`).join('');
}

function eliminarLinea(idx) {
    const i = lineas.findIndex(l => l.idx === idx);
    if (i !== -1) lineas.splice(i, 1);
    renderLineas();
}

async function confirmarTraspaso() {
    if (!lineas.length) return alert('Añada al menos una línea.');
    const datos = {
        fecha: $('tra-fecha').value,
        operario: $('tra-op-cod').value,
        motivo: $('tra-motivo').value,
        lineas,
    };
    try {
        await SGA.traspasos.save(datos);
        alert('Traspaso confirmado correctamente.');
        lineas.length = 0;
        renderLineas();
    } catch {
        alert('Error al confirmar el traspaso.');
    }
}

setFechaHoy();
$('tra-op-cod')?.addEventListener('change', buscarOperario);
$('tra-art-cod')?.addEventListener('change', buscarArticuloOrigen);
document.querySelector('.btn-add')?.addEventListener('click', agregarLinea);
document.querySelectorAll('.toolbar-actions .btn-tool')[0]?.addEventListener('click', confirmarTraspaso);
