const request = require("supertest");
const app = require("../app");

// ─── HARDENING ENDPOINTS STOCK (FASE 7) ──────────────────────────────────────
//
// Verifica que GET /stock/:cod y GET /datos/:tabla son robustos frente a
// inputs inválidos, payloads absurdos e intentos de SQL injection.

// ─── GET /stock/:cod ──────────────────────────────────────────────────────────

describe("GET /stock/:cod — hardening (FASE 7)", () => {
  test("artículo inexistente debe devolver 200 con array vacío", async () => {
    const res = await request(app).get("/stock/__ARTICULO_INEXISTENTE_TEST__");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  test("payload SQL clásico debe ser inerte (query parametrizada)", async () => {
    // "' OR 1=1 --" URL-encoded — la query parametrizada lo trata como valor literal
    const res = await request(app).get("/stock/%27%20OR%201%3D1%20--");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  test("cod extremadamente largo debe devolver 400", async () => {
    const codLargo = "A".repeat(100);
    const res = await request(app).get(`/stock/${codLargo}`);
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("no debe exponer errores SQL internos", async () => {
    const res = await request(app).get("/stock/__TEST__");
    // En cualquier caso (200 o 400), el body no debe contener texto SQL
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
  });
});

// ─── GET /datos/:tabla ────────────────────────────────────────────────────────

describe("GET /datos/:tabla — whitelist y hardening (FASE 7)", () => {
  test("tabla con SQL injection debe devolver 400 (bloqueada por regex)", async () => {
    // "ARTICULO; DROP TABLE ARTICULO" URL-encoded
    const res = await request(app)
      .get("/datos/ARTICULO%3B%20DROP%20TABLE%20ARTICULO");
    expect(res.statusCode).toBe(400);
  });

  test("tabla válida pero no permitida debe devolver 403 (whitelist FASE 9)", async () => {
    // TABLA_INEXISTENTE_TEST no está en TABLAS_PERMITIDAS → 403 antes de tocar BD
    const res = await request(app).get("/datos/TABLA_INEXISTENTE_TEST");
    expect(res.statusCode).toBe(403);
  });

  test("tabla con caracteres especiales debe devolver 400", async () => {
    // "ARTICULO--" contiene guión, no pasa la regex
    const res = await request(app).get("/datos/ARTICULO--");
    expect(res.statusCode).toBe(400);
  });

  test("no debe exponer errores SQL internos en caso de fallo", async () => {
    const res = await request(app).get("/datos/TABLA_INEXISTENTE_TEST");
    // 403 — no debe contener mensajes SQL de SQL Server
    const bodyStr = String(res.text || JSON.stringify(res.body));
    expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
  });
});
