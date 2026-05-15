"use strict";

// FASE 9.0 — Arqueología escritor STOCK + SLOG3
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

    // ── PASO 1: SLOG3 — muestra reciente ─────────────────────────────────────
    out.slog3_reciente = await q(pool, `
        SELECT TOP 50
            LOGFEC, LOGHOR, LOGUSU, LOGNUM, LOGTEX
        FROM SLOG3
        ORDER BY LOGFEC DESC, LOGHOR DESC
    `, 'slog3_reciente');

    // SLOG3 — textos que mencionan STOCK
    out.slog3_menciona_stock = await q(pool, `
        SELECT TOP 30
            LOGFEC, LOGHOR, LOGUSU, LOGNUM, LOGTEX
        FROM SLOG3
        WHERE UPPER(CAST(LOGTEX AS NVARCHAR(MAX))) LIKE '%STOCK%'
        ORDER BY LOGFEC DESC, LOGHOR DESC
    `, 'slog3_menciona_stock');

    // SLOG3 — textos que mencionan ALBARANCS o ACS
    out.slog3_menciona_albarancs = await q(pool, `
        SELECT TOP 20
            LOGFEC, LOGHOR, LOGUSU, LOGNUM, LOGTEX
        FROM SLOG3
        WHERE UPPER(CAST(LOGTEX AS NVARCHAR(MAX))) LIKE '%ALBARANCS%'
           OR UPPER(CAST(LOGTEX AS NVARCHAR(MAX))) LIKE '%ACSMOV%'
           OR UPPER(CAST(LOGTEX AS NVARCHAR(MAX))) LIKE '%ACSNUM%'
        ORDER BY LOGFEC DESC, LOGHOR DESC
    `, 'slog3_menciona_albarancs');

    // SLOG3 — textos que mencionan pr_ (llamadas a SPs)
    out.slog3_menciona_pr = await q(pool, `
        SELECT TOP 20
            LOGFEC, LOGHOR, LOGUSU, LOGNUM, LOGTEX
        FROM SLOG3
        WHERE UPPER(CAST(LOGTEX AS NVARCHAR(MAX))) LIKE '%PR_%'
           OR UPPER(CAST(LOGTEX AS NVARCHAR(MAX))) LIKE '%PICKING%'
           OR UPPER(CAST(LOGTEX AS NVARCHAR(MAX))) LIKE '%COMPRA%'
           OR UPPER(CAST(LOGTEX AS NVARCHAR(MAX))) LIKE '%REGULA%'
        ORDER BY LOGFEC DESC, LOGHOR DESC
    `, 'slog3_menciona_pr');

    // SLOG3 — rango de fechas y usuarios únicos
    out.slog3_meta = await q(pool, `
        SELECT
            MIN(LOGFEC) AS fecha_min,
            MAX(LOGFEC) AS fecha_max,
            COUNT(*) AS total_filas,
            COUNT(DISTINCT LOGUSU) AS usuarios_distintos
        FROM SLOG3
    `, 'slog3_meta');

    // SLOG3 — usuarios más activos
    out.slog3_usuarios = await q(pool, `
        SELECT TOP 10
            RTRIM(LOGUSU) AS usuario,
            COUNT(*) AS registros,
            MIN(LOGFEC) AS primera_entrada,
            MAX(LOGFEC) AS ultima_entrada
        FROM SLOG3
        GROUP BY RTRIM(LOGUSU)
        ORDER BY registros DESC
    `, 'slog3_usuarios');

    // SLOG3 — textos únicos (patrones de mensaje)
    out.slog3_textos_muestra = await q(pool, `
        SELECT TOP 30
            LOGUSU,
            LOGFEC,
            CAST(LOGTEX AS NVARCHAR(500)) AS texto_muestra
        FROM SLOG3
        WHERE LOGFEC >= '2025-01-01'
        ORDER BY LOGFEC DESC, LOGHOR DESC
    `, 'slog3_textos_muestra');

    // ── PASO 2: Referencias dinámicas a STOCK en SPs ─────────────────────────

    // pr_grabar_030524 — buscar 'STOCK' en el cuerpo
    const grabar = await q(pool, `
        SELECT definition FROM sys.sql_modules
        WHERE object_id = OBJECT_ID('pr_grabar_030524')
    `, 'grabar_def');

    const grabarDef = grabar[0]?.definition || '';
    const grabarLines = grabarDef.split(/\r?\n/).map((l, i) => ({ linea: i + 1, texto: l.trim() }))
        .filter(l => /STOCK|INSERT|UPDATE|DELETE|sp_executesql|@TABLACS|@SQL/i.test(l.texto) && l.texto.length > 0);
    out.grabar_030524_stock_refs = grabarLines;

    // pr_compraGrabarLinea4 — buscar STOCK dinámico
    const compra = await q(pool, `
        SELECT definition FROM sys.sql_modules
        WHERE object_id = OBJECT_ID('pr_compraGrabarLinea4')
    `, 'compra_def');
    const compraDef = compra[0]?.definition || '';
    const compraLines = compraDef.split(/\r?\n/).map((l, i) => ({ linea: i + 1, texto: l.trim() }))
        .filter(l => /STOCK|'STOCK'|TABLACS|sp_executesql|@SQL\b/i.test(l.texto) && l.texto.length > 0);
    out.compra_stock_refs = compraLines;

    // pr_pickingGrabarLineaLotes_120424
    const picking = await q(pool, `
        SELECT definition FROM sys.sql_modules
        WHERE object_id = OBJECT_ID('pr_pickingGrabarLineaLotes_120424')
    `, 'picking_def');
    const pickingDef = picking[0]?.definition || '';
    const pickingLines = pickingDef.split(/\r?\n/).map((l, i) => ({ linea: i + 1, texto: l.trim() }))
        .filter(l => /STOCK|TABLACS|sp_executesql|@SQL\b/i.test(l.texto) && l.texto.length > 0);
    out.picking_stock_refs = pickingLines;

    // pr_tLineaRegulariza_260424
    const reg = await q(pool, `
        SELECT definition FROM sys.sql_modules
        WHERE object_id = OBJECT_ID('pr_tLineaRegulariza_260424')
    `, 'reg_def');
    const regDef = reg[0]?.definition || '';
    const regLines = regDef.split(/\r?\n/).map((l, i) => ({ linea: i + 1, texto: l.trim() }))
        .filter(l => /STOCK|TABLACS|sp_executesql|@SQL\b/i.test(l.texto) && l.texto.length > 0);
    out.regulariza_stock_refs = regLines;

    // pr_actualizarStockLoteUbicacion — texto completo filtrado
    const actSL = await q(pool, `
        SELECT definition FROM sys.sql_modules
        WHERE object_id = OBJECT_ID('pr_actualizarStockLoteUbicacion')
    `, 'actSL_def');
    const actSLDef = actSL[0]?.definition || '';
    const actSLLines = actSLDef.split(/\r?\n/).map((l, i) => ({ linea: i + 1, texto: l.trim() }))
        .filter(l => /'STOCK'|UPDATE STOCK|INSERT.*STOCK|DELETE.*STOCK|STOCKLOTE|CANTIDADSERVIDA|ARTICULO/i.test(l.texto) && l.texto.length > 0);
    out.actualizarStockLote_tablas_tocadas = actSLLines;

    // ── PASO 3: Buscar en TODOS los SPs referencias a 'STOCK' como string ────
    out.sps_con_string_stock_literal = await q(pool, `
        SELECT
            r.ROUTINE_NAME,
            r.LAST_ALTERED
        FROM INFORMATION_SCHEMA.ROUTINES r
        WHERE r.ROUTINE_TYPE = 'PROCEDURE'
          AND UPPER(r.ROUTINE_DEFINITION) LIKE '%''STOCK''%'
        ORDER BY r.ROUTINE_NAME
    `, 'sps_con_string_stock_literal');

    // Buscar 'UPDATE STOCK ' o 'INSERT INTO STOCK'
    out.sps_con_update_insert_stock = await q(pool, `
        SELECT
            r.ROUTINE_NAME,
            r.LAST_ALTERED
        FROM INFORMATION_SCHEMA.ROUTINES r
        WHERE r.ROUTINE_TYPE = 'PROCEDURE'
          AND (
              UPPER(r.ROUTINE_DEFINITION) LIKE '%UPDATE STOCK%'
           OR UPPER(r.ROUTINE_DEFINITION) LIKE '%INSERT INTO STOCK%'
           OR UPPER(r.ROUTINE_DEFINITION) LIKE '%DELETE FROM STOCK%'
          )
        ORDER BY r.ROUTINE_NAME
    `, 'sps_con_update_insert_stock');

    // ── PASO 4: TABLA STOCK — columnas y metadata ─────────────────────────────
    out.stock_columnas_completas = await q(pool, `
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'STOCK'
        ORDER BY ORDINAL_POSITION
    `, 'stock_columnas');

    // ¿Tiene STOCK columna de fecha/timestamp?
    out.stock_columna_fecha = await q(pool, `
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'STOCK'
          AND (DATA_TYPE IN ('datetime','date','timestamp','rowversion')
           OR UPPER(COLUMN_NAME) LIKE '%FEC%'
           OR UPPER(COLUMN_NAME) LIKE '%DATE%'
           OR UPPER(COLUMN_NAME) LIKE '%TIME%'
           OR UPPER(COLUMN_NAME) LIKE '%MOD%'
           OR UPPER(COLUMN_NAME) LIKE '%UPD%')
    `, 'stock_columna_fecha');

    // STOCK — índices
    out.stock_indices = await q(pool, `
        SELECT
            i.name AS indice,
            i.type_desc,
            i.is_unique,
            STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columnas
        FROM sys.indexes i
        JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE i.object_id = OBJECT_ID('STOCK') AND i.name IS NOT NULL
        GROUP BY i.name, i.type_desc, i.is_unique
        ORDER BY i.name
    `, 'stock_indices');

    // ── PASO 5: pr_sumaContador2 y pr_actualizarContador ─────────────────────
    const sumCont = await q(pool, `
        SELECT definition FROM sys.sql_modules
        WHERE object_id = OBJECT_ID('pr_sumaContador2')
    `, 'sumaContador2');
    out.sumaContador2_def = sumCont[0]?.definition || 'NO EXISTE';

    const actCont = await q(pool, `
        SELECT definition FROM sys.sql_modules
        WHERE object_id = OBJECT_ID('pr_actualizarContador')
    `, 'actualizarContador');
    out.actualizarContador_def = actCont[0]?.definition || 'NO EXISTE';

    // CONTADOR — qué series existen
    out.contador_series = await q(pool, `
        SELECT TOP 30 * FROM CONTADOR ORDER BY (SELECT NULL)
    `, 'contador_series');

    // ── PASO 6: ARTICULOUBI — qué contiene ───────────────────────────────────
    out.articuloubi_columnas = await q(pool, `
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'ARTICULOUBI'
        ORDER BY ORDINAL_POSITION
    `, 'articuloubi_columnas');

    out.articuloubi_muestra = await q(pool, `
        SELECT TOP 5 * FROM ARTICULOUBI
    `, 'articuloubi_muestra');

    // SPs que referencian ARTICULOUBI
    out.sps_articuloubi = await q(pool, `
        SELECT ROUTINE_NAME, LAST_ALTERED
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_TYPE = 'PROCEDURE'
          AND UPPER(ROUTINE_DEFINITION) LIKE '%ARTICULOUBI%'
        ORDER BY ROUTINE_NAME
    `, 'sps_articuloubi');

    await pool.close();
    console.log(JSON.stringify(out, null, 2));
}

run().catch(e => { console.error(e.message); process.exit(1); });
