/**
 * Historia clinica capilar por clienta (solo administracion): ficha longitudinal con alertas, linea de tiempo de visitas,
 * evolucion de los indicadores tecnicos, fotos antes/despues y estado de garantia de cada visita.
 */
import { fetchHistory, fetchGarantias } from './db.js';
import { fmtFechaLarga } from './config.js';
import { vigencia, ESTADOS } from './garantia.js';
import { esc, safeId, safeUrl } from './sanitize.js';

const $ = (id) => document.getElementById(id);
const caja = (html, extra = '') => `<div style="background:#fff; padding:14px; border-radius:14px; border:1px solid var(--border-gold); font-size:0.85rem; ${extra}">${html}</div>`;
const chip = (txt, bg) => `<span style="display:inline-block; padding:3px 10px; border-radius:999px; font-size:0.72rem; font-weight:700; background:${bg}; color:#fff; margin:2px 4px 2px 0;">${esc(txt)}</span>`;
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let datos = { fichas: [], garantias: [] };
let docActual = null;

const porDocumento = () => {
    const m = new Map();
    datos.fichas.forEach((f) => { const k = String(f.numero_documento || ''); if (!m.has(k)) m.set(k, []); m.get(k).push(f); });
    m.forEach((arr) => arr.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
    return m;
};

/** Alertas de seguridad clinica tomadas de TODAS las visitas (lo mas reciente manda para embarazo). */
export function alertasDe(visitas) {
    const ult = visitas[0] || {};
    const a = [];
    if (ult.embarazo === 'Si') a.push(['Embarazo', '#c0392b']);
    if (visitas.some((v) => v.alergias === 'Si')) {
        const d = visitas.map((v) => v.alergias_descripcion).find(Boolean);
        a.push(['Alergias' + (d ? ': ' + d : ''), '#c0392b']);
    }
    if (ult.consent_meds === 'Si') a.push(['Bajo tratamiento médico o medicamentos', '#a98a3f']);
    if (visitas.some((v) => v.dermatitis === 'Severa')) a.push(['Dermatitis severa', '#c0392b']);
    if (visitas.some((v) => v.caida === 'Severa')) a.push(['Caída severa', '#a98a3f']);
    if (visitas.some((v) => v.descamacion === 'Severa')) a.push(['Descamación severa', '#a98a3f']);
    if (ult.edad && parseInt(ult.edad, 10) < 18) a.push(['Menor de edad: tutor responsable', '#141414']);
    return a;
}

function estadoGarantia(f) {
    const g = datos.garantias.find((x) => String(x.folio) === String(f.consecutivo));
    if (g) return chip('Garantía: ' + (ESTADOS[g.estado] || g.estado), '#a98a3f');
    const v = vigencia(new Date(f.created_at || Date.now()));
    return v.vigente ? chip(`Garantía vigente · ${v.diasRestantes} d`, '#1d7a46') : chip('Garantía vencida', '#6b6760');
}

const celda = (t) => `<td style="padding:6px 8px; border-top:1px solid var(--border-soft); white-space:nowrap;">${esc(t ?? '—')}</td>`;

function vistaCliente(doc) {
    const v = porDocumento().get(doc) || [];
    if (!v.length) return caja('No se encontró la clienta.');
    const u = v[0];
    const alertas = alertasDe(v);
    const cab = caja(`<div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;"><div><strong style="font-size:1.05rem;">${esc(u.nombre_completo)}</strong><br><span style="color:var(--text-secondary);">${esc(u.tipo_documento || '')} ${esc(u.numero_documento)} · ${esc(u.edad || '')} años · ${esc(u.telefono || '')} · ${esc(u.email || '')}</span></div><div style="text-align:right;">${chip(v.length + (v.length === 1 ? ' visita' : ' visitas'), '#141414')}<br><span style="color:var(--text-secondary);">Primera: ${esc(fmtFechaLarga(v[v.length - 1].created_at))}</span></div></div>
        <div style="margin-top:10px;">${alertas.length ? '<strong>Alertas:</strong> ' + alertas.map(([t, c]) => chip(t, c)).join('') : '<span style="color:var(--text-secondary);">Sin alertas clínicas registradas.</span>'}</div>
        <div style="margin-top:8px; color:var(--text-secondary);">Procesos químicos (última visita): ${esc(u.procesos_quimicos || '—')}<br>Terapias previas: ${esc(u.terapias_capilares || '—')}<br>Lavado: ${esc(u.frecuencia_lavado || '—')}</div>`, 'border:2px solid var(--gold-primary);');
    const filas = v.map((f) => `<tr>${celda(fmtFechaLarga(f.created_at))}${celda('#' + f.consecutivo)}${celda(f.procedimiento)}${celda(f.porosidad)}${celda(f.elasticidad)}${celda(f.resistencia)}${celda(f.densidad)}${celda([f.dermatitis, f.caida, f.descamacion].map((x) => x || '—').join(' / '))}</tr>`).join('');
    const evol = caja(`<strong>Evolución</strong><div style="overflow-x:auto; margin-top:6px;"><table style="border-collapse:collapse; width:100%; font-size:0.78rem;"><thead><tr style="color:var(--text-secondary); text-align:left;"><th style="padding:6px 8px;">Fecha</th><th>Folio</th><th>Procedimiento</th><th>Porosidad</th><th>Elasticidad</th><th>Resistencia</th><th>Densidad</th><th>Dermatitis / Caída / Descamación</th></tr></thead><tbody>${filas}</tbody></table></div>`);
    const linea = v.map((f) => {
        const antes = safeUrl(f.foto_antes_url), desp = safeUrl(f.foto_despues_url);
        const ev = (() => { try { return typeof f.consent_evidencia === 'string' ? JSON.parse(f.consent_evidencia) : (f.consent_evidencia || {}); } catch (e) { return {}; } })();
        const ac = ev.aceptados || {};
        return caja(`<div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;"><strong>${esc(fmtFechaLarga(f.created_at))} · Folio #${esc(f.consecutivo)} · ${esc(f.sede || '')}</strong><span>${estadoGarantia(f)}</span></div>
            <div style="margin:6px 0;">${esc(f.procedimiento || '')} · objetivo de liso ${esc(f.porcentaje_liso || '—')}<br><span style="color:var(--text-secondary);">Patrón ${esc(f.tipo_cabello || '—')} · Estilista: ${esc(f.estilista_responsable || '—')}</span></div>
            <div style="color:var(--text-secondary);">Técnica y productos: ${esc(f.tecnica_utilizada || '—')}</div>
            <div style="color:var(--text-secondary); margin-top:4px;">Observaciones: ${esc(f.observaciones_diagnostico || '—')}</div>
            <div style="display:flex; gap:8px; margin-top:8px;">${antes ? `<div style="flex:1;"><small>ANTES</small><img src="${antes}" style="width:100%; border-radius:10px;"></div>` : ''}${desp ? `<div style="flex:1;"><small>DESPUÉS</small><img src="${desp}" style="width:100%; border-radius:10px;"></div>` : ''}</div>
            <div style="margin-top:8px;">Consentimientos: ${ac.consentimiento_servicio ? '✔ servicio' : '✖ servicio'} · ${ac.datos_personales_y_salud ? '✔ datos' : '✖ datos'} · ${ac.acuerdo_firma_electronica ? '✔ firma electrónica' : '—'} · código ${ev.confirmacion_codigo ? '✔' : '✖'} · novedades ${ac.marketing_whatsapp_correo ? 'sí' : 'no'}</div>
            <button type="button" class="btn-secondary" style="margin-top:8px; padding:8px 14px; flex:none;" onclick="viewFicha('${safeId(f.consecutivo)}')">Abrir ficha completa</button>`);
    }).join('');
    return `<button type="button" class="btn-secondary" style="flex:none; padding:8px 16px; align-self:start;" onclick="clinicaVolver()">← Volver a la búsqueda</button>${cab}${evol}<h3 style="margin:6px 0 0; color:var(--gold-dark);">Línea de tiempo</h3>${linea}`;
}

function vistaBusqueda(q = '') {
    const m = porDocumento();
    const termino = norm(q);
    const filas = [...m.entries()].filter(([doc, v]) => !termino || doc.includes(termino) || norm(v[0].nombre_completo).includes(termino) || v.some((f) => String(f.consecutivo) === q.trim().replace('#', '')))
        .slice(0, 60).map(([doc, v]) => {
            const al = alertasDe(v).length;
            return caja(`<div style="display:flex; justify-content:space-between; gap:8px; cursor:pointer;" onclick="clinicaAbrir('${safeId(doc)}')"><span><strong>${esc(v[0].nombre_completo)}</strong><br><span style="color:var(--text-secondary);">${esc(doc)} · ${v.length} visita(s) · última ${esc(fmtFechaLarga(v[0].created_at))}</span></span>${al ? chip(al + ' alerta(s)', '#c0392b') : ''}</div>`);
        });
    return `<input type="text" id="clinicaBuscar" value="${esc(q)}" placeholder="🔍 Buscar por cédula, nombre o folio" oninput="clinicaBuscar(this.value)" style="padding:12px;">${filas.length ? filas.join('') : caja('Sin resultados.')}`;
}

export async function renderClinica() {
    const body = $('clinicaBody'); if (!body) return;
    body.innerHTML = caja('Cargando…');
    try {
        const [f, g] = await Promise.all([fetchHistory(), fetchGarantias()]);
        datos = { fichas: f || [], garantias: g || [] };
        body.innerHTML = docActual ? vistaCliente(docActual) : vistaBusqueda();
    } catch (e) { body.innerHTML = caja('No se pudo cargar: ' + esc(e.message || 'error')); }
}

window.clinicaBuscar = (q) => { const b = $('clinicaBody'); if (!b) return; const pos = q.length; b.innerHTML = vistaBusqueda(q); const i = $('clinicaBuscar'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } };
window.clinicaAbrir = (doc) => { docActual = doc; $('clinicaBody').innerHTML = vistaCliente(doc); window.scrollTo(0, 0); };
window.clinicaVolver = () => { docActual = null; $('clinicaBody').innerHTML = vistaBusqueda(); };
export const abrirClinicaDe = (doc) => { docActual = doc; };
