document.getElementById('btn-poner-cero').addEventListener('click', async () => {
    if (!confirm('¿Está seguro de que desea poner el carrusel a cero? Esta acción no se puede deshacer.')) return;

    const btn = document.getElementById('btn-poner-cero');
    btn.textContent = 'Procesando...';
    btn.disabled = true;
    try {
        const res = await SGA.ponerCeroCarrusel.poner();
        document.getElementById('resultado').textContent = res.message || 'Carrusel puesto a cero correctamente.';
        document.getElementById('resultado').className = 'resultado ok';
    } catch (err) {
        const msg = err.pendiente ? err.message : 'Error al poner el carrusel a cero.';
        const cls = err.pendiente ? 'resultado pendiente' : 'resultado error';
        document.getElementById('resultado').textContent = msg;
        document.getElementById('resultado').className = cls;
    } finally {
        btn.textContent = 'Poner a cero';
        btn.disabled = false;
    }
});
