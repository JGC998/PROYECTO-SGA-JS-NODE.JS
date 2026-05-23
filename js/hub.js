// Estado del servidor en la página de inicio
fetch('/server-info')
    .then(r => {
        const dot = document.getElementById('srv-dot');
        const txt = document.getElementById('srv-txt');
        if (r.ok) {
            dot.classList.add('online');
            r.json().then(info => {
                txt.textContent = 'Servidor activo en http://localhost:' + info.port
                    + '  ·  Red local: http://' + info.ip + ':' + info.port;
            });
        } else {
            txt.textContent = 'Servidor no responde — ejecuta ./start.sh';
        }
    })
    .catch(() => {
        document.getElementById('srv-txt').textContent = 'Servidor no detectado — ejecuta ./start.sh';
    });
