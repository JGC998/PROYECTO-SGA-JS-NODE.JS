"use strict";

(function () {
    /* ── GRUPOS DE NAVEGACIÓN ────────────────────────────────────────────── */
    var NAV_GROUPS = [
        {
            label: '',
            links: [
                { icon: '🏠', text: 'Inicio', href: 'index.html' }
            ]
        },
        {
            label: 'Almacén',
            links: [
                { icon: '🏗️', text: 'Visor 3D',             href: 'pages/almacen/mapa-3d.html' },
                { icon: '📡', text: 'Supervisor picking',    href: 'pages/almacen/supervisor.html' },
                { icon: '🗺️', text: 'Mapa aéreo',           href: 'pages/opciones/almacen-y-stock/mapa-almacen/index.html' },
                { icon: '🔧', text: 'Generar ubicaciones',   href: 'pages/opciones/almacen-y-stock/generar-ubicaciones/index.html' }
            ]
        },
        {
            label: 'Operaciones',
            links: [
                { icon: '⬇️', text: 'Entrada mercancía',   href: 'pages/opciones/almacen-y-stock/entrada-de-mercancia/index.html' },
                { icon: '⬆️', text: 'Salida mercancía',    href: 'pages/opciones/almacen-y-stock/salida-de-mercancia/index.html' },
                { icon: '↔️', text: 'Traspasos',           href: 'pages/opciones/almacen-y-stock/traspasos/index.html' },
                { icon: '📋', text: 'Regularizaciones',    href: 'pages/opciones/almacen-y-stock/regularizaciones/index.html' },
                { icon: '📋', text: 'Preparación / Picking', href: 'pages/opciones/logistica-y-pedidos/picking/index.html' }
            ]
        },
        {
            label: 'Consultas',
            links: [
                { icon: '🔩', text: 'Artículos',               href: 'pages/ferreteria/articulos.html' },
                { icon: '📦', text: 'Consulta de stock',       href: 'pages/opciones/almacen-y-stock/consulta-de-stock/index.html' },
                { icon: '🏭', text: 'Proveedores',             href: 'pages/ferreteria/proveedores.html' },
                { icon: '👥', text: 'Clientes',                href: 'pages/visor/clientes.html' },
                { icon: '📌', text: 'Ubicaciones',             href: 'pages/opciones/almacen-y-stock/ubicaciones/index.html' },
                { icon: '📊', text: 'Movimientos',             href: 'pages/opciones/almacen-y-stock/movimientos-por-articulo/index.html' },
                { icon: '🚛', text: 'Expediciones desde pedido', href: 'pages/opciones/logistica-y-pedidos/expediciones/index.html' },
                { icon: '📦', text: 'Histórico de ventas',    href: 'pages/opciones/logistica-y-pedidos/situacion-pedidos-venta/index.html' },
                { icon: '🗺️', text: 'Albaranes de expedición', href: 'pages/opciones/logistica-y-pedidos/hojas-de-ruta/index.html' },
                { icon: '⚠️', text: 'Alertas de stock',        href: 'pages/opciones/almacen-y-stock/alertas-stock/index.html', badgeId: 'badge-sin-reposicion' }
            ]
        },
        {
            label: 'Lotes',
            links: [
                { icon: '🏷️', text: 'Días mínimos de lote', href: 'pages/opciones/control-de-lotes-y-minimos/lote-minimo/index.html' },
                { icon: '🚫', text: 'Cuarentena',         href: 'pages/opciones/control-de-lotes-y-minimos/lote-cuarentena/index.html' },
                { icon: '🔒', text: 'Exclusivo',          href: 'pages/opciones/control-de-lotes-y-minimos/lote-exclusivo/index.html' },
                { icon: '📈', text: 'Mínimos y máximos',  href: 'pages/opciones/control-de-lotes-y-minimos/minimos-maximos/index.html' }
            ]
        },
        {
            label: 'Sistema',
            links: [
                { icon: '👤', text: 'Usuarios',           href: 'pages/opciones/sistema/usuarios/index.html' },
                { icon: '⚙️', text: 'Config. empresa',    href: 'pages/opciones/sistema/configuracion-empresa/index.html' },
                { icon: '🛠️', text: 'Utilidades',         href: 'pages/util/index.html' },
                { icon: '💾', text: 'Copia de seguridad', href: 'pages/opciones/sistema/copia-seguridad/index.html' }
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
        NAV_GROUPS.forEach(function (group, idx) {
            var links = '';
            var hasActive = false;
            group.links.forEach(function (link) {
                var href = root + link.href;
                var active = isActive(href) ? ' active' : '';
                if (active) hasActive = true;
                var badgeId = link.badgeId ? ' id="' + link.badgeId + '"' : '';
                links += '<a class="sga-nav-link' + active + '" href="' + href + '">'
                    + '<span class="sga-nav-icon">' + link.icon + '</span>'
                    + '<span>' + link.text + '</span>'
                    + (link.badgeId ? '<span class="sga-nav-badge hidden"' + badgeId + '></span>' : '')
                    + '</a>';
            });

            if (!group.label) {
                // Inicio — sin desplegable
                nav += links;
            } else {
                var esInicio = window.location.pathname === '/' || window.location.pathname.endsWith('/index.html') && window.location.pathname.split('/').length <= 2;
                var open = (!esInicio && hasActive) ? ' open' : '';
                var groupId = 'nav-group-' + idx;
                nav += '<div class="sga-nav-group' + open + '" id="' + groupId + '">'
                    + '<button class="sga-nav-group-toggle" data-group="' + groupId + '">'
                    +   '<span>' + group.label + '</span>'
                    +   '<span class="sga-nav-group-arrow">›</span>'
                    + '</button>'
                    + '<div class="sga-nav-group-items">' + links + '</div>'
                    + '</div>';
            }
        });

        return '<aside class="sga-sidebar" id="sgaSidebar">'
            + '<div class="sga-sidebar-header">'
            +   '<a href="' + root + 'index.html" class="sga-sidebar-logo">📦 <span id="sidebar-empresa-nombre">SGA LIN</span></a>'
            +   '<div class="sga-sidebar-subtitle">Sistema de Gestión de Almacén</div>'
            + '</div>'
            + '<a class="sga-sidebar-alert hidden" id="sidebar-alert-strip" href="' + root + 'pages/opciones/almacen-y-stock/alertas-stock/index.html">'
            +   '⚠️ <span id="sidebar-alert-txt"></span>'
            + '</a>'
            + '<nav class="sga-sidebar-nav">' + nav + '</nav>'
            + '<div class="sga-sidebar-footer">v1.0 · SQL Server LIN</div>'
            + '</aside>'
            + '<div class="sga-overlay" id="sgaOverlay"></div>';
    }

    /* ── BADGE DE ALERTAS DE STOCK ───────────────────────────────────────── */
    function cargarAlertas(root) {
        var CACHE_KEY = 'sga_alertas_cache';
        var CACHE_TTL = 5 * 60 * 1000; // 5 minutos

        function aplicar(data) {
            var bajo = data.stock_bajo_total != null ? data.stock_bajo_total : (data.stock_bajo || []).length;
            var neg  = (data.stock_negativo || []).length;

            var badge = document.getElementById('badge-sin-reposicion');
            if (badge && bajo > 0) {
                badge.textContent = bajo;
                badge.classList.remove('hidden');
            }
        }

        try {
            var cached = sessionStorage.getItem(CACHE_KEY);
            if (cached) {
                var entry = JSON.parse(cached);
                if (Date.now() - entry.ts < CACHE_TTL) { aplicar(entry.data); return; }
            }
        } catch (_) {}

        fetch('/estadisticas/alertas')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data) return;
                try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data })); } catch (_) {}
                aplicar(data);
            })
            .catch(function () {});
    }

    /* ── INIT ────────────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        var root = getRoot();
        document.body.insertAdjacentHTML('afterbegin', buildSidebar(root));

        var sidebar  = document.getElementById('sgaSidebar');
        var overlay  = document.getElementById('sgaOverlay');
        var hamburger = document.querySelector('.sga-hamburger');

        // Restaurar posición de scroll del sidebar
        var SCROLL_KEY = 'sga_sidebar_scroll';
        if (sidebar) {
            var saved = sessionStorage.getItem(SCROLL_KEY);
            if (saved) sidebar.scrollTop = parseInt(saved, 10);

            sidebar.addEventListener('click', function (e) {
                var link = e.target.closest('a[href]');
                if (link && !link.href.startsWith('#')) {
                    sessionStorage.setItem(SCROLL_KEY, sidebar.scrollTop);
                }
            });
        }

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

        // Desplegables
        document.querySelectorAll('.sga-nav-group-toggle').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var group = document.getElementById(btn.dataset.group);
                if (group) group.classList.toggle('open');
            });
        });

        cargarAlertas(root);
        cargarNombreEmpresa();
    });

    function cargarNombreEmpresa() {
        var CACHE_KEY = 'sga_empresa_nombre';
        var CACHE_TTL = 30 * 60 * 1000; // 30 minutos

        function aplicar(nombre) {
            var el = document.getElementById('sidebar-empresa-nombre');
            if (el && nombre && nombre.trim()) el.textContent = nombre.trim();
        }

        try {
            var cached = sessionStorage.getItem(CACHE_KEY);
            if (cached) {
                var entry = JSON.parse(cached);
                if (Date.now() - entry.ts < CACHE_TTL) { aplicar(entry.nombre); return; }
            }
        } catch (_) {}

        fetch('/configuracion-empresa')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data || !data.nombre) return;
                try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), nombre: data.nombre })); } catch (_) {}
                aplicar(data.nombre);
            })
            .catch(function () {});
    }
})();
