"use strict";

const { getPool } = require('../db');

function normalizeDate(value, fallback) {
    if (!value) return fallback;
    const s = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

function daysAgo(days) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function getDashboard(rawDesde, rawHasta) {
    const pool = await getPool();
    const q = () => pool.request();
    const desde = normalizeDate(rawDesde, daysAgo(30));
    const hasta = normalizeDate(rawHasta, new Date().toISOString().slice(0, 10));

    const [
        articulos,
        stock,
        ubicaciones,
        movimientosPeriodo,
        stockBajo,
        sinMovimiento,
        stockPorAlmacen,
        movimientosPorDia,
        tiposMovimiento,
        topArticulos,
        topUbicaciones,
        movimientosRecientes
    ] = await Promise.all([
        q().query(`SELECT COUNT(*) AS total FROM ARTICULO`),

        q().query(`
            SELECT
                COUNT(*) AS lineas_stock,
                ISNULL(SUM(CASE WHEN STOCAN > 0 THEN STOCAN ELSE 0 END), 0) AS unidades_stock
            FROM STOCK
        `),

        q().query(`
            SELECT
                COUNT(*) AS total_ubicaciones,
                (SELECT COUNT(DISTINCT STOUBI) FROM STOCK WHERE STOCAN > 0) AS ubicaciones_ocupadas
            FROM UBICACION
        `),

        q().input('desde', desde).input('hasta', hasta).query(`
            SELECT
                COUNT(*) AS movimientos_periodo,
                ISNULL(SUM(ABS(ISNULL(ACSCAN, 0))), 0) AS unidades_movidas_periodo
            FROM ALBARANCS
            WHERE CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
        `),

        q().query(`
            WITH stock_articulo AS (
                SELECT STOARTCOD, ISNULL(SUM(STOCAN), 0) AS stock_actual
                FROM STOCK
                GROUP BY STOARTCOD
            )
            SELECT COUNT(*) AS total
            FROM ARTICULO a
            LEFT JOIN stock_articulo s ON s.STOARTCOD = a.ARTCOD
            WHERE ISNULL(a.ARTSTOMIN, 0) > 0
              AND ISNULL(s.stock_actual, 0) <= ISNULL(a.ARTSTOMIN, 0)
        `),

        q().query(`
            WITH ultimo AS (
                SELECT ACSARTCOD, MAX(ACSFEC) AS ultimo_movimiento
                FROM ALBARANCS
                GROUP BY ACSARTCOD
            ),
            stock_articulo AS (
                SELECT STOARTCOD, SUM(STOCAN) AS stock_actual
                FROM STOCK
                GROUP BY STOARTCOD
            )
            SELECT COUNT(*) AS total
            FROM stock_articulo s
            LEFT JOIN ultimo u ON u.ACSARTCOD = s.STOARTCOD
            WHERE s.stock_actual > 0
              AND (u.ultimo_movimiento IS NULL OR u.ultimo_movimiento < DATEADD(day, -90, GETDATE()))
        `),

        q().query(`
            SELECT TOP 12
                cod AS almacen,
                CASE WHEN NULLIF(nom, '') IS NOT NULL THEN nom ELSE cod END AS nombre_almacen,
                unidades, articulos, ubicaciones
            FROM (
                SELECT
                    ISNULL(LTRIM(RTRIM(u.UBIALMCOD)), 'Sin almacén') AS cod,
                    ISNULL(LTRIM(RTRIM(al.ALMNOM)), '') AS nom,
                    ISNULL(SUM(CASE WHEN s.STOCAN > 0 THEN s.STOCAN ELSE 0 END), 0) AS unidades,
                    COUNT(DISTINCT s.STOARTCOD) AS articulos,
                    COUNT(DISTINCT s.STOUBI) AS ubicaciones
                FROM STOCK s
                LEFT JOIN UBICACION u ON u.UBICODUBI = s.STOUBI
                LEFT JOIN ALMACENES al ON al.ALMCOD = u.UBIALMCOD
                WHERE s.STOCAN > 0
                GROUP BY ISNULL(LTRIM(RTRIM(u.UBIALMCOD)), 'Sin almacén'), ISNULL(LTRIM(RTRIM(al.ALMNOM)), '')
            ) t
            ORDER BY unidades DESC
        `),

        q().input('desde', desde).input('hasta', hasta).query(`
            SELECT
                CONVERT(varchar, CAST(ACSFEC AS DATE), 23) AS fecha,
                COUNT(*) AS movimientos,
                ISNULL(SUM(ABS(ISNULL(ACSCAN, 0))), 0) AS unidades
            FROM ALBARANCS
            WHERE CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY CAST(ACSFEC AS DATE)
            ORDER BY CAST(ACSFEC AS DATE)
        `),

        q().input('desde', desde).input('hasta', hasta).query(`
            SELECT TOP 10
                ISNULL(NULLIF(ACSMOV, ''), 'Sin tipo') AS tipo,
                COUNT(*) AS movimientos,
                ISNULL(SUM(ABS(ISNULL(ACSCAN, 0))), 0) AS unidades
            FROM ALBARANCS
            WHERE CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY ISNULL(NULLIF(ACSMOV, ''), 'Sin tipo')
            ORDER BY movimientos DESC
        `),

        q().input('desde', desde).input('hasta', hasta).query(`
            SELECT TOP 10
                m.ACSARTCOD AS articulo,
                ISNULL(a.ARTNOM, 'Sin nombre') AS nombre,
                COUNT(*) AS movimientos,
                ISNULL(SUM(ABS(ISNULL(m.ACSCAN, 0))), 0) AS unidades
            FROM ALBARANCS m
            LEFT JOIN ARTICULO a ON a.ARTCOD = m.ACSARTCOD
            WHERE CAST(m.ACSFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY m.ACSARTCOD, ISNULL(a.ARTNOM, 'Sin nombre')
            ORDER BY unidades DESC, movimientos DESC
        `),

        q().query(`
            SELECT TOP 10
                s.STOUBI AS ubicacion,
                ISNULL(u.UBINOM, '') AS descripcion,
                ISNULL(u.UBIALMCOD, 'Sin almacén') AS almacen,
                ISNULL(SUM(CASE WHEN s.STOCAN > 0 THEN s.STOCAN ELSE 0 END), 0) AS unidades,
                COUNT(DISTINCT s.STOARTCOD) AS articulos
            FROM STOCK s
            LEFT JOIN UBICACION u ON u.UBICODUBI = s.STOUBI
            WHERE s.STOCAN > 0
            GROUP BY s.STOUBI, ISNULL(u.UBINOM, ''), ISNULL(u.UBIALMCOD, 'Sin almacén')
            ORDER BY unidades DESC
        `),

        q().query(`
            SELECT TOP 12
                CONVERT(varchar, al.ACSFEC, 23) AS fecha,
                CONVERT(varchar, al.ACSHOR, 8) AS hora,
                ISNULL(al.ACSMOV, '') AS tipo,
                ISNULL(al.ACSARTCOD, '') AS articulo,
                ISNULL(art.ARTNOM, '') AS nombre,
                ISNULL(al.ACSUBI, '') AS ubicacion,
                ISNULL(al.ACSLOT, '') AS lote,
                ISNULL(al.ACSCAN, 0) AS cantidad,
                ISNULL(al.ACSCLICOD, '') AS tercero,
                ISNULL(al.ACSCLINOM, '') AS nombre_tercero
            FROM ALBARANCS al
            LEFT JOIN ARTICULO art ON art.ARTCOD = al.ACSARTCOD
            ORDER BY al.ACSFEC DESC, al.ACSHOR DESC
        `)
    ]);

    const stockRow = stock.recordset[0] || {};
    const ubiRow = ubicaciones.recordset[0] || {};
    const movRow = movimientosPeriodo.recordset[0] || {};

    return {
        filtros: { desde, hasta },
        kpis: {
            articulos: articulos.recordset[0]?.total || 0,
            lineas_stock: stockRow.lineas_stock || 0,
            unidades_stock: stockRow.unidades_stock || 0,
            ubicaciones: ubiRow.total_ubicaciones || 0,
            ubicaciones_ocupadas: ubiRow.ubicaciones_ocupadas || 0,
            ocupacion_porcentaje: ubiRow.total_ubicaciones
                ? Math.round((ubiRow.ubicaciones_ocupadas / ubiRow.total_ubicaciones) * 100)
                : 0,
            movimientos_periodo: movRow.movimientos_periodo || 0,
            unidades_movidas_periodo: movRow.unidades_movidas_periodo || 0,
            stock_bajo: stockBajo.recordset[0]?.total || 0,
            sin_movimiento_90_dias: sinMovimiento.recordset[0]?.total || 0
        },
        graficos: {
            stock_por_almacen: stockPorAlmacen.recordset,
            movimientos_por_dia: movimientosPorDia.recordset,
            tipos_movimiento: tiposMovimiento.recordset,
            top_articulos: topArticulos.recordset,
            top_ubicaciones: topUbicaciones.recordset
        },
        movimientos_recientes: movimientosRecientes.recordset
    };
}

async function getAlertas() {
    const pool = await getPool();
    const q = () => pool.request();

    const [stockBajo, stockBajoTotal, stockNegativo, sinMovimiento] = await Promise.all([
        q().query(`
            WITH stock_articulo AS (
                SELECT STOARTCOD, ISNULL(SUM(STOCAN), 0) AS stock_actual
                FROM STOCK
                GROUP BY STOARTCOD
            )
            SELECT TOP 25
                a.ARTCOD AS articulo,
                a.ARTNOM AS nombre,
                ISNULL(s.stock_actual, 0) AS stock_actual,
                ISNULL(a.ARTSTOMIN, 0) AS stock_minimo,
                ISNULL(a.ARTSTOMAX, 0) AS stock_maximo
            FROM ARTICULO a
            LEFT JOIN stock_articulo s ON s.STOARTCOD = a.ARTCOD
            WHERE ISNULL(a.ARTSTOMIN, 0) > 0
              AND ISNULL(s.stock_actual, 0) <= ISNULL(a.ARTSTOMIN, 0)
            ORDER BY ISNULL(s.stock_actual, 0) ASC, a.ARTCOD
        `),

        q().query(`
            WITH stock_art AS (SELECT STOARTCOD, ISNULL(SUM(STOCAN),0) AS stock FROM STOCK GROUP BY STOARTCOD)
            SELECT COUNT(*) AS total FROM ARTICULOSTOMIN m
            LEFT JOIN stock_art s ON s.STOARTCOD = m.MINARTCOD
            WHERE m.MINSTOMIN > 0 AND ISNULL(s.stock,0) < m.MINSTOMIN
        `),

        q().query(`
            SELECT TOP 25
                s.STOARTCOD AS articulo,
                ISNULL(a.ARTNOM, '') AS nombre,
                s.STOUBI AS ubicacion,
                s.STOLOT AS lote,
                s.STOCAN AS stock
            FROM STOCK s
            LEFT JOIN ARTICULO a ON a.ARTCOD = s.STOARTCOD
            WHERE s.STOCAN < 0
            ORDER BY s.STOCAN ASC
        `),

        q().query(`
            WITH ultimo AS (
                SELECT ACSARTCOD, MAX(ACSFEC) AS ultimo_movimiento
                FROM ALBARANCS
                GROUP BY ACSARTCOD
            ),
            stock_articulo AS (
                SELECT STOARTCOD, SUM(STOCAN) AS stock_actual
                FROM STOCK
                GROUP BY STOARTCOD
            )
            SELECT TOP 25
                s.STOARTCOD AS articulo,
                ISNULL(a.ARTNOM, '') AS nombre,
                s.stock_actual,
                CONVERT(varchar, u.ultimo_movimiento, 23) AS ultimo_movimiento
            FROM stock_articulo s
            LEFT JOIN ARTICULO a ON a.ARTCOD = s.STOARTCOD
            LEFT JOIN ultimo u ON u.ACSARTCOD = s.STOARTCOD
            WHERE s.stock_actual > 0
              AND (u.ultimo_movimiento IS NULL OR u.ultimo_movimiento < DATEADD(day, -90, GETDATE()))
            ORDER BY u.ultimo_movimiento ASC
        `)
    ]);

    return {
        stock_bajo: stockBajo.recordset,
        stock_bajo_total: stockBajoTotal.recordset[0]?.total ?? stockBajo.recordset.length,
        stock_negativo: stockNegativo.recordset,
        sin_movimiento_90_dias: sinMovimiento.recordset
    };
}

async function getLog(rawDesde, rawHasta) {
    const pool = await getPool();
    const q = () => pool.request();

    let desde = normalizeDate(rawDesde, null);
    let hasta = normalizeDate(rawHasta, null);

    if (!desde || !hasta) {
        const maxR = await q().query(`
            SELECT CONVERT(varchar, MAX(CAST(LOGFEC AS DATE)), 23) AS ultima
            FROM LOG
        `);
        const ultima = maxR.recordset[0]?.ultima
            || new Date().toISOString().slice(0, 10);
        hasta = hasta || ultima;
        const d = new Date(ultima);
        d.setDate(d.getDate() - 30);
        desde = desde || d.toISOString().slice(0, 10);
    }

    const [
        actividadUsuario,
        actividadHora,
        tiposAccion,
        ubicacionesUsadas,
        actividadDia
    ] = await Promise.all([
        q().input('desde', desde).input('hasta', hasta).query(`
            SELECT TOP 20
                ISNULL(NULLIF(RTRIM(LOGUSU), ''), 'Sin usuario') AS usuario,
                COUNT(*) AS acciones
            FROM LOG
            WHERE CAST(LOGFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY RTRIM(LOGUSU)
            ORDER BY acciones DESC
        `),

        q().input('desde', desde).input('hasta', hasta).query(`
            SELECT
                DATEPART(HOUR, LOGHORREA) AS hora,
                COUNT(*) AS acciones
            FROM LOG
            WHERE LOGHORREA IS NOT NULL
              AND CAST(LOGFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY DATEPART(HOUR, LOGHORREA)
            ORDER BY hora
        `),

        q().input('desde', desde).input('hasta', hasta).query(`
            SELECT TOP 20
                ISNULL(NULLIF(RTRIM(LOGACC), ''), 'Sin tipo') AS accion,
                COUNT(*) AS total
            FROM LOG
            WHERE CAST(LOGFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY RTRIM(LOGACC)
            ORDER BY total DESC
        `),

        q().input('desde', desde).input('hasta', hasta).query(`
            SELECT TOP 20
                RTRIM(LOGUBI) AS ubicacion,
                COUNT(*) AS usos
            FROM LOG
            WHERE LOGUBI IS NOT NULL
              AND RTRIM(LOGUBI) <> ''
              AND CAST(LOGFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY RTRIM(LOGUBI)
            ORDER BY usos DESC
        `),

        q().input('desde', desde).input('hasta', hasta).query(`
            SELECT
                CONVERT(varchar, CAST(LOGFEC AS DATE), 23) AS fecha,
                COUNT(*) AS acciones
            FROM LOG
            WHERE LOGFEC IS NOT NULL
              AND CAST(LOGFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY CAST(LOGFEC AS DATE)
            ORDER BY CAST(LOGFEC AS DATE)
        `)
    ]);

    return {
        filtros:                { desde, hasta },
        actividad_por_usuario:  actividadUsuario.recordset,
        actividad_por_hora:     actividadHora.recordset,
        tipos_accion:           tiposAccion.recordset,
        ubicaciones_mas_usadas: ubicacionesUsadas.recordset,
        actividad_por_dia:      actividadDia.recordset
    };
}

async function getStockUbicacion() {
    const pool = await getPool();
    const r = await pool.request().query(`
        SELECT TOP 30
            RTRIM(s.STOUBI)                                    AS ubicacion,
            MAX(ISNULL(RTRIM(u.UBINOM), ''))                   AS descripcion,
            MAX(ISNULL(RTRIM(u.UBIALMCOD), ''))                AS almacen,
            COUNT(DISTINCT s.STOARTCOD)                        AS articulos,
            SUM(CASE WHEN ISNULL(s.STOCAN, 0) > 0 THEN ISNULL(s.STOCAN, 0) ELSE 0 END) AS unidades
        FROM STOCK s
        LEFT JOIN UBICACION u ON u.UBICODUBI = s.STOUBI
        WHERE ISNULL(s.STOCAN, 0) > 0
        GROUP BY RTRIM(s.STOUBI)
        ORDER BY unidades DESC
    `);
    return { stock_por_ubicacion: r.recordset };
}

async function getStats() {
    const pool = await getPool();
    const q = () => pool.request();
    const [art, stock, ubi] = await Promise.all([
        q().query('SELECT COUNT(*) AS total FROM ARTICULO'),
        q().query('SELECT ISNULL(SUM(STOCAN),0) AS total FROM STOCK'),
        q().query('SELECT COUNT(DISTINCT STOUBI) AS total FROM STOCK WHERE STOCAN > 0')
    ]);
    return {
        articulos: art.recordset[0].total,
        stock: stock.recordset[0].total,
        ubicaciones: ubi.recordset[0].total
    };
}

async function getContadores() {
    const pool = await getPool();
    const q = () => pool.request();
    const [art, prov, cli, op, alm, ubi, stock, mov] = await Promise.all([
        q().query('SELECT COUNT(*) AS total FROM ARTICULO'),
        q().query('SELECT COUNT(*) AS total FROM PROVEEDOR'),
        q().query('SELECT COUNT(*) AS total FROM CLIENTE'),
        q().query('SELECT COUNT(*) AS total FROM SGAUSUARIO'),
        q().query('SELECT COUNT(*) AS total FROM ALMACENES'),
        q().query('SELECT COUNT(*) AS total FROM UBICACION'),
        q().query('SELECT COUNT(*) AS total FROM STOCK WHERE STOCAN > 0'),
        q().query('SELECT COUNT(*) AS total FROM ALBARANCS'),
    ]);
    return {
        articulos: art.recordset[0].total,
        proveedores: prov.recordset[0].total,
        clientes: cli.recordset[0].total,
        operarios: op.recordset[0].total,
        almacenes: alm.recordset[0].total,
        ubicaciones: ubi.recordset[0].total,
        stock_activo: stock.recordset[0].total,
        movimientos: mov.recordset[0].total,
    };
}

async function getResumen(dias) {
    const pool = await getPool();
    const q = () => pool.request();
    const desde = daysAgo(dias >= 9999 ? 36500 : dias);
    const hasta = new Date().toISOString().slice(0, 10);

    const [art, ubi, mov, alertas] = await Promise.all([
        q().query(`SELECT COUNT(*) AS total FROM ARTICULO`),
        q().query(`SELECT COUNT(DISTINCT STOUBI) AS total FROM STOCK WHERE STOCAN > 0`),
        q().input('desde', desde).input('hasta', hasta).query(`
            SELECT COUNT(*) AS total FROM ALBARANCS
            WHERE CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
        `),
        q().query(`
            WITH s AS (SELECT STOARTCOD, ISNULL(SUM(STOCAN),0) AS stock FROM STOCK GROUP BY STOARTCOD)
            SELECT COUNT(*) AS total FROM ARTICULO a
            LEFT JOIN s ON s.STOARTCOD = a.ARTCOD
            WHERE ISNULL(a.ARTSTOMIN,0) > 0 AND ISNULL(s.stock,0) <= ISNULL(a.ARTSTOMIN,0)
        `)
    ]);
    return {
        articulos: art.recordset[0].total,
        ubicaciones_activas: ubi.recordset[0].total,
        movimientos_periodo: mov.recordset[0].total,
        alertas_stock: alertas.recordset[0].total
    };
}

async function getMovimientosPorDia(dias) {
    const pool = await getPool();
    const desde = daysAgo(dias >= 9999 ? 36500 : Math.min(dias, 90));
    const hasta = new Date().toISOString().slice(0, 10);
    const r = await pool.request()
        .input('desde', desde).input('hasta', hasta)
        .query(`
            SELECT CONVERT(varchar, CAST(ACSFEC AS DATE), 23) AS fecha, COUNT(*) AS total
            FROM ALBARANCS
            WHERE CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY CAST(ACSFEC AS DATE)
            ORDER BY CAST(ACSFEC AS DATE)
        `);
    return r.recordset;
}

async function getTopArticulos(dias) {
    const pool = await getPool();
    const desde = daysAgo(dias >= 9999 ? 36500 : dias);
    const hasta = new Date().toISOString().slice(0, 10);
    const r = await pool.request()
        .input('desde', desde).input('hasta', hasta)
        .query(`
            SELECT TOP 10
                m.ACSARTCOD AS articulo,
                ISNULL(a.ARTNOM, 'Sin nombre') AS nombre,
                COUNT(*) AS movimientos,
                ISNULL(SUM(ABS(ISNULL(m.ACSCAN,0))),0) AS unidades
            FROM ALBARANCS m
            LEFT JOIN ARTICULO a ON a.ARTCOD = m.ACSARTCOD
            WHERE CAST(m.ACSFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY m.ACSARTCOD, ISNULL(a.ARTNOM,'Sin nombre')
            ORDER BY unidades DESC, movimientos DESC
        `);
    return r.recordset;
}

async function getEntradasVsSalidas(dias) {
    const pool = await getPool();
    const desde = daysAgo(dias >= 9999 ? 36500 : Math.min(dias, 180));
    const hasta = new Date().toISOString().slice(0, 10);
    const r = await pool.request()
        .input('desde', desde).input('hasta', hasta)
        .query(`
            WITH semanas AS (
                SELECT DATEADD(week, -n, DATEADD(day, -(DATEPART(weekday, CAST(@hasta AS DATE))-2+7)%7, CAST(@hasta AS DATE))) AS lunes
                FROM (VALUES(0),(1),(2),(3),(4),(5),(6),(7)) v(n)
            ),
            movs AS (
                SELECT
                    DATEADD(day, -(DATEPART(weekday, CAST(ACSFEC AS DATE))-2+7)%7, CAST(ACSFEC AS DATE)) AS lunes,
                    SUM(CASE WHEN ACSMOV IN ('PP','RG') THEN 1 ELSE 0 END) AS entradas,
                    SUM(CASE WHEN ACSMOV IN ('PC','SA') THEN 1 ELSE 0 END) AS salidas
                FROM ALBARANCS
                WHERE CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
                GROUP BY DATEADD(day, -(DATEPART(weekday, CAST(ACSFEC AS DATE))-2+7)%7, CAST(ACSFEC AS DATE))
            )
            SELECT
                CONVERT(varchar, s.lunes, 23) AS semana,
                ISNULL(m.entradas, 0) AS entradas,
                ISNULL(m.salidas,  0) AS salidas
            FROM semanas s
            LEFT JOIN movs m ON m.lunes = s.lunes
            WHERE s.lunes >= CAST(@desde AS DATE)
            ORDER BY s.lunes
        `);
    return r.recordset;
}

async function getAlertasStock({ buscar = '', severidad = '' } = {}) {
    const pool = await getPool();
    const rows = await pool.request()
        .input('b', `%${buscar}%`)
        .query(`
            WITH stock_art AS (
                SELECT STOARTCOD, ISNULL(SUM(STOCAN), 0) AS stock_actual
                FROM STOCK
                GROUP BY STOARTCOD
            ),
            ubis_art AS (
                SELECT
                    STOARTCOD,
                    STUFF((
                        SELECT ', ' + RTRIM(s2.STOUBI)
                        FROM STOCK s2
                        WHERE s2.STOARTCOD = s.STOARTCOD AND s2.STOCAN > 0
                        ORDER BY s2.STOUBI
                        FOR XML PATH(''), TYPE
                    ).value('.','NVARCHAR(MAX)'), 1, 2, '') AS ubicaciones
                FROM STOCK s
                WHERE s.STOCAN > 0
                GROUP BY STOARTCOD
            )
            SELECT
                m.MINARTCOD                                   AS articulo,
                ISNULL(a.ARTNOM, m.MINARTCOD)                AS nombre,
                m.MINSTOMIN                                   AS stock_minimo,
                m.MINSTOMAX                                   AS stock_maximo,
                ISNULL(st.stock_actual, 0)                   AS stock_actual,
                m.MINSTOMIN - ISNULL(st.stock_actual, 0)     AS deficit,
                ISNULL(u.ubicaciones, '—')                   AS ubicaciones,
                CASE
                    WHEN ISNULL(st.stock_actual, 0) <= 0                 THEN 'critico'
                    WHEN ISNULL(st.stock_actual, 0) < m.MINSTOMIN * 0.5 THEN 'alto'
                    ELSE 'medio'
                END AS severidad
            FROM ARTICULOSTOMIN m
            LEFT JOIN ARTICULO a   ON a.ARTCOD     = m.MINARTCOD
            LEFT JOIN stock_art st ON st.STOARTCOD = m.MINARTCOD
            LEFT JOIN ubis_art u   ON u.STOARTCOD  = m.MINARTCOD
            WHERE m.MINSTOMIN > 0
              AND ISNULL(st.stock_actual, 0) < m.MINSTOMIN
              AND (m.MINARTCOD LIKE @b OR ISNULL(a.ARTNOM,'') LIKE @b)
            ORDER BY
                CASE WHEN ISNULL(st.stock_actual, 0) <= 0                 THEN 0
                     WHEN ISNULL(st.stock_actual, 0) < m.MINSTOMIN * 0.5 THEN 1
                     ELSE 2 END ASC,
                (m.MINSTOMIN - ISNULL(st.stock_actual, 0)) DESC
        `);
    const data = rows.recordset;
    return severidad ? data.filter(r => r.severidad === severidad) : data;
}

async function getTrabajadores(dias) {
    const pool = await getPool();
    const desde = daysAgo(Math.min(dias >= 9999 ? 36500 : dias, 365));
    const hasta = new Date().toISOString().slice(0, 10);
    const r = await pool.request()
        .input('desde', desde).input('hasta', hasta)
        .query(`
            SELECT TOP 20
                ISNULL(NULLIF(RTRIM(ACSREPCOD),''), 'Sin operario') AS terminal,
                ISNULL(NULLIF(RTRIM(ACSREPCOD),''), 'Sin operario') AS nombre,
                COUNT(*) AS movimientos,
                ISNULL(SUM(ABS(ISNULL(ACSCAN,0))),0) AS unidades,
                ISNULL(SUM(CASE WHEN ACSMOV IN ('PP','RG') THEN 1 ELSE 0 END),0) AS entradas,
                ISNULL(SUM(CASE WHEN ACSMOV IN ('PC','SA') THEN 1 ELSE 0 END),0) AS salidas,
                ISNULL(SUM(CASE WHEN ACSMOV NOT IN ('PP','RG','PC','SA') THEN 1 ELSE 0 END),0) AS traspasos,
                CONVERT(varchar, MAX(CAST(ACSFEC AS DATE)), 23) AS ultima_actividad
            FROM ALBARANCS
            WHERE CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
              AND ACSREPCOD IS NOT NULL AND RTRIM(ACSREPCOD) <> ''
            GROUP BY RTRIM(ACSREPCOD)
            ORDER BY movimientos DESC
        `);
    return r.recordset;
}

async function getAlmacen(dias) {
    const pool = await getPool();
    const q = () => pool.request();
    const desde = daysAgo(Math.min(dias >= 9999 ? 36500 : dias, 30));
    const hasta = new Date().toISOString().slice(0, 10);

    const [porAlmacen, ocupacion, masActivas] = await Promise.all([
        q().query(`
            SELECT
                ISNULL(u.UBIALMCOD,'Sin almacén') AS almacen,
                ISNULL(al.ALMNOM,'Sin nombre') AS nombre_almacen,
                ISNULL(SUM(CASE WHEN s.STOCAN > 0 THEN s.STOCAN ELSE 0 END),0) AS stock_total,
                COUNT(DISTINCT s.STOARTCOD) AS articulos,
                COUNT(DISTINCT s.STOUBI) AS ubicaciones
            FROM STOCK s
            LEFT JOIN UBICACION u ON u.UBICODUBI = s.STOUBI
            LEFT JOIN ALMACENES al ON al.ALMCOD = u.UBIALMCOD
            WHERE s.STOCAN > 0
            GROUP BY ISNULL(u.UBIALMCOD,'Sin almacén'), ISNULL(al.ALMNOM,'Sin nombre')
            ORDER BY stock_total DESC
        `),
        q().query(`
            SELECT
                COUNT(*) AS total_ubicaciones,
                SUM(CASE WHEN ubi.STOCAN > 0 THEN 1 ELSE 0 END) AS ocupadas,
                SUM(CASE WHEN ISNULL(ubi.STOCAN,0) <= 0 THEN 1 ELSE 0 END) AS vacias
            FROM UBICACION u
            LEFT JOIN (
                SELECT STOUBI, SUM(STOCAN) AS STOCAN FROM STOCK GROUP BY STOUBI
            ) ubi ON ubi.STOUBI = u.UBICODUBI
        `),
        q().input('desde', desde).input('hasta', hasta).query(`
            SELECT TOP 10
                ISNULL(ACSUBI,'Sin ubicación') AS ubicacion,
                COUNT(*) AS movimientos
            FROM ALBARANCS
            WHERE ACSUBI IS NOT NULL AND RTRIM(ACSUBI) <> ''
              AND CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY ACSUBI
            ORDER BY movimientos DESC
        `)
    ]);

    return {
        por_almacen: porAlmacen.recordset,
        ocupacion: ocupacion.recordset[0] || { total_ubicaciones: 0, ocupadas: 0, vacias: 0 },
        mas_activas: masActivas.recordset
    };
}

async function getPorTipo(dias) {
    const pool = await getPool();
    const q = () => pool.request();
    const desde = daysAgo(dias >= 9999 ? 36500 : dias);
    const hasta = new Date().toISOString().slice(0, 10);

    const [porTipo, porDiaSemana, ultimos] = await Promise.all([
        q().input('desde', desde).input('hasta', hasta).query(`
            SELECT
                ISNULL(NULLIF(ACSMOV,''),'Sin tipo') AS tipo,
                COUNT(*) AS total,
                ISNULL(SUM(ABS(ISNULL(ACSCAN,0))),0) AS unidades
            FROM ALBARANCS
            WHERE CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY ISNULL(NULLIF(ACSMOV,''),'Sin tipo')
            ORDER BY total DESC
        `),
        q().input('desde', desde).input('hasta', hasta).query(`
            SELECT
                DATEPART(weekday, CAST(ACSFEC AS DATE)) AS dia_num,
                DATENAME(weekday, CAST(ACSFEC AS DATE)) AS dia_nombre,
                COUNT(*) AS total
            FROM ALBARANCS
            WHERE CAST(ACSFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY DATEPART(weekday, CAST(ACSFEC AS DATE)), DATENAME(weekday, CAST(ACSFEC AS DATE))
            ORDER BY dia_num
        `),
        q().query(`
            SELECT TOP 20
                CONVERT(varchar, al.ACSFEC, 23) AS fecha,
                CONVERT(varchar, al.ACSHOR, 8) AS hora,
                ISNULL(al.ACSMOV,'') AS tipo,
                ISNULL(al.ACSARTCOD,'') AS articulo,
                ISNULL(art.ARTNOM,'') AS nombre_articulo,
                ISNULL(al.ACSUBI,'') AS ubicacion,
                ISNULL(al.ACSCAN,0) AS cantidad,
                ISNULL(al.ACSCLICOD,'') AS tercero
            FROM ALBARANCS al
            LEFT JOIN ARTICULO art ON art.ARTCOD = al.ACSARTCOD
            ORDER BY al.ACSFEC DESC, al.ACSHOR DESC
        `)
    ]);

    return {
        por_tipo: porTipo.recordset,
        por_dia_semana: porDiaSemana.recordset,
        ultimos: ultimos.recordset
    };
}

async function getProveedoresActividad(dias) {
    const pool = await getPool();
    const desde = daysAgo(dias >= 9999 ? 36500 : dias);
    const hasta = new Date().toISOString().slice(0, 10);
    const r = await pool.request()
        .input('desde', desde).input('hasta', hasta)
        .query(`
            SELECT TOP 15
                ISNULL(NULLIF(RTRIM(m.ACSCLICOD),''),'Sin código') AS codigo,
                ISNULL(NULLIF(RTRIM(m.ACSCLINOM),''),'Sin nombre') AS nombre,
                COUNT(*) AS movimientos,
                ISNULL(SUM(ABS(ISNULL(m.ACSCAN,0))),0) AS unidades,
                COUNT(DISTINCT m.ACSARTCOD) AS articulos_distintos,
                CONVERT(varchar, MAX(CAST(m.ACSFEC AS DATE)), 23) AS ultima_entrada
            FROM ALBARANCS m
            WHERE m.ACSMOV IN ('PP','RG')
              AND m.ACSCLICOD IS NOT NULL AND RTRIM(m.ACSCLICOD) <> ''
              AND CAST(m.ACSFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY RTRIM(m.ACSCLICOD), RTRIM(m.ACSCLINOM)
            ORDER BY movimientos DESC
        `);
    return r.recordset;
}

async function getArticulosAnalisis(dias) {
    const pool = await getPool();
    const q = () => pool.request();
    const desde = daysAgo(dias >= 9999 ? 36500 : dias);
    const hasta = new Date().toISOString().slice(0, 10);

    const [rotacion, porFamilia, sinMovimiento] = await Promise.all([
        pool.request().input('desde', desde).input('hasta', hasta).query(`
            SELECT TOP 15
                m.ACSARTCOD AS articulo,
                ISNULL(a.ARTNOM,'Sin nombre') AS nombre,
                ISNULL(SUM(ABS(ISNULL(m.ACSCAN,0))),0) AS unidades_movidas
            FROM ALBARANCS m
            LEFT JOIN ARTICULO a ON a.ARTCOD = m.ACSARTCOD
            WHERE CAST(m.ACSFEC AS DATE) BETWEEN @desde AND @hasta
            GROUP BY m.ACSARTCOD, ISNULL(a.ARTNOM,'Sin nombre')
            ORDER BY unidades_movidas DESC
        `),
        pool.request().query(`
            SELECT TOP 12
                ISNULL(NULLIF(RTRIM(a.ARTGRUCOD),''),'Sin grupo') AS familia,
                ISNULL(SUM(CASE WHEN s.STOCAN > 0 THEN s.STOCAN ELSE 0 END),0) AS stock_total,
                COUNT(DISTINCT a.ARTCOD) AS articulos
            FROM ARTICULO a
            LEFT JOIN STOCK s ON s.STOARTCOD = a.ARTCOD
            GROUP BY ISNULL(NULLIF(RTRIM(a.ARTGRUCOD),''),'Sin grupo')
            ORDER BY stock_total DESC
        `),
        pool.request().input('desde', desde).input('hasta', hasta).query(`
            SELECT TOP 20
                s.STOARTCOD AS articulo,
                ISNULL(a.ARTNOM,'') AS nombre,
                ISNULL(SUM(CASE WHEN s.STOCAN > 0 THEN s.STOCAN ELSE 0 END),0) AS stock,
                CONVERT(varchar, MAX(ult.ACSFEC), 23) AS ultimo_mov
            FROM STOCK s
            LEFT JOIN ARTICULO a ON a.ARTCOD = s.STOARTCOD
            LEFT JOIN (
                SELECT ACSARTCOD, MAX(ACSFEC) AS ACSFEC
                FROM ALBARANCS
                GROUP BY ACSARTCOD
            ) ult ON ult.ACSARTCOD = s.STOARTCOD
            WHERE s.STOCAN > 0
              AND (ult.ACSFEC IS NULL OR CAST(ult.ACSFEC AS DATE) < @desde)
            GROUP BY s.STOARTCOD, ISNULL(a.ARTNOM,'')
            ORDER BY stock DESC
        `)
    ]);

    return {
        rotacion: rotacion.recordset,
        por_familia: porFamilia.recordset,
        sin_movimiento: sinMovimiento.recordset
    };
}

module.exports = {
    getDashboard, getAlertas, getLog, getStockUbicacion, getStats, getContadores,
    getResumen, getMovimientosPorDia, getTopArticulos, getEntradasVsSalidas,
    getAlertasStock, getTrabajadores, getAlmacen, getPorTipo,
    getProveedoresActividad, getArticulosAnalisis,
    normalizeDate, daysAgo
};
