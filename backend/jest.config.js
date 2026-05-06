"use strict";

// En CI (GitHub Actions establece CI=true automáticamente),
// redirige require('./db') al stub para evitar el error de módulo no encontrado.
// En local, CI no está definido y Jest usa el db.js real.
module.exports = {
    ...(process.env.CI && {
        moduleNameMapper: {
            "^\\.{1,2}/db$": "<rootDir>/__mocks__/db.js",
        },
    }),
};
