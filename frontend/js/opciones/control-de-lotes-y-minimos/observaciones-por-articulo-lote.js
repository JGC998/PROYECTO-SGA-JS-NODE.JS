let rowCount = 0;

document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });
document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
document.getElementById('btn-nuevo').addEventListener('click', agregarFila);
document.getElementById('btn-guardar').addEventListener('click', guardarCambios);

async function cargarDatos() {
    const articulo = document.getElementById('f-articulo').value.trim();
    if (!articulo) return;
    try {
        const data = await SGA.observaciones.list({ articulo });
        renderTabla(data);
    } catch {
        console.error('Error al cargar observaciones');
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-obs');
    rowCount = rows.length;
    if (!rows.length) { agregarFila(); return; }
    tbody.innerHTML = rows.map((r, i) => `
        <tr class="edit-row" data-id="${r.id ?? ''}">
            <td class="col-num">${i + 1}</td>
            <td><input type="text" class="cell-input" value="${r.articulo ?? ''}" placeholder="Artículo"></td>
            <td><input type="text" class="cell-input cell-wide" value="${r.nombre ?? ''}" readonly placeholder="Nombre"></td>
            <td><input type="text" class="cell-input" value="${r.lote ?? ''}" placeholder="Lote"></td>
            <td><input type="text" class="cell-input cell-obs" value="${r.observaciones ?? ''}" placeholder="Observaciones"></td>
        </tr>`).join('');
}

function agregarFila() {
    rowCount++;
    const tbody = document.getElementById('tbody-obs');
    const tr = document.createElement('tr');
    tr.className = 'edit-row';
    tr.dataset.id = `new-${rowCount}`;
    tr.innerHTML = `
        <td class="col-num">${rowCount}</td>
        <td><input type="text" class="cell-input" placeholder="Artículo"></td>
        <td><input type="text" class="cell-input cell-wide" placeholder="Nombre" readonly></td>
        <td><input type="text" class="cell-input" placeholder="Lote"></td>
        <td><input type="text" class="cell-input cell-obs" placeholder="Observaciones"></td>`;
    tbody.appendChild(tr);
    tr.querySelector('input').focus();
}

async function guardarCambios() {
    const filas = [...document.querySelectorAll('#tbody-obs .edit-row')].map(tr => {
        const inputs = tr.querySelectorAll('input');
        return { articulo: inputs[0].value, lote: inputs[2].value, observaciones: inputs[3].value };
    }).filter(f => f.articulo);
    try {
        await SGA.observaciones.save(filas);
        alert('Observaciones guardadas.');
    } catch {
        alert('Error al guardar.');
    }
}
