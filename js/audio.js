// ── SONIDO AMBIENTE DEL ALMACÉN ───────────────────────────────
let _ctx = null;
let _master = null;
let _nodes = [];

function _init() {
    if (_ctx) return;
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _master = _ctx.createGain();
    _master.gain.value = 0;
    _master.connect(_ctx.destination);

    // Zumbido eléctrico 50 Hz + armónicos
    _addOsc(50,  0.14);
    _addOsc(100, 0.05);
    _addOsc(150, 0.025);

    // Ruido HVAC — ruido blanco filtrado (ventilación/aire)
    const bufSec = 3;
    const buf = _ctx.createBuffer(1, _ctx.sampleRate * bufSec, _ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = _ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bpf = _ctx.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 380; bpf.Q.value = 0.35;
    const hvacG = _ctx.createGain(); hvacG.gain.value = 0.035;
    src.connect(bpf); bpf.connect(hvacG); hvacG.connect(_master);
    src.start();
    _nodes.push(src);

    // Rumor lejano — ruido de baja frecuencia (carretillas, movimiento)
    const buf2 = _ctx.createBuffer(1, _ctx.sampleRate * bufSec, _ctx.sampleRate);
    const data2 = buf2.getChannelData(0);
    for (let i = 0; i < data2.length; i++) data2[i] = Math.random() * 2 - 1;
    const src2 = _ctx.createBufferSource();
    src2.buffer = buf2; src2.loop = true;
    const lpf = _ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 120;
    const rumG = _ctx.createGain(); rumG.gain.value = 0.02;
    src2.connect(lpf); lpf.connect(rumG); rumG.connect(_master);
    src2.start(0.7);
    _nodes.push(src2);
}

function _addOsc(freq, gainVal) {
    const osc = _ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = freq;
    const g = _ctx.createGain(); g.gain.value = gainVal;
    osc.connect(g); g.connect(_master);
    osc.start();
    _nodes.push(osc);
}

export function startAmbient() {
    _init();
    if (_ctx.state === 'suspended') _ctx.resume();
    const t = _ctx.currentTime;
    _master.gain.cancelScheduledValues(t);
    _master.gain.setValueAtTime(_master.gain.value, t);
    _master.gain.linearRampToValueAtTime(0.22, t + 2.0);
}

export function stopAmbient() {
    if (!_ctx || !_master) return;
    const t = _ctx.currentTime;
    _master.gain.cancelScheduledValues(t);
    _master.gain.setValueAtTime(_master.gain.value, t);
    _master.gain.linearRampToValueAtTime(0, t + 0.8);
}
