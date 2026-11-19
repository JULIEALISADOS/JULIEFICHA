/**
 * Helpers de saneamiento contra XSS e inyección. Funciones puras (sin DOM) para poder probarlas.
 * REGLA: todo dato que venga de la base de datos, de un formulario o de una API externa debe pasar
 * por estos helpers antes de entrar a innerHTML, atributos HTML, URLs o archivos CSV.
 */

const HTML_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** Escapa texto para insertarlo en contenido HTML o en un valor de atributo entre comillas. */
export const esc = (value) => String(value ?? '').replace(/[&<>"'`]/g, (c) => HTML_MAP[c]);

/** Solo dígitos (teléfonos para wa.me / tel:). */
export const digits = (value) => String(value ?? '').replace(/\D/g, '');

/** Identificador seguro para usar dentro de handlers o selectores (folios, ids). */
export const safeId = (value) => String(value ?? '').replace(/[^A-Za-z0-9_.-]/g, '');

/**
 * URL segura para src="...": solo https:// o imágenes data: en base64.
 * Cualquier otra cosa (javascript:, http:, data:text/html, comillas) devuelve '' (la imagen no carga).
 */
export const safeUrl = (value) => {
    const s = String(value ?? '').trim();
    if (/^https:\/\/[^\s"'<>`]+$/i.test(s)) return esc(s);
    if (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(s)) return s;
    return '';
};

/** Celda CSV segura: neutraliza fórmulas de Excel (=, +, -, @) y escapa comillas. */
export const csvSafe = (value) => {
    let s = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return s.replace(/"/g, '""');
};
