"use strict";

const { Router } = require('express');
const { getPool } = require('../db');
const { serverError } = require('../middleware/error');

const router = Router();
const q = (pool) => pool.request();

// ─── /estadisticas/dashboard ─────────────────────────────────────────────────
// Devuelve KPIs + actividad reciente + gráficos para el panel de control

router.get('/estadisticas/dashboard', async (req, res) => {
    try {
        const pool = await getPool();
        const { desde = '2000-01-01', hasta = new Date().toISOString().slice(0, 10) } = req.query;

        const [kpisR, actividadR, movDiaR, stockAlmR, topArtR] = await Promise.all([

            // KPIs generales
            q(pool).query(`
                SELECT
                    (SELECT COUNT(*) FROM ARTICULO)                                        AS articulos,
                    (SELECT COUNT(*) FROM STOCK WHERE STOCAN > 0)                          AS lineas_stock,
                    (SELECT ISNULL(SUM(STOCAN), 0) FROM STOCK WHERE STOCAN > 0)            AS unidades_stock,
                    (SELECT COUNT(*) FROM UBICACION)                                       AS ubicaciones,
                    (SELECT COUNT(DISTINCT STOUBI) FROM STOCK WHERE STOCAN > 0)            AS ubicaciones_ocupadas,
                    (SELECT COUNT(*) FROM ALBARANCS
                        WHERE CONVERT(date, ACSFEC) BETWEEN '${desde}' AND '${hasta}')    AS movimientos_periodo,
                    (SELECT ISNULL(SUM(ABS(ACSCAN)), 0) FROM ALBARANCS
                        WHERE CONVERT(date, ACSFEC) BETWEEN '${desde}' AND '${hasta}')    AS unidades_movidas_periodo,
                    (SELECT COUNT(*) FROM ARTICULO a
                        WHERE NOT EXISTS (
                            SELECT 1 FROM ALBARANCS
                            WHERE ACSARTCOD = a.ARTCOD
                            AND CONVERT(date, ACSFEC) >= DATEADD(day, -90, GETDATE())
                        ) AND EXISTS (
                            SELECT 1 FROM STOCK WHERE STOARTCOD = a.ARTCOD AND STOCAN > 0
                        ))                                                                  AS sin_movimiento_90_dias,
                    (SELECT COUNT(DISTINCT s.STOARTCOD) FROM STOCK s
                        JOIN ARTICULO a ON a.ARTCOD = s.STOARTCOD
                        WHERE s.STOCAN <= a.ARTSTOMIN AND a.ARTSTOMIN > 0)                 AS stock_bajo
            `),

            // Actividad reciente (últimos 20 movimientos)
            q(pool).query(`
                SELECT TOP 20
                    CONVERT(varchar(10), ACSFEC, 23)        AS fecha,
                    CONVERT(varchar(8),  ACSHOR, 108)       AS hora,
                    s.ACSMOV                                AS tipo,
                    s.ACSARTCOD                             AS articulo,
                    a.ARTNOM                                AS nombre,
                    s.ACSCAN                                AS cantidad
                FROM ALBARANCS s
                LEFT JOIN ARTICULO a ON a.ARTCOD = s.ACSARTCOD
                ORDER BY s.ACSFEC DESC, s.ACSHOR DESC
            `),

            // Movimientos por día en el periodo
            q(pool).input('desde2', desde).input('hasta2', hasta).query(`
                SELECT
                    CONVERT(varchar(10), ACSFEC, 23) AS fecha,
                    COUNT(*)                         AS movimientos
                FROM ALBARANCS
                WHERE CONVERT(date, ACSFEC) BETWEEN @desde2 AND @hasta2
                GROUP BY CONVERT(varchar(10), ACSFEC, 23)
                ORDER BY fecha
            `),

            // Stock por almacén
            q(pool).query(`
                SELECT
                    ISNULL(alm.ALMNOM, s.STOUBI)            AS nombre_almacen,
                    ISNULL(SUM(s.STOCAN), 0)                AS unidades
                FROM STOCK s
                LEFT JOIN UBICACION u  ON u.UBICODUBI = s.STOUBI
                LEFT JOIN ALMACENES alm ON alm.ALMCOD = u.UBIALMCOD
                WHERE s.STOCAN > 0
                GROUP BY ISNULL(alm.ALMNOM, s.STOUBI)
                ORDER BY unidades DESC
            `),

            // Top 10 artículos más movidos en el periodo
            q(pool).input('desde3', desde).input('hasta3', hasta).query(`
                SELECT TOP 10
                    s.ACSARTCOD             AS articulo,
                    a.ARTNOM                AS nombre,
                    SUM(ABS(s.ACSCAN))      AS unidades
                FROM ALBARANCS s
                LEFT JOIN ARTICULO a ON a.ARTCOD = s.ACSARTCOD
                WHERE CONVERT(date, s.ACSFEC) BETWEEN @desde3 AND @hasta3
                GROUP BY s.ACSARTCOD, a.ARTNOM
                ORDER BY unidades DESC
            `)
        ]);

        const kpis = kpisR.recordset[0] || {};
        kpis.ocupacion_porcentaje = kpis.ubicaciones > 0
            ? (kpis.ubicaciones_ocupadas / kpis.ubicaciones) * 100
            : 0;

        res.json({
            kpis,
            movimientos_recientes: actividadR.recordset,
            graficos: {
                movimientos_por_dia:  movDiaR.recordset,
                stock_por_almacen:    stockAlmR.recordset,
                top_articulos:        topArtR.recordset
            }
        });
    } catch (err) { serverError(res, err); }
});

// ─── /estadisticas/alertas ────────────────────────────────────────────────────
// Artículos con stock por debajo del mínimo y stock negativo

router.get('/estadisticas/alertas', async (req, res) => {
    try {
        const pool = await getPool();

        const [bajosR, negativosR] = await Promise.all([

            // Stock bajo mínimo
            q(pool).query(`
                SELECT TOP 50
                    s.STOARTCOD             AS articulo,
                    a.ARTNOM                AS nombre,
                    SUM(s.STOCAN)           AS stock_actual,
                    a.ARTSTOMIN             AS stock_minimo
                FROM STOCK s
                JOIN ARTICULO a ON a.ARTCOD = s.STOARTCOD
                WHERE a.ARTSTOMIN > 0
                GROUP BY s.STOARTCOD, a.ARTNOM, a.ARTSTOMIN
                HAVING SUM(s.STOCAN) <= a.ARTSTOMIN
                ORDER BY SUM(s.STOCAN) ASC
            `),

            // Stock negativo
            q(pool).query(`
                SELECT
                    s.STOARTCOD             AS articulo,
                    a.ARTNOM                AS nombre,
                    SUM(s.STOCAN)           AS stock_actual,
                    s.STOUBI                AS ubicacion
                FROM STOCK s
                LEFT JOIN ARTICULO a ON a.ARTCOD = s.STOARTCOD
                WHERE s.STOCAN < 0
                GROUP BY s.STOARTCOD, a.ARTNOM, s.STOUBI
                ORDER BY SUM(s.STOCAN) ASC
            `)
        ]);

        res.json({
            stock_bajo:     bajosR.recordset,
            stock_negativo: negativosR.recordset
        });
    } catch (err) { serverError(res, err); }
});

module.exports = router;
