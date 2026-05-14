"use strict";

const request = require("supertest");
const app     = require("../app");

// ─── POST /picking/confirmar ──────────────────────────────────────────────────

describe("POST /picking/confirmar — validación de payload", () => {

    test("sin body debe devolver 400", async () => {
        const res = await request(app).post("/picking/confirmar").send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty("error");
    });

    test("albaran como texto debe devolver 400", async () => {
        const res = await request(app).post("/picking/confirmar").send({
            albaran: "texto", serie: "E", articulo: "ART001", ubicacion: "UBI01"
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/albaran/i);
    });

    test("albaran negativo debe devolver 400", async () => {
        const res = await request(app).post("/picking/confirmar").send({
            albaran: -1, serie: "E", articulo: "ART001", ubicacion: "UBI01"
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/albaran/i);
    });

    test("albaran cero debe devolver 400", async () => {
        const res = await request(app).post("/picking/confirmar").send({
            albaran: 0, serie: "E", articulo: "ART001", ubicacion: "UBI01"
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/albaran/i);
    });

    test("albaran decimal debe devolver 400", async () => {
        const res = await request(app).post("/picking/confirmar").send({
            albaran: 12345.6, serie: "E", articulo: "ART001", ubicacion: "UBI01"
        });
        expect(res.statusCode).toBe(400);
    });

    test("serie vacía debe devolver 400", async () => {
        const res = await request(app).post("/picking/confirmar").send({
            albaran: 1, serie: "", articulo: "ART001", ubicacion: "UBI01"
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/serie/i);
    });

    test("serie mayor de 10 caracteres debe devolver 400", async () => {
        const res = await request(app).post("/picking/confirmar").send({
            albaran: 1, serie: "SERIELARGA1", articulo: "ART001", ubicacion: "UBI01"
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/serie/i);
    });

    test("articulo mayor de 30 caracteres debe devolver 400", async () => {
        const res = await request(app).post("/picking/confirmar").send({
            albaran: 1, serie: "E", articulo: "A".repeat(31), ubicacion: "UBI01"
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/articulo/i);
    });

    test("ubicacion mayor de 20 caracteres debe devolver 400", async () => {
        const res = await request(app).post("/picking/confirmar").send({
            albaran: 1, serie: "E", articulo: "ART001", ubicacion: "U".repeat(21)
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/ubicacion/i);
    });

    test("lote mayor de 30 caracteres debe devolver 400", async () => {
        const res = await request(app).post("/picking/confirmar").send({
            albaran: 1, serie: "E", articulo: "ART001", ubicacion: "UBI01",
            lote: "L".repeat(31)
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/lote/i);
    });

    test("operario mayor de 50 caracteres debe devolver 400", async () => {
        const res = await request(app).post("/picking/confirmar").send({
            albaran: 1, serie: "E", articulo: "ART001", ubicacion: "UBI01",
            operario: "O".repeat(51)
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/operario/i);
    });

    test("no debe exponer mensajes internos de SQL Server", async () => {
        const res = await request(app).post("/picking/confirmar").send({
            albaran: "'; DROP TABLE SGA_PICKING_CONFIRMACION; --",
            serie: "E", articulo: "ART001", ubicacion: "UBI01"
        });
        // El payload SQL en albaran es inválido (no es entero positivo) → 400
        expect(res.statusCode).toBe(400);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

    test("línea inexistente en ALBARANCS debe devolver 404", async () => {
        const res = await request(app).post("/picking/confirmar").send({
            albaran   : 99999999,
            serie     : "Z",
            articulo  : "__FAKE_PICKING_TEST__",
            ubicacion : "__FAKE_UBI__"
        });
        expect(res.statusCode).toBe(404);
        expect(res.body).toHaveProperty("error");
    });

});

// ─── POST /picking/desconfirmar ───────────────────────────────────────────────

describe("POST /picking/desconfirmar — validación de payload", () => {

    test("sin body debe devolver 400", async () => {
        const res = await request(app).post("/picking/desconfirmar").send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty("error");
    });

    test("albaran como texto debe devolver 400", async () => {
        const res = await request(app).post("/picking/desconfirmar").send({
            albaran: "novalido", serie: "E", articulo: "ART001", ubicacion: "UBI01"
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/albaran/i);
    });

    test("albaran negativo debe devolver 400", async () => {
        const res = await request(app).post("/picking/desconfirmar").send({
            albaran: -5, serie: "E", articulo: "ART001", ubicacion: "UBI01"
        });
        expect(res.statusCode).toBe(400);
    });

    test("ubicacion mayor de 20 caracteres debe devolver 400", async () => {
        const res = await request(app).post("/picking/desconfirmar").send({
            albaran: 1, serie: "E", articulo: "ART001", ubicacion: "U".repeat(21)
        });
        expect(res.statusCode).toBe(400);
    });

    test("desconfirmar línea inexistente debe devolver 200 ok:true (idempotente)", async () => {
        const res = await request(app).post("/picking/desconfirmar").send({
            albaran   : 99999999,
            serie     : "Z",
            articulo  : "__FAKE_PICKING_TEST__",
            ubicacion : "__FAKE_UBI__"
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("ok", true);
    });

    test("no debe exponer mensajes internos de SQL Server", async () => {
        const res = await request(app).post("/picking/desconfirmar").send({
            albaran: "'; DROP TABLE X --",
            serie: "E", articulo: "ART001", ubicacion: "UBI01"
        });
        expect(res.statusCode).toBe(400);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

});

// ─── GET /picking ─────────────────────────────────────────────────────────────

describe("GET /picking — listado de tareas de preparación", () => {

    test("sin parámetros debe devolver 200 y un array", async () => {
        const res = await request(app).get("/picking");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test("con desde y hasta explícitos debe devolver 200 y un array", async () => {
        const res = await request(app).get("/picking?desde=2020-01-01&hasta=2026-12-31");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test("con parámetro buscar debe devolver 200 y un array", async () => {
        const res = await request(app).get("/picking?buscar=__inexistente__");
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    });

    test("cada fila debe tener las propiedades que consume el frontend", async () => {
        const res = await request(app).get("/picking?desde=2020-01-01&hasta=2026-12-31");
        expect(res.statusCode).toBe(200);
        if (res.body.length > 0) {
            const fila = res.body[0];
            const props = [
                "albaran", "serie", "cliente", "nombre_cliente", "fecha",
                "picking", "articulo", "nombre_articulo", "cantidad_pedida",
                "ubicacion", "stock_ubi", "stock_total",
                "confirmado_sga", "fecha_conf_sga", "operario_sga"
            ];
            props.forEach(p => expect(fila).toHaveProperty(p));
        }
    });

    test("confirmado_sga debe ser 0 o 1 (no null)", async () => {
        const res = await request(app).get("/picking?desde=2020-01-01&hasta=2026-12-31");
        expect(res.statusCode).toBe(200);
        res.body.forEach(fila => {
            expect([0, 1]).toContain(fila.confirmado_sga);
        });
    });

    test("no debe exponer mensajes internos de SQL Server", async () => {
        const res = await request(app).get("/picking?buscar=' OR 1=1 --");
        expect(res.statusCode).toBe(200);
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    });

});
