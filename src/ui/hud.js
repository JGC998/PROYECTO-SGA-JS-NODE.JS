// ── UI: HUD CONTADORES DE ESTANTERÍAS ────────────────────────
// Responsabilidad: actualizar los contadores del HUD superior al cambiar hudStats.
// Se importa desde escena.js para registrar la suscripción al arrancar.
import { store } from '../state/store.js';

store.on('hudStats', stats => {
    if (!stats) return;
    document.getElementById('hud-tot').textContent = stats.total;
    document.getElementById('hud-stk').textContent = stats.withStock;
    document.getElementById('hud-emp').textContent = stats.total - stats.withStock;
});
