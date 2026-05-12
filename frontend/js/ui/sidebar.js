"use strict";

(function () {
    /* ── GRUPOS DE NAVEGACIÓN ────────────────────────────────────────────── */
    var NAV_GROUPS = [
        {
            label: 'Dashboard',
            links: [
                { icon: '🏠', text: 'Inicio',          href: 'index.html' }
            ]
        },
        {
            label: 'Stock',
            links: [
                { icon: '📦', text: 'Consulta de stock',          href: 'pages/opciones/almacen-y-stock/consulta-de-stock/index.html' },
                { icon: '📊', text: 'Movimientos por artículo',   href: 'pages/opciones/almacen-y-stock/movimientos-por-articulo/index.html' },
                { icon: '📍', text: 'Artículos por ubicación',    href: 'pages/opciones/almacen-y-stock/articulos-por-ubicacion/index.html' },
                { icon: '⚠️', text: 'Sin reposición automática',  href: 'pages/opciones/almacen-y-stock/articulos-sin-reposicion/index.html' }
            ]
        },
        {
            label: 'Operaciones',
            links: [
                { icon: '⬇️', text: 'Entrada de mercancía',  href: 'pages/opciones/almacen-y-stock/entrada-de-mercancia/index.html' },
                { icon: '⬆️', text: 'Salida de mercancía',   href: 'pages/opciones/almacen-y-stock/salida-de-mercancia/index.html' },
                { icon: '↔️', text: 'Traspasos',             href: 'pages/opciones/almacen-y-stock/traspasos/index.html' }
            ]
        },
        {
            label: 'Expediciones',
            links: [
                { icon: '🚛', text: 'Expediciones desde pedido', href: 'pages/opciones/logistica-y-pedidos/expediciones/index.html' },
                { icon: '📋', text: 'Preparación / Picking',    href: 'pages/opciones/logistica-y-pedidos/picking/index.html' },
                { icon: '🗺️', text: 'Hojas de ruta',            href: 'pages/opciones/logistica-y-pedidos/hojas-de-ruta/index.html' }
            ]
        },
        {
            label: 'Almacén',
            links: [
                { icon: '🏗️', text: 'Almacenes',          href: 'pages/opciones/almacen-y-stock/almacenes/index.html' },
                { icon: '📌', text: 'Ubicaciones',         href: 'pages/opciones/almacen-y-stock/ubicaciones/index.html' },
                { icon: '🔧', text: 'Generar ubicaciones', href: 'pages/opciones/almacen-y-stock/generar-ubicaciones/index.html' },
                { icon: '📋', text: 'Regularizaciones',    href: 'pages/opciones/almacen-y-stock/traspaso-inventario-regularizacion/index.html' }
            ]
        },
        {
            label: 'Lotes',
            links: [
                { icon: '🏷️', text: 'Lote mínimo',              href: 'pages/opciones/control-de-lotes-y-minimos/lote-minimo/index.html' },
                { icon: '🚫', text: 'Lote en cuarentena',        href: 'pages/opciones/control-de-lotes-y-minimos/lote-cuarentena/index.html' },
                { icon: '🔒', text: 'Lote exclusivo',            href: 'pages/opciones/control-de-lotes-y-minimos/lote-exclusivo/index.html' },
                { icon: '💤', text: 'Lote no utilizado',         href: 'pages/opciones/control-de-lotes-y-minimos/lote-no-utilizado/index.html' },
                { icon: '📝', text: 'Observaciones art./lote',   href: 'pages/opciones/control-de-lotes-y-minimos/observaciones-por-articulo-lote/index.html' }
            ]
        },
        {
            label: 'Maestros',
            links: [
                { icon: '🔩', text: 'Artículos',   href: 'pages/ferreteria/articulos.html' },
                { icon: '🏭', text: 'Proveedores', href: 'pages/ferreteria/proveedores.html' },
                { icon: '👥', text: 'Clientes',    href: 'pages/visor/clientes.html' },
                { icon: '👷', text: 'Operarios',   href: 'pages/ferreteria/operarios.html' },
                { icon: '📑', text: 'Subfamilias', href: 'pages/opciones/control-de-lotes-y-minimos/subfamilias/index.html' }
            ]
        },
        {
            label: 'Sistema',
            links: [
                { icon: '👤', text: 'Usuarios',           href: 'pages/opciones/sistema/usuarios/index.html' },
                { icon: '⚙️', text: 'Config. empresa',    href: 'pages/opciones/sistema/configuracion-empresa/index.html' },
                { icon: '📱', text: 'Terminales PDA',     href: 'pages/opciones/sistema/terminales-pda/index.html' },
                { icon: '🔢', text: 'Contadores',         href: 'pages/opciones/sistema/contadores/index.html' }
            ]
        },
        {
            label: 'Utilidades avanzadas',
            links: [
                { icon: '🔍', text: 'Visor artículos',   href: 'pages/visor/articulos.html' },
                { icon: '🔍', text: 'Visor proveedores', href: 'pages/visor/proveedores.html' },
                { icon: '📈', text: 'Informes',          href: 'pages/informes/index.html' },
                { icon: '🛠️', text: 'Utilidades',        href: 'pages/util/index.html' }
            ]
        }
    ];

    /* ── CALCULAR ROOT RELATIVO ──────────────────────────────────────────── */
    function getRoot() {
        var parts = window.location.pathname.split('/');
        var pagesIdx = parts.indexOf('pages');
        if (pagesIdx === -1) return '';
        var levels = parts.length - pagesIdx - 2;
        return '../'.repeat(levels + 1);
    }

    /* ── DETECTAR SI UN LINK ES LA PÁGINA ACTUAL ─────────────────────────── */
    function isActive(href) {
        try {
            var url = new URL(href, window.location.href);
            return url.pathname === window.location.pathname;
        } catch (_) {
            return false;
        }
    }

    /* ── CONSTRUIR HTML DE SIDEBAR ───────────────────────────────────────── */
    function buildSidebar(root) {
        var nav = '';
        NAV_GROUPS.forEach(function (group) {
            nav += '<div class="sga-nav-group-label">' + group.label + '</div>';
            group.links.forEach(function (link) {
                var href = root + link.href;
                var active = isActive(href) ? ' active' : '';
                nav += '<a class="sga-nav-link' + active + '" href="' + href + '">'
                    + '<span class="sga-nav-icon">' + link.icon + '</span>'
                    + '<span>' + link.text + '</span>'
                    + '</a>';
            });
        });

        return '<aside class="sga-sidebar" id="sgaSidebar">'
            + '<div class="sga-sidebar-header">'
            +   '<a href="' + root + 'index.html" class="sga-sidebar-logo">📦 SGA LIN</a>'
            +   '<div class="sga-sidebar-subtitle">Sistema de Gestión de Almacén</div>'
            + '</div>'
            + '<nav class="sga-sidebar-nav">' + nav + '</nav>'
            + '<div class="sga-sidebar-footer">v1.0 · SQL Server LIN</div>'
            + '</aside>'
            + '<div class="sga-overlay" id="sgaOverlay"></div>';
    }

    /* ── INIT ────────────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        var root = getRoot();
        document.body.insertAdjacentHTML('afterbegin', buildSidebar(root));

        var sidebar  = document.getElementById('sgaSidebar');
        var overlay  = document.getElementById('sgaOverlay');
        var hamburger = document.querySelector('.sga-hamburger');

        if (hamburger && sidebar) {
            hamburger.addEventListener('click', function () {
                var open = sidebar.classList.toggle('open');
                overlay.classList.toggle('active', open);
            });
        }

        if (overlay && sidebar) {
            overlay.addEventListener('click', function () {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            });
        }
    });
})();
