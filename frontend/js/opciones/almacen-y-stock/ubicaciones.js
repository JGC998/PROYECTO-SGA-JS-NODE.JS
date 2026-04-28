let rowCount = 0;

document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });
document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);

async function cargarDatos() {
    const params = {
        ubicacion: document.getElementById('f-ubicacion').value,
        p: document.getElementById('f-p').value,
        l: document.getElementById('f-l').value,
        x: document.getElementById('f-x').value,
        y: document.getElementById('f-y').value,
    };
    try {
        const data = await SGA.ubicaciones.list(params);
        renderTabla(data);
    } catch {
        console.error('Error al cargar ubicaciones');
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-ubicaciones');
    rowCount = rows.length;
    if (!rows.length) {
        tbody.innerHTML = filaVacia(1);
        return;
    }
    tbody.innerHTML = rows.map((r, i) => `
        <tr class="edit-row" data-id="${r.id ?? ''}">
            <td class="col-contador">${i + 1}</td>
            <td class="col-check"><input type="checkbox" class="cell-check"></td>
            <td><input type="text" class="cell-input" value="${r.ubicacion ?? ''}"></td>
            <td><input type="text" class="cell-input" value="${r.etiqueta ?? ''}"></td>
            <td><input type="text" class="cell-input cell-wide" value="${r.descripcion ?? ''}"></td>
            <td><input type="number" class="cell-input cell-num" value="${r.ancho ?? 0}"></td>
            <td><input type="number" class="cell-input cell-num" value="${r.alto ?? 0}"></td>
            <td><input type="number" class="cell-input cell-num" value="${r.palets ?? 0}"></td>
            <td class="col-check"><input type="checkbox" class="cell-check" ${r.picking ? 'checked' : ''}></td>
            <td class="col-check"><input type="checkbox" class="cell-check" ${r.multiple ? 'checked' : ''}></td>
            <td><input type="text" class="cell-input" value="${r.ubicacion_tipo ?? ''}"></td>
            <td class="col-check"><input type="checkbox" class="cell-check" ${r.exclusiva ? 'checked' : ''}></td>
            <td class="col-check"><input type="checkbox" class="cell-check" ${r.no_av_inv ? 'checked' : ''}></td>
            <td><input type="text" class="cell-input" value="${r.articulo ?? ''}"></td>
        </tr>`).join('');
}

function filaVacia(n) {
    return `<tr class="edit-row" data-id="new-${n}">
        <td class="col-contador">${n}</td>
        <td class="col-check"><input type="checkbox" class="cell-check"></td>
        <td><input type="text" class="cell-input" placeholder="Ubicación"></td>
        <td><input type="text" class="cell-input" placeholder="Etiqueta"></td>
        <td><input type="text" class="cell-input cell-wide" placeholder="Descripción"></td>
        <td><input type="number" class="cell-input cell-num" value="0"></td>
        <td><input type="number" class="cell-input cell-num" value="0"></td>
        <td><input type="number" class="cell-input cell-num" value="0"></td>
        <td class="col-check"><input type="checkbox" class="cell-check"></td>
        <td class="col-check"><input type="checkbox" class="cell-check"></td>
        <td><input type="text" class="cell-input"></td>
        <td class="col-check"><input type="checkbox" class="cell-check"></td>
        <td class="col-check"><input type="checkbox" class="cell-check"></td>
        <td><input type="text" class="cell-input"></td>
    </tr>`;
}

document.getElementById('btn-seleccionar-todo').addEventListener('click', () => {
    document.querySelectorAll('#tbody-ubicaciones .cell-check').forEach(c => c.checked = true);
});
document.getElementById('btn-anular').addEventListener('click', () => {
    document.querySelectorAll('#tbody-ubicaciones .cell-check').forEach(c => c.checked = false);
});

document.getElementById('btn-exportar').addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#tabla-ubicaciones tbody tr')];
    const headers = [...document.querySelectorAll('#tabla-ubicaciones thead th')].map(th => th.textContent).join(';');
    const csv = [headers, ...rows.map(tr => [...tr.querySelectorAll('td')].map(td => {
        const input = td.querySelector('input[type="text"], input[type="number"]');
        const check = td.querySelector('input[type="checkbox"]');
        if (input) return input.value;
        if (check) return check.checked ? 'Sí' : 'No';
        return td.textContent;
    }).join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `ubicaciones_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
});
