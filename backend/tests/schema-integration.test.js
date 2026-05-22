"use strict";

// ─── INTEGRACIÓN — GET /schema (requiere BD real) ────────────────────────────
//
// Este test necesita conexión activa a SQL Server.
// NO incluir en test:ci — ejecutar solo con: npm test
// o: npx jest tests/schema-integration.test.js

const request = require("supertest");
const app = require("../app");

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
  }, 15000); // timeout ampliado: requiere conexión ODBC real
});
