/**
 * Base de datos LOCAL de prueba (MODO_ABIERTO). Guarda en IndexedDB del navegador; no usa red.
 * Misma forma de respuesta que las funciones de db.js para que app.js no cambie.
 */
const DB_NAME = 'julieficha_local';
let _db;

const open = () => _db || (_db = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
}));
const kvGet = async (k, def) => { const db = await open(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result === undefined ? def : q.result); q.onerror = () => rej(q.error); }); };
const kvSet = async (k, v) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); };

const SEED_STYLISTS = [
    { id: 1, nombre: 'Estilista de Prueba 1', telefono: '3000000001', email: 'prueba1@example.com' },
    { id: 2, nombre: 'Estilista de Prueba 2', telefono: '3000000002', email: 'prueba2@example.com' }
];
const stylists = async () => { const s = await kvGet('estilistas', null); if (s) return s; await kvSet('estilistas', SEED_STYLISTS); return SEED_STYLISTS; };
const fichas = () => kvGet('fichas', []);
const registrar = async (accion, folio) => {
    const b = await kvGet('bitacora', []);
    b.push({ id: Date.now() + Math.random(), creado_en: new Date().toISOString(), usuario: 'Modo abierto', accion, folio: String(folio ?? '') });
    await kvSet('bitacora', b.slice(-1000));
};

const toDataUrl = (file, max = 1000) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload = () => {
        const img = new Image();
        img.onerror = () => res('sin-foto');
        img.onload = () => {
            const k = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            res(c.toDataURL('image/jpeg', 0.72));
        };
        img.src = fr.result;
    };
    fr.readAsDataURL(file);
});

export const localApi = {
    async uploadImg(file) {
        if (!file) return 'sin-foto';
        if (!String(file.type).startsWith('image/')) return 'video-local-no-guardado';
        return toDataUrl(file);
    },
    async insertFicha(row) {
        const f = await fichas();
        const prev = row.id_cliente && f.find((x) => x.id_cliente === row.id_cliente);
        if (prev) return prev.consecutivo; // igual que el servidor: un formulario = una ficha
        const folio = String(f.reduce((m, x) => Math.max(m, parseInt(String(x.consecutivo).replace(/\D/g, ''), 10) || 0), 0) + 1);
        f.push({ ...row, consecutivo: folio, created_at: new Date().toISOString() }); await kvSet('fichas', f); await registrar('crear_ficha', folio);
        return folio;
    },
    async fetchGarantias() { return (await kvGet('garantias', [])).slice().sort((a, b) => String(b.actualizada_en).localeCompare(String(a.actualizada_en))); },
    async guardarGarantia(g) {
        const lista = await kvGet('garantias', []); const ahora = new Date().toISOString();
        const i = g.id ? lista.findIndex(x => x.id === g.id) : -1;
        const fila = i >= 0 ? { ...lista[i], ...g, actualizada_en: ahora } : { ...g, id: crypto.randomUUID(), creada_en: ahora, actualizada_en: ahora };
        if (i >= 0) lista[i] = fila; else lista.push(fila);
        await kvSet('garantias', lista); await registrar('garantia_' + fila.estado, fila.folio); return fila;
    },
    async fetchBitacora() { return (await kvGet('bitacora', [])).slice().reverse().slice(0, 200); },
    async fetchSyncDrive() { return (await fichas()).slice().reverse().slice(0, 200).map(r => ({ consecutivo: r.consecutivo, sede: r.sede, created_at: r.created_at, drive_sync_estado: 'modo_prueba', drive_sync_intentos: 0, drive_sync_error: null })); },
    async fetchNovedades() { return (await fichas()).slice().reverse().slice(0, 300).map(r => ({ consecutivo: r.consecutivo, nombre_completo: r.nombre_completo, telefono: r.telefono, email: r.email, edad: r.edad, autoriza_marketing: !!r.autoriza_marketing, autoriza_publicidad: !!r.autoriza_publicidad })); },
    async fetchNextID() { const f = await fichas(); const max = f.reduce((m, r) => Math.max(m, parseInt(r.consecutivo, 10) || 0), 0); return max + 1; },
    fetchStylists: async () => stylists(),
    fetchStylistsSecure: async () => stylists(),
    loginUserSecure: async () => ({ role: 'admin', nombre: 'Modo abierto' }),
    verifyAdminPasswordSecure: async () => true,
    async fetchHistory() { return (await fichas()).slice().sort((a, b) => (parseInt(b.consecutivo, 10) || 0) - (parseInt(a.consecutivo, 10) || 0)); },
    async liquidateFoliosDb(ids) { const f = await fichas(); const set = new Set(ids.map(String)); f.forEach(r => { if (set.has(String(r.consecutivo))) r.liquidado = true; }); await kvSet('fichas', f); return [...set]; },
    async getFichaByConsecutivo(c) { const r = (await fichas()).find(x => String(x.consecutivo) === String(c)) || null; if (r) await registrar('ver_ficha', c); return r; },
    async getLastFichaByDoc(d) { const l = (await fichas()).filter(r => String(r.numero_documento) === String(d)); return l.length ? l[l.length - 1] : null; },
    async deleteFichaDb(c) { await kvSet('fichas', (await fichas()).filter(r => String(r.consecutivo) !== String(c))); return true; },
    async deleteStylistDb(id) { await kvSet('estilistas', (await stylists()).filter(s => String(s.id) !== String(id))); return true; },
    async addStylistDb(s) { const l = await stylists(); l.push({ id: Date.now(), nombre: s.nombre, telefono: s.telefono, email: s.email }); await kvSet('estilistas', l); return true; },
    async updateStylistPassword() { return true; }
};
