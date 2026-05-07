"use strict";

const { getPool } = require('../db');

async function getAlmacenes() {
    const pool = await getPool();
    const r = await pool.request().query('SELECT ALMCOD AS codigo, ALMNOM AS nombre FROM ALMACENES ORDER BY ALMCOD');
    return r.recordset;
}

async function upsertAlmacen(cod, nom) {
    const pool = await getPool();
    await pool.request().input('cod', cod).input('nom', nom)
        .query(`IF EXISTS (SELECT 1 FROM ALMACENES WHERE ALMCOD=@cod)
            UPDATE ALMACENES SET ALMNOM=@nom WHERE ALMCOD=@cod
        ELSE INSERT INTO ALMACENES (ALMCOD,ALMNOM) VALUES (@cod,@nom)`);
}

async function getSubfamilias() {
    const pool = await getPool();
    const r = await pool.request().query('SELECT SFACOD AS codigo, SFANOM AS nombre, SFANOLOT AS sin_control_lote FROM SUBFAMILIA ORDER BY SFACOD');
    return r.recordset;
}

async function upsertSubfamilias(rows) {
    const pool = await getPool();
    for (const r of rows) {
        if (!r.codigo) continue;
        await pool.request().input('cod', r.codigo).input('nom', r.nombre || '').input('nol', r.sin_control_lote ? 1 : 0)
            .query(`IF EXISTS (SELECT 1 FROM SUBFAMILIA WHERE SFACOD=@cod)
                UPDATE SUBFAMILIA SET SFANOM=@nom, SFANOLOT=@nol WHERE SFACOD=@cod
            ELSE INSERT INTO SUBFAMILIA (SFACOD,SFANOM,SFANOLOT) VALUES (@cod,@nom,@nol)`);
    }
}

async function getTerminalesPda() {
    const pool = await getPool();
    const r = await pool.request().query('SELECT repcod AS codigo, repnom AS nombre, repser AS serie, repdat AS tipo_doc, reprutsin AS ruta_sinc, reprutwifi AS ruta_wifi FROM terminalpda ORDER BY repcod');
    return r.recordset;
}

async function upsertTerminalPda(codigo, nombre, serie, tipo_doc, ruta_sinc, ruta_wifi) {
    const pool = await getPool();
    await pool.request()
        .input('cod', codigo).input('nom', nombre).input('ser', serie)
        .input('dat', tipo_doc).input('rsin', ruta_sinc).input('rwifi', ruta_wifi)
        .query(`IF EXISTS (SELECT 1 FROM terminalpda WHERE repcod=@cod)
            UPDATE terminalpda SET repnom=@nom, repser=@ser, repdat=@dat, reprutsin=@rsin, reprutwifi=@rwifi
            WHERE repcod=@cod
        ELSE INSERT INTO terminalpda (repcod,repnom,repser,repdat,reprutsin,reprutwifi)
            VALUES (@cod,@nom,@ser,@dat,@rsin,@rwifi)`);
}

async function getUsuarios(buscar) {
    const pool = await getPool();
    const r = await pool.request().input('b', `%${buscar}%`)
        .query(`SELECT USUCOD AS codigo, USUNOM AS nombre,
            USUTIP AS tipo, USUNIV AS nivel
            FROM SGAUSUARIO
            WHERE USUCOD LIKE @b OR USUNOM LIKE @b
            ORDER BY USUCOD`);
    return r.recordset;
}

async function upsertUsuario(codigo, nombre, tipo, nivel) {
    const pool = await getPool();
    await pool.request().input('cod', codigo).input('nom', nombre).input('tip', tipo).input('niv', nivel)
        .query(`IF EXISTS (SELECT 1 FROM SGAUSUARIO WHERE USUCOD=@cod)
            UPDATE SGAUSUARIO SET USUNOM=@nom, USUTIP=@tip, USUNIV=@niv WHERE USUCOD=@cod
        ELSE INSERT INTO SGAUSUARIO (USUCOD,USUNOM,USUTIP,USUNIV) VALUES (@cod,@nom,@tip,@niv)`);
}

async function getConfiguracionEmpresa() {
    const pool = await getPool();
    const r = await pool.request().query('SELECT TOP 1 * FROM EMPRESA');
    return r.recordset[0] || {};
}

module.exports = {
    getAlmacenes, upsertAlmacen,
    getSubfamilias, upsertSubfamilias,
    getTerminalesPda, upsertTerminalPda,
    getUsuarios, upsertUsuario,
    getConfiguracionEmpresa
};
