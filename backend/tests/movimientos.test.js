const request = require("supertest");
const app = require("../app");

// ─── VALIDACIONES DE INPUT: /entrada, /salida, /traspaso ─────────────────────
//
// Estos tests verifican que las validaciones añadidas en FASE 6 funcionan.
// Ninguno escribe datos reales en la BD: todos son rechazados antes del SQL.

// ─── POST /entrada ────────────────────────────────────────────────────────────

describe("POST /entrada — validaciones de input (FASE 6)", () => {
  test("debe devolver 400 cuando cant es negativa", async () => {
    const res = await request(app)
      .post("/entrada")
      .send({ cod: "TEST", ubi: "UBI1", lot: "LOT1", cant: -5 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("debe devolver 400 cuando cant es 0", async () => {
    const res = await request(app)
      .post("/entrada")
      .send({ cod: "TEST", ubi: "UBI1", lot: "LOT1", cant: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("debe devolver 400 cuando cant es texto no numérico", async () => {
    const res = await request(app)
      .post("/entrada")
      .send({ cod: "TEST", ubi: "UBI1", lot: "LOT1", cant: "abc" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("debe devolver 400 cuando falta cod", async () => {
    const res = await request(app)
      .post("/entrada")
      .send({ ubi: "UBI1", lot: "LOT1", cant: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("no debe exponer errores SQL internos con body vacío", async () => {
    const res = await request(app).post("/entrada").send({});
    expect(res.statusCode).toBe(400);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
  });
});

// ─── POST /salida ─────────────────────────────────────────────────────────────

describe("POST /salida — validaciones de input (FASE 6)", () => {
  test("debe devolver 400 cuando cant es negativa", async () => {
    const res = await request(app)
      .post("/salida")
      .send({ cod: "TEST", ubi: "UBI1", lot: "LOT1", cant: -5 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("debe devolver 400 cuando cant es 0", async () => {
    const res = await request(app)
      .post("/salida")
      .send({ cod: "TEST", ubi: "UBI1", lot: "LOT1", cant: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("debe devolver 400 cuando falta ubi", async () => {
    const res = await request(app)
      .post("/salida")
      .send({ cod: "TEST", lot: "LOT1", cant: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ─── POST /traspaso ───────────────────────────────────────────────────────────

describe("POST /traspaso — validaciones de input (FASE 6)", () => {
  test("debe devolver 400 cuando cant es negativa", async () => {
    const res = await request(app)
      .post("/traspaso")
      .send({ cod: "TEST", ubiOri: "UBI1", ubiDes: "UBI2", lot: "LOT1", cant: -5 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("debe devolver 400 cuando cant es 0", async () => {
    const res = await request(app)
      .post("/traspaso")
      .send({ cod: "TEST", ubiOri: "UBI1", ubiDes: "UBI2", lot: "LOT1", cant: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("debe devolver 400 cuando falta ubiDes", async () => {
    const res = await request(app)
      .post("/traspaso")
      .send({ cod: "TEST", ubiOri: "UBI1", lot: "LOT1", cant: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
