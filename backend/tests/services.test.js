// ─── FASE 26 — TESTS DE HELPERS DE SERVICES ──────────────────────────────────
//
// Solo se testean funciones puras con lógica real.
// Los wrappers SQL triviales quedan cubiertos indirectamente por los tests API.
//
// Clasificación:
//   [OK]      — comportamiento correcto
//   [LÍMITE]  — valor límite o caso borde documentado

const { normalizeDate, daysAgo } = require('../services/analytics.service');

// ─── normalizeDate ────────────────────────────────────────────────────────────

describe("normalizeDate — valores falsy", () => {
    test("[OK] retorna fallback cuando value es null", () => {
        expect(normalizeDate(null, '2024-01-01')).toBe('2024-01-01');
    });

    test("[OK] retorna fallback cuando value es undefined", () => {
        expect(normalizeDate(undefined, '2024-01-01')).toBe('2024-01-01');
    });

    test("[OK] retorna fallback cuando value es cadena vacía", () => {
        expect(normalizeDate('', '2024-01-01')).toBe('2024-01-01');
    });
});

describe("normalizeDate — formatos inválidos", () => {
    test("[OK] retorna fallback con formato dd/mm/yyyy", () => {
        expect(normalizeDate('15/01/2024', '2024-01-01')).toBe('2024-01-01');
    });

    test("[OK] retorna fallback con texto libre", () => {
        expect(normalizeDate('ayer', '2024-01-01')).toBe('2024-01-01');
    });

    test("[OK] retorna fallback con fecha parcial (solo año)", () => {
        expect(normalizeDate('2024', '2024-01-01')).toBe('2024-01-01');
    });

    test("[OK] retorna fallback con formato yyyy/mm/dd (separador incorrecto)", () => {
        expect(normalizeDate('2024/01/15', '2024-01-01')).toBe('2024-01-01');
    });
});

describe("normalizeDate — formatos válidos", () => {
    test("[OK] retorna la fecha cuando el formato es yyyy-mm-dd", () => {
        expect(normalizeDate('2024-03-15', '2024-01-01')).toBe('2024-03-15');
    });

    test("[LÍMITE] acepta solo los primeros 10 caracteres de un ISO timestamp", () => {
        // El frontend puede enviar '2024-03-15T10:30:00Z' — se acepta como fecha válida
        expect(normalizeDate('2024-03-15T10:30:00Z', '2024-01-01')).toBe('2024-03-15');
    });

    test("[LÍMITE] fallback puede ser null (usado en getLog)", () => {
        expect(normalizeDate(null, null)).toBeNull();
    });
});

// ─── daysAgo ──────────────────────────────────────────────────────────────────

describe("daysAgo — formato de salida", () => {
    test("[OK] retorna una cadena de exactamente 10 caracteres", () => {
        expect(daysAgo(0)).toHaveLength(10);
        expect(daysAgo(30)).toHaveLength(10);
    });

    test("[OK] retorna formato yyyy-mm-dd", () => {
        expect(daysAgo(7)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("[OK] daysAgo(0) retorna la fecha de hoy", () => {
        const today = new Date().toISOString().slice(0, 10);
        expect(daysAgo(0)).toBe(today);
    });

    test("[OK] daysAgo(1) retorna ayer", () => {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        expect(daysAgo(1)).toBe(yesterday);
    });

    test("[OK] daysAgo(30) retorna una fecha anterior a hoy", () => {
        const today = new Date().toISOString().slice(0, 10);
        expect(daysAgo(30) < today).toBe(true);
    });
});
