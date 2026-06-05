"use strict";

let datosOriginales = {};

const btnEditar   = document.getElementById('btn-editar');
const btnGuardar  = document.getElementById('btn-guardar');
const btnCancelar = document.getElementById('btn-cancelar');
const form        = document.getElementById('form-empresa');
const msgEl       = document.getElementById('msg-config');

function setModoVista() {
    form.querySelectorAll('input').forEach(el => el.setAttribute('readonly', ''));
    btnEditar.classList.remove('hidden');
    btnGuardar.classList.add('hidden');
    btnCancelar.classList.add('hidden');
    msgEl.textContent = '';
    msgEl.className = 'msg';
}

function setModoEdicion() {
    form.querySelectorAll('input').forEach(el => el.removeAttribute('readonly'));
    btnEditar.classList.add('hidden');
    btnGuardar.classList.remove('hidden');
    btnCancelar.classList.remove('hidden');
}

async function cargarConfig() {
    try {
        datosOriginales = await SGA.configuracionEmpresa.get();
        const inputs = form.querySelectorAll('input');
        inputs.forEach(el => { el.value = String(datosOriginales[el.name] ?? '').trim(); });
    } catch {
        msgEl.textContent = 'Error al cargar la configuración.';
        msgEl.className = 'msg error';
    }
    setModoVista();
}

btnEditar.addEventListener('click', setModoEdicion);

btnCancelar.addEventListener('click', () => {
    form.querySelectorAll('input').forEach(el => { el.value = String(datosOriginales[el.name] ?? '').trim(); });
    setModoVista();
});

btnGuardar.addEventListener('click', async () => {
    const data = {};
    form.querySelectorAll('input').forEach(el => { if (el.name) data[el.name] = el.value; });
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';
    try {
        await SGA.configuracionEmpresa.save(data);
        datosOriginales = { ...data };
        sessionStorage.removeItem('sga_empresa_nombre');
        msgEl.textContent = 'Configuración guardada correctamente.';
        msgEl.className = 'msg ok';
        setModoVista();
        setTimeout(() => location.reload(), 800);
    } catch {
        msgEl.textContent = 'Error al guardar la configuración.';
        msgEl.className = 'msg error';
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = '💾 Guardar';
    }
});

cargarConfig();
