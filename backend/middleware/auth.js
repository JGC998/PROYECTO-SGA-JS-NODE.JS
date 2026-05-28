"use strict";

// Autenticación mínima por API key para endpoints de escritura.
// Configura API_KEY en el entorno. Todos los clientes deben enviar:
//   Header: x-api-key: <valor de API_KEY>

let _warned = false;

function requireAuth(req, res, next) {
    const key = process.env.API_KEY;
    if (!key) {
        if (!_warned) {
            console.warn('[SGA] AVISO: API_KEY no configurada — autenticación desactivada. Define API_KEY en producción.');
            _warned = true;
        }
        return next();
    }
    if (req.headers['x-api-key'] !== key) {
        return res.status(401).json({ error: 'No autorizado' });
    }
    next();
}

// Para EventSource (SSE): acepta header x-api-key O query param ?token=
// ya que la API EventSource del navegador no permite cabeceras personalizadas.
function requireAuthSse(req, res, next) {
    const key = process.env.API_KEY;
    if (!key) return next();
    const provided = req.headers['x-api-key'] || req.query.token;
    if (provided !== key) return res.status(401).end();
    next();
}

module.exports = { requireAuth, requireAuthSse };
