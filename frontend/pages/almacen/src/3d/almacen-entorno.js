import * as THREE from 'three';
import { AW, UW, CG, UD, H } from '../../js/shared/configuracion.js';
import { S, addCollider } from '../state/store.js';
import { makeSprite } from './sprites.js';
import { texSuelo, texTecho, texPared, cloneRepeat } from './almacen-assets.js';

// ── ENTORNO BASE (suelo / techo / paredes / vigas / luces) ────
export function buildBaseEnvironment(minX, maxX, minZ, maxZ) {
    const toRemove = [];
    S.scene.children.forEach(c => { if (c.userData.env) toRemove.push(c); });
    const matsSeen = new Set();
    toRemove.forEach(c => {
        S.scene.remove(c);
        if (!c.isMesh) return;
        c.geometry?.dispose();
        const mat = c.material;
        if (!mat || matsSeen.has(mat)) return;
        matsSeen.add(mat); mat.map?.dispose(); mat.dispose();
    });

    const W = maxX - minX, D = maxZ - minZ;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const addEnv = m => { m.userData.env = true; S.scene.add(m); };

    // Suelo
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
        new THREE.MeshLambertMaterial({ map: cloneRepeat(texSuelo, W * 0.5, D * 0.5) }));
    fl.rotation.x = -Math.PI / 2; fl.position.set(cx, 0, cz); fl.receiveShadow = true; addEnv(fl);

    // Techo
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
        new THREE.MeshLambertMaterial({ map: cloneRepeat(texTecho, W * 0.4, D * 0.4), side: THREE.DoubleSide }));
    roof.rotation.x = Math.PI / 2; roof.position.set(cx, H, cz); addEnv(roof);

    // Vigas
    const trussH  = H - 0.48;
    const beamMat = new THREE.MeshLambertMaterial({ color: 0x4a5a6a });
    const beamGeo = new THREE.BoxGeometry(W, 0.15, 0.15);
    for (let z = minZ + 4; z <= maxZ - 2; z += 8) {
        const b = new THREE.Mesh(beamGeo, beamMat); b.position.set(cx, trussH, z); addEnv(b);
    }

    // Luminarias
    const lampHM = new THREE.MeshLambertMaterial({ color: 0xd0d0d0 });
    const lampGM = new THREE.MeshBasicMaterial({ color: 0xfffff5 });
    const cordG  = new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4);
    const coneG  = new THREE.ConeGeometry(0.24, 0.22, 8);
    const bulbG  = new THREE.SphereGeometry(0.08, 6, 4);
    let lightIdx = 0;
    for (let z = minZ + 8; z < maxZ; z += 8, lightIdx++) {
        const cord = new THREE.Mesh(cordG, lampHM); cord.position.set(cx, trussH - 0.25, z); addEnv(cord);
        const cone = new THREE.Mesh(coneG, lampHM); cone.rotation.x = Math.PI; cone.position.set(cx, trussH - 0.61, z); addEnv(cone);
        const bulb = new THREE.Mesh(bulbG, lampGM); bulb.position.set(cx, trussH - 0.72, z); addEnv(bulb);
        // One PointLight every other fixture to halve draw calls while keeping visual fidelity
        if (lightIdx % 2 === 0) {
            const pl = new THREE.PointLight(0xfff8e7, 2.5, 18); pl.position.set(cx, H - 0.5, z); addEnv(pl);
        }
    }

    // Paredes
    const matPW = new THREE.MeshLambertMaterial({ map: cloneRepeat(texPared, W * 0.25, H * 0.3) });
    const matPD = new THREE.MeshLambertMaterial({ map: cloneRepeat(texPared, D * 0.25, H * 0.3) });
    [
        { geo: [W, H], mat: matPW, pos: [cx,   H/2, minZ], ry: 0 },
        { geo: [W, H], mat: matPW, pos: [cx,   H/2, maxZ], ry: Math.PI },
        { geo: [D, H], mat: matPD, pos: [minX, H/2, cz  ], ry:  Math.PI / 2 },
        { geo: [D, H], mat: matPD, pos: [maxX, H/2, cz  ], ry: -Math.PI / 2 },
    ].forEach(d => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(...d.geo), d.mat);
        m.position.set(...d.pos); m.rotation.y = d.ry; addEnv(m);
    });
}

// ── MARCAS DE SUELO ───────────────────────────────────────────
export function buildFloorMarkings(pNums, pBase, pasillosMap, wb, layoutConfig) {
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
        const bx     = pBase[p];
        const aisleX = bx + UD + AW / 2;
        const shelfRef = (layoutConfig?.objetos ?? []).find(o => o.tipo === 'estanteria' && o.meta?.pasillo === p);
        if (!shelfRef) continue;
        const aisleLen   = shelfRef.dimensiones.ancho;
        const aisleZ     = shelfRef.posicion.z;
        const isShelfNS  = Math.abs(Math.round(shelfRef.rotacion?.y ?? 0) % 180) === 90;
        const dash = new THREE.Mesh(
            isShelfNS
                ? new THREE.PlaneGeometry(0.12, aisleLen - 1.6)
                : new THREE.PlaneGeometry(aisleLen - 1.6, 0.12),
            dashMat.clone()
        );
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(aisleX, 0.009, aisleZ);
        dash.userData.wh = true;
        S.scene.add(dash);
    }
}

// ── GARITA / OFICINA DE CONTROL ───────────────────────────────
function _buildOficina(obj) {
    const pos   = obj.posicion ?? { x: 0, z: 0 };
    const w     = obj.dimensiones?.ancho        ?? 4;
    const d     = obj.dimensiones?.profundidad  ?? 3;
    const rotY  = (obj.rotacion?.y ?? 0) * Math.PI / 180;
    const wallH = 2.6;
    const wallT = 0.12;

    const g = new THREE.Group();
    g.position.set(pos.x, 0, pos.z);
    g.rotation.y = rotY;
    g.userData.wh = true;

    const matWall    = new THREE.MeshLambertMaterial({ color: 0xeae3d2 });
    const matWallOut = new THREE.MeshLambertMaterial({ color: 0xc7bfaf });
    const matFloor   = new THREE.MeshLambertMaterial({ color: 0x3b3b3b });
    const matCeiling = new THREE.MeshLambertMaterial({ color: 0xf3f4f6 });
    const matTrim    = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
    const matGlass   = new THREE.MeshLambertMaterial({ color: 0xb0d8e8, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
    const matDesk    = new THREE.MeshLambertMaterial({ color: 0x8b5e3c });
    const matMeta    = new THREE.MeshLambertMaterial({ color: 0x6b7280 });
    const matChair   = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const matScreen  = new THREE.MeshLambertMaterial({ color: 0x0ea5e9, emissive: 0x0369a1, emissiveIntensity: 0.5 });

    const addM = m => { m.castShadow = true; m.receiveShadow = true; g.add(m); };

    // Suelo interior
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, d - 0.02), matFloor);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.012;
    floor.receiveShadow = true; g.add(floor);

    // Techo
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), matCeiling);
    ceil.rotation.x = Math.PI / 2; ceil.position.y = wallH;
    g.add(ceil);

    // Cornisa superior
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.08, wallT + 0.04), matTrim);
    trim.position.set(0, wallH - 0.04, d / 2); addM(trim);

    // Pared trasera (z = +d/2)
    const backW = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, wallT), matWall);
    backW.position.set(0, wallH / 2, d / 2); addM(backW);

    // Pared izquierda (x = -w/2)
    const leftW = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, d), matWall);
    leftW.position.set(-w / 2, wallH / 2, 0); addM(leftW);

    // Pared derecha con hueco de puerta
    const doorW     = 1.0;
    const doorH     = 2.1;
    const sidePiece = (d - doorW) / 2;

    const rWFront = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, sidePiece), matWall);
    rWFront.position.set(w / 2, wallH / 2, -d / 2 + sidePiece / 2); addM(rWFront);
    const rWBack = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, sidePiece), matWall);
    rWBack.position.set(w / 2, wallH / 2, d / 2 - sidePiece / 2); addM(rWBack);
    const rWTop = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH - doorH, doorW), matWall);
    rWTop.position.set(w / 2, doorH + (wallH - doorH) / 2, 0); addM(rWTop);

    // Marco de la puerta
    const dFrameT = new THREE.Mesh(new THREE.BoxGeometry(wallT + 0.04, 0.07, doorW + 0.06), matTrim);
    dFrameT.position.set(w / 2, doorH + 0.035, 0); addM(dFrameT);
    const dFrameF = new THREE.Mesh(new THREE.BoxGeometry(wallT + 0.04, doorH, 0.06), matTrim);
    dFrameF.position.set(w / 2, doorH / 2, -doorW / 2 - 0.03); addM(dFrameF);
    const dFrameB = new THREE.Mesh(new THREE.BoxGeometry(wallT + 0.04, doorH, 0.06), matTrim);
    dFrameB.position.set(w / 2, doorH / 2, doorW / 2 + 0.03); addM(dFrameB);

    // Hoja de puerta abierta 90°
    const hinge = new THREE.Group();
    hinge.position.set(w / 2 + 0.02, 0, doorW / 2);
    hinge.rotation.y = Math.PI / 2;
    g.add(hinge);
    const panelD   = doorW - 0.05;
    const matDoor  = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.04, doorH - 0.05, panelD), matDoor);
    doorPanel.position.set(0, doorH / 2, -panelD / 2 - 0.02);
    doorPanel.castShadow = true; hinge.add(doorPanel);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.13, 8), new THREE.MeshLambertMaterial({ color: 0xb0b0b0 }));
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0.05, doorH * 0.42, -panelD + 0.12);
    hinge.add(handle);

    // Pared frontal con ventana (z = -d/2)
    const frontZ  = -d / 2;
    const jambaW  = 0.18;
    const glassW  = w - jambaW * 2;
    const zocaloH = 0.55;
    const glassH  = wallH - zocaloH - 0.20;
    const dintelH = wallH - zocaloH - glassH;

    const jambaL = new THREE.Mesh(new THREE.BoxGeometry(jambaW, wallH, wallT), matWallOut);
    jambaL.position.set(-w / 2 + jambaW / 2, wallH / 2, frontZ); addM(jambaL);
    const jambaR = new THREE.Mesh(new THREE.BoxGeometry(jambaW, wallH, wallT), matWallOut);
    jambaR.position.set(w / 2 - jambaW / 2, wallH / 2, frontZ); addM(jambaR);
    const zocalo = new THREE.Mesh(new THREE.BoxGeometry(glassW, zocaloH, wallT), matWallOut);
    zocalo.position.set(0, zocaloH / 2, frontZ); addM(zocalo);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(glassW, glassH, 0.04), matGlass);
    glass.position.set(0, zocaloH + glassH / 2, frontZ); g.add(glass);
    if (dintelH > 0.02) {
        const dintel = new THREE.Mesh(new THREE.BoxGeometry(glassW, dintelH, wallT), matWallOut);
        dintel.position.set(0, zocaloH + glassH + dintelH / 2, frontZ); addM(dintel);
    }
    const muntin = new THREE.Mesh(new THREE.BoxGeometry(glassW, 0.04, 0.06), matTrim);
    muntin.position.set(0, zocaloH + glassH / 2, frontZ); addM(muntin);

    // Mesa
    const deskW  = Math.min(w - 0.8, 1.7);
    const deskDp = 0.62;
    const deskH  = 0.76;
    const deskZ  = -d / 2 + deskDp / 2 + 0.32;
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(deskW, 0.05, deskDp), matDesk);
    deskTop.position.set(0, deskH, deskZ); addM(deskTop);
    const legGeo = new THREE.BoxGeometry(0.06, deskH - 0.05, 0.06);
    for (const [lx, lz] of [[-deskW/2+0.07,-deskDp/2+0.07],[deskW/2-0.07,-deskDp/2+0.07],[-deskW/2+0.07,deskDp/2-0.07],[deskW/2-0.07,deskDp/2-0.07]]) {
        const leg = new THREE.Mesh(legGeo, matMeta);
        leg.position.set(lx, (deskH - 0.05) / 2, deskZ + lz); addM(leg);
    }

    // Monitor
    const monW = 0.50, monH = 0.30;
    const monZ = deskZ - deskDp / 2 + 0.10;
    const mon = new THREE.Mesh(new THREE.BoxGeometry(monW, monH, 0.04), new THREE.MeshLambertMaterial({ color: 0x111827 }));
    mon.position.set(0, deskH + monH / 2 + 0.12, monZ); addM(mon);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(monW - 0.04, monH - 0.03), matScreen);
    scr.position.set(0, deskH + monH / 2 + 0.12, monZ + 0.025); g.add(scr);
    const mStand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), matMeta);
    mStand.position.set(0, deskH + 0.06, monZ); g.add(mStand);

    // Teclado
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.13), new THREE.MeshLambertMaterial({ color: 0x374151 }));
    kb.position.set(0, deskH + 0.015, deskZ + deskDp / 2 - 0.16); addM(kb);

    // Silla
    const chairZ = deskZ + deskDp / 2 + 0.42;
    const seatH  = 0.46;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.44), matChair);
    seat.position.set(0, seatH, chairZ); addM(seat);
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.06), matChair);
    backrest.position.set(0, seatH + 0.30, chairZ + 0.20); addM(backrest);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, seatH - 0.07, 6), matMeta);
    pole.position.set(0, (seatH - 0.07) / 2, chairZ); addM(pole);
    const wheelBase = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 5), matMeta);
    wheelBase.position.set(0, 0.03, chairZ); addM(wheelBase);

    // Luz interior cálida
    const light = new THREE.PointLight(0xfff5d6, 1.0, w + d + 2);
    light.position.set(0, wallH - 0.35, 0); g.add(light);
    const ceilingLight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff5d6 }));
    ceilingLight.position.set(0, wallH - 0.02, 0); g.add(ceilingLight);

    S.scene.add(g);

    // Colisionadores por cada segmento de pared (deja el hueco de puerta libre)
    const cosR    = Math.cos(rotY);
    const sinR    = Math.sin(rotY);
    const wallCol = (localCX, localCZ, lw, ld) => {
        const wx = pos.x + cosR * localCX + sinR * localCZ;
        const wz = pos.z - sinR * localCX + cosR * localCZ;
        // AABB of the rotated wall segment (works for any rotation angle)
        const aabbW = Math.abs(lw * cosR) + Math.abs(ld * sinR);
        const aabbD = Math.abs(lw * sinR) + Math.abs(ld * cosR);
        addCollider(wx, wz, aabbW, aabbD);
    };
    wallCol(0,        d / 2,                  w,         wallT + 0.05);
    wallCol(-w / 2,   0,                       wallT + 0.05, d);
    wallCol(w / 2,   -d / 2 + sidePiece / 2,  wallT + 0.05, sidePiece);
    wallCol(w / 2,    d / 2 - sidePiece / 2,  wallT + 0.05, sidePiece);
    wallCol(0,       -d / 2,                  w,         wallT + 0.05);

    // Etiqueta flotante
    const lbl = makeSprite('CONTROL');
    lbl.position.set(pos.x, wallH + 0.9, pos.z);
    lbl.userData.wh = true;
    S.scene.add(lbl);
}

// ── OBJETOS GENÉRICOS DEL EDITOR ──────────────────────────────
export function buildLayoutObject(obj) {
    const pos  = obj.posicion ?? { x: 0, y: 0, z: 0 };
    const dim  = obj.dimensiones ?? {};
    const rotY = (obj.rotacion?.y ?? 0) * Math.PI / 180;

    const add = m => { m.rotation.y = rotY; m.castShadow = m.receiveShadow = true; m.userData.wh = true; S.scene.add(m); };

    if (obj.tipo === 'pared') {
        const w = dim.ancho ?? 10, h = dim.alto ?? 5;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2),
            new THREE.MeshLambertMaterial({ map: cloneRepeat(texPared, w * 0.25, h * 0.3) }));
        m.position.set(pos.x, h / 2, pos.z);
        addCollider(pos.x, pos.z, w, 0.3);
        add(m);

    } else if (obj.tipo === 'zona_carga') {
        const w = dim.ancho ?? 8, d = dim.profundidad ?? 5;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d),
            new THREE.MeshLambertMaterial({ color: 0x1a2a3a }));
        m.position.set(pos.x, 0.03, pos.z);
        m.rotation.y = rotY; m.userData.wh = true; S.scene.add(m);
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.7 });
        for (let i = -1; i <= 1; i++) {
            const s = new THREE.Mesh(new THREE.PlaneGeometry(0.22, d - 0.4), stripeMat);
            s.rotation.x = -Math.PI / 2; s.position.set(pos.x + i * w * 0.28, 0.07, pos.z);
            s.userData.wh = true; S.scene.add(s);
        }
        const lbl = makeSprite('MUELLE');
        lbl.position.set(pos.x, 2.5, pos.z); lbl.userData.wh = true; S.scene.add(lbl);

    } else if (obj.tipo === 'zona_oficina') {
        _buildOficina(obj);

    } else if (obj.tipo === 'columna') {
        const h = H;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, h, 8),
            new THREE.MeshLambertMaterial({ color: 0x60727f }));
        m.position.set(pos.x, h / 2, pos.z);
        m.castShadow = true; m.userData.wh = true; S.scene.add(m);
        addCollider(pos.x, pos.z, 0.45, 0.45);

    } else if (obj.tipo === 'puerta') {
        const w = dim.ancho ?? 3, h = dim.alto ?? 4;
        const selloM = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
        const panelM = new THREE.MeshLambertMaterial({ color: 0x8a9aa8 });
        for (const sx of [-(w / 2 + 0.2), w / 2 + 0.2]) {
            const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, h + 0.4, 0.5), selloM);
            s.position.set(pos.x + sx, h / 2, pos.z); s.rotation.y = rotY; s.userData.wh = true; S.scene.add(s);
        }
        const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.4, 0.5), selloM);
        top.position.set(pos.x, h + 0.2, pos.z); top.rotation.y = rotY; top.userData.wh = true; S.scene.add(top);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, h, 0.1), panelM);
        panel.position.set(pos.x, h / 2, pos.z); panel.rotation.y = rotY; panel.userData.wh = true; S.scene.add(panel);
    }
}
