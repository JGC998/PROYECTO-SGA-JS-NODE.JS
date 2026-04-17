const API_URL = 'http://localhost:3000';

const SGA_API = {
    // Obtener todas las tablas
    getTablas: async () => {
        const res = await fetch(`${API_URL}/tablas`);
        return await res.json();
    },

    // Obtener datos de una tabla
    getDatos: async (tabla) => {
        const res = await fetch(`${API_URL}/datos/${tabla}`);
        return await res.json();
    },

    // Registrar una entrada de mercancía
    registrarEntrada: async (datos) => {
        const res = await fetch(`${API_URL}/entrada`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        return await res.json();
    }
};