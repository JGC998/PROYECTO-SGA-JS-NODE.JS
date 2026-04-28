let rowCount = 0;

document.getElementById('btn-actualizar')?.addEventListener('click', cargarDatos);
document.getElementById('btn-nuevo')?.addEventListener('click', agregarFila);
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });

async function cargarDatos() {
    try {
        const data = await SGA.loteCuarentena.list();
        renderTabla(data);
    } catch {
        console.error('Error al cargar lotes en cuarentena');
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-lcuarentena');
    rowCount = rows.length;
    if (!rows.length) { agregarFila(); return; }
    tbody.innerHTML = rows.map((r, i) => `
        <tr class="edit-row" data-id="${r.id ?? ''}">
            <td class="col-num">${i + 1}</td>
            <td><input type="text" class="cell-input" value="${r.articulo ?? ''}"></td>
            <td><input type="text" class="cell-input" value="${r.nombre ?? ''}" readonly></td>
            <td><input type="text" class="cell-input" value="${r.lote ?? ''}"></td>
            <td><input type="text" class="cell-input" value="${r.observaciones ?? ''}"></td>
        </tr>`).join('');
}

function agregarFila() {
    rowCount++;
    const tbody = document.getElementById('tbody-lcuarentena');
    const tr = document.createElement('tr');
    tr.className = 'edit-row';
    tr.dataset.id = `new-${rowCount}`;
    tr.innerHTML = `
        <td class="col-num">${rowCount}</td>
        <td><input type="text" class="cell-input" placeholder="Artículo"></td>
        <td><input type="text" class="cell-input" readonly></td>
        <td><input type="text" class="cell-input" placeholder="Lote"></td>
        <td><input type="text" class="cell-input" placeholder="Observaciones"></td>`;
    tbody.appendChild(tr);
    tr.querySelector('input').focus();
}

cargarDatos();
