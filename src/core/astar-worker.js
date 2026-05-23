// ── A* WEB WORKER ─────────────────────────────────────────────
// Script clásico (sin import ES modules) — autocontenido y sin dependencias.
// Recibe mensajes del hilo principal, devuelve resultados por postMessage.
//
// Protocolo:
//   { type:'setGraph', nodes:[{x,z}], adj:[[{to,cost}]] }
//       → almacena el grafo; sin respuesta
//   { type:'path', id, from:{x,z}, to:{x,z} }
//       → { type:'path', id, result:[{x,z}]|null }
//   { type:'waypoints', id, stops:[{x,z}] }
//       → { type:'waypoints', id, result:[{x,z}] }

let ENTRY_DIST = 20.0; // recibido en cada mensaje setGraph desde configuracion.js

// ── MIN-HEAP ──────────────────────────────────────────────────
class MinHeap {
    constructor() { this._d = []; }
    get size()   { return this._d.length; }
    push(item)   { this._d.push(item); this._up(this._d.length - 1); }
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

// ── ESTADO DEL WORKER ─────────────────────────────────────────
let _nodes = null; // [{x, z}]
let _adj   = null; // [[{to, cost}]]

// ── A* ────────────────────────────────────────────────────────
function astarPath(from, to) {
    if (!_nodes || !_nodes.length) return null;
    const nodes = _nodes, adj = _adj;
    const N = nodes.length;
    const SRC = N, DST = N + 1;
    const srcAdj  = [];
    const nearDst = new Map();

    for (let i = 0; i < N; i++) {
        const df = Math.hypot(from.x - nodes[i].x, from.z - nodes[i].z);
        const dt = Math.hypot(to.x   - nodes[i].x, to.z   - nodes[i].z);
        if (df <= ENTRY_DIST) srcAdj.push({ to: i, cost: df });
        if (dt <= ENTRY_DIST) nearDst.set(i, dt);
    }

    function getAdj(id) {
        if (id === SRC) return srcAdj;
        if (id === DST) return [];
        const dc = nearDst.get(id);
        return dc !== undefined ? [...adj[id], { to: DST, cost: dc }] : adj[id];
    }

    const dist  = new Array(N + 2).fill(Infinity);
    const prev  = new Int32Array(N + 2).fill(-1);
    const heur  = id => {
        const x = id === SRC ? from.x : id === DST ? to.x : nodes[id].x;
        const z = id === SRC ? from.z : id === DST ? to.z : nodes[id].z;
        return Math.hypot(x - to.x, z - to.z);
    };

    dist[SRC] = 0;
    const open   = new MinHeap();
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
                dist[nxt] = g;
                prev[nxt] = cur;
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
    return path.filter((p, i) => i === 0 || p.x !== path[i - 1].x || p.z !== path[i - 1].z);
}

function computeWaypoints(stops) {
    if (!_nodes || stops.length < 2) return [...stops];
    const pts = [stops[0]];
    for (let i = 1; i < stops.length; i++) {
        const path = astarPath(stops[i - 1], stops[i]);
        if (path && path.length > 2) {
            for (let k = 1; k < path.length - 1; k++) pts.push(path[k]);
        }
        pts.push(stops[i]);
    }
    return pts;
}

// ── HANDLER ───────────────────────────────────────────────────
self.onmessage = ({ data }) => {
    const { type, id } = data;

    if (type === 'setGraph') {
        _nodes = data.nodes;
        _adj   = data.adj;
        if (data.entryDist != null) ENTRY_DIST = data.entryDist;
        return;
    }
    if (type === 'path') {
        self.postMessage({ type: 'path', id, result: astarPath(data.from, data.to) });
        return;
    }
    if (type === 'waypoints') {
        self.postMessage({ type: 'waypoints', id, result: computeWaypoints(data.stops) });
    }
};
