"use strict";

const request = require("supertest");
const app     = require("../app");

// ─── GET /movimientos-por-articulo ────────────────────────────────────────────

describe("GET /movimientos-por-articulo — lectura de trazabilidad", () => {

    test("sin parámetros debe devolver 200 y un array", async () => {
        const res = await request(app).get("/movimientos-por-articulo");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test("con rango de fechas válido debe devolver 200 y un array", async () => {
        const res = await request(app).get("/movimientos-por-articulo?desde=2025-10-01&hasta=2025-12-31");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test("rango sin datos debe devolver 200 y array vacío", async () => {
        const res = await request(app).get("/movimientos-por-articulo?desde=2099-01-01&hasta=2099-01-31");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    });

    test("cada fila debe incluir el campo articulo real", async () => {
        const res = await request(app).get("/movimientos-por-articulo?desde=2025-10-01&hasta=2025-12-31");
        expect(res.statusCode).toBe(200);
        if (res.body.length > 0) {
            expect(res.body[0]).toHaveProperty("articulo");
            expect(typeof res.body[0].articulo).toBe("string");
            expect(res.body[0].articulo.length).toBeGreaterThan(0);
        }
    });

    test("ninguna fila debe tener serie PLIN", async () => {
        const res = await request(app).get("/movimientos-por-articulo?desde=2025-10-01&hasta=2025-12-31");
        expect(res.statusCode).toBe(200);
        const conPlin = res.body.filter(r => String(r.serie || '').trim() === 'PLIN');
        expect(conPlin.length).toBe(0);
    });

    test("los tipos presentes deben ser PC, RG o PP únicamente", async () => {
        const res = await request(app).get("/movimientos-por-articulo?desde=2025-10-01&hasta=2025-12-31");
        expect(res.statusCode).toBe(200);
        const tiposValidos = new Set(['PC', 'RG', 'PP']);
        res.body.forEach(r => {
            expect(tiposValidos.has(r.tipo)).toBe(true);
        });
    });

    test("filtro por movimiento=PC debe devolver solo tipo PC", async () => {
        const res = await request(app).get("/movimientos-por-articulo?movimiento=PC&desde=2025-10-01&hasta=2025-12-31");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        res.body.forEach(r => {
            expect(r.tipo).toBe("PC");
        });
    });

    test("inyección SQL en artículo no debe exponer errores internos", async () => {
        const res = await request(app).get("/movimientos-por-articulo?articulo='; DROP TABLE X --");
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    }, 15000);

    test("inyección SQL en desde no debe exponer errores internos", async () => {
        const res = await request(app).get("/movimientos-por-articulo?desde='; DROP TABLE X --&hasta=2025-12-31");
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

});
