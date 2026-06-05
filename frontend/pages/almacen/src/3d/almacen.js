import * as THREE from 'three';
import { LH, UW, UD, CG, AW, FT, EYE, PLAYER_R } from '../../js/shared/configuracion.js';
import { S, addCollider } from '../state/store.js';
import { makeSprite, makeSmallSprite } from './sprites.js';
import { buildNavGraph } from '../core/grafo.js';
import {
    M, matFull, matUnk, matHit, sMatFull, sMatEmpty, sMatUnk,
    postG, plkG, hitBoxG, boxG, boxGSmall, boxHSmall, sSlabG,
    boxW, boxH, boxD,
    SHARED_MATS, SHARED_GEOS,
} from './almacen-assets.js';
import { buildBaseEnvironment, buildFloorMarkings, buildLayoutObject } from './almacen-entorno.js';

export { addCollider, SHARED_MATS, SHARED_GEOS };
export { matFull, matUnk, matHit, sMatFull, sMatEmpty, sMatUnk, M };
export { postG, plkG, hitBoxG, boxG, boxGSmall, boxHSmall, sSlabG, boxW, boxH, boxD };

// ── CONSTANTES Y GEOMETRÍAS DE ESTRUCTURA (singleton) ─────────
const BH = FT * 2.8;  // altura de viga de carga
const BP = 0.04;      // grosor del tablón de balda

const vigaUnitG  = new THREE.BoxGeometry(1, BH, FT); // viga frontal/trasera (escala X = ancho)
const panelUnitG = new THREE.BoxGeometry(1, BP, 1);  // tablón de balda (escala X,Z); top=yBase, no penetra caja
SHARED_GEOS.add(vigaUnitG); SHARED_GEOS.add(panelUnitG);


// ── INSTANCED MESH POOLS ──────────────────────────────────────
// Cajas (solo cuando hay stock — niveles vacíos no se dibujan)
let _imBoxFull = null;
// Estructura procedural
let _imPost = null, _imViga = null, _imPanel = null;

// Objetos matemáticos reutilizables (evita allocations por celda)
const _axisY  = new THREE.Vector3(0, 1, 0);
const _pos    = new THREE.Vector3();
const _scaleV = new THREE.Vector3();
const _quat   = new THREE.Quaternion();
const _identQ = new THREE.Quaternion();
const _scale1 = new THREE.Vector3(1, 1, 1);
const _mat4   = new THREE.Matrix4();

function _makeIM(geo, mat, cap) {
    const im = new THREE.InstancedMesh(geo, mat, cap);
    im.count = 0; im.userData.wh = true; S.scene.add(im); return im;
}

function _initBoxSlabPools(maxCells) {
    _imBoxFull = _makeIM(boxG, matFull, maxCells);
}

function _initStructurePools(maxShelves) {
    const n = maxShelves + 4;
    _imPost  = _makeIM(postG,      M.frame, n * 4);   // 4 postes por estantería
    _imViga  = _makeIM(vigaUnitG,  M.frame, n * 14);  // hasta 7 niveles × 2 vigas
    _imPanel = _makeIM(panelUnitG, M.frame, n * 8);   // hasta 7 niveles + suelo
}

// Escribe una instancia en un IM: pos local → mundo, con escala variable
function _writeIM(im, localX, localY, localZ, qWorld, sx, sy, sz) {
    if (!im || im.count >= im.instanceMatrix.count) return;
    _pos.set(localX, localY, localZ).applyQuaternion(qWorld).add(_imWorldOff);
    _scaleV.set(sx, sy, sz);
    _mat4.compose(_pos, qWorld, _scaleV);
    im.setMatrixAt(im.count++, _mat4);
}
const _imWorldOff = new THREE.Vector3(); // se asigna antes de cada _buildFullShelf

// ── COLISIONES ────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
export function getFloorY(_x, _z, _curY = 0) { return 0; } // suelo plano; firma expuesta para extensión futura

export function collidesAt(x, z, curFeetY = 0) {
    if (x < S.wBounds.minX + PLAYER_R || x > S.wBounds.maxX - PLAYER_R) return true;
    if (z < S.wBounds.minZ + PLAYER_R || z > S.wBounds.maxZ - PLAYER_R) return true;
    const playerFloor = getFloorY(x, z, curFeetY);
    for (const c of S.colliders) {
        if (Math.abs(playerFloor - (c.floorY ?? 0)) > 2.5) continue;
        if (x > c.minX - PLAYER_R && x < c.maxX + PLAYER_R &&
            z > c.minZ - PLAYER_R && z < c.maxZ + PLAYER_R) return true;
    }
    return false;
}

// ── TELETRANSPORTE ────────────────────────────────────────────
export function teleportTo(loc) {
    S.vel.x = 0; S.vel.z = 0;
    const obj = S.controls.getObject();
    obj.position.set(loc.x, EYE, loc.z);
    obj.rotation.set(0, loc.yaw ?? 0, 0);
    S.camera.rotation.set(0, 0, 0);
    S.pickArrived = false;
}

// ── INICIALIZAR GRUPOS THREE ──────────────────────────────────
export function initWarehouseGroups() {
    S.pickMarkerGrp = new THREE.Group();
    S.lowStockGrp   = new THREE.Group();
    S.scene.add(S.pickMarkerGrp);
    S.scene.add(S.lowStockGrp);
}

// ── LIMPIAR ALMACÉN ───────────────────────────────────────────
export function clearWarehouse() {
    _imBoxFull = null;
    _imPost = _imViga = _imPanel = null;
    const toRemove = [];
    S.scene.children.forEach(c => { if (c.userData.wh) toRemove.push(c); });
    toRemove.forEach(c => {
        S.scene.remove(c);
        c.traverse(ch => {
            if (ch.isMesh) {
                if (!SHARED_GEOS.has(ch.geometry)) ch.geometry?.dispose();
                const mat = ch.material;
                if (mat) {
                    (Array.isArray(mat) ? mat : [mat]).forEach(m => {
                        if (!SHARED_MATS.has(m)) { m.map?.dispose(); m.dispose(); }
                    });
                }
            } else if (ch.isSprite && ch.material) {
                ch.material.map?.dispose();
                ch.material.dispose();
            }
        });
    });
    S.interactables.length = 0;
    S.colliders.length     = 0;
    S.shelfCols.length     = 0;
    S.officePos            = null;
    for (const w of S.workers) {
        S.scene.remove(w.mesh);
        w.mesh.traverse(ch => {
            if (ch.isSprite && ch.material) { ch.material.map?.dispose(); ch.material.dispose(); }
            else if (ch.isMesh) { ch.geometry?.dispose(); ch.material?.dispose(); }
        });
    }
    S.workers.length = 0;
}

// ── MODELO COMPLETO DE ESTANTERÍA ─────────────────────────────
function _buildFullShelf(cx, cz, ancho, totalH, rackRotY, niv, isI = false) {
    const actualRotY = rackRotY + (isI ? Math.PI : 0);
    _quat.setFromAxisAngle(_axisY, actualRotY);
    _imWorldOff.set(cx, 0, cz);
    const zF = -UD / 2 + FT / 2, zB = UD / 2 - FT / 2;
    for (const px of [-ancho / 2 + FT / 2, ancho / 2 - FT / 2]) {
        for (const pz of [zF, zB]) {
            _writeIM(_imPost, px, totalH / 2, pz, _quat, 1, totalH, 1);
        }
    }
    for (let lv = 0; lv <= niv; lv++) {
        const y = lv * LH;
        _writeIM(_imViga,  0, y + BH / 2,       zF, _quat, ancho,          1, 1);
        _writeIM(_imViga,  0, y + BH / 2,       zB, _quat, ancho,          1, 1);
        _writeIM(_imPanel, 0, y + BH - BP / 2,   0, _quat, ancho - FT * 2, 1, UD - FT * 2);
    }
}

// ── ESTANTERÍA DECORATIVA (sin pasillo ERP) ───────────────────
function _buildVisualOnlyShelf(obj) {
    const w     = obj.dimensiones?.ancho       ?? 1.5;
    const dep   = obj.dimensiones?.profundidad ?? UD;
    const nivs  = obj.dimensiones?.niveles     ?? 5;
    const altN  = obj.dimensiones?.alturaNivel ?? LH;
    const rotY  = (obj.rotacion?.y ?? 0) * Math.PI / 180;
    _buildFullShelf(obj.posicion.x, obj.posicion.z, w, nivs * altN, rotY, nivs, false);
    const isRot90 = Math.abs(Math.round(obj.rotacion?.y ?? 0) % 180) === 90;
    addCollider(obj.posicion.x, obj.posicion.z,
        isRot90 ? dep + 0.15 : w + 0.15,
        isRot90 ? w + 0.15   : dep + 0.15);
}

// ── CONSTRUIR COLUMNA DE ESTANTERÍA ──────────────────────────
export function buildShelf(u, cx, cz, stockIdx, pasNum, isI, yOffset = 0, rackRotY = 0, skipFrame = false) {
    const niv    = u.niveles.length;
    const totalH = niv * LH;

    if (!skipFrame) {
        _quat.setFromAxisAngle(_axisY, rackRotY);
        _imWorldOff.set(cx, yOffset, cz);
        const zF = -UW / 2 + FT / 2, zB = UW / 2 - FT / 2;
        for (const [px, pz] of [[-1,-1],[+1,-1],[-1,+1],[+1,+1]]) {
            _writeIM(_imPost, px * (UD/2-FT/2), totalH/2, pz * (UW/2-FT/2), _quat, 1, totalH, 1);
        }
        for (let lv = 0; lv <= niv; lv++) {
            const y = lv * LH;
            _writeIM(_imViga, 0, y + BH/2, zF, _quat, UD, 1, 1);
            _writeIM(_imViga, 0, y + BH/2, zB, _quat, UD, 1, 1);
        }
    }

    // Posición de la cara visible (para etiqueta y hitbox)
    const cosR       = Math.cos(rackRotY);
    const sinR       = Math.sin(rackRotY);
    const xFaceLocal = (isI ? -1 : 1) * (UD / 2 + 0.012);
    const faceWX     = cx + cosR * xFaceLocal;
    const faceWZ     = cz - sinR * xFaceLocal;

    const sorted = [...u.niveles].sort((a, b) => a.nivel - b.nivel);
    const code   = `P${pasNum}${u.lado}-X${String(u.col).padStart(2, '0')}`;

    for (let i = 0; i < sorted.length; i++) {
        const { nivel, ubi } = sorted[i];
        const k        = ubi.ubicacion ?? ubi.codigo ?? '';
        const stk      = stockIdx[k];
        const hasStock = stk && stk.total > 0;
        const yBase    = i * LH + BH;

        // Hitbox: invisible, en espacio mundial
        const hitBox = new THREE.Mesh(hitBoxG, matHit);
        hitBox.position.set(cx, yOffset + yBase + LH / 2, cz);
        hitBox.rotation.y = rackRotY;
        hitBox.userData.sd = { unit: u, nivel, ubi, stk, code, stockIdx };
        hitBox.userData.wh = true;
        S.interactables.push(hitBox);
        S.scene.add(hitBox);

        // Caja de cartón solo si hay stock — niveles vacíos/desconocidos no se dibujan
        if (hasStock && _imBoxFull && _imBoxFull.count < _imBoxFull.instanceMatrix.count) {
            _pos.set(cx, yOffset + yBase + boxH / 2, cz);
            _mat4.compose(_pos, _identQ, _scale1);
            _imBoxFull.setMatrixAt(_imBoxFull.count++, _mat4);
        }
    }

    // Etiqueta de columna
    const lbl = makeSmallSprite(`P${String(pasNum).padStart(2,'0')}-${u.lado}-X${String(u.col).padStart(2,'0')}`);
    lbl.position.set(faceWX, yOffset + EYE + 0.35, faceWZ);
    lbl.userData.wh = true;
    S.scene.add(lbl);

    const totalUnits   = sorted.reduce((s, { ubi }) => s + (stockIdx[ubi.ubicacion ?? '']?.total ?? 0), 0);
    const filledLevels = sorted.filter(({ ubi }) => (stockIdx[ubi.ubicacion ?? '']?.total ?? 0) > 0).length;
    S.shelfCols.push({ x: cx, z: cz, code, totalUnits, filledLevels, totalLevels: sorted.length });
}

// ── CONSTRUIR ALMACÉN DESDE LAYOUT ────────────────────────────
export function buildWarehouseFromLayout(layoutConfig, stockIdx) {
    clearWarehouse();

    // Pre-contar celdas, estanterías y columnas totales para dimensionar pools
    let totalCells = 0, totalShelves = 0, totalColumnas = 0;
    for (const obj of (layoutConfig.objetos ?? [])) {
        if (obj.tipo !== 'estanteria') continue;
        totalShelves++;
        if (!obj.meta?.pasillo) continue;
        const mc = obj.meta?.columnas ?? Math.max(1, Math.round(((obj.dimensiones?.ancho ?? 1.5) - 2) / (UW + CG)));
        const mn = obj.meta?.niveles  ?? obj.dimensiones?.niveles ?? 1;
        totalCells    += mc * mn;
        totalColumnas += mc;
    }
    _initBoxSlabPools(Math.max(totalCells + 64, 256));
    _initStructurePools(Math.max(totalShelves + 4, 16));

    const W = layoutConfig.dimensiones?.ancho        ?? 50;
    const D = layoutConfig.dimensiones?.profundidad   ?? 30;
    S.wBounds = { minX: 0, maxX: W, minZ: 0, maxZ: D };
    buildBaseEnvironment(S.wBounds.minX, S.wBounds.maxX, S.wBounds.minZ, S.wBounds.maxZ);

    const oficina = (layoutConfig.objetos ?? []).find(o => o.tipo === 'zona_oficina');
    S.officePos = oficina ? { x: oficina.posicion.x, z: oficina.posicion.z } : null;

    // Geometría de pasillos para routing de picking
    S.aisleInfo = new Map();
    for (const o of (layoutConfig.objetos ?? [])) {
        if (o.tipo !== 'pasillo' || !o.meta?.numero) continue;
        const rY = (o.rotacion?.y ?? 0) * Math.PI / 180;
        const dx = Math.sin(rY), dz = Math.cos(rY);
        const forma    = o.dimensiones?.forma ?? 'recto';
        const dirCodo  = forma === 'L_derecha' ? 1 : forma === 'L_izquierda' ? -1 : 0;
        S.aisleInfo.set(o.meta.numero, {
            x: o.posicion.x, z: o.posicion.z,
            dx, dz,
            longitud:  o.dimensiones?.longitud  ?? 0,
            ancho:     o.dimensiones?.ancho     ?? AW,
            forma,
            longitud2: o.dimensiones?.longitud2 ?? 0,
            dirCodo,
            perpX: Math.cos(rY), perpZ: -Math.sin(rY),
        });
    }

    const pNums = [], pBase = {}, pasillosMap = {};

    for (const obj of (layoutConfig.objetos ?? [])) {
        if (obj.tipo === 'pasillo') continue;
        if (obj.tipo !== 'estanteria') { buildLayoutObject(obj); continue; }

        const p    = obj.meta?.pasillo;
        const lado = obj.meta?.lado ?? 'D';
        const isI  = lado === 'I';
        if (!p) { _buildVisualOnlyShelf(obj); continue; }

        const cx       = obj.posicion.x;
        const czCent   = obj.posicion.z;
        const rackRotY = (obj.rotacion?.y ?? 0) * Math.PI / 180;
        const cosR     = Math.cos(rackRotY);
        const sinR     = Math.sin(rackRotY);
        const maxCol   = obj.meta?.columnas ?? Math.max(1, Math.round(((obj.dimensiones?.ancho ?? 1.5) - 2) / (UW + CG)));
        const maxNiv   = obj.meta?.niveles  ?? obj.dimensiones?.niveles ?? 1;

        if (!pasillosMap[p]) { pasillosMap[p] = []; pNums.push(p); }
        const bx = isI ? cx - UD - AW - UD / 2 : cx - UD / 2;
        if (pBase[p] === undefined || bx < pBase[p]) pBase[p] = bx;

        // DEBUG — borrar cuando se confirme fidelidad editor↔3D
        const _edgeMin = cx - UD / 2, _edgeMax = cx + UD / 2;
        const _shAncho = obj.dimensiones.ancho;
        console.log(`[3D] ${obj.id.padEnd(22)} P${p}${lado} x=${cx.toFixed(3)} z=${czCent.toFixed(3)} rot=${obj.rotacion?.y}° edgesX:[${_edgeMin.toFixed(3)}, ${_edgeMax.toFixed(3)}] zRange:[${(czCent - _shAncho / 2).toFixed(3)}, ${(czCent + _shAncho / 2).toFixed(3)}]`);

        for (let col = 1; col <= maxCol; col++) {
            const dz   = -obj.dimensiones.ancho / 2 + (col - 1) * (UW + CG) + UW / 2;
            const colX = cx + cosR * dz;
            const colZ = czCent - sinR * dz;
            const niveles = [];
            for (let niv = 1; niv <= maxNiv; niv++) {
                const etq = `P${String(p).padStart(3,'0')} ${lado} X${String(col).padStart(3,'0')} Y${String(niv).padStart(2,'0')}`;
                niveles.push({ nivel: niv, ubi: { ubicacion: etq, etiqueta: etq } });
            }
            const u = { pasillo: p, lado, col, shelfZ: czCent, niveles };
            pasillosMap[p].push(u);
            buildShelf(u, colX, colZ, stockIdx, p, isI, 0, rackRotY, true);
        }
        _buildFullShelf(cx, czCent, obj.dimensiones.ancho, maxNiv * LH, rackRotY, maxNiv, isI);

        const rotNorm = ((Math.round(obj.rotacion?.y ?? 0) % 360) + 360) % 360;
        if (rotNorm !== 0 && rotNorm !== 90 && rotNorm !== 180 && rotNorm !== 270)
            console.warn(`[almacen] P${obj.meta?.pasillo ?? '?'} rotación ${obj.rotacion?.y}° no ortogonal — colisionador AABB impreciso`);
        const isRot90 = rotNorm === 90 || rotNorm === 270;
        addCollider(cx, czCent,
            isRot90 ? UD + 0.1 : Math.max(obj.dimensiones.ancho - 1, 0.5),
            isRot90 ? Math.max(obj.dimensiones.ancho - 1, 0.5) : UD + 0.1);
    }

    pNums.sort((a, b) => a - b);

    // DEBUG: detectar estanterías del mismo plano Z que son adyacentes sin hueco
    {
        const shelfEdges = (layoutConfig.objetos ?? [])
            .filter(o => o.tipo === 'estanteria' && o.meta?.pasillo)
            .map(o => ({ id: o.id, posZ: o.posicion.z, minX: o.posicion.x - UD / 2, maxX: o.posicion.x + UD / 2 }))
            .sort((a, b) => a.minX - b.minX);
        for (let i = 0; i < shelfEdges.length - 1; i++) {
            const gap  = shelfEdges[i + 1].minX - shelfEdges[i].maxX;
            const sameZ = Math.abs(shelfEdges[i + 1].posZ - shelfEdges[i].posZ) < 5;
            if (gap < 0.1 && sameZ)
                console.warn(`[3D] ⚠ Sin hueco entre ${shelfEdges[i].id} (maxX=${shelfEdges[i].maxX.toFixed(3)}) y ${shelfEdges[i+1].id} (minX=${shelfEdges[i+1].minX.toFixed(3)}) — gap=${gap.toFixed(3)}m en z≈${shelfEdges[i].posZ}`);
        }
    }

    // Sprite de pasillo + luz puntual por pasillo
    for (const p of pNums) {
        const dObj   = (layoutConfig.objetos ?? []).find(o => o.tipo === 'estanteria' && o.meta?.pasillo === p && o.meta?.lado === 'D');
        const iObj   = (layoutConfig.objetos ?? []).find(o => o.tipo === 'estanteria' && o.meta?.pasillo === p && o.meta?.lado === 'I');
        const pasObj = (layoutConfig.objetos ?? []).find(o => o.tipo === 'pasillo'    && o.meta?.numero  === p);
        let aisleX, aisleZ, labelZ;
        if (dObj && iObj) {
            aisleX = (dObj.posicion.x + iObj.posicion.x) / 2;
            aisleZ = (dObj.posicion.z + iObj.posicion.z) / 2;
            labelZ = aisleZ - (dObj.dimensiones?.ancho ?? 4) / 2 - 0.5;
        } else if (dObj || iObj) {
            const ref = dObj ?? iObj;
            aisleX = ref.posicion.x; aisleZ = ref.posicion.z;
            labelZ = aisleZ - (ref.dimensiones?.ancho ?? 4) / 2 - 0.5;
        } else if (pasObj) {
            aisleX = pasObj.posicion.x; aisleZ = pasObj.posicion.z;
            labelZ = aisleZ - (pasObj.dimensiones?.longitud ?? 4) / 2 - 0.5;
        } else continue;

        // DEBUG — borrar cuando se confirme fidelidad editor↔3D
        console.log(`[3D] P${String(p).padStart(2,'0')} sprite: aisleX=${aisleX.toFixed(3)} aisleZ=${aisleZ.toFixed(3)} labelZ=${labelZ.toFixed(3)}`);

        const sp = makeSprite(`P${String(p).padStart(2,'0')}`);
        sp.position.set(aisleX, 3.8, labelZ); sp.userData.wh = true; S.scene.add(sp);
    }

    buildFloorMarkings(pNums, pBase, pasillosMap, S.wBounds, layoutConfig);
    _buildLocationMapFromLayout(pNums, pBase, pasillosMap, layoutConfig);

    const spawnOff = Math.max(PLAYER_R + 0.3, 1.5);
    S.controls.getObject().position.set(S.officePos?.x ?? spawnOff, EYE, S.officePos?.z ?? spawnOff);
    S.controls.getObject().rotation.y = Math.PI;
    S.camera.rotation.x = 0;

    // Finalizar matrices de todos los pools
    for (const im of [_imBoxFull, _imPost, _imViga, _imPanel]) {
        if (im) im.instanceMatrix.needsUpdate = true;
    }

    S.mmapLayout = { pNums, pBase, pasillosMap, wBounds: S.wBounds, layoutObjs: layoutConfig.objetos ?? [] };
    buildNavGraph();
}

function _buildLocationMapFromLayout(pNums, pBase, pasillosMap, layoutConfig) {
    S.LOCATION_MAP.clear();
    S.ubiToLocKey.clear();
    for (const p of pNums) {
        const dObj = (layoutConfig.objetos ?? []).find(o => o.tipo === 'estanteria' && o.meta?.pasillo === p && o.meta?.lado === 'D');
        const iObj = (layoutConfig.objetos ?? []).find(o => o.tipo === 'estanteria' && o.meta?.pasillo === p && o.meta?.lado === 'I');
        const aisleX = dObj && iObj
            ? (dObj.posicion.x + iObj.posicion.x) / 2
            : (dObj?.posicion.x ?? iObj?.posicion.x ?? 0);
        const aisleZ = dObj?.posicion.z ?? iObj?.posicion.z ?? 0;
        S.LOCATION_MAP.set(`P${String(p).padStart(2,'0')}`, { x: aisleX, z: aisleZ, yaw: 0 });

        for (const u of pasillosMap[p]) {
            const shelfObj = (layoutConfig.objetos ?? []).find(o => o.tipo === 'estanteria' && o.meta?.pasillo === p && o.meta?.lado === u.lado);
            if (!shelfObj) continue;
            const rotRad = (shelfObj.rotacion?.y ?? 0) * Math.PI / 180;
            const cosRS  = Math.cos(rotRad);
            const sinRS  = Math.sin(rotRad);
            const dz     = -shelfObj.dimensiones.ancho / 2 + (u.col - 1) * (UW + CG) + UW / 2;
            // For ~90° shelves columns vary along Z, X stays at aisle center.
            // For ~0° shelves columns vary along X, Z stays at aisle center.
            // u.shelfZ preserves the exact Z of the shelf section this unit came from.
            const colX   = Math.abs(cosRS) > 0.5 ? shelfObj.posicion.x + cosRS * dz : aisleX;
            const colZ   = Math.abs(sinRS) > 0.5 ? u.shelfZ - sinRS * dz : aisleZ;
            const locKey = `P${String(p).padStart(2,'0')}-${u.lado}-X${String(u.col).padStart(2,'0')}`;
            S.LOCATION_MAP.set(locKey, { x: colX, z: colZ, yaw: u.lado === 'I' ? -Math.PI / 2 : Math.PI / 2 });
            for (const { ubi } of u.niveles) {
                const raw = ubi.ubicacion ?? '';
                if (raw) S.ubiToLocKey.set(raw, locKey);
            }
        }
    }
}

// ── ALERTAS DE STOCK BAJO ─────────────────────────────────────
// Shared texture cache keyed by stock count — avoids duplicate canvases
const _alertTexCache = new Map();

function _getLowStockTex(units) {
    if (_alertTexCache.has(units)) return _alertTexCache.get(units);
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 52;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(239,68,68,0.97)';
    ctx.beginPath(); ctx.roundRect(3, 3, 122, 46, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`⚠ ${units} uds`, 64, 26);
    const tex = new THREE.CanvasTexture(cv);
    _alertTexCache.set(units, tex);
    return tex;
}

function _makeLowStockSprite(col) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: _getLowStockTex(col.totalUnits), transparent: true, depthTest: false,
    }));
    sp.scale.set(0.95, 0.38, 1);
    sp.renderOrder = 9;
    return sp;
}

export function buildLowStockAlerts() {
    if (!S.lowStockGrp) return;
    for (const ch of S.lowStockGrp.children) {
        if (ch.isSprite && ch.material) ch.material.dispose();
    }
    S.lowStockGrp.clear();
    // Dispose textures no longer needed and clear cache for fresh build
    _alertTexCache.forEach(tex => tex.dispose());
    _alertTexCache.clear();

    const lowCols = S.shelfCols.filter(c => c.totalUnits > 0 && c.totalUnits < S.LOW_STOCK_THRESH);
    let idx = 0;
    function addBatch() {
        const end = Math.min(idx + 8, lowCols.length);
        for (; idx < end; idx++) {
            const col = lowCols[idx];
            const sp = _makeLowStockSprite(col);
            sp.position.set(col.x, 4.1, col.z);
            S.lowStockGrp.add(sp);
        }
        if (idx < lowCols.length) requestAnimationFrame(addBatch);
    }
    addBatch();
}

export function animateLowStockAlerts(timeSec) {
    if (!S.lowStockGrp?.children.length) return;
    const op = 0.5 + 0.5 * Math.abs(Math.sin(timeSec * 2.4));
    for (const ch of S.lowStockGrp.children) ch.material.opacity = op;
}
