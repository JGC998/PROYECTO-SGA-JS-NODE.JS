const request = require("supertest");
const app = require("../app");

// ─── NÚCLEO CRÍTICO — FASE 23 ─────────────────────────────────────────────────
//
// Red de seguridad para POST /entrada, /salida y /traspaso antes de extraerlos.
// Todos estos tests operan sobre datos inexistentes o inputs inválidos:
// ninguno escribe ni modifica stock real en la BD.
//
// Clasificación:
//   [OK]      — comportamiento correcto
//   [RIESGO]  — riesgo documentado, test de regresión para detectar cambios

// ─── POST /entrada — campos requeridos ───────────────────────────────────────

describe("POST /entrada — campos requeridos (FASE 23)", () => {
  test("[OK] debe devolver 400 cuando falta ubi", async () => {
    const res = await request(app)
      .post("/entrada")
      .send({ cod: "TEST", lot: "LOT1", cant: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("[OK] debe devolver 400 cuando falta lot", async () => {
    const res = await request(app)
      .post("/entrada")
      .send({ cod: "TEST", ubi: "UBI1", cant: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("[OK] debe devolver 400 cuando cant es undefined (campo ausente)", async () => {
    const res = await request(app)
      .post("/entrada")
      .send({ cod: "TEST", ubi: "UBI1", lot: "LOT1" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("[OK] debe devolver 400 cuando cant es null", async () => {
    const res = await request(app)
      .post("/entrada")
      .send({ cod: "TEST", ubi: "UBI1", lot: "LOT1", cant: null });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ─── POST /entrada — valores numéricos límite ─────────────────────────────────

describe("POST /entrada — valores numéricos límite (FASE 23)", () => {
  test("[OK] debe devolver 400 cuando cant es NaN (string no numérico)", async () => {
    const res = await request(app)
      .post("/entrada")
      .send({ cod: "TEST", ubi: "UBI1", lot: "LOT1", cant: "xyz" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("[OK] debe devolver 400 cuando cant es Infinity", async () => {
    const res = await request(app)
      .post("/entrada")
      .send({ cod: "TEST", ubi: "UBI1", lot: "LOT1", cant: Infinity });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("[OK] no debe exponer errores SQL internos con body inválido", async () => {
    const res = await request(app)
      .post("/entrada")
      .send({ cod: "TEST", ubi: "UBI1", lot: "LOT1", cant: -1 });
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
  });
});

// ─── POST /entrada — SQL injection en body ────────────────────────────────────

describe("POST /entrada — SQL injection en body (FASE 23)", () => {
  test("[OK] payload SQL en cod no expone errores SQL internos al cliente", async () => {
    const res = await request(app)
      .post("/entrada")
      .send({ cod: "' OR 1=1 --", ubi: "UBI1", lot: "LOT1", cant: 5 });
    // La query es parametrizada: no hay injection. Si cod es más largo que la columna
    // ARTCOD, el auto-create INSERT falla con truncación → 500, pero el body del
    // cliente NO debe contener mensajes SQL internos.
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
  });

  test("[OK] payload SQL en ubi no expone errores SQL internos al cliente", async () => {
    const res = await request(app)
      .post("/entrada")
      .send({ cod: "TEST", ubi: "'; DROP TABLE STOCK --", lot: "LOT1", cant: 5 });
    // Igual que el caso de cod: truncación de columna causa 500, pero sin
    // exponer internos SQL al cliente.
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
  });
});

// ─── POST /salida — campos requeridos ────────────────────────────────────────

describe("POST /salida — campos requeridos (FASE 23)", () => {
  test("[OK] debe devolver 400 cuando falta cod", async () => {
    const res = await request(app)
      .post("/salida")
      .send({ ubi: "UBI1", lot: "LOT1", cant: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("[OK] debe devolver 400 cuando falta lot", async () => {
    const res = await request(app)
      .post("/salida")
      .send({ cod: "TEST", ubi: "UBI1", cant: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("[OK] debe devolver 400 cuando cant es undefined (campo ausente)", async () => {
    const res = await request(app)
      .post("/salida")
      .send({ cod: "TEST", ubi: "UBI1", lot: "LOT1" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("[OK] debe devolver 400 cuando cant es null", async () => {
    const res = await request(app)
      .post("/salida")
      .send({ cod: "TEST", ubi: "UBI1", lot: "LOT1", cant: null });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ─── POST /salida — stock insuficiente ───────────────────────────────────────

describe("POST /salida — stock insuficiente (FASE 23)", () => {
  test("[OK] cod inexistente debe devolver 400 con mensaje de stock insuficiente", async () => {
    const res = await request(app)
      .post("/salida")
      .send({ cod: "__NUCLEO_TEST_INEXISTENTE__", ubi: "UBI_TEST", lot: "LOT_TEST", cant: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/stock insuficiente/i);
  });

  test("[OK] stock insuficiente no debe devolver 500", async () => {
    const res = await request(app)
      .post("/salida")
      .send({ cod: "__NUCLEO_TEST_INEXISTENTE__", ubi: "UBI_TEST", lot: "LOT_TEST", cant: 9999 });
    expect(res.statusCode).not.toBe(500);
  });

  test("[OK] no debe exponer errores SQL internos con cod inexistente", async () => {
    const res = await request(app)
      .post("/salida")
      .send({ cod: "__NUCLEO_TEST_INEXISTENTE__", ubi: "UBI_TEST", lot: "LOT_TEST", cant: 1 });
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
  });
});

// ─── POST /salida — SQL injection en body ────────────────────────────────────

describe("POST /salida — SQL injection en body (FASE 23)", () => {
  test("[OK] payload SQL en cod debe ser inerte", async () => {
    const res = await request(app)
      .post("/salida")
      .send({ cod: "' OR 1=1 --", ubi: "UBI1", lot: "LOT1", cant: 5 });
    expect(res.statusCode).not.toBe(500);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
  });
});

// ─── POST /traspaso — campos requeridos ──────────────────────────────────────

describe("POST /traspaso — campos requeridos (FASE 23)", () => {
  test("[OK] debe devolver 400 cuando falta cod", async () => {
    const res = await request(app)
      .post("/traspaso")
      .send({ ubiOri: "UBI1", ubiDes: "UBI2", lot: "LOT1", cant: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("[OK] debe devolver 400 cuando falta ubiOri", async () => {
    const res = await request(app)
      .post("/traspaso")
      .send({ cod: "TEST", ubiDes: "UBI2", lot: "LOT1", cant: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("[OK] debe devolver 400 cuando cant es undefined (campo ausente)", async () => {
    const res = await request(app)
      .post("/traspaso")
      .send({ cod: "TEST", ubiOri: "UBI1", ubiDes: "UBI2", lot: "LOT1" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("[OK] debe devolver 400 cuando cant es null", async () => {
    const res = await request(app)
      .post("/traspaso")
      .send({ cod: "TEST", ubiOri: "UBI1", ubiDes: "UBI2", lot: "LOT1", cant: null });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ─── POST /traspaso — mismo origen y destino ─────────────────────────────────

describe("POST /traspaso — origen igual a destino (FASE 23)", () => {
  test("[RIESGO] ubiOri === ubiDes con cod inexistente devuelve 409 stock insuficiente", async () => {
    // No hay validación de ubiOri===ubiDes. El flujo llega al SELECT de origen,
    // no encuentra stock, y lanza el error de negocio → 409.
    // Si existiera stock, haría subtract+add en la misma ubicación (net 0 correcto).
    // Registrar comportamiento actual para detectar cambios involuntarios.
    const res = await request(app)
      .post("/traspaso")
      .send({ cod: "__NUCLEO_TEST_INEXISTENTE__", ubiOri: "UBI1", ubiDes: "UBI1", lot: "LOT1", cant: 1 });
    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
  });
});

// ─── POST /traspaso — SQL injection en body ──────────────────────────────────

describe("POST /traspaso — SQL injection en body (FASE 23)", () => {
  test("[OK] payload SQL en cod debe ser inerte (transacción parametrizada)", async () => {
    const res = await request(app)
      .post("/traspaso")
      .send({ cod: "' OR 1=1 --", ubiOri: "UBI1", ubiDes: "UBI2", lot: "LOT1", cant: 5 });
    // No stock → 409, nunca 500 por SQL injection
    expect(res.statusCode).not.toBe(500);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
  });

  test("[OK] payload SQL en lot debe ser inerte", async () => {
    const res = await request(app)
      .post("/traspaso")
      .send({ cod: "TEST", ubiOri: "UBI1", ubiDes: "UBI2", lot: "'; DROP TABLE STOCK --", cant: 5 });
    expect(res.statusCode).not.toBe(500);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/Microsoft|ODBC|SQL Server|LIN\.dbo/i);
  });
});

// ─── Consistencia de formato de respuesta ────────────────────────────────────

describe("Núcleo crítico — consistencia de formato de error (FASE 23)", () => {
  test("[RIESGO] /entrada usa clave 'error' en validaciones, /traspaso usa 'success'+'message' en negocio", async () => {
    // Documentar la inconsistencia: entrada/salida devuelven { error: '...' } en validación
    // pero { success: false, message: '...' } en errores de stock.
    // Traspaso devuelve { error: '...' } en validación y { success: false, message: '...' } en negocio.
    // Este test documenta el comportamiento actual para detectar regresiones.
    const entradaRes = await request(app)
      .post("/entrada")
      .send({ cod: "TEST", ubi: "UBI1", lot: "LOT1", cant: -1 });
    expect(entradaRes.statusCode).toBe(400);
    expect(entradaRes.body).toHaveProperty("error");

    const salidaStockRes = await request(app)
      .post("/salida")
      .send({ cod: "__NUCLEO_TEST_INEXISTENTE__", ubi: "UBI1", lot: "LOT1", cant: 1 });
    expect(salidaStockRes.statusCode).toBe(400);
    expect(salidaStockRes.body).toHaveProperty("success", false);
    expect(salidaStockRes.body).toHaveProperty("message");
  });
});
