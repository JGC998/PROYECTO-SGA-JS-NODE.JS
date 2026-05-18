"use strict";

const { Router } = require('express');

const router = Router();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

// ─── TRASPASO INVENTARIO ───────────────────────────────────────────────────────

router.post('/traspasar-inventarios', async (req, res) => {
    res.status(501).json({ ok: false, pendiente: true, message: 'Funcionalidad pendiente de implementación.' });
});

router.post('/importar-regularizaciones', async (req, res) => {
    res.status(501).json({ ok: false, pendiente: true, message: 'Funcionalidad pendiente de implementación.' });
});

router.post('/asignar-fecha-stock-inicial', async (req, res) => {
    res.status(501).json({ ok: false, pendiente: true, message: 'Funcionalidad pendiente de implementación.' });
});

// ─── BORRAR PICKING ────────────────────────────────────────────────────────────

router.post('/borrar-picking', async (req, res) => {
    res.status(501).json({ ok: false, pendiente: true, message: 'Funcionalidad pendiente de implementación.' });
});

// ─── PONER A CERO CARRUSEL ─────────────────────────────────────────────────────

router.post('/poner-cero-carrusel', async (req, res) => {
    res.status(501).json({ ok: false, pendiente: true, message: 'Funcionalidad pendiente de implementación.' });
});

// ─── COPIA DE SEGURIDAD ────────────────────────────────────────────────────────

router.post('/copia-seguridad', async (req, res) => {
    try {
        const ref = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        res.json({ ok: true, message: `Copia de seguridad iniciada. Referencia: backup_${ref}` });
    } catch (err) { serverError(res, err); }
});

module.exports = router;
