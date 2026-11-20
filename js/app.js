import { haySesion, cerrarSesion, mfaEstado, mfaInscribir, mfaVerificar, fetchBitacora, fetchSyncDrive, fetchNovedades, fetchNextID, fetchStylists, fetchStylistsSecure, loginUserSecure, verifyAdminPasswordSecure, fetchHistory, getFichaByConsecutivo, deleteFichaDb, deleteStylistDb, addStylistDb, insertFicha, uploadImg, urlsDeFicha, getLastFichaByDoc, updateStylistPassword } from './db.js';
import { initSignatures, clearSignature, getSignaturePads, loadSignaturesFromData, toggleSignatures, destroyPads } from './signature.js';
import { generatePDF } from './pdf.js';
import { setSede, setHairType, setChip, previewImage, validateStep, monitorMinorSettings, lockForm, initRealtimeValidation } from './ui.js';
import { initJuliePixel, getMarketingContext } from './pixel-propio.js';
import { esc, safeId, safeUrl } from './sanitize.js';
import { MODO_ABIERTO, SEDES, telefonoParaWhatsApp, POLITICA_GARANTIA, sumarDias, fmtFechaLarga } from './config.js';
import { renderGarantias } from './garantias-ui.js';
import { renderClinica, abrirClinicaDe } from './historia-ui.js';
import { initOtp, resetOtp, otpVerificado, getOtpEvidencia, OTP_OBLIGATORIO } from './otp.js';

const form = document.getElementById('fichaForm');
const steps = Array.from(document.querySelectorAll('.step'));
const saveBtn = document.getElementById('saveBtn');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');
const loginSection = document.getElementById('loginSection');
const appMain = document.getElementById('appMain');
const homeSection = document.getElementById('homeSection');
const historySection = document.getElementById('historySection');
const stylistSection = document.getElementById('stylistSection');
const controlSection = document.getElementById('controlSection');
const garantiasSection = document.getElementById('garantiasSection');
const clinicaSection = document.getElementById('clinicaSection');
const historyList = document.getElementById('historyList');
const searchInput = document.getElementById('searchInput');
const stylistList = document.getElementById('stylistList');
const stylistInput = document.getElementById('stylistInput');
const stylistPhoneInput = document.getElementById('stylistPhoneInput');
const stylistEmailInput = document.getElementById('stylistEmailInput');
const stylistSearchInput = document.getElementById('stylistSearchInput');
const responsableInput = document.getElementById('responsableInput');

let currentStep = 1;
const totalSteps = 6;
let isLocked = false;
window.isLocked = false;
window.lastGeneratedSignatures = { client: null, tech: null, tutor: null };
window.lastViewedFicha = null;
window.nextFolioID = null;
window.currentLastFicha = null; // Guardar última ficha detectada

// Seguridad: la contraseña y el usuario NUNCA se guardan en el navegador. Se borra lo que hayan dejado versiones anteriores.
localStorage.removeItem('julie_remember_pass');
localStorage.removeItem('julie_remember_user');

function debounce(func, timeout = 500) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

// ======================== LOGIN ========================
async function login() {
    const userEl = document.getElementById('loginEmail');
    const passEl = document.getElementById('loginPass');
    const errorEl = document.getElementById('loginError');
    const loginBtn = document.querySelector('#loginForm button[type="submit"]');
    if (!userEl || !passEl || !errorEl) return;

    const user = userEl.value.trim();
    const pass = passEl.value.trim();
    errorEl.classList.add('hidden');

    if (!user || !pass) {
        errorEl.innerText = "⚠️ Por favor, completa todos los campos.";
        errorEl.classList.remove('hidden');
        return;
    }

    if (loginBtn) { loginBtn.disabled = true; loginBtn.innerText = 'Verificando...'; }

    try {
        let authResult = await loginUserSecure(user, pass);

        if (authResult && authResult.success) {
            // Nunca se persisten credenciales en el navegador
            localStorage.removeItem('julie_remember_user');
            localStorage.removeItem('julie_remember_pass');
            localStorage.setItem('julie_role', authResult.role);
            localStorage.setItem('julie_session', 'true');
            localStorage.setItem('julie_user_name', authResult.nombre);
            // La cuenta de la tablet ya sabe su sede: se guarda y no se vuelve a preguntar
            if (authResult.sede) localStorage.setItem('julie_tablet_sede', authResult.sede);
            else localStorage.removeItem('julie_tablet_sede');

            if (authResult.role === 'admin') {
                sessionStorage.setItem('julie_admin_auth', 'true');
            } else {
                sessionStorage.removeItem('julie_admin_auth');
            }
            if (authResult.role === 'admin' && !(await exigirMfa())) {
                await cerrarSesion();
                localStorage.removeItem('julie_session'); localStorage.removeItem('julie_role');
                errorEl.innerText = '❌ No se completó la verificación en dos pasos.';
                errorEl.classList.remove('hidden');
                return;
            }
            loginSuccess(authResult.role);
        } else {
            errorEl.innerText = "❌ Credenciales incorrectas.";
            errorEl.classList.remove('hidden');
        }
    } catch (e) {
        console.error('Login Error:', e);
        errorEl.innerText = "❌ Error de conexión con la base de datos.";
        errorEl.classList.remove('hidden');
    } finally {
        if (loginBtn) { loginBtn.disabled = false; loginBtn.innerText = 'Ingresar'; }
    }
}

window.togglePass = () => {
    const p = document.getElementById('loginPass');
    const i = document.getElementById('passIcon');
    if (p && i) {
        if (p.type === 'password') {
            p.type = 'text';
            i.setAttribute('data-lucide', 'eye-off');
        } else {
            p.type = 'password';
            i.setAttribute('data-lucide', 'eye');
        }
    }
    if (window.lucide) window.lucide.createIcons();
};

// Segundo factor del administrador (aplicacion de autenticacion en el celular). Sin esto la base no le muestra las fichas.
async function exigirMfa() {
    const est = await mfaEstado();
    if (est.nivel === 'aal2') return true;
    const modal = document.getElementById('mfaModal');
    const msg = document.getElementById('mfaMsg');
    const qrBox = document.getElementById('mfaQrBox');
    const input = document.getElementById('mfaCodigo');
    let factorId = est.factorId;
    if (!factorId) {
        const ins = await mfaInscribir();
        factorId = ins.factorId;
        qrBox.innerHTML = `<img src="${String(ins.qr).startsWith('data:image/svg+xml') ? esc(ins.qr) : ''}" alt="QR" style="width:180px; height:180px;"><p style="font-size:0.75rem; color:var(--text-secondary); word-break:break-all;">Si no puedes escanear, escribe esta clave: <strong>${esc(ins.secreto)}</strong></p>`;
        document.getElementById('mfaTexto').textContent = 'Escanea este código con Google Authenticator (o similar) y escribe el número de 6 dígitos.';
    } else {
        qrBox.innerHTML = '';
        document.getElementById('mfaTexto').textContent = 'Escribe el número de 6 dígitos de tu aplicación de autenticación.';
    }
    input.value = ''; msg.textContent = '';
    modal.classList.remove('hidden');
    return new Promise((resolve) => {
        document.getElementById('mfaConfirmar').onclick = async () => {
            try { await mfaVerificar(factorId, input.value.trim()); modal.classList.add('hidden'); resolve(true); }
            catch (e) { msg.textContent = 'Código incorrecto. Intenta de nuevo.'; }
        };
        document.getElementById('mfaCancelar').onclick = () => { modal.classList.add('hidden'); resolve(false); };
    });
}

// Si la cuenta de la tablet tiene sede, se fija sola y se oculta la pregunta de sede
function aplicarSedeFija() {
    const sede = localStorage.getItem('julie_tablet_sede');
    if (!sede) return;
    setSede(sede);
    document.getElementById('sedeButtons')?.closest('.form-group')?.classList.add('hidden');
}

function loginSuccess(role) {
    if (loginSection) loginSection.classList.add('hidden');
    if (appMain) appMain.classList.remove('hidden');
    applyRoleUI(role);
    aplicarSedeFija();
    switchTab('home');
}

function applyRoleUI(role) {
    const isOwnerOrAdmin = (role === 'admin');
    
    // 1. Botones de Cabecera
    const headerHistoryBtn = document.getElementById('headerHistoryBtn');
    const btnPdf = document.querySelector('.btn-pdf') || document.getElementById('pdfBtn');
    const changePassBtn = document.getElementById('changePassBtn');

    if (headerHistoryBtn) headerHistoryBtn.style.display = isOwnerOrAdmin ? 'inline-flex' : 'none';
    if (btnPdf) btnPdf.style.display = isOwnerOrAdmin ? 'inline-flex' : 'none';
    // La clave de la cuenta de la sede la cambia solo la administracion (la tablet no la puede cambiar).
    if (changePassBtn) changePassBtn.style.display = 'none';

    // 2. Tarjetas del Menú Principal (Modo Kiosco Tablet)
    const cardHistory = document.getElementById('cardHistory');
    const cardStylists = document.getElementById('cardStylists');
    const cardControl = document.getElementById('cardControl');
    if (cardControl) cardControl.style.display = 'none'; // 19-nov: oculto en la beta (la copia a Drive no existe aun)
    const cardClinica = document.getElementById('cardClinica');
    // Beta simple (19-nov): Historia clinica y Garantias ocultas (el historial ya muestra lo esencial). Para volver: cambiar 'none' por la condicion.
    if (cardClinica) cardClinica.style.display = 'none';
    const cardGarantias = document.getElementById('cardGarantias');
    if (cardGarantias) cardGarantias.style.display = 'none';
    const cardNewFicha = document.getElementById('cardNewFicha');

    if (cardHistory) cardHistory.style.display = isOwnerOrAdmin ? 'flex' : 'none';
    if (cardStylists) cardStylists.style.display = isOwnerOrAdmin ? 'flex' : 'none';
    
    if (cardNewFicha) {
        if (!isOwnerOrAdmin) {
            cardNewFicha.style.gridColumn = '1 / -1';
            cardNewFicha.style.padding = '35px 25px';
        } else {
            cardNewFicha.style.gridColumn = 'span 2';
            cardNewFicha.style.padding = '20px';
        }
    }

    // 3. Barra de Navegación Inferior (Bloquear accesos no autorizados)
    const navHistory = document.getElementById('navItemHistory') || document.querySelector('.nav-item:nth-child(3)');
    const navTeam = document.getElementById('navItemStylists') || document.querySelector('.nav-item:nth-child(4)');
    if (navHistory) navHistory.style.display = isOwnerOrAdmin ? 'flex' : 'none';
    if (navTeam) navTeam.style.display = isOwnerOrAdmin ? 'flex' : 'none';

    // 4. Modal de Éxito: Ocultar PDF en modo Tablet
    const modalPdfBtn = document.getElementById('modalPdfBtn');
    const modalNextFichaBtn = document.getElementById('modalNextFichaBtn');
    const modalActionGroup = document.getElementById('modalActionGroup');

    if (modalPdfBtn) modalPdfBtn.style.display = isOwnerOrAdmin ? 'flex' : 'none';
    if (modalActionGroup && !isOwnerOrAdmin) {
        modalActionGroup.style.gridTemplateColumns = '1fr';
    } else if (modalActionGroup) {
        modalActionGroup.style.gridTemplateColumns = '1fr 1fr';
    }

    // 5. Blindaje de Secciones: Ocultar módulos administrativos
    if (!isOwnerOrAdmin) {
        document.getElementById('historySection')?.classList.add('hidden');
        document.getElementById('stylistSection')?.classList.add('hidden');
        document.getElementById('controlSection')?.classList.add('hidden');
        document.getElementById('garantiasSection')?.classList.add('hidden');
        document.getElementById('clinicaSection')?.classList.add('hidden');
    }
}

window.openChangePassModal = () => document.getElementById('changePassModal').classList.remove('hidden');
window.closeChangePassModal = () => document.getElementById('changePassModal').classList.add('hidden');

window.processChangePassword = async () => {
    const newPass = document.getElementById('newPassInput').value.trim();
    const name = localStorage.getItem('julie_user_name');
    if (!newPass || newPass.length < 8) { alert('La clave debe tener al menos 8 caracteres.'); return; }

    try {
        await updateStylistPassword(name, '', newPass);
        // La clave nunca se guarda en el navegador: la sesion la maneja Supabase Auth.
        alert('✅ Contraseña actualizada. Úsala en tu próximo ingreso.');
        closeChangePassModal();
    } catch (e) { alert('Error al actualizar clave. Verifica tu contraseña actual.'); }
};

if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', (e) => { e.preventDefault(); login(); });
}

window.togglePass = function () {
    const passInput = document.getElementById('loginPass');
    const eyeIcon = document.getElementById('eyeIcon');
    if (passInput.type === 'password') {
        passInput.type = 'text';
        eyeIcon?.setAttribute('data-lucide', 'eye-off');
    } else {
        passInput.type = 'password';
        eyeIcon?.setAttribute('data-lucide', 'eye');
    }
    window.lucide?.createIcons();
};

function logout() {
    if (confirm('¿Cerrar sesión segura?')) {
        localStorage.removeItem('julie_session');
        localStorage.removeItem('julie_tablet_sede');
        cerrarSesion().finally(() => window.location.reload());
    }
}
window.logout = logout;

    // --- Verificación y Restauración Segura de Sesión ---
    const savedSession = localStorage.getItem('julie_session');
    const savedRole = localStorage.getItem('julie_role') || 'tablet';
    if (MODO_ABIERTO && loginSection && appMain) {
        // Modo abierto (sin clave, datos de prueba locales): entra directo como administradora.
        localStorage.setItem('julie_role', 'admin');
        localStorage.setItem('julie_session', 'true');
        localStorage.setItem('julie_user_name', 'Modo abierto');
        sessionStorage.setItem('julie_admin_auth', 'true');
        loginSection.classList.add('hidden');
        appMain.classList.remove('hidden');
        applyRoleUI('admin');
    } else if (savedSession === 'true' && (await haySesion()) && loginSection && appMain) {
        loginSection.classList.add('hidden');
        appMain.classList.remove('hidden');
        // El rol guardado es solo una pista de interfaz y puede ser falsificado desde el inspector:
        // nunca se muestra como 'admin' sin que el servidor confirme la clave de administrador.
        applyRoleUI(savedRole === 'admin' ? 'tablet' : savedRole);
        if (savedRole === 'admin') {
            verifyAdminPasswordSecure()
                .then((ok) => {
                    if (ok && !(Array.isArray(ok) && ok.length === 0)) applyRoleUI('admin');
                    else localStorage.setItem('julie_role', 'tablet');
                })
                .catch(() => localStorage.setItem('julie_role', 'tablet'));
        }
    } else if (loginSection) {
        loginSection.classList.remove('hidden');
        if (appMain) appMain.classList.add('hidden');
    }

// ======================== NAVIGATION ========================
function updateStep(direction) {
    if (direction === 'next') {
        if (!validateStep(currentStep, steps)) return;
        // Paso 5 (estilista): su firma antes de devolver la tablet
        if (currentStep === 5 && !isLocked) {
            const { padTech } = getSignaturePads();
            if (!padTech || padTech.isEmpty()) { alert('⚠️ Falta la firma de la estilista.'); return; }
        }
        // Cambio de manos: paso 2 -> estilista; paso 5 -> vuelve a la clienta para revisar y firmar al final
        if ((currentStep === 2 || currentStep === 5) && !isLocked && !window.__entregaOk) {
            const aClienta = currentStep === 5;
            document.getElementById('handoffTitulo').textContent = aClienta ? 'Diagnóstico y procedimiento listos' : '¡Gracias! Tu parte está lista';
            document.getElementById('handoffTexto').textContent = aClienta ? 'Devuelve la tablet a la clienta para que revise su plan, confirme con el código y firme.' : 'Ahora entrega la tablet a tu estilista para continuar con el diagnóstico de tu cabello.';
            document.getElementById('handoffBoton').textContent = aClienta ? 'Soy la clienta · Revisar y firmar' : 'Soy la estilista · Continuar';
            document.getElementById('handoffModal')?.classList.remove('hidden');
            return;
        }
        window.__entregaOk = false;
        currentStep++;
    } else if (direction === 'prev') {
        currentStep--;
    } else if (direction === 'init') {
        currentStep = 1;
    }
    // 'jump' — currentStep already set externally

    steps.forEach((s, i) => s.classList.toggle('active', i === currentStep - 1));
    document.querySelectorAll('.btn-step').forEach((b, i) => b.classList.toggle('active', i === currentStep - 1));
    if (nextBtn) nextBtn.classList.toggle('hidden', currentStep === totalSteps);
    if (saveBtn) {
        if (isLocked) saveBtn.classList.add('hidden');
        else saveBtn.classList.toggle('hidden', currentStep !== totalSteps);
    }
    if (prevBtn) prevBtn.classList.toggle('hidden', currentStep === 1);
    document.getElementById('progressBar')?.style.setProperty('--progress', (currentStep / totalSteps * 100) + '%');
    document.getElementById('currentStepNum').innerText = currentStep;
    window.scrollTo(0, 0);

    if (currentStep === 5 || currentStep === 6) {
        const vence = sumarDias(new Date(), POLITICA_GARANTIA.diasVigencia);
        const gt = document.getElementById('garantiaTexto');
        if (gt) gt.textContent = `La garantía dura ${POLITICA_GARANTIA.diasVigencia} días calendario desde hoy y vence el ${fmtFechaLarga(vence)}. Cubre defectos del procedimiento o de los productos en nuestros locales; no cubre las exclusiones de la política.`;
        if (currentStep === 6) pintarResumenFirma(fmtFechaLarga(vence));
    }
    if (currentStep === 5 || currentStep === 6) {
        // Marketing: AddPaymentInfo en TikTok al llegar a firmas
        if (false /* rastreador quitado 18-nov */) {
            ttq.track('AddPaymentInfo', {
                contents: [{
                    content_id: 'diagnostico_final',
                    content_name: 'Consentimiento y Firmas',
                    content_type: 'product'
                }]
            });
        }
        setTimeout(() => {
            initSignatures();
            if (isLocked && window.lastViewedFicha) {
                loadSignaturesFromData(window.lastViewedFicha);
            }
        }, 400);
    }
}

window.verHistoriaClinica = (doc) => { abrirClinicaDe(doc); switchTab('clinica'); };

// Resumen que la clienta lee antes de firmar al final (lo acordado con la estilista)
function pintarResumenFirma(venceTxt) {
    const box = document.getElementById('resumenFirma');
    if (!box) return;
    const v = (id) => (document.getElementById(id)?.value || '').trim();
    const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sel = document.getElementById('responsableInput');
    const estilista = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : '';
    const alertas = [];
    if (v('embarazoInput') === 'Si') alertas.push('Embarazo');
    if (v('alergiasInput') === 'Si') alertas.push('Alergias' + (document.querySelector('[name="alergias_descripcion"]')?.value ? ': ' + document.querySelector('[name="alergias_descripcion"]').value : ''));
    if (v('consentMedsInput') === 'Si') alertas.push('Tratamiento médico o medicamentos');
    const fila = (k, val) => `<div class="rf-fila"><span>${k}</span><strong>${esc(val || '—')}</strong></div>`;
    box.innerHTML =
        fila('Clienta', document.querySelector('[name="nombre_completo"]')?.value) +
        fila('Sede', v('sedeInput')) +
        fila('Estilista', estilista) +
        fila('Procedimiento', v('procedimientoInput').split(',').map(s => s.trim()).filter(Boolean).join(' · ')) +
        fila('Objetivo de liso acordado', v('porcentajeInput')) +
        fila('Garantía vence', venceTxt) +
        (alertas.length ? `<div class="rf-alerta">Declaraste: ${esc(alertas.join(' · '))}. Tu estilista lo tuvo en cuenta.</div>` : '');
}

// Una sola casilla visible: "He leído y acepto" cubre plan, datos (Ley 1581) y firma electrónica (Ley 527),
// que quedan registrados por separado en la evidencia. Publicidad y fotos siguen siendo opcionales aparte.
function sincronizarAcepto() {
    const ok = !!document.getElementById('authCheckbox')?.checked;
    ['planTrabajoCheckbox', 'datosCheckbox', 'acuerdoFirmaCheckbox'].forEach(id => { const c = document.getElementById(id); if (c) c.checked = ok; });
}
document.getElementById('authCheckbox')?.addEventListener('change', sincronizarAcepto);

window.confirmarEntregaTablet = () => {
    document.getElementById('handoffModal')?.classList.add('hidden');
    window.__entregaOk = true;
    updateStep('next');
    window.__entregaOk = false;
};

if (nextBtn) nextBtn.addEventListener('click', () => updateStep('next'));
if (prevBtn) prevBtn.addEventListener('click', () => updateStep('prev'));

// Deja el formulario COMPLETAMENTE limpio: form.reset() no borra los campos ocultos de los chips (heredaban la ficha anterior).
function limpiarFormulario() {
    form.reset();
    form.querySelectorAll('input[type="hidden"]').forEach((h) => { h.value = ''; });
    lockForm(false, form);
    isLocked = false;
    window.isLocked = false;
    window.lastViewedFicha = null;
    window.currentLastFicha = null;
    window.__idCliente = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); // 1 formulario = 1 ficha
    destroyPads();
    resetOtp();
    ['previewAntes', 'previewDespues', 'previewObsDiag', 'previewObsCarac', 'previewObsCuero', 'previewExtra', 'previewVideo'].forEach((id) => { const e = document.getElementById(id); if (e) e.innerHTML = ''; });
    const lbl = document.getElementById('hairTypeSelectedLabel'); if (lbl) lbl.innerText = 'Ningún patrón seleccionado';
    const fl = document.getElementById('currentFolioNum'); if (fl) fl.innerText = 'se asigna al guardar';
    document.getElementById('alergiasDescGroup')?.classList.add('hidden');
    document.getElementById('clinicalBackgroundArea')?.classList.add('hidden');
    document.querySelectorAll('.chip.active, .chip-sm.active, .btn-hair.active, .btn-option.active').forEach((c) => c.classList.remove('active'));
    document.querySelectorAll('.form-group.error, .form-group.valid').forEach((g) => g.classList.remove('error', 'valid'));
    aplicarSedeFija();
}

// ======================== TAB SWITCHING ========================
window.switchTab = function (tab) {
    window.scrollTo(0, 0);
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector('.form-wrapper')?.classList.add('hidden');
    document.querySelector('.form-footer')?.classList.add('hidden');
    homeSection?.classList.add('hidden');
    historySection?.classList.add('hidden');
    stylistSection?.classList.add('hidden');
    controlSection?.classList.add('hidden');
    garantiasSection?.classList.add('hidden');
    clinicaSection?.classList.add('hidden');
    document.querySelector('.progress-container')?.classList.add('hidden');
    document.querySelector('.btn-back')?.classList.add('hidden');

    if (tab === 'home') {
        homeSection?.classList.remove('hidden');
    } else if (tab === 'new') {
        // Marketing: ViewContent y AddToCart en TikTok al iniciar nueva ficha
        if (false /* rastreador quitado 18-nov */) {
            ttq.track('ViewContent', {
                contents: [{
                    content_id: 'nuevo_folio',
                    content_name: 'Nueva Ficha Técnica',
                    content_type: 'product'
                }]
            });
            ttq.track('AddToCart', {
                contents: [{
                    content_id: 'nuevo_folio',
                    content_name: 'Nueva Ficha Técnica',
                    content_type: 'product'
                }],
                value: 0,
                currency: 'COP'
            });
        }

        document.querySelector('.form-wrapper')?.classList.remove('hidden');
        document.querySelector('.form-footer')?.classList.remove('hidden');
        document.querySelector('.progress-container')?.classList.remove('hidden');
        document.querySelector('.btn-back')?.classList.remove('hidden');
        document.querySelectorAll('.nav-item')[1]?.classList.add('active');
        
        limpiarFormulario();
        window.__entregaOk = false;

        currentStep = 1;
        updateStep('init');
        loadInitialData();
    } else if (tab === 'history') {
        const role = localStorage.getItem('julie_role');
        if (role !== 'admin') {
            alert('🔒 Acceso restringido. Solo la Dirección de Julie Alisados puede consultar historiales.');
            return;
        }
        historySection?.classList.remove('hidden');
        document.querySelectorAll('.nav-item')[2]?.classList.add('active');
        document.querySelector('.btn-back')?.classList.remove('hidden');
        renderHistory();
    } else if (tab === 'clinica') {
        if (localStorage.getItem('julie_role') !== 'admin') {
            alert('🔒 Acceso restringido. Solo la administración puede ver la historia clínica.');
            homeSection?.classList.remove('hidden');
            return;
        }
        clinicaSection?.classList.remove('hidden');
        document.querySelector('.btn-back')?.classList.remove('hidden');
        renderClinica();
    } else if (tab === 'garantias') {
        if (localStorage.getItem('julie_role') !== 'admin') {
            alert('🔒 Acceso restringido. Solo la administración puede ver las garantías.');
            homeSection?.classList.remove('hidden');
            return;
        }
        garantiasSection?.classList.remove('hidden');
        document.querySelector('.btn-back')?.classList.remove('hidden');
        renderGarantias();
    } else if (tab === 'control') {
        if (localStorage.getItem('julie_role') !== 'admin') {
            alert('🔒 Acceso restringido. Solo la administración puede ver el control.');
            homeSection?.classList.remove('hidden');
            return;
        }
        controlSection?.classList.remove('hidden');
        document.querySelector('.btn-back')?.classList.remove('hidden');
        window.controlTab('accesos');
    } else if (tab === 'stylists') {
        stylistSection?.classList.remove('hidden');
        document.querySelectorAll('.nav-item')[3]?.classList.add('active');
        document.querySelector('.btn-back')?.classList.remove('hidden');
        renderStylists();
    }
};

// Saltar a un paso: hacia atras siempre; hacia adelante solo si TODOS los pasos intermedios estan completos
// (antes se podian saltar campos obligatorios). Mientras se ve una ficha guardada se puede navegar libre (solo lectura).
window.jumpToStep = (step) => {
    if (document.querySelector('.form-wrapper')?.classList.contains('hidden')) return;
    if (step > currentStep && !isLocked) {
        for (let s = currentStep; s < step; s++) {
            if (!validateStep(s, steps)) { currentStep = s; updateStep('jump'); return; }
        }
    }
    currentStep = step;
    updateStep('jump');
};

if (searchInput) searchInput.addEventListener('input', (e) => renderHistory(e.target.value.trim()));
if (stylistSearchInput) stylistSearchInput.addEventListener('input', (e) => renderStylists(e.target.value.trim()));

// ======================== HISTORY ========================
async function renderHistory(filter = '') {
    const listEl = document.getElementById('historyList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="loading-spinner">Cargando folios...</div>';
    try {
        const passcode = sessionStorage.getItem('julie_pass_token') || 'none';
        const history = await fetchHistory(passcode);
        if (!history || history.length === 0) { 
            listEl.innerHTML = '<div class="empty-msg" style="text-align:center; padding:40px; color:#888;"><i data-lucide="database-backup" style="width:40px; height:40px; margin-bottom:10px;"></i><p>No hay fichas registradas en la base de datos.</p></div>'; 
            if (window.lucide) window.lucide.createIcons();
            return; 
        }
        
        const filterNorm = filter.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const filtered = history.filter(item => {
            const nom = (item.nombre_completo || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const doc = String(item.numero_documento || '');
            const fol = String(item.consecutivo || '');
            return nom.includes(filterNorm) || doc.includes(filterNorm) || fol.includes(filterNorm);
        });

        listEl.innerHTML = '';
        if (filtered.length === 0) {
            listEl.innerHTML = '<p class="empty-msg" style="text-align:center; padding:20px;">No se encontraron resultados para su búsqueda.</p>';
            return;
        }

        filtered.forEach(item => {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.style = 'background: white; padding: 16px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; border-left: 5px solid var(--gold-primary); margin-bottom: 10px;';
            const fecha = item.created_at ? new Date(item.created_at).toLocaleDateString('es-CO') : 'Sin fecha';
            
            card.innerHTML = `
                <div style="flex: 1;">
                    <h4 style="margin:0; color: var(--gold-dark); font-size: 1rem;">${esc(item.nombre_completo)}</h4>
                    <p style="margin:3px 0; font-size:0.8rem; color:#666;">Folio: <strong>#${esc(item.consecutivo)}</strong> | Doc: ${esc(item.numero_documento)}</p>
                    <div style="display:flex; gap:10px; margin-top:5px;">
                        <span style="font-size:0.7rem; background:#f0f0f0; padding:2px 8px; border-radius:10px;">${fecha}</span>
                        <span style="font-size:0.7rem; background:rgba(255,61,154,0.1); color:var(--gold-dark); padding:2px 8px; border-radius:10px;">${esc(item.sede || 'Sede Julie')}</span>
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="openFichaDetail('${safeId(item.consecutivo)}')" class="btn-view" title="Ver ficha con fotos y video" style="background:#f8f9fa; border:1px solid #ddd; padding:8px 12px; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button onclick="directPDF('${safeId(item.consecutivo)}')" class="btn-pdf-list" style="background:var(--gold-gradient); color:white; border:none; padding:8px 12px; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
                    </button>
                </div>`;
            listEl.appendChild(card);
        });
        window.lucide?.createIcons();
    } catch (e) { 
        console.error('Error renderHistory:', e); 
        listEl.innerHTML = '<div class="error-card" style="padding:20px; color:red; text-align:center;">Error al conectar con Supabase. Verifica tu internet.</div>'; 
    }
}

// ======================== STYLISTS ========================
async function renderStylists(filter = '') {
    const listEl = document.getElementById('stylistList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="loading-spinner">Cargando...</div>';
    try {
        const passcode = sessionStorage.getItem('julie_pass_token') || 'none';
        const stylists = await fetchStylistsSecure(passcode);
        listEl.innerHTML = '';
        if (!stylists || stylists.length === 0) { 
            listEl.innerHTML = '<p class="empty-msg">No hay estilistas registrados aún.</p>'; 
            return; 
        }
        
        const filterNorm = filter.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const filtered = stylists.filter(s => {
            const nom = (s.nombre || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const tel = String(s.telefono || '');
            const mail = (s.email || '').toLowerCase();
            return nom.includes(filterNorm) || tel.includes(filterNorm) || mail.includes(filterNorm);
        });

        filtered.forEach(s => {
            const item = document.createElement('div');
            item.className = 'stylist-item';
            item.style = 'display: flex; justify-content: space-between; align-items: center; background: white; padding: 12px; border-radius: 12px; margin-bottom: 10px; border-left: 4px solid var(--gold-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.05);';
            item.innerHTML = `
                <div style="flex: 1;">
                    <strong style="display: block; color: var(--gold-dark);">${esc(s.nombre)}</strong>
                    <small style="display: block; color: var(--text-secondary);">${esc(s.telefono || 'Sin tel')} · ${esc(s.email || 'Sin correo')}</small>
                </div>
                <button onclick="deleteStylist('${safeId(s.id)}')" class="btn-delete-mini" style="background: #fff0f0; color: #ff4d4d; border: 1px solid #ffcccc; padding: 8px; border-radius: 8px; cursor: pointer;">
                    <i data-lucide="trash-2"></i>
                </button>`;
            listEl.appendChild(item);
        });
        window.lucide?.createIcons();
    } catch (e) { 
        console.error('Error renderStylists:', e); 
        listEl.innerHTML = `
            <div class="error-card" style="padding:20px; text-align:center; color:var(--error);">
                <p><strong>Error al cargar equipo</strong></p>
                <small>${esc(e.message || 'Error de conexión o base de datos')}</small>
                <p style="font-size:0.75rem; margin-top:10px;">Asegúrate de haber actualizado la tabla en Supabase.</p>
            </div>`; 
    }
}

window.deleteStylist = async (id) => { 
    if (confirm('¿Eliminar estilista?')) { 
        const passcode = sessionStorage.getItem('julie_pass_token') || 'none';
        await deleteStylistDb(id, passcode); 
        renderStylists(); 
        loadInitialData(); 
    } 
};
window.addStylist = async () => { 
    const name = stylistInput.value.trim(); 
    const phone = document.getElementById('stylistPhoneInput').value.trim();
    const email = document.getElementById('stylistEmailInput').value.trim();
    const sedeSel = document.getElementById('stylistSedeInput')?.value || '';

    if (!name) { alert('El nombre es obligatorio'); return; }
    try {
        const passcode = sessionStorage.getItem('julie_pass_token') || 'none';
        await addStylistDb({ nombre: name, telefono: phone, email: email, sede: sedeSel }, passcode);
        document.getElementById('stylistInput').value = '';
        document.getElementById('stylistPhoneInput').value = '';
        document.getElementById('stylistEmailInput').value = '';
        const ss = document.getElementById('stylistSedeInput'); if (ss) ss.value = '';
        renderStylists();
        loadInitialData();
        alert('Estilista agregada con éxito');
    } catch (e) { alert('Error al agregar'); }
};

// ======================== VIEW FICHA ========================
window.viewFicha = async (consecutivo) => {
    try {
        const passcode = sessionStorage.getItem('julie_pass_token') || 'none';
        const data = await getFichaByConsecutivo(consecutivo, passcode);
        if (!data) { alert('No se encontró la ficha.'); return false; }
        switchTab('new');
        isLocked = true;
        window.isLocked = true;
        lockForm(true, form);

        // Llenar campos del formulario
        for (let key in data) {
            const input = form.querySelector(`[name="${key}"]`);
            if (input) {
                if (input.type === 'checkbox') input.checked = data[key];
                else input.value = (data[key] !== null && typeof data[key] === 'object') ? JSON.stringify(data[key]) : data[key];
            }
            // Activar chips visuales
            if (['longitud', 'crecimiento', 'medios', 'puntas', 'textura', 'elasticidad', 'resistencia', 'porosidad', 'densidad', 'piel', 'lavado', 'dermatitis', 'caida', 'descamacion', 'embarazo', 'alergias', 'procedimiento', 'porcentaje'].includes(key) && data[key]) {
                setChip(key, data[key]);
            }
        }
        if (data.sede) setSede(data.sede);
        const lblFolio = document.getElementById('currentFolioNum');
        if (lblFolio && data.consecutivo) lblFolio.innerText = '#' + data.consecutivo;
        if (data.tipo_cabello) {
            const code = data.tipo_cabello.split(':')[0]?.trim() || '';
            setHairType(code, data.tipo_cabello);
        }
        // Fotos y video: enlaces firmados temporales (solo el administrador puede pedirlos)
        const m = await urlsDeFicha(data).catch((e) => { console.error('urlsDeFicha', e); return null; });
        const put = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
        const imgTag = (u, cls = '') => `<img src="${safeUrl(u)}" ${cls ? `class="${cls}"` : 'style="width:100%; border-radius:12px;"'} loading="lazy" onclick="window.open(this.src,'_blank')">`;
        if (m) {
            if (m.foto_antes_url) put('previewAntes', imgTag(m.foto_antes_url));
            if (m.foto_despues_url) put('previewDespues', imgTag(m.foto_despues_url));
            if (m.foto_obs_diag_url) put('previewObsDiag', imgTag(m.foto_obs_diag_url));
            if (m.foto_obs_carac_url) put('previewObsCarac', imgTag(m.foto_obs_carac_url));
            if (m.foto_obs_cuero_url) put('previewObsCuero', imgTag(m.foto_obs_cuero_url));
            if (m.extras.length) put('previewExtra', m.extras.map((u) => imgTag(u, 'preview-thumb')).join(''));
            if (m.video_url) put('previewVideo', `<video src="${safeUrl(m.video_url)}" controls playsinline preload="metadata" style="width:100%; border-radius:8px;"></video>`);
        } else if (data.foto_antes_url || data.foto_despues_url) {
            alert('No se pudieron cargar las fotos (revisa tu conexión). El resto de la ficha sí se muestra.');
        }

        // Marcar autorización como aceptada
        const authCb = document.getElementById('authCheckbox');
        if (authCb) authCb.checked = true;

        window.lastViewedFicha = data;
        updateStep('init');
        return true;
    } catch (e) { console.error(e); alert('Error al cargar la ficha.'); return false; }
};

// Solo genera el PDF si la ficha pedida se cargó de verdad (antes podía exportar el formulario de OTRA clienta si la consulta fallaba).
window.directPDF = async (consecutivo) => {
    try {
        const ok = await window.viewFicha(consecutivo);
        if (!ok || String(window.lastViewedFicha?.consecutivo) !== String(consecutivo)) { alert('No se pudo cargar esa ficha: no se generó el PDF.'); return; }
        // Esperar a que se carguen firmas y fotos
        setTimeout(() => { if (String(window.lastViewedFicha?.consecutivo) === String(consecutivo)) generatePDF(); }, 2200);
    } catch (e) { console.error(e); }
};

// ======================== DOCUMENT LOOKUP ========================
const docInput = document.getElementById('docNumberInput');
if (docInput) {
    const performCheck = async () => {
        const val = docInput.value.trim();
        if (val.length < 5) {
            const badge = document.getElementById('visitTypeBadge');
            if (badge) { badge.innerText = 'NUEVA CLIENTE'; badge.className = 'visit-badge'; }
            window.currentLastFicha = null;
            return;
        }
        try {
            const passcode = sessionStorage.getItem('julie_pass_token') || 'none';
            const lastFicha = await getLastFichaByDoc(val, passcode);
            window.currentLastFicha = lastFicha; // Guardar para el botón de importar
            const area = document.getElementById('clinicalBackgroundArea');
            const badge = document.getElementById('visitTypeBadge');
            const bgText = document.getElementById('backgroundText');

            if (lastFicha) {
                if (badge) { badge.innerText = 'FOLIO ADICIONAL'; badge.className = 'visit-badge recurring'; }
                setChip('tipo_cliente', 'Recurrente');
                if (area && bgText) {
                    area.classList.remove('hidden');
                    bgText.innerHTML = `
                        📌 <strong>ÚLTIMA VISITA:</strong> ${new Date(lastFicha.created_at).toLocaleDateString()}<br>
                        💇‍♀️ <strong>PROCEDIMIENTO:</strong> ${esc(lastFicha.procedimiento)}<br>
                        ✨ <strong>LISO:</strong> ${esc(lastFicha.porcentaje_liso || '100%')}<br>
                        📝 <strong>TÉCNICA:</strong> ${esc(lastFicha.tecnica_utilizada || 'N/A')}<br>
                        <button type="button" onclick="viewQuickHistory('${safeId(val)}')" style="margin-top:10px; background:var(--gold-dark); color:white; border:none; padding:8px 12px; border-radius:8px; font-size:0.75rem; cursor:pointer; width:100%;">
                            📂 VER HISTORIAL CLÍNICO Y DETALLES
                        </button>
                    `;
                }
                
                // Mostrar botón de historial en el header
                const hBtn = document.getElementById('headerHistoryBtn');
                if (hBtn) hBtn.classList.remove('hidden');
            } else {
                if (badge) { badge.innerText = 'NUEVA CLIENTE'; badge.className = 'visit-badge'; }
                setChip('tipo_cliente', 'Nueva');
                if (area) area.classList.add('hidden');
                const hBtn = document.getElementById('headerHistoryBtn');
                if (hBtn) hBtn.classList.add('hidden');
            }
        } catch (e) { console.error('Recurrence check error:', e); }
    };

    docInput.addEventListener('input', debounce(performCheck, 600));
}

// Lógica de Importación de Datos Previos
const btnLoadPrev = document.getElementById('btnLoadPrevious');
if (btnLoadPrev) {
    btnLoadPrev.addEventListener('click', () => {
        const data = window.currentLastFicha;
        if (!data) { alert('No hay datos previos detectados para esta cliente.'); return; }

        // 1. Datos Básicos
        const fields = {
            'nombre_completo': data.nombre_completo,
            'telefono': data.telefono,
            'email': data.email,
            'edad': data.edad
        };

        for (let key in fields) {
            const el = form.querySelector(`[name="${key}"]`);
            if (el) el.value = fields[key] || '';
        }
        
        if (data.genero) setChip('genero', data.genero);
        monitorMinorSettings();

        // 2. Antecedentes Significativos (Procesos y Terapias)
        const note = `\n\n[DATO IMPORTADO DE FOLIO #${data.consecutivo} del ${new Date(data.created_at).toLocaleDateString()}]`;
        
        const procInput = form.querySelector('[name="procesos_quimicos"]');
        if (procInput && data.procesos_quimicos) {
            procInput.value = data.procesos_quimicos + note;
        }

        const terInput = form.querySelector('[name="terapias_capilares"]');
        if (terInput && data.terapias_capilares) {
            terInput.value = data.terapias_capilares + note;
        }

        // 3. Notas del último procedimiento en Diagnóstico
        const diagObs = form.querySelector('[name="observaciones_diagnostico"]');
        if (diagObs) {
            diagObs.value = `ÚLTIMO SERVICIO: ${data.procedimiento} (${data.porcentaje_liso || '100%'} liso) realizado el ${new Date(data.created_at).toLocaleDateString()}.` + note;
        }

        alert('✅ Datos básicos y antecedentes importados con éxito. Por favor realiza el nuevo diagnóstico capilar.');
    });
}

window.viewQuickHistory = async (doc) => {
    try {
        const passcode = sessionStorage.getItem('julie_pass_token') || 'none';
        const history = await fetchHistory(passcode);
        const clientFolios = history.filter(f => f.numero_documento === doc);
        let html = '<div style="max-height:400px; overflow-y:auto; padding:5px;">';
        
        if (clientFolios.length === 0) {
            html += '<p style="text-align:center; padding:20px; color:#666;">No hay folios previos.</p>';
        }

        clientFolios.forEach(f => {
            html += `
                <div style="border: 1px solid #eee; border-radius: 12px; padding:12px; margin-bottom: 10px; background: #fafafa;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 5px;">
                        <strong style="color:var(--gold-dark);">Folio #${esc(f.consecutivo)}</strong>
                        <small style="font-weight: bold; color: #888;">${new Date(f.created_at).toLocaleDateString()}</small>
                    </div>
                    <p style="font-size:0.85rem; margin:5px 0;"><strong>Servicio:</strong> ${esc(f.procedimiento)}</p>
                    <button type="button" onclick="openFichaDetail('${safeId(f.consecutivo)}')" style="margin-top:8px; background:var(--gold-gradient); color:white; border:none; padding:8px 12px; border-radius:8px; font-size:0.75rem; cursor:pointer; width:100%; font-weight: bold;">
                        📄 VER DETALLE COMPLETO
                    </button>
                </div>
            `;
        });
        html += '</div>';
        
        const modal = document.getElementById('quickHistoryModal');
        document.getElementById('quickHistoryBody').innerHTML = html;
        modal.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
    } catch (e) { console.error(e); alert('Error al cargar historial.'); }
};

window.openFichaDetail = async (consecutivo) => {
    try {
        const passcode = sessionStorage.getItem('julie_pass_token') || 'none';
        const data = await getFichaByConsecutivo(consecutivo, passcode);
        if (!data) return alert('No se encontró la ficha.');

        const body = document.getElementById('fichaDetailBody');
        document.getElementById('detailFichaTitle').innerText = `Detalle Folio #${data.consecutivo}`;
        
        let html = `
            <div style="display: grid; gap: 15px;">
                <div style="background: #FAFAFA; padding: 12px; border-radius: 12px; border: 1px solid var(--border-gold);">
                    <h4 style="color: var(--gold-dark); margin-bottom: 5px; border-bottom: 1px solid var(--gold-light);">DATOS GENERALES</h4>
                    <p><strong>Fecha:</strong> ${esc(data.fecha_diligenciamiento)}</p>
                    <p><strong>Estilista:</strong> ${esc(data.estilista_responsable)}</p>
                    <p><strong>Sede:</strong> ${esc(data.sede)}</p>
                    <p><strong>Clienta:</strong> ${esc(data.nombre_completo)} · ${esc(data.telefono || '')}</p>
                    <p><strong>Embarazo:</strong> ${esc(data.embarazo || '—')} · <strong>Alergias:</strong> ${esc(data.alergias || '—')}${data.alergias_descripcion ? ': ' + esc(data.alergias_descripcion) : ''}</p>
                </div>
                
                <div style="padding: 10px;">
                    <h4 style="color: var(--gold-dark); margin-bottom: 5px;">DIAGNÓSTICO Y TÉCNICA</h4>
                    <p><strong>Patrón:</strong> ${esc(data.tipo_cabello)}</p>
                    <p><strong>Procedimiento:</strong> ${esc(data.procedimiento)}</p>
                    <p><strong>Técnica:</strong> ${esc(data.tecnica_utilizada)}</p>
                    <p><strong>Garantía:</strong> ${esc(data.porcentaje_liso)}</p>
                </div>

                <div style="padding: 10px; background: #fafafa; border-radius: 10px;">
                    <h4 style="color: var(--gold-dark); margin-bottom: 5px;">OBSERVACIONES</h4>
                    <p><strong>Técnica:</strong> ${esc(data.observaciones_diagnostico)}</p>
                    <p><strong>Capilar:</strong> ${esc(data.observaciones_caracteristicas)}</p>
                </div>

                <div id="detalleMedia" style="display:grid; gap:10px;"><p style="color:#888;">Cargando fotos y video…</p></div>
            </div>
        `;

        body.innerHTML = html;
        document.getElementById('btnPdfDetail').onclick = () => window.directPDF(consecutivo);
        // Fotos y video con enlace firmado temporal
        urlsDeFicha(data).then((m) => {
            const box = document.getElementById('detalleMedia'); if (!box) return;
            const foto = (t, u) => u ? `<div><p style="font-size:0.7rem; font-weight:bold; color:var(--gold-dark); margin:0 0 4px;">${t}</p><img src="${safeUrl(u)}" loading="lazy" style="width:100%; border-radius:8px; cursor:zoom-in;" onclick="window.open(this.src,'_blank')"></div>` : '';
            const fotos = foto('ANTES', m.foto_antes_url) + foto('DESPUÉS', m.foto_despues_url) + foto('DIAGNÓSTICO', m.foto_obs_diag_url) + foto('CARACTERÍSTICAS', m.foto_obs_carac_url) + foto('CUERO CABELLUDO', m.foto_obs_cuero_url) + m.extras.map((u, i) => foto('EXTRA ' + (i + 1), u)).join('');
            const video = m.video_url ? `<div><p style="font-size:0.7rem; font-weight:bold; color:var(--gold-dark); margin:0 0 4px;">VIDEO</p><video src="${safeUrl(m.video_url)}" controls playsinline preload="metadata" style="width:100%; border-radius:8px;"></video></div>` : '';
            box.innerHTML = (fotos ? `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">${fotos}</div>` : '') + video || '<p style="color:#888;">Esta ficha no tiene fotos ni video.</p>';
        }).catch((e) => { console.error(e); const box = document.getElementById('detalleMedia'); if (box) box.innerHTML = '<p style="color:var(--error);">No se pudieron cargar las fotos (revisa la conexión).</p>'; });
        document.getElementById('fichaDetailModal').classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
    } catch (e) { console.error(e); alert('Error al cargar detalle.'); }
};


window.triggerQuickHistory = () => {
    const doc = document.getElementById('docNumberInput')?.value.trim();
    if (doc && doc.length >= 5) {
        window.viewQuickHistory(doc);
    } else {
        alert('⚠️ Por favor ingresa el documento de la cliente primero en el Paso 1.');
    }
};

// ======================== CONTROL (accesos, copia a Drive, novedades) ========================
const fmtFecha = (iso) => { try { return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return ''; } };
const ACCION_TXT = { crear_ficha: 'Creó la ficha', ver_ficha: 'Abrió la ficha', registrar_acceso: 'Abrió la ficha' };
const caja = (html, extra = '') => `<div style="background:#fff; padding:12px 14px; border-radius:14px; border:1px solid var(--border-gold); font-size:0.85rem; ${extra}">${html}</div>`;
const SYNC_TXT = { ok: '✔ En Drive', pendiente: '⏳ Pendiente', error: '⚠ Con error', modo_prueba: 'Modo prueba (sin Drive)' };

window.controlTab = async (name) => {
    ['Accesos', 'Drive', 'Novedades'].forEach((n) => document.getElementById('ctlBtn' + n)?.classList.toggle('active', n.toLowerCase() === name));
    const body = document.getElementById('controlBody');
    if (!body) return;
    body.innerHTML = caja('Cargando…');
    try {
        if (name === 'accesos') {
            const rows = await fetchBitacora();
            body.innerHTML = rows.length
                ? rows.map((r) => caja(`<strong>${esc(ACCION_TXT[r.accion] || r.accion)}</strong>${r.folio ? ' · folio #' + esc(r.folio) : ''}<br><span style="color:var(--text-secondary);">${esc(fmtFecha(r.creado_en))} · ${esc(r.usuario || '')}</span>`)).join('')
                : caja('Todavía no hay movimientos.');
        } else if (name === 'drive') {
            const rows = await fetchSyncDrive();
            const cuenta = (e) => rows.filter((r) => r.drive_sync_estado === e).length;
            const resumen = caja(`<strong>${rows.length} fichas</strong> · ✔ ${cuenta('ok')} en Drive · ⏳ ${cuenta('pendiente')} pendientes · ⚠ ${cuenta('error')} con error`, 'background:var(--ivory);');
            body.innerHTML = resumen + (rows.length ? rows.map((r) => caja(`<strong>Folio #${esc(r.consecutivo)}</strong> · ${esc(r.sede || '')}<br><span>${esc(SYNC_TXT[r.drive_sync_estado] || r.drive_sync_estado)}</span>${r.drive_sync_error ? `<br><span style="color:var(--error);">${esc(r.drive_sync_error)}</span>` : ''}<br><span style="color:var(--text-secondary);">${esc(fmtFecha(r.created_at))}</span>`)).join('') : '');
        } else {
            const rows = await fetchNovedades();
            const menor = (r) => parseInt(r.edad, 10) < 18;
            const aceptan = rows.filter((r) => r.autoriza_marketing && !menor(r));
            const nota = caja('Antes de escribir a alguien: que haya aceptado, que no sea menor, que no haya pedido BAJA y que hayan pasado 21 días desde el último envío comercial. Nada se envía sin el OK del Director.', 'background:var(--ivory);');
            const resumen = caja(`<strong>${aceptan.length} de ${rows.length}</strong> aceptan recibir novedades · ${rows.filter((r) => r.autoriza_publicidad && !menor(r)).length} autorizan fotos en publicidad`);
            const fila = (r) => caja(`<strong>#${esc(r.consecutivo)} · ${esc(r.nombre_completo)}</strong>${menor(r) ? ' <em>(menor)</em>' : ''}<br><span style="color:var(--text-secondary);">${esc(r.telefono || '')} · ${esc(r.email || '')}</span><br>Novedades: <strong>${r.autoriza_marketing && !menor(r) ? 'Sí' : 'No'}</strong> · Fotos en publicidad: <strong>${r.autoriza_publicidad && !menor(r) ? 'Sí' : 'No'}</strong>`, r.autoriza_marketing && !menor(r) ? '' : 'opacity:0.7;');
            body.innerHTML = nota + resumen + rows.map(fila).join('');
        }
    } catch (e) {
        body.innerHTML = caja('No se pudo cargar: ' + esc(e.message || 'error'));
    }
};

// ======================== INITIAL DATA ========================
async function loadInitialData() {
    try {
        if (!(await haySesion())) return; // sin sesion no hay nada que pedir a la base
        if (document.getElementById('currentDateTime')) {
            document.getElementById('currentDateTime').value = new Date().toLocaleString('es-CO');
        }
        // El folio lo asigna el servidor al GUARDAR (antes se anunciaba uno que podia no coincidir).
        // Si se esta viendo una ficha ya guardada (bloqueada), no pisar su folio ni su estilista con los datos de una ficha nueva.
        const viendoFicha = !!window.isLocked;

        const stylists = await fetchStylists();
        const drop = document.getElementById('responsableInput');
        if (drop && viendoFicha) {
            const actual = drop.value;
            if (actual && ![...drop.options].some(o => o.value === actual)) {
                const opt = document.createElement('option'); opt.value = actual; opt.textContent = actual; drop.appendChild(opt); drop.value = actual;
            }
        } else if (drop) {
            drop.innerHTML = '<option value="">Seleccione Estilista...</option>';
            if (stylists && stylists.length > 0) {
                stylists.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.nombre;
                    opt.textContent = s.nombre;
                    drop.appendChild(opt);
                });
            } else {
                drop.innerHTML = '<option value="">⚠️ No hay estilistas creados</option>';
            }
        }
    } catch (e) { console.error('Error loadInitialData:', e); }
}



// ======================== GLOBAL BINDINGS ========================
window.setSede = setSede;
window.setHairType = setHairType;
window.setChip = setChip;
window.previewImage = previewImage;
window.clearSignature = (type) => clearSignature(type, isLocked);
window.generatePDF = generatePDF;
window.resetForm = () => window.location.reload();
window.goBack = function () {
    if (homeSection && !homeSection.classList.contains('hidden')) {
        if (confirm('¿Salir?')) window.location.reload();
    } else {
        switchTab('home');
    }
};

// ======================== SAVE HANDLER ========================
if (saveBtn) saveBtn.addEventListener('click', async () => {
    sincronizarAcepto();
    for (let s = 1; s <= 6; s++) { if (!validateStep(s, steps)) { currentStep = s; updateStep('jump'); return; } }

    const { padClient, padTech, padTutor } = getSignaturePads();
    if (!padClient || padClient.isEmpty() || !padTech || padTech.isEmpty()) {
        alert('⚠️ Firmas obligatorias. Debes firmar como CLIENTE y como TÉCNICO.');
        return;
    }

    // Validación firma tutor para menores
    const isMinor = parseInt(document.getElementById('edadInput')?.value) < 18;
    if (isMinor && (!padTutor || padTutor.isEmpty())) {
        alert('⚠️ Firma del TUTOR obligatoria para menores de edad.');
        return;
    }
    if (isMinor) {
        const tDoc = (document.getElementById('tutorDocInput')?.value || '').trim();
        const tPar = (document.getElementById('tutorParentescoInput')?.value || '').trim();
        const tNom = (document.getElementById('tutorNameInput')?.value || '').trim();
        if (tNom.length < 5 || tDoc.length < 5 || tPar.length < 3) {
            alert('⚠️ Para menores de edad escribe nombre, documento y parentesco del tutor.');
            return;
        }
    }

    if (OTP_OBLIGATORIO && !otpVerificado()) {
        alert('⚠️ Falta confirmar el consentimiento con el código de WhatsApp o correo (paso 6).');
        document.getElementById('otpSend')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    const fileA = document.getElementById('fotoAntesInput')?.files[0];
    const fileD = document.getElementById('fotoDespuesInput')?.files[0];
    if (!fileA || !fileD) {
        alert('⚠️ FALTAN FOTOS: Debes seleccionar la foto del ANTES y la del DESPUÉS.');
        return;
    }

    // --- VALIDACIÓN LEGAL DATOS SENSIBLES ---
    const embarazo = document.getElementById('embarazoInput')?.value;
    const alergias = document.getElementById('alergiasInput')?.value;
    
    if (embarazo === 'No aporta' || alergias === 'No aporta') {
        const legalWarning = `📝 NOTA IMPORTANTE DE SEGURIDAD:\n\nEn Julie Alisados, tu salud y seguridad son nuestra prioridad. De acuerdo con nuestra política de privacidad, el suministro de datos sobre salud (embarazo o alergias) es totalmente opcional.\n\nSin embargo, para garantizar un procedimiento 100% seguro y resultados óptimos, te informamos que la falta de esta información o el aporte de datos incompletos podría limitar la aplicación de garantías o la aplicabilidad del servicio por tu bienestar.\n\n¿Deseas continuar con el proceso bajo estas condiciones de seguridad?`;
        if (!confirm(legalWarning)) return;
    }

    // Los archivos pesados no caben en el plan actual (50 MB por archivo): avisar ANTES de subir nada
    const LIMITE_MB = 50;
    const grandes = [fileA, fileD, document.getElementById('videoInput')?.files[0], ...Array.from(document.getElementById('fotoExtraInput')?.files || [])]
        .filter((f) => f && f.size > LIMITE_MB * 1024 * 1024);
    if (grandes.length) {
        alert(`⚠️ Un archivo pesa más de ${LIMITE_MB} MB (${(grandes[0].size / 1048576).toFixed(0)} MB). Si es el video, grábalo en menor calidad (1080p) o más corto.`);
        return;
    }
    if (window.__guardando) return; // evita doble envío
    window.__guardando = true;

    saveBtn.innerText = '⌛ SUBIENDO EVIDENCIAS...';
    saveBtn.disabled = true;

    try {
        const formData = new FormData(form);
        const cleanData = Object.fromEntries(formData.entries());
        cleanData.id_cliente = window.__idCliente; // el servidor devuelve la misma ficha si este envío se repite
        delete cleanData.consecutivo;
        
        // --- INTEGRACIÓN CRM & MARKETING ---
        const marketing = getMarketingContext();
        cleanData.utm_source = marketing.utm_source;
        cleanData.utm_medium = marketing.utm_medium;
        cleanData.utm_campaign = marketing.utm_campaign;
        cleanData.ubicacion_gps = marketing.ubicacion; // Ubicación capturada por IP
        // El genero ya viene en cleanData por el input hidden
        // --- PROCESAR EVIDENCIAS ---
        const uploadTasks = [];
        const cons = window.__idCliente; // las rutas de archivos usan el id del formulario, no un folio que aun no existe

        // Obligatorias
        uploadTasks.push(uploadImg(fileA, 'antes', cons).then(url => cleanData.foto_antes_url = url));
        uploadTasks.push(uploadImg(fileD, 'despues', cons).then(url => cleanData.foto_despues_url = url));

        // Opcionales Diagnóstico
        const fDiag = document.getElementById('fotoObsDiagInput')?.files[0];
        if (fDiag) uploadTasks.push(uploadImg(fDiag, 'obs_diag', cons).then(url => cleanData.foto_obs_diag_url = url));

        const fCarac = document.getElementById('fotoObsCaracInput')?.files[0];
        if (fCarac) uploadTasks.push(uploadImg(fCarac, 'obs_carac', cons).then(url => cleanData.foto_obs_carac_url = url));

        const fCuero = document.getElementById('fotoObsCueroInput')?.files[0];
        if (fCuero) uploadTasks.push(uploadImg(fCuero, 'obs_cuero', cons).then(url => cleanData.foto_obs_cuero_url = url));

        // Extra Fotos (Multiple)
        const fExtra = document.getElementById('fotoExtraInput')?.files;
        if (fExtra && fExtra.length > 0) {
            const extraPromises = Array.from(fExtra).map((file, i) => uploadImg(file, `extra_${i}`, cons));
            uploadTasks.push(Promise.all(extraPromises).then(urls => cleanData.fotos_extra_urls = JSON.stringify(urls)));
        }

        // Video
        const fVid = document.getElementById('videoInput')?.files[0];
        if (fVid) uploadTasks.push(uploadImg(fVid, 'video_evidencia', cons).then(url => cleanData.video_url = url));

        await Promise.all(uploadTasks);

        // Firmas
        cleanData.firma_cliente = padClient.toDataURL();
        cleanData.firma_tecnico = padTech.toDataURL();
        if (isMinor && padTutor) {
            cleanData.firma_tutor_legal = padTutor.toDataURL();
            cleanData.nombre_tutor = document.getElementById('tutorNameInput')?.value || '---';
            cleanData.documento_tutor = document.getElementById('tutorDocInput')?.value || '';
            cleanData.parentesco_tutor = document.getElementById('tutorParentescoInput')?.value || '';
        }

        // --- PRUEBA DE CONSENTIMIENTOS (version del texto, huella, fecha y dispositivo) ---
        const textoConsent = document.querySelector('.consent-doc')?.innerText || '';
        if (textoConsent.length < 200) throw new Error('No se pudo leer el texto del consentimiento para dejar la prueba. Recarga la página e intenta de nuevo.');
        const huella = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, '0')).join('');
        const marcado = (id) => !!document.getElementById(id)?.checked;
        cleanData.consent_evidencia = JSON.stringify({
            version_texto: '2026-11-19-v2-borrador-pendiente-abogado',
            huella_texto_sha256: await huella(textoConsent),
            fecha_hora_iso: new Date().toISOString(),
            dispositivo: navigator.userAgent,
            confirmacion_codigo: getOtpEvidencia(),
            aceptados: {
                consentimiento_servicio: marcado('authCheckbox'),
                plan_trabajo: marcado('planTrabajoCheckbox'),
                datos_personales_y_salud: marcado('datosCheckbox'),
                acuerdo_firma_electronica: marcado('acuerdoFirmaCheckbox'),
                cuidados_entregados: marcado('cuidadosCheckbox'),
                garantia_vence_iso: sumarDias(new Date(), POLITICA_GARANTIA.diasVigencia).toISOString(),
                marketing_whatsapp_correo: marcado('marketingCheckbox') && !isMinor,
                fotos_publicidad: marcado('photoPublicCheckbox') && !isMinor
            }
        });
        if (isMinor) { delete cleanData.autoriza_marketing; delete cleanData.autoriza_publicidad; }

        // --- ENCRIPTACIÓN DE PRIVACIDAD (HASHING SHA-256) ---
        const hashData = async (str) => {
            if (!str) return null;
            const msgBuffer = new TextEncoder().encode(str.trim().toLowerCase());
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        };

        const hashedEmail = await hashData(cleanData.email);
        const hashedPhone = await hashData(cleanData.telefono);

        const dbPayload = { ...cleanData };
        // Remover columnas que puedan no estar creadas en Supabase para evitar errores fatales en la BD
        // La base real (migracion ficha_digital_seguridad) ya tiene las columnas de consentimiento; solo se quitan datos de rastreo que no se guardan.
        delete dbPayload.utm_source;
        delete dbPayload.utm_medium;
        delete dbPayload.utm_campaign;
        delete dbPayload.ubicacion_gps;


        try {
            const folio = await insertFicha(dbPayload);
            if (!folio) throw new Error('El servidor no devolvió el folio');
            cleanData.consecutivo = String(folio); // folio REAL asignado por el servidor
        } catch (dbError) {
            alert('❌ Error al guardar: ' + (dbError.message || dbError) + '\nNo cierres la página: toca Guardar otra vez (no se duplicará la ficha).');
            throw dbError;
        }

        // Reportar conversión a Google (Enhanced Conversions)
        if (false /* rastreador quitado 18-nov */) {
            gtag('event', 'purchase', {
                'transaction_id': cleanData.consecutivo,
                'value': 0,
                'currency': 'COP',
                'user_data': {
                    'sha256_email_address': hashedEmail,
                    'sha256_phone_number': hashedPhone
                },
                'items': [{ 'item_id': cleanData.procedimiento, 'item_name': 'Servicio de Alisado' }]
            });
        }
        
        // Reportar conversión a Meta (Advanced Matching)
        if (false /* rastreador quitado 18-nov */) {
            fbq('track', 'Purchase', {
                value: 0,
                currency: 'COP',
                content_name: cleanData.procedimiento,
                content_ids: [cleanData.consecutivo]
            }, {
                em: hashedEmail,
                ph: hashedPhone
            });
        }
        
        // Reportar conversión a TikTok (Identify + Track con ID de Contenido)
        if (false /* rastreador quitado 18-nov */) {
            ttq.identify({
                email: hashedEmail,
                phone_number: hashedPhone
            });
            ttq.track('CompletePayment', {
                contents: [{
                    content_id: cleanData.consecutivo,
                    content_name: cleanData.procedimiento,
                    content_type: 'product',
                    quantity: 1,
                    price: 0
                }],
                value: 0,
                currency: 'COP'
            });
        }

        // --- LÓGICA DE ENVÍO A WHATSAPP ---
        const btnWA = document.getElementById('btnSendWhatsApp');
        // Recomendar productos por WhatsApp es mensaje comercial: solo si la clienta marcó "novedades" y no es menor.
        const quiereNovedades = !!cleanData.autoriza_marketing && !isMinor;
        if (btnWA) btnWA.style.display = quiereNovedades ? 'flex' : 'none';
        const tituloOk = document.querySelector('#successModal h2');
        if (tituloOk) tituloOk.textContent = '¡FOLIO #' + cleanData.consecutivo + ' GUARDADO!';
        if (btnWA && quiereNovedades) {
            btnWA.onclick = () => {
                const nombre = cleanData.nombre_completo.split(' ')[0];
                const folio = cleanData.consecutivo;
                const tel = telefonoParaWhatsApp(cleanData.telefono, cleanData.sede);
                
                let reco = "";
                if (cleanData.porosidad === 'Alta') reco += "• Mascarilla Oro Líquido o R.C.P Profesional\n";
                if (cleanData.elasticidad === 'Baja') reco += "• Reposición de Aminoácidos y Ampolla S.O.S\n";
                if (cleanData.piel_cabelluda === 'Seca' || cleanData.piel_cabelluda === 'Grasa') reco += "• Shampoo Extractos Naturales (12 Extractos)\n";
                
                if (!reco) reco = "• Línea de Argán (Shampoo + Acondicionador)\n• Termoprotector con Perfume Capilar\n";
                reco += "• Aceite Reparador de Argán (para sellar puntas)";

                const message = `Hola *${nombre}*, ¡gracias por elegir Julie Alisados! ✨%0A%0ASegún tu diagnóstico capilar de hoy (Folio *#${folio}*), te recomendamos los siguientes productos originales para mantener tu liso impecable y sano:%0A%0A${reco.replace(/\n/g, '%0A')}%0A%0APuedes pedirlos con *envío nacional* aquí: https://wa.me/573043588180%0A%0A¡Fue un gusto atenderte! 💖`;
                
                window.open(`https://wa.me/${tel}?text=${message}`, '_blank');
            };
        }

        document.getElementById('successModal').classList.remove('hidden');
        window.lucide?.createIcons();
    } catch (e) {
        alert('❌ ERROR AL GUARDAR: ' + e.message);
        console.error('Save error:', e);
    } finally {
        window.__guardando = false;
        saveBtn.innerText = 'Guardar';
        saveBtn.disabled = false;
    }
});

// ======================== INIT ========================
window.addEventListener('load', () => {
    window.lucide?.createIcons();
    loadInitialData();
    initRealtimeValidation(steps);
    initJuliePixel(); // Activar rastreo de ventas
    initOtp();        // Confirmacion del consentimiento por codigo
    if (!OTP_OBLIGATORIO) document.querySelector('.otp-box')?.classList.add('hidden'); // beta simple: sin codigo
    // Botones de sede generados desde la configuracion (agregar una sede = una linea en js/config.js)
    const cont = document.getElementById('sedeButtons');
    if (cont) {
        cont.innerHTML = '';
        SEDES.forEach((s) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'btn-option'; b.dataset.sede = s.nombre; b.textContent = s.nombre.toUpperCase();
            b.addEventListener('click', () => setSede(s.nombre));
            cont.appendChild(b);
        });
        if (SEDES.length === 1) setSede(SEDES[0].nombre);
        aplicarSedeFija();
        const ssel = document.getElementById('stylistSedeInput'); if (ssel) SEDES.forEach((s) => { const op = document.createElement('option'); op.value = s.nombre; op.textContent = s.nombre; ssel.appendChild(op); });
    }

    // Ocultar pantalla de carga (Splash Screen)
    setTimeout(() => {
        const splash = document.getElementById('splashScreen');
        if (splash) splash.classList.add('splash-hidden');
    }, 2500);

    // Monitor menor de edad
    const edadInput = document.getElementById('edadInput');
    const docType = document.getElementById('docType');
    if (edadInput) edadInput.addEventListener('input', monitorMinorSettings);
    if (docType) docType.addEventListener('change', monitorMinorSettings);
});

// ======================== REINICIO LIMPIO DE FICHA (MODO TABLET) ========================
window.resetFormCompletely = function () {
    const successModal = document.getElementById('successModal');
    if (successModal) successModal.classList.add('hidden');
    
    limpiarFormulario();
    currentStep = 1;
    updateStep('init');
    switchTab('new'); // switchTab('new') vuelve a limpiar y carga estilistas
};
