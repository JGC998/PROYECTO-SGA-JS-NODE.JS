"use strict";

// Patrones de error de conexión SQL — ya logueados por db.js, no repetir aquí
const _DB_ERR_RE = /Login failed|ConnectionError|SQL Server no disponible|ECONNREFUSED|connection.*refused/i;

function serverError(res, err) {
    const msg = err?.message ?? String(err);
    if (!_DB_ERR_RE.test(msg)) {
        console.error("[ERROR]", err?.stack ?? msg);
    }
    return res.status(500).json({ error: "Error interno del servidor" });
}

function parsePagination(query) {
    const page = Math.max(0, parseInt(query.page) || 0);
    const pageSize = Math.min(Math.max(1, parseInt(query.pageSize) || 500), 1000);
    return { page, pageSize };
}

function escCsv(v) {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
}

function toCSV(rows) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    for (const row of rows) lines.push(headers.map(h => escCsv(row[h])).join(','));
    return lines.join('\r\n');
}

function sendCsv(res, filename, rows) {
    const csv = toCSV(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv); // BOM para que Excel abra bien con tildes
}

module.exports = { serverError, parsePagination, sendCsv };
