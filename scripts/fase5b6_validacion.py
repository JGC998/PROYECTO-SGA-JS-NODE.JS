"""
FASE 5B.6 - Validacion operacional final
Verifica: buscar PLIN, aviso TOP 500, confirmar/desconfirmar,
estado vacio, KPI, tablet, mobile.
"""
import json, time, sys
from playwright.sync_api import sync_playwright

PICKING_URL = (
    "file:///C:/Users/Usuario/Desktop/PROYECTO-SGA-JS-NODE.JS-main_compartido"
    "/frontend/pages/opciones/logistica-y-pedidos/picking/index.html"
)
BACKEND = "http://localhost:3000"

results = {}
js_errors = []

def wait_loaded(page, timeout_s=20):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        loading = page.locator('.pk-placeholder').filter(has_text='Cargando').count()
        if loading == 0:
            return True
        time.sleep(0.3)
    return False

def set_range_and_wait(page, desde, hasta, timeout_s=30):
    page.evaluate(f"""() => {{
        var d = document.getElementById('pk-f-desde');
        var h = document.getElementById('pk-f-hasta');
        d.value = '{desde}';
        h.value = '{hasta}';
        d.dispatchEvent(new Event('change'));
    }}""")
    time.sleep(0.5)
    wait_loaded(page, timeout_s)
    time.sleep(0.8)

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ── DESKTOP 1280x900 — datos reales ───────────────────────────────────
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda msg: js_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error","warning") else None)
        page.on("pageerror", lambda err: js_errors.append(f"[pageerror] {str(err)}"))

        page.goto(PICKING_URL)
        page.wait_for_load_state("networkidle")
        wait_loaded(page, 10)

        # Cargar rango oct-dic 2025 (500 líneas)
        t0 = time.time()
        set_range_and_wait(page, "2025-10-01", "2025-12-31", timeout_s=45)
        t_carga = round(time.time() - t0, 2)

        cards_total = page.locator('.pk-task').count()
        kpi_text    = page.locator('#pk-kpi-strip').inner_text()
        aviso_top   = page.locator('#pk-limit-notice').count() > 0
        aviso_text  = page.locator('#pk-limit-notice').inner_text() if aviso_top else ''

        results['desktop_carga'] = {
            'tiempo_s': t_carga,
            'cards': cards_total,
            'kpi': kpi_text[:120],
            'aviso_top500_visible': aviso_top,
            'aviso_top500_texto': aviso_text[:100],
            'js_errors': len(js_errors),
        }
        page.screenshot(path='/tmp/pk6_desktop_carga.png', full_page=False)

        # ── BUSCAR POR SERIE PLIN ─────────────────────────────────────────────
        t_b = time.time()
        page.locator('#pk-f-buscar').fill('PLIN')
        time.sleep(0.4)
        wait_loaded(page, 20)
        time.sleep(0.5)
        cards_plin = page.locator('.pk-task').count()
        aviso_plin = page.locator('#pk-limit-notice').count() > 0
        t_buscar = round(time.time() - t_b, 3)

        # Verificar que todas las tarjetas son PLIN
        series_plin = page.evaluate("""() => {
            var cards = Array.from(document.querySelectorAll('.pk-task'));
            return cards.slice(0, 5).map(function(c) {
                return c.dataset.key || '';
            });
        }""")

        results['buscar_plin'] = {
            'tiempo_s': t_buscar,
            'cards_resultado': cards_plin,
            'aviso_top500_visible': aviso_plin,
            'muestra_keys': series_plin,
        }
        page.screenshot(path='/tmp/pk6_buscar_plin.png', full_page=False)

        # ── BUSCAR POR NUMERO 51599 ───────────────────────────────────────────
        page.locator('#pk-f-buscar').fill('51599')
        time.sleep(0.4)
        wait_loaded(page, 20)
        time.sleep(0.5)
        cards_num = page.locator('.pk-task').count()
        results['buscar_numero'] = {
            'buscar': '51599',
            'cards': cards_num,
        }

        # Reset buscador
        page.locator('#pk-f-buscar').fill('')
        time.sleep(0.4)
        wait_loaded(page, 20)
        time.sleep(0.5)

        # ── CONFIRMAR / DESCONFIRMAR ──────────────────────────────────────────
        if cards_total > 0:
            page.locator('.pk-task').first.click()
            try:
                page.wait_for_selector('.pk-panel--open', timeout=5000)
                btn_conf_cnt = page.locator('.pk-linea-link--confirmar').count()

                if btn_conf_cnt > 0:
                    kpi_antes = page.locator('#pk-kpi-strip').inner_text()
                    page.locator('.pk-linea-link--confirmar').first.click()
                    try:
                        page.wait_for_function(
                            "() => document.querySelectorAll('.pk-linea-link--desconfirmar').length > 0",
                            timeout=10000
                        )
                        kpi_despues = page.locator('#pk-kpi-strip').inner_text()
                        page.screenshot(path='/tmp/pk6_confirmada.png', full_page=False)

                        # Desconfirmar
                        page.locator('.pk-linea-link--desconfirmar').first.click()
                        page.wait_for_function(
                            f"(n) => document.querySelectorAll('.pk-linea-link--confirmar').length >= n",
                            arg=btn_conf_cnt,
                            timeout=10000
                        )
                        page.screenshot(path='/tmp/pk6_desconfirmada.png', full_page=False)
                        results['flujo_confirmar'] = {
                            'ok': True,
                            'kpi_antes': kpi_antes[:80],
                            'kpi_despues': kpi_despues[:80],
                            'kpi_cambio': kpi_antes != kpi_despues,
                        }
                    except Exception as e:
                        results['flujo_confirmar'] = {'ok': False, 'error': str(e)[:100]}
                else:
                    results['flujo_confirmar'] = {'ok': 'skip', 'razon': 'primera tarjeta sin lineas pendientes'}
            except Exception as e:
                results['flujo_confirmar'] = {'ok': False, 'error': str(e)[:80]}

        page.keyboard.press('Escape')
        time.sleep(0.3)

        # ── ESTADO VACÍO: rango sin datos ────────────────────────────────────
        set_range_and_wait(page, "2026-01-01", "2026-05-14", timeout_s=20)
        lista_vacia = page.locator('#pk-list').inner_text()
        kpi_vacio   = page.locator('#pk-kpi-strip').inner_text() if page.locator('#pk-kpi-strip').is_visible() else 'OCULTO'
        aviso_vacio = page.locator('#pk-limit-notice').count()
        page.screenshot(path='/tmp/pk6_estado_vacio.png', full_page=False)
        results['estado_vacio'] = {
            'lista': lista_vacia[:200],
            'kpi': kpi_vacio[:100],
            'aviso_top500_no_debe_aparecer': aviso_vacio == 0,
        }

        ctx.close()

        # ── TABLET 810x1080 ───────────────────────────────────────────────────
        ctx_t = browser.new_context(viewport={"width": 810, "height": 1080})
        page_t = ctx_t.new_page()
        page_t.goto(PICKING_URL)
        page_t.wait_for_load_state("networkidle")
        wait_loaded(page_t, 10)
        set_range_and_wait(page_t, "2025-10-01", "2025-12-31", timeout_s=45)

        cards_t     = page_t.locator('.pk-task').count()
        aviso_t     = page_t.locator('#pk-limit-notice').is_visible()
        filter_h    = page_t.evaluate("() => { var f=document.querySelector('.pk-filters-row'); return f?Math.round(f.getBoundingClientRect().height):null; }")
        kpi_t       = page_t.locator('#pk-kpi-strip').inner_text()

        # Buscar PLIN en tablet
        page_t.locator('#pk-f-buscar').fill('PLIN')
        time.sleep(0.4)
        wait_loaded(page_t, 20)
        time.sleep(0.5)
        cards_plin_t = page_t.locator('.pk-task').count()

        page_t.screenshot(path='/tmp/pk6_tablet.png', full_page=False)
        results['tablet'] = {
            'cards': cards_t,
            'aviso_top500': aviso_t,
            'filter_height_px': filter_h,
            'kpi': kpi_t[:80],
            'cards_buscar_plin': cards_plin_t,
        }
        ctx_t.close()

        # ── MOBILE 390x844 ────────────────────────────────────────────────────
        ctx_m = browser.new_context(viewport={"width": 390, "height": 844})
        page_m = ctx_m.new_page()
        page_m.goto(PICKING_URL)
        page_m.wait_for_load_state("networkidle")
        wait_loaded(page_m, 10)
        set_range_and_wait(page_m, "2025-10-01", "2025-12-31", timeout_s=45)

        cards_m   = page_m.locator('.pk-task').count()
        kpi_m     = page_m.locator('#pk-kpi-strip').inner_text() if page_m.locator('#pk-kpi-strip').is_visible() else 'OCULTO'
        aviso_m   = page_m.locator('#pk-limit-notice').is_visible()
        page_m.screenshot(path='/tmp/pk6_mobile.png', full_page=False)
        results['mobile'] = {
            'cards': cards_m,
            'kpi': kpi_m[:80],
            'aviso_top500': aviso_m,
        }
        ctx_m.close()

        browser.close()

    results['js_errors'] = js_errors[:20]
    sys.stdout.buffer.write(json.dumps(results, indent=2, ensure_ascii=True).encode('utf-8'))
    sys.stdout.buffer.write(b'\n')

if __name__ == '__main__':
    run()
