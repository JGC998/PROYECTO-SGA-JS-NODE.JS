"use strict";

// Stub de db.js para entornos sin SQL Server (CI).
// Solo se activa cuando jest.config.js detecta CI=true.
// La BD real sigue en backend/db.js (excluida de git).

async function getPool() {
    throw new Error("[CI stub] No hay conexión a BD disponible en este entorno");
}

module.exports = {
    sql: {},
    getPool,
};
