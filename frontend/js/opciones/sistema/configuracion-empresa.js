async function cargarConfig() {
    try {
        const data = await SGA.configuracionEmpresa.get();
        const form = document.getElementById('form-empresa');
        for (const [key, val] of Object.entries(data)) {
            const el = form.querySelector(`[name="${key}"]`);
            if (el) el.value = val ?? '';
        }
    } catch {
        document.getElementById('msg-config').textContent = 'Error al cargar la configuración.';
    }
}

document.getElementById('btn-guardar').addEventListener('click', async () => {
    const form = document.getElementById('form-empresa');
    const data = {};
    form.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.name) data[el.name] = el.value;
    });
    const btn = document.getElementById('btn-guardar');
    btn.disabled = true;
    try {
        await SGA.configuracionEmpresa.save(data);
        document.getElementById('msg-config').textContent = 'Configuración guardada correctamente.';
        document.getElementById('msg-config').className = 'msg ok';
    } catch (err) {
        const msg = err.pendiente ? err.message : 'Error al guardar la configuración.';
        const cls = err.pendiente ? 'msg pendiente' : 'msg error';
        document.getElementById('msg-config').textContent = msg;
        document.getElementById('msg-config').className = cls;
    } finally {
        btn.disabled = false;
    }
});

cargarConfig();
