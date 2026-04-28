document.getElementById('btn-backup').addEventListener('click', async () => {
    if (!confirm('¿Desea iniciar una nueva copia de seguridad?')) return;

    const btn = document.getElementById('btn-backup');
    btn.textContent = 'Generando copia...';
    btn.disabled = true;
    try {
        const res = await SGA.copiaSeguridad.crear();
        document.getElementById('resultado').textContent = res.message || 'Copia de seguridad creada correctamente.';
        document.getElementById('resultado').className = 'resultado ok';
    } catch {
        document.getElementById('resultado').textContent = 'Error al crear la copia de seguridad.';
        document.getElementById('resultado').className = 'resultado error';
    } finally {
        btn.textContent = 'Nueva copia de seguridad';
        btn.disabled = false;
    }
});
