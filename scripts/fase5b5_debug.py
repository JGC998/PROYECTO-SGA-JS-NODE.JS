"""Debug: verificar si route intercepta fetches desde file://"""
from playwright.sync_api import sync_playwright
import time, json, sys

PICKING_URL = (
    "file:///C:/Users/Usuario/Desktop/PROYECTO-SGA-JS-NODE.JS-main_compartido"
    "/frontend/pages/opciones/logistica-y-pedidos/picking/index.html"
)
BACKEND_OLD  = "http://localhost:3000"
BACKEND_REAL = "http://localhost:3001"

intercepted = []

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()

        # Log ALL requests
        page.on("request", lambda req: intercepted.append(req.url))

        def redir(route):
            new_url = route.request.url.replace(BACKEND_OLD, BACKEND_REAL)
            intercepted.append(f"REDIRECTED: {route.request.url} -> {new_url}")
            route.continue_(url=new_url)

        page.route("http://localhost:3000/**", redir)

        page.goto(PICKING_URL)
        page.wait_for_load_state("networkidle")
        time.sleep(3)

        card_count = page.locator('.pk-task').count()
        kpi_text   = page.locator('#pk-kpi-strip').inner_text()

        result = {
            'cards': card_count,
            'kpi': kpi_text[:80],
            'intercepted_urls': intercepted[:30],
        }
        sys.stdout.buffer.write(json.dumps(result, indent=2, ensure_ascii=True).encode('utf-8'))
        sys.stdout.buffer.write(b'\n')
        browser.close()

if __name__ == '__main__':
    run()
