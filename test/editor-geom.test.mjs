// Tests para _calcShelfPoseFromPasillo() y _pasilloAnchorPoints()
// Importa directamente desde editor-geom.js (solo depende de configuracion.js).

import { _calcShelfPoseFromPasillo, _pasilloAnchorPoints } from '../js/editor/editor-geom.js';
import { UD, AW } from '../js/shared/configuracion.js';

const EPS = 1e-6;
function near(a, b, msg) {
    if (Math.abs(a - b) > EPS)
        throw new Error(`${msg ?? ''}: ${a} ≠ ${b} (diff ${Math.abs(a-b).toExponential(2)})`);
}
function eq(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg ?? ''}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`);
}
function ok(v, msg) { if (!v) throw new Error(msg ?? 'Aserción fallida'); }

// Pasillo recto de referencia: en el origen, sin rotación
const PAS_RECTO = {
    posicion: { x: 0, z: 0 },
    rotacion: { y: 0 },
    dimensiones: { longitud: 10, ancho: AW, forma: 'recto', longitud2: 0 },
    meta: { numero: 1 },
};

export const tests = [
    // ── _calcShelfPoseFromPasillo ─────────────────────────────────
    {
        name: 'pasillo recto en origen — estantería D, seg 1',
        fn() {
            const p = _calcShelfPoseFromPasillo(PAS_RECTO, 'D', 1);
            // Lado D: a la izquierda (ladoSign = -1), offset = -(AW/2 + UD/2)
            near(p.x, -(AW / 2 + UD / 2), 'x');
            near(p.z, 0, 'z');
            near(p.ancho, 10, 'ancho');
        },
    },
    {
        name: 'pasillo recto en origen — estantería I, seg 1',
        fn() {
            const p = _calcShelfPoseFromPasillo(PAS_RECTO, 'I', 1);
            near(p.x, AW / 2 + UD / 2, 'x');
            near(p.z, 0, 'z');
        },
    },
    {
        name: 'pasillo desplazado — posición se traslada correctamente',
        fn() {
            const pas = { ...PAS_RECTO, posicion: { x: 5, z: 8 } };
            const pD  = _calcShelfPoseFromPasillo(pas, 'D', 1);
            const pI  = _calcShelfPoseFromPasillo(pas, 'I', 1);
            near(pD.x, 5 - (AW / 2 + UD / 2), 'D.x');
            near(pD.z, 8, 'D.z');
            near(pI.x, 5 + (AW / 2 + UD / 2), 'I.x');
        },
    },
    {
        name: 'pasillo rotado 90° — ejes intercambiados',
        fn() {
            const pas = { ...PAS_RECTO, rotacion: { y: 90 } };
            const p   = _calcShelfPoseFromPasillo(pas, 'D', 1);
            // Con rotY=90°: cR=cos(π/2)≈0, sR=sin(π/2)≈1
            // toWorld(ladoSign*(AW/2+UD/2), 0) = (0 + sR*0, 0 - sR*ladoSign*(AW/2+UD/2))
            // ladoSign=-1: x = cR*(-)(AW/2+UD/2) = 0; z = cR*0 = 0... let me verify
            // Actually toWorld(lx,lz) = {x: px+cR*lx+sR*lz, z: pz-sR*lx+cR*lz}
            // lx = -1*(AW/2+UD/2), lz=0, cR≈0, sR≈1
            // x = 0 + 0*lx + 1*0 = 0
            // z = 0 - 1*(-)(AW/2+UD/2) + 0 = AW/2+UD/2
            near(p.x, 0, 'x');
            near(p.z, AW / 2 + UD / 2, 'z');
        },
    },
    {
        name: 'rotY de la estantería D, seg 1 = pasillo.rotY + 90',
        fn() {
            const pas = { ...PAS_RECTO, rotacion: { y: 45 } };
            const p   = _calcShelfPoseFromPasillo(pas, 'D', 1);
            near(p.rotY, (45 + 90) % 360, 'rotY');
        },
    },
    {
        name: 'L_derecha seg 2 — ancho = longitud2',
        fn() {
            const pas = {
                posicion: { x: 0, z: 0 }, rotacion: { y: 0 },
                dimensiones: { longitud: 10, ancho: AW, forma: 'L_derecha', longitud2: 6 },
                meta: { numero: 2 },
            };
            const p = _calcShelfPoseFromPasillo(pas, 'D', 2);
            near(p.ancho, 6, 'ancho seg2');
        },
    },

    // ── _pasilloAnchorPoints ──────────────────────────────────────
    {
        name: 'pasillo recto — 2 puntos (inicio / fin)',
        fn() {
            const pts = _pasilloAnchorPoints(PAS_RECTO);
            eq(pts.length, 2);
            ok(pts.find(p => p.name === 'inicio'), 'falta inicio');
            ok(pts.find(p => p.name === 'fin'),    'falta fin');
        },
    },
    {
        name: 'inicio y fin simétricamente a lo largo del eje Z (sin rotación)',
        fn() {
            const pts = _pasilloAnchorPoints(PAS_RECTO);
            const ini = pts.find(p => p.name === 'inicio');
            const fin = pts.find(p => p.name === 'fin');
            near(ini.x, 0, 'ini.x'); near(ini.z, -5, 'ini.z');
            near(fin.x, 0, 'fin.x'); near(fin.z,  5, 'fin.z');
        },
    },
    {
        name: 'pasillo L_derecha — 4 puntos (inicio/fin/codo/fin_l)',
        fn() {
            const pas = {
                posicion: { x: 0, z: 0 }, rotacion: { y: 0 },
                dimensiones: { longitud: 10, ancho: AW, forma: 'L_derecha', longitud2: 6 },
                meta: { numero: 3 },
            };
            const pts = _pasilloAnchorPoints(pas);
            eq(pts.length, 4);
            ok(pts.find(p => p.name === 'codo'),  'falta codo');
            ok(pts.find(p => p.name === 'fin_l'), 'falta fin_l');
        },
    },
    {
        name: 'pasillo desplazado — coordenadas se trasladan',
        fn() {
            const pas = { ...PAS_RECTO, posicion: { x: 3, z: 7 } };
            const pts = _pasilloAnchorPoints(pas);
            const ini = pts.find(p => p.name === 'inicio');
            near(ini.x, 3, 'ini.x traslado');
            near(ini.z, 7 - 5, 'ini.z traslado');
        },
    },
    {
        name: 'pasillo rotado 90° — inicio y fin a lo largo del eje X',
        fn() {
            const pas = { ...PAS_RECTO, rotacion: { y: 90 } };
            const pts = _pasilloAnchorPoints(pas);
            const ini = pts.find(p => p.name === 'inicio');
            const fin = pts.find(p => p.name === 'fin');
            // Con rY=90°: toWorld(0,-L1/2) = {x:sR*(-L1/2), z:-cR*0+cR*(-L1/2)}... wait
            // toWorld(0, -5) = {x: 0+cR*0+sR*(-5), z: 0-sR*0+cR*(-5)} = {x:-5*sR, z:-5*cR}
            // cR=cos(π/2)≈0, sR=sin(π/2)≈1 → x≈-5, z≈0
            near(ini.x, -5, 'ini.x rot90');
            near(ini.z,  0, 'ini.z rot90');
            near(fin.x,  5, 'fin.x rot90');
        },
    },
];
