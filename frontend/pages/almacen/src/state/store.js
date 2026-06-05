// ── REACTIVE STORE ────────────────────────────────────────────
// Fuente única de verdad para todo el estado de la aplicación.
// Reemplaza el objeto S mutable de estado.js.
//
// API:
//   store.state.key          — lectura directa (reactive via Proxy)
//   store.dispatch(key, val) — actualiza clave y notifica suscriptores
//   store.commit(key)        — notifica sin cambiar (tras mutación in-place)
//   store.on(key, fn)        — suscribirse a cambios de una clave (retorna unsub)
//   store.on('*', fn)        — suscribirse a cualquier cambio

function _createStore(initial) {
    const _subs = {}; // key → Set<fn(newVal, oldVal)>

    function _notify(key, newVal, oldVal) {
        _subs[key]?.forEach(fn => fn(newVal, oldVal));
        _subs['*']?.forEach(fn => fn(key, newVal, oldVal));
    }

    const _raw = { ...initial };

    const state = new Proxy(_raw, {
        set(target, key, value) {
            const old = target[key];
            target[key] = value;
            if (old !== value) _notify(key, value, old);
            return true;
        },
    });

    return {
        state,

        on(key, fn) {
            (_subs[key] ??= new Set()).add(fn);
            return () => _subs[key]?.delete(fn);
        },

        off(key, fn) {
            _subs[key]?.delete(fn);
        },

        // Explicit set — identical to direct assignment via Proxy but readable at callsite
        dispatch(key, value) {
            state[key] = value;
        },

        // Trigger listeners after an in-place mutation (array push/splice, Map.set, etc.)
        // Usage: state.pickItems.push(x); store.commit('pickItems');
        commit(key) {
            const val = state[key];
            _subs[key]?.forEach(fn => fn(val, val));
            _subs['*']?.forEach(fn => fn(key, val, val));
        },
    };
}

// ── SCHEMA COMPLETO DEL STORE ─────────────────────────────────
//
// Dominios:
//   three      — objetos del motor (scene, camera…)
//   warehouse  — geometría y datos del almacén cargados en memoria
//   nav        — grafo de navegación A*
//   picking    — estado de la sesión de picking activa
//   workers    — lista de trabajadores virtuales en escena
//   ui         — flags de paneles abiertos + datos de UI reactivos
//   input      — teclado, gamepad, velocidad del jugador
//
const _initial = {
    // ── Three.js core ──────────────────────────────────────────
    scene:    null,
    camera:   null,
    renderer: null,
    controls: null,

    // ── Almacén / Mundo ────────────────────────────────────────
    officePos:     null,       // { x, z } — origen/destino de rutas (garita del editor)
    wBounds:       { minX: -50, maxX: 200, minZ: -50, maxZ: 200 },
    mmapLayout:    null,       // { pNums, pBase, pasillosMap, wBounds, layoutObjs }
    colliders:     [],         // [{ minX, maxX, minZ, maxZ, floorY }]
    interactables: [],         // THREE.Mesh[] con userData.sd
    shelfCols:     [],         // [{ x, z, code, totalUnits, filledLevels, totalLevels }]
    pickMarkerGrp: null,       // THREE.Group — discos de parada de picking
    lowStockGrp:   null,       // THREE.Group — alertas de stock bajo

    // ── Datos ──────────────────────────────────────────────────
    globalStockIdx:   {},      // ubicación → { total, arts[] }
    artEntries:       [],      // artículos aplanados con coordenadas
    LOCATION_MAP:     new Map(), // locKey → { x, z, yaw }
    ubiToLocKey:      new Map(), // código raw → locKey
    LOW_STOCK_THRESH: 10,
    hudStats: null,            // { total, withStock } — actualizado por cargar()

    // ── Navegación ─────────────────────────────────────────────
    aisleInfo: null,           // Map<num, {x,z,dx,dz,longitud,...}>
    navGraph:  null,           // { nodes[{x,z}], adj[{to,cost}[]] }

    // ── Picking ────────────────────────────────────────────────
    pickItems:             [],   // [{ artCode, artName, qtyNeeded }]
    pickRoute:             [],   // [{ locKey, x, z, yaw, items[], distFromPrev }]
    pickPanelOpen:         false,
    pickArrived:           false,
    activeWorkerCollected: null, // Set<stopIndex> del trabajador activo

    // ── UI reactiva ────────────────────────────────────────────
    // Estos campos son leídos por la capa UI via store.on(...)
    lookedAt:     null,        // ShelfData del objeto bajo el cursor — null si no hay
    pendingShelf: null,        // ShelfData pendiente de abrir en detail al desbloquear puntero
    detailOpen:   false,
    teleportOpen: false,
    scannerOpen:  false,
    activeRouteId: null,    // UUID de la ruta guardada en server (para sincronización móvil)

    // ── Trabajadores ───────────────────────────────────────────
    workers:         [],       // [{ mesh, waypoints, wpIdx, pos, speed, route, … }]
    workerModalOpen: false,
    simModalOpen:    false,
    qrModalOpen:     false,
    assignedWorker:  null,     // { id, name } del operario asignado a la ruta activa

    // ── Input ──────────────────────────────────────────────────
    keys:   {},                // { [KeyCode]: boolean }
    gpMove: { x: 0, z: 0 },   // gamepad stick (-1…1) — z = eje de profundidad (adelante/atrás)
    gpBtns: {},                // gamepad button state anterior (para edge detection)

    // ── Movimiento del jugador ─────────────────────────────────
    vel: { x: 0, z: 0 },      // velocidad con lerp — z es el eje de profundidad (Three.js Z)
};

export const store = _createStore(_initial);

// ── BACKWARD COMPAT ───────────────────────────────────────────
// El resto del código puede seguir usando `S` mientras se migra.
// Toda asignación directa (S.key = val) pasa por el Proxy y notifica.
export const S = store.state;

// ── HELPERS DE CONTROL ────────────────────────────────────────
// Idénticos a estado.js — se re-exportan para no romper importaciones existentes.
export function pauseGame()    { S.controls?.unlock(); }
export function resumeGame()   { S.controls?.lock(); }
export function isGameActive() { return !!(S.controls?.isLocked); }
export function clearKeys()    { for (const k in S.keys) S.keys[k] = false; }

// ── COLISIONES ────────────────────────────────────────────────
export function addCollider(cx, cz, w, d, floorY = 0) {
    S.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, floorY });
}
