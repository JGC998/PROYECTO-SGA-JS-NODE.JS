document.getElementById('f-fecha-regularizacion').value = new Date().toISOString().split('T')[0];

document.getElementById('btn-traspasar').addEventListener('click', async () => {
    const btn = document.getElementById('btn-traspasar');
    btn.textContent = 'Traspasando...';
    btn.disabled = true;
    try {
        const res = await SGA.traspasoInventario.traspasar({
            rellenar_ceros: document.getElementById('f-rellenar-ceros').checked,
            lote_000000: document.getElementById('f-lote-000000').checked
        });
        alert(res.message || 'Traspaso completado.');
    } catch (err) {
        alert(err.message || 'Error al traspasar inventarios.');
    } finally {
        btn.textContent = 'Traspasar inventarios';
        btn.disabled = false;
    }
});

document.getElementById('btn-importar-regularizaciones').addEventListener('click', async () => {
    const fecha = document.getElementById('f-fecha-regularizacion').value;
    if (!fecha) { alert('Seleccione una fecha de regularización.'); return; }
    const btn = document.getElementById('btn-importar-regularizaciones');
    btn.disabled = true;
    try {
        const res = await SGA.traspasoInventario.importarRegularizaciones({ fecha });
        alert(res.message || 'Regularizaciones importadas.');
    } catch (err) {
        alert(err.message || 'Error al importar regularizaciones.');
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('btn-asignar-fecha').addEventListener('click', async () => {
    const hora = document.getElementById('f-hora-stock').value;
    const btn = document.getElementById('btn-asignar-fecha');
    btn.disabled = true;
    try {
        const res = await SGA.traspasoInventario.asignarFechaStock({ hora });
        alert(res.message || 'Fecha de stock inicial asignada.');
    } catch (err) {
        alert(err.message || 'Error al asignar fecha de stock inicial.');
    } finally {
        btn.disabled = false;
    }
});
