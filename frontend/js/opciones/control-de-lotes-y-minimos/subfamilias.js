let rowCount = 0;

document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });
document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
document.getElementById('btn-nuevo').addEventListener('click', agregarFila);
document.getElementById('btn-guardar').addEventListener('click', guardarCambios);

async function cargarDatos() {
    try {
        const data = await SGA.subfamilias.list();
        renderTabla(data);
    } catch {
        console.error('Error al cargar subfamilias');
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-subfamilias');
    rowCount = rows.length;
    tbody.innerHTML = rows.map((r, i) => `
        <tr class="edit-row" data-id="${r.id ?? ''}">
            <td class="col-num">${i + 1}</td>
            <td><input type="text" class="cell-input cell-code" value="${r.codigo ?? ''}" placeholder="Código"></td>
            <td><input type="text" class="cell-input cell-wide" value="${r.nombre ?? ''}" placeholder="Nombre de subfamilia"></td>
            <td class="col-check"><input type="checkbox" class="cell-check" ${r.sin_control_lote ? 'checked' : ''}></td>
        </tr>`).join('');
    if (!rows.length) agregarFila();
}

function agregarFila() {
    rowCount++;
    const tbody = document.getElementById('tbody-subfamilias');
    const tr = document.createElement('tr');
    tr.className = 'edit-row';
    tr.dataset.id = `new-${rowCount}`;
    tr.innerHTML = `
        <td class="col-num">${rowCount}</td>
        <td><input type="text" class="cell-input cell-code" placeholder="Código"></td>
        <td><input type="text" class="cell-input cell-wide" placeholder="Nombre de subfamilia"></td>
        <td class="col-check"><input type="checkbox" class="cell-check"></td>`;
    tbody.appendChild(tr);
    tr.querySelector('input').focus();
}

async function guardarCambios() {
    const filas = [...document.querySelectorAll('#tbody-subfamilias .edit-row')].map(tr => {
        const inputs = tr.querySelectorAll('input[type="text"]');
        const check = tr.querySelector('input[type="checkbox"]');
        return { codigo: inputs[0].value, nombre: inputs[1].value, sin_control_lote: check.checked };
    }).filter(f => f.codigo);

    try {
        await SGA.subfamilias.save(filas);
        alert('Subfamilias guardadas.');
    } catch {
        alert('Error al guardar subfamilias.');
    }
}

cargarDatos();
