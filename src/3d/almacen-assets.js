import * as THREE from 'three';
import { LH, UW, UD, FT } from '../../js/shared/configuracion.js';

// ── TEXTURAS (singletons) ─────────────────────────────────────
const tLoader = new THREE.TextureLoader();
function _loadTex(url, rx, ry) {
    const t = tLoader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
}
export function cloneRepeat(base, rx, ry) {
    const t = base.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return t;
}
export const texSuelo = _loadTex('texturas/suelo.jpg',      30, 30);
export const texTecho = _loadTex('texturas/techo.jpg',      30, 30);
export const texPared = _loadTex('texturas/pared.jpg',      12,  4);
export const texRack  = _loadTex('texturas/warehouse_shelving_unit/textures/Rail_diffuseOriginal_baseColor.png', 1, 2);
export const texShelf = _loadTex('texturas/warehouse_shelving_unit/textures/Shelf_diffuseOriginal_baseColor.png', 2, 1);

export const texCardboard = (() => {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 512;
    const ctx = cv.getContext('2d');
    // Base cartón
    ctx.fillStyle = '#c4892d';
    ctx.fillRect(0, 0, 512, 512);
    // Corrugado horizontal
    ctx.strokeStyle = 'rgba(80,40,5,0.22)';
    ctx.lineWidth = 1.5;
    for (let y = 6; y < 512; y += 10) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
    }
    // Solapas (cruz central)
    ctx.strokeStyle = 'rgba(60,28,4,0.40)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(256, 0); ctx.lineTo(256, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(512, 256); ctx.stroke();
    // Icono fragile simplificado (paraguas)
    ctx.strokeStyle = 'rgba(60,28,4,0.30)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(128, 128, 28, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(128, 156); ctx.lineTo(128, 176); ctx.stroke();
    // Flechas arriba
    for (const px of [368, 400]) {
        ctx.beginPath(); ctx.moveTo(px, 120); ctx.lineTo(px, 160); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px - 8, 133); ctx.lineTo(px, 120); ctx.lineTo(px + 8, 133); ctx.stroke();
    }
    // Degradado sutil de volumen
    const g = ctx.createLinearGradient(0, 0, 512, 512);
    g.addColorStop(0, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
})();

// ── MATERIALES COMPARTIDOS ────────────────────────────────────
export const M = {
    frame: new THREE.MeshLambertMaterial({ map: texRack }),
    plank: new THREE.MeshLambertMaterial({ map: texRack }),
    aisle: new THREE.MeshLambertMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.14 }),
};
export const matFull = new THREE.MeshLambertMaterial({ map: texCardboard, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
export const matUnk  = new THREE.MeshLambertMaterial({ color: 0x8a9aaa, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
export const matHit  = new THREE.MeshLambertMaterial({ visible: false });
export const sMatFull  = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.82 });
export const sMatEmpty = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.72 });
export const sMatUnk   = new THREE.MeshBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.45 });

// ── GEOMETRÍAS COMPARTIDAS (singleton — no se disponen) ───────
export const postG   = new THREE.BoxGeometry(FT, 1, FT);
export const plkG    = new THREE.BoxGeometry(UD, FT, UW);
export const hitBoxG = new THREE.BoxGeometry(UD - 0.05, LH - 0.05, UW - 0.05);
export const boxW    = UD * 0.72;
export const boxH    = LH * 0.75;
export const boxD    = UW * 0.82;
export const boxG      = new THREE.BoxGeometry(boxW, boxH, boxD);
export const boxGSmall = new THREE.BoxGeometry(boxW * 0.55, boxH * 0.75, boxD * 0.48);
export const boxHSmall = boxH * 0.75;
export const sSlabG    = new THREE.PlaneGeometry(UW * 0.76, LH * 0.66);

// ── CONJUNTOS DE RECURSOS COMPARTIDOS (nunca se disponen) ─────
export const SHARED_MATS = new Set([
    M.frame, M.plank, M.aisle, matFull, matUnk, matHit, sMatFull, sMatEmpty, sMatUnk,
]);
export const SHARED_GEOS = new Set([postG, plkG, hitBoxG, boxG, boxGSmall, sSlabG]);

