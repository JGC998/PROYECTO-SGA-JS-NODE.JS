"""
FASE 5B.5 - Validacion operacional real completa (Playwright headless)
"""
import json, time, sys
from playwright.sync_api import sync_playwright

PICKING_URL = (
    "file:///C:/Users/Usuario/Desktop/PROYECTO-SGA-JS-NODE.JS-main_compartido"
    "/frontend/pages/opciones/logistica-y-pedidos/picking/index.html"
)
BACKEND_OLD  = "http://localhost:3000"
BACKEND_REAL = "http://localhost:3001"

results = {}
js_errors = []

def make_redir():
    def redir(route):
        new_url = route.request.url.replace(BACKEND_OLD, BACKEND_REAL)
        route.continue_(url=new_url)
    return redir

def wait_loaded(page, timeout_s=15):
    """Espera a que desaparezca el placeholder 'Cargando...' y aparezcan tarjetas o placeholder vacio."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        loading = page.locator('.pk-placeholder').filter(has_text='Cargando').count()
        if loading == 0:
            return True
        time.sleep(0.3)
    return False

def set_range_and_wait(page, desde, hasta, timeout_s=30):
    """Setea el rango de fechas y espera a que la carga termine."""
    page.evaluate(f"""() => {{
        var d = document.getElementById('pk-f-desde');
        var h = document.getElementById('pk-f-hasta');
        d.value = '{desde}';
        h.value = '{hasta}';
        d.dispatchEvent(new Event('change'));
    }}""")
    # Esperar a que aparezca el loading primero
    time.sleep(0.5)
    # Esperar a que cargue (desaparezca el placeholder de carga)
    wait_loaded(page, timeout_s)
    time.sleep(1)  # margen para render

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ── PASO 1 & 2: desktop 1280x900, datos reales ────────────────────────
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda msg: js_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error","warning") else None)
        page.on("pageerror", lambda err: js_errors.append(f"[pageerror] {str(err)}"))
        page.route("http://localhost:3000/**", make_redir())

        t0 = time.time()
        page.goto(PICKING_URL)
        page.wait_for_load_state("networkidle")
        wait_loaded(page, 10)
        t_load_inicial = round(time.time() - t0, 2)

        # Fijar rango con datos reales
        t_range = time.time()
        set_range_and_wait(page, "2025-10-01", "2025-12-31", timeout_s=45)
        t_rango = round(time.time() - t_range, 2)

        card_count   = page.locator('.pk-task').count()
        kpi_visible  = page.locator('#pk-kpi-strip').is_visible()
        kpi_text     = page.locator('#pk-kpi-strip').inner_text() if kpi_visible else ''
        cnt_total    = page.locator('#pk-cnt-total').inner_text()
        cnt_pend     = page.locator('#pk-cnt-pend').inner_text()
        cnt_parc     = page.locator('#pk-cnt-parcial').inner_text()
        cnt_prep     = page.locator('#pk-cnt-prep').inner_text()
        has_placeholder = page.locator('.pk-placeholder').count() > 0 and 'Cargando' not in page.locator('.pk-placeholder').inner_text()

        results['paso1'] = {
            'tiempo_carga_inicial_s': t_load_inicial,
            'tiempo_carga_rango_real_s': t_rango,
            'cards_renderizadas': card_count,
            'kpi_visible': kpi_visible,
            'kpi_text': kpi_text[:150],
            'cnt_total_albaranes': cnt_total,
            'cnt_pendientes': cnt_pend,
            'cnt_parciales': cnt_parc,
            'cnt_preparados': cnt_prep,
            'hay_placeholder_error': has_placeholder,
            'js_errors_paso1': len(js_errors),
        }
        page.screenshot(path='/tmp/pk_paso1_desktop.png', full_page=False)

        # ── PASO 2: agrupaciones ──────────────────────────────────────────────
        all_keys = page.evaluate("""() => {
            return Array.from(document.querySelectorAll('.pk-task')).map(c => c.dataset.key);
        }""")
        keys_total = len(all_keys)
        keys_uniq  = len(set(all_keys))

        muestra = page.evaluate("""() => {
            return Array.from(document.querySelectorAll('.pk-task')).slice(0, 8).map(function(c) {
                var prog = c.querySelector('.pk-task-footer');
                var alb  = c.querySelector('.pk-task-albaran');
                var txt  = prog ? prog.textContent.trim() : '';
                return {
                    key:      c.dataset.key || '',
                    albaran:  alb ? alb.textContent.trim() : '',
                    progreso: txt,
                    clases:   c.className
                };
            });
        }""")

        # Verificar que hay tarjetas con distintos status
        status_dist = page.evaluate("""() => {
            var counts = {pendiente:0, parcial:0, preparado:0};
            document.querySelectorAll('.pk-task').forEach(function(c) {
                if (c.classList.contains('pk-task--preparado')) counts.preparado++;
                else if (c.classList.contains('pk-task--parcial')) counts.parcial++;
                else counts.pendiente++;
            });
            return counts;
        }""")

        results['paso2'] = {
            'total_tarjetas': keys_total,
            'keys_unicas': keys_uniq,
            'duplicados': keys_total - keys_uniq,
            'distribucion_status': status_dist,
            'muestra_8_tarjetas': muestra,
        }

        # ── PASO 3: flujo operacional ─────────────────────────────────────────
        if card_count > 0:
            # Abrir primera tarjeta pendiente (las primeras son las sin picking asignado)
            first_card = page.locator('.pk-task').first
            t_click = time.time()
            first_card.click()
            try:
                page.wait_for_selector('.pk-panel--open', timeout=5000)
                t_panel_open = round(time.time() - t_click, 3)
                panel_title = page.locator('#pk-panel-title').inner_text()
                lineas_cnt  = page.locator('.pk-linea').count()
                btn_conf_cnt = page.locator('.pk-linea-link--confirmar').count()
                btn_desc_cnt = page.locator('.pk-linea-link--desconfirmar').count()

                results['paso3_panel'] = {
                    'tiempo_apertura_s': t_panel_open,
                    'titulo_panel': panel_title,
                    'lineas_visibles': lineas_cnt,
                    'botones_confirmar': btn_conf_cnt,
                    'botones_desconfirmar': btn_desc_cnt,
                }
                page.screenshot(path='/tmp/pk_paso3_panel.png', full_page=False)

                # Confirmar primera linea pendiente
                if btn_conf_cnt > 0:
                    kpi_antes = page.locator('#pk-kpi-strip').inner_text()
                    btn = page.locator('.pk-linea-link--confirmar').first
                    t_c = time.time()
                    btn.click()
                    try:
                        # Esperar a que aparezca un boton desconfirmar (respuesta OK del servidor)
                        page.wait_for_function(
                            """() => document.querySelectorAll('.pk-linea-link--desconfirmar').length > 0""",
                            timeout=10000
                        )
                        t_conf = round(time.time() - t_c, 3)
                        kpi_despues = page.locator('#pk-kpi-strip').inner_text()
                        new_lineas  = page.locator('.pk-linea').count()
                        page.screenshot(path='/tmp/pk_paso3_confirmada.png', full_page=False)

                        results['paso3_confirmar'] = {
                            'ok': True,
                            'tiempo_confirmar_s': t_conf,
                            'kpi_antes': kpi_antes[:80],
                            'kpi_despues': kpi_despues[:80],
                            'kpi_cambio': kpi_antes != kpi_despues,
                            'lineas_panel_despues': new_lineas,
                        }

                        # Desconfirmar
                        btn_des = page.locator('.pk-linea-link--desconfirmar').first
                        t_d = time.time()
                        btn_des.click()
                        try:
                            page.wait_for_function(
                                """(prevCount) => document.querySelectorAll('.pk-linea-link--confirmar').length >= prevCount""",
                                arg=btn_conf_cnt,
                                timeout=10000
                            )
                            t_des = round(time.time() - t_d, 3)
                            page.screenshot(path='/tmp/pk_paso3_desconfirmada.png', full_page=False)
                            results['paso3_desconfirmar'] = {
                                'ok': True,
                                'tiempo_desconfirmar_s': t_des,
                            }
                        except Exception as e:
                            results['paso3_desconfirmar'] = {'ok': False, 'error': str(e)[:100]}
                    except Exception as e:
                        results['paso3_confirmar'] = {'ok': False, 'error': str(e)[:100]}
                else:
                    results['paso3_confirmar'] = {'ok': 'skip', 'reason': 'primera tarjeta sin lineas pendientes (ya tiene picking asignado)'}
            except Exception as e:
                results['paso3_panel'] = {'ok': False, 'error': str(e)[:100]}
        else:
            results['paso3_panel'] = {'ok': False, 'reason': 'sin tarjetas'}

        # ── PASO 4: estres visual ─────────────────────────────────────────────
        # Cerrar panel
        page.keyboard.press('Escape')
        time.sleep(0.3)

        # Scroll completo
        t_s = time.time()
        page.evaluate("""() => {
            var list = document.getElementById('pk-list');
            if (list) { list.scrollTop = list.scrollHeight; }
        }""")
        time.sleep(0.3)
        page.evaluate("""() => {
            var list = document.getElementById('pk-list');
            if (list) { list.scrollTop = 0; }
        }""")
        t_scroll = round(time.time() - t_s, 3)

        # Filtro busqueda
        t_b = time.time()
        page.locator('#pk-f-buscar').fill('PLIN')
        time.sleep(0.4)  # debounce 300ms
        wait_loaded(page, 20)
        cards_plin = page.locator('.pk-task').count()
        t_buscar = round(time.time() - t_b, 3)

        # Reset busqueda
        page.locator('#pk-f-buscar').fill('')
        time.sleep(0.4)
        wait_loaded(page, 20)

        # Filtro status
        t_f = time.time()
        page.locator('#pk-f-status').select_option('pendiente')
        time.sleep(0.3)
        cards_pend = page.locator('.pk-task').count()
        page.locator('#pk-f-status').select_option('todos')
        time.sleep(0.3)
        t_filtro = round(time.time() - t_f, 3)

        results['paso4'] = {
            'tiempo_scroll_full_s': t_scroll,
            'tiempo_busqueda_PLIN_s': t_buscar,
            'cards_filtradas_PLIN': cards_plin,
            'tiempo_filtro_status_s': t_filtro,
            'cards_pendientes': cards_pend,
            'js_errors_acumulados': len(js_errors),
        }

        page.screenshot(path='/tmp/pk_paso4_desktop.png', full_page=False)

        # ── TABLET 810x1080 ───────────────────────────────────────────────────
        ctx_tablet = browser.new_context(viewport={"width": 810, "height": 1080})
        page_tablet = ctx_tablet.new_page()
        page_tablet.route("http://localhost:3000/**", make_redir())
        page_tablet.goto(PICKING_URL)
        page_tablet.wait_for_load_state("networkidle")
        wait_loaded(page_tablet, 10)
        set_range_and_wait(page_tablet, "2025-10-01", "2025-12-31", timeout_s=45)

        panel_tr_cerrado = page_tablet.evaluate("""() => {
            return window.getComputedStyle(document.getElementById('pk-panel')).transform;
        }""")
        backdrop_display = page_tablet.evaluate("""() => {
            return window.getComputedStyle(document.getElementById('pk-panel-backdrop')).display;
        }""")
        filter_height = page_tablet.evaluate("""() => {
            var f = document.querySelector('.pk-filters-row');
            return f ? Math.round(f.getBoundingClientRect().height) : null;
        }""")
        cards_tablet = page_tablet.locator('.pk-task').count()

        panel_tr_abierto = 'N/A'
        backdrop_abierto = 'N/A'
        if cards_tablet > 0:
            page_tablet.locator('.pk-task').first.click()
            time.sleep(0.5)
            panel_tr_abierto = page_tablet.evaluate("""() => {
                return window.getComputedStyle(document.getElementById('pk-panel')).transform;
            }""")
            backdrop_abierto = page_tablet.evaluate("""() => {
                return window.getComputedStyle(document.getElementById('pk-panel-backdrop')).display;
            }""")

        page_tablet.screenshot(path='/tmp/pk_tablet.png', full_page=False)
        results['tablet'] = {
            'cards': cards_tablet,
            'panel_transform_cerrado': panel_tr_cerrado,
            'panel_transform_abierto': panel_tr_abierto,
            'backdrop_sin_panel': backdrop_display,
            'backdrop_con_panel': backdrop_abierto,
            'filter_height_px': filter_height,
        }
        ctx_tablet.close()

        # ── MOBILE 390x844 ────────────────────────────────────────────────────
        ctx_mobile = browser.new_context(viewport={"width": 390, "height": 844})
        page_mobile = ctx_mobile.new_page()
        page_mobile.route("http://localhost:3000/**", make_redir())
        page_mobile.goto(PICKING_URL)
        page_mobile.wait_for_load_state("networkidle")
        wait_loaded(page_mobile, 10)
        set_range_and_wait(page_mobile, "2025-10-01", "2025-12-31", timeout_s=45)

        kpi_mobile_visible = page_mobile.locator('#pk-kpi-strip').is_visible()
        kpi_mobile_text    = page_mobile.locator('#pk-kpi-strip').inner_text() if kpi_mobile_visible else ''
        cards_mobile       = page_mobile.locator('.pk-task').count()
        page_mobile.screenshot(path='/tmp/pk_mobile.png', full_page=False)
        results['mobile'] = {
            'cards': cards_mobile,
            'kpi_visible': kpi_mobile_visible,
            'kpi_text': kpi_mobile_text[:100],
        }
        ctx_mobile.close()

        # ── ESTADO VACIO (rango default, sin datos) ───────────────────────────
        ctx_e = browser.new_context(viewport={"width": 1280, "height": 900})
        page_e = ctx_e.new_page()
        page_e.route("http://localhost:3000/**", make_redir())
        page_e.goto(PICKING_URL)
        page_e.wait_for_load_state("networkidle")
        wait_loaded(page_e, 10)
        time.sleep(1)
        empty_list_text = page_e.locator('#pk-list').inner_text()
        kpi_empty_text  = page_e.locator('#pk-kpi-strip').inner_text() if page_e.locator('#pk-kpi-strip').is_visible() else 'OCULTO'
        page_e.screenshot(path='/tmp/pk_estado_vacio.png')
        results['estado_vacio'] = {
            'lista_text': empty_list_text[:300],
            'kpi_text': kpi_empty_text[:120],
        }
        ctx_e.close()

        browser.close()

    results['js_errors'] = js_errors[:20]
    sys.stdout.buffer.write(json.dumps(results, indent=2, ensure_ascii=True).encode('utf-8'))
    sys.stdout.buffer.write(b'\n')

if __name__ == '__main__':
    run()
