"use strict";

const request = require("supertest");
const app = require("../app");

describe("Endpoints pendientes de implementación (501)", () => {
    const endpoints = [
        { method: "post", path: "/traspasar-inventarios",      body: {} },
        { method: "post", path: "/importar-regularizaciones",  body: { fecha: "2026-01-01" } },
        { method: "post", path: "/asignar-fecha-stock-inicial", body: {} },
        { method: "post", path: "/borrar-picking",             body: { albaran: "TEST001" } },
        { method: "post", path: "/poner-cero-carrusel",        body: {} },
        { method: "post", path: "/configuracion-empresa",      body: { nombre: "Test" } },
    ];

    endpoints.forEach(({ method, path, body }) => {
        test(`${method.toUpperCase()} ${path} debe devolver 501 con pendiente:true`, async () => {
            const res = await request(app)[method](path).send(body);
            expect(res.statusCode).toBe(501);
            expect(res.body).toHaveProperty("ok", false);
            expect(res.body).toHaveProperty("pendiente", true);
            expect(res.body).toHaveProperty("message", "Funcionalidad pendiente de implementación.");
        });
    });
});
