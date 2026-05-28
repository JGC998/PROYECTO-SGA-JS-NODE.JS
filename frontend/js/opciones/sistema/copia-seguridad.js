document.getElementById('btn-backup').addEventListener('click', async () => {
    if (!confirm('¿Desea iniciar una nueva copia de seguridad?')) return;

    const btn = document.getElementById('btn-backup');
    btn.textContent = 'Generando copia...';
    btn.disabled = true;
    try {
        const res = await SGA.copiaSeguridad.crear();
        const div = document.getElementById('resultado');
        div.textContent = res.message || 'Copia de seguridad creada correctamente.';
        div.className = 'resultado ok';
        if (res.archivo) {
            const a = document.createElement('a');
            a.href = '/copia-seguridad/descargar?file=' + encodeURIComponent(res.archivo);
            a.textContent = ' — Descargar';
            a.style.color = 'inherit';
            a.style.fontWeight = '600';
            div.appendChild(a);
        }
    } catch {
        document.getElementById('resultado').textContent = 'Error al crear la copia de seguridad.';
        document.getElementById('resultado').className = 'resultado error';
    } finally {
        btn.textContent = 'Nueva copia de seguridad';
        btn.disabled = false;
    }
});
