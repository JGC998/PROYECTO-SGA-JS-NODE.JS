import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LH, UW, UD, CG, AW, PG, FT, EYE, H, PLAYER_R } from './configuracion.js';
import { S } from './estado.js';
import { makeSprite, makeSmallSprite } from './sprites.js';

// ── TEXTURAS (singletons) ─────────────────────────────────────
const tLoader  = new THREE.TextureLoader();
function _loadTex(url, rx, ry) {
    const t = tLoader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
}
function cloneRepeat(base, rx, ry) {
    const t = base.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return t;
}
const texSuelo   = _loadTex('texturas/suelo.jpg',     30, 30);
const texTecho   = _loadTex('texturas/techo.jpg',     30, 30);
const texPared   = _loadTex('texturas/pared.jpg',     12,  4);
const texRack    = _loadTex('texturas/metal_rack.png', 1,  3);

// ── MATERIALES COMPARTIDOS ────────────────────────────────────
export const M = {
    frame: new THREE.MeshLambertMaterial({ map: texRack }),
    plank: new THREE.MeshLambertMaterial({ color: 0x5a5a5a }),
    aisle: new THREE.MeshLambertMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.14 }),
};
export const matFull = new THREE.MeshLambertMaterial({ color: 0xc8874a }); // cartón sin textura
export const matUnk  = new THREE.MeshLambertMaterial({ color: 0x8a9aaa, transparent: true, opacity: 0.55 });
export const matHit  = new THREE.MeshLambertMaterial({ visible: false });
export const sMatFull  = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.82 });
export const sMatEmpty = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.72 });
export const sMatUnk   = new THREE.MeshBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.45 });

// ── GLTF SHELF MODEL (InstancedMesh) ─────────────────────────
let _instTemplate = null; // { subMeshes: [{geo, mat}], size, center }
let _instGrps = new Map(); // niv → InstancedMesh[] (one group per distinct level count)

export const shelfModelReady = new GLTFLoader()
    .loadAsync('warehouse_shelving_unit/scene.gltf')
    .then(gltf => {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = new THREE.Vector3(), center = new THREE.Vector3();
        box.getSize(size); box.getCenter(center);
        gltf.scene.updateMatrixWorld(true);
        const subMeshes = [];
        gltf.scene.traverse(ch => {
            if (!ch.isMesh) return;
            const geo = ch.geometry.clone();
            geo.applyMatrix4(ch.matrixWorld); // bake local+parent transforms into vertex data
            SHARED_GEOS.add(geo);             // prevent clearWarehouse from disposing it
            subMeshes.push({ geo, mat: ch.material });
        });
        _instTemplate = { subMeshes, size, center };
    })
    .catch(() => { _instTemplate = null; }); // fallback to procedural posts+planks

// ── GEOMETRÍAS COMPARTIDAS (singleton — no se disponen) ───────
export const postG   = new THREE.BoxGeometry(FT, 1, FT);
export const plkG    = new THREE.BoxGeometry(UD, FT, UW);
export const hitBoxG = new THREE.BoxGeometry(UD - 0.05, LH - 0.05, UW - 0.05);
const boxW = UD * 0.72, boxH = LH * 0.75, boxD = UW * 0.82;
export const boxG      = new THREE.BoxGeometry(boxW, boxH, boxD);
export const boxGSmall = new THREE.BoxGeometry(boxW * 0.55, boxH * 0.75, boxD * 0.48);
export const boxHSmall = boxH * 0.75;
export const sSlabG    = new THREE.PlaneGeometry(UW * 0.76, LH * 0.66);
export const SHARED_GEOS = new Set([postG, plkG, hitBoxG, boxG, boxGSmall, sSlabG]);

// ── COLISIONES ────────────────────────────────────────────────
export function addCollider(cx, cz, w, d, floorY = 0) {
    S.colliders.push({ minX: cx - w/2, maxX: cx + w/2, minZ: cz - d/2, maxZ: cz + d/2, floorY });
}

export function getFloorY(x, z, curFeetY = 0) {
    if (!S.mezzInfo) return 0;
    const { minX, maxX, mezzZ, mezzHH, maxZ, stairX1, stairX2, stairZBot } = S.mezzInfo;
    if (x >= stairX1 - 0.3 && x <= stairX2 + 0.3 && z >= stairZBot && z < mezzZ) {
        const t = Math.max(0, Math.min(1, (z - stairZBot) / (mezzZ - stairZBot)));
        return t * mezzHH;
    }
    if (z >= mezzZ && z <= maxZ + 0.5 && x >= minX + 0.3 && x <= maxX - 0.3) {
        return curFeetY > mezzHH * 0.45 ? mezzHH : 0;
    }
    return 0;
}

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
// Posiciona la cámara en loc {x, z, yaw}. El llamador gestiona
// cerrar paneles y llamar a resumeGame si procede.
export function teleportTo(loc) {
    S.vel.x = 0; S.vel.y = 0;
    const destFeet = S.mezzInfo && loc.z >= S.mezzInfo.mezzZ ? S.mezzInfo.mezzHH : 0;
    const obj = S.controls.getObject();
    obj.position.set(loc.x, getFloorY(loc.x, loc.z, destFeet) + EYE, loc.z);
    obj.rotation.set(0, loc.yaw ?? 0, 0);  // full Euler reset to prevent residual tilt
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
    const toRemove = [];
    S.scene.children.forEach(c => { if (c.userData.wh) toRemove.push(c); });
    toRemove.forEach(c => {
        S.scene.remove(c);
        c.traverse(ch => {
            if (ch.isMesh && !SHARED_GEOS.has(ch.geometry)) ch.geometry?.dispose();
        });
    });
    S.interactables.length = 0;
    S.colliders.length     = 0;
    S.shelfCols.length     = 0;
    S.mezzInfo             = null;
    for (const w of S.workers) S.scene.remove(w.mesh);
    S.workers.length = 0;
}

// ── CONSTRUIR ALMACÉN ─────────────────────────────────────────
export function buildWarehouse(unidades, stockIdx, pasillosMap) {
    clearWarehouse();
    _instGrps.clear(); // reset instanced mesh groups for fresh build
    const pNums = Object.keys(pasillosMap).map(Number).sort((a, b) => a - b);
    let curX = 0;
    const pBase = {};
    for (const p of pNums) { pBase[p] = curX; curX += UD + AW + UD + PG; }

    for (const p of pNums) {
        const bx      = pBase[p];
        const allU    = pasillosMap[p];
        const maxCol  = Math.max(...allU.map(u => u.col), 1);
        const aisleLen = maxCol * (UW + CG) + 2;

        const am = new THREE.Mesh(new THREE.PlaneGeometry(AW - 0.4, aisleLen), M.aisle);
        am.rotation.x = -Math.PI / 2;
        am.position.set(bx + UD + AW / 2, 0.008, aisleLen / 2 - 1);
        am.userData.wh = true;
        S.scene.add(am);

        const pl = new THREE.PointLight(0xfff5e0, 1.2, 22);
        pl.position.set(bx + UD + AW / 2, 5.5, aisleLen / 2);
        pl.userData.wh = true;
        S.scene.add(pl);

        const sp = makeSprite(`P${String(p).padStart(2, '0')}`);
        sp.position.set(bx + UD + AW / 2, 3.8, -0.5);
        sp.userData.wh = true;
        S.scene.add(sp);

        const MAX_GND_LEVELS = Math.floor((5.0 - 0.15) / LH);
        for (const u of allU) {
            const isI = u.lado === 'I';
            const cx  = isI ? bx + UD + AW + UD / 2 : bx + UD / 2;
            const cz  = (u.col - 1) * (UW + CG) + UW / 2;
            const cappedU = u.niveles.length > MAX_GND_LEVELS
                ? { ...u, niveles: u.niveles.slice(0, MAX_GND_LEVELS) }
                : u;
            buildShelf(cappedU, cx, cz, stockIdx, p, isI);
        }

        const collLen = aisleLen - 1, collZc = collLen / 2;
        addCollider(bx + UD / 2,           collZc, UD + 0.1, collLen);
        addCollider(bx + UD + AW + UD / 2, collZc, UD + 0.1, collLen);
    }

    if (!pNums.length) {
        S.mmapLayout = { pNums: [], pBase: {}, pasillosMap, wBounds: S.wBounds };
        return;
    }

    const totalW = pNums.length * (2 * UD + AW);
    const maxLen = Math.max(...pNums.map(p =>
        Math.max(...pasillosMap[p].map(u => u.col), 1) * (UW + CG) + 2
    ));
    const marginL = 3.0, marginR = 1.5, marginFront = 8.0, marginBack = 1.5;
    S.wBounds = { minX: -marginL, maxX: totalW + marginR, minZ: -marginFront, maxZ: maxLen + marginBack };
    buildEnvironment(S.wBounds.minX, S.wBounds.maxX, S.wBounds.minZ, S.wBounds.maxZ);

    const bx0 = pBase[pNums[0]];
    S.controls.getObject().position.set(
        bx0 + UD + AW / 2,
        EYE,
        -2.0
    );
    S.controls.getObject().rotation.y = Math.PI;
    S.camera.rotation.x = 0;

    S.mmapLayout = { pNums, pBase, pasillosMap, wBounds: S.wBounds };
    buildLocationMap(pNums, pBase, pasillosMap);
    buildFloorMarkings(pNums, pBase, pasillosMap, S.wBounds);
    buildMezzanineShelves(stockIdx);
}

// ── ESTANTERÍAS DEL ALTILLO ───────────────────────────────────
export function buildMezzanineShelves(stockIdx) {
    if (!S.mezzInfo) return;
    const { minX, maxX, mezzZ, mezzHH } = S.mezzInfo;
    const MW = maxX - minX;
    const COLS = 4, LEVELS = 3;
    const aisleX = minX + MW / 2;
    const zStart = mezzZ + 1.2;
    const zStep  = UW + CG;
    const allStk = Object.entries(stockIdx).filter(([, s]) => s?.total > 0);
    if (!allStk.length) return;
    let artIdx = 0;

    for (let col = 0; col < COLS; col++) {
        const cz = zStart + col * zStep;
        for (const [isI, cx] of [[true, aisleX + UD/2 + AW/2], [false, aisleX - UD/2 - AW/2]]) {
            const niveles = [];
            for (let lv = 1; lv <= LEVELS; lv++) {
                const [ubiCode] = allStk[artIdx % allStk.length] ?? ['', null];
                artIdx++;
                niveles.push({ nivel: lv, ubi: { ubicacion: ubiCode, codigo: ubiCode } });
            }
            const u = { pasillo: 90, lado: isI ? 'I' : 'D', col: col + 1, niveles };
            buildShelf(u, cx, cz, stockIdx, 90, isI, mezzHH + 0.11);
        }
        addCollider(aisleX - UD/2 - AW/2, cz, UD + 0.1, UW + 0.1, mezzHH);
        addCollider(aisleX + UD/2 + AW/2, cz, UD + 0.1, UW + 0.1, mezzHH);
    }

    const lbl = makeSprite('ALTILLO');
    lbl.position.set(aisleX, mezzHH + 4.5, mezzZ + COLS * zStep / 2);
    lbl.userData.wh = true;
    S.scene.add(lbl);
}

// ── CONSTRUIR ESTANTERÍA ──────────────────────────────────────
export function buildShelf(u, cx, cz, stockIdx, pasNum, isI, yOffset = 0) {
    const niv    = u.niveles.length;
    const totalH = niv * LH;
    const grp    = new THREE.Group();
    grp.userData.wh = true;

    if (_instTemplate) {
        const { size, center } = _instTemplate;
        const sx = UD / size.x, sy = totalH / size.y, sz = UW / size.z;
        const pos  = new THREE.Vector3(cx - center.x * sx, yOffset - center.y * sy + totalH / 2, cz - center.z * sz);
        const mat4 = new THREE.Matrix4().compose(pos, new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
        let grpMeshes = _instGrps.get(niv);
        if (!grpMeshes) {
            grpMeshes = _instTemplate.subMeshes.map(({ geo, mat }) => {
                const im = new THREE.InstancedMesh(geo, mat, 512);
                im.count = 0; im.castShadow = false; im.receiveShadow = true; im.userData.wh = true;
                S.scene.add(im);
                return im;
            });
            _instGrps.set(niv, grpMeshes);
        }
        const idx = grpMeshes[0].count;
        for (const im of grpMeshes) { im.setMatrixAt(idx, mat4); im.count++; im.instanceMatrix.needsUpdate = true; }
    } else {
        for (const [sx, sz] of [[-1,-1],[+1,-1],[-1,+1],[+1,+1]]) {
            const m = new THREE.Mesh(postG, M.frame);
            m.scale.y = totalH;
            m.position.set(sx * (UD/2 - FT/2), totalH/2, sz * (UW/2 - FT/2));
            m.castShadow = true;
            grp.add(m);
        }
        for (let lv = 0; lv <= niv; lv++) {
            const pk = new THREE.Mesh(plkG, M.plank);
            pk.position.set(0, lv * LH, 0);
            pk.receiveShadow = true;
            grp.add(pk);
        }
    }

    const sorted = [...u.niveles].sort((a, b) => a.nivel - b.nivel);
    const xFace  = (isI ? -1 : 1) * (UD / 2 + 0.012);
    const rotY   = isI ? Math.PI / 2 : -Math.PI / 2;
    const code   = `P${pasNum}${u.lado}-X${String(u.col).padStart(2, '0')}`;

    for (let i = 0; i < sorted.length; i++) {
        const { nivel, ubi } = sorted[i];
        const k        = ubi.ubicacion ?? ubi.codigo ?? '';
        const stk      = stockIdx[k];
        const hasStock = stk && stk.total > 0;
        const unknown  = !stk;
        const yBase    = i * LH + FT / 2;

        const hitBox = new THREE.Mesh(hitBoxG, matHit);
        hitBox.position.set(0, yBase + LH / 2, 0);
        hitBox.userData.sd = { unit: u, nivel, ubi, stk, code, stockIdx };
        S.interactables.push(hitBox);
        grp.add(hitBox);

        if (hasStock) {
            const box = new THREE.Mesh(boxG, matFull);
            box.position.set(0, yBase + boxH / 2, 0);
            grp.add(box);
        } else if (unknown) {
            const box = new THREE.Mesh(boxG, matUnk);
            box.position.set(0, yBase + boxH / 2, 0);
            grp.add(box);
        }

        const mat  = hasStock ? sMatFull : (unknown ? sMatUnk : sMatEmpty);
        const slab = new THREE.Mesh(sSlabG, mat);
        slab.position.set(xFace, yBase + LH / 2, 0);
        slab.rotation.y = rotY;
        grp.add(slab);
    }

    const labelTxt = `P${String(pasNum).padStart(2,'0')}-${u.lado}-X${String(u.col).padStart(2,'0')}`;
    const lbl = makeSmallSprite(labelTxt);
    lbl.position.set(xFace, EYE + 0.35, 0);
    grp.add(lbl);

    const totalUnits   = sorted.reduce((s, { ubi }) => s + (stockIdx[ubi.ubicacion ?? '']?.total ?? 0), 0);
    const filledLevels = sorted.filter(({ ubi }) => (stockIdx[ubi.ubicacion ?? '']?.total ?? 0) > 0).length;
    S.shelfCols.push({ x: cx, z: cz, code, totalUnits, filledLevels, totalLevels: sorted.length });

    grp.position.set(cx, yOffset, cz);
    S.scene.add(grp);
}

// ── MAPA DE UBICACIONES ───────────────────────────────────────
export function buildLocationMap(pNums, pBase, pasillosMap) {
    S.LOCATION_MAP.clear();
    S.ubiToLocKey.clear();
    for (const p of pNums) {
        const bx     = pBase[p];
        const aisleX = bx + UD + AW / 2;
        S.LOCATION_MAP.set(`P${String(p).padStart(2,'0')}`, { x: aisleX, z: 1.0, yaw: 0 });
        for (const u of pasillosMap[p]) {
            const colZ   = (u.col - 1) * (UW + CG) + UW / 2;
            const locKey = `P${String(p).padStart(2,'0')}-${u.lado}-X${String(u.col).padStart(2,'0')}`;
            const locData = { x: aisleX, z: colZ, yaw: u.lado === 'I' ? -Math.PI / 2 : Math.PI / 2 };
            S.LOCATION_MAP.set(locKey, locData);
            for (const { ubi } of u.niveles) {
                const rawCode = ubi.ubicacion ?? ubi.codigo ?? '';
                if (rawCode) S.ubiToLocKey.set(rawCode, locKey);
            }
        }
    }
}

// ── MARCAS DE SUELO ───────────────────────────────────────────
export function buildFloorMarkings(pNums, pBase, pasillosMap, wb) {
    const W   = wb.maxX - wb.minX;
    const cxW = (wb.minX + wb.maxX) / 2;
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.55 });
    const dashMat   = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.20 });

    for (const cz of [Math.max(wb.minZ + 0.8, -0.6), wb.maxZ - 0.8]) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.42), stripeMat.clone());
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(cxW, 0.009, cz);
        stripe.userData.wh = true;
        S.scene.add(stripe);
    }

    for (const p of pNums) {
        const bx       = pBase[p];
        const maxCol   = Math.max(...pasillosMap[p].map(u => u.col), 1);
        const aisleLen = maxCol * (UW + CG) + 2;
        const aisleX   = bx + UD + AW / 2;
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, aisleLen - 1.6), dashMat.clone());
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(aisleX, 0.009, aisleLen / 2 - 1);
        dash.userData.wh = true;
        S.scene.add(dash);
    }
}

// ── ENTORNO (suelo, techo, paredes, altillo, muelle, oficina) ─
export function buildEnvironment(minX, maxX, minZ, maxZ) {
    const toRemove = [];
    S.scene.children.forEach(c => { if (c.userData.env) toRemove.push(c); });
    const matsSeen = new Set();
    toRemove.forEach(c => {
        S.scene.remove(c);
        if (!c.isMesh) return;
        c.geometry?.dispose();
        const mat = c.material;
        if (!mat || matsSeen.has(mat)) return;
        matsSeen.add(mat);
        mat.map?.dispose();
        mat.dispose();
    });

    const W = maxX - minX, D = maxZ - minZ;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const addEnv = m => { m.userData.env = true; S.scene.add(m); };

    // Suelo
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
        new THREE.MeshLambertMaterial({ map: cloneRepeat(texSuelo, W * 0.5, D * 0.5) }));
    fl.rotation.x = -Math.PI / 2; fl.position.set(cx, 0, cz); fl.receiveShadow = true;
    addEnv(fl);

    // Techo
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
        new THREE.MeshLambertMaterial({ map: cloneRepeat(texTecho, W * 0.4, D * 0.4), side: THREE.DoubleSide }));
    roof.rotation.x = Math.PI / 2; roof.position.set(cx, H, cz);
    addEnv(roof);

    // Pilares estructurales
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x60727f });
    const safeMat   = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const PW = 0.28;
    const pillarGeo = new THREE.BoxGeometry(PW, H, PW);
    const bandGeo   = new THREE.BoxGeometry(PW + 0.02, 0.24, PW + 0.02);
    for (let z = minZ + 4; z <= maxZ - 2; z += 8) {
        for (const px of [minX + PW / 2, maxX - PW / 2]) {
            const pm = new THREE.Mesh(pillarGeo, pillarMat);
            pm.position.set(px, H / 2, z); pm.castShadow = true;
            addEnv(pm);
            const band = new THREE.Mesh(bandGeo, safeMat);
            band.position.set(px, 0.12, z);
            addEnv(band);
        }
    }

    // Vigas de techo
    const trussH  = H - 0.48;
    const beamMat = new THREE.MeshLambertMaterial({ color: 0x4a5a6a });
    const beamGeoH = new THREE.BoxGeometry(W, 0.15, 0.15);
    const beamGeoL = new THREE.BoxGeometry(0.15, 0.15, D);
    for (let z = minZ + 4; z <= maxZ - 2; z += 8) {
        const b = new THREE.Mesh(beamGeoH, beamMat); b.position.set(cx, trussH, z); addEnv(b);
    }
    for (const px of [minX + PW / 2, maxX - PW / 2]) {
        const lb = new THREE.Mesh(beamGeoL, beamMat); lb.position.set(px, trussH, cz); addEnv(lb);
    }

    // Luminarias industriales
    const lampHMat = new THREE.MeshLambertMaterial({ color: 0xd0d0d0 });
    const lampGMat = new THREE.MeshBasicMaterial({ color: 0xfffff5 });
    const cordGeo  = new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4);
    const coneGeo  = new THREE.ConeGeometry(0.24, 0.22, 8);
    const bulbGeo  = new THREE.SphereGeometry(0.08, 6, 4);
    for (let z = minZ + 8; z < maxZ; z += 8) {
        const cord = new THREE.Mesh(cordGeo, lampHMat); cord.position.set(cx, trussH - 0.25, z); addEnv(cord);
        const cone = new THREE.Mesh(coneGeo, lampHMat); cone.rotation.x = Math.PI; cone.position.set(cx, trussH - 0.61, z); addEnv(cone);
        const bulb = new THREE.Mesh(bulbGeo, lampGMat); bulb.position.set(cx, trussH - 0.72, z); addEnv(bulb);
        const pl = new THREE.PointLight(0xfff8e7, 1.5, 20); pl.position.set(cx, H - 0.5, z); addEnv(pl);
    }

    // Altillo / mezzanine
    const mezzZ  = minZ + D * 0.64;
    const mezzD  = maxZ - mezzZ;
    const mezzHH = 5.0;
    const mezzMat = new THREE.MeshLambertMaterial({ color: 0x506070 });
    const mezzFloor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.22, mezzD), mezzMat);
    mezzFloor.position.set(cx, mezzHH, mezzZ + mezzD / 2);
    mezzFloor.castShadow = mezzFloor.receiveShadow = true;
    addEnv(mezzFloor);
    const mezzRoof = new THREE.Mesh(new THREE.PlaneGeometry(W, mezzD),
        new THREE.MeshLambertMaterial({ map: cloneRepeat(texTecho, mezzD * 0.4, mezzD * 0.4), side: THREE.DoubleSide }));
    mezzRoof.rotation.x = Math.PI / 2; mezzRoof.position.set(cx, H, mezzZ + mezzD / 2);
    addEnv(mezzRoof);

    const mColMat = new THREE.MeshLambertMaterial({ color: 0x455060 });
    const mColGeo = new THREE.BoxGeometry(0.24, mezzHH, 0.24);
    const mColBandG = new THREE.BoxGeometry(0.26, 0.22, 0.26);
    const mColXN = Math.max(3, Math.round(W / 5));
    for (let i = 0; i <= mColXN; i++) {
        const px = minX + (W / mColXN) * i;
        for (const pz of [mezzZ + 0.12, maxZ - 0.12]) {
            const col = new THREE.Mesh(mColGeo, mColMat); col.position.set(px, mezzHH / 2, pz); col.castShadow = true; addEnv(col);
            const cb  = new THREE.Mesh(mColBandG, safeMat); cb.position.set(px, 0.11, pz); addEnv(cb);
        }
    }

    // Barandilla frontal altillo — con hueco para la escalera
    const railMat  = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const railH    = 1.05;
    // Hueco de la escalera: stepW=1.0, buffer=0.85 → gap de minX+0.3 a minX+2.15
    const _stairGapStart = minX + 0.3;
    const _stairGapEnd   = minX + 2.15;
    const _addRailSeg = (x1, x2, y) => {
        const w = x2 - x1;
        if (w < 0.05) return;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.07), railMat);
        seg.position.set(x1 + w / 2, y, mezzZ); addEnv(seg);
    };
    _addRailSeg(minX, _stairGapStart, mezzHH + railH);
    _addRailSeg(minX, _stairGapStart, mezzHH + railH * 0.5);
    _addRailSeg(_stairGapEnd, maxX, mezzHH + railH);
    _addRailSeg(_stairGapEnd, maxX, mezzHH + railH * 0.5);
    for (let rx = minX + 0.5; rx <= maxX; rx += 2.2) {
        if (rx > _stairGapStart && rx < _stairGapEnd) continue;
        const rp = new THREE.Mesh(new THREE.BoxGeometry(0.07, railH, 0.07), railMat);
        rp.position.set(rx, mezzHH + railH / 2, mezzZ); addEnv(rp);
    }

    // Escalera de acceso al altillo
    const stepMat  = new THREE.MeshLambertMaterial({ color: 0x50616e });
    const stepW    = 1.0;
    const steps    = 8;
    const rise     = mezzHH / steps;
    const run      = 0.46;
    const stairCX  = minX + stepW / 2 + 0.3;
    for (let s = 0; s < steps; s++) {
        const sh   = rise * (s + 1);
        const step = new THREE.Mesh(new THREE.BoxGeometry(stepW, sh, run), stepMat);
        step.position.set(stairCX, sh / 2, mezzZ - (steps - 1 - s) * run - run / 2);
        step.castShadow = step.receiveShadow = true;
        addEnv(step);
    }
    const stairRunTotal = steps * run;
    const handrailLen   = Math.sqrt(mezzHH * mezzHH + stairRunTotal * stairRunTotal);
    const handrailAngle = Math.atan2(mezzHH, stairRunTotal);
    const srail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, handrailLen + 0.2), railMat);
    srail.rotation.x = -handrailAngle;
    srail.position.set(stairCX + stepW * 0.46, mezzHH / 2 + 0.92, mezzZ - stairRunTotal / 2);
    addEnv(srail);
    for (const [pz, ph] of [[mezzZ - stairRunTotal + 0.1, 0.9], [mezzZ - 0.1, 0.95]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.95, 6), railMat);
        post.position.set(stairCX + stepW * 0.46, ph / 2 + (pz === mezzZ - 0.1 ? mezzHH : 0), pz);
        addEnv(post);
    }

    // Collider borde altillo (con hueco escalera)
    const stairGapEnd = minX + 0.3 + stepW + 0.85;
    const railSegW = maxX - stairGapEnd;
    if (railSegW > 0.3) addCollider((stairGapEnd + maxX) / 2, mezzZ, railSegW, 0.18, mezzHH);

    S.mezzInfo = { minX, maxX, mezzZ, mezzHH, maxZ,
        stairX1: minX + 0.3, stairX2: minX + 0.3 + stepW, stairZBot: mezzZ - steps * run };

    const mezzPl = new THREE.PointLight(0xfff0d8, 1.2, 16);
    mezzPl.position.set(cx, mezzHH + 1.5, mezzZ + mezzD / 2); addEnv(mezzPl);

    // Paredes
    const matPW = new THREE.MeshLambertMaterial({ map: cloneRepeat(texPared, W * 0.25, H * 0.3) });
    const matPD = new THREE.MeshLambertMaterial({ map: cloneRepeat(texPared, D * 0.25, H * 0.3) });
    [
        { geo: [W, H], mat: matPW, pos: [cx,   H/2, minZ], ry: 0          },
        { geo: [W, H], mat: matPW, pos: [cx,   H/2, maxZ], ry: Math.PI    },
        { geo: [D, H], mat: matPD, pos: [minX, H/2, cz  ], ry: Math.PI/2  },
        { geo: [D, H], mat: matPD, pos: [maxX, H/2, cz  ], ry: -Math.PI/2 },
    ].forEach(d => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(...d.geo), d.mat);
        m.position.set(...d.pos); m.rotation.y = d.ry; addEnv(m);
    });

    // Muelle de carga
    const dockD = Math.min(3.5, D * 0.12);
    const dockW = W * 0.48;
    const dockCX = cx + W * 0.18;
    const dockZ  = minZ + dockD / 2;
    const dockMat = new THREE.MeshLambertMaterial({ color: 0x3d4f5c });
    const dockFloor = new THREE.Mesh(new THREE.BoxGeometry(dockW, 0.18, dockD), dockMat);
    dockFloor.position.set(dockCX, 0.09, dockZ); dockFloor.receiveShadow = true; addEnv(dockFloor);
    const dockStripeMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.7 });
    for (let xi = 0; xi < 3; xi++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.22, dockD - 0.3), dockStripeMat);
        s.rotation.x = -Math.PI / 2; s.position.set(dockCX - dockW * 0.3 + xi * dockW * 0.3, 0.19, dockZ); addEnv(s);
    }
    // Puertas seccionales de muelle de carga
    const matSello = new THREE.MeshLambertMaterial({ color: 0x1a1a1a }); // goma perimetral
    const matPanel = new THREE.MeshLambertMaterial({ color: 0x8a9aa8 }); // paneles metálicos
    const matLev   = new THREE.MeshLambertMaterial({ color: 0x333333 }); // nivelador de suelo
    const numDocPanels = 5, panH = 0.76;
    for (let di = 0; di < 2; di++) {
        const doorX = dockCX - dockW / 4 + di * dockW / 2;
        // Marco de goma (dock shelter)
        for (const sx of [-1.7, 1.7]) {
            const side = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.0, 0.5), matSello);
            side.position.set(doorX + sx, 2.0, minZ + 0.25); addEnv(side);
        }
        const top = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.4, 0.5), matSello);
        top.position.set(doorX, 4.2, minZ + 0.25); addEnv(top);
        // Paneles seccionales
        for (let pi = 0; pi < numDocPanels; pi++) {
            const pn = new THREE.Mesh(new THREE.BoxGeometry(3.2, panH, 0.1), matPanel);
            pn.position.set(doorX, panH / 2 + pi * (panH + 0.02), minZ + 0.04); addEnv(pn);
        }
        // Nivelador de muelle (rampa de suelo)
        const lev = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 1.5), matLev);
        lev.position.set(doorX, 0.05, minZ + 0.75); addEnv(lev);
    }

    // Zona de oficina
    const offW  = Math.min(2.8, Math.abs(minX) - 0.3);
    const offD  = Math.min(4.5, D * 0.14);
    const offCX = minX + offW / 2;
    const offZc = minZ + offD / 2;
    const wallH = 3.2, offDoorW = 1.1, offDoorH = 2.1;
    const offWallMat = new THREE.MeshLambertMaterial({ color: 0xd0c8b8 });
    const frameMat   = new THREE.MeshLambertMaterial({ color: 0x9a8a70 });

    for (const [pw, ppx] of [[offW * 0.3, minX + offW * 0.15], [offW * 0.3, minX + offW * 0.85]]) {
        const pw2 = new THREE.Mesh(new THREE.BoxGeometry(pw, wallH, 0.12), offWallMat);
        pw2.position.set(ppx, wallH/2, minZ + 0.06); pw2.castShadow = true; addEnv(pw2);
        addCollider(ppx, minZ + 0.06, pw + 0.1, 0.18);
    }
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x90c8e0, transparent: true, opacity: 0.38 });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(offW * 0.38, wallH * 0.55, 0.06), glassMat);
    glass.position.set(offCX, wallH * 0.55, minZ + 0.03); addEnv(glass);

    const offSideL = new THREE.Mesh(new THREE.BoxGeometry(0.12, wallH, offD), offWallMat);
    offSideL.position.set(minX + 0.06, wallH/2, offZc); offSideL.castShadow = true; addEnv(offSideL);

    const solidLen = offD - offDoorW - 0.05;
    const solidZc  = minZ + solidLen / 2;
    const offSideR = new THREE.Mesh(new THREE.BoxGeometry(0.12, wallH, solidLen), offWallMat);
    offSideR.position.set(minX + offW, wallH/2, solidZc); offSideR.castShadow = true; addEnv(offSideR);
    addCollider(minX + offW, solidZc, 0.18, solidLen);
    const lintelZc = minZ + solidLen + offDoorW / 2;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.12, wallH - offDoorH, offDoorW), offWallMat);
    lintel.position.set(minX + offW, offDoorH + (wallH - offDoorH)/2, lintelZc); addEnv(lintel);
    for (const fz of [minZ + solidLen, minZ + offD]) {
        const jamba = new THREE.Mesh(new THREE.BoxGeometry(0.07, offDoorH, 0.07), frameMat);
        jamba.position.set(minX + offW, offDoorH/2, fz); addEnv(jamba);
    }
    const headFr = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, offDoorW + 0.08), frameMat);
    headFr.position.set(minX + offW, offDoorH, lintelZc); addEnv(headFr);
    const offRoof = new THREE.Mesh(new THREE.BoxGeometry(offW, 0.14, offD),
        new THREE.MeshLambertMaterial({ color: 0xb0a898 }));
    offRoof.position.set(offCX, wallH, offZc); addEnv(offRoof);
    const ctrlSign = makeSprite('CONTROL');
    ctrlSign.position.set(offCX, wallH + 0.8, offZc);
    addEnv(ctrlSign);

    // Mobiliario de oficina
    const deskX = offCX - 0.1, deskZ = minZ + 1.05, deskTopH = 0.74, deskWM = offW * 0.68;
    const deskMat = new THREE.MeshLambertMaterial({ color: 0x9b7a40 });
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(deskWM, 0.05, 0.68), deskMat);
    deskTop.position.set(deskX, deskTopH, deskZ); deskTop.castShadow = true; addEnv(deskTop);
    addCollider(deskX, deskZ, deskWM + 0.15, 0.82);
    const legG = new THREE.BoxGeometry(0.07, deskTopH, 0.07);
    const legM = new THREE.MeshLambertMaterial({ color: 0x7a5c28 });
    for (const [lx, lz] of [[-deskWM*0.44,-0.28],[deskWM*0.44,-0.28],[-deskWM*0.44,0.28],[deskWM*0.44,0.28]]) {
        const leg = new THREE.Mesh(legG, legM); leg.position.set(deskX + lx, deskTopH/2, deskZ + lz); addEnv(leg);
    }
    const monMat  = new THREE.MeshLambertMaterial({ color: 0x1e1e2e });
    const monBody = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.34, 0.05), monMat);
    monBody.position.set(deskX, deskTopH + 0.22, deskZ - 0.25); addEnv(monBody);
    const screenGl = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, 0.01), new THREE.MeshBasicMaterial({ color: 0x2244bb }));
    screenGl.position.set(deskX, deskTopH + 0.22, deskZ - 0.23); addEnv(screenGl);
    const monStand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.06), monMat);
    monStand.position.set(deskX, deskTopH + 0.075, deskZ - 0.25); addEnv(monStand);
    const cpuMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.30), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
    cpuMesh.position.set(deskX + deskWM * 0.35, deskTopH + 0.19, deskZ - 0.12); addEnv(cpuMesh);
    const chairMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const seatMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.52), chairMat);
    seatMesh.position.set(deskX, 0.50, deskZ + 0.55); addEnv(seatMesh);
    const backMesh = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.44, 0.07), chairMat);
    backMesh.position.set(deskX, 0.74, deskZ + 0.78); addEnv(backMesh);
    const cLegMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const cLegG   = new THREE.CylinderGeometry(0.024, 0.024, 0.47, 5);
    for (const [clx, clz] of [[-0.21,-0.21],[0.21,-0.21],[-0.21,0.21],[0.21,0.21]]) {
        const cl = new THREE.Mesh(cLegG, cLegMat); cl.position.set(deskX + clx, 0.235, deskZ + 0.55 + clz); addEnv(cl);
    }
    const chairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 8), cLegMat);
    chairBase.position.set(deskX, 0.02, deskZ + 0.55); addEnv(chairBase);
    const archShelf = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.26), deskMat);
    archShelf.position.set(minX + 0.38, 1.42, deskZ + 0.3); addEnv(archShelf);
    const bookCols = [0xcc4444, 0x4466cc, 0x44aa44, 0xcc9900];
    for (let bi = 0; bi < 4; bi++) {
        const bk = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.19 + bi * 0.02, 0.22),
            new THREE.MeshLambertMaterial({ color: bookCols[bi] }));
        bk.position.set(minX + 0.25 + bi * 0.1, 1.52 + bi * 0.01, deskZ + 0.22); addEnv(bk);
    }
}

// ── ALERTAS DE STOCK BAJO ─────────────────────────────────────
function _makeLowStockSprite(col) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 52;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(239,68,68,0.97)';
    ctx.beginPath(); ctx.roundRect(3, 3, 122, 46, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`⚠ ${col.totalUnits} uds`, 64, 26);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false
    }));
    sp.scale.set(0.95, 0.38, 1);
    sp.renderOrder = 9;
    return sp;
}

export function buildLowStockAlerts() {
    if (!S.lowStockGrp) return;
    S.lowStockGrp.clear();
    for (const col of S.shelfCols) {
        if (col.totalUnits <= 0 || col.totalUnits >= S.LOW_STOCK_THRESH) continue;
        const sp = _makeLowStockSprite(col);
        sp.position.set(col.x, 4.1, col.z);
        S.lowStockGrp.add(sp);
    }
}

export function animateLowStockAlerts(timeSec) {
    if (!S.lowStockGrp?.children.length) return;
    const op = 0.5 + 0.5 * Math.abs(Math.sin(timeSec * 2.4));
    for (const ch of S.lowStockGrp.children) ch.material.opacity = op;
}
