# Ideas SGA LIN — Hoja de Ruta

> Última actualización: 2026-05-25

---

## ✅ A implementar

### 1 — Alertas de stock mínimo ✅ Implementado
**Tabla fuente:** `ARTICULOSTOMIN` (ya existe con `MINSTOMIN` y `MINSTOMAX`)

Panel que lista los artículos cuyo stock actual (`STOCK.STOCAN`) está por debajo del mínimo configurado.
Columnas útiles: artículo, nombre, ubicación, stock actual, stock mínimo, diferencia.
Filtros: almacén, familia, solo críticos.
Extensión opcional: notificaciones push (Web Push API) cuando el stock baje de umbral tras una salida.

---

### 2 — Trazabilidad de movimientos por artículo / ubicación ✅ Implementado
**Tabla fuente:** tabla de movimientos existente en la BD (ALBARANCS)

Vista de "ficha de artículo" con historial completo:
quién movió, qué cantidad, cuándo, desde qué ubicación, hacia cuál, con qué albarán.
Filtros: por artículo, por ubicación, por fecha, por operario.
Exportable a CSV.

---

### 3 — Modo offline en móvil (`movil.html`) ✅ Implementado
Si el operario pierde WiFi dentro del almacén, las validaciones de paradas e incidencias
se guardan en `IndexedDB` en lugar de fallar.
Al recuperar conexión, se sincronizan automáticamente con el servidor (sync en background).
Indicador visual en la cabecera: "Sin conexión — X acciones pendientes".

---

## 💡 Buenas ideas (implementar solo si se pide)

### 4 — Inventario físico / recuento
Recuento periódico por ubicación o familia.
El operario recorre ubicaciones confirmando stock real desde la interfaz móvil
(misma UX que picking: paradas, validar, incidencia).
Al cerrar el recuento genera un informe de diferencias y permite regularizar en BD.

---

### 5 — Escaneo de código de barras en móvil
La API `BarcodeDetector` (nativa en Chrome/Android) o QuaggaJS como fallback
permite escanear artículos y ubicaciones con la cámara en lugar de escribir.
Puntos de entrada: `movil.html` (escanear artículo al validar parada)
y entrada de mercancía (escanear artículo y ubicación al registrar).

---

### 6 — Sistema de notificaciones interno
Feed de eventos visible desde el menú lateral (icono campana + badge):
nuevo picking creado, incidencia reportada, stock bajo mínimo, backup completado.
Sin Web Push — solo SSE hacia clientes conectados + badge persistente en `localStorage`.

---

### 7 — Búsqueda global (`Ctrl+K`)
Buscador unificado que busca en paralelo en artículos, ubicaciones, albaranes y pickings.
Resultados agrupados por tipo, navegables con teclado.
Implementable como overlay sobre cualquier página sin recargar.

---

### 8 — Dashboard de inicio personalizable
La página de inicio actual es estática.
Widgets configurables (drag & drop o simplemente seleccionables):
artículos bajo mínimo, pickings en curso, última entrada, movimientos del día,
operarios activos, estado del almacén 3D (% ocupación por zona).

---

### 9 — Etiquetas QR / código de barras imprimibles
Generar PDF con hojas de etiquetas (grid A4) para ubicaciones y artículos.
Ya existe el endpoint `/api/almacen/qr` — extenderlo para generar PDFs con
múltiples QR/barcodes listos para imprimir y pegar en estanterías.
Biblioteca candidata: `pdfkit` (Node.js, sin dependencias nativas).
