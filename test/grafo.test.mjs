// Tests para grafo.js (A* sin browser globals).
// Inline de MinHeap + astarPath con un grafo mock para no depender de S.navGraph.

// ── MinHeap (copiado de grafo.js para testeo aislado) ─────────
class MinHeap {
    constructor() { this._d = []; }
    get size() { return this._d.length; }
    push(item) { this._d.push(item); this._up(this._d.length - 1); }
    pop() {
        const top = this._d[0], last = this._d.pop();
        if (this._d.length) { this._d[0] = last; this._dn(0); }
        return top;
    }
    _up(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this._d[i].f >= this._d[p].f) break;
            [this._d[i], this._d[p]] = [this._d[p], this._d[i]]; i = p;
        }
    }
    _dn(i) {
        const n = this._d.length;
        for (;;) {
            let j = i * 2 + 1;
            if (j >= n) break;
            if (j + 1 < n && this._d[j + 1].f < this._d[j].f) j++;
            if (this._d[i].f <= this._d[j].f) break;
            [this._d[i], this._d[j]] = [this._d[j], this._d[i]]; i = j;
        }
    }
}

// ── A* puro (sin S, recibe grafo como parámetro) ─────────────
// Replicado de grafo.js para testeo sin módulo completo
const ENTRY_DIST = 20.0;
function astarPathRaw(from, to, graph) {
    if (!graph || !graph.nodes.length) return null;
    const { nodes, adj } = graph;
    const N = nodes.length;
    const SRC = N, DST = N + 1;
    const srcAdj = [];
    const nearDst = new Map();
    const dDirect = Math.hypot(from.x - to.x, from.z - to.z);
    srcAdj.push({ to: DST, cost: dDirect });
    for (let i = 0; i < N; i++) {
        const df = Math.hypot(from.x - nodes[i].x, from.z - nodes[i].z);
        const dt = Math.hypot(to.x   - nodes[i].x, to.z   - nodes[i].z);
        if (df <= ENTRY_DIST) srcAdj.push({ to: i, cost: df });
        if (dt <= ENTRY_DIST) nearDst.set(i, dt);
    }
    function getAdj(id) {
        if (id === SRC) return srcAdj;
        if (id === DST) return [];
        const base = adj[id], dstCost = nearDst.get(id);
        return dstCost !== undefined ? [...base, { to: DST, cost: dstCost }] : base;
    }
    const dist = new Array(N + 2).fill(Infinity);
    const prev = new Int32Array(N + 2).fill(-1);
    const heur = id => {
        const x = id === SRC ? from.x : id === DST ? to.x : nodes[id].x;
        const z = id === SRC ? from.z : id === DST ? to.z : nodes[id].z;
        return Math.hypot(x - to.x, z - to.z);
    };
    dist[SRC] = 0;
    const open = new MinHeap();
    const closed = new Uint8Array(N + 2);
    open.push({ id: SRC, f: heur(SRC) });
    while (open.size > 0) {
        const { id: cur } = open.pop();
        if (closed[cur]) continue;
        closed[cur] = 1;
        if (cur === DST) break;
        for (const { to: nxt, cost } of getAdj(cur)) {
            if (closed[nxt]) continue;
            const g = dist[cur] + cost;
            if (g < dist[nxt]) {
                dist[nxt] = g; prev[nxt] = cur;
                open.push({ id: nxt, f: g + heur(nxt) });
            }
        }
    }
    if (dist[DST] === Infinity) return null;
    const path = [];
    for (let cur = DST; cur !== -1; cur = prev[cur]) {
        const x = cur === SRC ? from.x : cur === DST ? to.x : nodes[cur].x;
        const z = cur === SRC ? from.z : cur === DST ? to.z : nodes[cur].z;
        path.unshift({ x, z });
    }
    return path;
}

function pathLen(pts) {
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i-1].x, pts[i].z - pts[i-1].z);
    return d;
}

function near(a, b, eps = 1e-6, msg) {
    if (Math.abs(a - b) > eps) throw new Error(`${msg ?? ''}: ${a} ≠ ${b}`);
}
function ok(v, msg) { if (!v) throw new Error(msg ?? 'Aserción fallida'); }

// ── Grafo de prueba: 3 nodos en línea recta ───────────────────
//  A(0,0) — B(5,0) — C(10,0)
const GRAPH_LINE = {
    nodes: [{ id:0, x:0, z:0 }, { id:1, x:5, z:0 }, { id:2, x:10, z:0 }],
    adj: [
        [{ to:1, cost:5 }],
        [{ to:0, cost:5 }, { to:2, cost:5 }],
        [{ to:1, cost:5 }],
    ],
};

// Grafo con desvío: A(0,0)—B(5,0)—C(10,0) y un nodo D(5,10)
//  A—B—C (costo 10 directo), A—D—C (costo ~20)
const GRAPH_DETOUR = {
    nodes: [
        { id:0, x:0, z:0 }, { id:1, x:5, z:0 },
        { id:2, x:10, z:0 }, { id:3, x:5, z:10 },
    ],
    adj: [
        [{ to:1, cost:5 }, { to:3, cost:Math.hypot(5,10) }],
        [{ to:0, cost:5 }, { to:2, cost:5 }],
        [{ to:1, cost:5 }, { to:3, cost:Math.hypot(5,10) }],
        [{ to:0, cost:Math.hypot(5,10) }, { to:2, cost:Math.hypot(5,10) }],
    ],
};

export const tests = [
    {
        name: 'MinHeap extrae el menor primero',
        fn() {
            const h = new MinHeap();
            h.push({ f: 3 }); h.push({ f: 1 }); h.push({ f: 2 });
            ok(h.pop().f === 1, 'primero debe ser 1');
            ok(h.pop().f === 2, 'segundo debe ser 2');
            ok(h.pop().f === 3, 'tercero debe ser 3');
        },
    },
    {
        name: 'grafo vacío → null',
        fn() {
            const result = astarPathRaw({ x:0, z:0 }, { x:1, z:0 }, { nodes:[], adj:[] });
            ok(result === null, 'debe ser null');
        },
    },
    {
        name: 'camino directo sin grafo — directo from→to',
        fn() {
            const path = astarPathRaw({ x:0, z:0 }, { x:3, z:4 }, GRAPH_LINE);
            ok(path !== null, 'debe haber camino');
            ok(path.length >= 2, 'al menos 2 puntos');
            near(path[0].x, 0, 1e-6, 'inicio.x'); near(path[0].z, 0, 1e-6, 'inicio.z');
            near(path[path.length-1].x, 3, 1e-6, 'fin.x');
            near(path[path.length-1].z, 4, 1e-6, 'fin.z');
        },
    },
    {
        name: 'A* en línea: elige ruta a través de nodos intermedios',
        fn() {
            // from=(0,0) to=(10,0): usar el grafo A—B—C en línea recta
            const path = astarPathRaw({ x:0, z:0 }, { x:10, z:0 }, GRAPH_LINE);
            ok(path !== null, 'debe haber camino');
            const len = pathLen(path);
            near(len, 10, 0.01, 'longitud debe ser ~10');
        },
    },
    {
        name: 'A* prefiere la ruta más corta (evita desvío)',
        fn() {
            const path = astarPathRaw({ x:0, z:0 }, { x:10, z:0 }, GRAPH_DETOUR);
            ok(path !== null, 'debe haber camino');
            const len = pathLen(path);
            // La ruta óptima es 0→1→2 con costo 10; la alternativa es ≈22.4
            near(len, 10, 0.1, 'debe elegir la ruta corta (len≈10)');
        },
    },
    {
        name: 'origen y destino iguales → ruta de longitud 0',
        fn() {
            const path = astarPathRaw({ x:5, z:0 }, { x:5, z:0 }, GRAPH_LINE);
            ok(path !== null && pathLen(path) < 1e-6, 'longitud debe ser ~0');
        },
    },
];
