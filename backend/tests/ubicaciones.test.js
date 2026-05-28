"use strict";

const request = require("supertest");
const app = require("../app");

// ─── UBICACIONES — FASE I.2 ───────────────────────────────────────────────────
//
// Tests de ubicaciones.routes.js.
// GET siempre toca BD → en CI devolverá 500 limpio si no hay conexión.
// POST con body sin 'cod' es el único campo requerido implícito.

// ─── GET /ubicaciones ─────────────────────────────────────────────────────────

describe("GET /ubicaciones", () => {
    test("responde sin exponer errores SQL internos", async () => {
        const res = await request(app).get("/ubicaciones");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

    test("acepta parámetro buscar sin romper", async () => {
        const res = await request(app).get("/ubicaciones?buscar=001");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

    test("acepta filtro almacen sin romper", async () => {
        const res = await request(app).get("/ubicaciones?almacen=ALM1");
        expect([200, 500]).toContain(res.statusCode);
    });

    test("parámetros extraños no devuelven 400 ni 403", async () => {
        const res = await request(app).get("/ubicaciones?foo=bar");
        expect(res.statusCode).not.toBe(400);
        expect(res.statusCode).not.toBe(403);
    });

    test("SQL injection en buscar es inerte (query parametrizada)", async () => {
        const res = await request(app).get("/ubicaciones?buscar=' OR 1=1 --");
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── POST /ubicaciones — validación ──────────────────────────────────────────

describe("POST /ubicaciones — body con cod presente", () => {
    test("body con cod intenta upsert; sin BD devuelve 500 limpio", async () => {
        const res = await request(app).post("/ubicaciones").send({ cod: "001001001001" });
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

    test("array de ubicaciones intenta upsert; sin BD devuelve 500 limpio", async () => {
        const res = await request(app).post("/ubicaciones").send([
            { cod: "001001001001", alm: "ALM1" },
            { cod: "001001001002", alm: "ALM1" }
        ]);
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── POST /generar-ubicaciones — validación (complementa dynamic-sql.test.js) ─

describe("POST /generar-ubicaciones — rango válido pequeño", () => {
    test("rango de 1 ubicación intenta insert; sin BD devuelve 500 limpio", async () => {
        const res = await request(app).post("/generar-ubicaciones").send({
            desde_pasillo: 1, hasta_pasillo: 1,
            desde_lateral: 11, hasta_lateral: 11,
            desde_x: 1, hasta_x: 1,
            desde_y: 1, hasta_y: 1
        });
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});
