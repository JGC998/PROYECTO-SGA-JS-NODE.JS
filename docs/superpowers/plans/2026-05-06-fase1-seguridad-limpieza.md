# FASE 1 — Seguridad y Limpieza del Repositorio SGA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limpiar el repositorio de residuos, archivos mal trackeados y configuraciones inseguras, preparándolo para testing y colaboración sin exponer información sensible.

**Architecture:** Solo se modifican metadatos de git, archivos de configuración y documentación. No se toca lógica de negocio, frontend, backend ni node_modules. Todos los cambios son reversibles con `git checkout` o `git rm --cached`.

**Tech Stack:** Git, Node.js/Express, SQL Server, mssql/msnodesqlv8, Claude Code skills.

---

## Estado inicial verificado (2026-05-06)

> Este bloque resume el análisis completo ya realizado. No volver a analizar en la sesión de ejecución — usar directamente.

| Archivo | Estado git | Problema detectado |
|---|---|---|
| `backend/db.js` | Ignorado ✓ | Ninguno. Correctamente fuera de git. |
| `backend/db.js.md` | Trackeado | Muestra conexión SQL Auth (user/password) que contradice la configuración real (Windows Auth ODBC). Residuo engañoso. |
| `backend/api.js` | Trackeado ✓ | Sin secretos. SQL 100% parametrizado. CORS sin restricción de origen (aceptable en LAN). |
| `backend/package.json` | Trackeado ✓ | Correcto. `msnodesqlv8` ya añadido en esta sesión. |
| `.gitignore` | Trackeado | Faltan: `.claude/settings.local.json`, `Thumbs.db`, `*.log` |
| `.claude/settings.local.json` | **TRACKEADO** ⚠️ | Fichero `.local` que NO debería versionarse. Contiene permisos de Claude Code. |
| `.claude/commands/weapp-testing.md` | Trackeado | Nombre con typo (`weapp` en vez de `webapp`). Skill obsoleta. |
| `.claude/commands/webapp-testing.md` | **No trackeado** ⚠️ | Versión corregida del skill. Sin añadir a git. |
| `.claude/commands/*.md` (resto) | Trackeados ✓ | Correcto. Skills del equipo. |
| `README.md` | Trackeado | Sin secretos. Arquitectura desactualizada (no menciona ODBC ni módulos nuevos). |
| `frontend/pages/almacen-3d/` | Ver Tarea 0 | Estado ambiguo. Verificar antes de actuar. |
| Stash | `stash@{0}` en `unificado` | No afecta `paco-dev`. No tocar. |

### Hallazgos de seguridad en api.js (ya verificados, no repetir)

- `/datos/:tabla` (línea 1130): **SEGURO**. Doble validación: regex `^[a-zA-Z0-9_]+$` + consulta a `sys.tables` parametrizada antes de interpolar el nombre de tabla.
- `/consulta-de-stock` (línea 399): `cond` es un ternario hardcoded, no input del usuario. **SEGURO**.
- Todos los demás endpoints usan `.input()` de mssql. **SEGUROS**.
- `app.use(cors())` sin restricción de origen. **Aceptable** para despliegue en LAN local. Documentar en README.

---

## Mapa de archivos

| Acción | Archivo | Motivo |
|---|---|---|
| Modificar | `.gitignore` | Añadir 3 entradas |
| Ejecutar | `git rm --cached` | Desindexar `settings.local.json` |
| Ejecutar | `git rm --cached` | Desindexar `weapp-testing.md` (typo) |
| Ejecutar | `git add` | Indexar `webapp-testing.md` (correcto) |
| Modificar | `backend/db.js.md` | Actualizar template a ODBC Driver 17 / Windows Auth |
| Modificar | `README.md` | Actualizar stack y arquitectura |
| Verificar | `frontend/pages/almacen-3d/` | Decidir si trackear o ignorar |
| Commit | — | Un commit limpio con todos los cambios |

---

## Tarea 0: Verificar estado de `frontend/pages/almacen-3d/`

> Esta tarea es de decisión, no de ejecución. Ejecutar ANTES que todo lo demás.

**Files:**
- Verify: `frontend/pages/almacen-3d/` (existencia y contenido)

- [ ] **Step 1: Comprobar si el directorio existe en disco**

```powershell
Test-Path "frontend\pages\almacen-3d"
```

Expected: `True` (el usuario tiene el archivo abierto en el IDE) o `False`.

- [ ] **Step 2: Comprobar si está trackeado**

```bash
git ls-files frontend/pages/almacen-3d/
```

Expected: Sin output (no trackeado) o lista de archivos (trackeado).

- [ ] **Step 3: Decidir según resultado**

| Situación | Acción |
|---|---|
| Existe en disco, NO trackeado, es WIP activo | Añadir `frontend/pages/almacen-3d/` a `.gitignore` temporalmente hasta que esté listo |
| Existe en disco, NO trackeado, está listo | Añadirlo con `git add frontend/pages/almacen-3d/` en el commit final |
| Existe en disco, SÍ trackeado | No hacer nada (ya resuelto) |
| No existe en disco | No hacer nada |

**Riesgo:** Si se añade a `.gitignore` y más tarde se quiere trackear, hay que hacer `git rm -r --cached frontend/pages/almacen-3d/` primero. Riesgo bajo.

**Verificación:** `git status --short` no debería mostrar `?? frontend/pages/almacen-3d/` tras la decisión.

---

## Tarea 1: Actualizar `.gitignore`

**Files:**
- Modify: `.gitignore`

**Riesgo:** Bajo. Añadir entradas a `.gitignore` no afecta archivos ya trackeados. `settings.local.json` seguirá rastreado hasta que se ejecute `git rm --cached` en Tarea 2.

- [ ] **Step 1: Verificar contenido actual**

```bash
cat .gitignore
```

Expected output actual:
```
node_modules/
backend/node_modules/
backend/db.js
.env
```

- [ ] **Step 2: Editar `.gitignore`**

Sustituir el contenido completo por:

```gitignore
# Dependencias
node_modules/
backend/node_modules/

# Conexión a base de datos (nunca versionar)
backend/db.js
.env

# Configuración local de Claude Code (local por convención .local)
.claude/settings.local.json

# Sistema operativo Windows
Thumbs.db
desktop.ini

# Logs
*.log
npm-debug.log*
```

- [ ] **Step 3: Verificar que db.js sigue ignorado**

```bash
git check-ignore -v backend/db.js
```

Expected: `.gitignore:5:backend/db.js	backend/db.js`

- [ ] **Step 4: Verificar que settings.local.json aparece en .gitignore**

```bash
git check-ignore -v .claude/settings.local.json
```

Expected: `.gitignore:8:.claude/settings.local.json	.claude/settings.local.json`

> Nota: aunque ya aparece en `.gitignore`, seguirá siendo trackeado hasta que se ejecute `git rm --cached` (Tarea 2). El `check-ignore` solo verifica la regla, no el estado de tracking.

---

## Tarea 2: Desindexar `settings.local.json`

**Files:**
- Untrack: `.claude/settings.local.json`

**Riesgo:** Medio. Este comando elimina el archivo del índice git pero lo mantiene en disco. Si alguien hace `git checkout` del archivo desde un commit anterior, volverá a aparecer como trackeado. El archivo local no se pierde.

**Reversibilidad:** `git add .claude/settings.local.json` lo devuelve al índice.

- [ ] **Step 1: Confirmar que el archivo está trackeado actualmente**

```bash
git ls-files .claude/settings.local.json
```

Expected: `.claude/settings.local.json`

- [ ] **Step 2: Eliminar del índice (sin borrar el archivo)**

```bash
git rm --cached .claude/settings.local.json
```

Expected output: `rm '.claude/settings.local.json'`

- [ ] **Step 3: Verificar que el archivo sigue existiendo en disco**

```bash
cat .claude/settings.local.json
```

Expected: El JSON con los permisos de PowerShell debe seguir ahí intacto.

- [ ] **Step 4: Verificar estado**

```bash
git status --short
```

Expected: `D  .claude/settings.local.json` (staged delete) y `?? .claude/settings.local.json` NO debería aparecer porque ahora está en `.gitignore`.

---

## Tarea 3: Resolver duplicado `weapp-testing.md` → `webapp-testing.md`

**Files:**
- Untrack: `.claude/commands/weapp-testing.md`
- Track: `.claude/commands/webapp-testing.md`

**Contexto:** Existe `.claude/commands/weapp-testing.md` (trackeado, typo en el nombre) y `.claude/commands/webapp-testing.md` (no trackeado, nombre correcto). Son el mismo skill, la versión nueva reemplaza a la vieja.

**Riesgo:** Bajo. Los skills de Claude Code se cargan por nombre de archivo. Al desindexar `weapp-testing.md` e indexar `webapp-testing.md`, el skill dejará de llamarse `weapp-testing` y pasará a llamarse `webapp-testing` en Claude Code. No afecta al backend ni frontend.

- [ ] **Step 1: Verificar que ambos archivos existen**

```bash
git ls-files .claude/commands/weapp-testing.md
```
Expected: `.claude/commands/weapp-testing.md`

```bash
git status --short .claude/commands/webapp-testing.md
```
Expected: `?? .claude/commands/webapp-testing.md`

- [ ] **Step 2: Desindexar el archivo con typo**

```bash
git rm --cached .claude/commands/weapp-testing.md
```

Expected: `rm '.claude/commands/weapp-testing.md'`

> El archivo físico permanece en disco. Se puede borrar manualmente después si se desea, pero no es obligatorio para que el plan funcione.

- [ ] **Step 3: Añadir el archivo con nombre correcto**

```bash
git add .claude/commands/webapp-testing.md
```

Expected: Sin output (operación silenciosa en git).

- [ ] **Step 4: Verificar estado**

```bash
git status --short .claude/commands/
```

Expected:
```
D  .claude/commands/weapp-testing.md
A  .claude/commands/webapp-testing.md
```

---

## Tarea 4: Actualizar `backend/db.js.md`

**Files:**
- Modify: `backend/db.js.md`

**Contexto:** Este archivo es una plantilla para desarrolladores nuevos. El contenido actual muestra SQL Auth (user/password) que contradice la configuración real del proyecto (Windows Auth via ODBC Driver 17). Es un residuo del diseño original que nunca se actualizó tras la migración.

**Riesgo:** Muy bajo. Solo es documentación. No afecta al runtime.

- [ ] **Step 1: Verificar contenido actual**

```bash
git show HEAD:backend/db.js.md
```

Expected: Verá `require('mssql')` con `user`, `password`, `server` — la config antigua SQL Auth.

- [ ] **Step 2: Reemplazar el contenido completo**

Escribir en `backend/db.js.md`:

```markdown
Plantilla del archivo db.js que debe colocarse en backend/db.js (sin extensión .md).
Este archivo NO se versiona. Requiere Windows Authentication y ODBC Driver 17 instalado.

const sql = require('mssql/msnodesqlv8');

const dbConfig = {
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=LIN;Trusted_Connection=Yes;'
};

let poolPromise = null;

async function getPool() {
    if (!poolPromise) {
        poolPromise = new sql.ConnectionPool(dbConfig)
            .connect()
            .then(pool => {
                console.log('✅ Conectado a SQL Server (ODBC Driver 17 for SQL Server)');
                return pool;
            })
            .catch(err => {
                console.log('❌ Error de Conexión:', err);
                poolPromise = null;
                throw err;
            });
    }
    return poolPromise;
}

module.exports = { sql, getPool };
```

- [ ] **Step 3: Verificar que no queda ninguna referencia a SQL Auth ni DSN**

```bash
grep -n "user\|password\|DSN\|require('mssql')" backend/db.js.md
```

Expected: Sin output (sin matches).

---

## Tarea 5: Actualizar `README.md`

**Files:**
- Modify: `README.md`

**Contexto:** El README no menciona el driver ODBC, describe la conexión como "usuario, contraseña" (implica SQL Auth), y no lista los módulos nuevos (estadísticas, analítica, almacén-mapa, almacén-3d). No es un riesgo de seguridad pero es deuda de documentación que confunde en futuras sesiones de Claude Code.

**Riesgo:** Muy bajo. Solo documentación. No afecta runtime.

- [ ] **Step 1: Verificar sección "Base de datos" actual**

```bash
grep -n "usuario\|contraseña\|password\|DSN\|ODBC" README.md
```

Expected: Sin matches sobre credenciales reales (solo texto descriptivo).

- [ ] **Step 2: Localizar la sección a actualizar**

```bash
grep -n "Base de datos\|Stack tecnológico\|Módulos" README.md
```

Expected: Líneas 116-121 (Base de datos) y líneas 36-47 (Stack).

- [ ] **Step 3: Actualizar sección "Base de datos" (líneas ~116-121)**

Reemplazar el bloque:
```markdown
## Base de datos

SQL Server local — base de datos `LIN`.

Tablas principales: `ARTICULO`, `STOCK`, `UBICACION`, `PROVEEDOR`, `OPERARIO`, `CLIENTE`.

La configuración de conexión (servidor, usuario, contraseña) se mantiene en `backend/db.js`, que **no está versionado** para no exponer credenciales.
```

Por:
```markdown
## Base de datos

SQL Server local — base de datos `LIN` — autenticación Windows (sin usuario/contraseña).

**Requisito:** ODBC Driver 17 for SQL Server instalado en el equipo.

Tablas principales: `ARTICULO`, `STOCK`, `UBICACION`, `PROVEEDOR`, `CLIENTE`, `ALBARANCS`, `ALMACENES`.

La cadena de conexión se mantiene en `backend/db.js` (no versionado). Usar `backend/db.js.md` como plantilla.
```

- [ ] **Step 4: Actualizar tabla Stack tecnológico**

Añadir la fila de driver en la tabla de stack (después de la fila de Base de datos):

```markdown
| Driver BD | mssql 12 + msnodesqlv8 + ODBC Driver 17 |
| Autenticación BD | Windows Authentication (sin credenciales en código) |
```

- [ ] **Step 5: Verificar que no quedan referencias a "usuario, contraseña" en el README**

```bash
grep -ni "usuario\|contraseña\|password" README.md
```

Expected: Sin matches relacionados con credenciales de BD.

---

## Tarea 6: Commit final limpio

**Files:**
- Todos los archivos modificados en Tareas 1-5

**Riesgo:** Irreversible en remoto si se hace push. Solo hacer push si el usuario lo pide explícitamente. El commit local es siempre reversible con `git reset HEAD~1`.

- [ ] **Step 1: Revisar estado completo antes del commit**

```bash
git status
```

Expected (estado típico antes del commit):
```
Changes to be committed:
  deleted:    .claude/commands/weapp-testing.md
  new file:   .claude/commands/webapp-testing.md
  deleted:    .claude/settings.local.json

Changes not staged for commit:
  modified:   .gitignore
  modified:   backend/db.js.md
  modified:   README.md
```

Si `.gitignore`, `db.js.md` o `README.md` aparecen en "not staged", añadirlos:
```bash
git add .gitignore backend/db.js.md README.md
```

- [ ] **Step 2: Revisar el diff completo antes de commitear**

```bash
git diff --cached
```

Verificar visualmente:
- `.gitignore` añade 3 entradas, no borra ninguna
- `settings.local.json` aparece como borrado del índice
- `weapp-testing.md` aparece como borrado del índice
- `webapp-testing.md` aparece como nuevo
- `db.js.md` no tiene usuario/password ni DSN
- `README.md` no tiene referencias a credenciales

- [ ] **Step 3: Verificar que `backend/db.js` NO está en el diff**

```bash
git diff --cached backend/db.js
```

Expected: Sin output (no debe aparecer — está ignorado).

- [ ] **Step 4: Crear el commit**

```bash
git commit -m "$(cat <<'EOF'
chore: limpieza fase 1 — seguridad y metadatos del repositorio

- .gitignore: añadir settings.local.json, Thumbs.db, *.log
- settings.local.json: desindexar (archivo local, no versionable)
- skills: renombrar weapp-testing → webapp-testing (corregir typo)
- db.js.md: actualizar template a ODBC Driver 17 / Windows Auth
- README: corregir sección de BD y stack tecnológico

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected: Mensaje de commit con los archivos listados.

- [ ] **Step 5: Verificar el commit**

```bash
git log --oneline -3
git show --stat HEAD
```

Expected: El nuevo commit aparece primero con los archivos correctos.

- [ ] **Step 6: Verificar que db.js sigue sin estar trackeado**

```bash
git ls-files backend/db.js
```

Expected: Sin output (no trackeado).

---

## Criterio de éxito final

Ejecutar esta batería completa. Todos deben pasar:

```bash
# 1. db.js no está trackeado
git ls-files backend/db.js | wc -l
# Expected: 0

# 2. settings.local.json no está trackeado pero existe en disco
git ls-files .claude/settings.local.json | wc -l
# Expected: 0
Test-Path .claude/settings.local.json
# Expected: True

# 3. Solo webapp-testing.md existe en el índice (no weapp)
git ls-files .claude/commands/ | grep testing
# Expected: .claude/commands/webapp-testing.md (sin weapp)

# 4. db.js.md no contiene SQL Auth ni DSN
grep -c "user\|password\|DSN" backend/db.js.md
# Expected: 0

# 5. README no tiene referencias a credenciales de BD
grep -ci "contraseña\|password" README.md
# Expected: 0

# 6. .gitignore contiene las tres entradas nuevas
grep -c "settings.local.json\|Thumbs.db\|\.log" .gitignore
# Expected: 3

# 7. Working tree limpio
git status --short
# Expected: solo untracked files si los hay (weapp-testing.md en disco es inofensivo)
```

---

## Riesgos y su mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| `git rm --cached` borra archivo en disco | Imposible — `--cached` solo borra del índice | — | Confirmado por diseño del comando |
| El skill `weapp-testing` deja de funcionar | Bajo | Bajo | Existe `webapp-testing.md` con el mismo contenido |
| `settings.local.json` reaparece en git tras pull | Posible | Bajo | El `.gitignore` ya lo previene |
| `frontend/pages/almacen-3d/` mal gestionado | Medio | Medio | Ver Tarea 0 — decidir explícitamente |
| El commit se pushea accidentalmente | Bajo | Bajo | NO hacer push a menos que el usuario lo solicite explícitamente |
| `db.js.md` se confunde con `db.js` real | Imposible — `.md` nunca es ejecutado por Node | — | |

---

## Lo que NO se toca en esta fase

- `backend/api.js` — sin cambios. SQL ya parametrizado. No se refactoriza.
- `backend/db.js` — sin cambios. Ya fue migrado a ODBC Driver 17 en sesión anterior.
- `backend/package.json` — sin cambios. Ya contiene `msnodesqlv8` correcto.
- `frontend/` — sin cambios. Ningún archivo del frontend.
- `node_modules/` — sin cambios. Ignorado por `.gitignore`.
- Lógica de negocio — ninguna.

---

## Notas para futuras sesiones

1. **CORS**: `app.use(cors())` en `api.js` no restringe origen. Aceptable para LAN interna. Si el proyecto se expone a internet, añadir `cors({ origin: 'http://127.0.0.1:5500' })`.
2. **`/datos/:tabla`**: Endpoint legítimamente dinámico. La doble validación (regex + sys.tables) lo hace seguro. No tocar.
3. **msnodesqlv8 versión**: `package.json` tiene `^5.1.9` (versión actualizada por linter en sesión de migración). Compatible con mssql 12 y ODBC Driver 17.
4. **Stash en `unificado`**: `stash@{0}` contiene trabajo WIP de esa rama. No tocar desde `paco-dev`.
5. **`almacen-3d`**: Módulo 3D en desarrollo. Ver Tarea 0 para decisión de tracking.
