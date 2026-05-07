"use strict";

const { Router } = require('express');
const analyticsService = require('../services/analytics.service');

const router = Router();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

// ─── ESTADÍSTICAS Y PANEL EJECUTIVO ──────────────────────────────────────────

router.get('/estadisticas/dashboard', async (req, res) => {
    try {
        const data = await analyticsService.getDashboard(req.query.desde, req.query.hasta);
        res.json(data);
    } catch (err) { serverError(res, err); }
});

router.get('/estadisticas/alertas', async (req, res) => {
    try {
        const data = await analyticsService.getAlertas();
        res.json(data);
    } catch (err) { serverError(res, err); }
});

// ─── ANALÍTICA — LOG Y ACTIVIDAD ─────────────────────────────────────────────

router.get('/analitica/log', async (req, res) => {
    try {
        const data = await analyticsService.getLog(req.query.desde, req.query.hasta);
        res.json(data);
    } catch (err) { serverError(res, err); }
});

router.get('/analitica/stock-ubicacion', async (req, res) => {
    try {
        const data = await analyticsService.getStockUbicacion();
        res.json(data);
    } catch (err) { serverError(res, err); }
});

// ─── ENDPOINTS LEGACY (compatibilidad) ────────────────────────────────────────

router.get('/stats', async (req, res) => {
    try {
        const data = await analyticsService.getStats();
        res.json(data);
    } catch (err) { serverError(res, err); }
});

// ─── CONTADORES ───────────────────────────────────────────────────────────────

router.get('/contadores', async (req, res) => {
    try {
        const data = await analyticsService.getContadores();
        res.json(data);
    } catch (err) { serverError(res, err); }
});

module.exports = router;
