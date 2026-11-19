export const SB_URL = 'https://hzvwruiybynkifqsekkp.supabase.co';
export const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6dndydWl5Ynlua2lmcXNla2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTE3MDgsImV4cCI6MjA5MDEyNzcwOH0.MmpGISOawK0LLg4roJMzHgdDkRZ6XwRxO3InbOHFYXw';

// MODO ABIERTO (18-nov-2026, orden del Director): app sin clave y SIN conexion a la base real.
// Todo se guarda solo en este navegador (IndexedDB) con datos de prueba. Mientras sea true NO se publica.
// Al dejar la app lista se pone en false y se vuelve al acceso con clave (ver plan de la ficha digital).
// 19-nov-2026: BETA EN REAL (orden del Director). Ya habla con Supabase y exige clave.
export const MODO_ABIERTO = false;

// Confirmacion del consentimiento por codigo (WhatsApp o correo). Si es true, no se puede guardar la ficha sin confirmar.
// Beta simple (19-nov): sin codigo de confirmacion; la firma en la tablet y la casilla de aceptacion quedan como evidencia.
export const OTP_OBLIGATORIO = false;

// POLITICA DE GARANTIA: fuente unica en la app. Copia fiel de https://juliealisados.com/politica-garantia.html (leida en vivo el 18-nov-2026).
// Si la web cambia, se cambia SOLO aqui y el modulo de garantias, el consentimiento y el PDF quedan alineados.
export const POLITICA_GARANTIA = {
    url: 'https://juliealisados.com/politica-garantia.html',
    verificadaWeb: '2026-11-18',
    diasVigencia: 20,            // dias calendario desde la fecha del procedimiento; despues no se procesan solicitudes
    diasMinimosReaplicacion: 8,  // la reaplicacion nunca antes de 8 dias del servicio original y dentro de la vigencia
    valorLavadoTecnicoCOP: 20000, // si el lavado en sede muestra que el problema es de cuidados
    whatsapp: '304 358 8180',
    aplicaA: 'alisados progresivos realizados en los locales de Julie Alisados',
    exclusiones: [
        'Uso de productos no aptos para alisado progresivo (con sal o quimicos agresivos)',
        'Exposicion a piscinas, agua salada, aguas termales, agua caliente excesiva o cloro',
        'Procedimientos quimicos o con herramientas de calor realizados en otro establecimiento despues del alisado',
        'Cambios del cabello por tratamientos quimicos adicionales (tintes, decoloraciones)',
        'Insatisfaccion por estilos o cambios previamente aprobados por la clienta',
        'Deformacion mecanica por memoria capilar (cascos, bandas elasticas apretadas, dormir con el cabello humedo): es temporal y no es falla del liso'
    ],
    pasosReclamacion: [
        'Presentar la reclamacion dentro de los 20 dias calendario',
        'Enviar video del cabello recien lavado y secado con secador, sin plancha, siguiendo las recomendaciones y con los productos recomendados; debe mostrar claramente las ondas o el problema',
        'Confirmar que productos uso despues del procedimiento'
    ]
};
export const sumarDias = (fecha, dias) => { const d = new Date(fecha); d.setDate(d.getDate() + dias); return d; };
// Las fechas sin hora (AAAA-MM-DD) se leen como fecha LOCAL (si no, en Colombia se mostraria un dia antes).
const aFecha = (f) => (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) ? new Date(f + 'T12:00:00') : new Date(f));
export const fmtFechaLarga = (d) => aFecha(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

// SEDES: para agregar una sede nueva (Bogotá, Florida...) basta con una linea aqui y sus estilistas en la tabla `estilistas` (campo sede).
// prefijo = indicativo de pais para WhatsApp; zona = zona horaria; idioma = idioma de los textos (es/en, los textos en ingles requieren revision legal).
export const SEDES = [
    { nombre: 'Tunja', pais: 'CO', prefijo: '57', zona: 'America/Bogota', idioma: 'es', direccion: 'Pasaje Boulevard, Local 140' },
    { nombre: 'Moniquirá', pais: 'CO', prefijo: '57', zona: 'America/Bogota', idioma: 'es', direccion: 'Edificio Mónaco, Centro', alias: ['Moniquira'] }
];
const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const sedePorNombre = (n) => SEDES.find((s) => sinTildes(s.nombre) === sinTildes(n) || (s.alias || []).some((a) => sinTildes(a) === sinTildes(n))) || null;
// Telefono listo para wa.me: solo digitos; si no trae indicativo se agrega el de la sede.
export const telefonoParaWhatsApp = (tel, sedeNombre) => {
    const d = String(tel ?? '').replace(/\D/g, '');
    const p = (sedePorNombre(sedeNombre) || SEDES[0]).prefijo;
    if (String(tel ?? '').trim().startsWith('+')) return d;
    return d.length > 10 && d.startsWith(p) ? d : p + d;
};
