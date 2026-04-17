const status = document.getElementById('status');

function mostrarMsg(texto, exito) {
    status.innerText = texto;
    status.style.display = 'block';
    status.style.background = exito ? '#d4edda' : '#f8d7da';
    status.style.color = exito ? '#155724' : '#721c24';
}

async function guardarArticulo() {
    const cod = document.getElementById('art-cod').value;
    const nom = document.getElementById('art-nom').value;

    const res = await fetch('http://localhost:3000/maestro-articulo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cod, nom })
    });
    const data = await res.json();
    mostrarMsg(data.message, data.success);
}

async function guardarUbicacion() {
    const ubi = document.getElementById('ubi-cod').value;
    const alm = document.getElementById('ubi-alm').value;

    const res = await fetch('http://localhost:3000/maestro-ubicacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ubi, alm })
    });
    const data = await res.json();
    mostrarMsg(data.message, data.success);
}