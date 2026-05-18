"use strict";

const request = require("supertest");
const app = require("../app");

// ─── ESCRITURAS — FASE I.2 ────────────────────────────────────────────────────
//
// Tests de escrituras.routes.js: POST /articulos, /articulos-sin-reposicion,
// /minimos-maximos, /generar-ubicaciones.
// Los endpoints POST con validación responden antes de tocar BD.
// Los que no tienen validación intentan BD → 500 limpio en CI.

// ─── POST /articulos — validación ────────────────────────────────────────────

describe("POST /articulos — validación de campos requeridos", () => {
    test("sin cod devuelve 400", async () => {
        const res = await request(app).post("/articulos").send({ nom: "Test" });
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty("error");
    });

    test("sin nom devuelve 400", async () => {
        const res = await request(app).post("/articulos").send({ cod: "ART1" });
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty("error");
    });

    test("body vacío devuelve 400", async () => {
        const res = await request(app).post("/articulos").send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty("error");
    });

    test("con cod y nom intenta upsert; sin BD devuelve 500 limpio", async () => {
        const res = await request(app).post("/articulos").send({ cod: "ART_TEST", nom: "Artículo Test" });
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── POST /articulos-sin-reposicion — validación ──────────────────────────────

describe("POST /articulos-sin-reposicion — body sin articulo es ignorado", () => {
    test("fila sin articulo es ignorada, responde ok:true sin tocar BD", async () => {
        const res = await request(app).post("/articulos-sin-reposicion").send({ nombre: "sin campo articulo" });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("ok", true);
    });

    test("array vacío responde ok:true sin tocar BD", async () => {
        const res = await request(app).post("/articulos-sin-reposicion").send([]);
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("ok", true);
    });

    test("con articulo presente intenta insert; sin BD devuelve 500 limpio", async () => {
        const res = await request(app).post("/articulos-sin-reposicion").send({ articulo: "ART_TEST" });
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });
});

// ─── POST /minimos-maximos — validación ───────────────────────────────────────

describe("POST /minimos-maximos — body sin articulo es ignorado", () => {
    test("fila sin articulo es ignorada, responde ok:true sin tocar BD", async () => {
        const res = await request(app).post("/minimos-maximos").send({ stock_minimo: 5, stock_maximo: 10 });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("ok", true);
    });

    test("array vacío responde ok:true sin tocar BD", async () => {
        const res = await request(app).post("/minimos-maximos").send([]);
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("ok", true);
    });
});

// ─── POST /generar-ubicaciones — validación (complementa dynamic-sql.test.js) ─

describe("POST /generar-ubicaciones — validaciones adicionales", () => {
    test("sin body usa defaults y genera 1 ubicación; sin BD devuelve 500 limpio", async () => {
        const res = await request(app).post("/generar-ubicaciones").send({});
        expect([200, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

    test("rango que supera 1000 devuelve 400", async () => {
        const res = await request(app).post("/generar-ubicaciones").send({
            desde_pasillo: 1, hasta_pasillo: 50,
            desde_lateral: 11, hasta_lateral: 11,
            desde_x: 1, hasta_x: 10,
            desde_y: 1, hasta_y: 10
        });
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty("error");
    });
});
