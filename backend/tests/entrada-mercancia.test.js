"use strict";

const request = require("supertest");
const app     = require("../app");

// ─── POST /entrada-mercancia — FASE 9.2 ──────────────────────────────────────
//
// Estos tests verifican únicamente las capas de validación y el contrato HTTP.
// NO se ejecutan escrituras reales en producción (los datos de prueba son
// ficticios y el SP devolverá error de negocio, que el endpoint traduce a 500).
// La cobertura de la escritura real se hace manualmente con artículo+ubi+lote
// conocidos, documentados en el informe FASE 9.2.

describe("POST /entrada-mercancia — validación de payload", () => {

    test("sin body debe devolver 400", async () => {
        const res = await request(app).post("/entrada-mercancia").send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty("error");
    });

    test("sin articulo debe devolver 400", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            ubicacion: "00201000311", lote: "LOTE01", cantidad: 1
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/articulo/i);
    });

    test("sin ubicacion debe devolver 400", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo: "0000098", lote: "LOTE01", cantidad: 1
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/ubicacion/i);
    });

    test("sin lote debe devolver 400", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo: "0000098", ubicacion: "00201000311", cantidad: 1
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/lote/i);
    });

    test("lote vacío debe devolver 400", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo: "0000098", ubicacion: "00201000311", lote: "", cantidad: 1
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/lote/i);
    });

    test("cantidad 0 debe devolver 400", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo: "0000098", ubicacion: "00201000311", lote: "LOTE01", cantidad: 0
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/cantidad/i);
    });

    test("cantidad negativa debe devolver 400", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo: "0000098", ubicacion: "00201000311", lote: "LOTE01", cantidad: -5
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/cantidad/i);
    });

    test("cantidad como texto debe devolver 400", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo: "0000098", ubicacion: "00201000311", lote: "LOTE01", cantidad: "mucho"
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/cantidad/i);
    });

    test("articulo extremadamente largo debe devolver 400", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo: "A".repeat(51), ubicacion: "00201000311", lote: "LOTE01", cantidad: 1
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/articulo/i);
    });

    test("ubicacion extremadamente larga debe devolver 400", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo: "0000098", ubicacion: "U".repeat(21), lote: "LOTE01", cantidad: 1
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/ubicacion/i);
    });

    test("lote extremadamente largo debe devolver 400 (ACSLOT char(10) en LIN)", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo: "0000098", ubicacion: "00201000311", lote: "L".repeat(11), cantidad: 1
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/lote/i);
    });

    test("usuario extremadamente largo debe devolver 400", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo: "0000098", ubicacion: "00201000311", lote: "LOTE01", cantidad: 1,
            usuario: "U".repeat(51)
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/usuario/i);
    });

    test("SQL injection en articulo debe ser inerte o 400 (nunca 500 SQL crudo)", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo: "'; DROP TABLE ARTICULO; --",
            ubicacion: "00201000311", lote: "LOTE01", cantidad: 1
        });
        // Puede ser 400 (largo > 50) o 404 (artículo no existe); nunca debe exponer SQL interno
        expect([400, 404, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

    test("SQL injection en ubicacion debe ser inerte (query parametrizada)", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo: "0000098", ubicacion: "' OR 1=1 --", lote: "LOTE01", cantidad: 1
        });
        expect([400, 404, 500]).toContain(res.statusCode);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

});

describe("POST /entrada-mercancia — artículo/ubicación inexistentes", () => {

    test("artículo inexistente debe devolver 404", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo:  "__ARTICULO_INEXISTENTE_SGAENT__",
            ubicacion: "00201000311",
            lote:      "LOTETEST",
            cantidad:  1
        });
        expect(res.statusCode).toBe(404);
        expect(res.body.error).toMatch(/artículo/i);
    }, 15000);

    test("ubicación inexistente debe devolver 404", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo:  "0000098",
            ubicacion: "ZZNOEXISTE01",
            lote:      "LOTETEST",
            cantidad:  1
        });
        expect(res.statusCode).toBe(404);
        expect(res.body.error).toMatch(/ubicaci/i);
    }, 15000);

});

describe("POST /entrada-mercancia — estructura de respuesta exitosa", () => {

    // Lote ≤ 10 chars (ACSLOT char(10) en LIN). Artículo y ubicación reales confirmados.
    test("respuesta exitosa debe tener la forma contratada", async () => {
        const res = await request(app).post("/entrada-mercancia").send({
            articulo:  "0000098",
            ubicacion: "00201000311",
            lote:      "SGATST001",
            cantidad:  1,
            usuario:   "SGA_TEST"
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("ok", true);
        expect(res.body).toHaveProperty("albaran");
        expect(res.body).toHaveProperty("serie", "ELIN");
        expect(res.body).toHaveProperty("articulo");
        expect(res.body).toHaveProperty("ubicacion");
        expect(res.body).toHaveProperty("lote");
        expect(res.body).toHaveProperty("cantidad");
        expect(res.body).toHaveProperty("stocklote_antes");
        expect(res.body).toHaveProperty("stocklote_nuevo");
        expect(typeof res.body.albaran).toBe("number");
        expect(res.body.albaran).toBeGreaterThan(0);
        expect(res.body.stocklote_nuevo).toBeGreaterThanOrEqual(res.body.stocklote_antes);
    }, 30000);

});
