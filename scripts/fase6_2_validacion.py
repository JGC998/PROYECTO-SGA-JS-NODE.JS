"""
FASE 6.2 - Validacion UX Expediciones
Verifica: KPI strip, aviso TOP 500, estado vacio inteligente, tablet, mobile.
"""
import json, time, sys
from playwright.sync_api import sync_playwright

EXPEDICIONES_URL = (
    "file:///C:/Users/Usuario/Desktop/PROYECTO-SGA-JS-NODE.JS-main_compartido"
    "/frontend/pages/opciones/logistica-y-pedidos/expediciones/index.html"
)
BACKEND = "http://localhost:3000"

results = {}
js_errors = []

def wait_loaded(page, timeout_s=20):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        loading = page.locator('.ep-placeholder').filter(has_text='Cargando').count()
        if loading == 0:
            return True
        time.sleep(0.3)
    return False

def set_range_and_wait(page, desde, hasta, timeout_s=30):
    page.evaluate(f"""() => {{
        var d = document.getElementById('ep-f-desde');
        var h = document.getElementById('ep-f-hasta');
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

        page.goto(EXPEDICIONES_URL)
        page.wait_for_load_state("networkidle")
        wait_loaded(page, 10)

        # Verificar estructura DOM inicial
        has_kpi     = page.locator('#ep-kpi-strip').count() > 0
        has_notice  = page.locator('#ep-limit-notice').count() > 0
        has_list    = page.locator('#ep-list').count() > 0
        has_panel   = page.locator('#ep-panel').count() > 0

        results['dom_inicial'] = {
            'kpi_strip_existe': has_kpi,
            'limit_notice_existe': has_notice,
            'list_existe': has_list,
            'panel_existe': has_panel,
        }

        # Cargar rango oct-dic 2025
        t0 = time.time()
        set_range_and_wait(page, "2025-10-01", "2025-12-31", timeout_s=45)
        t_carga = round(time.time() - t0, 2)

        cards_total   = page.locator('.ep-card').count()
        kpi_text      = page.locator('#ep-kpi-strip').inner_text() if has_kpi else 'NO EXISTE'
        kpi_visible   = page.locator('#ep-kpi-strip').is_visible() if has_kpi else False
        notice_vis    = page.locator('#ep-limit-notice').is_visible() if has_notice else False
        notice_text   = page.locator('#ep-limit-notice').inner_text() if notice_vis else ''
        cnt_total     = page.locator('#ep-cnt-total').inner_text()
        cnt_pend      = page.locator('#ep-cnt-pend').inner_text()
        cnt_parcial   = page.locator('#ep-cnt-parcial').inner_text()
        cnt_prep      = page.locator('#ep-cnt-prep').inner_text()

        results['desktop_oct_dic_2025'] = {
            'tiempo_s': t_carga,
            'cards': cards_total,
            'kpi_visible': kpi_visible,
            'kpi_texto': kpi_text[:120],
            'aviso_top500_visible': notice_vis,
            'aviso_top500_texto': notice_text[:100],
            'cnt_total': cnt_total,
            'cnt_pend': cnt_pend,
            'cnt_parcial': cnt_parcial,
            'cnt_prep': cnt_prep,
            'js_errors_hasta_aqui': len(js_errors),
        }
        page.screenshot(path='/tmp/ep62_desktop_datos.png', full_page=False)

        # ── BUSCAR 02025 ──────────────────────────────────────────────────────
        page.locator('#ep-f-buscar').fill('02025')
        time.sleep(0.4)
        wait_loaded(page, 20)
        time.sleep(0.5)
        cards_02025 = page.locator('.ep-card').count()
        kpi_02025   = page.locator('#ep-kpi-strip').inner_text() if has_kpi else ''

        results['buscar_02025'] = {
            'cards': cards_02025,
            'kpi': kpi_02025[:80],
        }

        # ── BUSCAR POR: ──────────────────────────────────────────────────────
        page.locator('#ep-f-buscar').fill('POR')
        time.sleep(0.4)
        wait_loaded(page, 20)
        time.sleep(0.5)
        cards_por = page.locator('.ep-card').count()
        results['buscar_POR'] = {'cards': cards_por}

        # Reset buscador
        page.locator('#ep-f-buscar').fill('')
        time.sleep(0.3)
        wait_loaded(page, 20)
        time.sleep(0.5)

        # ── ESTADO VACÍO: rango sin datos ─────────────────────────────────────
        set_range_and_wait(page, "2026-01-01", "2026-05-14", timeout_s=20)
        placeholder_txt = ''
        placeholders    = page.locator('.ep-placeholder').all()
        if placeholders:
            placeholder_txt = placeholders[0].inner_text()
        kpi_vacio       = page.locator('#ep-kpi-strip').inner_text() if has_kpi else 'NO EXISTE'
        kpi_visible_vac = page.locator('#ep-kpi-strip').is_visible() if has_kpi else False
        notice_vac      = page.locator('#ep-limit-notice').is_visible() if has_notice else False

        page.screenshot(path='/tmp/ep62_desktop_vacio.png', full_page=False)
        results['estado_vacio'] = {
            'placeholder': placeholder_txt[:200],
            'kpi': kpi_vacio[:100],
            'kpi_visible': kpi_visible_vac,
            'aviso_top500_no_debe_aparecer': not notice_vac,
        }

        # Volver a oct-dic para panel
        set_range_and_wait(page, "2025-10-01", "2025-12-31", timeout_s=45)

        # ── PANEL DETALLE ─────────────────────────────────────────────────────
        if page.locator('.ep-card').count() > 0:
            page.locator('.ep-card').first.click()
            try:
                page.wait_for_selector('.ep-panel--open', timeout=5000)
                panel_title = page.locator('#ep-panel-title').inner_text()
                panel_meta  = page.locator('#ep-panel-meta').is_visible()
                panel_body  = page.locator('#ep-panel-body').is_visible()
                page.screenshot(path='/tmp/ep62_desktop_panel.png', full_page=False)
                results['panel'] = {
                    'ok': True,
                    'title': panel_title,
                    'meta_visible': panel_meta,
                    'body_visible': panel_body,
                }
                page.keyboard.press('Escape')
                time.sleep(0.3)
            except Exception as e:
                results['panel'] = {'ok': False, 'error': str(e)[:80]}

        ctx.close()

        # ── TABLET 810x1080 ───────────────────────────────────────────────────
        ctx_t = browser.new_context(viewport={"width": 810, "height": 1080})
        page_t = ctx_t.new_page()
        page_t.on("console", lambda msg: js_errors.append(f"[TAB/{msg.type}] {msg.text}") if msg.type == "error" else None)
        page_t.goto(EXPEDICIONES_URL)
        page_t.wait_for_load_state("networkidle")
        wait_loaded(page_t, 10)
        set_range_and_wait(page_t, "2025-10-01", "2025-12-31", timeout_s=45)

        cards_t     = page_t.locator('.ep-card').count()
        kpi_t       = page_t.locator('#ep-kpi-strip').inner_text() if has_kpi else ''
        notice_t    = page_t.locator('#ep-limit-notice').is_visible()
        filter_h    = page_t.evaluate("() => { var f=document.querySelector('.ep-filters-row'); return f?Math.round(f.getBoundingClientRect().height):null; }")
        backdrop_css = page_t.evaluate("() => { var b=document.querySelector('.ep-panel-backdrop'); return b?window.getComputedStyle(b).display:null; }")

        page_t.screenshot(path='/tmp/ep62_tablet.png', full_page=False)
        results['tablet'] = {
            'cards': cards_t,
            'kpi': kpi_t[:80],
            'aviso_top500': notice_t,
            'filter_height_px': filter_h,
            'backdrop_display': backdrop_css,
        }

        # Abrir panel en tablet
        if cards_t > 0:
            page_t.locator('.ep-card').first.click()
            try:
                page_t.wait_for_selector('.ep-panel--open', timeout=5000)
                panel_transform = page_t.evaluate("() => { var p=document.querySelector('.ep-panel'); return p?window.getComputedStyle(p).transform:null; }")
                backdrop_t = page_t.locator('#ep-panel-backdrop').evaluate("el => window.getComputedStyle(el).display")
                page_t.screenshot(path='/tmp/ep62_tablet_panel.png', full_page=False)
                results['tablet_panel'] = {
                    'transform': panel_transform,
                    'backdrop_display': backdrop_t,
                }
            except Exception as e:
                results['tablet_panel'] = {'error': str(e)[:80]}

        ctx_t.close()

        # ── MOBILE 390x844 ────────────────────────────────────────────────────
        ctx_m = browser.new_context(viewport={"width": 390, "height": 844})
        page_m = ctx_m.new_page()
        page_m.goto(EXPEDICIONES_URL)
        page_m.wait_for_load_state("networkidle")
        wait_loaded(page_m, 10)
        set_range_and_wait(page_m, "2025-10-01", "2025-12-31", timeout_s=45)

        cards_m  = page_m.locator('.ep-card').count()
        kpi_m    = page_m.locator('#ep-kpi-strip').inner_text() if page_m.locator('#ep-kpi-strip').is_visible() else 'OCULTO'
        notice_m = page_m.locator('#ep-limit-notice').is_visible()
        page_m.screenshot(path='/tmp/ep62_mobile.png', full_page=False)
        results['mobile'] = {
            'cards': cards_m,
            'kpi': kpi_m[:80],
            'aviso_top500': notice_m,
        }
        ctx_m.close()

        browser.close()

    results['js_errors'] = js_errors[:20]
    sys.stdout.buffer.write(json.dumps(results, indent=2, ensure_ascii=True).encode('utf-8'))
    sys.stdout.buffer.write(b'\n')

if __name__ == '__main__':
    run()
