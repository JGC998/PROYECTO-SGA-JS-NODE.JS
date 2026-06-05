const today = new Date();
const hace30 = new Date();
hace30.setDate(today.getDate() - 30);
const toISO = d => d.toISOString().split('T')[0];

document.getElementById('f-fecha-hasta').value = toISO(today);
document.getElementById('f-fecha-desde').value = toISO(hace30);

document.getElementById('btn-actualizar').addEventListener('click', cargarMovimientos);
document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); cargarMovimientos(); } });

async function cargarMovimientos() {
    const btn = document.getElementById('btn-actualizar');
    btn.textContent = 'Cargando...';
    btn.disabled = true;

    const params = {
        articulo: document.getElementById('f-articulo').value,
        lote: document.getElementById('f-lote').value,
        desde: document.getElementById('f-fecha-desde').value,
        hasta: document.getElementById('f-fecha-hasta').value,
        movimiento: document.getElementById('f-movimiento').value,
        ubicacion: document.getElementById('f-ubicacion').value,
        cliente: document.getElementById('f-cliente').value,
        subfamilia: document.getElementById('f-subfamilia').value,
        agrupado: document.getElementById('f-agrupado').checked ? '1' : '0',
        historico: document.getElementById('f-historico').checked ? '1' : '0',
    };

    try {
        const data = await SGA.movimientos.list(params);
        renderTabla(data);
    } catch {
        renderError();
    } finally {
        btn.textContent = 'Actualizar (F5)';
        btn.disabled = false;
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-movimientos');
    document.getElementById('total-registros').textContent = `${rows.length} registros`;

    if (!rows.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="19">No se encontraron movimientos con los filtros indicados.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(r => `
        <tr>
            <td class="col-star"></td>
            <td>${r.empresa ?? ''}</td>
            <td>${r.fecha ? r.fecha.substring(0, 10) : ''}</td>
            <td>${r.hora ?? ''}</td>
            <td class="badge-tipo tipo-${(r.tipo ?? '').toLowerCase()}">${r.tipo ?? ''}</td>
            <td>${r.serie ?? ''}</td>
            <td>${r.numero ?? ''}</td>
            <td>${r.picking ?? ''}</td>
            <td>${r.ubicacion ?? ''}</td>
            <td>${r.etiqueta ?? ''}</td>
            <td class="col-num">${r.cantidad ?? ''}</td>
            <td class="col-num">${r.stock ?? ''}</td>
            <td>${r.lote ?? ''}</td>
            <td>${r.terminal ?? ''}</td>
            <td>${r.caja ?? ''}</td>
            <td>${r.palet ?? ''}</td>
            <td>${r.tercero ?? ''}</td>
            <td>${r.centro ?? ''}</td>
            <td>${r.nombre_tercero ?? ''}</td>
        </tr>`).join('');
}

function renderError() {
    document.getElementById('tbody-movimientos').innerHTML =
        '<tr class="placeholder-row error-row"><td colspan="19">Error al conectar con el servidor.</td></tr>';
}

document.getElementById('btn-exportar').addEventListener('click', () => {
    const params = {
        articulo:  document.getElementById('f-articulo').value,
        lote:      document.getElementById('f-lote').value,
        desde:     document.getElementById('f-fecha-desde').value,
        hasta:     document.getElementById('f-fecha-hasta').value,
        movimiento: document.getElementById('f-movimiento').value,
        ubicacion: document.getElementById('f-ubicacion').value,
        cliente:   document.getElementById('f-cliente').value,
        format:    'csv',
    };
    const a = document.createElement('a');
    a.href = '/movimientos-por-articulo?' + new URLSearchParams(params).toString();
    a.download = `movimientos_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});
