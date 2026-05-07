"use strict";

const { Router } = require('express');
const configService = require('../services/config.service');

const router = Router();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

// ─── ALMACENES ────────────────────────────────────────────────────────────────

router.get('/almacenes', async (req, res) => {
    try {
        const data = await configService.getAlmacenes();
        res.json(data);
    } catch (err) { serverError(res, err); }
});

router.post('/almacenes', async (req, res) => {
    try {
        const { cod, nom } = req.body;
        await configService.upsertAlmacen(cod, nom);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── SUBFAMILIAS ──────────────────────────────────────────────────────────────

router.get('/subfamilias', async (req, res) => {
    try {
        const data = await configService.getSubfamilias();
        res.json(data);
    } catch (err) { serverError(res, err); }
});

router.post('/subfamilias', async (req, res) => {
    try {
        const rows = Array.isArray(req.body) ? req.body : [req.body];
        await configService.upsertSubfamilias(rows);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── TERMINALES PDA ───────────────────────────────────────────────────────────

router.get('/terminales-pda', async (req, res) => {
    try {
        const data = await configService.getTerminalesPda();
        res.json(data);
    } catch (err) { serverError(res, err); }
});

router.post('/terminales-pda', async (req, res) => {
    try {
        const { codigo, nombre, serie = '', tipo_doc = '', ruta_sinc = '', ruta_wifi = '' } = req.body;
        await configService.upsertTerminalPda(codigo, nombre, serie, tipo_doc, ruta_sinc, ruta_wifi);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── USUARIOS ─────────────────────────────────────────────────────────────────

router.get('/usuarios', async (req, res) => {
    try {
        const { buscar = '' } = req.query;
        const data = await configService.getUsuarios(buscar);
        res.json(data);
    } catch (err) { serverError(res, err); }
});

router.post('/usuarios', async (req, res) => {
    try {
        const { codigo, nombre, tipo = '', nivel = '' } = req.body;
        if (!codigo || !nombre) return res.status(400).json({ error: 'Código y nombre requeridos' });
        await configService.upsertUsuario(codigo, nombre, tipo, nivel);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

// ─── CONFIGURACIÓN DE EMPRESA ─────────────────────────────────────────────────

router.get('/configuracion-empresa', async (req, res) => {
    try {
        const data = await configService.getConfiguracionEmpresa();
        res.json(data);
    } catch (err) { serverError(res, err); }
});

router.post('/configuracion-empresa', async (req, res) => {
    try {
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

module.exports = router;
