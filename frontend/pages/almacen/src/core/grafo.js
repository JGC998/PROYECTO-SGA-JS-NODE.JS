// ── CORE: GRAFO DE NAVEGACIÓN + A* ────────────────────────────
// Módulo puro: sin Three.js, sin DOM.
// Mantiene el grafo de waypoints y expone tanto rutas síncronas
// (para uso en tiempo real) como asíncronas vía Web Worker (MEJ-1).
import { AW, ENTRY_DIST } from '../../js/shared/configuracion.js';
import { S } from '../state/store.js';

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

// ── CONSTRUCCIÓN DEL GRAFO ─────────────────────────────────────
export function buildNavGraph() {
    if (!S.aisleInfo?.size) { S.navGraph = null; _syncWorker(); return; }

    const nodes = [], adj = [];
    function addNode(x, z) {
        const id = nodes.length;
        nodes.push({ id, x, z }); adj.push([]); return id;
    }
    function addEdge(a, b) {
        const cost = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
        adj[a].push({ to: b, cost }); adj[b].push({ to: a, cost });
    }

    const aisleA = new Map(), aisleC = new Map(), aisleB = new Map();

    for (const [num, info] of S.aisleInfo) {
        const h   = info.longitud / 2;
        const aId = addNode(info.x - info.dx * h, info.z - info.dz * h);
        const cId = addNode(info.x,                info.z               );
        const bId = addNode(info.x + info.dx * h, info.z + info.dz * h);
        addEdge(aId, cId); addEdge(cId, bId);
        aisleA.set(num, aId); aisleC.set(num, cId); aisleB.set(num, bId);

        if (info.forma !== 'recto' && info.longitud2 > 0) {
            const W     = info.ancho ?? AW;
            const cH    = h - W / 2;
            const kodId = addNode(info.x + info.dx * cH, info.z + info.dz * cH);
            const finId = addNode(
                nodes[kodId].x + info.perpX * info.dirCodo * (W / 2 + info.longitud2 / 2),
                nodes[kodId].z + info.perpZ * info.dirCodo * (W / 2 + info.longitud2 / 2),
            );
            addEdge(bId, kodId); addEdge(kodId, finId);
        }
    }

    const sorted = [...S.aisleInfo.entries()].sort((a, b) => {
        const infoA = a[1], infoB = b[1];
        const diffX = infoB.x - infoA.x, diffZ = infoB.z - infoA.z;
        return Math.abs(diffX) >= Math.abs(diffZ) ? infoA.x - infoB.x : infoA.z - infoB.z;
    });
    for (let i = 0; i < sorted.length - 1; i++) {
        const [na] = sorted[i], [nb] = sorted[i + 1];
        addEdge(aisleA.get(na), aisleA.get(nb));
        addEdge(aisleC.get(na), aisleC.get(nb));
        addEdge(aisleB.get(na), aisleB.get(nb));
    }

    S.navGraph = { nodes, adj };
    _syncWorker();
}

// ── A* SÍNCRONO ───────────────────────────────────────────────
// Para uso en el hilo principal (minimap cache, graphDist de ordenación).
export function astarPath(from, to) {
    const g = S.navGraph;
    if (!g || !g.nodes.length) return null;
    const { nodes, adj } = g;
    const N = nodes.length;
    const SRC = N, DST = N + 1;
    const srcAdj = [], nearDst = new Map();

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
    const open = new MinHeap(), closed = new Uint8Array(N + 2);
    open.push({ id: SRC, f: heur(SRC) });
    while (open.size > 0) {
        const { id: cur } = open.pop();
        if (closed[cur]) continue;
        closed[cur] = 1;
        if (cur === DST) break;
        for (const { to: nxt, cost } of getAdj(cur)) {
            if (closed[nxt]) continue;
            const g2 = dist[cur] + cost;
            if (g2 < dist[nxt]) { dist[nxt] = g2; prev[nxt] = cur; open.push({ id: nxt, f: g2 + heur(nxt) }); }
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

export function graphDist(from, to) {
    if (!S.navGraph) return Math.hypot(from.x - to.x, from.z - to.z);
    const path = astarPath(from, to);
    if (!path) return Math.hypot(from.x - to.x, from.z - to.z);
    let d = 0;
    for (let i = 1; i < path.length; i++)
        d += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    return d;
}

export function astarRouteWaypoints(stops) {
    if (stops.length < 2 || !S.navGraph) return [...stops];
    const pts = [stops[0]];
    for (let i = 1; i < stops.length; i++) {
        const path = astarPath(stops[i - 1], stops[i]);
        if (path && path.length > 2)
            for (let k = 1; k < path.length - 1; k++) pts.push(path[k]);
        pts.push(stops[i]);
    }
    return pts;
}

// ── WEB WORKER (MEJ-1) ────────────────────────────────────────
// Carga diferida: el worker se crea la primera vez que se necesita.
let _worker = null;
let _workerId = 0;
const _pending = new Map(); // id → resolve

function _getWorker() {
    if (_worker) return _worker;
    _worker = new Worker(new URL('./astar-worker.js', import.meta.url));
    _worker.onmessage = ({ data }) => {
        const cb = _pending.get(data.id);
        if (cb) { _pending.delete(data.id); cb(data.result); }
    };
    _worker.onerror = err => {
        console.error('[astar-worker]', err);
        for (const resolve of _pending.values()) resolve([]);
        _pending.clear();
        _worker = null;
    };
    return _worker;
}

// Envía el grafo actualizado al worker tras buildNavGraph()
function _syncWorker() {
    if (!S.navGraph) return;
    _getWorker().postMessage({
        type:       'setGraph',
        nodes:      S.navGraph.nodes.map(n => ({ x: n.x, z: n.z })),
        adj:        S.navGraph.adj,
        entryDist:  ENTRY_DIST,
    });
}

// Versión asíncrona — desplaza el cómputo de waypoints al worker
// para no bloquear el hilo principal al iniciar una ruta grande.
export function astarRouteWaypointsAsync(stops) {
    if (!S.navGraph || stops.length < 2) return Promise.resolve([...stops]);
    return new Promise(resolve => {
        const id = ++_workerId;
        _pending.set(id, resolve);
        _getWorker().postMessage({
            type:  'waypoints',
            id,
            stops: stops.map(s => ({ x: s.x, z: s.z })),
        });
    });
}
