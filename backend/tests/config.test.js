"use strict";

const request = require("supertest");
const app = require("../app");

// ─── CONFIG / SISTEMA — FASE I.2 ──────────────────────────────────────────────
//
// Tests de config.routes.js (almacenes, subfamilias, terminales-pda, usuarios,
// configuracion-empresa). Delega en config.service.js → SQL Server.
// En CI sin BD los GET devuelven 500 limpio; los POST con validación responden
// 400 antes de tocar BD. POST /configuracion-empresa es stub 501.

// ─── GET /almacenes ───────────────────────────────────────────────────────────

describe("GET /almacenes", () => {
    test("responde sin exponer errores SQL internos", async () => {
        const res = await request(app).get("/almacenes");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── POST /almacenes ──────────────────────────────────────────────────────────

describe("POST /almacenes", () => {
    test("con cod y nom intenta upsert; sin BD devuelve 500 limpio", async () => {
        const res = await request(app).post("/almacenes").send({ cod: "ALM1", nom: "Almacén Test" });
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── GET /subfamilias ─────────────────────────────────────────────────────────

describe("GET /subfamilias", () => {
    test("responde sin exponer errores SQL internos", async () => {
        const res = await request(app).get("/subfamilias");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── GET /terminales-pda ──────────────────────────────────────────────────────

describe("GET /terminales-pda", () => {
    test("responde sin exponer errores SQL internos", async () => {
        const res = await request(app).get("/terminales-pda");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── GET /usuarios ────────────────────────────────────────────────────────────

describe("GET /usuarios", () => {
    test("responde sin exponer errores SQL internos", async () => {
        const res = await request(app).get("/usuarios");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

    test("acepta parámetro buscar sin romper", async () => {
        const res = await request(app).get("/usuarios?buscar=admin");
        expect([200, 500]).toContain(res.statusCode);
    });
});

// ─── POST /usuarios — validación ──────────────────────────────────────────────

describe("POST /usuarios — validación de campos requeridos", () => {
    test("sin codigo devuelve 400", async () => {
        const res = await request(app).post("/usuarios").send({ nombre: "Test" });
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty("error");
    });

    test("sin nombre devuelve 400", async () => {
        const res = await request(app).post("/usuarios").send({ codigo: "USR1" });
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty("error");
    });

    test("body vacío devuelve 400", async () => {
        const res = await request(app).post("/usuarios").send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty("error");
    });

    test("con codigo y nombre intenta upsert; sin BD devuelve 500 limpio", async () => {
        const res = await request(app).post("/usuarios").send({ codigo: "USR1", nombre: "Usuario Test" });
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── GET /configuracion-empresa ───────────────────────────────────────────────

describe("GET /configuracion-empresa", () => {
    test("responde sin exponer errores SQL internos", async () => {
        const res = await request(app).get("/configuracion-empresa");
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── POST /configuracion-empresa — stub 501 (complementa stubs.test.js) ───────

describe("POST /configuracion-empresa — stub 501", () => {
    test("devuelve 501 con pendiente:true (ya cubierto en stubs.test.js — regresión)", async () => {
        const res = await request(app).post("/configuracion-empresa").send({ nombre: "Test" });
        expect(res.statusCode).toBe(501);
        expect(res.body).toHaveProperty("pendiente", true);
    });
});
