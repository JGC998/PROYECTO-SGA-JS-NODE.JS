import { UD, AW } from '../shared/configuracion.js';

// ── POSE DE ESTANTERÍA RESPECTO A PASILLO ─────────────────────
// Dado un objeto pasillo (con posicion/rotacion/dimensiones/meta),
// calcula la pose (x, z, rotY, ancho) que debe tener la estantería
// anclada a él en el lado y segmento indicados.
export function _calcShelfPoseFromPasillo(pasillo, lado, segmento = 1) {
    const W    = pasillo.dimensiones?.ancho     ?? AW;
    const L1   = pasillo.dimensiones?.longitud  ?? 6;
    const L2   = pasillo.dimensiones?.longitud2 ?? 0;
    const forma = pasillo.dimensiones?.forma    ?? 'recto';
    const rY   = (pasillo.rotacion?.y ?? 0) * Math.PI / 180;
    const cR   = Math.cos(rY), sR = Math.sin(rY);
    const px   = pasillo.posicion.x, pz = pasillo.posicion.z;

    const toWorld = (lx, lz) => ({
        x: px + cR * lx + sR * lz,
        z: pz - sR * lx + cR * lz,
    });

    if (segmento === 2 && (forma === 'L_derecha' || forma === 'L_izquierda')) {
        const dir      = forma === 'L_derecha' ? 1 : -1;
        const seg2CenterLX = dir * (W / 2 + L2 / 2);
        const seg2CenterLZ = L1 / 2 - W / 2;
        const ladoSign = (lado === 'D' ? -1 : +1) * dir;
        const offLZ    = ladoSign * (W / 2 + UD / 2);
        const wp       = toWorld(seg2CenterLX, seg2CenterLZ + offLZ);
        return { x: wp.x, z: wp.z, rotY: (pasillo.rotacion?.y ?? 0) % 360, ancho: L2 };
    }

    const ladoSign = lado === 'D' ? -1 : +1;
    const wp       = toWorld(ladoSign * (W / 2 + UD / 2), 0);
    return { x: wp.x, z: wp.z, rotY: ((pasillo.rotacion?.y ?? 0) + 90) % 360, ancho: L1 };
}

// ── PUNTOS DE ANCLAJE DE UN PASILLO ──────────────────────────
// Devuelve array de { name, x, z } para los extremos del pasillo
// (inicio/fin para rectos; más codo y fin_l para formas en L).
export function _pasilloAnchorPoints(pas) {
    const px = pas.posicion.x, pz = pas.posicion.z;
    const rY = (pas.rotacion?.y ?? 0) * Math.PI / 180;
    const cR = Math.cos(rY), sR = Math.sin(rY);
    const L1 = pas.dimensiones?.longitud  ?? 6;
    const W  = pas.dimensiones?.ancho     ?? AW;
    const forma = pas.dimensiones?.forma  ?? 'recto';
    const L2 = pas.dimensiones?.longitud2 ?? 0;
    const toWorld = (lx, lz) => ({ x: px + cR * lx + sR * lz, z: pz - sR * lx + cR * lz });

    const pts = [
        { name: 'inicio', ...toWorld(0, -L1 / 2) },
        { name: 'fin',    ...toWorld(0,  L1 / 2) },
    ];
    if (forma === 'L_derecha' || forma === 'L_izquierda') {
        const dir = forma === 'L_derecha' ? 1 : -1;
        pts.push({ name: 'codo',  ...toWorld(0,                  L1 / 2 - W / 2) });
        pts.push({ name: 'fin_l', ...toWorld(dir * (W / 2 + L2), L1 / 2 - W / 2) });
    }
    return pts;
}
