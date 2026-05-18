"use strict";

const request = require("supertest");
const app = require("../app");

// ─── LOTES — FASE I.2 ────────────────────────────────────────────────────────
//
// Tests de los endpoints de lotes (lotes.routes.js).
// En CI no hay BD: los GET devuelven 500 limpio o 200 si hay BD disponible.
// Los POST sin body obligatorio se validan antes de tocar la BD.

// ─── GET /lote-minimo ─────────────────────────────────────────────────────────

describe("GET /lote-minimo", () => {
    test("responde sin exponer errores SQL internos", async () => {
        const res = await request(app).get("/lote-minimo");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

    test("acepta parámetro cliente sin romper", async () => {
        const res = await request(app).get("/lote-minimo?cliente=TEST");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

    test("parámetros extraños no devuelven 400 ni 403", async () => {
        const res = await request(app).get("/lote-minimo?foo=bar&baz=123");
        expect(res.statusCode).not.toBe(400);
        expect(res.statusCode).not.toBe(403);
    });

    test("SQL injection en parámetro es inerte (query parametrizada)", async () => {
        const res = await request(app).get("/lote-minimo?cliente=' OR 1=1 --");
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── GET /lote-exclusivo ──────────────────────────────────────────────────────

describe("GET /lote-exclusivo", () => {
    test("responde sin exponer errores SQL internos", async () => {
        const res = await request(app).get("/lote-exclusivo");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

    test("acepta parámetros cliente y articulo combinados", async () => {
        const res = await request(app).get("/lote-exclusivo?cliente=CLI1&articulo=ART1");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

    test("SQL injection en articulo es inerte", async () => {
        const res = await request(app).get("/lote-exclusivo?articulo='; DROP TABLE ARTICULOEXCLOTCLI --");
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── GET /lote-no-utilizado ───────────────────────────────────────────────────

describe("GET /lote-no-utilizado", () => {
    test("responde sin exponer errores SQL internos", async () => {
        const res = await request(app).get("/lote-no-utilizado");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

    test("acepta filtros sin romper", async () => {
        const res = await request(app).get("/lote-no-utilizado?cliente=X&articulo=Y");
        expect([200, 500]).toContain(res.statusCode);
    });
});

// ─── GET /lote-cuarentena ─────────────────────────────────────────────────────

describe("GET /lote-cuarentena", () => {
    test("responde sin exponer errores SQL internos", async () => {
        const res = await request(app).get("/lote-cuarentena");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

    test("acepta parámetro articulo sin romper", async () => {
        const res = await request(app).get("/lote-cuarentena?articulo=TEST");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── GET /observaciones-articulo-lote ────────────────────────────────────────

describe("GET /observaciones-articulo-lote", () => {
    test("responde sin exponer errores SQL internos", async () => {
        const res = await request(app).get("/observaciones-articulo-lote");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── POST /lote-minimo — validación ──────────────────────────────────────────

describe("POST /lote-minimo — body vacío o sin cliente", () => {
    test("body vacío no produce 500 de BD (fila sin cliente es ignorada)", async () => {
        const res = await request(app).post("/lote-minimo").send({});
        // El handler itera rows y hace 'if (!r.cliente) continue' — devuelve ok:true sin tocar BD
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("ok", true);
    });

    test("array vacío responde ok sin tocar BD", async () => {
        const res = await request(app).post("/lote-minimo").send([]);
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("ok", true);
    });
});

// ─── POST /lote-exclusivo — validación ───────────────────────────────────────

describe("POST /lote-exclusivo — body sin campos requeridos", () => {
    test("fila sin cliente ni articulo es ignorada, responde ok", async () => {
        const res = await request(app).post("/lote-exclusivo").send({ lote: "LOT1" });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("ok", true);
    });
});
