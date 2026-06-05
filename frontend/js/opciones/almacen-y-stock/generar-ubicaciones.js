"use strict";

const tbody       = document.querySelector('.left-panel tbody');
const btnOk       = document.querySelector('.btn-ok');
const preview     = document.getElementById('gu-preview');

const selDesdePas = document.getElementById('gu-desde-pasillo');
const selLateral  = document.getElementById('gu-lateral');
const selDesdeX   = document.getElementById('gu-desde-x');
const selDesdeY   = document.getElementById('gu-desde-y');
const inAncho     = document.getElementById('gu-ancho');
const inAlto      = document.getElementById('gu-alto');
const inPalets    = document.getElementById('gu-palets'); // checkbox
const inPicking   = document.getElementById('gu-picking');

let estructura = {}; // { pasillo: { lateral: { x_min, x_max, y_min, y_max } } }
const recienCreadas = new Set(); // etiquetas creadas en esta sesión, para resaltarlas en verde

function fillSelect(sel, values, placeholder) {
    sel.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') +
        values.map(v => `<option value="${v}">${v}</option>`).join('');
    sel.disabled = values.length === 0;
}

function numRange(min, max) {
    const arr = [];
    for (let i = min; i <= max; i++) arr.push(i);
    return arr;
}

function actualizarLateral() {
    const p = selDesdePas.value;
    if (!p || !estructura[p] || p === '') {
        selLateral.innerHTML = '<option value="">— elige pasillo —</option>';
        selLateral.disabled = true;
        limpiarXY();
        return;
    }
    const lados = Object.keys(estructura[p]).sort();
    const opciones = lados.length === 2
        ? [{ v: 'ambos', t: 'Ambos (I y D)' }, { v: 'I', t: 'Izquierda (I)' }, { v: 'D', t: 'Derecha (D)' }]
        : lados.map(l => ({ v: l, t: l === 'I' ? 'Izquierda (I)' : 'Derecha (D)' }));
    selLateral.innerHTML = opciones.map(o => `<option value="${o.v}">${o.t}</option>`).join('');
    selLateral.disabled = false;
    actualizarXY();
}

function actualizarXY() {
    const p = selDesdePas.value;
    const lat = selLateral.value;
    if (!p || !lat || !estructura[p]) { limpiarXY(); return; }

    const lados = lat === 'ambos' ? Object.keys(estructura[p]) : [lat];
    const xsSet = new Set();
    lados.forEach(l => {
        if (!estructura[p][l]) return;
        estructura[p][l].xs.forEach(x => xsSet.add(x));
    });

    const xs = [...xsSet].sort((a, b) => a - b);
    if (!xs.length) {
        limpiarXY();
        preview.textContent = 'No hay posiciones libres para este pasillo y lateral.';
        return;
    }

    fillSelect(selDesdeX, xs, '— elige columna —');
    selDesdeX.disabled = false;
    selDesdeY.innerHTML = '<option value="">— elige columna primero —</option>';
    selDesdeY.disabled = true;
    actualizarPreview();
}

function actualizarY() {
    const p = selDesdePas.value;
    const lat = selLateral.value;
    const x = +selDesdeX.value;
    if (!p || !lat || !x || !estructura[p]) { selDesdeY.innerHTML = '<option value="">—</option>'; selDesdeY.disabled = true; return; }

    const lados = lat === 'ambos' ? Object.keys(estructura[p]) : [lat];
    const ysLibres = new Set();
    lados.forEach(l => {
        if (!estructura[p][l]) return;
        const ocup = new Set(estructura[p][l].ocup || []);
        estructura[p][l].ys.forEach(y => {
            if (!ocup.has(`${x}-${y}`)) ysLibres.add(y);
        });
    });

    const ys = [...ysLibres].sort((a, b) => a - b);
    if (!ys.length) {
        selDesdeY.innerHTML = '<option value="">Sin alturas libres</option>';
        selDesdeY.disabled = true;
        preview.textContent = 'No hay alturas libres para esta columna.';
        return;
    }
    fillSelect(selDesdeY, ys, '— elige altura —');
    selDesdeY.disabled = false;
    actualizarPreview();
}

function limpiarXY() {
    [selDesdeX, selDesdeY].forEach(s => {
        s.innerHTML = '<option value="">—</option>';
        s.disabled = true;
    });
    preview.textContent = '';
}

function actualizarHastaPasillo() {
    actualizarLateral();
}

function actualizarPreview() {
    const p = selDesdePas.value;
    const lat = selLateral.value;
    const x = +selDesdeX.value;
    const y = +selDesdeY.value;
    if (!p || !lat || !x || !y) { preview.textContent = ''; return; }
    preview.textContent = `Ubicación a generar: P${p} ${lat === 'ambos' ? 'I y D' : lat} X${String(x).padStart(3,'0')} Y${String(y).padStart(3,'0')}`;
}

selDesdePas.addEventListener('change', actualizarHastaPasillo);
selLateral.addEventListener('change', actualizarXY);
selDesdeX.addEventListener('change', () => { actualizarY(); actualizarPreview(); });
selDesdeY.addEventListener('change', actualizarPreview);

btnOk.addEventListener('click', async () => {
    const p = selDesdePas.value;
    const lat = selLateral.value;
    const x = +selDesdeX.value;
    const y = +selDesdeY.value;
    if (!p || !lat || !x || !y) { alert('Selecciona pasillo, lateral, columna y altura.'); return; }
    if (!confirm(`¿Generar la ubicación P${p} ${lat === 'ambos' ? 'I y D' : lat} X${String(x).padStart(3,'0')} Y${String(y).padStart(3,'0')}?`)) return;

    const params = {
        desde_pasillo: +p, hasta_pasillo: +p,
        desde_lateral: lat === 'D' ? 21 : 11,
        hasta_lateral: lat === 'I' ? 11 : 21,
        desde_x: x, hasta_x: x,
        desde_y: y, hasta_y: y,
        ancho: +inAncho.value || 0,
        alto: +inAlto.value || 0,
        palets: inPalets.checked ? 1 : 0,
        multiple: 0,
        picking: inPicking.value,
    };

    btnOk.disabled = true;
    btnOk.textContent = 'Generando...';
    try {
        const res = await SGA.generarUbicaciones.generar(params);
        let msg = `✅ Proceso completado.\n\nCreadas: ${res.creadas ?? 0}`;
        if (res.listaExistentes && res.listaExistentes.length) {
            msg += `\n\nLas siguientes ${res.listaExistentes.length} ya existían:\n` + res.listaExistentes.join('\n');
        }
        if (res.creadas > 0) {
            const eti = `P${String(+p).padStart(3,'0')} ${lat === 'ambos' ? 'I' : lat} X${String(x).padStart(3,'0')} Y${String(y).padStart(3,'0')}`;
            recienCreadas.add(eti);
            if (lat === 'ambos') recienCreadas.add(`P${String(+p).padStart(3,'0')} D X${String(x).padStart(3,'0')} Y${String(y).padStart(3,'0')}`);
        }
        alert(msg);
        cargarUbicaciones();
        await cargarEstructura();
    } catch {
        alert('Error al generar ubicaciones.');
    } finally {
        btnOk.disabled = false;
        btnOk.textContent = 'Generar ubicaciones';
    }
});

async function cargarEstructura() {
    try {
        estructura = await fetch('/generar-ubicaciones/estructura').then(r => r.json());
        const pasillos = Object.keys(estructura).sort((a, b) => +a - +b);
        fillSelect(selDesdePas, pasillos, '— elige pasillo —');
        selLateral.innerHTML = '<option value="">— elige pasillo —</option>';
        selLateral.disabled = true;
        limpiarXY();
    } catch {
        selDesdePas.innerHTML = '<option value="">Error al cargar</option>';
    }
}

async function cargarUbicaciones() {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">Cargando...</td></tr>';
    try {
        const data = await SGA.mapaAlmacen.ubicaciones();
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">Sin ubicaciones.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map((r, i) => {
            const nueva = recienCreadas.has((r.etiqueta ?? '').trim());
            return `<tr${nueva ? ' class="gu-row-nueva"' : ''}>
                <td class="col-num">${i + 1}</td>
                <td>${r.ubicacion ?? ''}</td>
                <td>${r.etiqueta ?? ''}</td>
            </tr>`;
        }).join('');
    } catch {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">Error al cargar.</td></tr>';
    }
}

cargarEstructura();
cargarUbicaciones();
