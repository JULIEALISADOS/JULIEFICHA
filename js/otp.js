/**
 * Confirmacion del consentimiento por codigo (OTP) por WhatsApp o correo. Borrador 18-nov-2026.
 * Base juridica: Ley 527 de 1999 y Decreto 2364 de 2012 (firma electronica = metodo confiable y apropiado, pactado con la clienta).
 * Prueba guardada: canal, destino enmascarado, hora de envio y de verificacion, intentos y huella (SHA-256) del texto firmado.
 * MODO_ABIERTO: el codigo se genera aqui y se muestra en pantalla (solo pruebas). En produccion el codigo lo genera y envia
 * el servidor (Edge Function), guarda solo su hash, vale 10 minutos, 5 intentos y 3 envios por hora por numero.
 */
import { MODO_ABIERTO, OTP_OBLIGATORIO, SB_URL, SB_KEY } from './config.js';
import { getDb } from './db.js';

const VIDA_MS = 10 * 60 * 1000;
const MAX_INTENTOS = 5;
const vacio = () => ({ otpId: null, metodo: null, canal: null, destino: null, hash: null, sal: null, enviado: null, expira: 0, intentos: 0, verificado: null, huella: null });
let st = vacio();

const sha = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, '0')).join('');
const $ = (id) => document.getElementById(id);
const enmascarar = (canal, d) => (canal === 'correo' ? d.replace(/^(.{2}).*(@.*)$/, '$1***$2') : '***' + d.replace(/\D/g, '').slice(-4));
const textoFirmado = () => document.querySelector('.authorization-check')?.parentElement?.querySelector('div[style*="overflow-y"]')?.innerText || '';
const msg = (t, ok) => { const m = $('otpMsg'); if (!m) return; m.textContent = t; m.style.color = ok ? 'var(--success)' : 'var(--text-secondary)'; };
const canalActual = () => document.querySelector('input[name="otp_canal"]:checked')?.value || 'whatsapp';
const destinoActual = () => (canalActual() === 'correo' ? document.querySelector('[name="email"]')?.value : document.querySelector('[name="telefono"]')?.value)?.trim() || '';

async function llamarFuncion(cuerpo) {
    const { data } = await getDb().auth.getSession();
    const tk = data?.session?.access_token;
    if (!tk) throw new Error('Inicia sesión de nuevo.');
    const r = await fetch(`${SB_URL}/functions/v1/otp-correo`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk, apikey: SB_KEY }, body: JSON.stringify(cuerpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
    return j;
}

export const otpVerificado = () => !!st.verificado;

export function getOtpEvidencia() {
    if (!st.verificado) return null;
    return { canal: st.canal, destino_enmascarado: enmascarar(st.canal, st.destino), enviado_iso: st.enviado, verificado_iso: st.verificado, intentos: st.intentos, huella_documento_sha256: st.huella, otp_id: st.otpId, metodo: MODO_ABIERTO ? 'SIMULADO (prueba)' : 'servidor-correo' };
}

function guardarEvidencia() {
    const h = $('otpEvidenciaInput');
    if (h) h.value = st.verificado ? JSON.stringify(getOtpEvidencia()) : '';
}

export function resetOtp() {
    st = vacio();
    guardarEvidencia();
    if ($('otpInput')) $('otpInput').value = '';
    if ($('otpVerifyBox')) $('otpVerifyBox').style.display = 'none';
    msg('', false);
    if ($('otpSend')) $('otpSend').disabled = false;
}

async function enviar() {
    const canal = canalActual();
    const destino = destinoActual();
    if (!destino || (canal === 'correo' && !/^\S+@\S+\.\S+$/.test(destino)) || (canal === 'whatsapp' && destino.replace(/\D/g, '').length < 10)) {
        msg('Primero escribe un ' + (canal === 'correo' ? 'correo válido' : 'número de WhatsApp válido') + ' en el paso 1.', false);
        return;
    }
    if (!MODO_ABIERTO) {
        if (canal !== 'correo') { msg('Por ahora el código solo se envía por correo. Elige "Correo".', false); return; }
        try {
            msg('Enviando…', false);
            const j = await llamarFuncion({ accion: 'enviar', correo: destino });
            st = { ...vacio(), canal, destino, otpId: j.otp_id, enviado: j.enviado_iso, expira: Date.now() + VIDA_MS };
            guardarEvidencia();
            if ($('otpVerifyBox')) $('otpVerifyBox').style.display = 'flex';
            msg('Te enviamos un código a ' + j.destino_enmascarado + '. Revisa también la carpeta de spam.', false);
        } catch (e) { msg(e.message || 'No se pudo enviar el código.', false); }
        return;
    }
    // --- SIMULADO: solo pruebas ---
    const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
    const sal = crypto.randomUUID();
    st = { ...vacio(), canal, destino, sal, hash: await sha(sal + codigo), enviado: new Date().toISOString(), expira: Date.now() + VIDA_MS };
    guardarEvidencia();
    if ($('otpVerifyBox')) $('otpVerifyBox').style.display = 'flex';
    msg(`MODO PRUEBA — el código sería enviado a ${enmascarar(canal, destino)}. Código de prueba: ${codigo}`, false);
}

async function verificar() {
    const c = ($('otpInput')?.value || '').trim();
    if (!st.hash && !st.otpId) { msg('Primero pulsa "Enviar código".', false); return; }
    if (!MODO_ABIERTO) {
        try {
            const j = await llamarFuncion({ accion: 'verificar', otp_id: st.otpId, codigo: c });
            st.intentos += 1;
            const doc = document.querySelector('[name="numero_documento"]')?.value || '';
            const nom = document.querySelector('[name="nombre_completo"]')?.value || '';
            st.verificado = j.verificado_iso;
            st.huella = await sha([textoFirmado(), doc, nom, st.verificado].join('|'));
            guardarEvidencia();
            msg('✔ Código confirmado. Tu firma queda respaldada.', true);
            $('otpSend').disabled = true;
        } catch (e) { st.intentos += 1; msg(e.message || 'Código incorrecto.', false); }
        return;
    }
    if (Date.now() > st.expira) { msg('El código venció. Pide uno nuevo.', false); return; }
    if (st.intentos >= MAX_INTENTOS) { msg('Demasiados intentos. Pide un código nuevo.', false); return; }
    st.intentos += 1;
    if (!/^\d{6}$/.test(c) || (await sha(st.sal + c)) !== st.hash) { msg(`Código incorrecto (${st.intentos}/${MAX_INTENTOS}).`, false); return; }
    const doc = document.querySelector('[name="numero_documento"]')?.value || '';
    const nom = document.querySelector('[name="nombre_completo"]')?.value || '';
    st.verificado = new Date().toISOString();
    st.huella = await sha([textoFirmado(), doc, nom, st.verificado].join('|'));
    guardarEvidencia();
    msg('✔ Código confirmado. Tu firma queda respaldada.', true);
    $('otpSend').disabled = true;
}

export function initOtp() {
    $('otpSend')?.addEventListener('click', enviar);
    $('otpVerify')?.addEventListener('click', verificar);
    // Si cambia el contacto o el canal, la confirmacion anterior ya no vale.
    ['telefono', 'email'].forEach((n) => document.querySelector(`[name="${n}"]`)?.addEventListener('input', () => { if (st.hash || st.otpId) resetOtp(); }));
    document.querySelectorAll('input[name="otp_canal"]').forEach((r) => r.addEventListener('change', () => { if (st.hash || st.otpId) resetOtp(); }));
}

export { OTP_OBLIGATORIO };
