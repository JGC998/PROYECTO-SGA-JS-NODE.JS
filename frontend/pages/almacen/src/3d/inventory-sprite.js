// ── 3D: SPRITE DE INVENTARIO FLOTANTE ────────────────────────
// Muestra un billboard en el espacio 3D junto a la estantería más cercana.
// Responsabilidad: Three.js puro — sin DOM.
import * as THREE from 'three';
import { INV_RADIUS } from '../../js/shared/configuracion.js';
import { S } from '../state/store.js';

let _sprite = null;
let _target = null;

export function initInventorySprite() {
    const cv  = document.createElement('canvas');
    cv.width  = 210; cv.height = 84;
    const tex = new THREE.CanvasTexture(cv);
    _sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    _sprite.scale.set(1.9, 0.76, 1);
    _sprite.visible = false;
    _sprite.renderOrder = 10;
    S.scene.add(_sprite);
    _sprite._cv  = cv;
    _sprite._tex = tex;
}

function _draw(col) {
    const cv  = _sprite._cv;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 210, 84);
    const isLow   = col.totalUnits > 0 && col.totalUnits < S.LOW_STOCK_THRESH;
    const isEmpty = col.totalUnits === 0;
    const bg = isLow ? 'rgba(220,38,38,0.94)' : isEmpty ? 'rgba(51,65,85,0.92)' : 'rgba(15,23,42,0.92)';
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(3, 3, 204, 78, 11); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.roundRect(3, 3, 204, 24, [11, 11, 0, 0]); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(col.code, 105, 15);
    ctx.fillStyle = '#fff';
    const udsStr = isEmpty ? 'VACÍO' : col.totalUnits.toLocaleString('es-ES') + ' uds';
    ctx.font = `bold ${col.totalUnits > 9999 ? 20 : 26}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(udsStr, 105, 50);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '10px monospace'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${col.filledLevels}/${col.totalLevels} niveles con stock`, 105, 75);
    _sprite._tex.needsUpdate = true;
}

export function hideInventorySprite() {
    if (_sprite) _sprite.visible = false;
}

let _lastUpdate = 0;
export function updateInventoryOverlay() {
    if (!_sprite || !S.mmapLayout) { if (_sprite) _sprite.visible = false; return; }
    const now = performance.now();
    if (now - _lastUpdate < 200) return;
    _lastUpdate = now;

    const obj = S.controls.getObject();
    let nearest = null, minD = INV_RADIUS;
    for (const col of S.shelfCols) {
        const d = Math.hypot(obj.position.x - col.x, obj.position.z - col.z);
        if (d < minD) { minD = d; nearest = col; }
    }
    if (nearest) {
        _sprite.visible = true;
        _sprite.position.set(nearest.x, 3.6, nearest.z);
        if (_target !== nearest) { _target = nearest; _draw(nearest); }
    } else {
        _sprite.visible = false;
        _target = null;
    }
}
