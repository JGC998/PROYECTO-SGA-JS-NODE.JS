const request = require("supertest");
const app = require("../app");

// ─── SQL DINÁMICO Y WHITELIST (FASE 9) ───────────────────────────────────────
//
// Verifica que los endpoints que construyen SQL dinámico están correctamente
// controlados mediante whitelist, validación de rango y sanitización de errores.

// ─── GET /datos/:tabla — whitelist real ──────────────────────────────────────

describe("GET /datos/:tabla — whitelist (FASE 9)", () => {
  test("tabla en whitelist (ARTICULO) debe ser accesible", async () => {
    const res = await request(app).get("/datos/ARTICULO");
    // 200 si BD disponible; en todo caso no debe ser 400 ni 403
    expect(res.statusCode).not.toBe(400);
    expect(res.statusCode).not.toBe(403);
  });

  test("tabla en whitelist en minúsculas (articulo) debe ser accesible", async () => {
    // El handler normaliza a uppercase antes de comparar con la whitelist
    const res = await request(app).get("/datos/articulo");
    expect(res.statusCode).not.toBe(403);
  });

  test("tabla fuera de whitelist debe devolver 403", async () => {
    const res = await request(app).get("/datos/USUARIO");
    expect(res.statusCode).toBe(403);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
  });

  test("tabla CONFIGURACION fuera de whitelist debe devolver 403", async () => {
    const res = await request(app).get("/datos/CONFIGURACION");
    expect(res.statusCode).toBe(403);
  });

  test("SQL injection en nombre de tabla debe devolver 400 (regex)", async () => {
    // "ARTICULO; DROP TABLE ARTICULO" — la regex bloquea antes que la whitelist
    const res = await request(app)
      .get("/datos/ARTICULO%3B%20DROP%20TABLE%20ARTICULO");
    expect(res.statusCode).toBe(400);
  });

  test("tabla con guión no debe llegar a la BD", async () => {
    const res = await request(app).get("/datos/ARTICULO--comentario");
    expect(res.statusCode).toBe(400);
  });

  test("no debe exponer errores SQL internos", async () => {
    const res = await request(app).get("/datos/TABLA_NO_PERMITIDA");
    const bodyStr = String(res.text || JSON.stringify(res.body));
    expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
  });
});

// ─── GET /schema — información sensible ──────────────────────────────────────

describe("GET /schema — uso normal (FASE 9)", () => {
  test("debe responder sin error del servidor", async () => {
    const res = await request(app).get("/schema");
    // El endpoint no tiene input de usuario — debe funcionar o fallar con 500 limpio
    expect(res.statusCode).not.toBe(400);
    const bodyStr = JSON.stringify(res.body);
    // No debe exponer errores internos SQL en caso de fallo
    if (res.statusCode === 500) {
      expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
    }
  });
});

// ─── POST /generar-ubicaciones — validación de rango ─────────────────────────

describe("POST /generar-ubicaciones — validación de rango (FASE 9)", () => {
  test("debe devolver 400 cuando el rango supera el límite de 1000 ubicaciones", async () => {
    const res = await request(app)
      .post("/generar-ubicaciones")
      .send({
        desde_pasillo: 1,
        hasta_pasillo: 100,
        desde_lateral: 1,
        hasta_lateral: 100,
        desde_x: 1,
        hasta_x: 1,
        desde_y: 1,
        hasta_y: 1
      });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("debe devolver 400 cuando los rangos son texto no numérico", async () => {
    const res = await request(app)
      .post("/generar-ubicaciones")
      .send({ desde_pasillo: "abc", hasta_pasillo: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("no debe exponer errores SQL internos", async () => {
    const res = await request(app)
      .post("/generar-ubicaciones")
      .send({ desde_pasillo: "abc" });
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
  });
});
