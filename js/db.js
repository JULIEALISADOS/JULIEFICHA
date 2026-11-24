import { SB_URL, SB_KEY, MODO_ABIERTO } from './config.js';
import { localApi } from './db-local.js';

/**
 * Capa de datos. MODO_ABIERTO = base local de prueba (sin red). Modo real = Supabase con cuentas individuales (Auth),
 * segundo factor para el administrador y permisos por fila (migraciones 20261118*): la tablet CREA fichas, solo el administrador LEE.
 * Estado 18-nov-2026: modo real escrito pero NO probado de punta a punta (faltan cuentas, funciones de Drive y de codigo).
 */
let sb;
try {
    if (MODO_ABIERTO) {
        sb = undefined; // modo abierto: sin red ni base real
    } else if (typeof window.supabase !== 'undefined') {
        sb = window.supabase.createClient(SB_URL, SB_KEY);
    } else {
        console.error('Supabase Library not loaded');
    }
} catch (e) {
    console.error('❌ Error Inicializando Supabase:', e.message);
}

export const getDb = () => sb;
const falla = (error) => { if (error) throw error; };

// ---------------- Sesion y segundo factor ----------------
export const haySesion = async () => {
    if (MODO_ABIERTO) return true;
    const { data } = await sb.auth.getSession();
    return !!data?.session;
};

export const cerrarSesion = async () => { if (!MODO_ABIERTO && sb) await sb.auth.signOut(); };

export const loginUserSecure = async (email, password) => {
    if (MODO_ABIERTO) return localApi.loginUserSecure(email);
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data?.user) return null;
    const { data: perfil } = await sb.from('perfiles').select('rol, nombre, sede, activo').eq('user_id', data.user.id).maybeSingle();
    if (!perfil || !perfil.activo) { await sb.auth.signOut(); return null; }
    return { success: true, role: perfil.rol, nombre: perfil.nombre || email, sede: perfil.sede || null };
};

export const mfaEstado = async () => {
    if (MODO_ABIERTO) return { factorId: null, nivel: 'aal2' };
    const { data: f } = await sb.auth.mfa.listFactors();
    const total = (f?.totp || []).find((x) => x.status === 'verified');
    const { data: a } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    return { factorId: total?.id || null, nivel: a?.currentLevel || 'aal1' };
};

export const mfaInscribir = async () => {
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Celular de administración' });
    falla(error);
    return { factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret };
};

export const mfaVerificar = async (factorId, codigo) => {
    const ch = await sb.auth.mfa.challenge({ factorId });
    falla(ch.error);
    const v = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: codigo });
    falla(v.error);
    return true;
};

export const verifyAdminPasswordSecure = async () => {
    if (MODO_ABIERTO) return localApi.verifyAdminPasswordSecure();
    const { data, error } = await sb.rpc('es_admin');
    falla(error);
    return data === true;
};

export const updateStylistPassword = async (name, oldPass, newPass) => {
    if (MODO_ABIERTO) return localApi.updateStylistPassword();
    const { error } = await sb.auth.updateUser({ password: newPass });
    falla(error);
    return true;
};

// ---------------- Fichas ----------------
// Reduce fotos a 1600 px / JPEG (~300-500 KB). Si el navegador no puede leer el formato, se sube el original.
const comprimirImagen = (file, maxPx = 1600, calidad = 0.82) => new Promise((resolve) => {
    if (!file || !/^image\//.test(file.type || '')) return resolve(file);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        try {
            const k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.naturalWidth * k));
            c.height = Math.max(1, Math.round(img.naturalHeight * k));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            c.toBlob((b) => { URL.revokeObjectURL(url); resolve(b && b.size < file.size ? new File([b], 'foto.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', calidad);
        } catch (e) { URL.revokeObjectURL(url); resolve(file); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
});

// 'idCliente' = identificador unico de ESTE formulario (no el folio, que lo asigna el servidor al guardar).
// La ruta es fija por archivo: si se reintenta el envio tras cortarse el internet, no se duplican archivos.
export const uploadImg = async (file, prefix, idCliente) => {
    if (MODO_ABIERTO) return localApi.uploadImg(file);
    if (!file) return 'sin-foto';
    const subir = await comprimirImagen(file);
    const ext = (subir.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const ruta = `${idCliente || 'sin-id'}/${prefix}.${ext}`;
    // Cajon PRIVADO: solo el administrador (con segundo factor) lo lee, mediante enlace firmado temporal. Se guarda solo la ruta.
    const { error } = await sb.storage.from('evidencia-temp').upload(ruta, subir, { contentType: subir.type || undefined });
    if (error && !/already exists|duplicate/i.test(error.message || '') && String(error.statusCode) !== '409') throw new Error('Error al subir el archivo: ' + error.message);
    return ruta;
};

// Convierte las rutas guardadas en la ficha en enlaces firmados (1 hora) para ver fotos y video. Solo funciona para el administrador.
export const urlsDeFicha = async (f) => {
    const campos = ['foto_antes_url', 'foto_despues_url', 'foto_obs_diag_url', 'foto_obs_carac_url', 'foto_obs_cuero_url', 'video_url'];
    let extras = [];
    try { extras = JSON.parse(f.fotos_extra_urls || '[]'); if (!Array.isArray(extras)) extras = []; } catch (e) { extras = []; }
    const esRuta = (v) => typeof v === 'string' && v && v !== 'sin-foto' && v !== '---' && !/^(https?:|data:|blob:)/i.test(v);
    const directa = (v) => (typeof v === 'string' && /^(https:|data:image)/i.test(v) ? v : null);
    const salida = { extras: [] };
    if (MODO_ABIERTO) { campos.forEach((c) => { salida[c] = directa(f[c]); }); salida.extras = extras.map(directa).filter(Boolean); return salida; }
    const rutas = [...new Set([...campos.map((c) => f[c]), ...extras].filter(esRuta))];
    const mapa = {};
    if (rutas.length) {
        const { data, error } = await sb.storage.from('evidencia-temp').createSignedUrls(rutas, 3600);
        falla(error);
        (data || []).forEach((r) => { if (r.signedUrl) mapa[r.path] = r.signedUrl; });
    }
    campos.forEach((c) => { salida[c] = directa(f[c]) || mapa[f[c]] || null; });
    salida.extras = extras.map((e) => directa(e) || mapa[e]).filter(Boolean);
    return salida;
};

// ---------------- Notas adicionales (24-nov): se SUMAN a la ficha cerrada, con su hora; nunca la cambian ----------------
// Devuelve [{creado_en, autor_nombre, texto, foto_url (ruta), foto (enlace firmado o null)}]
export const fetchNotas = async (folio) => {
    if (MODO_ABIERTO) return (localApi.fetchNotas ? localApi.fetchNotas(folio) : []);
    const { data, error } = await sb.rpc('notas_de_ficha', { p_folio: String(folio) });
    falla(error);
    const notas = data || [];
    const rutas = notas.map((n) => n.foto_url).filter((r) => r && !/^(https?:|data:)/i.test(r));
    const mapa = {};
    if (rutas.length) {
        const { data: s } = await sb.storage.from('evidencia-temp').createSignedUrls(rutas, 3600);
        (s || []).forEach((r) => { if (r.signedUrl) mapa[r.path] = r.signedUrl; });
    }
    return notas.map((n) => ({ ...n, foto: n.foto_url ? (mapa[n.foto_url] || null) : null }));
};
export const agregarNota = async (folio, texto, archivo, idCliente, autor) => {
    if (MODO_ABIERTO) return (localApi.agregarNota ? localApi.agregarNota(folio, texto, archivo, autor) : null);
    let ruta = null;
    if (archivo) ruta = await uploadImg(archivo, 'nota_' + Date.now(), idCliente || ('folio-' + folio));
    const { data, error } = await sb.rpc('agregar_nota_ficha', { p_folio: String(folio), p_texto: texto || '', p_foto: ruta, p_autor_nombre: autor || null });
    falla(error);
    return data;
};

export const insertFicha = async (cleanData) => {
    if (MODO_ABIERTO) return localApi.insertFicha(cleanData);
    const { data, error } = await sb.rpc('crear_ficha', { p: cleanData });
    falla(error);
    return data; // folio asignado por el servidor
};

export const fetchNextID = async () => {
    if (MODO_ABIERTO) return localApi.fetchNextID();
    const { data, error } = await sb.rpc('siguiente_folio');
    falla(error);
    return data;
};

export const fetchHistory = async () => {
    if (MODO_ABIERTO) return localApi.fetchHistory();
    // Sin firmas ni evidencia (pesan mucho): el detalle completo se pide por folio.
    const { data, error } = await sb.from('fichas').select('id, consecutivo, created_at, sede, nombre_completo, numero_documento, telefono, procedimiento, estilista_responsable, foto_antes_url, video_url').order('created_at', { ascending: false }).limit(1000);
    falla(error);
    return data || [];
};

export const getFichaByConsecutivo = async (consecutivo) => {
    if (MODO_ABIERTO) return localApi.getFichaByConsecutivo(consecutivo);
    const { data, error } = await sb.from('fichas').select('*').eq('consecutivo', String(consecutivo)).maybeSingle();
    falla(error);
    if (data) await sb.rpc('registrar_acceso', { p_ficha: data.id, p_accion: 'ver_ficha' });
    return data || null;
};

export const getLastFichaByDoc = async (docNumber) => {
    if (MODO_ABIERTO) return localApi.getLastFichaByDoc(docNumber);
    const { data, error } = await sb.from('fichas').select('*').eq('numero_documento', String(docNumber)).order('created_at', { ascending: false }).limit(1);
    falla(error);
    return data && data.length ? data[0] : null;
};

// Borrar ficha: solo el administrador con 2.o factor (lo exige la base). Primero la fila, luego sus fotos/video.
export const deleteFichaDb = async (consecutivo) => {
    if (MODO_ABIERTO) return localApi.deleteFichaDb(consecutivo);
    const f = await getFichaByConsecutivo(consecutivo);
    if (!f) return false;
    let extras = [];
    try { extras = JSON.parse(f.fotos_extra_urls || '[]'); if (!Array.isArray(extras)) extras = []; } catch (e) { extras = []; }
    const rutas = [...new Set([f.foto_antes_url, f.foto_despues_url, f.foto_obs_diag_url, f.foto_obs_carac_url, f.foto_obs_cuero_url, f.video_url, ...extras]
        .filter((v) => typeof v === 'string' && v && v !== 'sin-foto' && v !== '---' && !/^(https?:|data:|blob:)/i.test(v)))];
    const { data, error } = await sb.rpc('borrar_ficha', { p_consecutivo: String(consecutivo) });
    falla(error);
    if (rutas.length) { const r = await sb.storage.from('evidencia-temp').remove(rutas); if (r.error) console.error('archivos de la ficha no borrados', r.error); }
    return !!data;
};

// Folio nuevo: despues de escribir la cedula (paso 1 solo avisa si existe; paso 2, al pulsar el boton, trae datos clinicos limitados).
export const existeFolioAnterior = async (doc) => {
    if (MODO_ABIERTO) { const f = await localApi.getLastFichaByDoc(doc); return { existe: !!f, total: f ? 1 : 0, ultima: f?.created_at || null }; }
    const { data, error } = await sb.rpc('existe_folio_anterior', { p_doc: String(doc) });
    falla(error);
    return data || { existe: false, total: 0 };
};
export const consultarFolioAnterior = async (doc) => {
    if (MODO_ABIERTO) { const f = await localApi.getLastFichaByDoc(doc); return f ? { ...f, folios: [{ consecutivo: f.consecutivo, fecha: f.created_at, procedimiento: f.procedimiento, sede: f.sede }] } : null; }
    const { data, error } = await sb.rpc('consultar_folio_anterior', { p_doc: String(doc) });
    falla(error);
    return data || null;
};

// Marca folios como liquidados (solo administracion; no repite los ya liquidados). Devuelve los consecutivos realmente actualizados.
export const liquidateFoliosDb = async (folioIds, { liquidation_id, liquidated_at }) => {
    if (MODO_ABIERTO) return localApi.liquidateFoliosDb(folioIds);
    const { data, error } = await sb.from('fichas').update({ liquidation_id, liquidated_at }).in('consecutivo', folioIds.map(String)).is('liquidated_at', null).select('consecutivo');
    falla(error);
    return (data || []).map((r) => String(r.consecutivo));
};

// ---------------- Estilistas ----------------
export const fetchStylists = async () => {
    if (MODO_ABIERTO) return localApi.fetchStylists();
    const { data, error } = await sb.rpc('listar_estilistas', { p_sede: null });
    falla(error);
    return data;
};

export const fetchStylistsSecure = async () => {
    if (MODO_ABIERTO) return localApi.fetchStylistsSecure();
    const { data, error } = await sb.from('estilistas').select('id, nombre, telefono, email, sede, activo').order('nombre');
    falla(error);
    return (data || []).filter((e) => e.activo !== false);
};

export const deleteStylistDb = async (id) => {
    if (MODO_ABIERTO) return localApi.deleteStylistDb(id);
    const { error } = await sb.from('estilistas').update({ activo: false }).eq('id', id); // se desactiva, no se borra
    falla(error);
    return true;
};

export const updateStylistDb = async (id, s) => {
    if (MODO_ABIERTO) return true;
    const { error } = await sb.from('estilistas').update({ nombre: s.nombre, telefono: s.telefono || null, email: s.email || null, sede: s.sede || null }).eq('id', id);
    falla(error);
    return true;
};

export const addStylistDb = async (s) => {
    if (MODO_ABIERTO) return localApi.addStylistDb(s);
    const { error } = await sb.from('estilistas').insert({ nombre: s.nombre, telefono: s.telefono || null, email: s.email || null, sede: s.sede || null });
    falla(error);
    return true;
};

// ---- Pantalla de Control (solo administracion) ----
export const fetchBitacora = async () => {
    if (MODO_ABIERTO) return localApi.fetchBitacora();
    const { data, error } = await sb.from('bitacora_accesos').select('id, creado_en, accion, ficha_id, detalle, usuario').order('creado_en', { ascending: false }).limit(200);
    falla(error);
    return (data || []).map((r) => ({ ...r, folio: r.detalle?.folio ?? '' }));
};

export const fetchSyncDrive = async () => {
    if (MODO_ABIERTO) return localApi.fetchSyncDrive();
    const { data, error } = await sb.from('fichas').select('consecutivo, sede, created_at, drive_sync_estado, drive_sync_intentos, drive_sync_error').order('created_at', { ascending: false }).limit(200);
    falla(error);
    return data || [];
};

export const fetchNovedades = async () => {
    if (MODO_ABIERTO) return localApi.fetchNovedades();
    const { data, error } = await sb.from('fichas').select('consecutivo, nombre_completo, telefono, email, edad, autoriza_marketing, autoriza_publicidad').order('created_at', { ascending: false }).limit(300);
    falla(error);
    return data || [];
};

// ---- Garantias (solo administracion). Requiere la tabla `garantias` (ficha_digital_borrador/04_garantias_BORRADOR.sql, aun NO aplicada). ----
export const fetchGarantias = async () => {
    if (MODO_ABIERTO) return localApi.fetchGarantias();
    const { data, error } = await sb.from('garantias').select('*').order('actualizada_en', { ascending: false }).limit(300);
    falla(error);
    return data || [];
};

export const guardarGarantia = async (g) => {
    if (MODO_ABIERTO) return localApi.guardarGarantia(g);
    const fila = { ...g, actualizada_en: new Date().toISOString() };
    const { data, error } = await sb.from('garantias').upsert(fila).select().single();
    falla(error);
    return data;
};
