/**
 * Logica de garantias (funciones puras, sin DOM) segun la politica publicada en https://juliealisados.com/politica-garantia.html
 * (leida en vivo el 18-nov-2026). Los numeros viven en config.js (POLITICA_GARANTIA); aqui solo se calculan fechas y estados.
 */
import { POLITICA_GARANTIA as P, sumarDias } from './config.js';

const MS_DIA = 86400000;
const soloFecha = (d) => { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate()); };
const dias = (a, b) => Math.round((soloFecha(b) - soloFecha(a)) / MS_DIA);

export const ESTADOS = {
    solicitada: 'Solicitud recibida',
    video_en_revision: 'Video en revisión',
    cita_lavado: 'Cita para lavado en sede',
    procede_reaplicacion: 'Procede: reaplicación programada',
    cerrada_corregida: 'Cerrada: corregida sin costo',
    cerrada_no_procede_cuidados: 'Cerrada: no procede (cuidados)',
    cerrada_no_procede_exclusion: 'Cerrada: no procede (exclusión de la política)',
    rechazada_fuera_de_plazo: 'No procesada: fuera de los 20 días'
};
export const ESTADOS_ABIERTOS = ['solicitada', 'video_en_revision', 'cita_lavado', 'procede_reaplicacion'];

/** Vigencia de la garantia a partir de la fecha del procedimiento. */
export function vigencia(fechaServicio, hoy = new Date()) {
    const vence = sumarDias(soloFecha(fechaServicio), P.diasVigencia);
    const restantes = dias(hoy, vence);
    return {
        vence,
        diasRestantes: restantes,
        vigente: restantes >= 0,
        // La reaplicacion nunca antes de 8 dias del servicio original y siempre dentro de la vigencia.
        reaplicacionDesde: sumarDias(soloFecha(fechaServicio), P.diasMinimosReaplicacion),
        reaplicacionHasta: vence
    };
}

/** Una solicitud presentada en `fechaSolicitud` es procesable solo si cae dentro de los 20 dias. */
export function solicitudEnPlazo(fechaServicio, fechaSolicitud = new Date()) {
    return soloFecha(fechaSolicitud) <= soloFecha(vigencia(fechaServicio, fechaSolicitud).vence);
}

/** Valida la fecha propuesta para reaplicar. Devuelve { ok, motivo }. */
export function validarReaplicacion(fechaServicio, fechaReaplicacion) {
    const v = vigencia(fechaServicio);
    const f = soloFecha(fechaReaplicacion);
    if (isNaN(f)) return { ok: false, motivo: 'Fecha no válida' };
    if (f < soloFecha(v.reaplicacionDesde)) return { ok: false, motivo: `No puede ser antes de ${P.diasMinimosReaplicacion} días del servicio original` };
    if (f > soloFecha(v.reaplicacionHasta)) return { ok: false, motivo: `Debe programarse dentro de la vigencia (${P.diasVigencia} días)` };
    return { ok: true, motivo: '' };
}

/** Evalua la lista de verificacion de la solicitud y sugiere el siguiente estado; la decision final es de la administradora. */
export function evaluarSolicitud({ fechaServicio, fechaSolicitud, videoRecibido, exclusiones = [], lavadoResultado = null }) {
    if (!solicitudEnPlazo(fechaServicio, fechaSolicitud)) return { estado: 'rechazada_fuera_de_plazo', cobro: 0 };
    if (exclusiones.length) return { estado: 'cerrada_no_procede_exclusion', cobro: 0 };
    if (!videoRecibido) return { estado: 'solicitada', cobro: 0 };
    if (lavadoResultado === 'falla_procedimiento') return { estado: 'procede_reaplicacion', cobro: 0 };
    if (lavadoResultado === 'cuidados') return { estado: 'cerrada_no_procede_cuidados', cobro: P.valorLavadoTecnicoCOP };
    return { estado: 'cita_lavado', cobro: 0 };
}
