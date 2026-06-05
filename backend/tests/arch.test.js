"use strict";

// ─── TESTS DE ARQUITECTURA ESTÁTICA — FASE I.4 ────────────────────────────────
//
// Verifica la integridad estructural del proyecto sin necesidad de BD.
// Detecta: imports rotos, endpoints duplicados, módulos huérfanos.
// Apto para CI (incluir en test:ci).

const fs   = require('fs');
const path = require('path');

const ROUTES_DIR   = path.resolve(__dirname, '../routes');
const SERVICES_DIR = path.resolve(__dirname, '../services');
const APP_PATH     = path.resolve(__dirname, '../app.js');

// ─── 1. TODOS LOS MÓDULOS CARGAN SIN ERRORES ─────────────────────────────────

describe("Integridad de módulos — require sin errores (FASE I.4)", () => {
    const routeFiles   = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));
    const serviceFiles = fs.readdirSync(SERVICES_DIR).filter(f => f.endsWith('.js'));

    routeFiles.forEach(file => {
        test(`routes/${file} carga sin errores`, () => {
            expect(() => require(path.join(ROUTES_DIR, file))).not.toThrow();
        });
    });

    serviceFiles.forEach(file => {
        test(`services/${file} carga sin errores`, () => {
            expect(() => require(path.join(SERVICES_DIR, file))).not.toThrow();
        });
    });

    test("app.js carga sin errores", () => {
        expect(() => require(APP_PATH)).not.toThrow();
    });
});

// ─── 2. SIN ENDPOINTS DUPLICADOS (método + path) ─────────────────────────────

describe("Sin endpoints duplicados en routes/ (FASE I.4)", () => {
    test("ningún método+path aparece en más de un route file", () => {
        const routeFiles = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));
        const seen  = {};
        const dups  = [];

        routeFiles.forEach(file => {
            const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
            const re  = /router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gi;
            let m;
            while ((m = re.exec(src)) !== null) {
                const key = m[1].toUpperCase() + ' ' + m[2];
                if (seen[key]) {
                    dups.push(`${key} — ${seen[key]} y ${file}`);
                } else {
                    seen[key] = file;
                }
            }
        });

        if (dups.length > 0) {
            throw new Error('Endpoints duplicados detectados:\n' + dups.join('\n'));
        }
        expect(dups).toHaveLength(0);
    });
});

// ─── 3. TODOS LOS ROUTES ESTÁN REGISTRADOS EN app.js ─────────────────────────

describe("Todos los route files están registrados en app.js (FASE I.4)", () => {
    test("ningún route file queda huérfano sin app.use()", () => {
        const appSrc     = fs.readFileSync(APP_PATH, 'utf8');
        const routeFiles = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));
        const orphans    = [];

        routeFiles.forEach(file => {
            // Busca require('./routes/nombre') en app.js
            const baseName = file.replace('.js', '');
            if (!appSrc.includes(`'./routes/${baseName}'`) && !appSrc.includes(`"./routes/${baseName}"`)) {
                orphans.push(file);
            }
        });

        if (orphans.length > 0) {
            throw new Error('Route files no registrados en app.js:\n' + orphans.join('\n'));
        }
        expect(orphans).toHaveLength(0);
    });
});

// ─── 4. TODOS LOS SERVICES ESTÁN REFERENCIADOS ───────────────────────────────

describe("Todos los services están referenciados en routes/ o app.js (FASE I.4)", () => {
    test("ningún service file queda huérfano sin require()", () => {
        const serviceFiles = fs.readdirSync(SERVICES_DIR).filter(f => f.endsWith('.js'));
        const routeFiles   = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));

        // Combinar todo el código que puede referenciar un service
        const allSrc = [APP_PATH, ...routeFiles.map(f => path.join(ROUTES_DIR, f))]
            .map(p => fs.readFileSync(p, 'utf8'))
            .join('\n');

        const orphans = serviceFiles.filter(file => {
            const baseName = file.replace('.js', '');
            return !allSrc.includes(`'../services/${baseName}'`) &&
                   !allSrc.includes(`"../services/${baseName}"`);
        });

        if (orphans.length > 0) {
            throw new Error('Services sin consumidores:\n' + orphans.join('\n'));
        }
        expect(orphans).toHaveLength(0);
    });
});

// ─── 5. STUBS 501 — LISTA ESTABLE ────────────────────────────────────────────
//
// Documenta y congela la lista de endpoints pendientes de implementación.
// Si alguien añade o elimina un stub sin actualizar este test, CI falla.

describe("Stubs 501 — lista congelada (FASE I.4)", () => {
    test("admin.routes.js contiene exactamente los stubs conocidos", () => {
        const adminSrc = fs.readFileSync(
            path.resolve(__dirname, '../routes/admin.routes.js'), 'utf8'
        );

        // Rutas implementadas como 501 pendiente (integración ERP-específica)
        const STUBS_CONOCIDOS = [
            '/traspasar-inventarios',
            '/importar-regularizaciones',
            '/asignar-fecha-stock-inicial',
        ];

        STUBS_CONOCIDOS.forEach(stub => {
            expect(adminSrc).toContain(stub);
        });

        // Contar cuántos endpoints devuelven 501
        // Implementados: borrar-picking, poner-cero-carrusel, copia-seguridad
        // Pendientes (ERP-específicos): traspasar-inventarios, importar-regularizaciones, asignar-fecha-stock-inicial
        const count501 = (adminSrc.match(/res\.status\(501\)/g) || []).length;
        expect(count501).toBe(3);
    });

    test("config.routes.js no tiene stubs 501 (configuracion-empresa implementado)", () => {
        const configSrc = fs.readFileSync(
            path.resolve(__dirname, '../routes/config.routes.js'), 'utf8'
        );
        const count501 = (configSrc.match(/res\.status\(501\)/g) || []).length;
        expect(count501).toBe(0);
        expect(configSrc).toContain('/configuracion-empresa');
    });
});

// ─── 6. SEGURIDAD BÁSICA — HEADERS HELMET ─────────────────────────────────────

describe("app.js usa helmet y cors (FASE I.4)", () => {
    test("app.js referencia helmet", () => {
        const appSrc = fs.readFileSync(APP_PATH, 'utf8');
        expect(appSrc).toContain("helmet");
    });

    test("app.js referencia cors", () => {
        const appSrc = fs.readFileSync(APP_PATH, 'utf8');
        expect(appSrc).toContain("cors");
    });

    test("app.js referencia rateLimit", () => {
        const appSrc = fs.readFileSync(APP_PATH, 'utf8');
        expect(appSrc).toContain("rateLimit");
    });
});
