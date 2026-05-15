"use strict";

// FASE 8.3 — Auditoría escritores STOCK/STOCKLOTE
// Solo lectura de metadatos. No modifica nada.

const { getPool } = require('../backend/db');

async function q(pool, query, label) {
    try {
        return (await pool.request().query(query)).recordset;
    } catch (e) {
        return [{ _error: e.message, _query: label }];
    }
}

async function run() {
    const pool = await getPool();
    const out = {};

    // ── PASO 1: TRIGGERS ─────────────────────────────────────────────────────
    out.triggers_sobre_tablas = await q(pool, `
        SELECT
            t.name AS trigger_nombre,
            OBJECT_NAME(t.parent_id) AS tabla,
            t.is_disabled,
            t.is_instead_of_trigger,
            t.create_date,
            t.modify_date
        FROM sys.triggers t
        WHERE OBJECT_NAME(t.parent_id)
            IN ('STOCK','STOCKLOTE','ALBARANCS','ARTICULOUBI','ALBARANLCS')
        ORDER BY tabla, trigger_nombre
    `, 'triggers_sobre_tablas');

    // Definición de cada trigger encontrado
    out.triggers_definicion = await q(pool, `
        SELECT
            t.name AS trigger_nombre,
            OBJECT_NAME(t.parent_id) AS tabla,
            m.definition
        FROM sys.triggers t
        JOIN sys.sql_modules m ON m.object_id = t.object_id
        WHERE OBJECT_NAME(t.parent_id)
            IN ('STOCK','STOCKLOTE','ALBARANCS','ARTICULOUBI','ALBARANLCS')
    `, 'triggers_definicion');

    // Todos los triggers de la BD (mapa completo)
    out.todos_los_triggers = await q(pool, `
        SELECT
            t.name AS trigger_nombre,
            OBJECT_NAME(t.parent_id) AS tabla,
            t.is_disabled,
            t.create_date
        FROM sys.triggers t
        ORDER BY tabla, trigger_nombre
    `, 'todos_los_triggers');

    // ── PASO 2: STORED PROCEDURES ─────────────────────────────────────────────
    out.sp_relacionados_stock = await q(pool, `
        SELECT ROUTINE_NAME, ROUTINE_TYPE, CREATED, LAST_ALTERED
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_TYPE = 'PROCEDURE'
          AND (
              UPPER(ROUTINE_DEFINITION) LIKE '%STOCK%'
           OR UPPER(ROUTINE_DEFINITION) LIKE '%STOCKLOTE%'
          )
        ORDER BY ROUTINE_NAME
    `, 'sp_relacionados_stock');

    out.sp_relacionados_albarancs = await q(pool, `
        SELECT ROUTINE_NAME, ROUTINE_TYPE, CREATED, LAST_ALTERED
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_TYPE = 'PROCEDURE'
          AND UPPER(ROUTINE_DEFINITION) LIKE '%ALBARANCS%'
        ORDER BY ROUTINE_NAME
    `, 'sp_relacionados_albarancs');

    out.sp_inventario_recepcion = await q(pool, `
        SELECT ROUTINE_NAME, ROUTINE_TYPE, CREATED, LAST_ALTERED
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_TYPE = 'PROCEDURE'
          AND (
              UPPER(ROUTINE_NAME) LIKE '%INVENT%'
           OR UPPER(ROUTINE_NAME) LIKE '%RECEP%'
           OR UPPER(ROUTINE_NAME) LIKE '%REGULAR%'
           OR UPPER(ROUTINE_NAME) LIKE '%ENTRADA%'
           OR UPPER(ROUTINE_NAME) LIKE '%PICKING%'
           OR UPPER(ROUTINE_NAME) LIKE '%EXPEDI%'
           OR UPPER(ROUTINE_NAME) LIKE '%MERCAN%'
          )
        ORDER BY ROUTINE_NAME
    `, 'sp_inventario_recepcion');

    // Total de SPs en la BD
    out.total_sps = await q(pool, `
        SELECT COUNT(*) AS total_procedures
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_TYPE = 'PROCEDURE'
    `, 'total_sps');

    // ── PASO 3: VISTAS ────────────────────────────────────────────────────────
    out.vistas_relacionadas = await q(pool, `
        SELECT TABLE_NAME, TABLE_SCHEMA
        FROM INFORMATION_SCHEMA.VIEWS
        WHERE UPPER(VIEW_DEFINITION) LIKE '%STOCK%'
           OR UPPER(VIEW_DEFINITION) LIKE '%STOCKLOTE%'
           OR UPPER(VIEW_DEFINITION) LIKE '%ALBARANCS%'
        ORDER BY TABLE_NAME
    `, 'vistas_relacionadas');

    out.total_vistas = await q(pool, `
        SELECT COUNT(*) AS total_views FROM INFORMATION_SCHEMA.VIEWS
    `, 'total_vistas');

    // ── PASO 4: SQL SERVER AGENT JOBS ─────────────────────────────────────────
    out.jobs_agent = await q(pool, `
        SELECT
            j.name AS job_nombre,
            j.enabled,
            j.description,
            j.date_created,
            j.date_modified,
            c.name AS categoria
        FROM msdb.dbo.sysjobs j
        LEFT JOIN msdb.dbo.syscategories c ON c.category_id = j.category_id
        ORDER BY j.name
    `, 'jobs_agent');

    out.job_steps_stock = await q(pool, `
        SELECT
            j.name AS job_nombre,
            js.step_name,
            js.command,
            js.subsystem
        FROM msdb.dbo.sysjobs j
        JOIN msdb.dbo.sysjobsteps js ON js.job_id = j.job_id
        WHERE UPPER(js.command) LIKE '%STOCK%'
           OR UPPER(js.command) LIKE '%STOCKLOTE%'
           OR UPPER(js.command) LIKE '%ALBARANCS%'
           OR UPPER(js.command) LIKE '%INVENT%'
           OR UPPER(js.command) LIKE '%RECEP%'
        ORDER BY j.name, js.step_id
    `, 'job_steps_stock');

    // ── PASO 5: DEPENDENCIAS ──────────────────────────────────────────────────
    // Qué objetos referencian STOCK
    out.dependencias_stock = await q(pool, `
        SELECT DISTINCT
            OBJECT_NAME(referencing_id) AS objeto_referenciante,
            o.type_desc AS tipo
        FROM sys.sql_expression_dependencies sed
        JOIN sys.objects o ON o.object_id = sed.referencing_id
        WHERE OBJECT_NAME(referenced_id) = 'STOCK'
        ORDER BY tipo, objeto_referenciante
    `, 'dependencias_stock');

    // Qué objetos referencian STOCKLOTE
    out.dependencias_stocklote = await q(pool, `
        SELECT DISTINCT
            OBJECT_NAME(referencing_id) AS objeto_referenciante,
            o.type_desc AS tipo
        FROM sys.sql_expression_dependencies sed
        JOIN sys.objects o ON o.object_id = sed.referencing_id
        WHERE OBJECT_NAME(referenced_id) = 'STOCKLOTE'
        ORDER BY tipo, objeto_referenciante
    `, 'dependencias_stocklote');

    // Qué objetos referencian ALBARANCS
    out.dependencias_albarancs = await q(pool, `
        SELECT DISTINCT
            OBJECT_NAME(referencing_id) AS objeto_referenciante,
            o.type_desc AS tipo
        FROM sys.sql_expression_dependencies sed
        JOIN sys.objects o ON o.object_id = sed.referencing_id
        WHERE OBJECT_NAME(referenced_id) = 'ALBARANCS'
        ORDER BY tipo, objeto_referenciante
    `, 'dependencias_albarancs');

    // Qué tablas toca cada SP que mencionó STOCK (definición completa)
    out.sp_definiciones_stock = await q(pool, `
        SELECT
            r.ROUTINE_NAME,
            m.definition
        FROM INFORMATION_SCHEMA.ROUTINES r
        JOIN sys.sql_modules m ON m.object_id = OBJECT_ID(r.ROUTINE_NAME)
        WHERE r.ROUTINE_TYPE = 'PROCEDURE'
          AND (
              UPPER(r.ROUTINE_DEFINITION) LIKE '%STOCKLOTE%'
          )
        ORDER BY r.ROUTINE_NAME
    `, 'sp_definiciones_stock');

    // ── PASO 6: TABLAS AUXILIARES — contexto escritura ────────────────────────
    // ¿Existe tabla de log/historial?
    out.tablas_log_historial = await q(pool, `
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
          AND (
              UPPER(TABLE_NAME) LIKE '%LOG%'
           OR UPPER(TABLE_NAME) LIKE '%HIST%'
           OR UPPER(TABLE_NAME) LIKE '%AUDIT%'
           OR UPPER(TABLE_NAME) LIKE '%TRACE%'
           OR UPPER(TABLE_NAME) LIKE '%MOVIM%'
           OR UPPER(TABLE_NAME) LIKE '%TRAZA%'
          )
        ORDER BY TABLE_NAME
    `, 'tablas_log_historial');

    // Todas las tablas de la BD (mapa completo)
    out.todas_las_tablas = await q(pool, `
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
    `, 'todas_las_tablas');

    // ── PASO 7: ALBARANLCS — tabla de líneas ──────────────────────────────────
    out.albaranlcs_columnas = await q(pool, `
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'ALBARANLCS'
        ORDER BY ORDINAL_POSITION
    `, 'albaranlcs_columnas');

    out.albaranlcs_count = await q(pool, `
        SELECT COUNT(*) AS total FROM ALBARANLCS
    `, 'albaranlcs_count');

    // ── PASO 8: FOREIGN KEYS sobre STOCK/STOCKLOTE ───────────────────────────
    out.fk_sobre_stock = await q(pool, `
        SELECT
            fk.name AS fk_nombre,
            OBJECT_NAME(fk.parent_object_id) AS tabla_origen,
            COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS columna_origen,
            OBJECT_NAME(fk.referenced_object_id) AS tabla_referenciada,
            COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS columna_ref
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        WHERE OBJECT_NAME(fk.referenced_object_id) IN ('STOCK','STOCKLOTE')
           OR OBJECT_NAME(fk.parent_object_id) IN ('STOCK','STOCKLOTE')
    `, 'fk_sobre_stock');

    // ── PASO 9: Columnas clave de ALBARANCS y STOCK ───────────────────────────
    out.albarancs_columnas = await q(pool, `
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'ALBARANCS'
        ORDER BY ORDINAL_POSITION
    `, 'albarancs_columnas');

    out.stock_columnas = await q(pool, `
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'STOCK'
        ORDER BY ORDINAL_POSITION
    `, 'stock_columnas');

    await pool.close();
    console.log(JSON.stringify(out, null, 2));
}

run().catch(e => { console.error(e.message); process.exit(1); });
