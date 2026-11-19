/**
 * Pantalla de Garantias (solo administracion). Sigue la politica publicada en la web (ver config.js > POLITICA_GARANTIA).
 * La decision final de cada caso la toma la administradora: la pantalla calcula plazos, valida fechas y sugiere el estado.
 */
import { fetchGarantias, guardarGarantia, fetchHistory, getFichaByConsecutivo } from './db.js';
import { POLITICA_GARANTIA as P, fmtFechaLarga } from './config.js';
import { vigencia, solicitudEnPlazo, validarReaplicacion, evaluarSolicitud, ESTADOS, ESTADOS_ABIERTOS } from './garantia.js';
import { esc, safeId } from './sanitize.js';

const $ = (id) => document.getElementById(id);
const caja = (html, extra = '') => `<div style="background:#fff; padding:14px; border-radius:14px; border:1px solid var(--border-gold); font-size:0.85rem; ${extra}">${html}</div>`;
const aISOLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoyISO = () => aISOLocal(new Date());
const fechaServicioDe = (ficha) => (ficha.created_at ? new Date(ficha.created_at) : new Date());
const chip = (txt, color) => `<span style="display:inline-block; padding:3px 10px; border-radius:999px; font-size:0.72rem; font-weight:700; background:${color}; color:#fff;">${esc(txt)}</span>`;
const colorEstado = (e) => (ESTADOS_ABIERTOS.includes(e) ? '#a98a3f' : e === 'cerrada_corregida' ? '#1d7a46' : '#6b6760');

let cache = { garantias: [], fichas: [] };
let abierto = null; // id de la garantia con el panel abierto
let fichaBuscada = null;

async function cargar() {
    const [g, f] = await Promise.all([fetchGarantias(), fetchHistory()]);
    cache = { garantias: g || [], fichas: f || [] };
}

function tarjetaVigentes() {
    const abiertasFolios = new Set(cache.garantias.map((g) => String(g.folio)));
    const vig = cache.fichas.map((f) => ({ f, v: vigencia(fechaServicioDe(f)) })).filter((x) => x.v.vigente);
    if (!vig.length) return caja('No hay servicios con garantía vigente.');
    return caja(`<strong>${vig.length} ficha(s) con garantía vigente</strong>` + vig.slice(0, 40).map(({ f, v }) =>
        `<div style="display:flex; justify-content:space-between; gap:8px; padding:6px 0; border-top:1px solid var(--border-soft);"><span>#${esc(f.consecutivo)} · ${esc(f.nombre_completo)}${abiertasFolios.has(String(f.consecutivo)) ? ' ' + chip('con solicitud', '#a98a3f') : ''}</span><span style="color:var(--text-secondary);">${v.diasRestantes} d · hasta ${esc(fmtFechaLarga(v.vence))}</span></div>`).join(''));
}

function panelNueva() {
    const f = fichaBuscada;
    let info = '';
    if (f) {
        const v = vigencia(fechaServicioDe(f));
        info = `<div style="margin-top:10px;"><strong>#${esc(f.consecutivo)} · ${esc(f.nombre_completo)}</strong><br>Procedimiento: ${esc(f.procedimiento || '')}<br>Servicio: ${esc(fmtFechaLarga(fechaServicioDe(f)))} · ${v.vigente ? chip('Vigente · vence ' + fmtFechaLarga(v.vence) + ' (' + v.diasRestantes + ' d)', '#1d7a46') : chip('Vencida el ' + fmtFechaLarga(v.vence), '#c0392b')}
        <div style="display:flex; gap:8px; margin-top:10px; align-items:center;"><label style="font-size:0.75rem;">Fecha de la solicitud</label><input type="date" id="gSolFecha" value="${hoyISO()}" style="width:auto; padding:8px;"><button type="button" class="btn-primary" style="flex:none; padding:9px 16px;" onclick="garantiaCrear()">Registrar solicitud</button></div></div>`;
    }
    return caja(`<strong>Nueva solicitud de garantía</strong>
        <p style="color:var(--text-secondary); margin:4px 0 8px;">La clienta reclama por WhatsApp ${esc(P.whatsapp)} dentro de ${P.diasVigencia} días y envía el video. Busca su folio:</p>
        <div style="display:flex; gap:8px;"><input type="text" id="gFolio" inputmode="numeric" placeholder="Folio (ej. 12)" style="flex:1; padding:10px;"><button type="button" class="btn-secondary" style="flex:none; padding:0 16px;" onclick="garantiaBuscar()">Buscar</button></div>
        <p id="gMsg" style="color:var(--error); margin-top:6px;"></p>${info}`);
}

function panelDetalle(g) {
    const v = vigencia(new Date(g.fecha_servicio));
    const ck = (k, label) => `<label style="display:flex; gap:8px; align-items:flex-start; margin:4px 0;"><input type="checkbox" data-k="${k}" ${g.cuidados?.[k] ? 'checked' : ''} style="width:auto; margin-top:3px;"> <span>${label}</span></label>`;
    const exc = P.exclusiones.map((t, i) => `<label style="display:flex; gap:8px; align-items:flex-start; margin:4px 0;"><input type="checkbox" data-exc="${i}" ${(g.exclusiones || []).includes(i) ? 'checked' : ''} style="width:auto; margin-top:3px;"> <span>${esc(t)}</span></label>`).join('');
    const terminal = !ESTADOS_ABIERTOS.includes(g.estado);
    return `<div id="gDet" style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--border-gold);" ${terminal ? 'data-terminal="1"' : ''}>
        <p style="color:var(--text-secondary);">Servicio ${esc(fmtFechaLarga(g.fecha_servicio))} · vence ${esc(fmtFechaLarga(v.vence))} · solicitud ${esc(fmtFechaLarga(g.fecha_solicitud))}</p>
        <p style="margin-top:8px;"><strong>1. Video</strong></p>
        <label style="display:flex; gap:8px; margin:4px 0;"><input type="checkbox" id="gVideo" ${g.video_recibido ? 'checked' : ''} style="width:auto;"> Video recibido (cabello recién lavado y secado con secador, sin plancha; se ven claramente las ondas)</label>
        <p style="margin-top:8px;"><strong>2. Cuidados y productos usados</strong></p>
        <input type="text" id="gProductos" value="${esc(g.productos_usados || '')}" placeholder="¿Qué productos usó después del procedimiento?" style="padding:10px;">
        ${ck('shampoo_sin_sal', 'Usó champú y productos sin sal recomendados')}${ck('lavado_cada_2_dias', 'Lava como mínimo cada 2 días')}${ck('sin_exposiciones', 'Evitó piscina, mar, aguas termales y cloro')}
        <p style="margin-top:8px;"><strong>3. Exclusiones que aplican (si marcas alguna, no procede)</strong></p>${exc}
        <p style="margin-top:8px;"><strong>4. Lavado de verificación en sede</strong></p>
        <div style="display:flex; gap:8px; flex-wrap:wrap;"><input type="date" id="gLavadoFecha" value="${esc(g.lavado_fecha || '')}" style="width:auto; padding:8px;">
        <select id="gLavadoRes" style="width:auto; padding:8px;"><option value="">Resultado…</option><option value="falla_procedimiento" ${g.lavado_resultado === 'falla_procedimiento' ? 'selected' : ''}>Falla del procedimiento</option><option value="cuidados" ${g.lavado_resultado === 'cuidados' ? 'selected' : ''}>No hay falla: cuidados</option></select></div>
        <p style="margin-top:8px;"><strong>5. Reaplicación (solo si fue falla del procedimiento)</strong></p>
        <input type="date" id="gReap" value="${esc(g.reaplicacion_fecha || '')}" min="${aISOLocal(v.reaplicacionDesde)}" max="${aISOLocal(v.reaplicacionHasta)}" style="width:auto; padding:8px;">
        <p style="color:var(--text-secondary); font-size:0.78rem;">Entre el ${esc(fmtFechaLarga(v.reaplicacionDesde))} (8 días del servicio) y el ${esc(fmtFechaLarga(v.reaplicacionHasta))} (fin de la vigencia). Sin costo.</p>
        <textarea id="gNotas" rows="2" placeholder="Notas" style="margin-top:8px;">${esc(g.notas || '')}</textarea>
        <p id="gDetMsg" style="margin-top:6px; font-weight:700;"></p>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;"><button type="button" class="btn-primary" style="flex:none; padding:10px 18px;" onclick="garantiaGuardar('${safeId(g.id)}')">Guardar y evaluar</button>
        ${g.estado === 'procede_reaplicacion' ? `<button type="button" class="btn-secondary" style="flex:none; padding:10px 18px;" onclick="garantiaCerrarCorregida('${safeId(g.id)}')">Reaplicación realizada</button>` : ''}</div></div>`;
}

function listaGarantias() {
    if (!cache.garantias.length) return caja('Todavía no hay solicitudes de garantía.');
    return cache.garantias.map((g) => {
        const f = cache.fichas.find((x) => String(x.consecutivo) === String(g.folio));
        const cab = `<div style="display:flex; justify-content:space-between; gap:8px; cursor:pointer;" onclick="garantiaAbrir('${safeId(g.id)}')"><span><strong>#${esc(g.folio)} · ${esc(f?.nombre_completo || '')}</strong><br><span style="color:var(--text-secondary);">${esc(fmtFechaLarga(g.fecha_solicitud))}${g.cobro_cop ? ' · cobro $' + Number(g.cobro_cop).toLocaleString('es-CO') : ''}</span></span>${chip(ESTADOS[g.estado] || g.estado, colorEstado(g.estado))}</div>`;
        return caja(cab + (abierto === g.id ? panelDetalle(g) : ''));
    }).join('');
}

export async function renderGarantias() {
    const body = $('garantiasBody');
    if (!body) return;
    body.innerHTML = caja('Cargando…');
    try {
        await cargar();
        const reglas = caja(`<strong>Reglas de la política publicada en la web</strong> (<a href="${esc(P.url)}" target="_blank" rel="noopener" style="color:var(--gold-dark);">ver texto completo</a>)<ul style="margin:6px 0 0 18px; line-height:1.5;"><li>Vigencia: ${P.diasVigencia} días calendario desde el procedimiento; después no se procesan solicitudes.</li><li>La clienta envía video, confirma los productos usados y, si el video lo amerita, se cita a lavado en sede.</li><li>Falla del procedimiento: se corrige sin costo, nunca antes de ${P.diasMinimosReaplicacion} días del servicio y dentro de la vigencia.</li><li>Si son cuidados: lavado y secado en sede $${P.valorLavadoTecnicoCOP.toLocaleString('es-CO')} COP y se cierra la garantía.</li></ul>`, 'background:var(--ivory);');
        body.innerHTML = reglas + panelNueva() + '<h3 style="margin:6px 0 0; color:var(--gold-dark);">Solicitudes</h3>' + listaGarantias() + '<h3 style="margin:6px 0 0; color:var(--gold-dark);">Garantías vigentes</h3>' + tarjetaVigentes();
    } catch (e) {
        body.innerHTML = caja('No se pudo cargar: ' + esc(e.message || 'error'));
    }
}

function leerPanel(g) {
    const marcas = (sel, attr) => [...document.querySelectorAll(`#gDet ${sel}`)].filter((c) => c.checked).map((c) => c.dataset[attr]);
    const cuidados = {}; marcas('input[data-k]', 'k').forEach((k) => { cuidados[k] = true; });
    return {
        ...g,
        video_recibido: !!$('gVideo')?.checked,
        productos_usados: $('gProductos')?.value.trim() || '',
        cuidados,
        exclusiones: marcas('input[data-exc]', 'exc').map(Number),
        lavado_fecha: $('gLavadoFecha')?.value || null,
        lavado_resultado: $('gLavadoRes')?.value || null,
        reaplicacion_fecha: $('gReap')?.value || null,
        notas: $('gNotas')?.value.trim() || ''
    };
}

window.garantiaBuscar = async () => {
    const m = $('gMsg'); if (m) m.textContent = '';
    const folio = ($('gFolio')?.value || '').trim();
    if (!folio) { if (m) m.textContent = 'Escribe el folio.'; return; }
    const f = await getFichaByConsecutivo(folio);
    if (!f) { fichaBuscada = null; if (m) m.textContent = 'No se encontró ese folio.'; return; }
    fichaBuscada = f; await renderGarantias();
};

window.garantiaCrear = async () => {
    const f = fichaBuscada; if (!f) return;
    const fechaSol = $('gSolFecha')?.value || hoyISO();
    const fs = fechaServicioDe(f);
    const enPlazo = solicitudEnPlazo(fs, new Date(fechaSol + 'T12:00:00'));
    const g = { folio: String(f.consecutivo), fecha_servicio: fs.toISOString(), fecha_solicitud: fechaSol, estado: enPlazo ? 'solicitada' : 'rechazada_fuera_de_plazo', video_recibido: false, productos_usados: '', cuidados: {}, exclusiones: [], lavado_fecha: null, lavado_resultado: null, reaplicacion_fecha: null, cobro_cop: 0, notas: enPlazo ? '' : 'Solicitud presentada después de los 20 días calendario: no se procesa (política publicada).' };
    const s = await guardarGarantia(g);
    fichaBuscada = null; abierto = s?.id || null; await renderGarantias();
};

window.garantiaAbrir = async (id) => { abierto = abierto === id ? null : id; await renderGarantias(); };

window.garantiaGuardar = async (id) => {
    const base = cache.garantias.find((x) => x.id === id); if (!base) return;
    const g = leerPanel(base);
    const msg = $('gDetMsg');
    const ev = evaluarSolicitud({ fechaServicio: new Date(g.fecha_servicio), fechaSolicitud: new Date(g.fecha_solicitud + 'T12:00:00'), videoRecibido: g.video_recibido, exclusiones: g.exclusiones, lavadoResultado: g.lavado_resultado });
    if (ev.estado === 'procede_reaplicacion') {
        const val = g.reaplicacion_fecha ? validarReaplicacion(new Date(g.fecha_servicio), new Date(g.reaplicacion_fecha + 'T12:00:00')) : { ok: false, motivo: 'Programa la fecha de reaplicación' };
        if (!val.ok) { if (msg) { msg.style.color = 'var(--error)'; msg.textContent = '⚠ ' + val.motivo; } return; }
    }
    g.estado = ev.estado; g.cobro_cop = ev.cobro;
    await guardarGarantia(g);
    await renderGarantias();
    const m2 = $('gDetMsg'); if (m2) { m2.style.color = 'var(--success)'; m2.textContent = '✔ Estado: ' + (ESTADOS[g.estado] || g.estado); }
};

window.garantiaCerrarCorregida = async (id) => {
    const base = cache.garantias.find((x) => x.id === id); if (!base) return;
    await guardarGarantia({ ...leerPanel(base), estado: 'cerrada_corregida', cobro_cop: 0 });
    await renderGarantias();
};
