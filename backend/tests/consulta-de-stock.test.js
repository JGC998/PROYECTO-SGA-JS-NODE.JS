"use strict";

const request = require("supertest");
const app     = require("../app");

// ─── GET /consulta-de-stock ───────────────────────────────────────────────────

describe("GET /consulta-de-stock — lectura de posiciones de stock", () => {

    test("sin parámetros debe devolver 200 y un array", async () => {
        const res = await request(app).get("/consulta-de-stock");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test("payload debe incluir campos obligatorios", async () => {
        const res = await request(app).get("/consulta-de-stock");
        expect(res.statusCode).toBe(200);
        if (res.body.length > 0) {
            const r = res.body[0];
            expect(r).toHaveProperty("articulo");
            expect(r).toHaveProperty("ubicacion");
            expect(r).toHaveProperty("lote");
            expect(r).toHaveProperty("stock");
            expect(r).toHaveProperty("libre");
            expect(r).not.toHaveProperty("exclusiva");
            expect(r).not.toHaveProperty("almacen");
        }
    });

    test("campo libre debe ser numérico (0 o 1)", async () => {
        const res = await request(app).get("/consulta-de-stock");
        expect(res.statusCode).toBe(200);
        if (res.body.length > 0) {
            res.body.forEach(function (r) {
                expect(typeof r.libre).toBe("number");
            });
        }
    });

    test("filtro articulo devuelve solo filas de ese artículo", async () => {
        const res = await request(app).get("/consulta-de-stock?articulo=0000098");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        res.body.forEach(function (r) {
            expect(r.articulo).toMatch(/0000098/i);
        });
    });

    test("solo_existencias=1 no devuelve filas con stock=0", async () => {
        const res = await request(app).get("/consulta-de-stock?solo_existencias=1");
        expect(res.statusCode).toBe(200);
        res.body.forEach(function (r) {
            expect(parseFloat(r.stock)).toBeGreaterThan(0);
        });
    });

    test("sin_existencias=1 devuelve solo filas con stock=0", async () => {
        const res = await request(app).get("/consulta-de-stock?sin_existencias=1");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        res.body.forEach(function (r) {
            expect(parseFloat(r.stock)).toBe(0);
        });
    });

    test("filtro ubicacion devuelve solo filas de esa ubicación", async () => {
        const res = await request(app).get("/consulta-de-stock?ubicacion=001");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        res.body.forEach(function (r) {
            expect(r.ubicacion).toMatch(/001/i);
        });
    });

    test("inyección SQL en artículo no debe exponer errores internos", async () => {
        const res = await request(app).get("/consulta-de-stock?articulo='; DROP TABLE X --");
        expect(res.statusCode).toBe(200);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

});
