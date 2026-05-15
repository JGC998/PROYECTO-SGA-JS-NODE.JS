"use strict";

const { sql, getPool } = require('../backend/db');

async function q(pool, query) {
    return (await pool.request().query(query)).recordset;
}

async function run() {
    const pool = await getPool();
    const out = {};

    // STOCKLOTE: filas con STOARTCOD real
    out.stocklote_con_articulo = await q(pool, `
        SELECT COUNT(*) AS filas_con_art, COUNT(DISTINCT RTRIM(STOARTCOD)) AS articulos_distintos
        FROM STOCKLOTE WHERE RTRIM(STOARTCOD) <> ''
    `);

    out.stocklote_muestra_con_art = await q(pool, `
        SELECT TOP 10 RTRIM(STOARTCOD) AS art, RTRIM(STOUBI) AS ubi,
               RTRIM(STOLOT) AS lote, RTRIM(STO2LOT) AS lote2, STOCAN AS stock
        FROM STOCKLOTE WHERE RTRIM(STOARTCOD) <> ''
        ORDER BY STOCAN DESC
    `);

    // ¿STOCKLOTE tiene 789*/799*?
    out.stocklote_virtual = await q(pool, `
        SELECT COUNT(*) AS filas_virtual
        FROM STOCKLOTE WHERE STOUBI LIKE '789%' OR STOUBI LIKE '799%'
    `);

    // Prefijos en STOCKLOTE
    out.stocklote_prefijos = await q(pool, `
        SELECT LEFT(RTRIM(STOUBI),3) AS prefijo, COUNT(*) AS filas, SUM(STOCAN) AS stock_total
        FROM STOCKLOTE GROUP BY LEFT(RTRIM(STOUBI),3) ORDER BY filas DESC
    `);

    // Prefijo 900 en STOCK — qué es
    out.prefijo_900_muestra = await q(pool, `
        SELECT TOP 10 RTRIM(STOUBI) AS ubi, RTRIM(STOARTCOD) AS art,
               RTRIM(STOLOT) AS lote, STOCAN AS stock
        FROM STOCK WHERE STOUBI LIKE '900%'
        ORDER BY STOCAN DESC
    `);

    // Prefijo 900 en UBICACION
    out.prefijo_900_ubicacion = await q(pool, `
        SELECT RTRIM(UBICODUBI) AS ubi, RTRIM(UBINOM) AS nombre,
               RTRIM(UBIALMCOD) AS almacen, UBILIB AS libre, UBIMUL AS multiple
        FROM UBICACION WHERE UBICODUBI LIKE '900%'
    `);

    // Prefijo 800 en UBICACION
    out.prefijo_800_ubicacion = await q(pool, `
        SELECT RTRIM(UBICODUBI) AS ubi, RTRIM(UBINOM) AS nombre,
               RTRIM(UBIALMCOD) AS almacen
        FROM UBICACION WHERE UBICODUBI LIKE '800%'
    `);

    // Prefijo 700 en UBICACION
    out.prefijo_700_ubicacion = await q(pool, `
        SELECT RTRIM(UBICODUBI) AS ubi, RTRIM(UBINOM) AS nombre,
               RTRIM(UBIALMCOD) AS almacen
        FROM UBICACION WHERE UBICODUBI LIKE '700%'
    `);

    // 799 en UBICACION — ¿tiene nombre?
    out.prefijo_799_en_ubicacion = await q(pool, `
        SELECT COUNT(*) AS filas FROM UBICACION WHERE UBICODUBI LIKE '799%'
    `);

    // Artículos SOLO en virtual (no en físico)
    out.art_solo_virtual = await q(pool, `
        SELECT COUNT(DISTINCT RTRIM(STOARTCOD)) AS articulos_solo_virtual
        FROM STOCK
        WHERE (STOUBI LIKE '789%' OR STOUBI LIKE '799%')
          AND RTRIM(STOARTCOD) NOT IN (
              SELECT RTRIM(STOARTCOD) FROM STOCK
              WHERE STOUBI NOT LIKE '789%' AND STOUBI NOT LIKE '799%'
          )
    `);

    // ¿Hay artículos con stock_fisico < stock_virtual? (posible reserva que supera físico)
    out.fisico_menor_que_virtual = await q(pool, `
        SELECT TOP 10
            RTRIM(a.STOARTCOD) AS articulo,
            SUM(CASE WHEN a.STOUBI NOT LIKE '789%' AND a.STOUBI NOT LIKE '799%'
                     THEN a.STOCAN ELSE 0 END) AS stock_fisico,
            SUM(CASE WHEN a.STOUBI LIKE '789%' OR a.STOUBI LIKE '799%'
                     THEN a.STOCAN ELSE 0 END) AS stock_virtual
        FROM STOCK a
        WHERE EXISTS (
            SELECT 1 FROM STOCK b WHERE RTRIM(b.STOARTCOD)=RTRIM(a.STOARTCOD)
            AND (b.STOUBI LIKE '789%' OR b.STOUBI LIKE '799%')
        )
        GROUP BY RTRIM(a.STOARTCOD)
        HAVING SUM(CASE WHEN a.STOUBI NOT LIKE '789%' AND a.STOUBI NOT LIKE '799%'
                        THEN a.STOCAN ELSE 0 END)
             < SUM(CASE WHEN a.STOUBI LIKE '789%' OR a.STOUBI LIKE '799%'
                        THEN a.STOCAN ELSE 0 END)
    `);

    // ¿Hay stock negativo en físico?
    out.stock_negativo = await q(pool, `
        SELECT LEFT(RTRIM(STOUBI),3) AS prefijo,
               COUNT(*) AS filas_neg,
               SUM(STOCAN) AS stock_neg_total
        FROM STOCK WHERE STOCAN < 0
        GROUP BY LEFT(RTRIM(STOUBI),3)
        ORDER BY filas_neg DESC
    `);

    // Prefijos D1 y O1 — ¿qué son?
    out.prefijos_raros = await q(pool, `
        SELECT RTRIM(STOUBI) AS ubi, RTRIM(STOARTCOD) AS art,
               RTRIM(STOLOT) AS lote, STOCAN AS stock
        FROM STOCK WHERE STOUBI LIKE 'D1%' OR STOUBI LIKE 'O1%'
    `);

    // Relación STOCK <-> STOCKLOTE — ¿misma clave?
    out.match_stock_stocklote = await q(pool, `
        SELECT TOP 5
            s.STOARTCOD, s.STOUBI, s.STOLOT, s.STOCAN AS stock_stock,
            sl.STOCAN AS stock_stocklote, sl.STO2LOT
        FROM STOCK s
        JOIN STOCKLOTE sl ON RTRIM(sl.STOUBI)=RTRIM(s.STOUBI)
                          AND RTRIM(sl.STOLOT)=RTRIM(s.STOLOT)
                          AND RTRIM(sl.STOARTCOD)=RTRIM(s.STOARTCOD)
        WHERE RTRIM(s.STOARTCOD) <> ''
    `);

    await pool.close();
    console.log(JSON.stringify(out, null, 2));
}

run().catch(e => { console.error(e.message); process.exit(1); });
