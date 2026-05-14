"use strict";

const request = require("supertest");
const app     = require("../app");

// ─── GET /expediciones ────────────────────────────────────────────────────────

describe("GET /expediciones — listado de expediciones de cliente", () => {

    test("sin parámetros debe devolver 200 y un array", async () => {
        const res = await request(app).get("/expediciones");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test("con desde y hasta explícitos debe devolver 200 y un array", async () => {
        const res = await request(app).get("/expediciones?desde=2025-10-01&hasta=2025-12-31");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    }, 30000);

    test("rango oct-dic 2025 debe devolver filas reales", async () => {
        const res = await request(app).get("/expediciones?desde=2025-10-01&hasta=2025-12-31");
        expect(res.statusCode).toBe(200);
        expect(res.body.length).toBeGreaterThan(0);
    }, 30000);

    test("cada fila debe tener las propiedades que consume el frontend", async () => {
        const res = await request(app).get("/expediciones?desde=2025-10-01&hasta=2025-12-31");
        expect(res.statusCode).toBe(200);
        if (res.body.length > 0) {
            const fila = res.body[0];
            const props = [
                "albaran", "serie", "cliente", "nombre_cliente",
                "fecha", "picking", "tipo",
                "articulo", "nombre_articulo", "cantidad",
                "ubicacion", "lote"
            ];
            props.forEach(p => expect(fila).toHaveProperty(p));
        }
    }, 30000);

    test("no debe devolver filas con ACSSER=PLIN (hojas internas de picking conjunto)", async () => {
        const res = await request(app).get("/expediciones?desde=2025-10-01&hasta=2025-12-31");
        expect(res.statusCode).toBe(200);
        res.body.forEach(fila => {
            const serie = (fila.serie || '').trim().toUpperCase();
            expect(serie).not.toBe('PLIN');
        });
    }, 30000);

    test("buscar por serie 02025 debe devolver 200 y un array", async () => {
        const res = await request(app).get("/expediciones?desde=2025-10-01&hasta=2025-12-31&buscar=02025");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    }, 30000);

    test("buscar por serie POR debe devolver 200 y un array", async () => {
        const res = await request(app).get("/expediciones?desde=2025-10-01&hasta=2025-12-31&buscar=POR");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    }, 30000);

    test("buscar por cliente inexistente debe devolver array vacío", async () => {
        const res = await request(app).get("/expediciones?buscar=__cliente_inexistente_xyz__");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    });

    test("no debe exponer mensajes internos de SQL Server", async () => {
        const res = await request(app).get("/expediciones?buscar=' OR 1=1 --");
        expect(res.statusCode).toBe(200);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

});
