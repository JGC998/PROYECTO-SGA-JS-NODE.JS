let rowCount = 0;

document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
document.getElementById('btn-nuevo').addEventListener('click', agregarFila);
document.getElementById('btn-guardar').addEventListener('click', guardarCambios);
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });

async function cargarDatos() {
    const params = {};
    const cliente = document.getElementById('f-cliente').value.trim();
    const articulo = document.getElementById('f-articulo').value.trim();
    if (cliente) params.cliente = cliente;
    if (articulo) params.articulo = articulo;
    try {
        const data = await SGA.loteExclusivo.list(params);
        renderTabla(data);
    } catch {
        console.error('Error al cargar lote exclusivo');
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-lexclusivo');
    rowCount = rows.length;
    if (!rows.length) { agregarFila(); return; }
    tbody.innerHTML = rows.map((r, i) => `
        <tr class="edit-row" data-id="${r.id ?? ''}">
            <td class="col-num">${i + 1}</td>
            <td><input type="text" class="cell-input" value="${r.cliente ?? ''}"></td>
            <td><input type="text" class="cell-input" value="${r.nombre_cliente ?? ''}" readonly></td>
            <td><input type="text" class="cell-input" value="${r.articulo ?? ''}"></td>
            <td><input type="text" class="cell-input" value="${r.nombre_articulo ?? ''}" readonly></td>
            <td><input type="text" class="cell-input" value="${r.lote_exclusivo ?? ''}"></td>
        </tr>`).join('');
}

function agregarFila() {
    rowCount++;
    const tbody = document.getElementById('tbody-lexclusivo');
    const tr = document.createElement('tr');
    tr.className = 'edit-row';
    tr.dataset.id = `new-${rowCount}`;
    tr.innerHTML = `
        <td class="col-num">${rowCount}</td>
        <td><input type="text" class="cell-input" placeholder="Cliente"></td>
        <td><input type="text" class="cell-input" readonly></td>
        <td><input type="text" class="cell-input" placeholder="Artículo"></td>
        <td><input type="text" class="cell-input" readonly></td>
        <td><input type="text" class="cell-input" placeholder="Lote exclusivo"></td>`;
    tbody.appendChild(tr);
    tr.querySelector('input').focus();
}

async function guardarCambios() {
    const filas = [...document.querySelectorAll('#tbody-lexclusivo .edit-row')].map(tr => {
        const inputs = tr.querySelectorAll('input');
        return { cliente: inputs[0].value, articulo: inputs[2].value, lote_exclusivo: inputs[4].value };
    }).filter(f => f.cliente || f.articulo);
    try {
        await SGA.loteExclusivo.save(filas);
        alert('Lote exclusivo guardado.');
    } catch {
        alert('Error al guardar.');
    }
}

cargarDatos();
