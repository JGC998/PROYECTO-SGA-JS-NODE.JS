document.getElementById('btnEjecutar').addEventListener('click', async () => {
    const msg = document.getElementById('resultado');
    const datos = {
        cod: document.getElementById('cod').value,
        ubiOri: document.getElementById('ubiOri').value,
        ubiDes: document.getElementById('ubiDes').value,
        lot: document.getElementById('lot').value,
        cant: parseFloat(document.getElementById('cant').value)
    };

    if (!datos.cod || !datos.ubiOri || !datos.ubiDes) {
        alert("Faltan datos críticos (Código, Origen o Destino)");
        return;
    }

    try {
        // Añadimos la función a nuestro SGA_API en js/api.js si no existe
        const res = await fetch('http://localhost:3000/traspaso', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        const data = await res.json();
        msg.style.display = 'block';
        msg.style.background = data.success ? '#d4edda' : '#f8d7da';
        msg.innerText = data.message;

    } catch (err) {
        alert("Error de conexión");
    }
});