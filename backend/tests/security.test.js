const request = require("supertest");
const app = require("../app");

// ─── TESTS DE SEGURIDAD Y DIAGNÓSTICO ────────────────────────────────────────
//
// Estos tests son de diagnóstico. Si un test queda en rojo, refleja una
// vulnerabilidad o gap de validación real — no se oculta ni se maquilla.
//
// Nomenclatura de clasificación en comentarios:
//   [OK]      — comportamiento correcto, ruta defendida
//   [BUG-VAL] — bug de validación (la ruta acepta input que no debería)
//   [BUG-SEG] — bug de seguridad (exposición de datos o ejecución peligrosa)
//   [INFO]    — comportamiento aceptable pero mejorable

// ─── 1. SQL INJECTION EN /datos/:tabla ───────────────────────────────────────

describe("GET /datos/:tabla — inyección SQL en nombre de tabla", () => {
  test("[OK] debe devolver 400 cuando el nombre de tabla contiene caracteres peligrosos", async () => {
    // "ARTICULO; DROP TABLE ARTICULO" URL-encoded
    const response = await request(app)
      .get("/datos/ARTICULO%3B%20DROP%20TABLE%20ARTICULO");

    // La ruta valida con regex /^[a-zA-Z0-9_]+$/ — debe bloquear y devolver 400
    expect(response.statusCode).toBe(400);
  });
});

// ─── 2. SQL INJECTION EN /stock/:cod ─────────────────────────────────────────

describe("GET /stock/:cod — inyección SQL en código de artículo", () => {
  test("[OK] debe responder sin error cuando el cod contiene payload SQL clásico", async () => {
    // "' OR 1=1 --" URL-encoded
    // La ruta usa query parametrizada (.input('cod', ...)) — el payload es inerte
    const response = await request(app)
      .get("/stock/%27%20OR%201%3D1%20--");

    // No debe devolver 500 (error de BD). Esperamos 200 con array vacío.
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(0);
  });
});

// ─── 3. RUTA INEXISTENTE ─────────────────────────────────────────────────────

describe("GET /ruta-inexistente-de-prueba", () => {
  test("[OK] debe devolver 404 para rutas no definidas", async () => {
    const response = await request(app)
      .get("/ruta-inexistente-de-prueba");

    expect(response.statusCode).toBe(404);
  });
});

// ─── 4. PAYLOAD MALFORMADO EN /entrada ───────────────────────────────────────

describe("POST /entrada — body con estructura incorrecta", () => {
  test("[BUG-VAL] no debe devolver 200 cuando el body no contiene los campos esperados", async () => {
    // La ruta espera: { cod, ubi, lot, cant }
    // Enviamos campos con nombres distintos y valores inválidos
    const response = await request(app)
      .post("/entrada")
      .send({
        producto: { valor: "TEST" },
        cantidad: -10,
        ubicacion: ["X"]
      });

    // La ruta desestructura cod/ubi/lot/cant — todos quedan undefined/null
    // Sin validación de inputs, el comportamiento probable es 500 (error de BD)
    // Un 200 aquí sería incorrecto — significaría que aceptó una entrada inválida
    expect(response.statusCode).not.toBe(200);

    // Si devuelve 500, es [BUG-VAL]: falta validación antes de tocar la BD
    // Si devuelve 400, la ruta ya tiene validación implícita (positivo)
  });
});

// ─── 5. CANTIDAD INVÁLIDA EN /salida ─────────────────────────────────────────

describe("POST /salida — cantidad 0 o negativa", () => {
  test("[OK] debe devolver 400 con cantidad 0 y artículo inexistente", async () => {
    const response = await request(app)
      .post("/salida")
      .send({
        cod: "__TEST_SEGURIDAD_INEXISTENTE__",
        ubi: "UBI_TEST",
        lot: "LOT_TEST",
        cant: 0
      });

    // La ruta comprueba stock disponible: artículo no existe → 400
    expect(response.statusCode).toBe(400);
  });

  test("[OK] debe devolver 400 con cantidad negativa y artículo inexistente", async () => {
    const response = await request(app)
      .post("/salida")
      .send({
        cod: "__TEST_SEGURIDAD_INEXISTENTE__",
        ubi: "UBI_TEST",
        lot: "LOT_TEST",
        cant: -10
      });

    // La ruta comprueba stock disponible: artículo no existe → 400
    // NOTA: si el artículo EXISTIERA con stock > 0 y cant=-10,
    // la ruta haría UPDATE STOCAN = STOCAN - (-10), sumando stock en lugar de restar.
    // Eso es un bug de negocio pendiente de corrección en fases futuras.
    expect(response.statusCode).toBe(400);
  });
});
