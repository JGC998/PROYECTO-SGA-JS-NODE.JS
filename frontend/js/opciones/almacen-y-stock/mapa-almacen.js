"use strict";

/* ── MAPA AÉREO DEL ALMACÉN ──────────────────────────────────────────────────
 *
 * Motor de render SVG basado en la estructura física real de UBICACION.
 *
 * Formato de UBIETI (etiqueta de ubicación):
 *   "P{pasillo} {lado:I|D} X{columna} Y{altura}"
 *   Ejemplo: "P001 I X003 Y002"
 *
 * Modelo de almacén:
 *   - Pasillo  = posición horizontal (eje X global del almacén)
 *   - X        = columna dentro del pasillo (eje Y global — profundidad)
 *   - Y        = nivel de altura (nivel de estantería, eje Z visual = filas SVG)
 *   - Lado I/D = cada pasillo tiene dos caras: Izquierda y Derecha
 *
 * Render SVG:
 *   Vista aérea (planta). Los pasillos son franjas verticales.
 *   Cada pasillo tiene dos columnas de ubicaciones (lado I a la izq, lado D a la der)
 *   separadas por un corredor de pasillo.
 *   Dentro de cada lado, las columnas X avanzan de arriba a abajo,
 *   y las alturas Y son sub-celdas apiladas verticalmente.
 *
 * Zonas especiales (P129, P500, P700, P725, P750, P789, P800, P850, P851):
 *   Se agrupan en un bloque "ZONAS ESPECIALES" al pie del mapa.
 *
 * FASE FUTURA (NO IMPLEMENTADA): heatmap, rutas picking, vista 3D,
 *   arrastrar ubicaciones, edición visual, capas por zoom.
 */

(function () {

    /* ── CONSTANTES DE LAYOUT ─────────────────────────────────────────────── */
    //
    // MODELO VISUAL (vista aérea — planta):
    //
    //   Eje SVG-X  →  pasillos distribuidos horizontalmente (P001, P002, …)
    //   Eje SVG-Y  →  profundidad: columnas X de cada pasillo apiladas verticalmente
    //   Sub-eje Y  →  alturas Y dentro de cada columna X (también verticales)
    //
    //   Cada pasillo ocupa un bloque vertical de ancho fijo = PASILLO_SPACING.
    //   Dentro del bloque: lado I a la izquierda, corredor, lado D a la derecha.
    //   Dentro de cada lado: cada columna X es una franja vertical; cada altura Y
    //   es una celda en esa franja.
    //
    var MARGIN_X      = 60;   // margen horizontal del mapa
    var MARGIN_Y      = 50;   // margen vertical del mapa
    var CELL_W        = 12;   // ancho de cada celda (una columna X × una altura Y)
    var CELL_H        = 8;    // alto  de cada celda
    var CELL_GAP      = 2;    // separación entre celdas del mismo lado
    var LADO_CORRIDOR = 16;   // calle central entre lado I y lado D
    var PASILLO_SPACING = 230; // distancia fija entre el origen de un pasillo y el siguiente
    var PASILLO_LABEL_H = 18; // alto reservado encima de cada bloque para la etiqueta
    var ZONE_SEP      = 40;   // separación vertical entre zona principal y zonas especiales
    var SPECIAL_CELL_W = 12;
    var SPECIAL_CELL_H = 8;
    var SPECIAL_SPACING = 160;

    // Pasillos ≥ este umbral se renderizan como "zonas especiales"
    var SPECIAL_THRESHOLD = 100;

    /* ── ESTADO ───────────────────────────────────────────────────────────── */
    var state = {
        ubicaciones:   [],
        stock:         [],
        minimoMaximos: [],
        stockMap:      {},
        minimoMap:     {},
        /* estructura parseada:
           aislMap[pasillo][lado][x][y] = ubiObj
           mainAisles   = [pasillo, ...] pasillos ≤ SPECIAL_THRESHOLD, ordenados
           specialAisles= [pasillo, ...] pasillos > SPECIAL_THRESHOLD
        */
        aislMap:       {},
        mainAisles:    [],
        specialAisles: [],
        layout:        null,  // resultado de computeLayout()
        filtros: {
            conMercancia: false,
            libres:       false,
            picking:      false,
            paletizadas:  false,
            multiple:     false,
            stockBajo:    false,
            incidencias:  false
        },
        isPanning:  false,
        panStart:   { x: 0, y: 0, x0: 0, y0: 0 },
        selected:   null,
        busqueda:   '',
        fullscreen: false,
        cargando:   false,
        error:      false
    };

    // Única fuente de verdad para la transformación del mapa
    var viewState = { scale: 1, x: 0, y: 0 };

    var ZOOM_MIN  = 0.2;
    var ZOOM_MAX  = 6.0;
    var ZOOM_STEP = 0.2;

    // Umbrales de visibilidad de etiquetas (en unidades de escala, no %)
    var SIMPLE_LABEL_ZOOM = 2.2;   // muestra X024 / Y003
    var DETAIL_LABEL_ZOOM = 3.5;   // muestra también P002 D (segunda línea)

    /* ── REFERENCIAS DOM ──────────────────────────────────────────────────── */
    var svg            = document.getElementById('maSvg');
    var maLoading      = document.getElementById('maLoading');
    var maError        = document.getElementById('maError');
    var maErrorMsg     = document.getElementById('maErrorMsg');
    var maDetail       = document.getElementById('maDetail');
    var maDetailTitle  = document.getElementById('maDetailTitle');
    var maDetailBody   = document.getElementById('maDetailBody');
    var maDetailClose  = document.getElementById('maDetailClose');
    var maDetailBdrop  = document.getElementById('maDetailBackdrop');
    var maCount        = document.getElementById('ma-count');
    var maTimestamp    = document.getElementById('ma-timestamp');
    var maZoomLabel    = document.getElementById('ma-zoom-label');
    var searchInput    = document.getElementById('ma-search');
    var btnBuscar      = document.getElementById('btn-buscar-mapa');
    var btnLimpiar     = document.getElementById('btn-limpiar-busqueda');
    var btnZoomIn      = document.getElementById('btn-zoom-in');
    var btnZoomOut     = document.getElementById('btn-zoom-out');
    var btnCentrar     = document.getElementById('btn-centrar');
    var btnActualizar  = document.getElementById('btn-actualizar-mapa');
    var btnExpandir    = document.getElementById('btn-expandir');
    var btnSalirWrap   = document.getElementById('btn-salir-amplia-wrap');
    var btnSalir       = document.getElementById('btn-salir-amplia');
    var btnReintentar  = document.getElementById('btn-reintentar');
    var mapContainer   = document.getElementById('maMapContainer');
    var mapaBody       = document.getElementById('mapaBody');

    var fConMercancia  = document.getElementById('f-con-mercancia');
    var fLibres        = document.getElementById('f-libres');
    var fPicking       = document.getElementById('f-picking');
    var fPaletizadas   = document.getElementById('f-paletizadas');
    var fMultiple      = document.getElementById('f-multiple');
    var fStockBajo     = document.getElementById('f-stock-bajo');
    var fIncidencias   = document.getElementById('f-incidencias');

    /* ── PARSER DE UBIETI ─────────────────────────────────────────────────── */
    /*
     * Parsea la etiqueta de ubicación real del sistema LIN.
     * Formato: "P{pasillo} {lado} X{col} Y{altura}"
     * Ejemplo:  "P001 I X003 Y002"
     * Retorna:  { pasillo:1, lado:'I', x:3, y:2 }  o  null si no parseable.
     */
    /* Normaliza un objeto ubicacion al formato interno, sea cual sea el origen */
    function normUbi(u) {
        return {
            UBICODUBI:   String(u.UBICODUBI  || u.ubicacion   || '').trim(),
            UBIETI:      String(u.UBIETI     || u.etiqueta    || '').trim(),
            UBIMUL:      u.UBIMUL    !== undefined ? u.UBIMUL    : (u.multiple   || 0),
            UBINUMPAL:   u.UBINUMPAL !== undefined ? u.UBINUMPAL : (u.palets     || 0),
            UBICON:      u.UBICON    !== undefined ? u.UBICON    : (u.picking    || 0),
            UBIDISABLE:  u.UBIDISABLE !== undefined ? u.UBIDISABLE : (u.exclusiva || 0),
            UBI001:      u.UBI001    !== undefined ? u.UBI001    : 0
        };
    }

    function parseUbicacion(ubiEti) {
        if (!ubiEti) return null;
        var s = String(ubiEti).trim();
        var m = s.match(/^P(\d+)\s+(I|D)\s+X(\d+)\s+Y(\d+)/i);
        if (!m) return null;
        return {
            pasillo: parseInt(m[1], 10),
            lado:    m[2].toUpperCase(),   // 'I' | 'D'
            x:       parseInt(m[3], 10),   // columna dentro del pasillo
            y:       parseInt(m[4], 10)    // altura / nivel
        };
    }

    /* ── CONSTRUCCIÓN DEL MAPA DE ESTRUCTURA ─────────────────────────────── */
    /*
     * Construye aislMap[pasillo][lado][x][y] = ubiObj
     * y las listas mainAisles / specialAisles.
     */
    function buildAislMap(ubicaciones) {
        var map = {};
        ubicaciones.forEach(function (u) {
            var p = parseUbicacion(u.UBIETI);
            if (!p) return;
            if (!map[p.pasillo])               map[p.pasillo] = {};
            if (!map[p.pasillo][p.lado])       map[p.pasillo][p.lado] = {};
            if (!map[p.pasillo][p.lado][p.x])  map[p.pasillo][p.lado][p.x] = {};
            map[p.pasillo][p.lado][p.x][p.y] = u;
        });

        var allP = Object.keys(map).map(Number).sort(function (a, b) { return a - b; });
        state.aislMap      = map;
        state.mainAisles    = allP.filter(function (p) { return p < SPECIAL_THRESHOLD; });
        state.specialAisles = allP.filter(function (p) { return p >= SPECIAL_THRESHOLD; });
    }

    /* ── HELPERS DE STOCK ─────────────────────────────────────────────────── */
    function stockKey(cod) {
        return String(cod || '').trim().toUpperCase();
    }

    function buildStockMap(rows) {
        var map = {};
        rows.forEach(function (r) {
            var key = stockKey(r.STOUBI || r.ubicacion || r.ubi || '');
            if (!key) return;
            if (!map[key]) {
                map[key] = {
                    articulo: String(r.STOARTCOD || r.articulo || '').trim(),
                    lote:     String(r.STOLOT    || r.lote     || '').trim(),
                    can:      Number(r.STOCAN    || r.cantidad || r.stock || 0),
                    nombre:   String(r.ARTNOM    || r.nombre   || '').trim()
                };
            } else {
                map[key].can += Number(r.STOCAN || r.cantidad || r.stock || 0);
            }
        });
        return map;
    }

    function buildMinimoMap(rows) {
        var map = {};
        rows.forEach(function (r) {
            var art = String(r.ARTCOD || r.articulo || '').trim();
            if (art) map[art] = Number(r.MINIMO || r.minimo || r.stock_minimo || 0);
        });
        return map;
    }

    function getEstadoUbi(ubi) {
        if (Number(ubi.UBIDISABLE) === 1 || Number(ubi.UBI001) === 1) return 'deshabilitada';
        var cod   = stockKey(ubi.UBICODUBI || '');
        var entry = state.stockMap[cod];
        if (!entry || Number(entry.can) <= 0) return 'libre';
        var min = state.minimoMap[entry.articulo];
        if (min !== undefined && Number(min) > 0 && Number(entry.can) < Number(min)) return 'bajo';
        return 'ocupada';
    }

    function pasaFiltros(ubi) {
        var f      = state.filtros;
        var cod    = stockKey(ubi.UBICODUBI || '');
        var entry  = state.stockMap[cod];
        var tieneStock = !!(entry && Number(entry.can) > 0);
        var estado = getEstadoUbi(ubi);

        if (f.conMercancia && !tieneStock)       return false;
        if (f.libres        && tieneStock)        return false;
        if (f.picking       && !Number(ubi.UBICON))     return false; // UBICON = picking flag en este sistema
        if (f.paletizadas   && !Number(ubi.UBINUMPAL))  return false;
        if (f.multiple      && !Number(ubi.UBIMUL))     return false;
        if (f.stockBajo     && estado !== 'bajo')        return false;
        if (f.incidencias   && estado !== 'deshabilitada') return false;
        return true;
    }

    function esBusqueda(ubi) {
        if (!state.busqueda) return false;
        var q     = state.busqueda.toLowerCase();
        var cod   = String(ubi.UBICODUBI || '').toLowerCase();
        var eti   = String(ubi.UBIETI    || '').toLowerCase();
        var entry = state.stockMap[stockKey(ubi.UBICODUBI || '')];
        return cod.indexOf(q) !== -1
            || eti.indexOf(q) !== -1
            || (entry && (
                String(entry.articulo).toLowerCase().indexOf(q) !== -1 ||
                String(entry.lote).toLowerCase().indexOf(q)     !== -1
            ));
    }

    /* ── buildWarehouseLayout ────────────────────────────────────────────────
     *
     * Calcula coordenadas SVG reales para cada ubicación.
     *
     * MODELO:
     *   pasilloIndex  → SVG-X base fija (MARGIN_X + idx * PASILLO_SPACING)
     *   columna X     → desplazamiento SVG-Y  (xIdx * (CELL_W + CELL_GAP))
     *   altura  Y     → desplazamiento SVG-X  dentro del bloque de lado
     *   lado I        → bloque izquierdo dentro del pasillo
     *   lado D        → bloque derecho  (offset += ladoI_ancho + LADO_CORRIDOR)
     *
     * Retorna un layout con la misma interfaz que consumía renderMapa:
     *   { aisleLayouts, specLayouts, specialY, totalW, totalH }
     *
     * Cada aisleLayout tiene:
     *   pasillo, svgX (base del bloque), altoTotal,
     *   lados[lado].svgXStart,  lados[lado].allX, lados[lado].maxY
     *
     * IMPORTANTE — ejes en el SVG:
     *   SVG-X = posición horizontal  → identifica el PASILLO y el LADO
     *   SVG-Y = posición vertical    → identifica la COLUMNA X y la ALTURA Y
     *
     *   Así cada pasillo aparece como un bloque vertical, los pasillos se
     *   distribuyen de izquierda a derecha, y las ubicaciones crecen hacia abajo.
     */
    function buildWarehouseLayout(aislMap, mainAisles, specialAisles, cW, cH, spacing) {
        function infoLado(xMap) {
            var allX = Object.keys(xMap).map(Number).sort(function (a, b) { return a - b; });
            var maxY = 1;
            allX.forEach(function (x) {
                var ys = Object.keys(xMap[x]).map(Number);
                if (ys.length) maxY = Math.max(maxY, Math.max.apply(null, ys));
            });
            // SVG-X span of this side = maxY * (cW + CELL_GAP)  [heights become horizontal cells]
            // SVG-Y span of this side = allX.length * (cH + CELL_GAP)  [cols become vertical rows]
            var svgXSpan = maxY * (cW + CELL_GAP) - CELL_GAP;
            var svgYSpan = allX.length * (cH + CELL_GAP) - CELL_GAP;
            return { allX: allX, maxY: maxY, svgXSpan: svgXSpan, svgYSpan: svgYSpan };
        }

        function layoutPasillos(list, baseX, baseSpacing) {
            var layouts = [];
            list.forEach(function (pas, idx) {
                var pasilloBaseX = baseX + idx * baseSpacing;
                // I siempre a la izquierda, D siempre a la derecha
                var ladosRaw = Object.keys(aislMap[pas] || {});
                var lados = ['I', 'D'].filter(function (l) { return ladosRaw.indexOf(l) !== -1; });
                var info  = { pasillo: pas, svgX: pasilloBaseX, lados: {}, altoTotal: 0 };
                var cursorX = pasilloBaseX;

                lados.forEach(function (lado, lIdx) {
                    var li = infoLado(aislMap[pas][lado]);
                    li.svgXStart = cursorX;
                    info.lados[lado] = li;
                    cursorX += li.svgXSpan;
                    if (lIdx < lados.length - 1) cursorX += LADO_CORRIDOR;
                    info.altoTotal = Math.max(info.altoTotal, li.svgYSpan);
                });

                info.anchoTotal = cursorX - pasilloBaseX;
                layouts.push(info);
            });
            return layouts;
        }

        var aisleLayouts = layoutPasillos(mainAisles, MARGIN_X, spacing);

        // Altura máxima de la zona principal
        var mainH = MARGIN_Y + PASILLO_LABEL_H;
        aisleLayouts.forEach(function (a) {
            mainH = Math.max(mainH, MARGIN_Y + PASILLO_LABEL_H + a.altoTotal + MARGIN_Y);
        });

        var specialY    = mainH + ZONE_SEP;
        var specLayouts = layoutPasillos(specialAisles, MARGIN_X, SPECIAL_SPACING);

        var specH = 0;
        specLayouts.forEach(function (s) { specH = Math.max(specH, s.altoTotal); });

        var totalW = MARGIN_X;
        aisleLayouts.concat(specLayouts).forEach(function (a) {
            totalW = Math.max(totalW, a.svgX + a.anchoTotal + MARGIN_X);
        });
        var totalH = specLayouts.length
            ? specialY + PASILLO_LABEL_H + specH + MARGIN_Y
            : mainH;

        return {
            aisleLayouts: aisleLayouts,
            specLayouts:  specLayouts,
            specialY:     specialY,
            totalW:       Math.max(totalW, 300),
            totalH:       Math.max(totalH, 200)
        };
    }

    /* ── RENDER SVG ───────────────────────────────────────────────────────── */
    function renderMapa() {
        if (!svg) return;

        if (!state.mainAisles.length && !state.specialAisles.length) {
            svg.innerHTML = '<text x="400" y="200" text-anchor="middle" '
                + 'fill="#64748b" font-size="14">Sin ubicaciones cargadas</text>';
            applyTransform();
            return;
        }

        var layout = buildWarehouseLayout(
            state.aislMap, state.mainAisles, state.specialAisles,
            CELL_W, CELL_H, PASILLO_SPACING
        );
        state.layout = layout;

        // Sin viewBox — el grupo usa píxeles del contenedor directamente,
        // igual que el transform de viewState. viewBox causaría dos escalas superpuestas.
        svg.removeAttribute('viewBox');

        var ns = 'http://www.w3.org/2000/svg';
        var g  = document.createElementNS(ns, 'g');
        g.setAttribute('id', 'maMapGroup');
        g.setAttribute('transform',
            'translate(' + viewState.x + ',' + viewState.y + ') scale(' + viewState.scale + ')');

        // Fondo
        var bg = document.createElementNS(ns, 'rect');
        bg.setAttribute('x', 0); bg.setAttribute('y', 0);
        bg.setAttribute('width', layout.totalW); bg.setAttribute('height', layout.totalH);
        bg.setAttribute('fill', 'var(--sga-surface-alt)'); bg.setAttribute('stroke', 'none');
        g.appendChild(bg);

        var ubisRender = [];

        /*
         * renderLado — dibuja todas las celdas de un lado dentro de un pasillo.
         *
         * EJES:
         *   svgX de la celda = lInfo.svgXStart + (yNum-1) * (cW + CELL_GAP)
         *     → las alturas Y avanzan HORIZONTALMENTE dentro del bloque de lado
         *   svgY de la celda = svgY0 + xIdx * (cH + CELL_GAP)
         *     → las columnas X avanzan VERTICALMENTE (profundidad del pasillo)
         *
         * Resultado visual:
         *   Cada columna X es una fila horizontal de celdas (una por altura Y).
         *   Las filas se apilan verticalmente → el bloque crece hacia abajo.
         */
        function renderLado(aislInfo, lado, lInfo, svgY0, cW, cH) {
            var xMap_all = state.aislMap[aislInfo.pasillo][lado];
            var step = cW + CELL_GAP;
            var totalRows = lInfo.allX.length;
            lInfo.allX.forEach(function (xNum, xIdx) {
                // X1 en la parte inferior del bloque (más cercano al pasillo frontal)
                var rowY  = svgY0 + (totalRows - 1 - xIdx) * (cH + CELL_GAP);
                var xMap  = xMap_all[xNum] || {};
                for (var yNum = 1; yNum <= lInfo.maxY; yNum++) {
                    // Lado I (bloque izquierdo): Y=1 pegado al corredor → 4 3 2 1 | corredor |
                    // Lado D (bloque derecho):  Y=1 pegado al corredor → | corredor | 1 2 3 4
                    var cellX = lado === 'I'
                        ? lInfo.svgXStart + (lInfo.maxY - yNum) * step
                        : lInfo.svgXStart + (yNum - 1) * step;
                    var ubi   = xMap[yNum];

                    if (!ubi) {
                        // Hueco: posición inexistente en BD
                        var ghost = document.createElementNS(ns, 'rect');
                        ghost.setAttribute('x', cellX);   ghost.setAttribute('y', rowY);
                        ghost.setAttribute('width', cW);  ghost.setAttribute('height', cH);
                        ghost.setAttribute('rx', 1);
                        ghost.setAttribute('fill', 'none');
                        ghost.setAttribute('stroke', 'var(--sga-border-light)');
                        ghost.setAttribute('stroke-dasharray', '2,2');
                        g.appendChild(ghost);
                        continue;
                    }

                    var visible = pasaFiltros(ubi);
                    var estado  = getEstadoUbi(ubi);
                    var busq    = esBusqueda(ubi);

                    var cls = 'ma-ubi ma-ubi--' + estado
                        + (visible ? '' : ' ma-ubi--oculta')
                        + (busq    ? ' ma-ubi--resaltada' : '');

                    var rect = document.createElementNS(ns, 'rect');
                    rect.setAttribute('class', cls);
                    rect.setAttribute('x', cellX);  rect.setAttribute('y', rowY);
                    rect.setAttribute('width', cW); rect.setAttribute('height', cH);
                    rect.setAttribute('rx', 1);
                    rect.setAttribute('data-ubi', ubi.UBICODUBI || '');
                    rect.setAttribute('tabindex', '0');
                    rect.setAttribute('role', 'button');
                    rect.setAttribute('aria-label', 'Ubicación ' + (ubi.UBIETI || ubi.UBICODUBI || ''));
                    g.appendChild(rect);
                    ubisRender.push({ el: rect, ubi: ubi, visible: visible });

                    // Etiquetas de ubicación — solo si la celda tiene tamaño suficiente
                    var parsed = parseUbicacion(ubi.UBIETI);
                    if (parsed && cW >= 14 && cH >= 10) {
                        var cx = cellX + cW / 2;
                        var fullCode = formatUbicacionLabel(parsed);

                        // Línea superior: X024
                        var lblX = document.createElementNS(ns, 'text');
                        lblX.setAttribute('class', 'map-label-simple');
                        lblX.setAttribute('x', cx);
                        lblX.setAttribute('y', rowY + cH * 0.35);
                        lblX.setAttribute('text-anchor', 'middle');
                        lblX.setAttribute('dominant-baseline', 'middle');
                        lblX.setAttribute('pointer-events', 'none');
                        lblX.style.display = viewState.scale >= SIMPLE_LABEL_ZOOM ? '' : 'none';
                        var titleX = document.createElementNS(ns, 'title');
                        titleX.textContent = fullCode;
                        lblX.appendChild(titleX);
                        lblX.appendChild(document.createTextNode('X' + pad3(parsed.x)));
                        g.appendChild(lblX);

                        // Línea inferior: Y003
                        var lblY = document.createElementNS(ns, 'text');
                        lblY.setAttribute('class', 'map-label-simple');
                        lblY.setAttribute('x', cx);
                        lblY.setAttribute('y', rowY + cH * 0.68);
                        lblY.setAttribute('text-anchor', 'middle');
                        lblY.setAttribute('dominant-baseline', 'middle');
                        lblY.setAttribute('pointer-events', 'none');
                        lblY.style.display = viewState.scale >= SIMPLE_LABEL_ZOOM ? '' : 'none';
                        lblY.appendChild(document.createTextNode('Y' + pad3(parsed.y)));
                        g.appendChild(lblY);
                    }
                }
            });
        }

        // ── Función auxiliar: dibuja un bloque de pasillo completo ────────
        function renderPasillo(aInfo, svgY0) {
            // Fondo del bloque de pasillo
            var pasilloRect = document.createElementNS(ns, 'rect');
            pasilloRect.setAttribute('class', 'ma-module');
            pasilloRect.setAttribute('x',      aInfo.svgX - 4);
            pasilloRect.setAttribute('y',      svgY0 - 2);
            pasilloRect.setAttribute('width',  aInfo.anchoTotal + 8);
            pasilloRect.setAttribute('height', aInfo.altoTotal  + 4);
            pasilloRect.setAttribute('rx', 3);
            g.appendChild(pasilloRect);

            // Corredor central entre lado I y D
            if (aInfo.lados['I'] && aInfo.lados['D']) {
                var corrX = aInfo.lados['I'].svgXStart + aInfo.lados['I'].svgXSpan;
                var corr  = document.createElementNS(ns, 'rect');
                corr.setAttribute('class', 'ma-aisle');
                corr.setAttribute('x',      corrX);
                corr.setAttribute('y',      svgY0);
                corr.setAttribute('width',  LADO_CORRIDOR);
                corr.setAttribute('height', aInfo.altoTotal);
                corr.setAttribute('rx', 0);
                g.appendChild(corr);
            }

            // Etiquetas de lado
            ['I', 'D'].forEach(function (lado) {
                if (!aInfo.lados[lado]) return;
                var li = aInfo.lados[lado];
                var ladoLbl = document.createElementNS(ns, 'text');
                ladoLbl.setAttribute('font-size', '6');
                ladoLbl.setAttribute('fill', 'var(--sga-text-muted)');
                ladoLbl.setAttribute('text-anchor', 'middle');
                ladoLbl.setAttribute('x', li.svgXStart + li.svgXSpan / 2);
                ladoLbl.setAttribute('y', svgY0 - 4);
                ladoLbl.textContent = lado;
                g.appendChild(ladoLbl);
            });

            // Ubicaciones — cada lado anclado al pie del bloque (svgY0 ajustado por altura propia)
            var svgYBottom = svgY0 + aInfo.altoTotal;
            ['I', 'D'].forEach(function (lado) {
                if (!aInfo.lados[lado]) return;
                var li = aInfo.lados[lado];
                var ladoY0 = svgYBottom - li.svgYSpan;
                renderLado(aInfo, lado, li, ladoY0, CELL_W, CELL_H);
            });
        }

        // ── ZONA PRINCIPAL ────────────────────────────────────────────────
        var svgY0Main = MARGIN_Y + PASILLO_LABEL_H;

        layout.aisleLayouts.forEach(function (aInfo) {
            // Etiqueta centrada sobre el corredor (punto de contacto entre lado I y lado D)
            var lblX;
            if (aInfo.lados['I'] && aInfo.lados['D']) {
                var corrX = aInfo.lados['I'].svgXStart + aInfo.lados['I'].svgXSpan;
                lblX = corrX + LADO_CORRIDOR / 2;
            } else {
                lblX = aInfo.svgX + aInfo.anchoTotal / 2;
            }
            var lbl  = document.createElementNS(ns, 'text');
            lbl.setAttribute('class', 'ma-aisle-label');
            lbl.setAttribute('x', lblX);
            lbl.setAttribute('y', MARGIN_Y + PASILLO_LABEL_H - 5);
            lbl.setAttribute('font-size', '10');
            lbl.setAttribute('font-weight', '700');
            lbl.textContent = 'P' + String(aInfo.pasillo).padStart(3, '0');
            g.appendChild(lbl);

            renderPasillo(aInfo, svgY0Main);
        });

        // ── ZONA ESPECIAL ─────────────────────────────────────────────────
        if (layout.specLayouts.length) {
            var sep = document.createElementNS(ns, 'line');
            sep.setAttribute('x1', MARGIN_X / 2);
            sep.setAttribute('y1', layout.specialY - ZONE_SEP / 2);
            sep.setAttribute('x2', layout.totalW - MARGIN_X / 2);
            sep.setAttribute('y2', layout.specialY - ZONE_SEP / 2);
            sep.setAttribute('stroke', 'var(--sga-border)');
            sep.setAttribute('stroke-width', '1');
            sep.setAttribute('stroke-dasharray', '4,4');
            g.appendChild(sep);

            var zLbl = document.createElementNS(ns, 'text');
            zLbl.setAttribute('x', MARGIN_X);
            zLbl.setAttribute('y', layout.specialY - 6);
            zLbl.setAttribute('font-size', '8');
            zLbl.setAttribute('fill', 'var(--sga-text-muted)');
            zLbl.setAttribute('font-weight', '700');
            zLbl.textContent = 'ZONAS ESPECIALES';
            g.appendChild(zLbl);

            var svgY0Spec = layout.specialY + PASILLO_LABEL_H;

            layout.specLayouts.forEach(function (sInfo) {
                var sLbl = document.createElementNS(ns, 'text');
                sLbl.setAttribute('class', 'ma-aisle-label');
                sLbl.setAttribute('x', sInfo.svgX + sInfo.anchoTotal / 2);
                sLbl.setAttribute('y', layout.specialY + PASILLO_LABEL_H - 5);
                sLbl.setAttribute('font-size', '9');
                sLbl.setAttribute('font-weight', '700');
                sLbl.textContent = 'P' + sInfo.pasillo;
                g.appendChild(sLbl);

                var specBottom = svgY0Spec + sInfo.altoTotal;
                ['I', 'D'].forEach(function (lado) {
                    if (!sInfo.lados[lado]) return;
                    var li = sInfo.lados[lado];
                    renderLado(sInfo, lado, li, specBottom - li.svgYSpan, SPECIAL_CELL_W, SPECIAL_CELL_H);
                });
            });
        }

        // Reemplazar SVG y vincular eventos
        svg.innerHTML = '';
        svg.appendChild(g);

        ubisRender.forEach(function (item) {
            item.el.addEventListener('click', function () { seleccionarUbi(item.ubi); });
            item.el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleccionarUbi(item.ubi); }
            });
        });

        updateZoomDependentLabels();
        actualizarContador(ubisRender);
    }

    /* ── SELECCIÓN Y PANEL DE DETALLE ─────────────────────────────────────── */
    function seleccionarUbi(ubi) {
        state.selected = ubi;
        var cod   = stockKey(ubi.UBICODUBI || '');
        var entry = state.stockMap[cod] || {};
        var min   = state.minimoMap[entry.articulo] !== undefined ? state.minimoMap[entry.articulo] : '—';
        var p     = parseUbicacion(ubi.UBIETI);

        maDetailTitle.textContent = (ubi.UBIETI || ubi.UBICODUBI || '—').trim();

        var html = '<div class="ma-detail-section-title">Ubicación</div>';
        html += fila('Código',   ubi.UBICODUBI || '—');
        html += fila('Etiqueta', ubi.UBIETI    || '—');
        if (p) {
            html += fila('Pasillo', 'P' + String(p.pasillo).padStart(3,'0'));
            html += fila('Lado',    p.lado === 'I' ? 'Izquierda' : 'Derecha');
            html += fila('Columna', 'X' + p.x);
            html += fila('Altura',  'Y' + p.y);
        }
        html += fila('Picking',   Number(ubi.UBICON)     > 0 ? '✓ Sí' : 'No');
        html += fila('Múltiple',  Number(ubi.UBIMUL)    === 1 ? '✓ Sí' : 'No');
        html += fila('Palets',    Number(ubi.UBINUMPAL) > 0 ? '✓ (' + ubi.UBINUMPAL + ')' : 'No');
        html += fila('Estado',    (Number(ubi.UBIDISABLE) === 1 || Number(ubi.UBI001) === 1) ? '⛔ Deshabilitada' : '✓ Activa');

        if (entry.articulo) {
            html += '<div class="ma-detail-section-title">Stock</div>';
            html += fila('Artículo', entry.articulo);
            html += fila('Nombre',   entry.nombre || '—');
            html += fila('Lote',     entry.lote   || '—');
            html += fila('Cantidad', entry.can !== undefined ? entry.can : '—');
            html += fila('Mínimo',   min);
            if (getEstadoUbi(ubi) === 'bajo') {
                html += '<div style="margin-top:8px;padding:6px;background:var(--sga-warning-bg);'
                    + 'color:var(--sga-warning);border-radius:4px;font-size:.78rem;">'
                    + '⚠ Stock por debajo del mínimo</div>';
            }
        } else {
            html += '<div class="ma-detail-section-title">Stock</div>';
            html += '<p style="color:var(--sga-text-muted);font-size:.8rem;margin-top:4px;">'
                + 'Ubicación libre — sin stock registrado</p>';
        }

        maDetailBody.innerHTML = html;
        maDetail.hidden        = false;
        maDetailBdrop.hidden   = false;
    }

    function fila(key, val) {
        return '<div class="ma-detail-row">'
            + '<span class="ma-detail-key">' + escHtml(String(key)) + '</span>'
            + '<span class="ma-detail-val">'  + escHtml(String(val)) + '</span>'
            + '</div>';
    }

    function escHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function cerrarDetalle() {
        maDetail.hidden      = true;
        maDetailBdrop.hidden = true;
        state.selected       = null;
    }

    /* ── ETIQUETAS DE UBICACIÓN ──────────────────────────────────────────── */
    function pad3(n) { return String(n).padStart(3, '0'); }

    function formatUbicacionLabel(p) {
        return 'P' + pad3(p.pasillo) + ' ' + p.lado + ' X' + pad3(p.x) + ' Y' + pad3(p.y);
    }

    function updateZoomDependentLabels() {
        var sc = viewState.scale;
        var showSimple = sc >= SIMPLE_LABEL_ZOOM;
        var simple = svg.querySelectorAll('.map-label-simple');
        for (var i = 0; i < simple.length; i++)
            simple[i].style.display = showSimple ? '' : 'none';
        var detail = svg.querySelectorAll('.map-label-detail');
        for (var j = 0; j < detail.length; j++)
            detail[j].style.display = (sc >= DETAIL_LABEL_ZOOM) ? '' : 'none';
    }

    /* ── ZOOM Y PAN ───────────────────────────────────────────────────────── */
    function applyMapTransform() {
        var grp = document.getElementById('maMapGroup');
        if (!grp) return;
        grp.setAttribute('transform',
            'translate(' + viewState.x + ',' + viewState.y + ') scale(' + viewState.scale + ')');
    }

    function updateZoomUI() {
        maZoomLabel.textContent = Math.round(viewState.scale * 100) + '%';
    }

    // applyTransform — alias de compatibilidad interno
    function applyTransform() {
        applyMapTransform();
        updateZoomUI();
    }

    /*
     * zoomAt — zoom pivotando sobre clientX/clientY (coordenadas de ventana).
     * Mantiene el punto del mundo bajo el cursor fijo después del zoom.
     * Comportamiento idéntico a Google Maps.
     */
    function zoomAt(clientX, clientY, factor) {
        var rect = mapContainer.getBoundingClientRect();
        var mouseX = clientX - rect.left;
        var mouseY = clientY - rect.top;
        var nextScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, viewState.scale * factor));
        if (nextScale === viewState.scale) return;
        var worldX = (mouseX - viewState.x) / viewState.scale;
        var worldY = (mouseY - viewState.y) / viewState.scale;
        viewState.x = mouseX - worldX * nextScale;
        viewState.y = mouseY - worldY * nextScale;
        viewState.scale = nextScale;
        applyMapTransform();
        updateZoomUI();
        updateZoomDependentLabels();
    }

    // zoomCenter — zoom centrado en el centro visible del contenedor (botones +/-)
    function zoomCenter(factor) {
        var rect = mapContainer.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    }

    function setZoom(z) {
        var rect = mapContainer.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top  + rect.height / 2;
        var factor = z / viewState.scale;
        zoomAt(cx, cy, factor);
    }

    // fitMapToContainer — escala el mapa para que quepa en el contenedor visible
    function fitMapToContainer() {
        if (!state.layout) return;
        var rect = mapContainer.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var scaleX = rect.width  / state.layout.totalW;
        var scaleY = rect.height / state.layout.totalH;
        var fit    = Math.min(scaleX, scaleY) * 0.92; // 8% de margen visual
        fit = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit));
        viewState.scale = fit;
        // Centrar el mapa en el contenedor
        viewState.x = (rect.width  - state.layout.totalW  * fit) / 2;
        viewState.y = (rect.height - state.layout.totalH * fit) / 2;
    }

    function centrarMapa() {
        fitMapToContainer();
        applyTransform();
        updateZoomDependentLabels();
        if (state.ubicaciones.length) renderMapa();
    }

    /* ── BUSCADOR ─────────────────────────────────────────────────────────── */
    function ejecutarBusqueda() {
        var q = searchInput.value.trim();
        state.busqueda = q;
        btnLimpiar.hidden = !q;
        renderMapa();
        if (q) {
            var found = state.ubicaciones.find(function (u) {
                var cod   = String(u.UBICODUBI || '').toLowerCase();
                var eti   = String(u.UBIETI    || '').toLowerCase();
                var entry = state.stockMap[stockKey(u.UBICODUBI || '')];
                return cod.indexOf(q.toLowerCase()) !== -1
                    || eti.indexOf(q.toLowerCase())  !== -1
                    || (entry && (
                        String(entry.articulo).toLowerCase().indexOf(q.toLowerCase()) !== -1 ||
                        String(entry.lote).toLowerCase().indexOf(q.toLowerCase())     !== -1
                    ));
            });
            if (found) seleccionarUbi(found);
        }
    }

    /* ── FILTROS ──────────────────────────────────────────────────────────── */
    function leerFiltros() {
        state.filtros.conMercancia = fConMercancia.checked;
        state.filtros.libres       = fLibres.checked;
        state.filtros.picking      = fPicking.checked;
        state.filtros.paletizadas  = fPaletizadas.checked;
        state.filtros.multiple     = fMultiple.checked;
        state.filtros.stockBajo    = fStockBajo.checked;
        state.filtros.incidencias  = fIncidencias.checked;
        renderMapa();
    }

    /* ── PANTALLA AMPLIA ──────────────────────────────────────────────────── */
    function entrarPantallaAmplia() {
        state.fullscreen = true;
        mapaBody.classList.add('map-fullscreen-mode');
        btnExpandir.hidden  = true;
        btnSalirWrap.hidden = false;
    }

    function salirPantallaAmplia() {
        state.fullscreen = false;
        mapaBody.classList.remove('map-fullscreen-mode');
        btnExpandir.hidden  = false;
        btnSalirWrap.hidden = true;
    }

    /* ── PAN (ratón y touch) ──────────────────────────────────────────────── */
    function initPan() {
        mapContainer.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            if (e.target.classList.contains('ma-ubi')) return;
            state.isPanning = true;
            state.panStart  = { x: e.clientX, y: e.clientY, x0: viewState.x, y0: viewState.y };
            e.preventDefault();
        });
        document.addEventListener('mousemove', function (e) {
            if (!state.isPanning) return;
            viewState.x = state.panStart.x0 + (e.clientX - state.panStart.x);
            viewState.y = state.panStart.y0 + (e.clientY - state.panStart.y);
            applyMapTransform();
        });
        document.addEventListener('mouseup', function () { state.isPanning = false; });

        mapContainer.addEventListener('wheel', function (e) {
            e.preventDefault();
            var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            zoomAt(e.clientX, e.clientY, factor);
        }, { passive: false });

        var touchStart = null;
        mapContainer.addEventListener('touchstart', function (e) {
            if (e.touches.length === 1)
                touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY,
                               x0: viewState.x, y0: viewState.y };
        }, { passive: true });
        mapContainer.addEventListener('touchmove', function (e) {
            if (!touchStart || e.touches.length !== 1) return;
            viewState.x = touchStart.x0 + (e.touches[0].clientX - touchStart.x);
            viewState.y = touchStart.y0 + (e.touches[0].clientY - touchStart.y);
            applyMapTransform();
        }, { passive: true });
        mapContainer.addEventListener('touchend', function () { touchStart = null; });
    }

    /* ── CARGA DE DATOS ───────────────────────────────────────────────────── */
    function mostrarCargando() {
        maLoading.hidden = false;
        maError.hidden   = true;
        svg.style.visibility = 'hidden';
    }
    function mostrarError(msg) {
        maLoading.hidden = true;
        maError.hidden   = false;
        maErrorMsg.textContent = msg || 'No se pudieron cargar los datos del almacén.';
        svg.style.visibility = 'hidden';
    }
    function mostrarMapa() {
        maLoading.hidden = true;
        maError.hidden   = true;
        svg.style.visibility = 'visible';
    }

    function actualizarContador(ubisRender) {
        var total    = state.ubicaciones.length;
        var visibles = ubisRender.filter(function (u) { return u.visible; }).length;
        var ts       = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        maCount.textContent     = visibles + ' / ' + total + ' ubicaciones';
        maTimestamp.textContent = 'Actualizado: ' + ts;
    }

    async function cargarDatos() {
        if (state.cargando) return;
        state.cargando = true;
        mostrarCargando();
        cerrarDetalle();

        var errores = [];

        try {
            var ubisResult = await SGA.mapaAlmacen.ubicaciones();
            var raw = Array.isArray(ubisResult)      ? ubisResult
                    : Array.isArray(ubisResult.data) ? ubisResult.data
                    : Array.isArray(ubisResult.rows) ? ubisResult.rows
                    : [];
            state.ubicaciones = raw.map(normUbi);
        } catch (e) {
            console.warn('[mapa-almacen] ubicaciones error:', e.message);
            errores.push('ubicaciones');
        }

        try {
            var stockResult = await SGA.mapaAlmacen.stock();
            var stockRows   = Array.isArray(stockResult)      ? stockResult
                            : Array.isArray(stockResult.data) ? stockResult.data
                            : Array.isArray(stockResult.rows) ? stockResult.rows
                            : [];
            state.stock    = stockRows;
            state.stockMap = buildStockMap(stockRows);
        } catch (e) {
            console.warn('[mapa-almacen] stock error:', e.message);
            errores.push('stock');
        }

        try {
            var mmResult = await SGA.mapaAlmacen.minimosMaximos();
            var mmRows   = Array.isArray(mmResult)      ? mmResult
                         : Array.isArray(mmResult.data) ? mmResult.data
                         : Array.isArray(mmResult.rows) ? mmResult.rows
                         : [];
            state.minimoMaximos = mmRows;
            state.minimoMap     = buildMinimoMap(mmRows);
        } catch (e) {
            console.warn('[mapa-almacen] minimoMaximos error:', e.message);
        }

        state.cargando = false;

        if (!state.ubicaciones.length && errores.includes('ubicaciones')) {
            mostrarError('No se pudieron cargar las ubicaciones. Verifique la conexión con el servidor.');
            return;
        }
        if (!state.ubicaciones.length) {
            mostrarError('No hay ubicaciones configuradas en el sistema.');
            return;
        }

        buildAislMap(state.ubicaciones);
        mostrarMapa();
        fitMapToContainer();
        renderMapa();

        if (errores.length)
            console.warn('[mapa-almacen] Datos parciales. Endpoints con error:', errores.join(', '));
    }

    /* ── EVENTOS ──────────────────────────────────────────────────────────── */
    function initEventos() {
        btnZoomIn.addEventListener('click',  function () { zoomCenter(1 + ZOOM_STEP); });
        btnZoomOut.addEventListener('click', function () { zoomCenter(1 - ZOOM_STEP); });
        btnCentrar.addEventListener('click', centrarMapa);

        btnBuscar.addEventListener('click', ejecutarBusqueda);
        searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') ejecutarBusqueda(); });
        btnLimpiar.addEventListener('click', function () {
            searchInput.value = '';
            state.busqueda    = '';
            btnLimpiar.hidden = true;
            renderMapa();
        });

        btnActualizar.addEventListener('click', cargarDatos);
        btnReintentar.addEventListener('click', cargarDatos);
        btnExpandir.addEventListener('click',   entrarPantallaAmplia);
        btnSalir.addEventListener('click',      salirPantallaAmplia);
        maDetailClose.addEventListener('click', cerrarDetalle);
        maDetailBdrop.addEventListener('click', cerrarDetalle);

        [fConMercancia, fLibres, fPicking, fPaletizadas, fMultiple, fStockBajo, fIncidencias]
            .forEach(function (cb) { cb.addEventListener('change', leerFiltros); });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                if (!maDetail.hidden)      cerrarDetalle();
                else if (state.fullscreen) salirPantallaAmplia();
            }
        });
    }

    /* ── INIT ─────────────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        if (!svg) return;

        function ajustarSvgSize() {
            var rect = mapContainer.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                svg.setAttribute('width',  rect.width);
                svg.setAttribute('height', rect.height);
            }
        }
        ajustarSvgSize();
        window.addEventListener('resize', function () {
            ajustarSvgSize();
            if (state.ubicaciones.length) renderMapa();
        });

        initPan();
        initEventos();
        cargarDatos();
    });

})();
