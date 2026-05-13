// ── ESTADO COMPARTIDO ─────────────────────────────────────────
// Un único objeto mutable importado por todos los módulos.
// Los objetos Three.js (scene, camera…) se asignan en mapa-3d.js
// justo después de crearlos.
export const S = {
    // ── Three.js core ──────────────────────────────────────────
    scene: null, camera: null, renderer: null, controls: null,

    // ── Almacén / Mundo ────────────────────────────────────────
    mezzInfo:     null,   // { minX, maxX, mezzZ, mezzHH, maxZ, stairX1, stairX2, stairZBot }
    wBounds:      { minX: -50, maxX: 200, minZ: -50, maxZ: 200 },
    mmapLayout:   null,   // { pNums, pBase, pasillosMap, wBounds }
    colliders:    [],
    interactables:[],
    shelfCols:    [],     // { x, z, code, totalUnits, filledLevels, totalLevels }
    pickMarkerGrp:null,   // THREE.Group para discos de picking
    lowStockGrp:  null,   // THREE.Group para alertas de stock

    // ── Datos ──────────────────────────────────────────────────
    globalStockIdx:    {},
    artEntries:        [],
    LOCATION_MAP:      new Map(),
    ubiToLocKey:       new Map(),
    LOW_STOCK_THRESH:  10,
    isDemo:            false,

    // ── Picking ────────────────────────────────────────────────
    pickItems:            [],
    pickRoute:            [],
    pickPanelOpen:        false,
    pickArrived:          false,
    activeWorkerCollected:null,

    // ── Trabajadores ───────────────────────────────────────────
    workers:        [],
    workerModalOpen:false,

    // ── UI flags ───────────────────────────────────────────────
    detailOpen:   false,
    teleportOpen: false,
    historyOpen:  false,
    lookedAt:     null,
    pendingShelf: null,

    // ── Input ──────────────────────────────────────────────────
    keys:   {},
    gpMove: { x: 0, y: 0 },
    gpBtns: {},

    // ── Movimiento ─────────────────────────────────────────────
    vel: { x: 0, y: 0 },   // velocidad del jugador (lerp)
};

// ── HELPERS DE CONTROL ────────────────────────────────────────
export function pauseGame()    { S.controls?.unlock(); }
export function resumeGame()   { S.controls?.lock(); }
export function isGameActive() { return !!(S.controls?.isLocked); }
export function clearKeys()    { for (const k in S.keys) S.keys[k] = false; }
