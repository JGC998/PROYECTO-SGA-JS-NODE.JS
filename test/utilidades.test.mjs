// Tests para parseEtiqueta() en js/utilidades.js
// Importable directamente en Node.js (sin DOM ni Three.js).

// ── Inline de la función bajo test (evita importar el módulo browser) ──
function parseEtiqueta(etq) {
    if (!etq) return null;
    const p = etq.match(/P(\d+)/i), x = etq.match(/X(\d+)/i),
          y = etq.match(/Y(\d+)/i), l = etq.match(/\b([ID])\b/i);
    if (!p || !x || !y) return null;
    return { pasillo: +p[1], lado: l ? l[1].toUpperCase() : 'I', col: +x[1], nivel: +y[1] };
}

function eq(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg ?? ''}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`);
}
function ok(v, msg) { if (!v) throw new Error(msg ?? 'Aserción fallida'); }

export const tests = [
    {
        name: 'formato canónico lado D',
        fn() {
            const r = parseEtiqueta('P001 D X003 Y02');
            eq(r, { pasillo: 1, lado: 'D', col: 3, nivel: 2 });
        },
    },
    {
        name: 'formato canónico lado I',
        fn() {
            const r = parseEtiqueta('P012 I X001 Y05');
            eq(r, { pasillo: 12, lado: 'I', col: 1, nivel: 5 });
        },
    },
    {
        name: 'sin letra de lado → defecto "I"',
        fn() {
            const r = parseEtiqueta('P002 X004 Y01');
            eq(r?.lado, 'I');
        },
    },
    {
        name: 'insensible a mayúsculas',
        fn() {
            const r = parseEtiqueta('p003 d x002 y03');
            eq(r, { pasillo: 3, lado: 'D', col: 2, nivel: 3 });
        },
    },
    {
        name: 'sin P → null',
        fn() { ok(parseEtiqueta('D X002 Y01') === null); },
    },
    {
        name: 'sin X → null',
        fn() { ok(parseEtiqueta('P001 D Y01') === null); },
    },
    {
        name: 'sin Y → null',
        fn() { ok(parseEtiqueta('P001 D X002') === null); },
    },
    {
        name: 'cadena vacía → null',
        fn() { ok(parseEtiqueta('') === null); },
    },
    {
        name: 'null → null',
        fn() { ok(parseEtiqueta(null) === null); },
    },
    {
        name: 'números grandes',
        fn() {
            const r = parseEtiqueta('P099 D X100 Y10');
            eq(r, { pasillo: 99, lado: 'D', col: 100, nivel: 10 });
        },
    },
];
