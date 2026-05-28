"use strict";

const { Router } = require('express');
const tercerosService = require('../services/terceros.service');
const { serverError } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');

const router = Router();


// ─── PROVEEDORES ──────────────────────────────────────────────────────────────

router.get('/proveedores', async (req, res) => {
    try {
        const { buscar = '' } = req.query;
        const data = await tercerosService.getProveedores(buscar);
        res.json(data);
    } catch (err) { serverError(res, err); }
});

router.get('/proveedores/:cod', async (req, res) => {
    try {
        const data = await tercerosService.getProveedor(req.params.cod);
        if (!data) return res.status(404).json({ error: 'No encontrado' });
        res.json(data);
    } catch (err) { serverError(res, err); }
});

// ─── CLIENTES ─────────────────────────────────────────────────────────────────

router.get('/clientes', async (req, res) => {
    try {
        const { buscar = '' } = req.query;
        const data = await tercerosService.getClientes(buscar);
        res.json(data);
    } catch (err) { serverError(res, err); }
});

router.get('/clientes/:cod', async (req, res) => {
    try {
        const data = await tercerosService.getCliente(req.params.cod);
        if (!data) return res.status(404).json({ error: 'No encontrado' });
        res.json(data);
    } catch (err) { serverError(res, err); }
});

// ─── OPERARIOS ────────────────────────────────────────────────────────────────

router.get('/operarios', async (req, res) => {
    try {
        const { buscar = '' } = req.query;
        const data = await tercerosService.getOperarios(buscar);
        res.json(data);
    } catch (err) { serverError(res, err); }
});

router.get('/operarios/:cod', async (req, res) => {
    try {
        const data = await tercerosService.getOperario(req.params.cod);
        if (!data) return res.status(404).json({ error: 'No encontrado' });
        res.json(data);
    } catch (err) { serverError(res, err); }
});

router.delete('/operarios/:cod', requireAuth, async (req, res) => {
    try {
        const cod = String(req.params.cod).trim();
        if (!cod) return res.status(400).json({ error: 'Código obligatorio' });
        const exists = await tercerosService.getOperario(cod);
        if (!exists) return res.status(404).json({ error: 'Operario no encontrado' });
        await tercerosService.deleteOperario(cod);
        res.json({ ok: true });
    } catch (err) { serverError(res, err); }
});

module.exports = router;
