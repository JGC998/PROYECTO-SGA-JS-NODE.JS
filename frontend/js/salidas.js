document.getElementById('btnSalida').addEventListener('click', async () => {
    const status = document.getElementById('status');
    const btn = document.getElementById('btnSalida');

    const datos = {
        cod: document.getElementById('cod').value.trim(),
        ubi: document.getElementById('ubi').value.trim(),
        lot: document.getElementById('lot').value.trim(),
        cant: parseFloat(document.getElementById('cant').value)
    };

    if (!datos.cod || !datos.ubi || isNaN(datos.cant)) {
        alert("Complete todos los campos obligatorios");
        return;
    }

    // Desactivar botón para evitar doble clic
    btn.disabled = true;
    btn.innerText = "Procesando...";

    try {
        const res = await fetch('http://localhost:3000/salida', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        const data = await res.json();

        status.style.display = 'block';
        status.style.background = res.ok ? '#d4edda' : '#f8d7da';
        status.style.color = res.ok ? '#155724' : '#721c24';
        status.innerText = data.message;

        if (res.ok) {
            // Limpiar campos tras éxito excepto ubicación si se va a seguir en la misma
            document.getElementById('cod').value = "";
            document.getElementById('cant').value = "1";
            document.getElementById('cod').focus();
        }

    } catch (err) {
        alert("Error de conexión con el servidor");
    } finally {
        btn.disabled = false;
        btn.innerText = "CONFIRMAR SALIDA";
    }
});