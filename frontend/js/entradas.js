async function confirmarEntrada() {
    const msgDiv = document.getElementById('mensaje');
    const datos = {
        cod: document.getElementById('cod').value.trim(),
        ubi: document.getElementById('ubi').value.trim(),
        lot: document.getElementById('lot').value.trim() || 'GENERAL',
        cant: parseFloat(document.getElementById('cant').value)
    };

    if (!datos.cod || !datos.ubi || isNaN(datos.cant)) {
        alert("Rellena Código, Ubicación y Cantidad");
        return;
    }

    try {
        const res = await fetch('http://localhost:3000/entrada', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        const data = await res.json();
        msgDiv.style.display = 'block';
        msgDiv.style.backgroundColor = data.success ? '#d4edda' : '#f8d7da';
        msgDiv.style.color = data.success ? '#155724' : '#721c24';
        msgDiv.innerText = data.message;

        if (data.success) {
            document.getElementById('cod').value = "";
            document.getElementById('cant').value = "1";
        }
    } catch (err) {
        alert("Error al conectar con la API");
    }
}