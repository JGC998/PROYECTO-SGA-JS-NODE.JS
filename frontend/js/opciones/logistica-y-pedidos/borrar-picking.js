document.getElementById('btn-borrar').addEventListener('click', async () => {
    const albaran = document.getElementById('f-albaran').value.trim();
    if (!albaran) { alert('Introduzca el número de albarán.'); return; }

    if (!confirm(`¿Está seguro de que desea borrar el picking del albarán ${albaran}?`)) return;

    const btn = document.getElementById('btn-borrar');
    btn.textContent = 'Procesando...';
    btn.disabled = true;
    try {
        const res = await SGA.borrarPicking.borrar({ albaran });
        document.getElementById('resultado').textContent = res.message || 'Picking eliminado correctamente.';
        document.getElementById('resultado').className = 'resultado ok';
    } catch {
        document.getElementById('resultado').textContent = 'Error al borrar el picking.';
        document.getElementById('resultado').className = 'resultado error';
    } finally {
        btn.textContent = 'Borrar picking';
        btn.disabled = false;
    }
});
