# FASE 5B.1 — Validación UX Operativa del Picking

## Metadata

| Campo   | Valor                                          |
|---------|------------------------------------------------|
| Fase    | 5B.1                                           |
| Tipo    | Validación UX + refinamiento operativo         |
| Depende | FASE 5B implementada y funcional               |
| Archivos modificados | picking.js · picking/index.css    |
| Archivos nuevos | ninguno                               |
| Estado  | PLANIFICADO — no implementar todavía           |

---

## Persona de referencia para este análisis

**Pablo, 43 años, preparador de almacén.**
- 15 años en el mismo almacén.
- Usa una tablet Samsung 10" con funda industrial.
- A veces lleva guantes finos.
- Trabaja de pie, desplazándose entre pasillos.
- Tiene 200+ preparaciones al mes.
- Ve el sistema por primera vez después de que se lo han instalado sin formación.
- No le interesan los tecnicismos. Solo quiere saber: **¿dónde voy, qué cojo, cuánto cojo?**

Cualquier cosa que no responda a esas tres preguntas en menos de 2 segundos es un problema.

---

## Diagnóstico UX — Brutalmente honesto

### PROBLEMA 1 — Triple redundancia de estado en tarjeta (MEDIO)

La tarjeta comunica el estado del albarán de **tres formas distintas y simultáneas**:

```
[borde izquierdo amarillo/naranja/verde]
[badge "Pendiente / Parcial / Preparado"]
[barra de progreso gris/naranja/verde]
```

Los tres elementos dicen lo mismo. Pablo no necesita leer el badge si la barra de progreso
ya lo indica visualmente. Ruido cognitivo que ralentiza el escaneo de la lista.

**Lo que sobra:** el badge en la tarjeta (la barra + el borde son suficientes).
El badge es útil en el panel detalle, no en la lista.

---

### PROBLEMA 2 — La ubicación llega TERCERA en la línea (CRÍTICO)

Orden actual en `buildLineaEl`:
```
[1] icono estado
[2] articulo — nombre_articulo       ← lo que se coge
[3] cantidad · lote                  ← cuánto
[4] 📍 ubicacion — nom_ubicacion     ← DÓNDE IR
[5] stock info
```

Orden mental de Pablo:
```
→ ¿Dónde voy?    (ubicación)
→ ¿Qué cojo?     (nombre del artículo)
→ ¿Cuánto cojo?  (cantidad)
```

La información más crítica — la ubicación — aparece en cuarta posición.
Pablo tiene que leer toda la línea antes de saber a qué estantería ir.
Con 10 líneas por albarán, ese coste se multiplica.

**Lo que hay que hacer:** poner ubicación en primer lugar, en fuente más grande.

---

### PROBLEMA 3 — Targets táctiles críticamente pequeños (CRÍTICO)

Los botones de acción en cada línea:

```css
.pk-linea-link {
    font-size: 11px;
    padding: 2px 8px;   /* altura total ≈ 15–17px */
}
```

**Apple HIG mínimo: 44×44px. Material Design mínimo: 48dp.**
Un target de 15–17px de altura en una tablet industrial equivale
a fallar el toque 1 de cada 3 veces con guantes, o en movimiento.

Pablo intentará hacer tap en "→ Movimientos" y abrirá la tarjeta de al lado.
Repite el intento. Se frustra. Deja de usarlo.

El botón cerrar del panel también es pequeño:
```css
.pk-panel-close {
    font-size: 18px;
    padding: 2px 6px;   /* altura total ≈ 22px */
}
```

**Lo que hay que hacer:** mínimo 44px de altura para todo elemento tappable.

---

### PROBLEMA 4 — La fecha en la tarjeta no aporta nada al picker (BAJO-MEDIO)

```
ALB 12345 · E      ← "E" = serie interna, no significa nada para Pablo
11/05/2026         ← fecha de la expedición, tampoco le importa
```

Pablo no trabaja con fechas de expedición. Trabaja con lo que tiene delante.
La fecha ocupa espacio y añade información que genera preguntas: "¿es de hoy? ¿de ayer?".
La serie "E" es código interno del ERP que no aporta nada al operario.

**Lo que hay que hacer:** eliminar serie de la tarjeta. Mover fecha a posición secundaria
o eliminarla directamente de la tarjeta (mantener en el panel detalle).

---

### PROBLEMA 5 — El número de picking en el footer de la tarjeta (BAJO)

```
3/5 líneas · ⚠ 2 faltantes · Pick.#456
```

`Pick.#456` es un número de tracking interno. Pablo no sabe qué es.
No lo usa para nada en su recorrido físico.
Añade ruido visual al footer que ya tiene información importante (faltantes).

**Lo que hay que hacer:** eliminar de la tarjeta. Mantener en el panel detalle si se necesita.

---

### PROBLEMA 6 — Meta del panel demasiado densa antes de ver las líneas (ALTO)

El panel detalle muestra ANTES de las líneas:

```
[línea 1]  Albarán 12345 / E          ← código interno
[línea 2]  EMPRESA ABC S.L. · CLI001  ← cliente + código
[línea 3]  11/05/2026                 ← fecha
[línea 4]  3 de 5 líneas preparadas (60%) · 2 faltantes
[línea 5]  [badge Parcial]
```

5 líneas de meta antes de ver a qué ubis ir.
Pablo abre el panel y tiene que hacer scroll para ver las líneas de trabajo.
En un bottom sheet en móvil (max-height 85vh), con 5 líneas de meta y
una barra de header, pueden quedar solo 2–3 líneas visibles sin scroll.

**Lo que hay que hacer:** reducir la meta a: cliente + progreso simple.
Eliminar fecha, código de cliente, serie, badge.

---

### PROBLEMA 7 — Código de artículo antes del nombre (MEDIO)

```
ART001 — TUERCA M8 INOX
```

Pablo piensa "TUERCA M8 INOX", no "ART001".
El código va primero y obliga al ojo a saltar sobre él para leer el nombre.
Para operarios con años de experiencia el código puede ser familiar,
pero para el escaneo visual rápido el nombre es la señal más potente.

**Lo que hay que hacer:** poner el nombre primero. El código en gris, secundario:

```
TUERCA M8 INOX
ART001
```

---

### PROBLEMA 8 — Stock siempre visible aunque no haya problema (BAJO-MEDIO)

```
Ubi: 200 ud · Total: 580 ud
```

Cuando el stock es suficiente, esta línea no aporta nada al picker.
Solo añade números que leer y descartar mentalmente.
Pablo no necesita saber que hay 580 unidades en total si solo necesita 50.

**Lo que hay que hacer:** mostrar stock SOLO cuando hay un problema
(stock_ubi < cantidad_pedida). En caso normal: no mostrar nada.
Cuando hay problema: mostrar con claridad qué falta.

---

### PROBLEMA 9 — Acciones de administración en cada línea (MEDIO)

Cada línea de artículo tiene siempre:
```
[→ Movimientos]  [→ Stock]
```

Estos botones son de uso administrativo y de supervisión.
Un picker que está en el pasillo B no va a consultar el historial de movimientos
de una línea. Estos botones distraen, ocupan espacio táctil y confunden.

**Lo que hay que hacer:** ocultar por defecto. Accesibles desde el panel meta
o tras tap largo / un botón "..." por línea.

---

### PROBLEMA 10 — Ícono de estado demasiado pequeño (BAJO)

```css
.pk-linea-icon {
    font-size: 15px;
    width: 20px;
}
```

Los iconos ✓/○/⚠/✗ son el semáforo principal del panel.
Con 15px de tamaño y 20px de zona, a 50–60cm de distancia en una tablet
el escaneo visual tiene que hacer zoom mental. Deberían ser 20–24px.

---

### PROBLEMA 11 — Barra de progreso a 5px de altura (BAJO)

```css
.pk-task-progress {
    height: 5px;
}
```

5px es bueno para diseño de oficina. En entorno industrial con reflejos,
luz fluorescente y tablet a 50cm, 5px puede ser difícil de leer.
7–8px es más seguro y sigue siendo discreto.

---

### PROBLEMA 12 — Faltante sin guía de acción (ALTO)

Cuando una línea tiene `✗` rojo (faltante), el picker no sabe qué hacer:
- ¿Saltarla?
- ¿Buscar en otro pasillo?
- ¿Notificar al responsable?
- ¿Confirmar la preparación sin esa línea?

La UI actual muestra el estado pero no ofrece orientación.
En entornos reales, la incertidumbre genera dos errores habituales:
1. El picker se detiene a preguntar → pierde tiempo.
2. El picker asume que puede saltarla → error de trazabilidad.

**Lo que hay que hacer (sin writes):** añadir texto de ayuda en líneas faltantes:
"Sin stock en ubicación. Consultar con responsable."

---

### PROBLEMA 13 — Sin altura mínima en tarjetas (BAJO)

Las tarjetas no tienen `min-height` definido. Con clientes de nombre corto
y pocos datos, pueden ser delgadas y difíciles de tocar en una lista densa.
Particularmente crítico cuando hay tarjetas consecutivas de albaranes
del mismo cliente (alto parecido visual).

---

### PROBLEMA 14 — Filtros de fecha visibles por defecto en móvil (BAJO)

En móvil, la fila de filtros se colapsa a columna:
Desde · Hasta · Buscar · Estado · Hoy · 7d · 30d · 90d

El picker en planta generalmente trabaja con "hoy" o "últimos 7 días".
Los campos de fecha manual son para supervisores. En móvil deberían
estar ocultos tras un toggle, con "Hoy" y "7d" visibles por defecto.

---

### PROBLEMA 15 — Badge del panel detalle redundante con el estado del card (BAJO)

Al abrir el panel, se muestra de nuevo el badge (Pendiente/Parcial/Preparado).
Como el card de donde viene ya lo muestra, es información redundante.
El espacio sería mejor aprovechado con el resumen de líneas.

---

## Análisis de carga cognitiva por pantalla

### Tarjeta (card)

Elementos que el ojo debe procesar por tarjeta:
```
1. Borde lateral de color
2. Barra de progreso (width + color)
3. Badge de texto (Pendiente/Parcial/Preparado)
4. Fecha
5. Número de albarán + serie
6. Nombre de cliente (+ código entre paréntesis)
7. Contador "X/N líneas"
8. [opcional] "⚠ N faltantes"
9. [opcional] "Pick.#XXX"
```

**Total: 7–9 elementos por tarjeta.**

Carga cognitiva alta para escaneo rápido.
Una tarjeta operativa industrial debería tener 3–4 elementos clave.

### Línea de artículo en panel

```
1. Ícono de estado (✓/○/⚠/✗)
2. Código de artículo
3. Nombre de artículo
4. Cantidad
5. Lote (cuando aplica)
6. Código de ubicación
7. Nombre de ubicación
8. Stock en ubicación
9. Stock total
10. Botón "→ Movimientos"
11. Botón "→ Stock"
```

**Total: 9–11 elementos por línea.**

Para un picker, la respuesta necesaria son 3 datos. El resto es ruido.

---

## Análisis táctil

| Elemento | Altura real | Mínimo requerido | Veredicto |
|----------|-------------|-----------------|-----------|
| `pk-linea-link` (acciones) | ~15px | 44px | ❌ FALLO CRÍTICO |
| `pk-panel-close` (×) | ~22px | 44px | ❌ FALLO |
| `pk-quick-btn` (desktop) | 34px | 44px | ⚠ JUSTO |
| `pk-quick-btn` (tablet) | 40px | 44px | ⚠ JUSTO |
| `pk-task` (card completa) | variable | 60px mínimo | ⚠ SIN MÍNIMO |
| `pk-date-input` | 34px | 44px | ⚠ JUSTO |
| `pk-status-select` | 34px | 44px | ⚠ JUSTO |
| Tap en card (area completa) | toda la card | — | ✅ OK |

---

## Análisis de colores

| Color | Uso actual | Problema |
|-------|-----------|---------|
| `#f59e0b` (amarillo) | borde pendiente | OK — señal de atención |
| `#f97316` (naranja) | borde parcial | ⚠ Confusión con stock-bajo |
| `#d97706` (naranja oscuro) | stock-bajo, barra parcial | Mismo tono que borde parcial |
| `#dc2626` (rojo) | faltante | OK — señal de alerta |
| `#16a34a` (verde) | preparado | OK |
| `#854d0e` (marrón) | badge pendiente, contador | Bajo contraste en tablet con reflejos |
| `var(--sga-text-muted)` | iconos ○ (pendiente) | Puede fundirse con fondo |

**Problema principal:** el naranja se usa para dos conceptos distintos:
- Estado de tarjeta "Parcial" (algunas líneas recogidas)
- Estado de línea "stock-bajo" (stock insuficiente)

Un operario podría confundir "esta tarjeta está en naranja porque falta stock"
con "esta tarjeta está en naranja porque está parcialmente preparada".

---

## Análisis de jerarquía visual

### Jerarquía actual en línea de artículo (panel)
```
[ícono 15px]  [CÓDIGO — nombre]        ← código primero
              [cantidad · lote]
              [📍 ubicación — nombre]   ← ubicación tercera
              [stock info]
              [→ Movimientos] [→ Stock]
```

### Jerarquía recomendada para operario
```
[ícono 22px]  [📍 UBICACIÓN]           ← dónde ir, PRIMERO y grande
              [Nombre artículo]         ← qué coger
              [CANTIDAD grande]         ← cuánto
              [código · lote en gris]   ← datos secundarios
              [stock solo si hay problema]
```

---

## Simulación de uso real — 3 escenarios

### Escenario A: Albarán sencillo, 3 líneas, todo en stock

Pablo abre la app. Ve una lista de tarjetas. Toca la primera.
Panel se abre. Tiene que leer: albarán, serie, cliente, código cliente, fecha,
resumen "3 de 3 líneas preparadas (0%) · 0 faltantes", badge.
**6 líneas de texto antes de ver qué hay que hacer.**
Empieza a leer las líneas. Primera: "ART001 — TUERCA M8" — va a la ubicación.
Ve "Ubi: 200 ud" — no necesitaba saberlo, pero lo leyó.
Ve "→ Movimientos" — qué es eso, ¿tengo que tocarlo? No. Sigue.
**Tiempo estimado por línea: 4–5 segundos. Necesario: 1–2 segundos.**

### Escenario B: Albarán con faltante, 5 líneas

Pablo abre el panel. Ve una línea con ✗ rojo.
"Sin stock en ubicación" — ¿y ahora qué hago?
Intenta tocar "→ Movimientos" para consultar. Falla el tap. Segundo intento.
Navega a movimientos, mira la pantalla, vuelve. Se ha perdido el contexto.
**Riesgo real de error: el picker podría marcar la línea como preparada
aunque sabe que no hay stock, para "no bloquear" el resto.**

### Escenario C: Lista larga, 15 albaranes, tablet

Pablo ve 15 tarjetas. Cada una tiene 7–9 elementos visuales.
Escanea buscando los urgentes. Las tarjetas de borde naranja (parcial) y
las de borde naranja-rojo (con faltantes) se parecen.
Los faltantes en el footer son pequeños: "⚠ 2 faltantes".
No es suficientemente prominente para distinguir rápidamente cuáles
tiene que escalar con el responsable vs. cuáles puede continuar.
**El picker podría empezar con el albarán equivocado.**

---

## Checklist de validación humana

A realizar en tablet (Samsung 10" o equivalente) antes de FASE 5B.2:

### Pantalla inicial
- [ ] ¿Se entiende en < 3 segundos qué hay que preparar?
- [ ] ¿Los albaranes urgentes destacan claramente de los normales?
- [ ] ¿Los faltantes son visibles sin leer el texto?
- [ ] ¿El filtro "Pendiente" funciona como primer filtro natural?
- [ ] ¿Hay mínimo de esfuerzo para llegar a la primera línea?

### Tarjeta de albarán
- [ ] ¿Se puede leer el cliente a 50cm sin gafas?
- [ ] ¿El progreso se entiende sin leer el porcentaje?
- [ ] ¿La diferencia entre Parcial y Faltante es obvia?
- [ ] ¿Se puede tocar la tarjeta con el pulgar sin mirar?

### Panel detalle
- [ ] ¿La primera línea visible al abrir el panel es una línea de trabajo?
- [ ] ¿Se puede leer la ubicación sin acercar la tablet?
- [ ] ¿La cantidad pedida es lo primero que se lee?
- [ ] ¿Las líneas faltantes son distinguibles en < 1 segundo?
- [ ] ¿El botón cerrar se puede tocar de un pulgar sin mirar?

### Responsive tablet
- [ ] ¿El panel lateral ocupa un ancho cómodo sin tapar la lista?
- [ ] ¿Los botones táctiles son accesibles con el pulgar derecho?
- [ ] ¿El scroll dentro del panel es fluido?
- [ ] ¿La tarjeta activa (seleccionada) es claramente visible?

### Responsive móvil
- [ ] ¿El bottom sheet permite ver mínimo 3 líneas sin scroll?
- [ ] ¿El botón cerrar está en posición de pulgar (esquina superior derecha)?
- [ ] ¿Los filtros son manejables en pantalla pequeña?

### Errores potenciales
- [ ] ¿Es posible confundir stock-bajo (⚠) con faltante (✗)?
- [ ] ¿Es posible confundir tarjeta naranja-parcial con naranja-faltante?
- [ ] ¿Es posible activar "→ Movimientos" sin querer?
- [ ] ¿Hay riesgo de cerrar el panel por accidente?

---

## Quick wins UX — Prioridades

### NIVEL CRÍTICO — Implementar antes de cualquier write

| # | Mejora | Archivo | Esfuerzo |
|---|--------|---------|---------|
| 1 | `pk-linea-link` height mínimo 44px | index.css | 1 línea CSS |
| 2 | `pk-panel-close` height mínimo 44px | index.css | 1 línea CSS |
| 3 | Ubicación como primer elemento de línea | picking.js | 5 líneas JS |

### NIVEL ALTO — Implementar antes de release operativo

| # | Mejora | Archivo | Esfuerzo |
|---|--------|---------|---------|
| 4 | Eliminar serie de tarjeta y panel header | picking.js | 3 líneas JS |
| 5 | Eliminar fecha de tarjeta | picking.js | 3 líneas JS |
| 6 | Eliminar Pick.# del footer de tarjeta | picking.js | 3 líneas JS |
| 7 | Reducir panel meta: solo cliente + progreso + badge | picking.js | 10 líneas JS |
| 8 | Nombre de artículo antes del código | picking.js | 2 líneas JS |
| 9 | Stock solo cuando hay problema | picking.js | 3 líneas JS |
| 10 | Añadir `min-height: 64px` a pk-task | index.css | 1 línea CSS |

### NIVEL MEDIO — Mejoran experiencia, no son bloqueantes

| # | Mejora | Archivo | Esfuerzo |
|---|--------|---------|---------|
| 11 | Eliminar badge de tarjeta (barra + borde son suficientes) | picking.js | 3 líneas JS |
| 12 | Ícono de estado de 15px → 22px | index.css | 1 línea CSS |
| 13 | Barra de progreso de 5px → 8px | index.css | 1 línea CSS |
| 14 | Ocultar acciones (→ Movimientos, → Stock) por defecto | picking.js + css | 15 líneas |
| 15 | Texto de ayuda en faltante: "Sin stock · Consultar responsable" | picking.js | 5 líneas JS |
| 16 | Diferencias de color entre parcial y stock-bajo más claras | index.css | 5 líneas CSS |
| 17 | `pk-quick-btn` a 44px en todos los breakpoints | index.css | 3 líneas CSS |

---

## Quick wins operativos

### Antes de writes, sin cambiar arquitectura:

1. **Filtro "Pendiente" como default** — en vez de "Todos", arrancar con "Pendiente" activo.
   El picker siempre trabaja con lo que aún no está preparado. Los preparados son
   para supervisión, no para trabajo.

2. **Ordenar tarjetas: faltantes primero** — actualmente el orden es por fecha.
   Operativamente: los albaranes con faltantes necesitan gestión manual urgente.
   Ordenar por `faltantes DESC, status (pendiente first), fecha DESC`.

3. **Contador de faltantes global** — el contador "Parciales" no distingue
   entre "preparación en curso" y "hay líneas sin stock". Añadir contador
   de albaranes con faltantes, en rojo, fuera de los 4 actuales.

4. **Panel: mostrar solo líneas pendientes primero, collapsable recogidas** —
   Las líneas ya recogidas (✓) no requieren atención. Si hay 10 líneas y 8 están
   recogidas, el picker ve 8 líneas grises antes de las 2 que necesita.
   Mejor: mostrar pendientes/faltantes arriba, recogidas colapsadas bajo un toggle.

---

## Recomendaciones de simplificación

### Tarjeta — de 7–9 elementos a 4

**Eliminar:** badge, fecha, serie, Pick.# del footer
**Mantener:** barra de progreso, nombre cliente, contador líneas, alerta faltantes

```
[████████░░] (barra de progreso)
ALB 12345
EMPRESA ABC S.L.
3/5 líneas  ·  ⚠ 2 faltantes
```

### Línea de artículo — de 9–11 elementos a 4–5

**Eliminar:** código de artículo (o moverlo a secundario), stock cuando OK,
             acciones siempre visibles
**Mantener + reordenar:**

```
[ícono grande]  📍 A-01-01 — Pasillo A Nivel 1
                TUERCA M8 INOX                    (nombre primero)
                × 50 ud  ·  Lote: 2024001         (cantidad + lote)
                [stock solo si hay problema]
```

### Meta del panel — de 6 líneas a 2

**Eliminar:** serie, código de cliente, fecha, badge, progress text detallado
**Mantener:**

```
EMPRESA ABC S.L.
████████░░  3/5 · ⚠ 2 faltantes
```

---

## Riesgos antes de FASE 5B.2 (confirmación de picking)

| Riesgo | Descripción | Consecuencia |
|--------|-------------|-------------|
| ⚠ Confusión naranja/naranja | Parcial y stock-bajo usan tonos naranjas parecidos | Picker confunde un problema de stock con un estado de progreso normal |
| ⚠ Faltante sin guía | El ✗ no explica qué hacer | Picker podría confirmar la preparación sin esa línea sin saberlo |
| ⚠ Touch targets < 44px | Botones de acción muy pequeños | En el momento de añadir botón "Confirmar", será igual de pequeño y fallará |
| ⚠ Meta demasiado densa | El panel tarda en llegar a las líneas | Al añadir botones de confirmación, la meta se hará aún más densa |
| ⚠ Orden de información erróneo | Ubicación llega tercera | El botón "Confirmar" aparecerá con contexto ambiguo sobre qué línea se confirma |

**Conclusión sobre riesgos:** todos los riesgos anteriores se agravan cuando se añaden
botones de write. Es más fácil corregir el layout ahora que después de añadir
la lógica de confirmación.

---

## Conclusiones honestas

### Lo que funciona bien

- **La idea del panel detalle lateral** es correcta para tablet y desktop.
- **El orden operativo de líneas** (faltantes primero, por ubicación) es bueno.
- **La barra de progreso** comunica más rápido que el badge.
- **El bottom sheet en móvil** es la solución correcta.
- **Cierre con Escape** es un detalle correcto.
- **El debounce en búsqueda** evita peticiones innecesarias.

### Lo que hay que cambiar antes de releases

1. Touch targets son inaceptables para uso táctil real.
2. La ubicación tiene que ser el dato más prominente de cada línea.
3. La densidad de información en tarjeta y panel es demasiado alta.
4. El faltante necesita orientación, no solo un color.
5. Los botones de administración (`→ Movimientos`, `→ Stock`) no deben
   estar visibles en el flujo primario del picker.

### Lo que puede esperar

- El tamaño del ícono de estado (bajo impacto).
- La diferenciación de colores naranja (mejora, no crítico).
- La barra de progreso más gruesa (estética).
- Ocultar acciones secundarias (mejora importante pero no bloquea).

---

## Recomendación final

**¿Está lista para writes?**

**No todavía.**

Los quick wins de nivel Crítico y Alto deben implementarse primero.
El motivo no es estético: es que cuando se añada un botón "Confirmar preparación"
encima de una UI con targets pequeños, información densa y ubicación en tercera
posición, el riesgo de confirmación errónea es real.

Un picker que confirma líneas en el orden equivocado o que confunde
un faltante con una línea parcial puede generar movimientos incorrectos
sobre ACSNUMPIC que luego son difíciles de corregir sin acceso al ERP.

**Orden recomendado:**

```
FASE 5B.1a  → Quick wins críticos (Problemas 1, 2, 3 de touch targets)
FASE 5B.1b  → Quick wins altos (simplificación tarjeta + línea + meta)
             → Validación humana con checklist
FASE 5B.2   → Writes: POST /picking/preparar-linea
```

Los cambios de FASE 5B.1a son todos CSS/JS de menos de 5 líneas cada uno.
La FASE 5B.1b implica reordenar `buildLineaEl` y `renderDetalle` en picking.js.
Ninguno de los dos toca backend ni tests. Tiempo estimado total: 2–3 horas.

---

## Orden de implementación para FASE 5B.1

### TASK 1 — Touch targets (index.css)
- `pk-linea-link`: `min-height: 44px; display: flex; align-items: center; padding: 8px 12px;`
- `pk-panel-close`: `min-width: 44px; min-height: 44px;`
- `pk-quick-btn`: `min-height: 44px` en todos los breakpoints
- `pk-task`: `min-height: 64px`

### TASK 2 — Reordenar línea de artículo (picking.js → `buildLineaEl`)
Nuevo orden en `pk-linea-content`:
1. `pk-linea-ubi` (PRIMERO, font 14px bold)
2. `pk-linea-art` solo nombre (sin código)
3. `pk-linea-codigo` (código en gris, 11px)
4. `pk-linea-data` (cantidad · lote)
5. `pk-linea-stock` solo si stock_ubi < cantidad_pedida

### TASK 3 — Limpiar tarjeta (picking.js → `buildCard`)
- Eliminar: `fecha`, `serie`, `numPicking` del footer
- Eliminar: `buildBadge(alb.status)` de la tarjeta

### TASK 4 — Reducir meta del panel (picking.js → `renderDetalle`)
- Eliminar: `mAlb` (serie), `mFecha`, badge del panel meta
- Simplificar `mCli`: solo `alb.nombre_cliente`
- Simplificar `mProg`: solo `X/N · ⚠ Y faltantes` (sin porcentaje)

### TASK 5 — Texto de ayuda en faltante (picking.js → `buildLineaEl`)
- Cuando `estado === 'faltante'`: añadir `pk-linea-hint` con texto
  "Sin stock en ubicación. Consultar con responsable."

### TASK 6 — Ocultar acciones secundarias (picking.js + index.css)
- Ocultar `pk-linea-actions` con `display: none` por defecto
- Añadir clase `pk-linea--expanded` al hacer tap en la línea → muestra las acciones
- Solo una línea expandida a la vez

### TASK 7 — Ícono y barra de progreso (index.css)
- `pk-linea-icon`: `font-size: 22px; width: 28px`
- `pk-task-progress`: `height: 8px`

### TASK 8 — Validación manual con checklist
Usar el checklist de este documento para validar cada breakpoint.
