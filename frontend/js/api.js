const API = 'http://localhost:3000';

async function _get(path) {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
}

async function _post(path, body) {
    const res = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
    return res.json();
}

const SGA = {
    articulos: {
        list: (q = '') => _get(`/articulos${q ? '?q=' + encodeURIComponent(q) : ''}`),
        get: cod => _get(`/articulos/${encodeURIComponent(cod)}`),
    },
    proveedores: {
        list: () => _get('/proveedores'),
        get: cod => _get(`/proveedores/${encodeURIComponent(cod)}`),
    },
    clientes: {
        list: () => _get('/clientes'),
        get: cod => _get(`/clientes/${encodeURIComponent(cod)}`),
    },
    operarios: {
        list: () => _get('/operarios'),
        get: cod => _get(`/operarios/${encodeURIComponent(cod)}`),
    },
    almacenes: {
        list: () => _get('/almacenes'),
        save: data => _post('/almacenes', data),
    },
    ubicaciones: {
        list: (params = {}) => _get('/ubicaciones?' + new URLSearchParams(params)),
        save: data => _post('/ubicaciones', data),
    },
    stock: {
        get: cod => _get(`/stock/${encodeURIComponent(cod)}`),
    },
    movimientos: {
        list: (params = {}) => _get('/movimientos-por-articulo?' + new URLSearchParams(params)),
    },
    articulosPorUbicacion: {
        list: (params = {}) => _get('/articulos-por-ubicacion?' + new URLSearchParams(params)),
    },
    articulosSinReposicion: {
        list: () => _get('/articulos-sin-reposicion'),
        save: data => _post('/articulos-sin-reposicion', data),
    },
    consultaStock: {
        list: (params = {}) => _get('/consulta-de-stock?' + new URLSearchParams(params)),
    },
    minimosMaximos: {
        list: (params = {}) => _get('/minimos-maximos?' + new URLSearchParams(params)),
        save: filas => _post('/minimos-maximos', filas),
    },
    subfamilias: {
        list: () => _get('/subfamilias'),
        save: filas => _post('/subfamilias', filas),
    },
    observaciones: {
        list: (params = {}) => _get('/observaciones-articulo-lote?' + new URLSearchParams(params)),
        save: filas => _post('/observaciones-articulo-lote', filas),
    },
    loteExclusivo: {
        list: (params = {}) => _get('/lote-exclusivo?' + new URLSearchParams(params)),
        save: filas => _post('/lote-exclusivo', filas),
    },
    loteMinimo: {
        list: (params = {}) => _get('/lote-minimo?' + new URLSearchParams(params)),
        save: filas => _post('/lote-minimo', filas),
    },
    loteNoUtilizado: {
        list: (params = {}) => _get('/lote-no-utilizado?' + new URLSearchParams(params)),
        save: filas => _post('/lote-no-utilizado', filas),
    },
    loteCuarentena: {
        list: (params = {}) => _get('/lote-cuarentena?' + new URLSearchParams(params)),
    },
    terminales: {
        list: () => _get('/terminales-pda'),
        save: data => _post('/terminales-pda', data),
    },
    entradas: {
        save: data => _post('/entrada', data),
    },
    salidas: {
        save: data => _post('/salida', data),
    },
    traspasos: {
        save: data => _post('/traspaso', data),
    },
    visor: {
        articulos: () => _get('/visor/articulos'),
        proveedores: () => _get('/visor/proveedores'),
        clientes: () => _get('/visor/clientes'),
    },
    regularizaciones: {
        list: (params = {}) => _get('/regularizaciones?' + new URLSearchParams(params)),
    },
    expediciones: {
        list: (params = {}) => _get('/expediciones?' + new URLSearchParams(params)),
    },
    picking: {
        list: (params = {}) => _get('/picking?' + new URLSearchParams(params)),
    },
    situacionPedidos: {
        list: (params = {}) => _get('/situacion-pedidos-venta?' + new URLSearchParams(params)),
    },
    usuarios: {
        list: (params = {}) => _get('/usuarios?' + new URLSearchParams(params)),
        save: data => _post('/usuarios', data),
    },
    configuracionEmpresa: {
        get: () => _get('/configuracion-empresa'),
        save: data => _post('/configuracion-empresa', data),
    },
    contadores: {
        get: () => _get('/contadores'),
    },
    generarUbicaciones: {
        generar: data => _post('/generar-ubicaciones', data),
    },
    borrarPicking: {
        borrar: data => _post('/borrar-picking', data),
    },
    ponerCeroCarrusel: {
        poner: () => _post('/poner-cero-carrusel', {}),
    },
    copiaSeguridad: {
        crear: () => _post('/copia-seguridad', {}),
    },
    estadisticas: {
        resumen:              (p={}) => _get('/estadisticas/resumen?'              + new URLSearchParams(p)),
        movimientosPorDia:    (p={}) => _get('/estadisticas/movimientos-por-dia?' + new URLSearchParams(p)),
        topArticulos:         (p={}) => _get('/estadisticas/top-articulos?'       + new URLSearchParams(p)),
        entradasVsSalidas:    (p={}) => _get('/estadisticas/entradas-vs-salidas?' + new URLSearchParams(p)),
        alertasStock:         (p={}) => _get('/estadisticas/alertas-stock?'       + new URLSearchParams(p)),
        trabajadores:         (p={}) => _get('/estadisticas/trabajadores?'        + new URLSearchParams(p)),
        almacen:              (p={}) => _get('/estadisticas/almacen?'             + new URLSearchParams(p)),
        porTipo:              (p={}) => _get('/estadisticas/por-tipo?'            + new URLSearchParams(p)),
        proveedoresActividad: (p={}) => _get('/estadisticas/proveedores-actividad?' + new URLSearchParams(p)),
        articulosAnalisis:    (p={}) => _get('/estadisticas/articulos-analisis?'  + new URLSearchParams(p)),
    },
    dashboard: {
        get: (desde, hasta) => {
            const p = new URLSearchParams();
            if (desde) p.set('desde', desde);
            if (hasta) p.set('hasta', hasta);
            return _get('/estadisticas/dashboard?' + p);
        },
        alertas: () => _get('/estadisticas/alertas'),
    },
    traspasoInventario: {
        traspasar: data => _post('/traspasar-inventarios', data),
        importarRegularizaciones: data => _post('/importar-regularizaciones', data),
        asignarFechaStock: data => _post('/asignar-fecha-stock-inicial', data),
    },
};
