"use strict";

const { Router } = require('express');
const tercerosService = require('../services/terceros.service');

const router = Router();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

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

module.exports = router;
