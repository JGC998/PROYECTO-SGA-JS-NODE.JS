import { UD, AW, LH, UW, CG, PG } from '../shared/configuracion.js';
import { st, pushHistory }          from './editor-state.js';
import { scene, snap, _clampToBoundsMesh, showStatus } from './editor-core.js';
import {
    añadirObjeto, eliminarObjeto, rebuildMesh,
    seleccionar, deseleccionarTodo,
    syncPropsFromSelected, updateObjList,
    _nextPasilloNum,
} from './editor-objetos.js';
import { updateConfigFromScene }    from './editor-io.js';
import {
    _calcShelfPoseFromPasillo,
    _pasilloAnchorPoints,
} from './editor-geom.js';

export { _calcShelfPoseFromPasillo, _pasilloAnchorPoints };

// ── ANCLAJE DE ESTANTERÍAS A PASILLOS ─────────────────────────

export function _aplicarPoseAEstanteria(estObj, pose) {
    estObj.posicion.x = +pose.x.toFixed(3);
    estObj.posicion.z = +pose.z.toFixed(3);
    estObj.rotacion.y = +pose.rotY.toFixed(2);
    estObj.dimensiones.ancho       = +pose.ancho.toFixed(3);
    estObj.dimensiones.profundidad = UD;
    if (estObj.dimensiones.alturaNivel == null) estObj.dimensiones.alturaNivel = LH;
    if (estObj.dimensiones.niveles == null)     estObj.dimensiones.niveles     = 5;
    rebuildMesh(estObj.id);
}

export function sincronizarEstanteriasAncladas(pasilloObj) {
    if (!pasilloObj || pasilloObj.tipo !== 'pasillo') return;
    const num = pasilloObj.meta?.numero;
    if (!num) return;
    for (const est of st.config.objetos) {
        if (est.tipo !== 'estanteria' || est.meta?.pasillo !== num) continue;
        const lado = est.meta?.lado ?? 'D';
        const seg  = est.meta?.segmento ?? 1;
        const pose = _calcShelfPoseFromPasillo(pasilloObj, lado, seg);
        _aplicarPoseAEstanteria(est, pose);
    }
}

// ── AUTO-RELLENAR PASILLO I+D ─────────────────────────────────
export function autoRellenarPasilloIDe() {
    if (!st.selectedId) return;
    const pasillo = st.config.objetos.find(o => o.id === st.selectedId);
    if (!pasillo || pasillo.tipo !== 'pasillo') return;
    const num = pasillo.meta?.numero;
    if (!num) { showStatus('⚠ El pasillo no tiene número', true); return; }

    const yaAncladas = st.config.objetos.filter(o => o.tipo === 'estanteria' && o.meta?.pasillo === num);
    if (yaAncladas.length) {
        const ok = confirm(`Ya hay ${yaAncladas.length} estanterías ancladas al pasillo P${String(num).padStart(3,'0')}. ¿Eliminar y recrear?`);
        if (!ok) return;
        for (const o of yaAncladas) eliminarObjeto(o.id);
    }

    pushHistory();
    const forma    = pasillo.dimensiones?.forma ?? 'recto';
    const segmentos = (forma === 'L_derecha' || forma === 'L_izquierda') ? [1, 2] : [1];
    const dimBase  = { niveles: 5, alturaNivel: LH, profundidad: UD };
    const label    = `P${String(num).padStart(3, '0')}`;

    for (const seg of segmentos) {
        for (const lado of ['D', 'I']) {
            const pose = _calcShelfPoseFromPasillo(pasillo, lado, seg);
            añadirObjeto('estanteria', {
                etiqueta: segmentos.length > 1 ? `${label}-${seg} ${lado}` : `${label} ${lado}`,
                posicion: { x: pose.x, y: 0, z: pose.z },
                rotacion: { y: pose.rotY },
                dimensiones: { ...dimBase, ancho: pose.ancho },
                meta: { pasillo: num, lado, segmento: seg },
            });
        }
    }
    seleccionar(pasillo.id);
    showStatus(`✓ Estanterías I+D creadas para ${label}`);
}

// ── DIRECCIÓN DE PASILLO ──────────────────────────────────────
function _pasilloDirZ(pas) {
    const rY = (pas.rotacion?.y ?? 0) * Math.PI / 180;
    return { dx: Math.sin(rY), dz: Math.cos(rY) };
}
function _pasilloDirX(pas) {
    const rY = (pas.rotacion?.y ?? 0) * Math.PI / 180;
    return { dx: Math.cos(rY), dz: -Math.sin(rY) };
}
function _pasilloEndpoint(pas, lado) {
    const L1 = pas.dimensiones?.longitud ?? 6;
    const d  = _pasilloDirZ(pas);
    const sgn = lado === 'fin' ? +1 : -1;
    return { x: pas.posicion.x + sgn * d.dx * L1 / 2, z: pas.posicion.z + sgn * d.dz * L1 / 2 };
}

function _interseccion(A, B) {
    const dA = _pasilloDirZ(A), dB = _pasilloDirZ(B);
    const det = dA.dx * (-dB.dz) - (-dB.dx) * dA.dz;
    if (Math.abs(det) < 1e-6) return null;
    const ex = B.posicion.x - A.posicion.x;
    const ez = B.posicion.z - A.posicion.z;
    const t  = ((-dB.dz) * ex - (-dB.dx) * ez) / det;
    return { x: A.posicion.x + t * dA.dx, z: A.posicion.z + t * dA.dz };
}

// ── UNIR DOS PASILLOS EN L ────────────────────────────────────
export function unirPasillos() {
    const pasIds = [...st.selectedIds].filter(id => {
        const o = st.config.objetos.find(o => o.id === id);
        return o?.tipo === 'pasillo';
    });
    if (pasIds.length !== 2) {
        showStatus('⚠ Selecciona exactamente 2 pasillos (Shift+click para multi)', true);
        return;
    }
    let A = st.config.objetos.find(o => o.id === pasIds[0]);
    let B = st.config.objetos.find(o => o.id === pasIds[1]);
    if ((B.meta?.numero ?? 999) < (A.meta?.numero ?? 999)) [A, B] = [B, A];

    const aDeg = ((A.rotacion?.y ?? 0) % 360 + 360) % 360;
    const bDeg = ((B.rotacion?.y ?? 0) % 360 + 360) % 360;
    const diff = Math.abs(((aDeg - bDeg) % 180 + 180) % 180 - 90);
    if (diff > 5) { showStatus('⚠ Los pasillos deben ser perpendiculares (≈90°)', true); return; }

    const inter = _interseccion(A, B);
    if (!inter) { showStatus('⚠ Líneas paralelas — no hay intersección', true); return; }

    pushHistory();

    const aIni = _pasilloEndpoint(A, 'inicio');
    const aFin = _pasilloEndpoint(A, 'fin');
    if (Math.hypot(aIni.x - inter.x, aIni.z - inter.z) < Math.hypot(aFin.x - inter.x, aFin.z - inter.z))
        A.rotacion.y = ((A.rotacion.y + 180) % 360 + 360) % 360;
    const newAFin = _pasilloEndpoint(A, 'fin');
    A.posicion.x += inter.x - newAFin.x;
    A.posicion.z += inter.z - newAFin.z;

    const bIni = _pasilloEndpoint(B, 'inicio');
    const bFin = _pasilloEndpoint(B, 'fin');
    if (Math.hypot(bFin.x - inter.x, bFin.z - inter.z) < Math.hypot(bIni.x - inter.x, bIni.z - inter.z))
        B.rotacion.y = ((B.rotacion.y + 180) % 360 + 360) % 360;
    const newBIni = _pasilloEndpoint(B, 'inicio');
    B.posicion.x += inter.x - newBIni.x;
    B.posicion.z += inter.z - newBIni.z;

    const dirB  = _pasilloDirZ(B);
    const xA    = _pasilloDirX(A);
    const forma = (dirB.dx * xA.dx + dirB.dz * xA.dz) > 0 ? 'L_derecha' : 'L_izquierda';

    A.dimensiones.forma     = forma;
    A.dimensiones.longitud2 = B.dimensiones?.longitud ?? 6;
    if (!A.dimensiones.ancho) A.dimensiones.ancho = AW;

    const numA = A.meta?.numero, numB = B.meta?.numero;
    let migradas = 0;
    for (const est of st.config.objetos) {
        if (est.tipo === 'estanteria' && est.meta?.pasillo === numB) {
            est.meta.pasillo = numA;
            est.meta.segmento = 2;
            migradas++;
        }
    }

    const etiquetaB = B.etiqueta;
    eliminarObjeto(B.id);
    rebuildMesh(A.id);
    sincronizarEstanteriasAncladas(A);
    seleccionar(A.id);
    showStatus(`🔗 ${A.etiqueta} ← ${etiquetaB} (codo ${forma === 'L_derecha' ? 'derecha' : 'izquierda'}, ${migradas} estantería(s) migradas)`);
}

// ── REPARAR PASILLOS HUÉRFANOS ────────────────────────────────
export function repararPasillos() {
    const pasObjNums = new Set();
    for (const o of st.config.objetos) if (o.tipo === 'pasillo' && o.meta?.numero) pasObjNums.add(o.meta.numero);

    const grupos = new Map();
    for (const o of st.config.objetos) {
        if (o.tipo !== 'estanteria' || !o.meta?.pasillo) continue;
        if (pasObjNums.has(o.meta.pasillo)) continue;
        const arr = grupos.get(o.meta.pasillo) ?? [];
        arr.push(o);
        grupos.set(o.meta.pasillo, arr);
    }

    if (grupos.size === 0) { showStatus('No hay estanterías huérfanas — todo en orden'); return; }

    pushHistory();
    let creados = 0;
    for (const [num, ests] of grupos) {
        const cx         = ests.reduce((s, e) => s + e.posicion.x, 0) / ests.length;
        const cz         = ests.reduce((s, e) => s + e.posicion.z, 0) / ests.length;
        const ref        = ests[0];
        const shelfRotY  = ref.rotacion?.y ?? 0;
        const pasilloRotY = ((shelfRotY - 90) % 360 + 360) % 360;
        const longitud   = ref.dimensiones?.ancho ?? 6;

        añadirObjeto('pasillo', {
            etiqueta: `P${String(num).padStart(3, '0')}`,
            posicion: { x: +cx.toFixed(3), y: 0, z: +cz.toFixed(3) },
            rotacion: { y: pasilloRotY },
            dimensiones: { longitud, ancho: AW, forma: 'recto', longitud2: 0 },
            meta: { numero: num },
        });
        creados++;
        for (const e of ests) { if (e.meta && e.meta.segmento == null) e.meta.segmento = 1; }
    }
    deseleccionarTodo();
    showStatus(`🛠 ${creados} pasillo(s) creado(s) para estanterías huérfanas`);
}

// ── SNAP MAGNÉTICO EN TIEMPO REAL ────────────────────────────
// Devuelve {dx,dz} si hay un pasillo vecino con espalda alineada, o null
const LIVE_SNAP_TOL = 1.5;
export function tryLivePasilloSnap(pas, meshX, meshZ) {
    const myRotMod = (pas.rotacion?.y ?? 0) % 180;
    const myRotRad = (pas.rotacion?.y ?? 0) * Math.PI / 180;
    const myCR = Math.cos(myRotRad), mySR = Math.sin(myRotRad);
    const myBackOff = (pas.dimensiones?.ancho ?? AW) / 2 + UD;
    const myIBx = meshX + myCR * myBackOff, myIBz = meshZ - mySR * myBackOff;
    const myDBx = meshX - myCR * myBackOff, myDBz = meshZ + mySR * myBackOff;

    let bestDist = LIVE_SNAP_TOL, bestDx = null, bestDz = null;
    for (const other of st.config.objetos) {
        if (other.id === pas.id || other.tipo !== 'pasillo') continue;
        if (Math.abs(((other.rotacion?.y ?? 0) % 180) - myRotMod) > 5) continue;
        const oRad = (other.rotacion?.y ?? 0) * Math.PI / 180;
        const oCR = Math.cos(oRad), oSR = Math.sin(oRad);
        const oBackOff = (other.dimensiones?.ancho ?? AW) / 2 + UD;

        const oDBx = other.posicion.x - oCR * oBackOff, oDBz = other.posicion.z + oSR * oBackOff;
        const d1 = Math.hypot(oDBx - myIBx, oDBz - myIBz);
        if (d1 < bestDist) { bestDist = d1; bestDx = oDBx - myIBx; bestDz = oDBz - myIBz; }

        const oIBx = other.posicion.x + oCR * oBackOff, oIBz = other.posicion.z - oSR * oBackOff;
        const d2 = Math.hypot(oIBx - myDBx, oIBz - myDBz);
        if (d2 < bestDist) { bestDist = d2; bestDx = oIBx - myDBx; bestDz = oIBz - myDBz; }
    }
    return bestDx !== null ? { dx: bestDx, dz: bestDz } : null;
}

// ── ENCAJAR INTELIGENTE ───────────────────────────────────────
const PASILLO_SNAP_TOL = 5.0;
export function _snapPasilloAOtro(pas, mesh) {
    const mine = _pasilloAnchorPoints(pas);
    let best   = null;

    // Snap de extremos (pasillos en L / T)
    for (const other of st.config.objetos) {
        if (other.id === pas.id || other.tipo !== 'pasillo') continue;
        const otherPts = _pasilloAnchorPoints(other);
        for (const mp of mine) {
            for (const op of otherPts) {
                const dx = op.x - mp.x, dz = op.z - mp.z;
                const dist = Math.hypot(dx, dz);
                if (dist < PASILLO_SNAP_TOL && (best === null || dist < best.dist))
                    best = { dx, dz, dist, mineName: mp.name, otherName: op.name, otherEtq: other.etiqueta };
            }
        }
    }

    // Snap espalda-con-espalda para pasillos paralelos
    const myRotMod  = (pas.rotacion?.y ?? 0) % 180;
    const myRotRad  = (pas.rotacion?.y ?? 0) * Math.PI / 180;
    const myCR = Math.cos(myRotRad), mySR = Math.sin(myRotRad);
    const myBackOff = (pas.dimensiones?.ancho ?? AW) / 2 + UD;
    const myIBx = pas.posicion.x + myCR * myBackOff;
    const myIBz = pas.posicion.z - mySR * myBackOff;
    const myDBx = pas.posicion.x - myCR * myBackOff;
    const myDBz = pas.posicion.z + mySR * myBackOff;

    for (const other of st.config.objetos) {
        if (other.id === pas.id || other.tipo !== 'pasillo') continue;
        if (Math.abs(((other.rotacion?.y ?? 0) % 180) - myRotMod) > 5) continue;
        const otherRotRad = (other.rotacion?.y ?? 0) * Math.PI / 180;
        const oCR = Math.cos(otherRotRad), oSR = Math.sin(otherRotRad);
        const otherBackOff = (other.dimensiones?.ancho ?? AW) / 2 + UD;

        const oDBx = other.posicion.x - oCR * otherBackOff;
        const oDBz = other.posicion.z + oSR * otherBackOff;
        const d1 = Math.hypot(oDBx - myIBx, oDBz - myIBz);
        if (d1 < PASILLO_SNAP_TOL && (best === null || d1 < best.dist))
            best = { dx: oDBx - myIBx, dz: oDBz - myIBz, dist: d1, mineName: 'espalda_I', otherName: 'espalda_D', otherEtq: other.etiqueta };

        const oIBx = other.posicion.x + oCR * otherBackOff;
        const oIBz = other.posicion.z - oSR * otherBackOff;
        const d2 = Math.hypot(oIBx - myDBx, oIBz - myDBz);
        if (d2 < PASILLO_SNAP_TOL && (best === null || d2 < best.dist))
            best = { dx: oIBx - myDBx, dz: oIBz - myDBz, dist: d2, mineName: 'espalda_D', otherName: 'espalda_I', otherEtq: other.etiqueta };
    }

    if (!best) {
        mesh.position.x = snap(mesh.position.x);
        mesh.position.z = snap(mesh.position.z);
        return { snapped: false };
    }
    mesh.position.x += best.dx;
    mesh.position.z += best.dz;
    sincronizarEstanteriasAncladas(pas);
    return { snapped: true, info: best };
}

function _encajarObjeto(cfgObj, mesh) {
    if (cfgObj.tipo === 'estanteria' && cfgObj.meta?.pasillo) {
        const pas = st.config.objetos.find(o => o.tipo === 'pasillo' && o.meta?.numero === cfgObj.meta.pasillo);
        if (pas) {
            const pose = _calcShelfPoseFromPasillo(pas, cfgObj.meta?.lado ?? 'D', cfgObj.meta?.segmento ?? 1);
            _aplicarPoseAEstanteria(cfgObj, pose);
            return `${cfgObj.etiqueta} ↔ ${pas.etiqueta}`;
        }
    }
    if (cfgObj.tipo === 'pasillo') {
        const r = _snapPasilloAOtro(cfgObj, mesh);
        if (r.snapped) return `${cfgObj.etiqueta} (${r.info.mineName}) ↔ ${r.info.otherEtq} (${r.info.otherName})`;
        return `${cfgObj.etiqueta} → grid`;
    }
    mesh.position.x = snap(mesh.position.x);
    mesh.position.z = snap(mesh.position.z);
    return `${cfgObj.etiqueta} → grid`;
}

export function alignToGrid() {
    if (!st.selectedId && st.selectedIds.size === 0) return _encajarTodo();
    const ids = st.selectedIds.size > 1 ? [...st.selectedIds] : [st.selectedId];
    pushHistory();
    const msgs = [];
    for (const id of ids) {
        const cfgObj = st.config.objetos.find(o => o.id === id);
        if (!cfgObj || cfgObj.locked) continue;
        const mesh = st.meshById.get(id);
        if (!mesh) continue;
        msgs.push(_encajarObjeto(cfgObj, mesh));
    }
    updateConfigFromScene();
    showStatus(`⊞ Encajado: ${msgs.join(' · ')}`);
}

function _encajarTodo() {
    pushHistory();
    let nPas = 0, nEst = 0;
    const huerfanos = new Set();

    for (const cfg of st.config.objetos) {
        if (cfg.locked || cfg.tipo !== 'pasillo') continue;
        const mesh = st.meshById.get(cfg.id);
        if (!mesh) continue;
        const r = _snapPasilloAOtro(cfg, mesh);
        if (r.snapped) nPas++;
    }

    for (const cfg of st.config.objetos) {
        if (cfg.locked || cfg.tipo !== 'estanteria' || !cfg.meta?.pasillo) continue;
        const pas = st.config.objetos.find(o => o.tipo === 'pasillo' && o.meta?.numero === cfg.meta.pasillo);
        if (!pas) { huerfanos.add(cfg.meta.pasillo); continue; }
        const pose = _calcShelfPoseFromPasillo(pas, cfg.meta?.lado ?? 'D', cfg.meta?.segmento ?? 1);
        _aplicarPoseAEstanteria(cfg, pose);
        nEst++;
    }

    updateConfigFromScene();
    let msg = `⊞ ${nPas} pasillo(s) conectado(s) · ${nEst} estantería(s) re-anclada(s)`;
    if (huerfanos.size) {
        const lista = [...huerfanos].sort((a, b) => a - b).map(n => `P${String(n).padStart(3,'0')}`).join(', ');
        msg += ` · ⚠ sin objeto pasillo: ${lista}`;
    }
    showStatus(msg, huerfanos.size > 0);
}

// ── PASILLO COMPLETO I+D ──────────────────────────────────────
export function añadirPasilloCompleto() {
    const { ancho, profundidad } = st.config.dimensiones;
    const cols     = 14;
    const aisleLen = +(cols * (UW + CG) + 2).toFixed(3);
    const px = snap(ancho / 2);
    const pz = snap(profundidad / 2);

    const pid = añadirObjeto('pasillo', {
        posicion:    { x: px, y: 0, z: pz },
        rotacion:    { y: 0 },
        dimensiones: { longitud: aisleLen, ancho: AW, forma: 'recto', longitud2: 0 },
    });
    autoRellenarPasilloIDe();
    const pas = st.config.objetos.find(o => o.id === pid);
    showStatus(`✓ ${pas?.etiqueta ?? 'Pasillo'} creado con estanterías I+D (${cols} columnas)`);
}

// ── CAMBIO DE DIMENSIONES DE PASILLO ─────────────────────────
export function _onPasilloDimChange() {
    if (!st.selectedId) return;
    const cfgObj = st.config.objetos.find(o => o.id === st.selectedId);
    if (!cfgObj || cfgObj.tipo !== 'pasillo') return;
    cfgObj.dimensiones.longitud  = +document.getElementById('dim-pas-long').value;
    cfgObj.dimensiones.ancho     = +document.getElementById('dim-pas-ancho').value;
    cfgObj.dimensiones.forma     = document.getElementById('dim-pas-forma').value;
    cfgObj.dimensiones.longitud2 = +document.getElementById('dim-pas-long2').value;
    rebuildMesh(st.selectedId);
    sincronizarEstanteriasAncladas(cfgObj);
    syncPropsFromSelected();
}
