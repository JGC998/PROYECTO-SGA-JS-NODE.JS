const inputs = document.querySelectorAll('.input-param');
const [inDesdePas, inDesdeLat, inDesdeX, inDesdeY,
       inHastaPas, inHastaLat, inHastaX, inHastaY,
       inAncho, inAlto, inPalets] = inputs;
const chkMultiple = document.querySelector('input[type="checkbox"]');
const selPicking = document.querySelector('.select-picking');
const btnOk = document.querySelector('.btn-ok');
const tbody = document.querySelector('.left-panel tbody');

async function cargarUbicaciones() {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Cargando...</td></tr>';
    try {
        const data = await SGA.ubicaciones.list({ buscar: '' });
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Sin ubicaciones.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map((r, i) => `
            <tr>
                <td class="col-num">${i + 1}</td>
                <td><input type="checkbox"></td>
                <td>${r.ubicacion ?? ''}</td>
                <td>${r.etiqueta ?? ''}</td>
            </tr>`).join('');
    } catch {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Error al cargar.</td></tr>';
    }
}

btnOk.addEventListener('click', async () => {
    const params = {
        desde_pasillo: inDesdePas?.value || 1,
        hasta_pasillo: inHastaPas?.value || 1,
        desde_lateral: inDesdeLat?.value || 11,
        hasta_lateral: inHastaLat?.value || 11,
        desde_x: inDesdeX?.value || 1,
        hasta_x: inHastaX?.value || 1,
        desde_y: inDesdeY?.value || 1,
        hasta_y: inHastaY?.value || 1,
        ancho: inAncho?.value || 0,
        alto: inAlto?.value || 0,
        palets: inPalets?.value || 0,
        multiple: chkMultiple?.checked ? 1 : 0,
        picking: selPicking?.value || 'Picking',
    };
    btnOk.disabled = true;
    btnOk.textContent = 'Generando...';
    try {
        const res = await SGA.generarUbicaciones.generar(params);
        alert(`Proceso completado. Ubicaciones procesadas: ${res.creadas ?? 0}`);
        cargarUbicaciones();
    } catch {
        alert('Error al generar ubicaciones.');
    } finally {
        btnOk.disabled = false;
        btnOk.textContent = 'OK';
    }
});

cargarUbicaciones();
