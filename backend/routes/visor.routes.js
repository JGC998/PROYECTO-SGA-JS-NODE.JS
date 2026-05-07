"use strict";

const { Router } = require('express');
const visorService = require('../services/visor.service');

const router = Router();

function serverError(res, err) {
    console.error("[ERROR]", err.message || err);
    return res.status(500).json({ error: "Error interno del servidor" });
}

router.get('/visor/articulos', async (req, res) => {
    try {
        const { buscar = '' } = req.query;
        const data = await visorService.getArticulos(buscar);
        res.json(data);
    } catch (err) { serverError(res, err); }
});

router.get('/visor/proveedores', async (req, res) => {
    try {
        const { buscar = '' } = req.query;
        const data = await visorService.getProveedores(buscar);
        res.json(data);
    } catch (err) { serverError(res, err); }
});

router.get('/visor/clientes', async (req, res) => {
    try {
        const { buscar = '' } = req.query;
        const data = await visorService.getClientes(buscar);
        res.json(data);
    } catch (err) { serverError(res, err); }
});

module.exports = router;
