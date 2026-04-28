let rowCount = 0;

document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
document.getElementById('btn-nuevo')?.addEventListener('click', agregarFila);
document.getElementById('btn-guardar')?.addEventListener('click', guardarCambios);
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });

async function cargarDatos() {
    const params = {};
    const cliente = document.getElementById('f-cliente').value.trim();
    if (cliente) params.cliente = cliente;
    try {
        const data = await SGA.loteMinimo.list(params);
        renderTabla(data);
    } catch {
        console.error('Error al cargar lote mínimo');
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-lminimo');
    rowCount = rows.length;
    if (!rows.length) { agregarFila(); return; }
    tbody.innerHTML = rows.map((r, i) => `
        <tr class="edit-row" data-id="${r.id ?? ''}">
            <td class="col-num">${i + 1}</td>
            <td><input type="text" class="cell-input" value="${r.cliente ?? ''}"></td>
            <td><input type="text" class="cell-input" value="${r.nombre_cliente ?? ''}" readonly></td>
            <td><input type="number" class="cell-input" value="${r.dias ?? 0}"></td>
        </tr>`).join('');
}

function agregarFila() {
    rowCount++;
    const tbody = document.getElementById('tbody-lminimo');
    const tr = document.createElement('tr');
    tr.className = 'edit-row';
    tr.dataset.id = `new-${rowCount}`;
    tr.innerHTML = `
        <td class="col-num">${rowCount}</td>
        <td><input type="text" class="cell-input" placeholder="Cliente"></td>
        <td><input type="text" class="cell-input" readonly></td>
        <td><input type="number" class="cell-input" value="0"></td>`;
    tbody.appendChild(tr);
    tr.querySelector('input').focus();
}

async function guardarCambios() {
    const filas = [...document.querySelectorAll('#tbody-lminimo .edit-row')].map(tr => {
        const inputs = tr.querySelectorAll('input');
        return { cliente: inputs[0].value, dias: inputs[2].value };
    }).filter(f => f.cliente);
    try {
        await SGA.loteMinimo.save(filas);
        alert('Lote mínimo guardado.');
    } catch {
        alert('Error al guardar.');
    }
}

cargarDatos();
