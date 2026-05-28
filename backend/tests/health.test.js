const request = require("supertest");
const app = require("../app");

describe("Health check", () => {
  test("GET /health debe responder correctamente", async () => {
    const response = await request(app).get("/health");

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("ok", true);
  });
});
