"use strict";

const tbody      = document.querySelector('.left-panel tbody');
const btnOk      = document.querySelector('.btn-ok');
const preview    = document.getElementById('gu-preview');

// Inputs
const inDesdePas = document.getElementById('gu-desde-pasillo');
const inHastaPas = document.getElementById('gu-hasta-pasillo');
const inLateral  = document.getElementById('gu-lateral');
const inDesdeX   = document.getElementById('gu-desde-x');
const inHastaX   = document.getElementById('gu-hasta-x');
const inDesdeY   = document.getElementById('gu-desde-y');
const inHastaY   = document.getElementById('gu-hasta-y');
const inAncho    = document.getElementById('gu-ancho');
const inAlto     = document.getElementById('gu-alto');
const inPalets   = document.getElementById('gu-palets');
const inMultiple = document.getElementById('gu-multiple');
const inPicking  = document.getElementById('gu-picking');

function calcTotal() {
    const dp = parseInt(inDesdePas.value) || 0;
    const hp = parseInt(inHastaPas.value) || 0;
    const dx = parseInt(inDesdeX.value)   || 1;
    const hx = parseInt(inHastaX.value)   || 1;
    const dy = parseInt(inDesdeY.value)   || 1;
    const hy = parseInt(inHastaY.value)   || 1;
    const lados = inLateral.value === 'ambos' ? 2 : 1;
    if (!dp || !hp || dp > hp) return 0;
    return Math.max(hp - dp + 1, 0) * lados * Math.max(hx - dx + 1, 0) * Math.max(hy - dy + 1, 0);
}

function actualizarPreview() {
    const total = calcTotal();
    if (!total) { preview.textContent = ''; return; }
    const dp = String(parseInt(inDesdePas.value) || 1).padStart(3, '0');
    const hp = String(parseInt(inHastaPas.value) || 1).padStart(3, '0');
    const lat = inLateral.value === 'ambos' ? 'I y D' : inLateral.value;
    preview.textContent = `Se generarán ${total.toLocaleString('es-ES')} ubicaciones — P${dp}→P${hp} · Lateral: ${lat} · X${inDesdeX.value||1}→X${inHastaX.value||1} · Y${inDesdeY.value||1}→Y${inHastaY.value||1}`;
}

[inDesdePas, inHastaPas, inLateral, inDesdeX, inHastaX, inDesdeY, inHastaY]
    .forEach(el => el.addEventListener('input', actualizarPreview));

async function cargarUbicaciones() {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Cargando...</td></tr>';
    try {
        const data = await SGA.ubicaciones.list({ buscar: '' });
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Sin ubicaciones.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map((r, i) => `
            <tr>
                <td class="col-num">${i + 1}</td>
                <td><input type="checkbox"></td>
                <td>${r.ubicacion ?? ''}</td>
                <td>${r.etiqueta ?? ''}</td>
            </tr>`).join('');
    } catch {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Error al cargar.</td></tr>';
    }
}

btnOk.addEventListener('click', async () => {
    const total = calcTotal();
    if (!total) { alert('Rellena los campos de pasillo correctamente.'); return; }
    if (!confirm(`¿Generar ${total.toLocaleString('es-ES')} ubicaciones?`)) return;

    const lateral = inLateral.value;
    const params = {
        desde_pasillo: parseInt(inDesdePas.value) || 1,
        hasta_pasillo: parseInt(inHastaPas.value) || 1,
        desde_lateral: lateral === 'D' ? 21 : 11,
        hasta_lateral: lateral === 'I' ? 11 : 21,
        desde_x:  parseInt(inDesdeX.value)  || 1,
        hasta_x:  parseInt(inHastaX.value)  || 1,
        desde_y:  parseInt(inDesdeY.value)  || 1,
        hasta_y:  parseInt(inHastaY.value)  || 1,
        ancho:    parseInt(inAncho.value)   || 0,
        alto:     parseInt(inAlto.value)    || 0,
        palets:   parseInt(inPalets.value)  || 0,
        multiple: inMultiple.checked ? 1 : 0,
        picking:  inPicking.value,
    };

    btnOk.disabled = true;
    btnOk.textContent = 'Generando...';
    try {
        const res = await SGA.generarUbicaciones.generar(params);
        let msg = `✅ Proceso completado.\n\nCreadas: ${res.creadas ?? 0}`;
        if (res.listaExistentes && res.listaExistentes.length) {
            msg += `\n\nLas siguientes ${res.listaExistentes.length} ya existían y no se han modificado:\n`;
            msg += res.listaExistentes.join('\n');
        }
        alert(msg);
        cargarUbicaciones();
    } catch {
        alert('Error al generar ubicaciones.');
    } finally {
        btnOk.disabled = false;
        btnOk.textContent = 'Generar ubicaciones';
    }
});

cargarUbicaciones();
