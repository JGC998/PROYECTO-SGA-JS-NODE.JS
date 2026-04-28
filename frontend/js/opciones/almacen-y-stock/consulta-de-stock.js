// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
});

document.getElementById('btn-actualizar').addEventListener('click', cargarDatos);
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarDatos(); } });

async function cargarDatos() {
    const btn = document.getElementById('btn-actualizar');
    btn.textContent = 'Cargando...';
    btn.disabled = true;

    const params = {
        ubicacion: document.getElementById('f-ubicacion').value,
        articulo: document.getElementById('f-articulo').value,
        lote: document.getElementById('f-lote').value,
    };

    try {
        const data = await SGA.consultaStock.list(params);
        renderTabla(data);
        const total = data.reduce((s, r) => s + (parseFloat(r.stock) || 0), 0);
        document.getElementById('total-stock').value = total.toFixed(2);
    } catch {
        document.getElementById('tbody-stock').innerHTML =
            '<tr class="placeholder-row"><td colspan="14">Error al conectar con el servidor.</td></tr>';
    } finally {
        btn.textContent = 'Actualizar (F5)';
        btn.disabled = false;
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-stock');
    if (!rows.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="14">No se encontraron registros con los filtros indicados.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td class="col-star"></td>
            <td class="col-check"><input type="checkbox"></td>
            <td>${r.empresa ?? ''}</td>
            <td>${r.ubicacion ?? ''}</td>
            <td>${r.etiqueta ?? ''}</td>
            <td>${r.articulo ?? ''}</td>
            <td>${r.nombre ?? ''}</td>
            <td>${r.lote ?? ''}</td>
            <td class="col-num">${r.stock ?? ''}</td>
            <td>${r.palet ?? ''}</td>
            <td>${r.cajas ?? ''}</td>
            <td>${r.unidades ?? ''}</td>
            <td>${r.ubicacion_tipo ?? ''}</td>
            <td>${r.exclusiva ? 'Sí' : 'No'}</td>
        </tr>`).join('');
}

document.getElementById('btn-exportar').addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#tabla-stock tbody tr:not(.placeholder-row)')];
    if (!rows.length) return;
    const headers = [...document.querySelectorAll('#tabla-stock thead th')].map(th => th.textContent).join(';');
    const csv = [headers, ...rows.map(tr => [...tr.querySelectorAll('td')].map(td => {
        const inp = td.querySelector('input[type="text"], input[type="number"]');
        const chk = td.querySelector('input[type="checkbox"]');
        if (inp) return inp.value;
        if (chk) return chk.checked ? 'Sí' : 'No';
        return td.textContent.trim();
    }).join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `stock_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
});
