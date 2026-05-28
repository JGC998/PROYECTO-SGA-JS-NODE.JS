# Entorno de desarrollo local con Docker (Linux)

Instrucciones para levantar SQL Server en Docker y arrancar el proyecto.
Ejecutar todos los comandos desde una **terminal del host** (no desde VS Code / Flatpak).

---

## 1. Arrancar SQL Server

```bash
# Desde la raíz del proyecto
docker compose up -d
```

El contenedor tarda ~30 segundos en estar listo. Puedes verificar con:

```bash
docker compose ps
# El healthcheck debe aparecer como "healthy"
```

---

## 2. Crear el esquema e importar datos de prueba

```bash
# Crear todas las tablas
docker exec sga-sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P 'SgaLocal2024!' -No \
  -i /docker-entrypoint-initdb.d/01_schema.sql

# Importar datos de ejemplo
docker exec sga-sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P 'SgaLocal2024!' -No \
  -i /docker-entrypoint-initdb.d/02_seed.sql
```

Solo hay que hacer esto la primera vez (o si quieres resetear los datos).

---

## 3. Arrancar el backend

```bash
cd backend
node api.js
# → SGA API en http://localhost:3000
```

La conexión a SQL Server es automática. Si el contenedor no está levantado, las rutas
que usan SQL devuelven error 500 pero el resto del frontend sigue funcionando.

---

## 4. Parar el entorno

```bash
docker compose stop       # Para el contenedor (datos persistidos en volumen)
docker compose down       # Para y elimina el contenedor (datos persistidos)
docker compose down -v    # Para, elimina contenedor Y el volumen (reset total)
```

---

## Credenciales del SQL Server Docker

| Parámetro | Valor         |
|-----------|--------------|
| Server    | localhost     |
| Port      | 1433          |
| Database  | SGALIN        |
| User      | sa            |
| Password  | SgaLocal2024! |

Puedes conectarte desde DBeaver, Azure Data Studio, etc. con estos datos.

---

## Datos de prueba incluidos

- 2 almacenes (ALM01, ALM02)
- 20 artículos con stock en ubicaciones
- 17 ubicaciones de picking
- Movimientos de entrada, expedición, regularización y pedidos pendientes
- 5 usuarios (admin, juan, paco, operario1, operario2)
- Artículos con stock bajo mínimo para probar las alertas del sidebar
