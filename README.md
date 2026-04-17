"# PROYECTO-SGA-JS-NODE.JS" 
# 📦 SGA LIN - Sistema de Gestión de Almacén

> ⚠️ **ESTADO DEL PROYECTO:** Este sistema se encuentra actualmente **en construcción**. Las funcionalidades se están implementando y refinando progresivamente.

## 🎯 Destino del Proyecto
Este software está diseñado específicamente para la gestión y control de inventario del almacén de **LIN**. El objetivo es digitalizar el flujo de mercancías, permitiendo un control preciso del stock, la trazabilidad por lotes y la optimización de ubicaciones, sustituyendo procesos manuales por una interfaz web conectada directamente a la base de datos SQL Server.

---

## 📂 Estructura del Proyecto

El proyecto está dividido en dos grandes bloques para separar la lógica de servidor de la interfaz de usuario:

```text
SGA/
├── backend/                # Lógica de servidor y API
│   ├── api.js              # Endpoints de la API y lógica de negocio
│   ├── db.js               # Configuración de conexión a SQL Server (Ignorado en Git)
│   ├── package.json        # Dependencias de Node.js (express, mssql, cors)
│   └── node_modules/       # Librerías instaladas
└── frontend/               # Interfaz de usuario (Vanilla JS)
    ├── index.html          # Dashboard principal (Estadísticas)
    ├── css/                # Estilos modulares por pantalla
    ├── js/                 # Lógica de frontend y peticiones Fetch
    └── pages/              # Pantallas del sistema (Entradas, Consultas, etc.)