// ── ESTADO COMPARTIDO DEL EDITOR ──────────────────────────────
// Único objeto mutable importado por todos los módulos del editor.

export const TIPO_META = {
    estanteria:   { icon: '📦', color: 0x4a7fa5, label: 'Estantería' },
    pasillo:      { icon: '↕',  color: 0xfbbf24, label: 'Pasillo' },
    pared:        { icon: '🧱', color: 0x64748b, label: 'Pared' },
    zona_carga:   { icon: '🚛', color: 0xf59e0b, label: 'Zona Carga' },
    zona_oficina: { icon: '🖥',  color: 0x22c55e, label: 'Oficina' },
    columna:      { icon: '🏛',  color: 0x94a3b8, label: 'Pilar' },
    puerta:       { icon: '🚪', color: 0x8b5cf6, label: 'Puerta' },
};

export const EDITOR_STATE_KEY = 'sga_editor_state';
export const EDITOR_STATE_VER = 2;

export const st = {
    config: {
        version: 1,
        nombre: 'Nuevo Almacén',
        dimensiones: { ancho: 50, profundidad: 30, alto: 9 },
        objetos: [],
    },
    selectedId:      null,
    selectedIds:     new Set(),
    activeCamera:    'persp',
    transformMode:   'translate',
    meshById:        new Map(),
    labelById:       new Map(),
    history:         [],
    redoStack:       [],
    nextId:          1,
    _multiDragStart: null,
    GRID_SNAP:       0.5,
    ROT_SNAP:        90,
};

export function pushHistory() {
    st.history.push(structuredClone(st.config));
    if (st.history.length > 50) st.history.shift();
    st.redoStack.length = 0;
}

let _saveDebounceTimer = null;
export function _saveEditorState() {
    clearTimeout(_saveDebounceTimer);
    _saveDebounceTimer = setTimeout(() => {
        try {
            localStorage.setItem(EDITOR_STATE_KEY, JSON.stringify({ _v: EDITOR_STATE_VER, ...st.config }));
        } catch { /* sin cuota */ }
    }, 200);
}
