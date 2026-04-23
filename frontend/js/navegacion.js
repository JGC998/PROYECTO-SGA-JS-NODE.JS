document.addEventListener("DOMContentLoaded", function () {
    // 1. Detectar profundidad para ajustar rutas
    // Si estamos en una subcarpeta (ej: pages/ferreteria/), necesitamos "../../"
    // Si estamos en la raíz (index.html), no necesitamos prefijo.
    const parts = window.location.pathname.split('/');
    const pagesIdx = parts.indexOf('pages');
    let root = '';
    if (pagesIdx !== -1) {
        const levels = parts.length - pagesIdx - 2;
        root = '../'.repeat(levels + 1);
    }

    const navbarHTML = `
        <nav class="navbar-global">
            <div class="nav-container">
                <div class="nav-logo">SGA</div>
                <ul class="nav-menu">
                    <li><a href="${root}index.html">Inicio</a></li>
                    <li><a href="${root}pages/opciones/index.html">Opciones</a></li>
                    <li><a href="${root}pages/ferreteria/index.html">Ferretería</a></li>
                    <li><a href="${root}pages/visor/index.html">Visor</a></li>
                    <li><a href="${root}pages/util/index.html">Útil</a></li>
                    <li><a href="#">Ventana</a></li>
                    <li><a href="${root}pages/acerca_de/index.html">Acerca de...</a></li>
                </ul>
            </div>
        </nav>
    `;

    // Inyectar al principio del body
    document.body.insertAdjacentHTML('afterbegin', navbarHTML);
});