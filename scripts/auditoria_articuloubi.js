"use strict";

// FASE 9.1 — Auditoría ARTICULOUBI + pr_insertarUbicacion
// Solo lectura. No modifica nada.

const { getPool } = require('../backend/db');

async function q(pool, sql, label) {
    try {
        return (await pool.request().query(sql)).recordset;
    } catch (e) {
        return [{ _error: e.message, _label: label }];
    }
}

async function run() {
    const pool = await getPool();
    const out = {};

    // ── PASO 1: Estructura ARTICULOUBI ────────────────────────────────────────
    out.articuloubi_columnas = await q(pool, `
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'ARTICULOUBI'
        ORDER BY ORDINAL_POSITION
    `, 'articuloubi_columnas');

    out.articuloubi_count = await q(pool, `
        SELECT COUNT(*) AS total FROM ARTICULOUBI
    `, 'articuloubi_count');

    out.articuloubi_indices = await q(pool, `
        SELECT
            i.name AS indice,
            i.type_desc,
            i.is_unique,
            i.is_primary_key,
            STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columnas
        FROM sys.indexes i
        JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE i.object_id = OBJECT_ID('ARTICULOUBI') AND i.name IS NOT NULL
        GROUP BY i.name, i.type_desc, i.is_unique, i.is_primary_key
        ORDER BY i.is_primary_key DESC, i.name
    `, 'articuloubi_indices');

    // ── PASO 2: Muestra real ──────────────────────────────────────────────────
    out.articuloubi_muestra = await q(pool, `
        SELECT TOP 50 * FROM ARTICULOUBI ORDER BY (SELECT NULL)
    `, 'articuloubi_muestra');

    // ¿Artículos con múltiples ubicaciones?
    out.articuloubi_multi_ubi = await q(pool, `
        SELECT TOP 10
            RTRIM(AUIARTCOD) AS articulo,
            COUNT(*) AS ubicaciones_asignadas,
            MIN(RTRIM(AUIUBI)) AS ubi_min,
            MAX(RTRIM(AUIUBI)) AS ubi_max
        FROM ARTICULOUBI
        GROUP BY RTRIM(AUIARTCOD)
        HAVING COUNT(*) > 1
        ORDER BY ubicaciones_asignadas DESC
    `, 'articuloubi_multi_ubi');

    // Valores distintos de flags/campos numéricos
    out.articuloubi_flags_distintos = await q(pool, `
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'ARTICULOUBI'
          AND DATA_TYPE IN ('int','float','bit','smallint','tinyint','numeric','decimal')
        ORDER BY ORDINAL_POSITION
    `, 'articuloubi_flags_distintos');

    // Prefijos de ubicación en ARTICULOUBI
    out.articuloubi_prefijos_ubi = await q(pool, `
        SELECT
            LEFT(RTRIM(AUIUBI), 3) AS prefijo,
            COUNT(*) AS filas,
            COUNT(DISTINCT RTRIM(AUIARTCOD)) AS articulos
        FROM ARTICULOUBI
        GROUP BY LEFT(RTRIM(AUIUBI), 3)
        ORDER BY filas DESC
    `, 'articuloubi_prefijos_ubi');

    // ── PASO 3: SPs que tocan ARTICULOUBI ────────────────────────────────────
    out.sps_articuloubi = await q(pool, `
        SELECT ROUTINE_NAME, ROUTINE_TYPE, LAST_ALTERED
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_TYPE = 'PROCEDURE'
          AND UPPER(ROUTINE_DEFINITION) LIKE '%ARTICULOUBI%'
        ORDER BY ROUTINE_NAME
    `, 'sps_articuloubi');

    // ── PASO 4: pr_insertarUbicacion — definición completa ───────────────────
    const ins = await q(pool, `
        SELECT definition FROM sys.sql_modules
        WHERE object_id = OBJECT_ID('pr_insertarUbicacion')
    `, 'insertarUbicacion_def');
    out.insertarUbicacion_def = ins[0]?.definition || 'NO EXISTE';

    // ── PASO 5: Otros SPs relacionados — extractos ARTICULOUBI ───────────────
    // pr_asignarUbicacionLendan2 — usa ARTICULOUBI?
    const asignar = await q(pool, `
        SELECT definition FROM sys.sql_modules
        WHERE object_id = OBJECT_ID('pr_asignarUbicacionLendan2')
    `, 'asignarUbi_def');
    const asignarDef = asignar[0]?.definition || '';
    out.asignarUbicacion_articuloubi_lines = asignarDef
        .split(/\r?\n/)
        .map((l, i) => ({ n: i + 1, t: l.trim() }))
        .filter(l => /ARTICULOUBI|AUIARTCOD|AUIUBI/i.test(l.t) && l.t.length > 2);

    // pr_calcularStock — usa ARTICULOUBI?
    const calc = await q(pool, `
        SELECT definition FROM sys.sql_modules
        WHERE object_id = OBJECT_ID('pr_calcularStock')
    `, 'calcularStock_def');
    const calcDef = calc[0]?.definition || '';
    out.calcularStock_articuloubi_lines = calcDef
        .split(/\r?\n/)
        .map((l, i) => ({ n: i + 1, t: l.trim() }))
        .filter(l => /ARTICULOUBI/i.test(l.t) && l.t.length > 2);

    // pr_grabar_030524 — contexto completo del EXEC pr_insertarUbicacion
    const grabar = await q(pool, `
        SELECT definition FROM sys.sql_modules
        WHERE object_id = OBJECT_ID('pr_grabar_030524')
    `, 'grabar_def');
    const grabarDef = grabar[0]?.definition || '';
    const grabarLines = grabarDef.split(/\r?\n/);
    const insertUbiLines = [];
    grabarLines.forEach((l, i) => {
        if (/insertarUbicacion|ARTICULOUBI/i.test(l)) {
            const start = Math.max(0, i - 4);
            const end = Math.min(grabarLines.length - 1, i + 4);
            insertUbiLines.push({
                linea_central: i + 1,
                contexto: grabarLines.slice(start, end + 1).map((t, j) => ({
                    n: start + j + 1, t: t.trim()
                }))
            });
        }
    });
    out.grabar_030524_insertarUbicacion_ctx = insertUbiLines;

    // ── PASO 6: Cruce ARTICULOUBI con STOCK y STOCKLOTE ──────────────────────
    // ¿Artículos en STOCK que NO están en ARTICULOUBI?
    out.stock_sin_articuloubi = await q(pool, `
        SELECT COUNT(DISTINCT RTRIM(STOARTCOD)) AS articulos_sin_articuloubi
        FROM STOCK s
        WHERE NOT EXISTS (
            SELECT 1 FROM ARTICULOUBI a
            WHERE RTRIM(a.AUIARTCOD) = RTRIM(s.STOARTCOD)
        )
    `, 'stock_sin_articuloubi');

    // ¿Artículos en STOCKLOTE que NO están en ARTICULOUBI?
    out.stocklote_sin_articuloubi = await q(pool, `
        SELECT COUNT(DISTINCT RTRIM(STOARTCOD)) AS articulos_sin_articuloubi
        FROM STOCKLOTE sl
        WHERE NOT EXISTS (
            SELECT 1 FROM ARTICULOUBI a
            WHERE RTRIM(a.AUIARTCOD) = RTRIM(sl.STOARTCOD)
        )
    `, 'stocklote_sin_articuloubi');

    // ¿Cruce: artículo 0000098 en ARTICULOUBI?
    out.articuloubi_ejemplo_0000098 = await q(pool, `
        SELECT * FROM ARTICULOUBI WHERE RTRIM(AUIARTCOD) = '0000098'
    `, 'articuloubi_ejemplo_0000098');

    // ── PASO 7: Reposición — ¿usa ARTICULOUBI? ───────────────────────────────
    const repos = await q(pool, `
        SELECT definition FROM sys.sql_modules
        WHERE object_id = OBJECT_ID('pr_grabarReposicion2')
    `, 'reposicion_def');
    const reposDef = repos[0]?.definition || '';
    out.reposicion_articuloubi_lines = reposDef
        .split(/\r?\n/)
        .map((l, i) => ({ n: i + 1, t: l.trim() }))
        .filter(l => /ARTICULOUBI|AUIARTCOD/i.test(l.t) && l.t.length > 2);

    // fn_avanzarArticulo1 — ¿usa ARTICULOUBI?
    const fn1 = await q(pool, `
        SELECT definition FROM sys.sql_modules
        WHERE object_id = OBJECT_ID('fn_avanzarArticulo1')
    `, 'fn_avanzar_def');
    const fn1Def = fn1[0]?.definition || '';
    out.fn_avanzar_articuloubi_lines = fn1Def
        .split(/\r?\n/)
        .map((l, i) => ({ n: i + 1, t: l.trim() }))
        .filter(l => /ARTICULOUBI/i.test(l.t) && l.t.length > 2);

    // ── PASO 8: ARTICULOSTOMIN — ¿relacionada? ────────────────────────────────
    out.articulostomin_columnas = await q(pool, `
        SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'ARTICULOSTOMIN'
        ORDER BY ORDINAL_POSITION
    `, 'articulostomin_cols');
    out.articulostomin_muestra = await q(pool, `
        SELECT TOP 5 * FROM ARTICULOSTOMIN
    `, 'articulostomin_muestra');

    await pool.close();
    console.log(JSON.stringify(out, null, 2));
}

run().catch(e => { console.error(e.message); process.exit(1); });
