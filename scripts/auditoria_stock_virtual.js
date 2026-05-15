"use strict";

// Auditoría FASE 8.2 — Stock Virtual LIN
// Solo lectura. No modifica nada.

const { sql, getPool } = require('../backend/db');

async function q(pool, query) {
    return (await pool.request().query(query)).recordset;
}

async function run() {
    const pool = await getPool();
    const out = {};

    // ── PASO 1: Mapa global de prefijos ──────────────────────────────────────
    out.paso1_prefijos = await q(pool, `
        SELECT
            LEFT(RTRIM(STOUBI),3) AS prefijo,
            COUNT(*) AS filas,
            COUNT(DISTINCT RTRIM(STOARTCOD)) AS articulos,
            SUM(STOCAN) AS stock_total,
            MIN(STOCAN) AS stock_min,
            MAX(STOCAN) AS stock_max
        FROM STOCK
        GROUP BY LEFT(RTRIM(STOUBI),3)
        ORDER BY filas DESC
    `);

    // ── PASO 2: Detalle 789* y 799* ──────────────────────────────────────────
    out.paso2_789_799_detalle = await q(pool, `
        SELECT
            RTRIM(STOUBI) AS ubicacion,
            COUNT(*) AS filas,
            COUNT(DISTINCT RTRIM(STOARTCOD)) AS articulos,
            COUNT(DISTINCT RTRIM(STOLOT)) AS lotes_distintos,
            SUM(STOCAN) AS stock_total,
            MIN(STOCAN) AS stock_min,
            MAX(STOCAN) AS stock_max
        FROM STOCK
        WHERE STOUBI LIKE '789%' OR STOUBI LIKE '799%'
        GROUP BY RTRIM(STOUBI)
        ORDER BY stock_total DESC
    `);

    // Lotes usados en 789*/799*
    out.paso2_789_799_lotes = await q(pool, `
        SELECT DISTINCT
            RTRIM(STOUBI) AS ubicacion,
            RTRIM(STOLOT) AS lote,
            COUNT(*) AS filas,
            SUM(STOCAN) AS stock_total
        FROM STOCK
        WHERE STOUBI LIKE '789%' OR STOUBI LIKE '799%'
        GROUP BY RTRIM(STOUBI), RTRIM(STOLOT)
        ORDER BY RTRIM(STOUBI), stock_total DESC
    `);

    // ── PASO 3: Lote 999999 ───────────────────────────────────────────────────
    out.paso3_lote_999999_por_prefijo = await q(pool, `
        SELECT
            LEFT(RTRIM(STOUBI),3) AS prefijo,
            COUNT(*) AS filas,
            COUNT(DISTINCT RTRIM(STOARTCOD)) AS articulos,
            SUM(STOCAN) AS stock_total
        FROM STOCK
        WHERE RTRIM(STOLOT) = '999999'
        GROUP BY LEFT(RTRIM(STOUBI),3)
        ORDER BY filas DESC
    `);

    // ¿Aparece 999999 en ubicaciones físicas?
    out.paso3_999999_en_fisico = await q(pool, `
        SELECT TOP 10
            RTRIM(STOUBI) AS ubicacion,
            RTRIM(STOARTCOD) AS articulo,
            RTRIM(STOLOT) AS lote,
            STOCAN AS stock
        FROM STOCK
        WHERE RTRIM(STOLOT) = '999999'
          AND STOUBI NOT LIKE '789%'
          AND STOUBI NOT LIKE '799%'
        ORDER BY STOCAN DESC
    `);

    // ── PASO 4: Comparación físico vs virtual para 10 artículos ─────────────
    // Artículos con presencia en ambas zonas
    out.paso4_art_con_ambas_zonas = await q(pool, `
        SELECT TOP 10
            RTRIM(a.STOARTCOD) AS articulo,
            SUM(CASE WHEN a.STOUBI NOT LIKE '789%' AND a.STOUBI NOT LIKE '799%'
                     THEN a.STOCAN ELSE 0 END) AS stock_fisico,
            SUM(CASE WHEN a.STOUBI LIKE '789%' OR a.STOUBI LIKE '799%'
                     THEN a.STOCAN ELSE 0 END) AS stock_virtual,
            SUM(a.STOCAN) AS stock_total,
            COUNT(DISTINCT RTRIM(a.STOUBI)) AS ubicaciones
        FROM STOCK a
        WHERE EXISTS (
            SELECT 1 FROM STOCK b
            WHERE RTRIM(b.STOARTCOD) = RTRIM(a.STOARTCOD)
              AND (b.STOUBI LIKE '789%' OR b.STOUBI LIKE '799%')
        )
        GROUP BY RTRIM(a.STOARTCOD)
        HAVING SUM(CASE WHEN a.STOUBI NOT LIKE '789%' AND a.STOUBI NOT LIKE '799%'
                        THEN a.STOCAN ELSE 0 END) > 0
        ORDER BY stock_virtual DESC
    `);

    // Suma global físico vs virtual
    out.paso4_suma_global = await q(pool, `
        SELECT
            SUM(CASE WHEN STOUBI NOT LIKE '789%' AND STOUBI NOT LIKE '799%'
                     THEN STOCAN ELSE 0 END) AS stock_fisico_total,
            SUM(CASE WHEN STOUBI LIKE '789%' OR STOUBI LIKE '799%'
                     THEN STOCAN ELSE 0 END) AS stock_virtual_total,
            SUM(STOCAN) AS stock_global,
            COUNT(*) AS filas_total,
            SUM(CASE WHEN STOUBI LIKE '789%' OR STOUBI LIKE '799%'
                     THEN 1 ELSE 0 END) AS filas_virtuales
        FROM STOCK
    `);

    // ── PASO 5: STOCKLOTE estructura ─────────────────────────────────────────
    out.paso5_stocklote_columnas = await q(pool, `
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'STOCKLOTE'
        ORDER BY ORDINAL_POSITION
    `);

    out.paso5_stocklote_count = await q(pool, `SELECT COUNT(*) AS total FROM STOCKLOTE`);

    out.paso5_stocklote_muestra = await q(pool, `SELECT TOP 5 * FROM STOCKLOTE`);

    // ¿STOCKLOTE tiene 789*/799*?
    out.paso5_stocklote_virtual = await q(pool, `
        SELECT COUNT(*) AS filas_virtuales
        FROM STOCKLOTE
        WHERE STLUBI LIKE '789%' OR STLUBI LIKE '799%'
    `).catch(() => [{ filas_virtuales: 'columna STLUBI no existe' }]);

    // Columna UBI en STOCKLOTE (nombre real)
    out.paso5_stocklote_col_ubi = await q(pool, `
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'STOCKLOTE' AND COLUMN_NAME LIKE '%UBI%'
    `);

    // ── PASO extra: UBICACION tabla completa ─────────────────────────────────
    out.extra_ubicacion_prefijos = await q(pool, `
        SELECT
            LEFT(RTRIM(UBICODUBI),3) AS prefijo,
            COUNT(*) AS filas,
            SUM(CASE WHEN RTRIM(UBINOM) = '' OR UBINOM IS NULL THEN 1 ELSE 0 END) AS sin_nombre,
            SUM(CASE WHEN RTRIM(UBIALMCOD) = '' OR UBIALMCOD IS NULL THEN 1 ELSE 0 END) AS sin_almacen
        FROM UBICACION
        GROUP BY LEFT(RTRIM(UBICODUBI),3)
        ORDER BY filas DESC
    `);

    // 789/799 en tabla UBICACION
    out.extra_ubicacion_789_799 = await q(pool, `
        SELECT
            RTRIM(UBICODUBI) AS ubicacion,
            RTRIM(UBINOM) AS nombre,
            RTRIM(UBIALMCOD) AS almacen,
            UBILIB AS libre,
            UBIMUL AS multiple,
            UBINUMPAL AS palets
        FROM UBICACION
        WHERE UBICODUBI LIKE '789%' OR UBICODUBI LIKE '799%'
        ORDER BY UBICODUBI
    `);

    await pool.close();
    console.log(JSON.stringify(out, null, 2));
}

run().catch(e => { console.error(e.message); process.exit(1); });
