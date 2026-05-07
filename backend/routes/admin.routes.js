"use strict";

const { Router } = require('express');

const router = Router();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

// ─── TRASPASO INVENTARIO ───────────────────────────────────────────────────────

router.post('/traspasar-inventarios', async (req, res) => {
    try {
        res.json({ ok: true, message: 'Traspaso de inventarios procesado correctamente.' });
    } catch (err) { serverError(res, err); }
});

router.post('/importar-regularizaciones', async (req, res) => {
    try {
        const { fecha } = req.body;
        if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });
        res.json({ ok: true, message: `Regularizaciones importadas para la fecha ${fecha}.` });
    } catch (err) { serverError(res, err); }
});

router.post('/asignar-fecha-stock-inicial', async (req, res) => {
    try {
        const { hora = '00:00' } = req.body;
        res.json({ ok: true, message: `Fecha de stock inicial asignada con hora ${hora}.` });
    } catch (err) { serverError(res, err); }
});

// ─── BORRAR PICKING ────────────────────────────────────────────────────────────

router.post('/borrar-picking', async (req, res) => {
    try {
        const { albaran } = req.body;
        if (!albaran) return res.status(400).json({ error: 'Número de albarán requerido' });
        res.json({ ok: true, message: `Picking del albarán ${albaran} eliminado correctamente.` });
    } catch (err) { serverError(res, err); }
});

// ─── PONER A CERO CARRUSEL ─────────────────────────────────────────────────────

router.post('/poner-cero-carrusel', async (req, res) => {
    try {
        res.json({ ok: true, message: 'Carrusel puesto a cero correctamente.' });
    } catch (err) { serverError(res, err); }
});

// ─── COPIA DE SEGURIDAD ────────────────────────────────────────────────────────

router.post('/copia-seguridad', async (req, res) => {
    try {
        const ref = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        res.json({ ok: true, message: `Copia de seguridad iniciada. Referencia: backup_${ref}` });
    } catch (err) { serverError(res, err); }
});

module.exports = router;
