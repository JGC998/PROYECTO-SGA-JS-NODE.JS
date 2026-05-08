"use strict";

(function () {
    document.addEventListener('DOMContentLoaded', function () {
        /* Si .sga-breadcrumb-current existe pero está vacío,
           rellenar con el título de la página (sin el prefijo "SGA LIN") */
        var current = document.querySelector('.sga-breadcrumb-current');
        if (current && !current.textContent.trim()) {
            current.textContent = document.title
                .replace(/^SGA LIN\s*[—–-]\s*/i, '')
                .replace(/^SGA LIN\s*/i, '');
        }
    });
})();
