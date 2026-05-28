"""
FASE 7.1 - Validacion Semantica Movimientos
Verifica: tipos reales PC/RG/PP, articulo real en cards, sin PLIN, badges, select opciones.
"""
import json, time, sys
from playwright.sync_api import sync_playwright

MV_URL = (
    "file:///C:/Users/Usuario/Desktop/PROYECTO-SGA-JS-NODE.JS-main_compartido"
    "/frontend/pages/opciones/almacen-y-stock/movimientos-por-articulo/index.html"
)

results = {}
js_errors = []

def wait_mv_loaded(page, timeout_s=30):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        loading = page.locator('.mv-loading').count()
        if loading == 0:
            return True
        time.sleep(0.3)
    return False

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda msg: js_errors.append(f"[{msg.type}] {msg.text}")
                if msg.type in ("error", "warning") else None)
        page.on("pageerror", lambda err: js_errors.append(f"[pageerror] {str(err)}"))

        page.goto(MV_URL)
        page.wait_for_load_state("networkidle")

        # ── DOM inicial ──────────────────────────────────────────────────────────
        results['dom'] = {
            'timeline_existe': page.locator('#mv-timeline').count() > 0,
            'panel_existe':    page.locator('#mv-panel').count() > 0,
            'summary_existe':  page.locator('#mv-summary').count() > 0,
        }

        # ── Opciones del select tipo ─────────────────────────────────────────────
        opciones = page.evaluate("""() => {
            var sel = document.getElementById('mv-f-tipo');
            if (!sel) return [];
            return Array.from(sel.options).map(o => ({ value: o.value, text: o.text }));
        }""")
        results['select_opciones'] = opciones

        # ── Buscar oct-dic 2025 ──────────────────────────────────────────────────
        page.locator('#mv-f-desde').fill('2025-10-01')
        page.locator('#mv-f-hasta').fill('2025-12-31')
        page.locator('#btn-mv-buscar').click()
        wait_mv_loaded(page, 30)
        time.sleep(0.8)

        cards = page.locator('.mv-card').count()
        page.screenshot(path='/tmp/mv71_desktop_datos.png', full_page=False)

        # Recoger los badges de las cards visibles (primeras 20)
        badges_text = page.evaluate("""() => {
            return Array.from(document.querySelectorAll('.mv-card-badge')).slice(0,20).map(b => b.textContent.trim());
        }""")

        # Comprobar clases CSS de las cards (primeras 20)
        card_classes = page.evaluate("""() => {
            return Array.from(document.querySelectorAll('.mv-card')).slice(0,20).map(c => c.className);
        }""")

        # Artículo en las cards (primeras 10)
        art_texts = page.evaluate("""() => {
            return Array.from(document.querySelectorAll('.mv-card-art')).slice(0,10).map(a => a.textContent.trim());
        }""")

        # Summary
        summary_text = page.locator('#mv-summary-text').inner_text() if page.locator('#mv-summary').is_visible() else ''

        results['datos_oct_dic_2025'] = {
            'cards_total': cards,
            'badges_muestra': badges_text[:15],
            'card_classes_muestra': card_classes[:5],
            'articulos_muestra': art_texts,
            'summary': summary_text[:100],
        }

        # ── Verificar tipos falsos ausentes ─────────────────────────────────────
        tipos_falsos = page.evaluate("""() => {
            var cards = Array.from(document.querySelectorAll('.mv-card'));
            return cards.filter(c =>
                c.classList.contains('mv-card--e') ||
                c.classList.contains('mv-card--s') ||
                c.classList.contains('mv-card--t') ||
                c.classList.contains('mv-card--r') ||
                c.classList.contains('mv-card--p')
            ).length;
        }""")
        results['tipos_falsos_en_cards'] = tipos_falsos

        # ── Abrir panel de detalle ───────────────────────────────────────────────
        if cards > 0:
            page.locator('.mv-card').first.click()
            try:
                page.wait_for_selector('.mv-panel--open', timeout=5000)
                panel_tipo  = page.locator('.mv-panel-tipo').inner_text()
                panel_badge = page.locator('.mv-panel-badge-lg').inner_text()
                panel_badge_class = page.locator('.mv-panel-badge-lg').get_attribute('class')
                page.screenshot(path='/tmp/mv71_panel.png', full_page=False)
                results['panel'] = {
                    'ok': True,
                    'tipo_label': panel_tipo,
                    'badge_text': panel_badge,
                    'badge_class': panel_badge_class,
                }
            except Exception as e:
                results['panel'] = {'ok': False, 'error': str(e)[:80]}

        # ── Filtro tipo PC ───────────────────────────────────────────────────────
        page.locator('#mv-f-tipo').select_option('PC')
        page.locator('#btn-mv-buscar').click()
        wait_mv_loaded(page, 20)
        time.sleep(0.5)
        cards_pc = page.locator('.mv-card').count()
        badges_pc = page.evaluate("""() => {
            return [...new Set(Array.from(document.querySelectorAll('.mv-card-badge')).map(b => b.textContent.trim()))];
        }""")
        results['filtro_PC'] = {'cards': cards_pc, 'tipos_unicos': badges_pc}

        # ── Artículo real: buscar artículo conocido ──────────────────────────────
        page.locator('#mv-f-tipo').select_option('')
        page.locator('#mv-f-articulo').fill('0000098')
        page.locator('#mv-f-desde').fill('2025-10-01')
        page.locator('#mv-f-hasta').fill('2025-12-31')
        page.locator('#btn-mv-buscar').click()
        wait_mv_loaded(page, 20)
        time.sleep(0.5)
        cards_art = page.locator('.mv-card').count()
        art_0000098 = page.evaluate("""() => {
            return Array.from(document.querySelectorAll('.mv-card-art')).slice(0,5).map(a => a.textContent.trim());
        }""")
        results['articulo_0000098'] = {'cards': cards_art, 'articulos': art_0000098}

        ctx.close()
        browser.close()

    results['js_errors'] = js_errors[:20]
    sys.stdout.buffer.write(json.dumps(results, indent=2, ensure_ascii=True).encode('utf-8'))
    sys.stdout.buffer.write(b'\n')

if __name__ == '__main__':
    run()
