const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('./middleware/auth');
const healthRoutes          = require('./routes/health.routes');
const systemRoutes          = require('./routes/system.routes');
const tercerosRoutes        = require('./routes/terceros.routes');
const configRoutes          = require('./routes/config.routes');
const articulosRoutes       = require('./routes/articulos.routes');
const ubicacionesRoutes     = require('./routes/ubicaciones.routes');
const lotesRoutes           = require('./routes/lotes.routes');
const visorRoutes           = require('./routes/visor.routes');
const analyticsRoutes       = require('./routes/analytics.routes');
const stockRoutes           = require('./routes/stock.routes');
const regularizacionesRoutes = require('./routes/regularizaciones.routes');
const expedicionesRoutes    = require('./routes/expediciones.routes');
const pickingRoutes         = require('./routes/picking.routes');
const pedidosRoutes         = require('./routes/pedidos.routes');
const entradaMercanciaRoutes = require('./routes/entrada-mercancia.routes');
const salidaMercanciaRoutes  = require('./routes/salida-mercancia.routes');
const adminRoutes           = require('./routes/admin.routes');
const escriturasRoutes      = require('./routes/escrituras.routes');
const movimientosRoutes     = require('./routes/movimientos.routes');
const almacenRoutes         = require('./routes/almacen.routes');
const estadisticasRoutes    = require('./routes/estadisticas.routes');

const app = express();

// ── Helmet con CSP adaptada para el visor 3D (Three.js desde jsDelivr CDN) ──
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:    ["'self'"],
            // 'unsafe-eval' requerido por Three.js para compilar shaders GLSL. No se puede eliminar sin reemplazar Three.js.
            scriptSrc:     ["'self'", "'unsafe-eval'", 'https://cdn.jsdelivr.net',
                            "'sha256-9HZ7iq1u/4DY3OSYci7n+3OdBkF/KATYRNxSXlGZotk='"],
            scriptSrcElem: ["'self'", 'https://cdn.jsdelivr.net',
                            "'sha256-9HZ7iq1u/4DY3OSYci7n+3OdBkF/KATYRNxSXlGZotk='",
                            "'sha256-ZswfTY7H35rbv8WC7NXBoiC7WNu86vSzCDChNWwZZDM='",
                            "'sha256-RJ1VNwgjpYiX0eySANQKr1YYIRgpxMEXpIMzCLAGWCk='",
                            "'sha256-033aohc71jOt1JsLc/kAtKhnBaNkWKKQ75XSDx82GFQ='"],
            styleSrc:      ["'self'", "'unsafe-inline'"],
            imgSrc:        ["'self'", 'data:', 'blob:'],
            connectSrc:    ["'self'"],
            workerSrc:     ["'self'", 'blob:'],
            fontSrc:       ["'self'", 'data:'],
            objectSrc:              ["'none'"],
            upgradeInsecureRequests: null,
        },
    },
}));

if (process.env.CORS_ORIGIN === '*') {
    console.warn('[SGA] AVISO: CORS_ORIGIN="*" — cualquier origen puede acceder a la API. No usar en producción.');
}
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'x-api-key'],
}));
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 500 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones, intenta de nuevo en unos minutos.' },
}));
app.use(express.json());

// Sirve el frontend estático (HTML, CSS, JS, texturas, datos)
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/', healthRoutes);
app.use('/', systemRoutes);
app.use('/', tercerosRoutes);
app.use('/', configRoutes);
app.use('/', articulosRoutes);
app.use('/', ubicacionesRoutes);
app.use('/', lotesRoutes);
app.use('/', visorRoutes);
app.use('/', analyticsRoutes);
app.use('/', stockRoutes);
app.use('/', regularizacionesRoutes);
app.use('/', expedicionesRoutes);
app.use('/', pickingRoutes);
app.use('/', pedidosRoutes);
app.use('/', entradaMercanciaRoutes);
app.use('/', salidaMercanciaRoutes);
app.use('/', adminRoutes);
app.use('/', escriturasRoutes);
app.use('/', movimientosRoutes);
app.use('/', almacenRoutes);
app.use('/', estadisticasRoutes);

module.exports = app;
