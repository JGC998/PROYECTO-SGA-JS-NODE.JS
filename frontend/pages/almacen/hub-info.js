"use strict";
// Carga resumen del layout desde distribucion.json para el hub del almacén
fetch('./datos/distribucion.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
        if (!d) return;
        document.getElementById('info-nombre').textContent = d.nombre ?? '—';
        document.getElementById('info-dims').textContent =
            d.dimensiones ? (d.dimensiones.ancho + ' × ' + d.dimensiones.profundidad + ' m') : '—';
        document.getElementById('info-objs').textContent = d.objetos?.length ?? '—';
        document.getElementById('info-erp').textContent =
            d.objetos?.filter(function (o) { return o.tipo === 'estanteria' && o.meta?.pasillo; }).length ?? '—';
    }).catch(function () {});
