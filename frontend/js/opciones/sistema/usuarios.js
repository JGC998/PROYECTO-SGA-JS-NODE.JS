let todosUsuarios = [];
let indiceActual = 0;

const campos = {
    codigo: document.getElementById('usu-codigo'),
    nombre: document.getElementById('usu-nombre'),
    tipo:   document.getElementById('usu-tipo'),
    nivel:  document.getElementById('usu-nivel'),
};

async function cargarUsuarios() {
    try {
        todosUsuarios = await SGA.usuarios.list();
        renderTabla(todosUsuarios);
        if (todosUsuarios.length) mostrarRegistro(0);
    } catch {
        document.getElementById('tbody-usuarios').innerHTML =
            '<tr class="placeholder-row"><td colspan="5">Error al conectar con el servidor.</td></tr>';
    }
}

function renderTabla(rows) {
    const tbody = document.getElementById('tbody-usuarios');
    if (!rows.length) {
        tbody.innerHTML = '<tr class="placeholder-row"><td colspan="5">No se encontraron usuarios.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map((r, i) => `
        <tr class="${i === indiceActual ? 'selected' : ''}" onclick="mostrarRegistro(${i})" style="cursor:pointer">
            <td>${r.codigo ?? ''}</td>
            <td>${r.nombre ?? ''}</td>
            <td>${r.tipo ?? ''}</td>
            <td>${r.nivel ?? ''}</td>
            <td>
                <button class="btn-icon" title="Editar" onclick="event.stopPropagation();mostrarRegistro(${i})">✏️</button>
                <button class="btn-icon btn-icon-danger" title="Borrar" onclick="event.stopPropagation();borrarUsuario(${i})">🗑️</button>
            </td>
        </tr>`).join('');
}

function mostrarRegistro(idx) {
    indiceActual = idx;
    const r = todosUsuarios[idx];
    if (!r) return;
    campos.codigo.value = r.codigo ?? '';
    campos.nombre.value = r.nombre ?? '';
    campos.tipo.value   = r.tipo   ?? '';
    campos.nivel.value  = r.nivel  ?? '';
    renderTabla(todosUsuarios);
}

async function borrarUsuario(idx) {
    const r = todosUsuarios[idx];
    if (!r) return;
    if (!confirm(`¿Borrar el usuario "${r.nombre}" (${r.codigo})?`)) return;
    try {
        await SGA.usuarios.delete(r.codigo);
        await cargarUsuarios();
    } catch {
        alert('Error al borrar el usuario.');
    }
}

document.getElementById('btn-guardar').addEventListener('click', async () => {
    const data = {
        codigo: campos.codigo.value.trim(),
        nombre: campos.nombre.value.trim(),
        tipo:   campos.tipo.value.trim(),
        nivel:  campos.nivel.value.trim(),
    };
    if (!data.codigo || !data.nombre) { alert('Código y nombre son obligatorios.'); return; }
    try {
        await SGA.usuarios.save(data);
        await cargarUsuarios();
    } catch {
        alert('Error al guardar el usuario.');
    }
});

document.getElementById('btn-nuevo').addEventListener('click', () => {
    campos.codigo.value = '';
    campos.nombre.value = '';
    campos.tipo.value   = '';
    campos.nivel.value  = '';
    campos.codigo.focus();
});

document.querySelector('.search-bar').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderTabla(todosUsuarios.filter(r =>
        Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))
    ));
});

cargarUsuarios();
