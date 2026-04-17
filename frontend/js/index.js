document.addEventListener('DOMContentLoaded', () => {
    cargarStats();
});

async function cargarStats() {
    const artElem = document.getElementById('total-art');
    const stockElem = document.getElementById('total-stock');
    const ubiElem = document.getElementById('total-ubi');

    try {
        const res = await fetch('http://localhost:3000/stats');
        if (!res.ok) throw new Error('Error en la respuesta del servidor');

        const data = await res.json();

        // Actualizamos los valores en la pantalla
        if (artElem) artElem.innerText = data.articulos;
        if (stockElem) stockElem.innerText = data.stock.toFixed(2);
        if (ubiElem) ubiElem.innerText = data.ubicaciones;

    } catch (err) {
        console.error('Error al cargar estadísticas:', err);
        // Si falla, ponemos un aviso visual discreto
        [artElem, stockElem, ubiElem].forEach(el => {
            if (el) el.innerText = "Error";
        });
    }
}