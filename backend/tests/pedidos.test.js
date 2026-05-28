"use strict";

const request = require("supertest");
const app     = require("../app");

// ─── GET /situacion-pedidos-venta ─────────────────────────────────────────────

describe("GET /situacion-pedidos-venta — situación de pedidos de venta", () => {

    test("sin parámetros debe devolver 200 y un array", async () => {
        const res = await request(app).get("/situacion-pedidos-venta");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    }, 15000);

    test("con rango de fechas explícito debe devolver 200 y un array", async () => {
        const res = await request(app).get("/situacion-pedidos-venta?desde=2025-01-01&hasta=2025-12-31");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    }, 15000);

    test("cliente inexistente debe devolver 200 y array vacío", async () => {
        const res = await request(app).get("/situacion-pedidos-venta?cliente=__CLIENTE_INEXISTENTE_TEST__");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    }, 15000);

    test("articulo inexistente debe devolver 200 y array vacío", async () => {
        const res = await request(app).get("/situacion-pedidos-venta?articulo=__ARTICULO_INEXISTENTE_TEST__");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    }, 15000);

    test("cada fila debe tener las propiedades que consume el frontend", async () => {
        const res = await request(app).get("/situacion-pedidos-venta?desde=2025-01-01&hasta=2025-12-31");
        expect(res.statusCode).toBe(200);
        if (res.body.length > 0) {
            const fila = res.body[0];
            const props = ["albaran", "serie", "cliente", "nombre_cliente",
                           "articulo", "nombre_articulo", "cantidad",
                           "ubicacion", "fecha", "tipo"];
            props.forEach(p => expect(fila).toHaveProperty(p));
        }
    }, 15000);

    test("no debe exponer mensajes internos de SQL Server", async () => {
        const res = await request(app).get("/situacion-pedidos-venta?cliente=' OR 1=1 --");
        expect(res.statusCode).toBe(200);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    }, 15000);

    test("no debe devolver más de 300 filas (TOP 300 en SQL)", async () => {
        const res = await request(app).get("/situacion-pedidos-venta?desde=2000-01-01&hasta=2099-12-31");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeLessThanOrEqual(300);
    }, 15000);

});
