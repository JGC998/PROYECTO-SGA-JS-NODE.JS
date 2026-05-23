// ── CONSTANTES GLOBALES ───────────────────────────────────────

export const CONFIG = {
    // Geometría de estanterías (metros)
    shelf: {
        levelHeight:    1.1,   // LH — distancia vertical entre niveles
        moduleWidth:    1.5,   // UW — anchura de un módulo de estantería  ← también en constantes.json
        moduleDepth:    0.85,  // UD — profundidad del módulo
        columnGap:      0.1,   // CG — separación entre columnas contiguas  ← también en constantes.json
        frameThickness: 0.06,  // FT — grosor del perfil metálico
    },
    // Geometría de pasillos y planta
    aisle: {
        width:          4.5,   // AW — anchura del pasillo central
        pasilloPad:     0,     // PG — separación extra entre pasillos
        warehouseHeight: 9,    // H  — altura total del almacén
    },
    // Jugador / cámara
    player: {
        eyeHeight:      1.75,  // EYE — altura del ojo en primera persona
        collisionRadius: 0.38, // PLAYER_R — radio de colisión
    },
    // UI / HUD
    ui: {
        inventoryRadius: 3.5,  // INV_RADIUS — distancia para mostrar sprite de inventario
        minimapSize:    220,   // MMAP_SIZE  — tamaño del minimap en px
        pickArriveRadius: 1.5, // PICK_ARRIVE_R — radio de llegada a parada de picking
    },
    // Historial de rutas (localStorage)
    history: {
        key:    'sga_route_history', // HISTORY_KEY
        maxLen: 20,                  // HISTORY_MAX
    },
    // Grafo de navegación (grafo.js)
    nav: {
        corridorDist: 10.0,  // CORRIDOR_DIST — dist. máx. para aristas entre extremos de pasillos
        entryDist:    20.0,  // ENTRY_DIST    — radio para conectar puntos externos al grafo
    },
};

// Aliases individuales para retrocompatibilidad con el resto del código
export const LH  = CONFIG.shelf.levelHeight;
export const UW  = CONFIG.shelf.moduleWidth;
export const UD  = CONFIG.shelf.moduleDepth;
export const CG  = CONFIG.shelf.columnGap;
export const FT  = CONFIG.shelf.frameThickness;
export const AW  = CONFIG.aisle.width;
export const PG  = CONFIG.aisle.pasilloPad;
export const H   = CONFIG.aisle.warehouseHeight;
export const EYE = CONFIG.player.eyeHeight;
export const PLAYER_R     = CONFIG.player.collisionRadius;
export const INV_RADIUS   = CONFIG.ui.inventoryRadius;
export const MMAP_SIZE    = CONFIG.ui.minimapSize;
export const PICK_ARRIVE_R = CONFIG.ui.pickArriveRadius;
export const HISTORY_KEY  = CONFIG.history.key;
export const HISTORY_MAX  = CONFIG.history.maxLen;
export const CORRIDOR_DIST = CONFIG.nav.corridorDist;
export const ENTRY_DIST    = CONFIG.nav.entryDist;
