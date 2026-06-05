// ── UI: MINIMAPA 2D ───────────────────────────────────────────
// Responsabilidad: canvas 2D del minimapa — sin Three.js.
// Lee del store; la capa 3D no interviene aquí.
import * as THREE from 'three';
import { MMAP_SIZE, UD, AW } from '../../js/shared/configuracion.js';
import { S } from '../state/store.js';
import { astarRouteWaypoints } from '../core/grafo.js';

let _ctx = null;
const _camDir = new THREE.Vector3();

// Waypoint cache — se invalida cuando cambian las paradas de la ruta
let _wayptCache = null;
let _wayptSig   = '';

export function invalidateMinimapWaypoints() {
    _wayptSig   = '';
    _wayptCache = null;
}

function _getCachedWaypoints() {
    const sig = S.pickRoute.map(s => `${s.x.toFixed(2)},${s.z.toFixed(2)}`).join('|');
    if (sig !== _wayptSig) {
        _wayptSig   = sig;
        _wayptCache = S.pickRoute.length >= 2 ? astarRouteWaypoints(S.pickRoute) : [...S.pickRoute];
    }
    return _wayptCache;
}

export function initMinimap() {
    const cv = document.getElementById('minimap');
    _ctx = cv.getContext('2d');
}

export function drawMinimap() {
    if (!_ctx || !S.mmapLayout) return;
    const { wBounds: wb, layoutObjs } = S.mmapLayout;
    const W = wb.maxX - wb.minX, D = wb.maxZ - wb.minZ;
    const pad = 8;
    const sx = (MMAP_SIZE - pad * 2) / W;
    const sz = (MMAP_SIZE - pad * 2) / D;
    const wx = x => pad + (x - wb.minX) * sx;
    const wz = z => pad + (z - wb.minZ) * sz;

    // Ayuda para dibujar un rect con rotación Y opcional (aproximado como AABB para el mapa)
    const drawRect = (cx, cz, w, d, rotY, style) => {
        _ctx.fillStyle = style;
        const isRot90 = Math.abs(Math.round(rotY) % 180) === 90;
        if (isRot90) _ctx.fillRect(wx(cx - d / 2), wz(cz - w / 2), d * sx, w * sz);
        else         _ctx.fillRect(wx(cx - w / 2), wz(cz - d / 2), w * sx, d * sz);
    };

    // ── FONDO ─────────────────────────────────────────────────
    _ctx.clearRect(0, 0, MMAP_SIZE, MMAP_SIZE);
    _ctx.fillStyle = 'rgba(12,18,35,0.97)';
    _ctx.fillRect(0, 0, MMAP_SIZE, MMAP_SIZE);

    // Borde del almacén
    _ctx.strokeStyle = 'rgba(96,130,160,0.45)';
    _ctx.lineWidth   = 1;
    _ctx.strokeRect(wx(wb.minX) + 0.5, wz(wb.minZ) + 0.5, W * sx - 1, D * sz - 1);

    if (!layoutObjs) {
        _drawPlayer(wx, wz);
        return;
    }

    // ── ZONAS ESPECIALES (debajo de todo) ─────────────────────
    for (const obj of layoutObjs) {
        const { x, z } = obj.posicion;
        const rotY = obj.rotacion?.y ?? 0;
        if (obj.tipo === 'zona_carga') {
            const w = obj.dimensiones?.ancho ?? 8, d = obj.dimensiones?.profundidad ?? 5;
            drawRect(x, z, w, d, rotY, 'rgba(161,100,20,0.40)');
            // Rayas de carga
            _ctx.save();
            _ctx.fillStyle = 'rgba(251,191,36,0.18)';
            const isRot90 = Math.abs(Math.round(rotY) % 180) === 90;
            const rw = isRot90 ? d : w, rd = isRot90 ? w : d;
            for (let i = 0; i < 3; i++) {
                const ox = wx(x - rw / 2) + (i + 0.5) * (rw * sx / 3);
                _ctx.fillRect(ox - 0.8, wz(z - rd / 2), 1.6, rd * sz);
            }
            _ctx.restore();
        } else if (obj.tipo === 'zona_oficina') {
            const w = obj.dimensiones?.ancho ?? 6, d = obj.dimensiones?.profundidad ?? 4;
            drawRect(x, z, w, d, rotY, 'rgba(190,155,90,0.38)');
            _ctx.strokeStyle = 'rgba(251,220,150,0.4)';
            _ctx.lineWidth = 0.8;
            _ctx.strokeRect(wx(x - w / 2), wz(z - d / 2), w * sx, d * sz);
        }
    }

    // ── FRANJAS DE PASILLO (usando los objetos pasillo directamente) ──
    for (const obj of layoutObjs) {
        if (obj.tipo !== 'pasillo') continue;
        const { x, z } = obj.posicion;
        const L  = obj.dimensiones?.longitud ?? 10;
        const aw = obj.dimensiones?.ancho    ?? AW;
        const rotY = obj.rotacion?.y ?? 0;
        const isRot90 = Math.abs(Math.round(rotY) % 180) === 90;
        _ctx.fillStyle = 'rgba(251,191,36,0.11)';
        if (isRot90) _ctx.fillRect(wx(x - L / 2), wz(z - aw / 2), L * sx, aw * sz);
        else         _ctx.fillRect(wx(x - aw / 2), wz(z - L / 2), aw * sx, L * sz);
    }

    // ── ESTANTERÍAS ────────────────────────────────────────────
    for (const obj of layoutObjs) {
        if (obj.tipo !== 'estanteria') continue;
        const { x, z } = obj.posicion;
        const ancho  = obj.dimensiones?.ancho       ?? 1.5;
        const dep    = obj.dimensiones?.profundidad ?? UD;
        const rotY   = obj.rotacion?.y ?? 0;
        const hasERP = !!obj.meta?.pasillo;
        const isRot90 = Math.abs(Math.round(rotY) % 180) === 90;
        _ctx.fillStyle = hasERP ? '#4a6a80' : '#385868';
        if (isRot90) _ctx.fillRect(wx(x - dep / 2), wz(z - ancho / 2), dep * sx, ancho * sz);
        else         _ctx.fillRect(wx(x - ancho / 2), wz(z - dep / 2), ancho * sx, dep * sz);
    }

    // ── COLUMNAS / PILARES ─────────────────────────────────────
    for (const obj of layoutObjs) {
        if (obj.tipo !== 'columna') continue;
        _ctx.fillStyle = 'rgba(140,160,170,0.85)';
        _ctx.beginPath();
        _ctx.arc(wx(obj.posicion.x), wz(obj.posicion.z), 2.8, 0, Math.PI * 2);
        _ctx.fill();
    }

    // ── PUERTAS ────────────────────────────────────────────────
    for (const obj of layoutObjs) {
        if (obj.tipo !== 'puerta') continue;
        const { x, z } = obj.posicion;
        const w    = obj.dimensiones?.ancho ?? 3;
        const rotY = obj.rotacion?.y ?? 0;
        const isRot90 = Math.abs(Math.round(rotY) % 180) === 90;
        _ctx.fillStyle = 'rgba(74,222,128,0.65)';
        if (isRot90) _ctx.fillRect(wx(x - 0.12), wz(z - w / 2), 0.24 * sx, w * sz);
        else         _ctx.fillRect(wx(x - w / 2), wz(z - 0.12), w * sx, 0.24 * sz);
    }

    // ── ETIQUETAS DE PASILLO ───────────────────────────────────
    _ctx.font = 'bold 7px monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    const labeled = new Set();
    for (const obj of layoutObjs) {
        if (obj.tipo !== 'estanteria' || !obj.meta?.pasillo || obj.meta?.lado !== 'D') continue;
        const p = obj.meta.pasillo;
        if (labeled.has(p)) continue;
        labeled.add(p);

        // Centro X del pasillo: media entre D e I de la misma sección Z
        const iObj = layoutObjs.find(o =>
            o.tipo === 'estanteria' && o.meta?.pasillo === p && o.meta?.lado === 'I' &&
            Math.abs(o.posicion.z - obj.posicion.z) < 1);
        const ax = iObj
            ? (obj.posicion.x + iObj.posicion.x) / 2
            : obj.posicion.x + UD + AW / 2;

        // Posición Z de la etiqueta: extremo frontal del pasillo
        const pasObj = layoutObjs.find(o => o.tipo === 'pasillo' && o.meta?.numero === p);
        const labelZ = pasObj
            ? pasObj.posicion.z - (pasObj.dimensiones?.longitud ?? 10) / 2 - 0.5
            : obj.posicion.z - (obj.dimensiones?.ancho ?? 14) / 2 - 0.8;

        _ctx.fillStyle = 'rgba(147,197,253,0.92)';
        _ctx.fillText(`P${String(p).padStart(2, '0')}`, wx(ax), wz(labelZ));
    }

    // ── ETIQUETAS ZONA OFICINA ─────────────────────────────────
    for (const obj of layoutObjs) {
        if (obj.tipo !== 'zona_oficina') continue;
        _ctx.fillStyle = 'rgba(251,220,150,0.75)';
        _ctx.font = 'bold 6px monospace';
        _ctx.textAlign = 'center';
        _ctx.textBaseline = 'middle';
        _ctx.fillText('CTRL', wx(obj.posicion.x), wz(obj.posicion.z));
    }

    _drawPlayer(wx, wz);

    // ── RUTA DE PICKING ────────────────────────────────────────
    if (S.pickRoute.length) {
        const cam    = S.controls.getObject();
        const cached = _getCachedWaypoints();
        const waypts = [{ x: cam.position.x, z: cam.position.z }, ...cached];
        _ctx.save();
        _ctx.strokeStyle = 'rgba(251,191,36,0.8)';
        _ctx.lineWidth   = 1.5;
        _ctx.setLineDash([3, 3]);
        _ctx.beginPath();
        _ctx.moveTo(wx(waypts[0].x), wz(waypts[0].z));
        for (let i = 1; i < waypts.length; i++) _ctx.lineTo(wx(waypts[i].x), wz(waypts[i].z));
        _ctx.stroke();
        _ctx.restore();
        for (let i = 0; i < S.pickRoute.length; i++) {
            const s = S.pickRoute[i];
            _ctx.beginPath();
            _ctx.arc(wx(s.x), wz(s.z), 3.5, 0, Math.PI * 2);
            _ctx.fillStyle = '#fbbf24';
            _ctx.fill();
            _ctx.fillStyle = '#000';
            _ctx.font = 'bold 6px monospace';
            _ctx.textAlign = 'center';
            _ctx.textBaseline = 'middle';
            _ctx.fillText(String(i + 1), wx(s.x), wz(s.z));
        }
    }
}

function _drawPlayer(wx, wz) {
    const cam = S.controls.getObject();
    const px  = wx(cam.position.x);
    const pz  = wz(cam.position.z);

    S.camera.getWorldDirection(_camDir);
    _ctx.strokeStyle = 'rgba(147,197,253,0.9)';
    _ctx.lineWidth   = 1.5;
    _ctx.beginPath();
    _ctx.moveTo(px, pz);
    _ctx.lineTo(px + _camDir.x * 9, pz + _camDir.z * 9);
    _ctx.stroke();
    _ctx.fillStyle = '#93c5fd';
    _ctx.beginPath();
    _ctx.arc(px, pz, 3.5, 0, Math.PI * 2);
    _ctx.fill();
}
