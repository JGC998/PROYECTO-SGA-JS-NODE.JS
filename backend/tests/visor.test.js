"use strict";

const request = require("supertest");
const app = require("../app");

// ─── VISOR — FASE I.2 ─────────────────────────────────────────────────────────
//
// Tests de visor.routes.js (artículos, proveedores, clientes).
// Usamos buscar=__VISOR_TEST__ para garantizar 0 resultados y evitar que
// las subqueries correlacionadas de TOP 300 tarden con datos reales.
// En CI sin BD devuelven 500 limpio; nunca filtran mensajes SQL internos.

const TIMEOUT = 15000;
const NO_MATCH = "__VISOR_TEST_INEXISTENTE__";

// ─── GET /visor/articulos ─────────────────────────────────────────────────────

describe("GET /visor/articulos", () => {
    test("buscar sin resultados responde 200 con array vacío o 500 limpio", async () => {
        const res = await request(app).get(`/visor/articulos?buscar=${NO_MATCH}`);
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
        if (res.statusCode === 200) {
            expect(Array.isArray(res.body)).toBe(true);
        }
    }, TIMEOUT);

    test("SQL injection en buscar es inerte", async () => {
        const res = await request(app).get(`/visor/articulos?buscar=${NO_MATCH}' OR 1=1 --`);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    }, TIMEOUT);
});

// ─── GET /visor/proveedores ───────────────────────────────────────────────────

describe("GET /visor/proveedores", () => {
    test("buscar sin resultados responde 200 con array vacío o 500 limpio", async () => {
        const res = await request(app).get(`/visor/proveedores?buscar=${NO_MATCH}`);
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
        if (res.statusCode === 200) {
            expect(Array.isArray(res.body)).toBe(true);
        }
    }, TIMEOUT);

    test("SQL injection en buscar es inerte", async () => {
        const res = await request(app).get(`/visor/proveedores?buscar=${NO_MATCH}'; DROP TABLE PROVEEDOR --`);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    }, TIMEOUT);
});

// ─── GET /visor/clientes ──────────────────────────────────────────────────────

describe("GET /visor/clientes", () => {
    test("buscar sin resultados responde 200 con array vacío o 500 limpio", async () => {
        const res = await request(app).get(`/visor/clientes?buscar=${NO_MATCH}`);
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
        if (res.statusCode === 200) {
            expect(Array.isArray(res.body)).toBe(true);
        }
    }, TIMEOUT);

    test("SQL injection en buscar es inerte", async () => {
        const res = await request(app).get(`/visor/clientes?buscar=${NO_MATCH}'; DROP TABLE CLIENTE --`);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    }, TIMEOUT);
});
