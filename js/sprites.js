import * as THREE from 'three';

export function makeSprite(txt) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 70;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(30,58,138,.9)';
    ctx.beginPath(); ctx.roundRect(4, 4, 248, 62, 10); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px Segoe UI,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 128, 36);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
    sp.scale.set(2.8, 0.77, 1);
    return sp;
}

export function makeSmallSprite(txt) {
    const cv = document.createElement('canvas');
    cv.width = 192; cv.height = 32;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(15,23,42,0.88)';
    ctx.beginPath(); ctx.roundRect(2, 2, 188, 28, 5); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 96, 16);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
    sp.scale.set(1.85, 0.31, 1);
    return sp;
}

export function makePickSprite(num, locKey) {
    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 48;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(251,191,36,0.95)';
    ctx.beginPath(); ctx.roundRect(2, 2, 156, 44, 8); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(num, 28, 24);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#333';
    ctx.fillText(locKey ?? '', 92, 24);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
    sp.scale.set(1.4, 0.42, 1);
    sp.renderOrder = 8;
    return sp;
}
