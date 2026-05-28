let rowCount = 0;

document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });
document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
document.getElementById('btn-nuevo').addEventListener('click', agregarFila);
document.getElementById('btn-guardar').addEventListener('click', guardarCambios);

async function cargarDatos() {
    const articulo = document.getElementById('f-articulo').value.trim();
    const params = articulo ? { articulo } : {};
    try {
        const data = await SGA.minimosMaximos.list(params);
        renderTabla(data);
    } catch {
        console.error('Error al cargar mínimos/máximos');
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-minmax');
    rowCount = rows.length;
    if (!rows.length) { agregarFila(); return; }
    tbody.innerHTML = rows.map((r, i) => `
        <tr class="edit-row" data-id="${r.id ?? ''}">
            <td class="col-num">${i + 1}</td>
            <td><input type="text" class="cell-input" value="${r.articulo ?? ''}"></td>
            <td><input type="text" class="cell-input cell-wide" value="${r.nombre ?? ''}" readonly></td>
            <td><input type="number" class="cell-input cell-num" value="${r.stock_minimo ?? 0}" min="0"></td>
            <td><input type="number" class="cell-input cell-num" value="${r.stock_maximo ?? 0}" min="0"></td>
            <td><input type="number" class="cell-input cell-num" value="${r.stock_actual ?? 0}" readonly></td>
            <td><input type="text" class="cell-input" value="${r.ubicacion ?? ''}"></td>
        </tr>`).join('');
}

function agregarFila() {
    rowCount++;
    const tbody = document.getElementById('tbody-minmax');
    const tr = document.createElement('tr');
    tr.className = 'edit-row';
    tr.dataset.id = `new-${rowCount}`;
    tr.innerHTML = `
        <td class="col-num">${rowCount}</td>
        <td><input type="text" class="cell-input" placeholder="Artículo"></td>
        <td><input type="text" class="cell-input cell-wide" placeholder="Nombre" readonly></td>
        <td><input type="number" class="cell-input cell-num" value="0" min="0"></td>
        <td><input type="number" class="cell-input cell-num" value="0" min="0"></td>
        <td><input type="number" class="cell-input cell-num" value="0" readonly></td>
        <td><input type="text" class="cell-input" placeholder="Ubicación"></td>`;
    tbody.appendChild(tr);
    tr.querySelector('input').focus();
}

async function guardarCambios() {
    const filas = [...document.querySelectorAll('#tbody-minmax .edit-row')].map(tr => {
        const inputs = tr.querySelectorAll('input');
        return {
            articulo: inputs[0].value,
            stock_minimo: inputs[2].value,
            stock_maximo: inputs[3].value,
            ubicacion: inputs[5].value,
        };
    }).filter(f => f.articulo);
    try {
        await SGA.minimosMaximos.save(filas);
        alert('Mínimos/máximos guardados.');
    } catch {
        alert('Error al guardar.');
    }
}

document.getElementById('btn-exportar').addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#tabla-minmax tbody tr')];
    const headers = [...document.querySelectorAll('#tabla-minmax thead th')].map(th => th.textContent).join(';');
    const csv = [headers, ...rows.map(tr => [...tr.querySelectorAll('input')].map(i => i.value).join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `minimos-maximos_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
});

cargarDatos();
