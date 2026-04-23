document.addEventListener("DOMContentLoaded", function () {
    // 1. Detectar profundidad para ajustar rutas
    // Si estamos en una subcarpeta (ej: pages/ferreteria/), necesitamos "../../"
    // Si estamos en la raíz (index.html), no necesitamos prefijo.
    const esSubcarpeta = window.location.pathname.includes('/pages/');
    const root = esSubcarpeta ? '../../' : '';

    const navbarHTML = `
        <nav class="navbar-global">
            <div class="nav-container">
                <div class="nav-logo">SGA LIN <span class="version">v1.0</span></div>
                <ul class="nav-menu">
                    <li><a href="${root}index.html">Inicio</a></li>
                    <li><a href="#">Archivo</a></li>
                    <li><a href="${root}pages/ferreteria/index.html">Ferretería</a></li>
                    <li><a href="#">Visor</a></li>
                    <li><a href="#">Útil</a></li>
                    <li><a href="#">Ventana</a></li>
                    <li><a href="#">Acerca de...</a></li>
                </ul>
            </div>
        </nav>
    `;

    // Inyectar al principio del body
    document.body.insertAdjacentHTML('afterbegin', navbarHTML);
});